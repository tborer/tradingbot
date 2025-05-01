import { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';

// API handler with simplified authentication
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  console.log(`[MICRO-SETTINGS] API handler started: ${req.method} request received`);
  
  try {
    const userId = req.user.id;
    console.log(`[MICRO-SETTINGS] User authenticated: ${userId}`);
    
    // Handle GET request to fetch settings
    if (req.method === 'GET') {
      console.log('[MICRO-SETTINGS] Processing GET request');
      const { cryptoId, includeEnabledCryptos, checkAuth } = req.query;
      
      // Special case for authentication check only
      if (checkAuth === 'true') {
        console.log('[MICRO-SETTINGS] Authentication check request received');
        return res.status(200).json({ 
          authenticated: true, 
          userId: userId,
          message: 'Authentication successful'
        });
      }
      
      // New consolidated endpoint to get all cryptos with their micro processing settings
      if (includeEnabledCryptos === 'true') {
        console.log('[MICRO-SETTINGS] Fetching all cryptos with micro processing settings');
        
        try {
          // Get all cryptos for this user with their micro processing settings in a single query
          const cryptosWithSettings = await prisma.crypto.findMany({
            where: {
              userId: userId
            },
            include: {
              microProcessingSettings: true
            }
          });
          
          console.log(`[MICRO-SETTINGS] Found ${cryptosWithSettings?.length || 0} cryptos for user`);
          
          // Map the results to include currentPrice from lastPrice
          const formattedCryptos = cryptosWithSettings.map(crypto => {
            // Determine the current price with fallbacks
            let currentPrice = null;
            if (crypto.lastPrice !== null && crypto.lastPrice !== undefined) {
              currentPrice = crypto.lastPrice;
            } else if (crypto.currentPrice !== null && crypto.currentPrice !== undefined) {
              currentPrice = crypto.currentPrice;
            }
            
            // Create default settings if none exist
            const defaultSettings = {
              enabled: false,
              sellPercentage: 0.5,
              tradeByShares: 0,
              tradeByValue: false,
              totalValue: 0,
              websocketProvider: 'kraken',
              tradingPlatform: 'kraken',
              purchasePrice: null,
              processingStatus: 'idle',
              testMode: false
            };
            
            return {
              id: crypto.id,
              symbol: crypto.symbol,
              shares: typeof crypto.shares === 'number' ? crypto.shares : 0,
              purchasePrice: typeof crypto.purchasePrice === 'number' ? crypto.purchasePrice : 0,
              userId: crypto.userId,
              currentPrice: currentPrice,
              createdAt: crypto.createdAt,
              updatedAt: crypto.updatedAt,
              // Add the microProcessingSettings with fallback to default
              microProcessingSettings: crypto.microProcessingSettings || defaultSettings
            };
          });
          
          return res.status(200).json(formattedCryptos);
        } catch (error) {
          console.error('[MICRO-SETTINGS] Error fetching cryptos with settings:', error);
          return res.status(500).json({ 
            error: 'Failed to fetch cryptos with micro processing settings', 
            details: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // Original single crypto settings endpoint
      if (!cryptoId || typeof cryptoId !== 'string') {
        console.error('[MICRO-SETTINGS] Missing or invalid cryptoId parameter');
        return res.status(400).json({ 
          error: 'Missing or invalid cryptoId parameter',
          details: `Expected string cryptoId but received: ${typeof cryptoId === 'undefined' ? 'undefined' : typeof cryptoId}`
        });
      }
      
      try {
        // Check if the crypto belongs to the user
        const crypto = await prisma.crypto.findFirst({
          where: {
            id: cryptoId,
            userId: userId
          }
        });
        
        if (!crypto) {
          console.error(`[MICRO-SETTINGS] Crypto not found for id: ${cryptoId} and userId: ${userId}`);
          return res.status(404).json({ error: 'Crypto not found' });
        }
        
        // Get the micro processing settings
        const microProcessingSettings = await prisma.microProcessingSettings.findUnique({
          where: {
            cryptoId: cryptoId
          }
        });
        
        // Default settings
        const defaultSettings = {
          enabled: false,
          sellPercentage: 0.5,
          tradeByShares: 0,
          tradeByValue: false,
          totalValue: 0,
          websocketProvider: 'binance',
          tradingPlatform: 'binance',
          purchasePrice: null,
          processingStatus: 'idle',
          testMode: false
        };
        
        // Return settings or defaults
        const resultSettings = microProcessingSettings || {
          cryptoId: cryptoId,
          ...defaultSettings,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        return res.status(200).json(resultSettings);
      } catch (error) {
        console.error('[MICRO-SETTINGS] Error fetching micro processing settings:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch micro processing settings', 
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  
    // Handle POST request to save settings
    if (req.method === 'POST') {
      console.log('[MICRO-SETTINGS] Processing POST request');
      
      if (!req.body) {
        return res.status(400).json({ error: 'Missing request body' });
      }
      
      const { cryptoId, settings } = req.body;
      
      if (!cryptoId) {
        return res.status(400).json({ error: 'Missing cryptoId in request body' });
      }
      
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Settings must be a valid object' });
      }
      
      try {
        // Check if the crypto belongs to the user
        const crypto = await prisma.crypto.findFirst({
          where: {
            id: cryptoId,
            userId: userId
          }
        });
        
        if (!crypto) {
          return res.status(404).json({ error: 'Crypto not found' });
        }
        
        // Default settings
        const defaultSettings = {
          enabled: false,
          sellPercentage: 0.5,
          tradeByShares: 0,
          tradeByValue: false,
          totalValue: 0,
          websocketProvider: 'binance',
          tradingPlatform: 'binance',
          purchasePrice: null,
          processingStatus: 'idle',
          testMode: false
        };
        
        // Validate settings
        const validatedSettings = {
          enabled: settings.enabled === true,
          sellPercentage: typeof settings.sellPercentage === 'number' && !isNaN(settings.sellPercentage) 
            ? settings.sellPercentage 
            : defaultSettings.sellPercentage,
          tradeByShares: typeof settings.tradeByShares === 'number' && !isNaN(settings.tradeByShares) 
            ? settings.tradeByShares 
            : defaultSettings.tradeByShares,
          tradeByValue: settings.tradeByValue === true,
          totalValue: typeof settings.totalValue === 'number' && !isNaN(settings.totalValue) 
            ? settings.totalValue 
            : defaultSettings.totalValue,
          websocketProvider: settings.websocketProvider && 
            ['kraken', 'coinbase', 'binance'].includes(settings.websocketProvider) 
            ? settings.websocketProvider 
            : defaultSettings.websocketProvider,
          tradingPlatform: settings.tradingPlatform && 
            ['kraken', 'coinbase', 'binance'].includes(settings.tradingPlatform) 
            ? settings.tradingPlatform 
            : defaultSettings.tradingPlatform,
          purchasePrice: typeof settings.purchasePrice === 'number' && !isNaN(settings.purchasePrice) 
            ? settings.purchasePrice 
            : null,
          processingStatus: settings.processingStatus || defaultSettings.processingStatus,
          testMode: settings.testMode !== undefined ? settings.testMode : false
        };
        
        // Upsert the micro processing settings
        const microProcessingSettings = await prisma.microProcessingSettings.upsert({
          where: {
            cryptoId: cryptoId
          },
          update: {
            ...validatedSettings,
            updatedAt: new Date()
          },
          create: {
            cryptoId: cryptoId,
            ...validatedSettings,
            processingStatus: 'idle'
          }
        });
        
        return res.status(200).json(microProcessingSettings);
      } catch (error) {
        console.error('[MICRO-SETTINGS] Error saving micro processing settings:', error);
        
        // Check if it's a Prisma error
        if (error && typeof error === 'object' && 'code' in error) {
          if ((error as any).code === 'P2003') {
            return res.status(500).json({
              error: 'Database constraint error',
              details: 'The operation failed due to a foreign key constraint.'
            });
          }
          
          if ((error as any).code === 'P2025') {
            return res.status(404).json({
              error: 'Record not found',
              details: 'The requested record could not be found in the database.'
            });
          }
        }
        
        return res.status(500).json({ 
          error: 'Failed to save micro processing settings', 
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Handle unsupported methods
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[MICRO-SETTINGS] Unhandled error:', error);
    return res.status(500).json({ 
      error: 'An unexpected error occurred', 
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

// Export the handler wrapped with the withAuth middleware
export default withAuth(handler);