import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { generateTradingSignals, generateTradingSignalsForAllCryptos } from '@/lib/tradingSignals/signalGenerator';
import { schedulingLogger } from '@/lib/schedulingLogger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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
    const { symbol, timeframe = '1h', generateForAll = false } = req.body;

    await schedulingLogger.log({
      userId,
      processId: `trading-signals-${new Date().toISOString()}`,
      category: 'trading-signals',
      message: `Starting trading signal generation ${generateForAll ? 'for all cryptos' : `for ${symbol}`}`,
      status: 'STARTED'
    });

    let result;

    if (generateForAll) {
      // Generate signals for all user's cryptocurrencies
      result = await generateTradingSignalsForAllCryptos(userId, timeframe);
    } else {
      // Validate input
      if (!symbol) {
        return res.status(400).json({ error: 'Symbol is required' });
      }

      // Get the current price
      const crypto = await prisma.crypto.findFirst({
        where: {
          userId,
          symbol
        }
      });

      if (!crypto) {
        return res.status(404).json({ error: 'Crypto not found' });
      }

      const currentPrice = crypto.lastPrice || 0;
      
      if (currentPrice === 0) {
        return res.status(400).json({ error: 'Current price not available' });
      }

      // Generate signals
      const signals = await generateTradingSignals(userId, symbol, timeframe, currentPrice);
      result = { symbol, signals };
    }

    await schedulingLogger.log({
      userId,
      processId: `trading-signals-${new Date().toISOString()}`,
      category: 'trading-signals',
      message: `Completed trading signal generation`,
      status: 'COMPLETED',
      details: { result }
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error generating trading signals:', error);
    
    // Log the error
    try {
      const userId = req.body.userId || 'unknown';
      await schedulingLogger.log({
        userId,
        processId: `trading-signals-${new Date().toISOString()}`,
        category: 'trading-signals',
        message: `Error generating trading signals: ${error.message}`,
        status: 'ERROR',
        details: { error: error.message, stack: error.stack }
      });
    } catch (logError) {
      console.error('Error logging trading signal error:', logError);
    }

    return res.status(500).json({ error: 'Failed to generate trading signals', details: error.message });
  }
}