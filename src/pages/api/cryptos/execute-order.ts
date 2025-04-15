import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { KrakenOrderRequest, KrakenOrderResponse, getKrakenTradingPair, generateOrderId, generateNonce } from '@/lib/kraken';
// Use dynamic import for Node.js crypto module to ensure it's only loaded in server context
import { createHash, createHmac } from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('Execute Order API called with method:', req.method);
  console.log('Request body:', JSON.stringify(req.body));
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    console.error('Execute Order API: Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);
  
  // Check if user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('Execute Order API: Authentication error:', authError);
    
    // Create a detailed error log for troubleshooting
    try {
      await prisma.cryptoTransaction.create({
        data: {
          cryptoId: req.body.cryptoId || 'unknown',
          action: 'error',
          shares: req.body.shares || 0,
          price: req.body.price || 0,
          totalAmount: (req.body.shares || 0) * (req.body.price || 0),
          userId: 'unauthorized', // We don't have a valid user ID
          logInfo: JSON.stringify({
            timestamp: new Date().toISOString(),
            method: 'execute_order_api',
            requestedAction: req.body.action || 'unknown',
            status: 'failed',
            error: 'Authentication failed: ' + (authError?.message || 'User not authenticated'),
            message: 'Failed to authenticate user for crypto trade',
            requestBody: req.body,
            authErrorDetails: authError || 'No user found'
          }, null, 2)
        },
      }).catch(err => {
        console.error('Failed to log authentication error to database:', err);
      });
    } catch (logError) {
      console.error('Error creating authentication error log:', logError);
    }
    
    return res.status(401).json({ 
      error: 'Unauthorized: You must be logged in to execute trades',
      details: authError?.message || 'User authentication failed'
    });
  }

  try {
    // Get user settings to retrieve API credentials
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id },
    });

    if (!settings || !settings.krakenApiKey || !settings.krakenApiSign) {
      console.error('Execute Order API: Missing Kraken API credentials for user:', user.id);
      
      // Log the error to the transaction history
      const { cryptoId, action, shares, price } = req.body;
      const totalAmount = (shares || 0) * (price || 0);
      
      // Create a transaction record for the error
      const transaction = await prisma.cryptoTransaction.create({
        data: {
          cryptoId: cryptoId || 'unknown',
          action: 'error',
          shares: shares || 0,
          price: price || 0,
          totalAmount,
          userId: user.id,
          logInfo: JSON.stringify({
            timestamp: new Date().toISOString(),
            method: 'execute_order_api',
            requestedAction: action || 'unknown',
            status: 'failed',
            error: 'Kraken API credentials missing',
            message: 'Failed to execute trade: Kraken API credentials not found in settings',
            missingCredentials: {
              krakenApiKey: !settings?.krakenApiKey,
              krakenApiSign: !settings?.krakenApiSign
            }
          }, null, 2)
        },
      });
      
      return res.status(400).json({ 
        error: 'Kraken API credentials not found. Please configure them in settings.',
        transaction // Return the transaction record for the client
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
    
    // For sell actions, check if user has enough shares in the local database
    if (action === 'sell' && crypto.shares < Number(shares)) {
      return res.status(400).json({ error: `Not enough shares to sell. You only have ${crypto.shares.toFixed(8)} shares available.` });
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
    console.log(`Executing ${action} order for ${shares} shares of ${crypto.symbol} at $${price}`);
    console.log('Kraken API endpoint:', apiEndpoint);
    console.log('Kraken API request data:', { pair, ordertype: effectiveOrderType, type: action, volume: shares.toString() });
    
    let response;
    try {
      response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'API-Key': settings.krakenApiKey,
          'API-Sign': hmac,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData
      });
    } catch (fetchError) {
      console.error('Network error calling Kraken API:', fetchError);
      throw new Error(`Network error calling Kraken API: ${fetchError.message}`);
    }
    
    if (!response) {
      throw new Error('No response received from Kraken API');
    }
    
    if (!response.ok && response.status !== 200) {
      console.error(`Kraken API HTTP error: ${response.status} ${response.statusText}`);
      throw new Error(`Kraken API HTTP error: ${response.status} ${response.statusText}`);
    }
    
    let krakenResponse: KrakenOrderResponse;
    try {
      krakenResponse = await response.json();
    } catch (jsonError) {
      console.error('Error parsing Kraken API response:', jsonError);
      throw new Error(`Invalid response format from Kraken API: ${jsonError.message}`);
    }

    if (krakenResponse.error && krakenResponse.error.length > 0) {
      console.error('Kraken API error:', krakenResponse.error);
      
      // Calculate total amount
      const totalAmount = shares * price;
      
      // Check for specific error types to provide better error messages
      const errorString = krakenResponse.error.join(', ');
      let errorType = 'unknown';
      let userFriendlyMessage = `Failed to execute ${action} order for ${shares} shares of ${crypto.symbol} at $${price}`;
      
      // Identify common Kraken API errors
      if (errorString.includes('Invalid API key')) {
        errorType = 'invalid_api_key';
        userFriendlyMessage = 'Your Kraken API key appears to be invalid. Please check your settings and update your API credentials.';
      } else if (errorString.includes('Invalid signature')) {
        errorType = 'invalid_signature';
        userFriendlyMessage = 'Your Kraken API signature is invalid. Please check your settings and update your API credentials.';
      } else if (errorString.includes('Permission denied')) {
        errorType = 'permission_denied';
        userFriendlyMessage = 'Your Kraken API key does not have permission to perform this action. Please ensure your API key has trading permissions.';
      } else if (errorString.includes('Insufficient funds')) {
        errorType = 'insufficient_funds';
        userFriendlyMessage = 'You have insufficient funds in your Kraken account to complete this trade.';
      } else if (errorString.includes('Rate limit exceeded')) {
        errorType = 'rate_limit';
        userFriendlyMessage = 'Rate limit exceeded for Kraken API. Please try again in a few minutes.';
      }
      
      // Record the failed transaction with detailed error information
      const transaction = await prisma.cryptoTransaction.create({
        data: {
          cryptoId: crypto.id,
          action: 'error', // Change action to 'error' for failed transactions
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
            requestedAction: action, // Store the originally requested action
            shares,
            price,
            totalAmount,
            status: 'failed',
            errorType,
            error: krakenResponse.error.join(', '),
            message: userFriendlyMessage,
            details: {
              action,
              orderType: effectiveOrderType,
              symbol: crypto.symbol,
              krakenPair: pair
            }
          }, null, 2)
        }
      });
      
      return res.status(400).json({ 
        error: userFriendlyMessage,
        details: krakenResponse.error.join(', '),
        errorType,
        transaction // Return the transaction record for the client
      });
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
    console.error('Execute Order API error:', error);
    
    // Try to extract useful information from the error
    const errorMessage = error.message || 'Unknown error';
    const errorStack = error.stack || '';
    
    // Try to create a transaction record for the error
    try {
      const { cryptoId, action, shares, price } = req.body;
      
      if (cryptoId && user) {
        // Get crypto details if possible
        const crypto = await prisma.crypto.findFirst({
          where: {
            id: cryptoId,
            userId: user.id
          }
        }).catch(() => null);
        
        if (crypto) {
          const totalAmount = (shares || 0) * (price || 0);
          
          // Create a transaction record for the error
          const transaction = await prisma.cryptoTransaction.create({
            data: {
              cryptoId,
              action: 'error',
              shares: shares || 0,
              price: price || 0,
              totalAmount,
              userId: user.id,
              logInfo: JSON.stringify({
                timestamp: new Date().toISOString(),
                method: 'execute_order_api',
                requestedAction: action || 'unknown',
                status: 'failed',
                error: errorMessage,
                errorStack: errorStack.split('\n').slice(0, 5).join('\n'), // First 5 lines of stack trace
                message: `Internal server error: ${errorMessage}`,
                requestBody: req.body
              }, null, 2)
            },
          });
          
          return res.status(500).json({ 
            error: 'Failed to execute trade due to a server error', 
            details: errorMessage,
            transaction // Return the transaction record for the client
          });
        }
      }
    } catch (logError) {
      console.error('Error creating error log transaction:', logError);
    }
    
    // Fallback if we couldn't create a transaction record
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: errorMessage
    });
  }
}