import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { getApiUrl } from '@/lib/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('Trade API called with method:', req.method);
    console.log('Request body:', JSON.stringify(req.body));
    
    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Trade API: Authentication error:', authError);
      
      // Create a detailed error log for troubleshooting
      try {
        await prisma.cryptoTransaction.create({
          data: {
            cryptoId: req.body.cryptoId || 'unknown',
            action: 'error',
            shares: req.body.shares || 0,
            price: 0,
            totalAmount: 0,
            userId: 'unauthorized', // We don't have a valid user ID
            logInfo: JSON.stringify({
              timestamp: new Date().toISOString(),
              method: 'trade_api',
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
    
    console.log('Trade API: User authenticated:', user.id);
    
    // Only allow POST requests
    if (req.method !== 'POST') {
      console.error('Trade API: Method not allowed:', req.method);
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Get settings but don't block trading if enableManualCryptoTrading is not explicitly set
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id },
    });
    
    // Only block if settings exist AND enableManualCryptoTrading is explicitly set to false
    if (settings && settings.enableManualCryptoTrading === false) {
      return res.status(403).json({ error: 'Manual crypto trading is not enabled. Please enable it in settings.' });
    }
    
    const { cryptoId, action, shares, orderType } = req.body;
    
    if (!cryptoId || !action || !shares) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Default to 'market' if orderType is not provided
    const effectiveOrderType = orderType || 'market';
    
    if (action !== 'buy' && action !== 'sell') {
      return res.status(400).json({ error: 'Invalid action. Must be "buy" or "sell"' });
    }
    
    if (isNaN(Number(shares)) || Number(shares) <= 0) {
      return res.status(400).json({ error: 'Shares must be a positive number' });
    }
    
    // Get the crypto
    const crypto = await prisma.crypto.findFirst({
      where: {
        id: cryptoId,
        userId: user.id,
      },
    });
    
    if (!crypto) {
      return res.status(404).json({ error: 'Crypto not found' });
    }
    
    // For sell actions, check if user has enough shares
    if (action === 'sell' && crypto.shares < Number(shares)) {
      return res.status(400).json({ error: 'Not enough shares to sell' });
    }
    
    // Get the latest price from the Kraken WebSocket data
    // If we have a lastPrice stored, use that, otherwise fall back to purchasePrice
    const currentPrice = crypto.lastPrice || crypto.purchasePrice;
    const totalAmount = currentPrice * Number(shares);
    
    // Execute the order using the Kraken API
    try {
      // Call the execute-order API endpoint to use the Kraken API
      // Use absolute URL with proper base URL for server-side API calls
      const apiUrl = getApiUrl('/api/cryptos/execute-order');
      console.log('Calling execute-order API at:', apiUrl);
      
      // Pass the cookies from the original request to maintain authentication
      const cookies = req.headers.cookie;
      
      const executeOrderResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookies || '', // Forward cookies to maintain authentication
        },
        body: JSON.stringify({
          cryptoId: crypto.id,
          action,
          shares: Number(shares),
          price: currentPrice,
          orderType: effectiveOrderType,
          isAutoOrder: req.body.isAutoOrder || false
        })
      }).catch(error => {
        console.error('Network error calling execute-order API:', error);
        throw new Error(`Network error: ${error.message}`);
      });

      if (!executeOrderResponse) {
        throw new Error('No response received from execute-order API');
      }

      const executeOrderResult = await executeOrderResponse.json().catch(error => {
        console.error('Error parsing JSON response from execute-order API:', error);
        throw new Error('Invalid response format from execute-order API');
      });

      if (!executeOrderResponse.ok) {
        // The execute-order endpoint already logs the failed transaction
        return res.status(400).json({ 
          error: executeOrderResult.error || 'Failed to execute order via Kraken API',
          details: executeOrderResult
        });
      }

      // Return the transaction from the execute-order API
      return res.status(200).json({
        transaction: executeOrderResult.transaction,
        newShares: executeOrderResult.transaction.shares,
        message: executeOrderResult.message,
        krakenOrderId: executeOrderResult.krakenOrderId
      });
    } catch (error) {
      console.error('Error executing order via Kraken API:', error);
      
      // Log the failed transaction with error details
      const transaction = await prisma.cryptoTransaction.create({
        data: {
          cryptoId: crypto.id,
          action: 'error', // Change action to 'error' for failed transactions
          shares: Number(shares),
          price: currentPrice,
          totalAmount,
          userId: user.id,
          logInfo: JSON.stringify({
            timestamp: new Date().toISOString(),
            method: 'trade_api_error',
            requestedAction: action, // Store the originally requested action
            shares: Number(shares),
            price: currentPrice,
            totalAmount,
            status: 'failed',
            error: error.message || 'Unknown error',
            message: `Failed to execute ${action} order for ${shares} shares of ${crypto.symbol} at $${currentPrice}`
          }, null, 2)
        },
      });
      
      // Return error to client
      return res.status(500).json({ 
        error: 'Failed to execute order via Kraken API', 
        details: error.message,
        transaction // Return the transaction record for the client
      });
    }
    

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}