import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session || !session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = session.user;
    
    // GET - Fetch all cryptos for the user
    if (req.method === 'GET') {
      const cryptos = await prisma.crypto.findMany({
        where: { userId: user.id },
        orderBy: { priority: 'asc' },
      });
      
      return res.status(200).json(cryptos);
    }
    
    // POST - Add a new crypto
    if (req.method === 'POST') {
      const { symbol, purchasePrice, shares } = req.body;
      
      if (!symbol || !purchasePrice) {
        return res.status(400).json({ error: 'Symbol and purchase price are required' });
      }
      
      // Check if crypto already exists for this user
      const existingCrypto = await prisma.crypto.findFirst({
        where: {
          userId: user.id,
          symbol: symbol.toUpperCase(),
        },
      });
      
      if (existingCrypto) {
        return res.status(400).json({ error: 'You already have this crypto in your portfolio' });
      }
      
      // Get the highest priority to add the new crypto at the end
      const highestPriority = await prisma.crypto.findFirst({
        where: { userId: user.id },
        orderBy: { priority: 'desc' },
        select: { priority: true },
      });
      
      const newPriority = highestPriority ? highestPriority.priority + 1 : 0;
      
      // Create the new crypto
      const newCrypto = await prisma.crypto.create({
        data: {
          symbol: symbol.toUpperCase(),
          purchasePrice: parseFloat(purchasePrice),
          shares: parseFloat(shares) || 0,
          priority: newPriority,
          userId: user.id,
        },
      });
      
      return res.status(201).json(newCrypto);
    }
    
    // PUT - Update crypto priorities (reordering)
    if (req.method === 'PUT') {
      const { cryptos } = req.body;
      
      if (!cryptos || !Array.isArray(cryptos)) {
        return res.status(400).json({ error: 'Invalid request body' });
      }
      
      // Update each crypto's priority
      const updatePromises = cryptos.map((crypto, index) => 
        prisma.crypto.update({
          where: { id: crypto.id },
          data: { priority: index },
        })
      );
      
      await Promise.all(updatePromises);
      
      return res.status(200).json({ message: 'Crypto order updated successfully' });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error });
  }
}