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
    // GET - Fetch all transactions for the user
    if (req.method === 'GET') {
      const transactions = await prisma.transaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          stock: {
            select: {
              ticker: true
            }
          }
        }
      });
      
      // Format the transactions for the frontend
      const formattedTransactions = transactions.map(transaction => ({
        id: transaction.id,
        stockId: transaction.stockId,
        ticker: transaction.stock.ticker,
        action: transaction.action,
        shares: transaction.shares,
        price: transaction.price,
        totalAmount: transaction.totalAmount,
        createdAt: transaction.createdAt.toISOString()
      }));
      
      return res.status(200).json(formattedTransactions);
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}