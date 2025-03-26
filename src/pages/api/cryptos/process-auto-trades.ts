import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { processAutoCryptoTrades } from '@/lib/autoTradeService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { prices } = req.body;
    
    if (!prices || !Array.isArray(prices)) {
      return res.status(400).json({ error: 'Missing or invalid prices array' });
    }
    
    // Process auto trades using the server-side function
    const results = await processAutoCryptoTrades(prices, user.id);
    
    return res.status(200).json({ 
      success: true,
      results
    });
  } catch (error) {
    console.error('API error in process-auto-trades:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}