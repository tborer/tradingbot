import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { fetchAndAnalyzeTrends } from '@/lib/coinDesk';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the Supabase client
    const supabase = createClient(req);

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get the symbol from the request body
    const { symbol } = req.body;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Get the CoinDesk API key from environment variables
    const apiKey = process.env.NEXT_PUBLIC_COINDESK_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'CoinDesk API key not configured' });
    }

    // Fetch and analyze trend data
    const analysis = await fetchAndAnalyzeTrends(symbol, apiKey, 30);

    if (!analysis) {
      return res.status(500).json({ error: 'Failed to analyze trends' });
    }

    // Return the analysis results
    return res.status(200).json({ analysis });
  } catch (error) {
    console.error('Error analyzing trends:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}