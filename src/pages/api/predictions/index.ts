import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user from session
    const supabase = createClient(req, res);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get query parameters
    const { symbol, timeframe, type } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Build query based on parameters
    const query: any = {
      where: {
        symbol: symbol as string
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 10
    };

    // Add timeframe filter if provided
    if (timeframe) {
      query.where.timeframe = timeframe as string;
    }

    // Get predictions based on type
    let predictions;
    if (type === 'direction' || !type) {
      predictions = await prisma.cryptoPriceDirectionPrediction.findMany(query);
    } else if (type === 'volatility') {
      predictions = await prisma.cryptoVolatilityPrediction.findMany(query);
    } else if (type === 'keyLevels') {
      predictions = await prisma.cryptoKeyLevelPrediction.findMany(query);
    } else {
      return res.status(400).json({ error: 'Invalid prediction type' });
    }

    return res.status(200).json({
      success: true,
      data: predictions
    });
  } catch (error) {
    console.error('Error fetching predictions:', error);
    return res.status(500).json({
      error: 'Failed to fetch predictions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}