import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { fetchAndStoreHourlyCryptoData, cleanupOldData } from '@/lib/dataSchedulingService';

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

    if (operation === 'fetch') {
      // Run the data collection process
      const result = await fetchAndStoreHourlyCryptoData(user.id);
      return res.status(result.success ? 200 : 500).json(result);
    } else if (operation === 'cleanup') {
      // Run the data cleanup process
      const result = await cleanupOldData(user.id);
      return res.status(result.success ? 200 : 500).json(result);
    } else if (operation === 'both') {
      // Run both processes
      const fetchResult = await fetchAndStoreHourlyCryptoData(user.id);
      const cleanupResult = await cleanupOldData(user.id);
      
      return res.status(fetchResult.success && cleanupResult.success ? 200 : 500).json({
        fetch: fetchResult,
        cleanup: cleanupResult,
        success: fetchResult.success && cleanupResult.success,
      });
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