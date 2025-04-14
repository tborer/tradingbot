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

    const { cryptoId, action, shares, price, orderType } = req.body;

    if (!cryptoId || !action || !shares || !price) {
      return res.status(400).json({ 
        error: 'Missing required parameters: cryptoId, action, shares, price' 
      });
    }
    
    // Default to 'market' if orderType is not provided
    const effectiveOrderType = orderType || 'market';

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
      ordertype: effectiveOrderType,
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
      
      // Record the failed transaction with error details
      await prisma.cryptoTransaction.create({
        data: {
          cryptoId: crypto.id,
          action,
          shares,
          price,
          totalAmount,
          userId: user.id,
          apiRequest: JSON.stringify({
            endpoint: apiEndpoint,
            method: 'POST',
            headers: {
              'API-Key': '[REDACTED]', // Don't store actual API key
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: postData
          }, null, 2),
          apiResponse: JSON.stringify(krakenResponse, null, 2),
          logInfo: JSON.stringify({
            timestamp: new Date().toISOString(),
            orderId,
            pair,
            action,
            shares,
            price,
            totalAmount,
            status: 'failed',
            error: krakenResponse.error.join(', '),
            message: `Failed to execute ${action} order for ${shares} shares of ${crypto.symbol} at $${price}`
          }, null, 2)
        }
      });
      
      return res.status(400).json({ error: krakenResponse.error.join(', ') });
    }

    // For buy transactions, update the purchasePrice to the current price
    if (action === 'buy') {
      await prisma.crypto.update({
        where: { id: crypto.id },
        data: { purchasePrice: price }
      });
      console.log(`Updated purchasePrice for ${crypto.symbol} to ${price} on buy transaction`);
    }
    
    // Calculate total amount
    const totalAmount = shares * price;

    // Record the transaction with API request and response data for troubleshooting
    const transaction = await prisma.cryptoTransaction.create({
      data: {
        cryptoId: crypto.id,
        action,
        shares,
        price,
        totalAmount,
        userId: user.id,
        apiRequest: JSON.stringify({
          endpoint: apiEndpoint,
          method: 'POST',
          headers: {
            'API-Key': '[REDACTED]', // Don't store actual API key
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: postData
        }, null, 2),
        apiResponse: JSON.stringify(krakenResponse, null, 2),
        logInfo: JSON.stringify({
          timestamp: new Date().toISOString(),
          orderId,
          pair,
          action,
          shares,
          price,
          totalAmount,
          status: 'success',
          message: `Successfully executed ${action} order for ${shares} shares of ${crypto.symbol} at $${price}`
        }, null, 2)
      }
    });

    // Update crypto shares
    const updatedShares = action === 'buy' 
      ? crypto.shares + shares 
      : crypto.shares - shares;

    // If this is an auto order, flip the nextAction in the settings
    if (req.body.isAutoOrder) {
      // Get the current auto trade settings for this crypto
      const autoTradeSettings = await prisma.cryptoAutoTradeSettings.findFirst({
        where: { cryptoId: crypto.id }
      });
      
      if (autoTradeSettings) {
        // Flip the next action from buy to sell or vice versa
        const nextAction = autoTradeSettings.nextAction === 'buy' ? 'sell' : 'buy';
        
        // Update the settings
        await prisma.cryptoAutoTradeSettings.update({
          where: { id: autoTradeSettings.id },
          data: { nextAction }
        });
        
        console.log(`Auto trade completed successfully. Next action flipped to: ${nextAction}`);
      }
    }

    // Get current user's USD balance
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { usdBalance: true }
    });
    
    // Calculate new USD balance based on the trade
    let newUsdBalance = userData?.usdBalance || 0;
    if (action === 'buy') {
      // Subtract the total amount when buying
      newUsdBalance -= totalAmount;
    } else {
      // Add the total amount when selling
      newUsdBalance += totalAmount;
    }
    
    // Ensure balance doesn't go below zero
    newUsdBalance = Math.max(0, newUsdBalance);
    
    // Update both the crypto shares and user's USD balance
    await prisma.$transaction([
      prisma.crypto.update({
        where: { id: crypto.id },
        data: { shares: updatedShares }
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { usdBalance: newUsdBalance }
      })
    ]);

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