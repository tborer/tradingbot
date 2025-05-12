import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the user from the request
    const supabase = createClient(req);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = user.id;
    const { symbol, timeframe, signalType, status, limit = 20, offset = 0 } = req.query;

    // Build the query
    const where: any = { userId };

    if (symbol) {
      where.symbol = symbol;
    }

    if (timeframe) {
      where.timeframe = timeframe;
    }

    if (signalType) {
      where.signalType = signalType;
    }

    if (status) {
      where.status = status;
    }

    // Get the signals
    const signals = await prisma.tradingSignal.findMany({
      where,
      orderBy: {
        timestamp: 'desc'
      },
      take: Number(limit),
      skip: Number(offset)
    });

    // Get the total count
    const totalCount = await prisma.tradingSignal.count({ where });

    return res.status(200).json({
      signals,
      totalCount,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (error) {
    console.error('Error retrieving trading signals:', error);
    return res.status(500).json({ error: 'Failed to retrieve trading signals', details: error.message });
  }
}