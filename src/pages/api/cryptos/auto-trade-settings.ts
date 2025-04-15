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
      console.log('Unauthorized access attempt to auto-trade-settings');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Handle GET requests to fetch settings for a specific crypto
    if (req.method === 'GET') {
      const { cryptoId } = req.query;
      
      if (!cryptoId) {
        console.log('Missing cryptoId parameter in GET request');
        return res.status(400).json({ error: 'Missing cryptoId parameter' });
      }
      
      console.log(`Fetching auto-trade settings for crypto ID: ${cryptoId}`);
      
      // Verify the crypto belongs to the user
      const crypto = await prisma.crypto.findFirst({
        where: {
          id: cryptoId as string,
          userId: user.id,
        },
        include: {
          autoTradeSettings: true
        }
      });
      
      if (!crypto) {
        console.log(`Crypto not found or doesn't belong to user: ${cryptoId}`);
        return res.status(404).json({ error: 'Crypto not found' });
      }
      
      console.log(`Successfully retrieved settings for crypto ${crypto.symbol}`);
      return res.status(200).json({
        success: true,
        autoTradeSettings: crypto.autoTradeSettings || null
      });
    }
    
    // Handle POST requests to update settings
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { cryptoId, settings } = req.body;
    
    if (!cryptoId || !settings) {
      console.log('Missing required fields in POST request');
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    console.log(`Updating auto-trade settings for crypto ID: ${cryptoId}`);
    
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
      console.log(`Crypto not found or doesn't belong to user: ${cryptoId}`);
      return res.status(404).json({ error: 'Crypto not found' });
    }
    
    // Validate settings
    if (typeof settings.buyThresholdPercent !== 'number' || 
        typeof settings.sellThresholdPercent !== 'number') {
      console.log('Invalid threshold values provided');
      return res.status(400).json({ error: 'Invalid threshold values' });
    }
    
    if (settings.nextAction !== 'buy' && settings.nextAction !== 'sell') {
      console.log(`Invalid next action value: ${settings.nextAction}`);
      return res.status(400).json({ error: 'Next action must be "buy" or "sell"' });
    }
    
    // Create or update auto trade settings
    let autoTradeSettings;
    
    try {
      if (crypto.autoTradeSettings) {
        // Update existing settings
        console.log(`Updating existing settings for ${crypto.symbol}`);
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
            updatedAt: new Date(),
          }
        });
      } else {
        // Create new settings
        console.log(`Creating new settings for ${crypto.symbol}`);
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
      const autoBuy = settings.nextAction === 'buy' || settings.oneTimeBuy;
      const autoSell = settings.nextAction === 'sell' || settings.oneTimeSell;
      
      console.log(`Updating auto trade flags for ${crypto.symbol}: autoBuy=${autoBuy}, autoSell=${autoSell}`);
      console.log(`Settings that determined these flags: nextAction=${settings.nextAction}, oneTimeBuy=${settings.oneTimeBuy}, oneTimeSell=${settings.oneTimeSell}`);
      
      await prisma.crypto.update({
        where: { id: crypto.id },
        data: {
          autoBuy,
          autoSell,
          updatedAt: new Date(),
        }
      });
      
      // Log the updated crypto for verification
      const updatedCrypto = await prisma.crypto.findUnique({
        where: { id: crypto.id },
        include: { autoTradeSettings: true }
      });
      
      console.log(`Updated crypto ${updatedCrypto.symbol}: autoBuy=${updatedCrypto.autoBuy}, autoSell=${updatedCrypto.autoSell}`);
      if (updatedCrypto.autoTradeSettings) {
        console.log(`Updated auto trade settings: nextAction=${updatedCrypto.autoTradeSettings.nextAction}, buyThreshold=${updatedCrypto.autoTradeSettings.buyThresholdPercent}%, sellThreshold=${updatedCrypto.autoTradeSettings.sellThresholdPercent}%`);
      }
      
      console.log(`Successfully saved auto-trade settings for ${crypto.symbol}`);
      return res.status(200).json({
        success: true,
        autoTradeSettings,
        message: 'Auto trade settings saved successfully'
      });
    } catch (dbError) {
      console.error('Database error when saving settings:', dbError);
      return res.status(500).json({ 
        error: 'Failed to save auto trade settings', 
        details: dbError.message 
      });
    }
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}