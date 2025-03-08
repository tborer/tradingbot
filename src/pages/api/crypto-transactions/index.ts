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
    
    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Get all crypto transactions for the user
    const transactions = await prisma.$queryRaw`
      SELECT 
        ct.id, 
        ct."cryptoId", 
        c.symbol, 
        ct.action, 
        ct.shares, 
        ct.price, 
        ct."totalAmount", 
        ct."createdAt"
      FROM "CryptoTransaction" ct
      JOIN "Crypto" c ON ct."cryptoId" = c.id
      WHERE ct."userId" = ${user.id}
      ORDER BY ct."createdAt" DESC
    `;
    
    return res.status(200).json(transactions);
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}