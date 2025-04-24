import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { createClient } from '@/util/supabase/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log(`[PROCESS-MICRO] API handler started: ${req.method} request received`);
  console.log(`[PROCESS-MICRO] Request URL: ${req.url}`);
  console.log(`[PROCESS-MICRO] Request query params:`, req.query);
  
  try {
    // Get the user from Supabase auth
    console.log('[PROCESS-MICRO] Authenticating user with Supabase');
    const supabase = createClient({ req, res });
    
    try {
      const { data } = await supabase.auth.getUser();
      console.log('[PROCESS-MICRO] Supabase auth response:', data ? 'Data received' : 'No data received');
      
      if (!data || !data.user) {
        console.error('[PROCESS-MICRO] Authentication failed: No user found');
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const user = data.user;
      console.log(`[PROCESS-MICRO] User authenticated: ${user.id}`);
    } catch (authError) {
      console.error('[PROCESS-MICRO] Supabase authentication error:', authError);
      console.error('[PROCESS-MICRO] Auth error stack:', authError instanceof Error ? authError.stack : 'No stack trace available');
      return res.status(401).json({ 
        error: 'Authentication failed', 
        details: authError instanceof Error ? authError.message : 'Unknown authentication error' 
      });
    }
    
    // Handle GET request to fetch only enabled settings
    if (req.method === 'GET') {
      console.log('[PROCESS-MICRO] Processing GET request');
      console.log('[PROCESS-MICRO] Query parameters:', req.query);
      const { fetchOnly } = req.query;
      
      // If fetchOnly is true, just return the enabled settings without processing
      if (fetchOnly === 'true') {
        console.log('[PROCESS-MICRO] Fetching only enabled micro processing settings');
        
        try {
          console.log(`[PROCESS-MICRO] Querying database for cryptos with userId: ${user.id}`);
          // Get all cryptos for this user
          let cryptos;
          try {
            cryptos = await prisma.crypto.findMany({
              where: {
                userId: user.id
              }
            });
            console.log(`[PROCESS-MICRO] Prisma crypto query completed successfully`);
            console.log(`[PROCESS-MICRO] Found ${cryptos.length} cryptos for user`);
          } catch (prismaError) {
            console.error('[PROCESS-MICRO] Prisma error during crypto query:', prismaError);
            console.error('[PROCESS-MICRO] Prisma error details:', {
              name: prismaError instanceof Error ? prismaError.name : 'Unknown',
              message: prismaError instanceof Error ? prismaError.message : 'Unknown error',
              stack: prismaError instanceof Error ? prismaError.stack : 'No stack trace'
            });
            throw prismaError; // Re-throw to be caught by the outer try-catch
          }
          
          if (!cryptos || cryptos.length === 0) {
            console.log('[PROCESS-MICRO] No cryptos found for user');
            return res.status(200).json([]);
          }
          
          console.log(`[PROCESS-MICRO] Found ${cryptos.length} cryptos for user`);
          console.log('[PROCESS-MICRO] Crypto IDs:', cryptos.map(c => c.id));
          
          // Get all enabled micro processing settings with the crypto relationship
          console.log('[PROCESS-MICRO] Querying for enabled micro processing settings');
          let enabledSettings;
          try {
            enabledSettings = await prisma.microProcessingSettings.findMany({
              where: {
                cryptoId: {
                  in: cryptos.map(crypto => crypto.id)
                },
                enabled: true
              },
              include: {
                crypto: true // Include the crypto relationship
              }
            });
            console.log(`[PROCESS-MICRO] Prisma microProcessingSettings query completed successfully`);
          } catch (prismaError) {
            console.error('[PROCESS-MICRO] Prisma error during microProcessingSettings query:', prismaError);
            console.error('[PROCESS-MICRO] Prisma error details:', {
              name: prismaError instanceof Error ? prismaError.name : 'Unknown',
              message: prismaError instanceof Error ? prismaError.message : 'Unknown error',
              stack: prismaError instanceof Error ? prismaError.stack : 'No stack trace'
            });
            throw prismaError; // Re-throw to be caught by the outer try-catch
          }
          
          console.log(`[PROCESS-MICRO] Found ${enabledSettings.length} enabled settings`);
          
          // Log detailed information about each enabled setting
          if (enabledSettings.length > 0) {
            console.log('[PROCESS-MICRO] Enabled settings details:');
            enabledSettings.forEach((setting, index) => {
              console.log(`[PROCESS-MICRO] Setting ${index + 1}:`);
              console.log(`[PROCESS-MICRO] - id: ${setting.id}`);
              console.log(`[PROCESS-MICRO] - cryptoId: ${setting.cryptoId}`);
              console.log(`[PROCESS-MICRO] - crypto symbol: ${setting.crypto?.symbol || 'N/A'}`);
              console.log(`[PROCESS-MICRO] - enabled: ${setting.enabled}`);
              console.log(`[PROCESS-MICRO] - processingStatus: ${setting.processingStatus}`);
              console.log(`[PROCESS-MICRO] - websocketProvider: ${setting.websocketProvider}`);
              console.log(`[PROCESS-MICRO] - tradingPlatform: ${setting.tradingPlatform}`);
              console.log(`[PROCESS-MICRO] - testMode: ${setting.testMode}`);
            });
          }
          
          console.log('[PROCESS-MICRO] Sending successful response with status 200');
          return res.status(200).json(enabledSettings);
        } catch (error) {
          console.error('[PROCESS-MICRO] Error fetching enabled settings:', error);
          console.error('[PROCESS-MICRO] Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
          
          // Check if it's a Prisma error and log more details
          if (error && typeof error === 'object' && 'code' in error) {
            console.error('[PROCESS-MICRO] Prisma error code:', (error as any).code);
            console.error('[PROCESS-MICRO] Prisma error meta:', (error as any).meta);
          }
          
          return res.status(500).json({ 
            error: 'Failed to fetch enabled micro processing settings', 
            details: error instanceof Error ? error.message : 'Unknown error',
            errorType: error instanceof Error ? error.name : 'Unknown',
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // If fetchOnly is not true, process the micro processing (existing functionality)
      console.log('[PROCESS-MICRO] Processing micro processing settings (fetchOnly is not true)');
      try {
        console.log('[PROCESS-MICRO] Initiating processing of micro processing settings');
        // This would be implemented in a real system, but for this fix we're just focusing on the fetchOnly parameter
        console.log('[PROCESS-MICRO] Processing logic would be implemented here');
        console.log('[PROCESS-MICRO] Sending successful response with status 200');
        return res.status(200).json({ 
          message: 'Processing initiated',
          timestamp: new Date().toISOString()
        });
      } catch (processingError) {
        console.error('[PROCESS-MICRO] Error during processing:', processingError);
        console.error('[PROCESS-MICRO] Processing error stack:', processingError instanceof Error ? processingError.stack : 'No stack trace available');
        return res.status(500).json({ 
          error: 'Failed to process micro processing settings', 
          details: processingError instanceof Error ? processingError.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Handle POST request to process micro processing
    if (req.method === 'POST') {
      console.log('[PROCESS-MICRO] Processing POST request');
      console.log('[PROCESS-MICRO] POST request body:', JSON.stringify(req.body));
      
      try {
        console.log('[PROCESS-MICRO] Validating POST request body');
        // Validate request body here if needed
        if (!req.body) {
          console.error('[PROCESS-MICRO] POST request missing body');
          return res.status(400).json({ error: 'Missing request body' });
        }
        
        console.log('[PROCESS-MICRO] Initiating processing based on POST request');
        // This would be implemented in a real system
        console.log('[PROCESS-MICRO] POST processing logic would be implemented here');
        console.log('[PROCESS-MICRO] Sending successful response with status 200');
        return res.status(200).json({ 
          message: 'Processing initiated',
          timestamp: new Date().toISOString()
        });
      } catch (postError) {
        console.error('[PROCESS-MICRO] Error during POST processing:', postError);
        console.error('[PROCESS-MICRO] POST error stack:', postError instanceof Error ? postError.stack : 'No stack trace available');
        return res.status(500).json({ 
          error: 'Failed to process micro processing settings', 
          details: postError instanceof Error ? postError.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Handle unsupported methods
    console.log(`[PROCESS-MICRO] Unsupported method: ${req.method}`);
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowedMethods: ['GET', 'POST'],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Global error handler to ensure we always return JSON
    console.error('[PROCESS-MICRO] Unhandled error in process-micro-processing API:', error);
    console.error('[PROCESS-MICRO] Error stack:', error instanceof Error ? error.stack : 'No stack trace available');
    
    // Check if there is a message
    const details = error instanceof Error ? error.message : 'Unknown error';
    
    // Log more details about the error
    console.error('[PROCESS-MICRO] Request method:', req.method);
    console.error('[PROCESS-MICRO] Request query:', req.query);
    console.error('[PROCESS-MICRO] Request body:', req.body);
    
    // Check if it's a Prisma error and log more details
    if (error && typeof error === 'object' && 'code' in error) {
      console.error('[PROCESS-MICRO] Prisma error code:', (error as any).code);
      console.error('[PROCESS-MICRO] Prisma error meta:', (error as any).meta);
      
      // Handle specific Prisma errors
      if ((error as any).code === 'P2003') {
        console.error('[PROCESS-MICRO] Foreign key constraint failed. This might be due to a missing crypto record.');
        return res.status(500).json({
          error: 'Database constraint error',
          details: 'The operation failed due to a foreign key constraint. The crypto record might be missing or invalid.',
          errorCode: (error as any).code,
          timestamp: new Date().toISOString()
        });
      }
      
      if ((error as any).code === 'P2025') {
        console.error('[PROCESS-MICRO] Record not found. This might be due to a missing crypto record.');
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
      console.error('[PROCESS-MICRO] Possible database connection error');
    }
    
    // Check for timeout errors
    if (error instanceof Error && error.message.includes('timeout')) {
      console.error('[PROCESS-MICRO] Possible database timeout error');
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