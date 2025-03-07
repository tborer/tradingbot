import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Initialize Supabase client
  const { supabase, user } = await createClient(req, res);
  
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { cryptoId, action, shares } = req.body;
    
    if (!cryptoId || !action || !shares) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (action !== 'buy' && action !== 'sell') {
      return res.status(400).json({ error: 'Invalid action. Must be "buy" or "sell"' });
    }
    
    if (isNaN(Number(shares)) || Number(shares) <= 0) {
      return res.status(400).json({ error: 'Shares must be a positive number' });
    }
    
    // Get the crypto
    const crypto = await prisma.crypto.findFirst({
      where: {
        id: cryptoId,
        userId: user.id,
      },
    });
    
    if (!crypto) {
      return res.status(404).json({ error: 'Crypto not found' });
    }
    
    // For sell actions, check if user has enough shares
    if (action === 'sell' && crypto.shares < Number(shares)) {
      return res.status(400).json({ error: 'Not enough shares to sell' });
    }
    
    // In a real app, we would get the current price from an API
    // For now, we'll use the purchase price as a placeholder
    const currentPrice = crypto.purchasePrice;
    const totalAmount = currentPrice * Number(shares);
    
    // Create the transaction
    const transaction = await prisma.cryptoTransaction.create({
      data: {
        cryptoId: crypto.id,
        action,
        shares: Number(shares),
        price: currentPrice,
        totalAmount,
        userId: user.id,
      },
    });
    
    // Update the crypto shares
    const newShares = action === 'buy' 
      ? crypto.shares + Number(shares) 
      : crypto.shares - Number(shares);
    
    await prisma.crypto.update({
      where: { id: crypto.id },
      data: { shares: newShares },
    });
    
    return res.status(200).json({
      transaction,
      newShares,
      message: `Successfully ${action === 'buy' ? 'bought' : 'sold'} ${shares} shares of ${crypto.symbol}`,
    });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}