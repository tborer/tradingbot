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

  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid stock ID' });
  }

  try {
    // Check if the stock belongs to the user
    const stock = await prisma.stock.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });
    
    if (!stock) {
      return res.status(404).json({ error: 'Stock not found' });
    }
    
    // DELETE - Remove a stock
    if (req.method === 'DELETE') {
      await prisma.stock.delete({
        where: { id },
      });
      
      return res.status(200).json({ message: 'Stock deleted successfully' });
    }
    
    // PUT - Update a stock
    if (req.method === 'PUT') {
      const { ticker, purchasePrice, autoSell, autoBuy } = req.body;
      
      if (!ticker || !purchasePrice) {
        return res.status(400).json({ error: 'Ticker and purchase price are required' });
      }
      
      const updatedStock = await prisma.stock.update({
        where: { id },
        data: {
          ticker: ticker.toUpperCase(),
          purchasePrice: parseFloat(purchasePrice),
          ...(autoSell !== undefined && { autoSell }),
          ...(autoBuy !== undefined && { autoBuy }),
        },
      });
      
      return res.status(200).json(updatedStock);
    }
    
    // GET - Get a specific stock
    if (req.method === 'GET') {
      return res.status(200).json(stock);
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}