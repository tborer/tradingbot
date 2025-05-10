import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get the user from the session
  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Handle GET request to fetch scheduling data
  if (req.method === 'GET') {
    try {
      const dataScheduling = await prisma.dataScheduling.findUnique({
        where: {
          userId: user.id,
        },
      });

      return res.status(200).json(dataScheduling || {});
    } catch (error) {
      console.error('Error fetching data scheduling settings:', error);
      return res.status(500).json({ error: 'Failed to fetch data scheduling settings' });
    }
  }

  // Handle POST request to save scheduling data
  if (req.method === 'POST') {
    try {
      const { apiUrl, apiToken, dailyRunTime, cleanupEnabled, cleanupDays } = req.body;

      // Validate required fields
      if (!apiUrl || !apiToken || !dailyRunTime) {
        return res.status(400).json({ error: 'API URL, API Token, and Daily Run Time are required' });
      }

      // Validate cleanupDays is a positive number if cleanup is enabled
      if (cleanupEnabled && (!cleanupDays || cleanupDays <= 0)) {
        return res.status(400).json({ error: 'Cleanup days must be a positive number' });
      }

      // Upsert the data scheduling settings
      const dataScheduling = await prisma.dataScheduling.upsert({
        where: {
          userId: user.id,
        },
        update: {
          apiUrl,
          apiToken,
          dailyRunTime,
          cleanupEnabled,
          cleanupDays,
          updatedAt: new Date(),
        },
        create: {
          userId: user.id,
          apiUrl,
          apiToken,
          dailyRunTime,
          cleanupEnabled,
          cleanupDays,
        },
      });

      return res.status(200).json({ success: true, data: dataScheduling });
    } catch (error) {
      console.error('Error saving data scheduling settings:', error);
      return res.status(500).json({ error: 'Failed to save data scheduling settings' });
    }
  }

  // Return 405 Method Not Allowed for other HTTP methods
  return res.status(405).json({ error: 'Method not allowed' });
}