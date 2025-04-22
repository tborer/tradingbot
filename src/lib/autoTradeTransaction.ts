import prisma from '@/lib/prisma';
import { KrakenOrderRequest, KrakenOrderResponse, getKrakenTradingPair, generateOrderId, generateNonce } from '@/lib/kraken';
import { createHash, createHmac } from 'crypto';

/**
 * Creates a transaction record for an auto-trade
 * This function ensures that auto-trades are properly recorded in the transaction history
 */
export async function createAutoTradeTransaction(
  userId: string,
  cryptoId: string,
  symbol: string,
  action: 'buy' | 'sell',
  shares: number,
  price: number,
  krakenOrderId?: string,
  apiRequest?: string,
  apiResponse?: string
) {
  try {
    console.log(`Creating auto-trade transaction record for ${action} of ${shares} shares of ${symbol} at $${price}`);
    
    // Calculate total amount
    const totalAmount = shares * price;
    
    // Create a transaction record
    const transaction = await prisma.cryptoTransaction.create({
      data: {
        cryptoId,
        action,
        shares,
        price,
        totalAmount,
        userId,
        apiRequest: apiRequest || JSON.stringify({
          note: 'Auto-trade transaction - API request details not available'
        }),
        apiResponse: apiResponse || JSON.stringify({
          note: 'Auto-trade transaction - API response details not available',
          krakenOrderId: krakenOrderId || 'unknown'
        }),
        logInfo: JSON.stringify({
          timestamp: new Date().toISOString(),
          orderId: krakenOrderId || generateOrderId(),
          pair: getKrakenTradingPair(symbol),
          action,
          shares,
          price,
          totalAmount,
          status: 'success',
          isAutoOrder: true,
          message: `Successfully executed auto ${action} order for ${shares} shares of ${symbol} at $${price}`
        }, null, 2)
      }
    });
    
    console.log(`Auto-trade transaction created with ID: ${transaction.id} for ${symbol} ${action}`);
    
    // Dispatch a custom event to notify the UI of the transaction
    // This will be caught by the frontend to refresh the transaction history
    try {
      // Create a server-side event that will be sent to the client
      // This is a workaround since we can't directly dispatch browser events from the server
      console.log(`Dispatching transaction event for ${symbol} ${action}`);
      
      // In a real implementation, we would use a WebSocket or Server-Sent Events
      // For now, we'll rely on the regular polling in the UI
    } catch (eventError) {
      console.log('Could not dispatch transaction event:', eventError);
    }
    
    return transaction;
  } catch (error) {
    console.error('Error creating auto-trade transaction:', error);
    throw error;
  }
}

/**
 * Executes a Kraken order and creates a transaction record
 * This function handles both the API call and transaction creation in one place
 */
