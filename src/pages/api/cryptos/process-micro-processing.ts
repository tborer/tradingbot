import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { createClient } from '@/util/supabase/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log(`[PROCESS-MICRO] API handler started: ${req.method} request received`);
  
  try {
    // Simplified authentication
    const supabase = createClient({ req, res });
    const { data } = await supabase.auth.getUser();
    
    if (!data || !data.user) {
      console.error('[PROCESS-MICRO] Authentication failed: No user found');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = data.user;
    console.log(`[PROCESS-MICRO] User authenticated: ${user.id}`);
    
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
                userId: user.id
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
        // Processing logic would be implemented here
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
      
      if (!req.body) {
        return res.status(400).json({ error: 'Missing request body' });
      }
      
      try {
        // POST processing logic would be implemented here
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
    
    // Handle unsupported methods
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowedMethods: ['GET', 'POST']
    });
  } catch (error) {
    console.error('[PROCESS-MICRO] Unhandled error:', error);
    
    // Simplified error handling
    return res.status(500).json({ 
      error: 'An unexpected error occurred', 
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}