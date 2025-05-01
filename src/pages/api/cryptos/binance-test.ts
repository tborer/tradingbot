import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { autoTradeLogger } from '@/lib/autoTradeLogger';

// Global error handler to catch any unexpected errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Initialize req.cookies at the very beginning to prevent authentication errors
  if (!req.cookies) {
    req.cookies = {};
    console.log('Binance test: req.cookies was undefined, initialized to empty object');
  }
  
  // Wrap everything in a try-catch to ensure we catch all errors
  try {
    console.log('Binance test API handler called with method:', req.method);
    console.log('Request body:', typeof req.body === 'object' ? JSON.stringify(req.body) : req.body);
  
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Validate request body
    if (!req.body) {
      console.error('Request body is missing');
      return res.status(400).json({ error: 'Request body is required' });
    }

    try {
      // Get the user from Supabase auth
      console.log('Attempting to authenticate user...');
      
      // Check if environment variables are set
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        console.error('NEXT_PUBLIC_SUPABASE_URL is not defined');
        return res.status(500).json({ error: 'Server configuration error: Missing Supabase URL' });
      }
      
      if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not defined');
        return res.status(500).json({ error: 'Server configuration error: Missing Supabase anon key' });
      }
      
      console.log('Creating Supabase client with URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
      
      let supabase;
      let data;
      let authError;
      
      try {
        supabase = createClient({ req, res });
        console.log('Supabase client created successfully');
        
        console.log('Calling supabase.auth.getUser()...');
        const authResponse = await supabase.auth.getUser();
        data = authResponse.data;
        authError = authResponse.error;
        console.log('supabase.auth.getUser() completed');
      } catch (supabaseError) {
        console.error('Error creating Supabase client or authenticating:', supabaseError);
        return res.status(500).json({ 
          error: 'Authentication system error',
          details: supabaseError.message || 'Failed to initialize authentication',
          stack: process.env.NODE_ENV === 'development' ? supabaseError.stack : undefined
        });
      }
      
      if (authError) {
        console.log('Authentication error encountered:', authError);
        return res.status(401).json({ error: 'Authentication required for API test' });
      }
      
      if (!data) {
        console.log('Authentication data is null or undefined');
        return res.status(401).json({ error: 'Authentication required for API test' });
      }
      
      if (!data.user) {
        console.log('User data is null or undefined');
        return res.status(401).json({ error: 'Authentication required for API test' });
      }
      
      const userId = data.user.id;
      console.log('Authentication successful - User ID:', userId || 'NULL/UNDEFINED');
      
      // Extract parameters from request body
      console.log('Extracting parameters from request body...');
      const { apiUrl, params } = req.body || {};
      
      if (!apiUrl) {
        console.log('ERROR: apiUrl is null, undefined, or empty');
      } else {
        console.log('Extracted apiUrl:', apiUrl);
      }
      
      if (!params) {
        console.log('ERROR: params is null or undefined');
      } else if (typeof params !== 'object') {
        console.log('ERROR: params is not an object, type:', typeof params);
      } else {
        console.log('Extracted params:', JSON.stringify(params, null, 2));
      }
      
      if (!apiUrl) {
        return res.status(400).json({ error: 'API URL is required' });
      }
      
      if (!params || typeof params !== 'object') {
        return res.status(400).json({ error: 'Valid parameters object is required' });
      }
      
      // Get Binance API credentials from user settings
      console.log('Fetching Binance API credentials for user:', userId);
      
      let settings;
      try {
        settings = await prisma.settings.findUnique({
          where: { userId }
        });
        console.log('Database query for settings completed');
      } catch (dbError) {
        console.error('Error querying database for settings:', dbError);
        return res.status(500).json({ 
          error: 'Database error',
          details: dbError.message || 'Failed to retrieve API credentials from database',
          stack: process.env.NODE_ENV === 'development' ? dbError.stack : undefined
        });
      }
      
      if (!settings) {
        console.log('ERROR: No settings found for user:', userId);
        return res.status(400).json({ 
          error: 'Binance API credentials not configured',
          details: 'Please configure your Binance API key and secret in Settings'
        });
      }
      
      if (!settings.binanceApiKey) {
        console.log('ERROR: Binance API key is missing in user settings');
        return res.status(400).json({ 
          error: 'Binance API credentials not configured',
          details: 'Please configure your Binance API key in Settings'
        });
      }
      
      if (!settings.binanceApiSecret) {
        console.log('ERROR: Binance API secret is missing in user settings');
        return res.status(400).json({ 
          error: 'Binance API credentials not configured',
          details: 'Please configure your Binance API secret in Settings'
        });
      }
      
      console.log('API Key found:', settings.binanceApiKey.substring(0, 4) + '...' + 
                  settings.binanceApiKey.substring(settings.binanceApiKey.length - 4));
      console.log('API Secret: [REDACTED]');
      
      // Generate query string from parameters
      console.log('Building query string from parameters...');
      let paramErrors = false;
      
      const queryString = Object.entries(params)
        .map(([key, value]) => {
          if (value === undefined) {
            console.log(`WARNING: Parameter '${key}' has undefined value, using empty string instead`);
            paramErrors = true;
            return `${key}=`;
          }
          if (value === null) {
            console.log(`WARNING: Parameter '${key}' has null value, using empty string instead`);
            paramErrors = true;
            return `${key}=`;
          }
          const safeValue = String(value);
          console.log(`Parameter '${key}' = '${safeValue}'`);
          return `${key}=${encodeURIComponent(safeValue)}`;
        })
        .join('&');
      
      if (queryString === '') {
        console.log('WARNING: Generated query string is empty');
      } else {
        console.log('Query string built:', queryString);
      }
      
      if (paramErrors) {
        console.log('WARNING: Some parameters had null or undefined values');
      }
      
      // Generate signature using HMAC SHA256
      console.log('Generating signature using HMAC SHA256...');
      if (!queryString) {
        console.log('WARNING: Generating signature with empty query string');
      }
      
      let signature;
      try {
        signature = crypto
          .createHmac('sha256', settings.binanceApiSecret)
          .update(queryString)
          .digest('hex');
          
        if (!signature) {
          console.log('ERROR: Failed to generate signature');
        } else {
          console.log('Signature generated successfully:', signature.substring(0, 6) + '...' + signature.substring(signature.length - 6));
        }
      } catch (cryptoError) {
        console.error('Error generating signature:', cryptoError);
        return res.status(500).json({ 
          error: 'Signature generation error',
          details: cryptoError.message || 'Failed to generate API request signature',
          stack: process.env.NODE_ENV === 'development' ? cryptoError.stack : undefined
        });
      }
      
      // Create the full URL with query string and signature
      console.log('Creating full URL with query string and signature...');
      const fullUrl = `${apiUrl}?${queryString}&signature=${signature}`;
      console.log('Full URL created (masked):', `${apiUrl}?${queryString}&signature=${signature.substring(0, 6)}...`);
      
      // Create request details to return to client (with masked signature)
      const requestDetails = {
        url: apiUrl,
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': settings.binanceApiKey.substring(0, 4) + '...' + 
                          settings.binanceApiKey.substring(settings.binanceApiKey.length - 4)
        },
        queryString,
        fullUrl: `${apiUrl}?${queryString}&signature=${signature.substring(0, 5)}...${signature.substring(signature.length - 5)}`
      };
      console.log('Request details prepared:', JSON.stringify(requestDetails, null, 2));
      
      // Log the request for debugging
      try {
        autoTradeLogger.log('Binance API test request', {
          userId,
          apiUrl,
          params: JSON.stringify(params),
          timestamp: new Date().toISOString()
        });
      } catch (logError) {
        console.error('Error logging to autoTradeLogger:', logError);
        // Continue execution even if logging fails
      }
      
      try {
        // Make the actual request to Binance API
        console.log('Sending request to Binance API...');
        console.log('Request URL:', apiUrl);
        console.log('Request method: POST');
        console.log('Request headers: X-MBX-APIKEY:', settings.binanceApiKey.substring(0, 4) + '...');
        
        const response = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': settings.binanceApiKey
          }
        });
        
        console.log('Response received from Binance API');
        console.log('Response status:', response.status, response.statusText);
        
        // Get response as text first to handle potential JSON parse errors
        console.log('Reading response body as text...');
        const responseText = await response.text();
        
        if (!responseText) {
          console.log('WARNING: Response body is empty');
        } else {
          console.log('Response body received (first 100 chars):', 
            responseText.substring(0, 100) + (responseText.length > 100 ? '...' : ''));
        }
        
        let responseData;
        try {
          // Try to parse as JSON
          console.log('Attempting to parse response as JSON...');
          responseData = responseText ? JSON.parse(responseText) : null;
          
          if (!responseData) {
            console.log('WARNING: Parsed response data is null or undefined');
          } else {
            console.log('Successfully parsed JSON response');
          }
        } catch (parseError) {
          console.log('ERROR: Failed to parse response as JSON:', parseError.message);
          return res.status(500).json({
            error: 'Failed to parse Binance API response',
            details: responseText ? (responseText.substring(0, 200) + (responseText.length > 200 ? '...' : '')) : 'Empty response',
            requestDetails
          });
        }
        
        // Check for errors in the Binance API response
        if (!response.ok) {
          return res.status(response.status).json({
            error: 'Binance API error',
            details: responseData?.msg || 'Unknown error',
            code: responseData?.code || 'UNKNOWN',
            requestDetails,
            binanceResponse: responseData
          });
        }
        
        // Return success with response data and request details
        return res.status(200).json({
          success: true,
          message: 'Binance API test executed successfully',
          requestDetails,
          binanceResponse: responseData
        });
        
      } catch (fetchError) {
        // Handle network errors
        console.error('Network error when calling Binance API:', fetchError);
        return res.status(500).json({
          error: 'Network error when calling Binance API',
          details: fetchError.message,
          stack: process.env.NODE_ENV === 'development' ? fetchError.stack : undefined,
          requestDetails
        });
      }
      
    } catch (innerError) {
      console.error('Error in binance-test API inner try-catch:', innerError);
      
      return res.status(500).json({
        error: 'An unexpected error occurred',
        details: innerError.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? innerError.stack : undefined,
        timestamp: new Date().toISOString()
      });
    }
  } catch (outerError) {
    console.error('Critical error in binance-test API outer try-catch:', outerError);
    
    return res.status(500).json({
      error: 'A critical error occurred',
      details: outerError.message || 'Unknown critical error',
      stack: process.env.NODE_ENV === 'development' ? outerError.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}