import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { generateConsolidatedAIDecisionData, generateConsolidatedAIDecisionDataForAllCryptos } from '@/lib/aiDecisionUtils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get the user from the session
  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Handle GET request to fetch AI decision data
  if (req.method === 'GET') {
    try {
      const { symbol } = req.query;
      
      // If symbol is provided, get data for that specific cryptocurrency
      if (symbol) {
        const data = await generateConsolidatedAIDecisionData(user.id, symbol as string);
        return res.status(200).json(data);
      }
      
      // Otherwise, get data for all user's cryptocurrencies
      const data = await generateConsolidatedAIDecisionDataForAllCryptos(user.id);
      return res.status(200).json(data);
    } catch (error) {
      console.error('Error fetching AI decision data:', error);
      return res.status(500).json({ error: 'Failed to fetch AI decision data' });
    }
  }

  // Return 405 Method Not Allowed for other HTTP methods
  return res.status(405).json({ error: 'Method not allowed' });
}