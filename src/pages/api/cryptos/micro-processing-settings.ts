import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { createClient } from '@/util/supabase/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get the user from Supabase auth
    const supabase = createClient({ req, res });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
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
        
        return res.status(200).json({ microProcessingSettings });
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
      
      if (!cryptoId || !settings) {
        return res.status(400).json({ error: 'Missing cryptoId or settings in request body' });
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
        
        // Validate settings before saving
        const validatedSettings = {
          enabled: Boolean(settings.enabled),
          sellPercentage: Number(settings.sellPercentage) || 0.5,
          tradeByShares: Number(settings.tradeByShares) || 0,
          tradeByValue: Boolean(settings.tradeByValue),
          totalValue: Number(settings.totalValue) || 0,
          websocketProvider: ['kraken', 'coinbase'].includes(settings.websocketProvider) 
            ? settings.websocketProvider 
            : 'kraken',
          tradingPlatform: ['kraken', 'coinbase'].includes(settings.tradingPlatform) 
            ? settings.tradingPlatform 
            : 'kraken',
          processingStatus: settings.processingStatus || 'idle'
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