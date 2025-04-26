import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

// Create a unique request ID for logging
const generateRequestId = () => {
  return `settings-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = generateRequestId();
  console.log(`[${requestId}] Settings API request received: ${req.method}`);
  
  try {
    const supabase = createClient(req, res);
    console.log(`[${requestId}] Supabase client created`);
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error(`[${requestId}] Authentication error:`, authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log(`[${requestId}] User authenticated: ${user.id}`);

    // Check database connection before proceeding
    try {
      // Simple query to check if database is accessible
      await prisma.$queryRaw`SELECT 1`;
      console.log(`[${requestId}] Database connection check passed`);
    } catch (dbError) {
      console.error(`[${requestId}] Database connection error:`, dbError);
      return res.status(503).json({ error: 'Database service unavailable', details: 'Could not connect to database' });
    }

    // GET - Fetch user settings
    if (req.method === 'GET') {
      console.log(`[${requestId}] Processing GET request for user settings`);
      
      try {
        let settings = await prisma.settings.findUnique({
          where: { userId: user.id },
        });
        
        console.log(`[${requestId}] Settings fetch result:`, settings ? 'Found settings' : 'No settings found');
        
        // Create default settings if none exist
        if (!settings) {
          console.log(`[${requestId}] Creating default settings for user`);
          
          try {
            settings = await prisma.settings.create({
              data: {
                userId: user.id,
                sellThresholdPercent: 5.0,
                buyThresholdPercent: 5.0,
                checkFrequencySeconds: 60,
              },
            });
            console.log(`[${requestId}] Default settings created successfully`);
          } catch (createError) {
            console.error(`[${requestId}] Error creating default settings:`, createError);
            return res.status(500).json({ 
              error: 'Failed to create default settings',
              details: createError instanceof Error ? createError.message : 'Unknown error'
            });
          }
        }
        
        console.log(`[${requestId}] Returning settings to client`);
        return res.status(200).json(settings);
      } catch (getError) {
        console.error(`[${requestId}] Error fetching settings:`, getError);
        return res.status(500).json({ 
          error: 'Failed to fetch settings',
          details: getError instanceof Error ? getError.message : 'Unknown error'
        });
      }
    }
    
    // PUT - Update user settings
    if (req.method === 'PUT') {
      console.log(`[${requestId}] Processing PUT request to update settings`);
      
      const { 
        sellThresholdPercent, 
        buyThresholdPercent, 
        checkFrequencySeconds,
        tradePlatformApiKey,
        tradePlatformApiSecret,
        finnhubApiKey,
        krakenApiKey,
        krakenApiSign,
        alphaVantageApiKey,
        coinDeskApiKey,
        enableAutoStockTrading,
        enableAutoCryptoTrading,
        enableManualCryptoTrading,
        enableFinnHubWebSocket,
        enableKrakenWebSocket,
        krakenWebsocketUrl
      } = req.body;
      
      console.log(`[${requestId}] Updating settings with:`, {
        sellThresholdPercent,
        buyThresholdPercent,
        checkFrequencySeconds,
        enableManualCryptoTrading,
        krakenWebsocketUrl,
        hasKrakenApiKey: !!krakenApiKey,
        hasKrakenApiSign: !!krakenApiSign
      });
      
      if (sellThresholdPercent === undefined || buyThresholdPercent === undefined || checkFrequencySeconds === undefined) {
        console.error(`[${requestId}] Missing required settings fields`);
        return res.status(400).json({ error: 'Sell threshold, buy threshold, and check frequency are required' });
      }
      
      // Validate input values
      if (sellThresholdPercent < 0 || buyThresholdPercent < 0 || checkFrequencySeconds < 10) {
        console.error(`[${requestId}] Invalid settings values`);
        return res.status(400).json({ 
          error: 'Invalid settings values. Thresholds must be positive and check frequency must be at least 10 seconds.' 
        });
      }
      
      try {
        const updateData: any = {
          sellThresholdPercent: parseFloat(sellThresholdPercent.toString()),
          buyThresholdPercent: parseFloat(buyThresholdPercent.toString()),
          checkFrequencySeconds: parseInt(checkFrequencySeconds.toString()),
          enableAutoStockTrading: enableAutoStockTrading === true,
          enableAutoCryptoTrading: enableAutoCryptoTrading === true,
          // Only set these if they're explicitly provided in the request
          // This ensures we don't accidentally set them to false when undefined
          ...(enableManualCryptoTrading !== undefined && { enableManualCryptoTrading: enableManualCryptoTrading === true }),
          ...(enableFinnHubWebSocket !== undefined && { enableFinnHubWebSocket: enableFinnHubWebSocket === true }),
          ...(enableKrakenWebSocket !== undefined && { enableKrakenWebSocket: enableKrakenWebSocket === true })
        };
        
        // Only add optional fields if they are defined
        if (tradePlatformApiKey !== undefined) updateData['tradePlatformApiKey'] = tradePlatformApiKey;
        if (tradePlatformApiSecret !== undefined) updateData['tradePlatformApiSecret'] = tradePlatformApiSecret;
        if (finnhubApiKey !== undefined) updateData['finnhubApiKey'] = finnhubApiKey;
        if (krakenApiKey !== undefined) updateData['krakenApiKey'] = krakenApiKey;
        if (krakenApiSign !== undefined) updateData['krakenApiSign'] = krakenApiSign;
        if (req.body.binanceTradeApi !== undefined) updateData['binanceTradeApi'] = req.body.binanceTradeApi;
        if (req.body.binanceApiKey !== undefined) updateData['binanceApiKey'] = req.body.binanceApiKey;
        if (req.body.binanceApiSecret !== undefined) updateData['binanceApiSecret'] = req.body.binanceApiSecret;
        if (alphaVantageApiKey !== undefined) updateData['alphaVantageApiKey'] = alphaVantageApiKey;
        if (coinDeskApiKey !== undefined) updateData['coinDeskApiKey'] = coinDeskApiKey;
        if (req.body.openAIApiKey !== undefined) updateData['openAIApiKey'] = req.body.openAIApiKey;
        if (req.body.anthropicApiKey !== undefined) updateData['anthropicApiKey'] = req.body.anthropicApiKey;
        if (req.body.researchApiPreference !== undefined) updateData['researchApiPreference'] = req.body.researchApiPreference;
        if (krakenWebsocketUrl !== undefined) updateData['krakenWebsocketUrl'] = krakenWebsocketUrl;
        
        console.log(`[${requestId}] Attempting to upsert settings`);
        
        const settings = await prisma.settings.upsert({
          where: { userId: user.id },
          update: updateData,
          create: {
            userId: user.id,
            ...updateData
          },
        });
        
        console.log(`[${requestId}] Settings updated successfully`);
        return res.status(200).json(settings);
      } catch (updateError) {
        console.error(`[${requestId}] Error updating settings:`, updateError);
        return res.status(500).json({ 
          error: 'Failed to update settings',
          details: updateError instanceof Error ? updateError.message : 'Unknown error'
        });
      }
    }
    
    // POST - Update specific settings (used by GoogleAISettings component)
    if (req.method === 'POST') {
      console.log(`[${requestId}] Processing POST request to update specific settings`);
      
      const { googleApiKey } = req.body;
      
      try {
        // Update only the specific field
        const updateData: any = {};
        
        if (googleApiKey !== undefined) updateData['googleApiKey'] = googleApiKey;
        
        // Ensure we have at least one field to update
        if (Object.keys(updateData).length === 0) {
          console.error(`[${requestId}] No valid fields provided for update`);
          return res.status(400).json({ error: 'No valid fields provided for update' });
        }
        
        console.log(`[${requestId}] Attempting to upsert specific settings`);
        
        const settings = await prisma.settings.upsert({
          where: { userId: user.id },
          update: updateData,
          create: {
            userId: user.id,
            sellThresholdPercent: 5.0, // Default values
            buyThresholdPercent: 5.0,
            checkFrequencySeconds: 60,
            ...updateData
          },
        });
        
        console.log(`[${requestId}] Settings updated successfully`);
        return res.status(200).json(settings);
      } catch (updateError) {
        console.error(`[${requestId}] Error updating settings:`, updateError);
        return res.status(500).json({ 
          error: 'Failed to update settings',
          details: updateError instanceof Error ? updateError.message : 'Unknown error'
        });
      }
    }
    
    console.log(`[${requestId}] Method not allowed: ${req.method}`);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(`[${requestId}] Unhandled API error:`, error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}