export async function executeKrakenOrderAndCreateTransaction(
  userId: string,
  cryptoId: string,
  symbol: string,
  action: 'buy' | 'sell',
  shares: number,
  price: number,
  orderType: string = 'market',
  krakenApiKey: string,
  krakenApiSign: string
) {
  try {
    // Prepare Kraken order request
    const nonce = generateNonce();
    const orderId = generateOrderId();
    const pair = getKrakenTradingPair(symbol);

    const orderRequest: KrakenOrderRequest = {
      nonce,
      ordertype: orderType,
      type: action,
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
    const secret = Buffer.from(krakenApiSign, 'base64');
    const hash = createHash('sha256').update(nonce + postData, 'utf8').digest('binary');
    const hmac = createHmac('sha512', secret).update(path + hash, 'binary').digest('base64');

    console.log(`Executing auto ${action} order for ${shares} shares of ${symbol} at $${price}`);
    
    // Prepare API request details for logging
    const apiRequestDetails = {
      endpoint: apiEndpoint,
      method: 'POST',
      headers: {
        'API-Key': '[REDACTED]',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: postData
    };
    
    let krakenResponse;
    let responseText;
    
    try {
      // Execute the order
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'API-Key': krakenApiKey,
          'API-Sign': hmac,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData
      });

      responseText = await response.text();
      
      try {
        krakenResponse = JSON.parse(responseText) as KrakenOrderResponse;
      } catch (parseError) {
        console.error('Error parsing Kraken API response:', parseError);
        console.log('Raw response:', responseText);
        throw new Error(`Failed to parse Kraken API response: ${parseError.message}`);
      }

      if (krakenResponse.error && krakenResponse.error.length > 0) {
        throw new Error(`Kraken API error: ${krakenResponse.error.join(', ')}`);
      }
      
      if (!krakenResponse.result || !krakenResponse.result.txid || !krakenResponse.result.txid[0]) {
        throw new Error('Invalid Kraken API response: Missing transaction ID');
      }
    } catch (apiError) {
      console.error('Error calling Kraken API:', apiError);
      
      // Create a transaction record for the failed trade attempt
      // This ensures we have a record even when the API call fails
      await createAutoTradeTransaction(
        userId,
        cryptoId,
        symbol,
        action,
        shares,
        price,
        'failed-' + orderId,
        JSON.stringify(apiRequestDetails, null, 2),
        JSON.stringify({
          error: apiError.message,
          rawResponse: responseText || 'No response received'
        }, null, 2)
      );
      
      return {
        success: false,
        error: `Failed to execute Kraken order: ${apiError.message}`,
        krakenOrderId: null
      };
    }

    // Create a transaction record for the successful trade
    const transaction = await createAutoTradeTransaction(
      userId,
      cryptoId,
      symbol,
      action,
      shares,
      price,
      krakenResponse.result.txid[0],
      JSON.stringify(apiRequestDetails, null, 2),
      JSON.stringify(krakenResponse, null, 2)
    );

    // Update the crypto's shares, purchase price, and USD balance in the database
    try {
      // Calculate total amount for the transaction
      const totalAmount = shares * price;
      
      if (action === 'buy') {
        // For buy: update crypto shares and purchase price, and decrement USD balance
        await prisma.$transaction([
          // Update crypto record
          prisma.crypto.update({
            where: { id: cryptoId },
            data: {
              shares: { increment: shares },
              purchasePrice: price, // Update purchase price to the new buy price
              lastPrice: price
            }
          }),
          // Decrement USD balance for purchases
          prisma.user.update({
            where: { id: userId },
            data: {
              usdBalance: {
                decrement: totalAmount
              }
            }
          })
        ]);
        console.log(`Updated crypto record for ${symbol} after ${action} transaction. Purchase price updated to ${price}. USD balance decreased by $${totalAmount.toFixed(2)}`);
      } else { // sell
        // For sell: first verify we have enough shares to sell
        const currentCrypto = await prisma.crypto.findUnique({
          where: { id: cryptoId },
          select: { shares: true }
        });
        
        if (!currentCrypto || currentCrypto.shares < shares) {
          throw new Error(`Insufficient shares for ${symbol}. Attempted to sell ${shares} but only have ${currentCrypto?.shares || 0}`);
        }
        
        // For sell: update crypto shares and purchase price, and increment USD balance
        await prisma.$transaction([
          // Update crypto record
          prisma.crypto.update({
            where: { id: cryptoId },
            data: {
              shares: { decrement: shares },
              purchasePrice: price, // Update purchase price to the new sell price
              lastPrice: price
            }
          }),
          // Increment USD balance for sales
          prisma.user.update({
            where: { id: userId },
            data: {
              usdBalance: {
                increment: totalAmount
              }
            }
          })
        ]);
        console.log(`Updated crypto record for ${symbol} after ${action} transaction. Purchase price updated to ${price}. USD balance increased by $${totalAmount.toFixed(2)}`);
      }
    } catch (updateError) {
      console.error(`Failed to update crypto record and USD balance after transaction:`, updateError);
      // Continue since the transaction was already created
    }

    return {
      success: true,
      transaction,
      krakenOrderId: krakenResponse.result.txid[0],
      message: `Successfully ${action === 'buy' ? 'bought' : 'sold'} ${shares} shares of ${symbol} at $${price}`
    };
  } catch (error) {
    console.error('Error executing Kraken order and creating transaction:', error);
    
    // Return a structured error response instead of throwing
    return {
      success: false,
      error: error.message || 'Unknown error during order execution',
      krakenOrderId: null
    };
  }
}