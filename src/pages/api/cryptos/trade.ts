import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { getApiUrl } from '@/lib/utils';
import { autoTradeLogger } from '@/lib/autoTradeLogger';

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
    
    const { cryptoId, action, shares, orderType, totalValue, purchaseMethod, microProcessing, testMode } = req.body;
    
    // Determine if we're buying by total value
    const isBuyingByTotalValue = purchaseMethod === 'totalValue' && totalValue && totalValue > 0;
    
    // For buy orders, we need either shares or totalValue
    if (!cryptoId || !action) {
      return res.status(400).json({ error: 'Missing required fields: cryptoId and action' });
    }
    
    // For buy orders, we need either shares or totalValue
    if (action === 'buy' && !isBuyingByTotalValue && (!shares || Number(shares) <= 0)) {
      return res.status(400).json({ error: 'For buy orders, you must provide either valid shares or totalValue' });
    }
    
    // For sell orders, shares is required
    if (action === 'sell' && (!shares || Number(shares) <= 0)) {
      return res.status(400).json({ error: 'For sell orders, you must provide valid shares' });
    }
    
    // Default to 'market' if orderType is not provided
    const effectiveOrderType = orderType || 'market';
    
    if (action !== 'buy' && action !== 'sell') {
      return res.status(400).json({ error: 'Invalid action. Must be "buy" or "sell"' });
    }
    
    // Validate shares if not buying by total value
    if (!isBuyingByTotalValue && (isNaN(Number(shares)) || Number(shares) <= 0)) {
      return res.status(400).json({ error: 'Shares must be a positive number' });
    }
    
    // Validate totalValue if buying by total value
    if (isBuyingByTotalValue && (isNaN(Number(totalValue)) || Number(totalValue) <= 0)) {
      return res.status(400).json({ error: 'Total value must be a positive number' });
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
    
    // For sell actions, check if user has enough shares in the local database
    if (action === 'sell' && crypto.shares < Number(shares)) {
      return res.status(400).json({ error: `Not enough shares to sell. You only have ${crypto.shares.toFixed(8)} shares available.` });
    }
    
    // Get the latest price from the Kraken WebSocket data
    // If we have a lastPrice stored, use that, otherwise fall back to purchasePrice
    const currentPrice = crypto.lastPrice || crypto.purchasePrice;
    
    // Calculate shares to trade if buying by total value
    let sharesToTrade = Number(shares);
    if (isBuyingByTotalValue && action === 'buy') {
      sharesToTrade = Number(totalValue) / currentPrice;
      console.log(`Buying by total value: $${totalValue} at price $${currentPrice} = ${sharesToTrade} shares`);
    }
    
    const totalAmount = currentPrice * sharesToTrade;
    
    console.log(`Using current price for ${action}: $${currentPrice} (lastPrice: ${crypto.lastPrice}, purchasePrice: ${crypto.purchasePrice})`);
    
    // Log micro processing trades
    if (microProcessing) {
      autoTradeLogger.log(`Micro processing ${action}: ${sharesToTrade} shares of ${crypto.symbol} at $${currentPrice}. Total: $${totalAmount.toFixed(2)}`);
    }
    
    // Determine which trading platform to use
    const tradingPlatform = req.body.tradingPlatform || 'kraken';
    console.log(`Using trading platform: ${tradingPlatform}`);
    
    try {
      // Determine which API endpoint to call based on the trading platform
      let apiUrl;
      if (tradingPlatform.toLowerCase() === 'binance') {
        apiUrl = getApiUrl('/api/cryptos/binance-trade');
        console.log('Using Binance trading API');
      } else {
        apiUrl = getApiUrl('/api/cryptos/execute-order'); // Default to Kraken
        console.log('Using Kraken trading API');
      }
      
      console.log('Calling trading API at:', apiUrl);
      
      // Pass the cookies from the original request to maintain authentication
      const cookies = req.headers.cookie;
      
      // Get the authorization header from the request
      const authHeader = req.headers.authorization;
      
      // Prepare headers with both cookie and authorization
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Add cookie header if available
      if (cookies) {
        headers['Cookie'] = cookies;
      }
      
      // Add authorization header if available
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
      
      const executeOrderResponse = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cryptoId: crypto.id,
          action,
          shares: sharesToTrade,
          price: currentPrice,
          orderType: effectiveOrderType,
          isAutoOrder: req.body.isAutoOrder || false,
          microProcessing: microProcessing || false,
          totalValue: isBuyingByTotalValue ? Number(totalValue) : undefined,
          purchaseMethod: isBuyingByTotalValue ? 'totalValue' : 'shares',
          testMode: testMode === true // Explicitly pass testMode parameter
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

      // If this is a micro processing trade, update the micro processing settings
      if (microProcessing) {
        try {
          // Update the micro processing settings based on the action
          if (action === 'buy') {
            await prisma.microProcessingSettings.update({
              where: { cryptoId: crypto.id },
              data: {
                lastBuyPrice: currentPrice,
                lastBuyShares: sharesToTrade,
                lastBuyTimestamp: new Date(),
                processingStatus: 'selling'
              }
            });
            
            autoTradeLogger.log(`Updated micro processing settings for ${crypto.symbol} after buy: lastBuyPrice=${currentPrice}, lastBuyShares=${sharesToTrade}, status=selling`);
          } else if (action === 'sell') {
            await prisma.microProcessingSettings.update({
              where: { cryptoId: crypto.id },
              data: {
                lastBuyPrice: null,
                lastBuyShares: null,
                lastBuyTimestamp: null,
                processingStatus: 'idle'
              }
            });
            
            autoTradeLogger.log(`Reset micro processing settings for ${crypto.symbol} after sell: status=idle`);
          }
        } catch (settingsError) {
          console.error('Error updating micro processing settings:', settingsError);
          // Don't fail the transaction if settings update fails
        }
      }
      
      // Return the transaction from the execute-order API
      return res.status(200).json({
        transaction: executeOrderResult.transaction,
        newShares: executeOrderResult.transaction.shares,
        message: executeOrderResult.message,
        krakenOrderId: executeOrderResult.krakenOrderId,
        microProcessing: microProcessing || false
      });
    } catch (error) {
      console.error('Error executing order via Kraken API:', error);
      
      // Log the failed transaction with error details
      // Use the current price for the transaction record
      const transactionPrice = currentPrice;
      const transactionTotalAmount = sharesToTrade * transactionPrice;
      
      const transaction = await prisma.cryptoTransaction.create({
        data: {
          cryptoId: crypto.id,
          action: 'error', // Change action to 'error' for failed transactions
          shares: sharesToTrade,
          price: transactionPrice,
          totalAmount: transactionTotalAmount,
          userId: user.id,
          logInfo: JSON.stringify({
            timestamp: new Date().toISOString(),
            method: 'trade_api_error',
            requestedAction: action, // Store the originally requested action
            shares: sharesToTrade,
            price: transactionPrice,
            totalAmount: transactionTotalAmount,
            status: 'failed',
            error: error.message || 'Unknown error',
            message: `Failed to execute ${action} order for ${sharesToTrade} shares of ${crypto.symbol} at $${transactionPrice}`
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