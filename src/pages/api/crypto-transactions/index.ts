import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('Crypto Transactions API called with method:', req.method);
    
    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Crypto Transactions API: Authentication error:', authError);
      return res.status(401).json({ 
        error: 'Unauthorized: You must be logged in to view transactions',
        details: authError?.message || 'User authentication failed'
      });
    }
    
    console.log('Crypto Transactions API: User authenticated:', user.id);
    
    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Get crypto transactions for the user, including failed ones and expired ones
    // We want to show all transactions, especially errors, regardless of expiration
    try {
      console.log('Fetching crypto transactions for user:', user.id);
      
      // Check if we're filtering for auto trade logs only
      const type = req.query.type as string;
      
      let transactions;
      
      if (type === 'auto-trade-log') {
        // Get only auto trade logs (entries with no API request/response but with logInfo)
        transactions = await prisma.$queryRaw`
          SELECT 
            ct.id, 
            ct."cryptoId", 
            c.symbol, 
            ct.action, 
            ct.shares, 
            ct.price, 
            ct."totalAmount", 
            ct."apiRequest",
            ct."apiResponse",
            ct."logInfo",
            ct."createdAt",
            ct."expiresAt"
          FROM "CryptoTransaction" ct
          LEFT JOIN "Crypto" c ON ct."cryptoId" = c.id
          WHERE ct."userId" = ${user.id}::uuid
          AND ct."apiRequest" IS NULL
          AND ct."apiResponse" IS NULL
          AND ct."logInfo" IS NOT NULL
          ORDER BY ct."createdAt" DESC
        `;
      } else {
        // Get actual transactions (entries with API request/response)
        transactions = await prisma.$queryRaw`
          SELECT 
            ct.id, 
            ct."cryptoId", 
            c.symbol, 
            ct.action, 
            ct.shares, 
            ct.price, 
            ct."totalAmount", 
            ct."apiRequest",
            ct."apiResponse",
            ct."logInfo",
            ct."createdAt",
            ct."expiresAt"
          FROM "CryptoTransaction" ct
          LEFT JOIN "Crypto" c ON ct."cryptoId" = c.id
          WHERE ct."userId" = ${user.id}::uuid
          AND (ct."apiRequest" IS NOT NULL OR ct."apiResponse" IS NOT NULL OR ct.action = 'error')
          ORDER BY ct."createdAt" DESC
        `;
      }
      
      console.log(`Found ${transactions.length} transactions for user ${user.id}`);
      return res.status(200).json(transactions);
    } catch (dbError) {
      console.error('Database error fetching transactions:', dbError);
      return res.status(500).json({ 
        error: 'Failed to fetch transactions', 
        details: dbError.message 
      });
    }
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}