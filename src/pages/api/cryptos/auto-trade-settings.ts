import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { cryptoId, settings } = req.body;
    
    if (!cryptoId || !settings) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Verify the crypto belongs to the user
    const crypto = await prisma.crypto.findFirst({
      where: {
        id: cryptoId,
        userId: user.id,
      },
      include: {
        autoTradeSettings: true
      }
    });
    
    if (!crypto) {
      return res.status(404).json({ error: 'Crypto not found' });
    }
    
    // Validate settings
    if (typeof settings.buyThresholdPercent !== 'number' || 
        typeof settings.sellThresholdPercent !== 'number') {
      return res.status(400).json({ error: 'Invalid threshold values' });
    }
    
    if (settings.nextAction !== 'buy' && settings.nextAction !== 'sell') {
      return res.status(400).json({ error: 'Next action must be "buy" or "sell"' });
    }
    
    // Create or update auto trade settings
    let autoTradeSettings;
    
    if (crypto.autoTradeSettings) {
      // Update existing settings
      autoTradeSettings = await prisma.cryptoAutoTradeSettings.update({
        where: { id: crypto.autoTradeSettings.id },
        data: {
          buyThresholdPercent: settings.buyThresholdPercent,
          sellThresholdPercent: settings.sellThresholdPercent,
          enableContinuousTrading: settings.enableContinuousTrading,
          oneTimeBuy: settings.oneTimeBuy,
          oneTimeSell: settings.oneTimeSell,
          nextAction: settings.nextAction,
          tradeByShares: settings.tradeByShares,
          tradeByValue: settings.tradeByValue,
          sharesAmount: settings.sharesAmount || 0,
          totalValue: settings.totalValue || 0,
        }
      });
    } else {
      // Create new settings
      autoTradeSettings = await prisma.cryptoAutoTradeSettings.create({
        data: {
          cryptoId: crypto.id,
          buyThresholdPercent: settings.buyThresholdPercent,
          sellThresholdPercent: settings.sellThresholdPercent,
          enableContinuousTrading: settings.enableContinuousTrading,
          oneTimeBuy: settings.oneTimeBuy,
          oneTimeSell: settings.oneTimeSell,
          nextAction: settings.nextAction,
          tradeByShares: settings.tradeByShares,
          tradeByValue: settings.tradeByValue,
          sharesAmount: settings.sharesAmount || 0,
          totalValue: settings.totalValue || 0,
        }
      });
    }
    
    // Update the crypto's auto buy/sell flags based on settings
    await prisma.crypto.update({
      where: { id: crypto.id },
      data: {
        autoBuy: settings.nextAction === 'buy' || settings.oneTimeBuy,
        autoSell: settings.nextAction === 'sell' || settings.oneTimeSell,
      }
    });
    
    return res.status(200).json({
      success: true,
      autoTradeSettings,
      message: 'Auto trade settings saved successfully'
    });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}