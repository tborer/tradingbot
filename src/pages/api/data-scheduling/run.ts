import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { fetchAndStoreHourlyCryptoData, cleanupOldData } from '@/lib/dataSchedulingService';

// Set a timeout for API requests to prevent function timeout errors
const API_TIMEOUT = 10000; // 10 seconds

// Helper function to fetch with timeout
const fetchWithTimeout = async (url: string, options: RequestInit, timeout: number) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the user from the session
  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Determine which operation to run
    const { operation } = req.body;

    // Set a timeout to ensure we respond before the serverless function times out
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out')), 12000)
    );

    if (operation === 'fetch') {
      // Run the data collection process with a timeout
      try {
        const resultPromise = fetchAndStoreHourlyCryptoData(user.id);
        const result = await Promise.race([resultPromise, timeoutPromise]);
        return res.status(result.success ? 200 : 500).json(result);
      } catch (error) {
        if (error.message === 'Operation timed out') {
          // If the operation timed out, return a 202 Accepted status
          // This indicates the request was valid but processing is still ongoing
          return res.status(202).json({
            success: true,
            message: 'Data fetch operation started but is taking longer than expected. Check back later for results.',
            inProgress: true
          });
        }
        throw error;
      }
    } else if (operation === 'cleanup') {
      // Run the data cleanup process
      const result = await cleanupOldData(user.id);
      return res.status(result.success ? 200 : 500).json(result);
    } else if (operation === 'both') {
      // Run both processes with a timeout for the fetch operation
      try {
        const fetchPromise = fetchAndStoreHourlyCryptoData(user.id);
        const fetchResult = await Promise.race([fetchPromise, timeoutPromise]);
        const cleanupResult = await cleanupOldData(user.id);
        
        return res.status(fetchResult.success && cleanupResult.success ? 200 : 500).json({
          fetch: fetchResult,
          cleanup: cleanupResult,
          success: fetchResult.success && cleanupResult.success,
        });
      } catch (error) {
        if (error.message === 'Operation timed out') {
          // If the fetch operation timed out, still run cleanup and return partial results
          const cleanupResult = await cleanupOldData(user.id);
          return res.status(202).json({
            fetch: {
              success: true,
              message: 'Data fetch operation started but is taking longer than expected. Check back later for results.',
              inProgress: true
            },
            cleanup: cleanupResult,
            success: cleanupResult.success,
            partialResults: true
          });
        }
        throw error;
      }
    } else {
      return res.status(400).json({ error: 'Invalid operation. Expected "fetch", "cleanup", or "both".' });
    }
  } catch (error) {
    console.error('Error running data scheduling operation:', error);
    return res.status(500).json({ 
      error: 'Failed to run data scheduling operation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}