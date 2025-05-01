import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { createClient } from '@/util/supabase/api';

// Global error handler to catch any unexpected errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('[PROCESS-MICRO] Unhandled Rejection at:', promise, 'reason:', reason);
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Initialize req.cookies at the very beginning to prevent authentication errors
  if (!req.cookies) {
    req.cookies = {};
    console.log('[PROCESS-MICRO] req.cookies was undefined, initialized to empty object');
  }
  
  // Wrap everything in a try-catch to ensure we catch all errors
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

    try {
      // Get the user from Supabase auth
      console.log('[PROCESS-MICRO] Attempting to authenticate user...');
      
      // Check if environment variables are set
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        console.error('[PROCESS-MICRO] NEXT_PUBLIC_SUPABASE_URL is not defined');
        return res.status(500).json({ error: 'Server configuration error: Missing Supabase URL' });
      }
      
      if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        console.error('[PROCESS-MICRO] NEXT_PUBLIC_SUPABASE_ANON_KEY is not defined');
        return res.status(500).json({ error: 'Server configuration error: Missing Supabase anon key' });
      }
      
      console.log('[PROCESS-MICRO] Creating Supabase client with URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
      
      let supabase;
      let data;
      let authError;
      
      try {
        // Ensure req.cookies exists before creating the client
        if (!req.cookies) {
          req.cookies = {};
          console.log('[PROCESS-MICRO] req.cookies was undefined, initialized to empty object');
        }
        
        supabase = createClient({ req, res });
        console.log('[PROCESS-MICRO] Supabase client created successfully');
        
        console.log('[PROCESS-MICRO] Calling supabase.auth.getUser()...');
        const authResponse = await supabase.auth.getUser();
        data = authResponse.data;
        authError = authResponse.error;
        console.log('[PROCESS-MICRO] supabase.auth.getUser() completed');
      } catch (supabaseError) {
        console.error('[PROCESS-MICRO] Error creating Supabase client or authenticating:', supabaseError);
        return res.status(500).json({ 
          error: 'Authentication system error',
          details: supabaseError.message || 'Failed to initialize authentication',
          stack: process.env.NODE_ENV === 'development' ? supabaseError.stack : undefined
        });
      }
      
      if (authError) {
        console.log('[PROCESS-MICRO] Authentication error encountered:', authError);
        return res.status(401).json({ error: 'Authentication required for API test' });
      }
      
      if (!data) {
        console.log('[PROCESS-MICRO] Authentication data is null or undefined');
        return res.status(401).json({ error: 'Authentication required for API test' });
      }
      
      if (!data.user) {
        console.log('[PROCESS-MICRO] User data is null or undefined');
        return res.status(401).json({ error: 'Authentication required for API test' });
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
        console.log('[PROCESS-MICRO] Request body:', JSON.stringify(req.body));
        
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
      
    } catch (innerError) {
      console.error('[PROCESS-MICRO] Error in process-micro-processing API inner try-catch:', innerError);
      
      return res.status(500).json({
        error: 'An unexpected error occurred',
        details: innerError.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? innerError.stack : undefined,
        timestamp: new Date().toISOString()
      });
    }
  } catch (outerError) {
    console.error('[PROCESS-MICRO] Critical error in process-micro-processing API outer try-catch:', outerError);
    
    return res.status(500).json({
      error: 'A critical error occurred',
      details: outerError.message || 'Unknown critical error',
      stack: process.env.NODE_ENV === 'development' ? outerError.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}