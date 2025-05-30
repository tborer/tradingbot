import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Create a log object to track the API call
  const logData = {
    timestamp: new Date(),
    requestMethod: req.method,
    requestPath: '/api/cryptos/balance',
    requestHeaders: {},
    requestBody: {},
    responseStatus: 0,
    responseBody: {},
    error: null
  };

  try {
    // Get the user from the request
    const supabase = createClient(req, res);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      logData.responseStatus = 401;
      logData.error = 'Unauthorized';
      console.log('Balance API Log:', logData);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get the user's Kraken API credentials from settings
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id },
    });

    if (!settings || !settings.krakenApiKey || !settings.krakenApiSign) {
      logData.responseStatus = 400;
      logData.error = 'Kraken API credentials not configured';
      console.log('Balance API Log:', logData);
      return res.status(400).json({ error: 'Kraken API credentials not configured' });
    }

    // Create the nonce (current timestamp in milliseconds)
    const nonce = Date.now();

    // Create the request path and post data
    const path = '/0/private/Balance';
    
    // Create the payload as JSON with nonce as a number (not a string)
    const payload = JSON.stringify({
      nonce: nonce
    });

    // Create the signature according to Kraken API documentation
    // https://docs.kraken.com/rest/#section/Authentication/Headers-and-Signature
    
    // 1. Decode the base64 secret key
    const secret = Buffer.from(settings.krakenApiSign, 'base64');
    
    // 2. Create the SHA256 hash of the payload
    const sha256 = crypto.createHash('sha256')
      .update(payload)
      .digest();
    
    // 3. Create the HMAC-SHA512 of (URI path + SHA256(payload))
    // using the base64-decoded secret key
    const signature = crypto.createHmac('sha512', secret)
      .update(path + sha256)
      .digest('base64');

    // Prepare the request details for logging
    const requestDetails = {
      url: 'https://api.kraken.com' + path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'API-Key': settings.krakenApiKey.substring(0, 5) + '...',
        'API-Sign': signature.substring(0, 5) + '...'
      },
      body: payload
    };

    // Update log with request details
    logData.requestHeaders = requestDetails.headers;
    logData.requestBody = { nonce };

    // Make the request to Kraken API
    const response = await fetch('https://api.kraken.com' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'API-Key': settings.krakenApiKey,
        'API-Sign': signature
      },
      body: payload
    });

    // Log the request for debugging
    console.log('Kraken Balance API Request:', {
      path,
      nonce,
      payload,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'API-Key': '[REDACTED]',
        'API-Sign': '[REDACTED]'
      }
    });

    const responseData = await response.json();
    
    // Update log with response data
    logData.responseStatus = response.status;
    logData.responseBody = responseData;

    // Log the response for debugging
    console.log('Kraken Balance API Response:', responseData);

    // Check for errors in the Kraken API response
    if (responseData.error && responseData.error.length > 0) {
      logData.error = responseData.error[0];
      console.log('Balance API Log:', logData);
      return res.status(400).json({ error: responseData.error[0] });
    }

    // Log successful request
    console.log('Balance API Log:', logData);

    // Return the balance data
    return res.status(200).json(responseData.result);
  } catch (error) {
    console.error('Error fetching Kraken balance:', error);
    
    // Update log with error
    logData.responseStatus = 500;
    logData.error = error instanceof Error ? error.message : 'Failed to fetch Kraken balance';
    console.log('Balance API Log:', logData);
    
    return res.status(500).json({ error: 'Failed to fetch Kraken balance' });
  }
}