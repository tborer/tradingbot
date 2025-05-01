import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { createClient } from '@/util/supabase/api';
import { MicroProcessingSettings } from '@prisma/client';

// Enable detailed authentication debugging with this flag
const DEBUG_AUTH = true;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log(`[MICRO-SETTINGS] API handler started: ${req.method} request received`);
  console.log(`[MICRO-SETTINGS] Request URL: ${req.url}`);
  console.log(`[MICRO-SETTINGS] Request query params:`, req.query);
  
  try {
    // Get the user from Supabase auth with enhanced debugging
    console.log('[MICRO-SETTINGS] Authenticating user with Supabase');
    console.log('[MICRO-SETTINGS] Request headers:', {
      authorization: req.headers.authorization ? 'Present' : 'Missing',
      cookie: req.headers.cookie ? 'Present' : 'Missing',
    });
    
    // Create Supabase client with defensive error handling
    let supabase;
    try {
      // Ensure req.cookies exists before creating the client
      if (!req.cookies) {
        req.cookies = {};
        console.log('[MICRO-SETTINGS] req.cookies was undefined, initialized to empty object');
      }
      
      supabase = createClient({ req, res });
      console.log('[MICRO-SETTINGS] Supabase client created successfully');
    } catch (clientError) {
      console.error('[MICRO-SETTINGS] Failed to create Supabase client:', clientError);
      return res.status(500).json({ 
        error: 'Internal server error', 
        details: 'Failed to initialize authentication client',
        errorMessage: clientError instanceof Error ? clientError.message : 'Unknown error'
      });
    }
    
    if (!supabase) {
      console.error('[MICRO-SETTINGS] Supabase client is null or undefined after creation');
      return res.status(500).json({ 
        error: 'Internal server error', 
        details: 'Failed to initialize authentication client - client is null'
      });
    }
    
    // Get session first to check if we have a valid session
    console.log('[MICRO-SETTINGS] Getting session from Supabase');
    let session;
    try {
      const sessionResponse = await supabase.auth.getSession();
      
      if (DEBUG_AUTH) {
        console.log('[MICRO-SETTINGS] Session response:', {
          status: sessionResponse.error ? 'error' : 'success',
          hasData: !!sessionResponse.data,
          hasSession: !!(sessionResponse.data && sessionResponse.data.session),
          error: sessionResponse.error ? sessionResponse.error.message : null
        });
      }
      
      if (sessionResponse.error) {
        console.error('[MICRO-SETTINGS] Session error:', sessionResponse.error);
        return res.status(401).json({ 
          error: 'Authentication error', 
          details: sessionResponse.error.message || 'Failed to get session',
          errorType: 'SessionError'
        });
      }
      
      session = sessionResponse.data.session;
      
      if (!session) {
        console.error('[MICRO-SETTINGS] No active session found');
        return res.status(401).json({ 
          error: 'Unauthorized', 
          details: 'No active session found',
          errorType: 'NoSession'
        });
      }
      
      console.log('[MICRO-SETTINGS] Valid session found:', {
        userId: session.user.id,
        hasAccessToken: !!session.access_token
      });
      
    } catch (sessionError) {
      console.error('[MICRO-SETTINGS] Error getting session:', sessionError);
      return res.status(401).json({ 
        error: 'Authentication error', 
        details: sessionError instanceof Error ? sessionError.message : 'Failed to get session',
        errorType: sessionError instanceof Error ? sessionError.name : 'Unknown'
      });
    }
    
    // Now get the user with the validated session
    console.log('[MICRO-SETTINGS] Getting user from validated session');
    let user;
    try {
      const userResponse = await supabase.auth.getUser();
      
      if (DEBUG_AUTH) {
        console.log('[MICRO-SETTINGS] User response:', {
          status: userResponse.error ? 'error' : 'success',
          hasData: !!userResponse.data,
          hasUser: !!(userResponse.data && userResponse.data.user),
          error: userResponse.error ? userResponse.error.message : null
        });
      }
      
      if (userResponse.error) {
        console.error('[MICRO-SETTINGS] User error:', userResponse.error);
        return res.status(401).json({ 
          error: 'Authentication error', 
          details: userResponse.error.message || 'Failed to get user',
          errorType: 'UserError'
        });
      }
      
      user = userResponse.data.user;
      
      if (!user) {
        console.error('[MICRO-SETTINGS] No user found in response data');
        return res.status(401).json({ 
          error: 'Unauthorized', 
          details: 'No authenticated user found',
          errorType: 'NoUserFound'
        });
      }
      
    } catch (userError) {
      console.error('[MICRO-SETTINGS] Error getting user:', userError);
      return res.status(401).json({ 
        error: 'Authentication error', 
        details: userError instanceof Error ? userError.message : 'Failed to get user',
        errorType: userError instanceof Error ? userError.name : 'Unknown'
      });
    }
    
    console.log(`[MICRO-SETTINGS] User authenticated: ${user.id}`);
    
    // Handle GET request to fetch settings
    if (req.method === 'GET') {
      console.log('[MICRO-SETTINGS] Processing GET request');
      const { cryptoId, includeEnabledCryptos, checkAuth } = req.query;
      
      // Special case for authentication check only
      if (checkAuth === 'true') {
        console.log('[MICRO-SETTINGS] Authentication check request received');
        // If we've reached this point, the user is already authenticated
        return res.status(200).json({ 
          authenticated: true, 
          userId: user.id,
          message: 'Authentication successful'
        });
      }
      
      // New consolidated endpoint to get all cryptos with their micro processing settings
      if (includeEnabledCryptos === 'true') {
        console.log('[MICRO-SETTINGS] Fetching all cryptos with micro processing settings');
        console.log('[MICRO-SETTINGS] User ID for query:', user.id);
        
        try {
          // Validate user ID before querying
          if (!user || !user.id) {
            console.error('[MICRO-SETTINGS] Invalid user ID for query');
            return res.status(400).json({ 
              error: 'Invalid user ID',
              details: 'User ID is required for this operation'
            });
          }
          
          // Validate prisma connection
          if (!prisma) {
            console.error('[MICRO-SETTINGS] Prisma client is not initialized');
            return res.status(500).json({ 
              error: 'Database error', 
              details: 'Database client is not initialized'
            });
          }
          
          // Get all cryptos for this user with their micro processing settings in a single query
          let cryptosWithSettings;
          try {
            cryptosWithSettings = await prisma.crypto.findMany({
              where: {
                userId: user.id
              },
              include: {
                microProcessingSettings: true
              }
            });
            console.log(`[MICRO-SETTINGS] Database query successful, found ${cryptosWithSettings?.length || 0} cryptos`);
          } catch (dbError) {
            console.error('[MICRO-SETTINGS] Database query error:', dbError);
            return res.status(500).json({ 
              error: 'Database error', 
              details: dbError instanceof Error ? dbError.message : 'Failed to query database',
              errorType: dbError instanceof Error ? dbError.name : 'Unknown',
              timestamp: new Date().toISOString()
            });
          }
          
          // Validate the result from the database
          if (!cryptosWithSettings) {
            console.error('[MICRO-SETTINGS] Database returned null or undefined result');
            return res.status(500).json({ 
              error: 'Database error',
              details: 'Failed to retrieve crypto data from database'
            });
          }
          
          console.log(`[MICRO-SETTINGS] Found ${cryptosWithSettings.length} cryptos for user`);
          
          // Map the results to include currentPrice from lastPrice with additional validation and error handling
          const formattedCryptos: any[] = [];
          
          // Extra safety check
          if (!cryptosWithSettings || !Array.isArray(cryptosWithSettings)) {
            console.warn('[MICRO-SETTINGS] cryptosWithSettings is not an array, using empty array');
            // Return empty array instead of processing further
            return res.status(200).json([]);
          }
          
          for (const crypto of cryptosWithSettings) {
            // Skip null/undefined cryptos
            if (!crypto) {
              console.warn('[MICRO-SETTINGS] Found null or undefined crypto in database results');
              continue;
            }
            
            try {
              console.log(`[MICRO-SETTINGS] Processing crypto: ${crypto.id} (${crypto.symbol})`);
              
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
              
              // Create a safe copy of the crypto object with explicit properties
              const formattedCrypto = {
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
              
              formattedCryptos.push(formattedCrypto);
            } catch (formatError) {
              console.error(`[MICRO-SETTINGS] Error formatting crypto ${crypto.id}:`, formatError);
              // Continue with other cryptos even if one fails
            }
          }
          
          // Validate the formatted cryptos array
          if (!formattedCryptos || formattedCryptos.length === 0) {
            console.warn('[MICRO-SETTINGS] No valid cryptos found after formatting');
            // Return an empty array instead of null to avoid client-side errors
            return res.status(200).json([]);
          }
          
          console.log(`[MICRO-SETTINGS] Formatted ${formattedCryptos.length} cryptos with settings`);
          console.log('[MICRO-SETTINGS] Sending successful response with status 200');
          
          // Set appropriate headers for JSON response
          res.setHeader('Content-Type', 'application/json');
          return res.status(200).json(formattedCryptos);
        } catch (error) {
          console.error('[MICRO-SETTINGS] Error fetching cryptos with settings:', error);
          console.error('[MICRO-SETTINGS] Error details:', error instanceof Error ? error.stack : 'No stack trace');
          
          // Return a more detailed error response
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
        console.error('[MICRO-SETTINGS] Request query params:', req.query);
        return res.status(400).json({ 
          error: 'Missing or invalid cryptoId parameter',
          details: `Expected string cryptoId but received: ${typeof cryptoId === 'undefined' ? 'undefined' : typeof cryptoId}`,
          receivedValue: cryptoId
        });
      }
      
      // Validate that cryptoId is a valid UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(cryptoId)) {
        console.error(`[MICRO-SETTINGS] Invalid cryptoId format: ${cryptoId}`);
        return res.status(400).json({ 
          error: 'Invalid cryptoId format', 
          details: 'The cryptoId must be a valid UUID format'
        });
      }
      
      try {
        console.log(`[MICRO-SETTINGS] Validating cryptoId: ${cryptoId} for userId: ${user.id}`);
        
        // Check if the crypto belongs to the user
        // First, validate that user exists and has an ID
        if (!user || !user.id) {
          console.error('[MICRO-SETTINGS] User or user.id is missing when checking crypto ownership');
          return res.status(401).json({ 
            error: 'Authentication error', 
            details: 'User not properly authenticated',
            errorType: 'MissingUserID'
          });
        }
        
        console.log(`[MICRO-SETTINGS] Checking crypto ownership with userId: ${user.id}`);
        const crypto = await prisma.crypto.findFirst({
          where: {
            id: cryptoId,
            userId: user.id
          }
        });
        
        // Log the result of the crypto lookup
        if (crypto) {
          console.log(`[MICRO-SETTINGS] Found crypto: ${crypto.symbol} (${crypto.id})`);
        } else {
          console.error(`[MICRO-SETTINGS] Crypto not found for id: ${cryptoId} and userId: ${user.id}`);
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
      
      // Safely extract and validate the request body
      if (!req.body) {
        console.error('[MICRO-SETTINGS] POST request missing body');
        return res.status(400).json({ error: 'Missing request body' });
      }
      
      try {
        console.log('[MICRO-SETTINGS] POST request body:', JSON.stringify(req.body));
      } catch (jsonError) {
        console.error('[MICRO-SETTINGS] Could not stringify request body:', jsonError);
      }
      
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
        
        // Add the requested logging for the crypto object
        console.log("Crypto object:", crypto);
        
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
          websocketProvider: 'binance',
          tradingPlatform: 'binance',
          purchasePrice: null,
          processingStatus: 'idle',
          testMode: false
        };
        
        // Validate settings before saving, ensuring all values are of the correct type
        // and falling back to defaults if values are missing or invalid
        console.log('[MICRO-SETTINGS] Validating settings values');
        
        // Log the incoming settings for debugging
        try {
          console.log('[MICRO-SETTINGS] Raw settings received:', JSON.stringify(settings));
        } catch (jsonError) {
          console.error('[MICRO-SETTINGS] Could not stringify settings:', jsonError);
        }
        
        // Log testMode specifically for debugging
        console.log('[MICRO-SETTINGS] testMode value:', settings.testMode);
        console.log('[MICRO-SETTINGS] testMode type:', typeof settings.testMode);
        
        // Safely extract values with explicit type checking
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
          // Preserve the exact testMode value (true or false)
          testMode: settings.testMode !== undefined ? settings.testMode : false
        };
        
        console.log('[MICRO-SETTINGS] Validated testMode:', validatedSettings.testMode);
        
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
        
        let microProcessingSettings;
        try {
          microProcessingSettings = await prisma.microProcessingSettings.upsert({
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
          console.log('[MICRO-SETTINGS] Prisma upsert operation completed successfully');
        } catch (prismaError) {
          console.error('[MICRO-SETTINGS] Prisma error during upsert operation:', prismaError);
          console.error('[MICRO-SETTINGS] Prisma error details:', {
            name: prismaError instanceof Error ? prismaError.name : 'Unknown',
            message: prismaError instanceof Error ? prismaError.message : 'Unknown error',
            stack: prismaError instanceof Error ? prismaError.stack : 'No stack trace'
          });
          
          // Check if it's a Prisma error and log more details
          if (prismaError && typeof prismaError === 'object' && 'code' in prismaError) {
            console.error('[MICRO-SETTINGS] Prisma error code:', (prismaError as any).code);
            console.error('[MICRO-SETTINGS] Prisma error meta:', (prismaError as any).meta);
          }
          
          throw prismaError; // Re-throw to be caught by the outer try-catch
        }
        
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
    console.log(`[MICRO-SETTINGS] Unsupported method: ${req.method}`);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    // Global error handler to ensure we always return JSON
    console.error('[MICRO-SETTINGS] Unhandled error in micro-processing-settings API:', error);
    console.error('[MICRO-SETTINGS] Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
    
    // Check if there is a message
    const details = error instanceof Error ? error.message : 'Unknown error';
    
    // Log more details about the error
    console.error('[MICRO-SETTINGS] Request method:', req.method);
    
    // Safely log request query
    try {
      console.error('[MICRO-SETTINGS] Request query:', JSON.stringify(req.query));
    } catch (logError) {
      console.error('[MICRO-SETTINGS] Could not stringify request query');
    }
    
    // Safely log request body
    try {
      console.error('[MICRO-SETTINGS] Request body:', typeof req.body === 'object' ? JSON.stringify(req.body) : req.body);
    } catch (logError) {
      console.error('[MICRO-SETTINGS] Could not stringify request body:', logError);
      console.error('[MICRO-SETTINGS] Raw request body type:', typeof req.body);
    }
    
    // Check if it's a TypeError related to null/undefined object
    if (error instanceof TypeError && error.message.includes('null') && error.message.includes('object')) {
      console.error('[MICRO-SETTINGS] TypeError with null/undefined object detected');
      return res.status(500).json({
        error: 'An unexpected error occurred',
        details: 'Cannot process null or undefined data. Please check your request parameters.',
        errorType: 'TypeError',
        timestamp: new Date().toISOString()
      });
    }
    
    // Check if it's a Prisma error and log more details
    if (error && typeof error === 'object' && 'code' in error) {
      try {
        console.error('[MICRO-SETTINGS] Prisma error code:', (error as any).code);
        console.error('[MICRO-SETTINGS] Prisma error meta:', JSON.stringify((error as any).meta));
      } catch (metaError) {
        console.error('[MICRO-SETTINGS] Could not stringify Prisma error meta');
      }
      
      // Handle specific Prisma errors
      if ((error as any).code === 'P2003') {
        console.error('[MICRO-SETTINGS] Foreign key constraint failed. This might be due to a missing crypto record.');
        return res.status(500).json({
          error: 'Database constraint error',
          details: 'The operation failed due to a foreign key constraint. The crypto record might be missing or invalid.',
          errorCode: (error as any).code,
          timestamp: new Date().toISOString()
        });
      }
      
      if ((error as any).code === 'P2025') {
        console.error('[MICRO-SETTINGS] Record not found. This might be due to a missing crypto record.');
        return res.status(404).json({
          error: 'Record not found',
          details: 'The requested record could not be found in the database.',
          errorCode: (error as any).code,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Check for network or connection errors
    if (error instanceof Error && error.message.includes('connect')) {
      console.error('[MICRO-SETTINGS] Possible database connection error');
    }
    
    // Check for timeout errors
    if (error instanceof Error && error.message.includes('timeout')) {
      console.error('[MICRO-SETTINGS] Possible database timeout error');
    }
    
    return res.status(500).json({ 
      error: 'An unexpected error occurred', 
      details: details,
      errorType: error instanceof Error ? error.name : 'Unknown',
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
    });
  }
}