import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { createClient } from '@/util/supabase/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log(`[MICRO-SETTINGS] API handler started: ${req.method} request received`);
  
  try {
    // Get the user from Supabase auth
    console.log('[MICRO-SETTINGS] Authenticating user with Supabase');
    const supabase = createClient({ req, res });
    const { data } = await supabase.auth.getUser();
    
    if (!data || !data.user) {
      console.error('[MICRO-SETTINGS] Authentication failed: No user found');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = data.user;
    console.log(`[MICRO-SETTINGS] User authenticated: ${user.id}`);
    
    // Handle GET request to fetch settings
    if (req.method === 'GET') {
      console.log('[MICRO-SETTINGS] Processing GET request');
      const { cryptoId } = req.query;
      
      console.log(`[MICRO-SETTINGS] GET request for cryptoId: ${cryptoId}`);
      
      if (!cryptoId || typeof cryptoId !== 'string') {
        console.error('[MICRO-SETTINGS] Missing or invalid cryptoId parameter');
        return res.status(400).json({ error: 'Missing or invalid cryptoId parameter' });
      }
      
      try {
        console.log(`[MICRO-SETTINGS] Verifying crypto ownership for cryptoId: ${cryptoId}`);
        // Check if the crypto belongs to the user
        console.log(`[MICRO-SETTINGS] Querying database for crypto with id: ${cryptoId} and userId: ${user.id}`);
        const crypto = await prisma.crypto.findFirst({
          where: {
            id: cryptoId,
            userId: user.id
          }
        });
        
        if (!crypto) {
          console.error(`[MICRO-SETTINGS] Crypto not found for id: ${cryptoId} and userId: ${user.id}`);
          return res.status(404).json({ error: 'Crypto not found' });
        }
        
        console.log(`[MICRO-SETTINGS] Crypto found: ${crypto.symbol} (${crypto.id})`);
        
        // Get the micro processing settings
        console.log(`[MICRO-SETTINGS] Fetching micro processing settings for cryptoId: ${cryptoId}`);
        const microProcessingSettings = await prisma.microProcessingSettings.findUnique({
          where: {
            cryptoId: cryptoId
          }
        });
        
        console.log(`[MICRO-SETTINGS] Database query result for settings:`, 
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
          processingStatus: 'idle',
          testMode: false
        };
        
        // Explicitly check if microProcessingSettings is null
        let resultSettings;
        
        if (!microProcessingSettings) {
          console.log('No settings found, using default values');
          resultSettings = {
            id: undefined,
            cryptoId: cryptoId,
            enabled: defaultSettings.enabled,
            sellPercentage: defaultSettings.sellPercentage,
            tradeByShares: defaultSettings.tradeByShares,
            tradeByValue: defaultSettings.tradeByValue,
            totalValue: defaultSettings.totalValue,
            websocketProvider: defaultSettings.websocketProvider,
            tradingPlatform: defaultSettings.tradingPlatform,
            purchasePrice: null,
            processingStatus: defaultSettings.processingStatus,
            testMode: defaultSettings.testMode,
            lastBuyPrice: null,
            lastBuyShares: null,
            lastBuyTimestamp: null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
        } else {
          // Manually construct the result object with explicit null checks and NaN checks for each property
          resultSettings = {
            id: microProcessingSettings.id || undefined,
            cryptoId: cryptoId,
            enabled: microProcessingSettings.enabled === true,
            sellPercentage: typeof microProcessingSettings.sellPercentage === 'number' && !isNaN(microProcessingSettings.sellPercentage) ? 
              microProcessingSettings.sellPercentage : defaultSettings.sellPercentage,
            tradeByShares: typeof microProcessingSettings.tradeByShares === 'number' && !isNaN(microProcessingSettings.tradeByShares) ? 
              microProcessingSettings.tradeByShares : defaultSettings.tradeByShares,
            tradeByValue: microProcessingSettings.tradeByValue === true,
            totalValue: typeof microProcessingSettings.totalValue === 'number' && !isNaN(microProcessingSettings.totalValue) ? 
              microProcessingSettings.totalValue : defaultSettings.totalValue,
            websocketProvider: microProcessingSettings.websocketProvider || defaultSettings.websocketProvider,
            tradingPlatform: microProcessingSettings.tradingPlatform || defaultSettings.tradingPlatform,
            purchasePrice: typeof microProcessingSettings.purchasePrice === 'number' && !isNaN(microProcessingSettings.purchasePrice) ? 
              microProcessingSettings.purchasePrice : null,
            processingStatus: microProcessingSettings.processingStatus || defaultSettings.processingStatus,
            testMode: microProcessingSettings.testMode === true,
            lastBuyPrice: typeof microProcessingSettings.lastBuyPrice === 'number' && !isNaN(microProcessingSettings.lastBuyPrice) ? 
              microProcessingSettings.lastBuyPrice : null,
            lastBuyShares: typeof microProcessingSettings.lastBuyShares === 'number' && !isNaN(microProcessingSettings.lastBuyShares) ? 
              microProcessingSettings.lastBuyShares : null,
            lastBuyTimestamp: microProcessingSettings.lastBuyTimestamp || null,
            createdAt: microProcessingSettings.createdAt || new Date(),
            updatedAt: microProcessingSettings.updatedAt || new Date()
          };
        }
        
        console.log('Returning settings:', resultSettings);
        
        // Return the settings directly without nesting them in a microProcessingSettings property
        return res.status(200).json(resultSettings);
      } catch (error) {
        console.error('[MICRO-SETTINGS] Error fetching micro processing settings:', error);
        console.error('[MICRO-SETTINGS] Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
        console.error('[MICRO-SETTINGS] GET request parameters:', { cryptoId, userId: user.id });
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
        return res.status(500).json({ 
          error: 'Failed to fetch micro processing settings', 
          details: errorMessage 
        });
      }
    }
  
    // Handle POST request to save settings
    if (req.method === 'POST') {
      console.log('[MICRO-SETTINGS] Processing POST request');
      
      // Safely extract and validate the request body
      if (!req.body) {
        console.error('[MICRO-SETTINGS] POST request missing body');
        return res.status(400).json({ error: 'Missing request body' });
      }
      
      console.log('[MICRO-SETTINGS] POST request body:', JSON.stringify(req.body));
      
      const { cryptoId, settings } = req.body;
      
      if (!cryptoId) {
        console.error('[MICRO-SETTINGS] Missing cryptoId in request body');
        return res.status(400).json({ error: 'Missing cryptoId in request body' });
      }
      
      console.log(`[MICRO-SETTINGS] Processing settings for cryptoId: ${cryptoId}`);
      
      // Ensure settings is a valid object
      if (!settings) {
        console.error(`[MICRO-SETTINGS] Invalid settings for cryptoId ${cryptoId}: settings is ${settings}`);
        return res.status(400).json({ error: 'Missing settings in request body' });
      }
      
      if (typeof settings !== 'object') {
        console.error(`[MICRO-SETTINGS] Invalid settings type for cryptoId ${cryptoId}: ${typeof settings}`);
        return res.status(400).json({ error: 'Settings must be an object' });
      }
      
      try {
        // Check if the crypto belongs to the user
        console.log(`[MICRO-SETTINGS] Verifying crypto ownership for cryptoId: ${cryptoId}`);
        const crypto = await prisma.crypto.findFirst({
          where: {
            id: cryptoId,
            userId: user.id
          }
        });
        
        if (!crypto) {
          console.error(`[MICRO-SETTINGS] Crypto not found for id: ${cryptoId} and userId: ${user.id}`);
          return res.status(404).json({ error: 'Crypto not found' });
        }
        
        console.log(`[MICRO-SETTINGS] Crypto found: ${crypto.symbol} (${crypto.id})`);
        
        // Create default settings
        console.log('[MICRO-SETTINGS] Setting up default values for validation');
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
        
        // Validate settings before saving, ensuring all values are of the correct type
        // and falling back to defaults if values are missing or invalid
        console.log('[MICRO-SETTINGS] Validating settings values');
        
        // Log the incoming settings for debugging
        console.log('[MICRO-SETTINGS] Raw settings received:', settings);
        
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
          processingStatus: settings.processingStatus || defaultSettings.processingStatus,
          testMode: settings.testMode !== undefined ? Boolean(settings.testMode) : defaultSettings.testMode
        };
        
        console.log('[MICRO-SETTINGS] Validated settings:', validatedSettings);
        
        // Check if we're creating new settings or updating existing ones
        console.log(`[MICRO-SETTINGS] Checking if settings already exist for cryptoId: ${cryptoId}`);
        const existingSettings = await prisma.microProcessingSettings.findUnique({
          where: { cryptoId: cryptoId }
        });
        
        const operation = existingSettings ? 'update' : 'create';
        console.log(`[MICRO-SETTINGS] Operation to perform: ${operation}`);
        
        // Upsert the micro processing settings
        console.log(`[MICRO-SETTINGS] Performing upsert operation for cryptoId: ${cryptoId}`);
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
            testMode: validatedSettings.testMode,
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
            testMode: validatedSettings.testMode,
            processingStatus: 'idle'
          }
        });
        
        // Explicitly check if microProcessingSettings is null or undefined
        if (!microProcessingSettings) {
          console.error('[MICRO-SETTINGS] Upsert operation failed: microProcessingSettings is null or undefined');
          return res.status(500).json({ 
            error: 'Failed to save micro processing settings',
            details: 'Database operation returned null or undefined'
          });
        }
        
        console.log(`[MICRO-SETTINGS] Upsert operation successful for ${operation} operation`);
        console.log('[MICRO-SETTINGS] Database returned:', microProcessingSettings);
        
        // Manually construct the result object with explicit null checks for each property
        console.log('[MICRO-SETTINGS] Constructing result object with null/NaN checks');
        const resultSettings = {
          id: microProcessingSettings.id || undefined,
          cryptoId: cryptoId,
          enabled: microProcessingSettings.enabled === true,
          sellPercentage: typeof microProcessingSettings.sellPercentage === 'number' && !isNaN(microProcessingSettings.sellPercentage) ? 
            microProcessingSettings.sellPercentage : defaultSettings.sellPercentage,
          tradeByShares: typeof microProcessingSettings.tradeByShares === 'number' && !isNaN(microProcessingSettings.tradeByShares) ? 
            microProcessingSettings.tradeByShares : defaultSettings.tradeByShares,
          tradeByValue: microProcessingSettings.tradeByValue === true,
          totalValue: typeof microProcessingSettings.totalValue === 'number' && !isNaN(microProcessingSettings.totalValue) ? 
            microProcessingSettings.totalValue : defaultSettings.totalValue,
          websocketProvider: microProcessingSettings.websocketProvider || defaultSettings.websocketProvider,
          tradingPlatform: microProcessingSettings.tradingPlatform || defaultSettings.tradingPlatform,
          purchasePrice: typeof microProcessingSettings.purchasePrice === 'number' && !isNaN(microProcessingSettings.purchasePrice) ? 
            microProcessingSettings.purchasePrice : null,
          processingStatus: microProcessingSettings.processingStatus || defaultSettings.processingStatus,
          testMode: microProcessingSettings.testMode === true,
          lastBuyPrice: typeof microProcessingSettings.lastBuyPrice === 'number' && !isNaN(microProcessingSettings.lastBuyPrice) ? 
            microProcessingSettings.lastBuyPrice : null,
          lastBuyShares: typeof microProcessingSettings.lastBuyShares === 'number' && !isNaN(microProcessingSettings.lastBuyShares) ? 
            microProcessingSettings.lastBuyShares : null,
          lastBuyTimestamp: microProcessingSettings.lastBuyTimestamp || null,
          createdAt: microProcessingSettings.createdAt || new Date(),
          updatedAt: microProcessingSettings.updatedAt || new Date()
        };
        
        console.log('Returning updated settings:', resultSettings);
        
        // Return the settings directly without nesting them in a microProcessingSettings property
        // This matches the format expected by the client and the GET endpoint
        return res.status(200).json(resultSettings);
      } catch (error) {
        console.error('[MICRO-SETTINGS] Error saving micro processing settings:', error);
        console.error('[MICRO-SETTINGS] Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
        console.error('[MICRO-SETTINGS] POST request parameters:', { cryptoId, userId: user.id });
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
        return res.status(500).json({ 
          error: 'Failed to save micro processing settings',
          details: errorMessage
        });
      }
    }
    
    // Handle unsupported methods
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    // Global error handler to ensure we always return JSON
    console.error('[MICRO-SETTINGS] Unhandled error in micro-processing-settings API:', error);
    console.error('[MICRO-SETTINGS] Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
    
    // Check if there is a message
    const details = error instanceof Error ? error.message : 'Unknown error';
    
    // Log more details about the error
    console.error('[MICRO-SETTINGS] Request method:', req.method);
    console.error('[MICRO-SETTINGS] Request query:', req.query);
    console.error('[MICRO-SETTINGS] Request body:', req.body);
    
    return res.status(500).json({ 
      error: 'An unexpected error occurred', 
      details: details,
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
    });
  }
}