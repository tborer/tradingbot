import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { checkCryptoForAutoTrade } from '@/lib/autoTradeService';
import { logAutoTradeEvent, AutoTradeLogType } from '@/lib/autoTradeLogger';

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
    
    const { cryptoId, price } = req.body;
    
    // Log the API request
    await logAutoTradeEvent(
      user.id,
      AutoTradeLogType.INFO,
      `Auto trade API called for crypto ID ${cryptoId} at price $${price}`,
      { cryptoId, price, requestMethod: req.method }
    );
    
    if (!cryptoId || typeof price !== 'number') {
      await logAutoTradeEvent(
        user.id,
        AutoTradeLogType.ERROR,
        `Invalid auto trade request: Missing required fields or invalid price`,
        { cryptoId, price, requestBody: req.body }
      );
      return res.status(400).json({ error: 'Missing required fields or invalid price' });
    }
    
    // Get user settings
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id }
    });
    
    if (!settings) {
      return res.status(404).json({ error: 'User settings not found' });
    }
    
    // Check if auto trading is enabled
    if (!settings.enableAutoCryptoTrading) {
      console.log(`Auto trading is disabled in settings for user ${user.id}`);
      return res.status(400).json({ error: 'Auto trading is disabled in settings' });
    }
    
    console.log(`Auto trading is enabled for user ${user.id}, checking crypto ${cryptoId}`);
    
    // Check if the crypto belongs to the user
    const crypto = await prisma.crypto.findFirst({
      where: {
        id: cryptoId,
        userId: user.id
      },
      include: {
        autoTradeSettings: true
      }
    });
    
    if (!crypto) {
      console.log(`Crypto ${cryptoId} not found for user ${user.id}`);
      return res.status(404).json({ error: 'Crypto not found' });
    }
    
    console.log(`Found crypto ${crypto.symbol} (ID: ${cryptoId}) for user ${user.id}`);
    console.log(`Auto trade settings: autoBuy=${crypto.autoBuy}, autoSell=${crypto.autoSell}`);
    
    if (crypto.autoTradeSettings) {
      console.log(`Auto trade configuration: nextAction=${crypto.autoTradeSettings.nextAction}, buyThreshold=${crypto.autoTradeSettings.buyThresholdPercent}%, sellThreshold=${crypto.autoTradeSettings.sellThresholdPercent}%`);
    }
    
    // Check if auto trading is enabled for this crypto
    if (!crypto.autoBuy && !crypto.autoSell) {
      console.log(`Auto trading is not enabled for ${crypto.symbol}`);
      return res.status(400).json({ error: 'Auto trading is not enabled for this crypto' });
    }
    
    console.log(`Auto trading is enabled for ${crypto.symbol}, checking if we should trade at price $${price}`);
    console.log(`Current purchase price: $${crypto.purchasePrice}`);
    
    // Calculate percentage change
    const percentChange = ((price - crypto.purchasePrice) / crypto.purchasePrice) * 100;
    console.log(`Current percentage change: ${percentChange.toFixed(2)}%`);
    
    
    // Check if we should auto trade based on current price
    const result = await checkCryptoForAutoTrade(cryptoId, price, user.id);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}