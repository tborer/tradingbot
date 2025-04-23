import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { createClient } from '@/util/supabase/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get the user from Supabase auth
    const supabase = createClient({ req, res });
    const { data } = await supabase.auth.getUser();
    
    if (!data || !data.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = data.user;
    
    // Handle GET request to fetch settings
    if (req.method === 'GET') {
      const { cryptoId } = req.query;
      
      if (!cryptoId || typeof cryptoId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid cryptoId parameter' });
      }
      
      try {
        // Check if the crypto belongs to the user
        const crypto = await prisma.crypto.findFirst({
          where: {
            id: cryptoId,
            userId: user.id
          }
        });
        
        if (!crypto) {
          console.error(`Crypto not found for id: ${cryptoId} and userId: ${user.id}`);
          return res.status(404).json({ error: 'Crypto not found' });
        }
        
        // Get the micro processing settings
        const microProcessingSettings = await prisma.microProcessingSettings.findUnique({
          where: {
            cryptoId: cryptoId
          }
        });
        
        console.log(`Fetched micro processing settings for cryptoId: ${cryptoId}`, 
                    microProcessingSettings ? 'Settings found' : 'No settings found');
        
        // Return settings object if found, or a default settings object if none found
        // This ensures we always return a valid object structure
        const defaultSettings = {
          enabled: false,
          sellPercentage: 0.5,
          tradeByShares: 0,
          tradeByValue: false,
          totalValue: 0,
          websocketProvider: 'kraken',
          tradingPlatform: 'kraken',
          purchasePrice: null,
          processingStatus: 'idle'
        };
        
        // Return the settings directly without nesting them in a microProcessingSettings property
        return res.status(200).json(microProcessingSettings || defaultSettings);
      } catch (error) {
        console.error('Error fetching micro processing settings:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch micro processing settings', 
          details: error.message || 'Unknown database error' 
        });
      }
    }
  
    // Handle POST request to save settings
    if (req.method === 'POST') {
      const { cryptoId, settings } = req.body;
      
      if (!cryptoId) {
        return res.status(400).json({ error: 'Missing cryptoId in request body' });
      }
      
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Missing or invalid settings in request body' });
      }
      
      try {
        // Check if the crypto belongs to the user
        const crypto = await prisma.crypto.findFirst({
          where: {
            id: cryptoId,
            userId: user.id
          }
        });
        
        if (!crypto) {
          return res.status(404).json({ error: 'Crypto not found' });
        }
        
        // Create default settings
        const defaultSettings = {
          enabled: false,
          sellPercentage: 0.5,
          tradeByShares: 0,
          tradeByValue: false,
          totalValue: 0,
          websocketProvider: 'kraken',
          tradingPlatform: 'kraken',
          purchasePrice: null,
          processingStatus: 'idle'
        };
        
        // Validate settings before saving, ensuring all values are of the correct type
        // and falling back to defaults if values are missing or invalid
        const validatedSettings = {
          enabled: settings.enabled !== undefined ? Boolean(settings.enabled) : defaultSettings.enabled,
          sellPercentage: settings.sellPercentage !== undefined ? Number(settings.sellPercentage) || defaultSettings.sellPercentage : defaultSettings.sellPercentage,
          tradeByShares: settings.tradeByShares !== undefined ? Number(settings.tradeByShares) || defaultSettings.tradeByShares : defaultSettings.tradeByShares,
          tradeByValue: settings.tradeByValue !== undefined ? Boolean(settings.tradeByValue) : defaultSettings.tradeByValue,
          totalValue: settings.totalValue !== undefined ? Number(settings.totalValue) || defaultSettings.totalValue : defaultSettings.totalValue,
          websocketProvider: settings.websocketProvider && ['kraken', 'coinbase', 'binance'].includes(settings.websocketProvider) 
            ? settings.websocketProvider 
            : defaultSettings.websocketProvider,
          tradingPlatform: settings.tradingPlatform && ['kraken', 'coinbase', 'binance'].includes(settings.tradingPlatform) 
            ? settings.tradingPlatform 
            : defaultSettings.tradingPlatform,
          purchasePrice: settings.purchasePrice !== undefined && !isNaN(Number(settings.purchasePrice)) ? 
            Number(settings.purchasePrice) : null,
          processingStatus: settings.processingStatus || defaultSettings.processingStatus
        };
        
        // Upsert the micro processing settings
        const microProcessingSettings = await prisma.microProcessingSettings.upsert({
          where: {
            cryptoId: cryptoId
          },
          update: {
            enabled: validatedSettings.enabled,
            sellPercentage: validatedSettings.sellPercentage,
            tradeByShares: validatedSettings.tradeByShares,
            tradeByValue: validatedSettings.tradeByValue,
            totalValue: validatedSettings.totalValue,
            websocketProvider: validatedSettings.websocketProvider,
            tradingPlatform: validatedSettings.tradingPlatform,
            purchasePrice: validatedSettings.purchasePrice,
            processingStatus: validatedSettings.processingStatus,
            updatedAt: new Date()
          },
          create: {
            cryptoId: cryptoId,
            enabled: validatedSettings.enabled,
            sellPercentage: validatedSettings.sellPercentage,
            tradeByShares: validatedSettings.tradeByShares,
            tradeByValue: validatedSettings.tradeByValue,
            totalValue: validatedSettings.totalValue,
            websocketProvider: validatedSettings.websocketProvider,
            tradingPlatform: validatedSettings.tradingPlatform,
            purchasePrice: validatedSettings.purchasePrice,
            processingStatus: 'idle'
          }
        });
        
        return res.status(200).json({ microProcessingSettings });
      } catch (error) {
        console.error('Error saving micro processing settings:', error);
        return res.status(500).json({ 
          error: 'Failed to save micro processing settings',
          details: error.message || 'Unknown database error'
        });
      }
    }
    
    // Handle unsupported methods
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    // Global error handler to ensure we always return JSON
    console.error('Unhandled error in micro-processing-settings API:', error);
    return res.status(500).json({ 
      error: 'An unexpected error occurred', 
      details: error.message || 'Unknown error'
    });
  }
}