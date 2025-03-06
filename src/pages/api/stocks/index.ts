import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  
  // Check if user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('Authentication error:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // GET - Fetch all stocks for the user
    if (req.method === 'GET') {
      const stocks = await prisma.stock.findMany({
        where: { userId: user.id },
        orderBy: { priority: 'asc' },
      });
      
      return res.status(200).json(stocks);
    }
    
    // POST - Add a new stock
    if (req.method === 'POST') {
      const { ticker, purchasePrice } = req.body;
      
      if (!ticker || !purchasePrice) {
        return res.status(400).json({ error: 'Ticker and purchase price are required' });
      }
      
      // Check if stock already exists for this user
      const existingStock = await prisma.stock.findFirst({
        where: {
          userId: user.id,
          ticker: ticker.toUpperCase(),
        },
      });
      
      if (existingStock) {
        return res.status(400).json({ error: 'Stock already exists in your portfolio' });
      }
      
      // Get the highest priority to add the new stock at the end
      const highestPriorityStock = await prisma.stock.findFirst({
        where: { userId: user.id },
        orderBy: { priority: 'desc' },
      });
      
      const newPriority = highestPriorityStock ? highestPriorityStock.priority + 1 : 0;
      
      const stock = await prisma.stock.create({
        data: {
          ticker: ticker.toUpperCase(),
          purchasePrice: parseFloat(purchasePrice),
          priority: newPriority,
          userId: user.id,
        },
      });
      
      return res.status(201).json(stock);
    }
    
    // PUT - Update stock priorities (for reordering)
    if (req.method === 'PUT') {
      const { stocks } = req.body;
      
      if (!stocks || !Array.isArray(stocks)) {
        return res.status(400).json({ error: 'Invalid stocks data' });
      }
      
      // Update each stock's priority in a transaction
      const updates = await prisma.$transaction(
        stocks.map((stock, index) => 
          prisma.stock.update({
            where: { 
              id: stock.id,
              userId: user.id // Ensure user can only update their own stocks
            },
            data: { priority: index }
          })
        )
      );
      
      return res.status(200).json(updates);
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}