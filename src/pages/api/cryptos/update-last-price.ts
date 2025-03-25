import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

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
    
    const { symbol, lastPrice } = req.body;
    
    if (!symbol || lastPrice === undefined) {
      return res.status(400).json({ error: 'Missing required fields: symbol, lastPrice' });
    }
    
    // Validate lastPrice is a number
    if (isNaN(Number(lastPrice))) {
      return res.status(400).json({ error: 'lastPrice must be a valid number' });
    }
    
    // Find the crypto by symbol for this user
    const crypto = await prisma.crypto.findFirst({
      where: {
        symbol: symbol,
        userId: user.id,
      },
    });
    
    if (!crypto) {
      // If the crypto doesn't exist for this user, we'll just ignore the update
      // This can happen if the WebSocket is receiving prices for symbols the user doesn't own
      return res.status(200).json({ message: `No crypto found with symbol ${symbol} for this user` });
    }
    
    // Update the lastPrice for the crypto
    await prisma.crypto.update({
      where: { id: crypto.id },
      data: { lastPrice: Number(lastPrice) },
    });
    
    console.log(`Updated lastPrice for ${symbol} to ${lastPrice}`);
    
    return res.status(200).json({ 
      message: `Successfully updated lastPrice for ${symbol}`,
      symbol,
      lastPrice: Number(lastPrice)
    });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}