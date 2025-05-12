import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

// Function to retry database operations with exponential backoff
async function retryOperation<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.log(`Database operation attempt ${attempt} failed:`, error);
      lastError = error;
      
      // Don't wait after the last attempt
      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1000ms, 2000ms, etc.
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get the user from the session
    const supabase = createClient(req, res);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Handle GET request to fetch scheduling data
    if (req.method === 'GET') {
      try {
        const dataScheduling = await retryOperation(() => 
          prisma.dataScheduling.findUnique({
            where: {
              userId: user.id,
            },
          })
        );

        return res.status(200).json(dataScheduling || {});
      } catch (error) {
        console.error('Error fetching data scheduling settings:', error);
        return res.status(500).json({ error: 'Failed to fetch data scheduling settings' });
      }
    }

    // Handle POST request to save scheduling data
    if (req.method === 'POST') {
      try {
        const { 
          apiUrl, 
          apiToken, 
          dailyRunTime, 
          timeZone, 
          limit, 
          runTechnicalAnalysis, 
          cleanupEnabled, 
          cleanupDays 
        } = req.body;

        // Validate required fields
        if (!apiUrl || !apiToken || !dailyRunTime) {
          return res.status(400).json({ error: 'API URL, API Token, and Daily Run Time are required' });
        }

        // Validate limit is a positive number
        if (!limit || limit <= 0) {
          return res.status(400).json({ error: 'Limit must be a positive number' });
        }

        // Validate cleanupDays is a positive number if cleanup is enabled
        if (cleanupEnabled && (!cleanupDays || cleanupDays <= 0)) {
          return res.status(400).json({ error: 'Cleanup days must be a positive number' });
        }

        // Upsert the data scheduling settings with retry logic
        const dataScheduling = await retryOperation(() => 
          prisma.dataScheduling.upsert({
            where: {
              userId: user.id,
            },
            update: {
              apiUrl,
              apiToken,
              dailyRunTime,
              timeZone: timeZone || 'America/Chicago',
              limit,
              runTechnicalAnalysis: runTechnicalAnalysis || false,
              cleanupEnabled,
              cleanupDays,
              updatedAt: new Date(),
            },
            create: {
              userId: user.id,
              apiUrl,
              apiToken,
              dailyRunTime,
              timeZone: timeZone || 'America/Chicago',
              limit,
              runTechnicalAnalysis: runTechnicalAnalysis || false,
              cleanupEnabled,
              cleanupDays,
            },
          })
        );

        return res.status(200).json({ success: true, data: dataScheduling });
      } catch (error) {
        console.error('Error saving data scheduling settings:', error);
        return res.status(500).json({ error: 'Failed to save data scheduling settings' });
      }
    }

    // Return 405 Method Not Allowed for other HTTP methods
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Unexpected error in data scheduling API:', error);
    return res.status(500).json({ error: 'An unexpected error occurred' });
  }
}