import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { KrakenOrderRequest, KrakenOrderResponse, getKrakenTradingPair, generateOrderId, generateNonce } from '@/lib/kraken';
// Use dynamic import for Node.js crypto module to ensure it's only loaded in server context
import { createHash, createHmac } from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  
  // Check if user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('Authentication error:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get user settings to retrieve API credentials
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id },
    });

    if (!settings || !settings.krakenApiKey || !settings.krakenApiSign) {
      return res.status(400).json({ 
        error: 'Kraken API credentials not found. Please configure them in settings.' 
      });
    }
    
    // Check if auto crypto trading is enabled for auto orders
    if (req.body.isAutoOrder && (!settings.enableAutoCryptoTrading)) {
      return res.status(403).json({ 
        error: 'Auto crypto trading is not enabled. Please enable it in settings.' 
      });
    }

    const { cryptoId, action, shares, price } = req.body;

    if (!cryptoId || !action || !shares || !price) {
      return res.status(400).json({ 
        error: 'Missing required parameters: cryptoId, action, shares, price' 
      });
    }

    // Validate action
    if (action !== 'buy' && action !== 'sell') {
      return res.status(400).json({ error: 'Action must be either "buy" or "sell"' });
    }

    // Get crypto details
    const crypto = await prisma.crypto.findFirst({
      where: {
        id: cryptoId,
        userId: user.id
      }
    });

    if (!crypto) {
      return res.status(404).json({ error: 'Crypto not found' });
    }

    // Prepare Kraken order request
    const nonce = generateNonce();
    const orderId = generateOrderId();
    const pair = getKrakenTradingPair(crypto.symbol);

    const orderRequest: KrakenOrderRequest = {
      nonce,
      ordertype: 'limit',
      type: action as 'buy' | 'sell',
      volume: shares.toString(),
      pair,
      price: price.toString(),
      cl_ord_id: orderId
    };

    // Kraken API endpoint
    const apiEndpoint = 'https://api.kraken.com/0/private/AddOrder';

    // Create the API signature
    const path = '/0/private/AddOrder';
    const postData = new URLSearchParams(orderRequest as any).toString();
    
    // Create signature
    const message = nonce + postData;
    const secret = Buffer.from(settings.krakenApiSign, 'base64');
    const hash = createHash('sha256').update(nonce + postData, 'utf8').digest('binary');
    const hmac = createHmac('sha512', secret).update(path + hash, 'binary').digest('base64');

    // Execute the order
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'API-Key': settings.krakenApiKey,
        'API-Sign': hmac,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: postData
    });

    const krakenResponse: KrakenOrderResponse = await response.json();

    if (krakenResponse.error && krakenResponse.error.length > 0) {
      console.error('Kraken API error:', krakenResponse.error);
      return res.status(400).json({ error: krakenResponse.error.join(', ') });
    }

    // Calculate total amount
    const totalAmount = shares * price;

    // Record the transaction
    const transaction = await prisma.cryptoTransaction.create({
      data: {
        cryptoId: crypto.id,
        action,
        shares,
        price,
        totalAmount,
        userId: user.id
      }
    });

    // Update crypto shares
    const updatedShares = action === 'buy' 
      ? crypto.shares + shares 
      : crypto.shares - shares;

    await prisma.crypto.update({
      where: { id: crypto.id },
      data: { shares: updatedShares }
    });

    return res.status(200).json({
      success: true,
      transaction,
      krakenOrderId: krakenResponse.result.txid[0],
      message: `Successfully ${action === 'buy' ? 'bought' : 'sold'} ${shares} shares of ${crypto.symbol} at $${price}`
    });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}