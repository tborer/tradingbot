import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { processMicroProcessing } from '@/lib/microProcessingService';

// Global error handler to catch any unexpected errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('[PROCESS-MICRO] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Convert to use the auth middleware
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    console.log(`[PROCESS-MICRO] API handler started: ${req.method} request received`);
    console.log('[PROCESS-MICRO] Request body:', typeof req.body === 'object' ? JSON.stringify(req.body) : req.body);
  
    // Only allow GET and POST requests
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ 
        error: 'Method not allowed',
        allowedMethods: ['GET', 'POST']
      });
    }

    // Validate request body for POST requests
    if (req.method === 'POST' && !req.body) {
      console.error('[PROCESS-MICRO] Request body is missing');
      return res.status(400).json({ error: 'Missing request body' });
    }

    const userId = req.user.id;
    console.log(`[PROCESS-MICRO] User authenticated: ${userId}`);
    
    // Handle GET request to fetch only enabled settings
    if (req.method === 'GET') {
      console.log('[PROCESS-MICRO] Processing GET request');
      const { fetchOnly } = req.query;
      
      // If fetchOnly is true, just return the enabled settings without processing
      if (fetchOnly === 'true') {
        console.log('[PROCESS-MICRO] Fetching only enabled micro processing settings');
        
        try {
          // Get all enabled micro processing settings with the crypto relationship in a single query
          const enabledSettings = await prisma.microProcessingSettings.findMany({
            where: {
              enabled: true,
              crypto: {
                userId: userId
              }
            },
            include: {
              crypto: true // Include the crypto relationship
            }
          });
          
          console.log(`[PROCESS-MICRO] Found ${enabledSettings.length} enabled settings`);
          return res.status(200).json(enabledSettings);
        } catch (error) {
          console.error('[PROCESS-MICRO] Error fetching enabled settings:', error);
          return res.status(500).json({ 
            error: 'Failed to fetch enabled micro processing settings', 
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      // If fetchOnly is not true, process the micro processing
      console.log('[PROCESS-MICRO] Processing micro processing settings');
      try {
        // Process micro processing for the user
        await processMicroProcessing(userId);
        
        return res.status(200).json({ 
          message: 'Processing initiated',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[PROCESS-MICRO] Error during processing:', error);
        return res.status(500).json({ 
          error: 'Failed to process micro processing settings', 
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Handle POST request to process micro processing
    if (req.method === 'POST') {
      console.log('[PROCESS-MICRO] Processing POST request');
      console.log('[PROCESS-MICRO] Request body:', JSON.stringify(req.body));
      
      try {
        // Process micro processing for the user
        await processMicroProcessing(userId);
        
        return res.status(200).json({ 
          message: 'Processing initiated',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[PROCESS-MICRO] Error during POST processing:', error);
        return res.status(500).json({ 
          error: 'Failed to process micro processing settings', 
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
  } catch (error) {
    console.error('[PROCESS-MICRO] Critical error in process-micro-processing API:', error);
    
    return res.status(500).json({
      error: 'A critical error occurred',
      details: error instanceof Error ? error.message : 'Unknown critical error',
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

// Export the handler wrapped with the withAuth middleware
export default withAuth(handler);