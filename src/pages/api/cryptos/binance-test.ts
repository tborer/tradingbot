import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { autoTradeLogger } from '@/lib/autoTradeLogger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the user from Supabase auth
    const supabase = createClient({ req, res });
    const { data, error: authError } = await supabase.auth.getUser();
    
    if (authError || !data || !data.user) {
      return res.status(401).json({ error: 'Authentication required for API test' });
    }
    
    const userId = data.user.id;
    
    // Extract parameters from request body
    const { apiUrl, params } = req.body;
    
    if (!apiUrl) {
      return res.status(400).json({ error: 'API URL is required' });
    }
    
    if (!params || typeof params !== 'object') {
      return res.status(400).json({ error: 'Valid parameters object is required' });
    }
    
    // Get Binance API credentials from user settings
    const settings = await prisma.settings.findUnique({
      where: { userId }
    });
    
    if (!settings || !settings.binanceApiKey || !settings.binanceApiSecret) {
      return res.status(400).json({ 
        error: 'Binance API credentials not configured',
        details: 'Please configure your Binance API key and secret in Settings'
      });
    }
    
    // Generate query string from parameters
    const queryString = Object.entries(params)
      .map(([key, value]) => {
        // Ensure value is never undefined or null before encoding
        const safeValue = value === undefined || value === null ? '' : String(value);
        return `${key}=${encodeURIComponent(safeValue)}`;
      })
      .join('&');
    console.log('queryString built:', queryString);
    
    // Generate signature using HMAC SHA256
    const signature = crypto
      .createHmac('sha256', settings.binanceApiSecret)
      .update(queryString)
      .digest('hex');
    console.log('signature generated:', signature);
    
    // Create the full URL with query string and signature
    const fullUrl = `${apiUrl}?${queryString}&signature=${signature}`;
    
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
    console.log('requestDetails built:', requestDetails);
    
    // Log the request for debugging
    autoTradeLogger.log('Binance API test request', {
      userId,
      apiUrl,
      params: JSON.stringify(params),
      timestamp: new Date().toISOString()
    });
    
    try {
      // Make the actual request to Binance API
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': settings.binanceApiKey
        }
      });
      
      // Get response as text first to handle potential JSON parse errors
      const responseText = await response.text();
      
      let responseData;
      try {
        // Try to parse as JSON
        responseData = responseText ? JSON.parse(responseText) : null;
      } catch (parseError) {
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
      return res.status(500).json({
        error: 'Network error when calling Binance API',
        details: fetchError.message,
        requestDetails
      });
    }
    
  } catch (error) {
    console.error('Error in binance-test API:', error);
    
    return res.status(500).json({
      error: 'An unexpected error occurred',
      details: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}