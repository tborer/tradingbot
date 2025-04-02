import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import crypto from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the user from the request
    const supabase = createClient(req, res);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get the user's Kraken API credentials from settings
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id },
    });

    if (!settings || !settings.krakenApiKey || !settings.krakenApiSign) {
      return res.status(400).json({ error: 'Kraken API credentials not configured' });
    }

    // Create the nonce (current timestamp in milliseconds)
    const nonce = Date.now().toString();

    // Create the request path and post data
    const path = '/0/private/Balance';
    const postData = `nonce=${nonce}`;

    // Create the signature
    // 1. Create the message
    const message = crypto.createHash('sha256')
      .update(nonce + postData)
      .digest('binary');

    // 2. Create the signature
    const secret = Buffer.from(settings.krakenApiSign, 'base64');
    const signature = crypto.createHmac('sha512', secret)
      .update(path + message, 'binary')
      .digest('base64');

    // Make the request to Kraken API
    const response = await fetch('https://api.kraken.com' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'API-Key': settings.krakenApiKey,
        'API-Sign': signature
      },
      body: postData
    });

    // Log the request and response for debugging
    console.log('Kraken Balance API Request:', {
      path,
      nonce,
      postData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'API-Key': '[REDACTED]',
        'API-Sign': '[REDACTED]'
      }
    });

    const responseData = await response.json();
    console.log('Kraken Balance API Response:', responseData);

    // Check for errors in the Kraken API response
    if (responseData.error && responseData.error.length > 0) {
      return res.status(400).json({ error: responseData.error[0] });
    }

    // Return the balance data
    return res.status(200).json(responseData.result);
  } catch (error) {
    console.error('Error fetching Kraken balance:', error);
    return res.status(500).json({ error: 'Failed to fetch Kraken balance' });
  }
}