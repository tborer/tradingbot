import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { autoTradeLogger } from '@/lib/autoTradeLogger';
import { 
  executeBinanceMarketBuy, 
  executeBinanceMarketSell,
  executeBinanceLimitBuy,
  executeBinanceLimitSell
} from '@/lib/binanceTradeApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the user from Supabase auth
    const supabase = createClient({ req, res });
    const { data } = await supabase.auth.getUser();
    
    if (!data || !data.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = data.user;
    
    // Extract request body
    const { 
      cryptoId, 
      action, 
      quantity, 
      price, 
      orderType = 'MARKET',
      testMode = false 
    } = req.body;
    
    // Validate required parameters
    if (!cryptoId) {
      return res.status(400).json({ error: 'Missing cryptoId parameter' });
    }
    
    if (!action || !['buy', 'sell'].includes(action.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid action parameter. Must be "buy" or "sell"' });
    }
    
    if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) {
      return res.status(400).json({ error: 'Invalid quantity parameter. Must be a positive number' });
    }
    
    // For limit orders, price is required
    if (orderType.toUpperCase() === 'LIMIT' && (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0)) {
      return res.status(400).json({ error: 'Invalid price parameter. Must be a positive number for limit orders' });
    }
    
    // Check if the crypto belongs to the user
    const crypto = await prisma.crypto.findFirst({
      where: {
        id: cryptoId,
        userId: user.id
      }
    });
    
    if (!crypto) {
      return res.status(404).json({ error: 'Crypto not found' });
    }
    
    // Log the trade request
    autoTradeLogger.log(`Binance trade request: ${action} ${quantity} ${crypto.symbol} at ${price || 'market price'} (${orderType})`);
    
    // Execute the trade based on action and order type
    let tradeResult;
    const parsedQuantity = parseFloat(quantity);
    const parsedPrice = price ? parseFloat(price) : undefined;
    
    try {
      if (action.toLowerCase() === 'buy') {
        if (orderType.toUpperCase() === 'MARKET') {
          tradeResult = await executeBinanceMarketBuy(user.id, crypto.symbol, parsedQuantity, testMode);
        } else if (orderType.toUpperCase() === 'LIMIT' && parsedPrice) {
          tradeResult = await executeBinanceLimitBuy(user.id, crypto.symbol, parsedQuantity, parsedPrice, testMode);
        } else {
          return res.status(400).json({ error: 'Invalid order type or missing price for limit order' });
        }
      } else { // sell
        if (orderType.toUpperCase() === 'MARKET') {
          tradeResult = await executeBinanceMarketSell(user.id, crypto.symbol, parsedQuantity, testMode);
        } else if (orderType.toUpperCase() === 'LIMIT' && parsedPrice) {
          tradeResult = await executeBinanceLimitSell(user.id, crypto.symbol, parsedQuantity, parsedPrice, testMode);
        } else {
          return res.status(400).json({ error: 'Invalid order type or missing price for limit order' });
        }
      }
    } catch (error) {
      autoTradeLogger.log(`Binance trade error: ${error.message}`);
      return res.status(500).json({ 
        error: 'Failed to execute Binance trade', 
        details: error.message 
      });
    }
    
    // Create a transaction record
    try {
      // Calculate total amount based on the trade result
      let totalAmount = 0;
      let executedPrice = 0;
      
      if (tradeResult.fills && tradeResult.fills.length > 0) {
        // Calculate weighted average price from fills
        let totalQty = 0;
        let totalValue = 0;
        
        for (const fill of tradeResult.fills) {
          const fillQty = parseFloat(fill.qty);
          const fillPrice = parseFloat(fill.price);
          totalQty += fillQty;
          totalValue += fillQty * fillPrice;
        }
        
        executedPrice = totalValue / totalQty;
        totalAmount = totalValue;
      } else if (tradeResult.price && tradeResult.executedQty) {
        // Use price and executedQty if available
        executedPrice = parseFloat(tradeResult.price);
        const executedQty = parseFloat(tradeResult.executedQty);
        totalAmount = executedPrice * executedQty;
      } else {
        // Fallback to estimated calculation
        executedPrice = parsedPrice || crypto.lastPrice || 0;
        totalAmount = executedPrice * parsedQuantity;
      }
      
      // Create transaction record
      const transaction = await prisma.cryptoTransaction.create({
        data: {
          cryptoId: crypto.id,
          action: testMode ? `test_${action.toLowerCase()}` : action.toLowerCase(),
          shares: parsedQuantity,
          price: executedPrice,
          totalAmount,
          userId: user.id,
          apiRequest: JSON.stringify({
            action,
            orderType,
            quantity: parsedQuantity,
            price: parsedPrice,
            symbol: crypto.symbol,
            testMode
          }, null, 2),
          apiResponse: JSON.stringify(tradeResult, null, 2),
          logInfo: `Binance ${orderType.toLowerCase()} ${action.toLowerCase()}: ${parsedQuantity} shares of ${crypto.symbol} at ${executedPrice}`
        }
      });
      
      // If not in test mode, update crypto shares and user balance
      if (!testMode) {
        if (action.toLowerCase() === 'buy') {
          // Update crypto shares
          await prisma.crypto.update({
            where: { id: crypto.id },
            data: {
              shares: { increment: parsedQuantity },
              lastPrice: executedPrice
            }
          });
          
          // Update user balance
          await prisma.user.update({
            where: { id: user.id },
            data: {
              usdBalance: { decrement: totalAmount }
            }
          });
        } else { // sell
          // Update crypto shares
          await prisma.crypto.update({
            where: { id: crypto.id },
            data: {
              shares: { decrement: parsedQuantity },
              lastPrice: executedPrice
            }
          });
          
          // Update user balance
          await prisma.user.update({
            where: { id: user.id },
            data: {
              usdBalance: { increment: totalAmount }
            }
          });
        }
      }
      
      // Return success with transaction details
      return res.status(200).json({
        success: true,
        message: `Binance ${action} order executed successfully`,
        transaction: {
          id: transaction.id,
          action: transaction.action,
          shares: transaction.shares,
          price: transaction.price,
          totalAmount: transaction.totalAmount,
          createdAt: transaction.createdAt
        },
        tradeResult
      });
    } catch (error) {
      autoTradeLogger.log(`Error creating transaction record: ${error.message}`);
      return res.status(500).json({ 
        error: 'Trade executed but failed to create transaction record', 
        details: error.message,
        tradeResult 
      });
    }
  } catch (error) {
    console.error('Error in binance-trade API:', error);
    return res.status(500).json({ 
      error: 'An unexpected error occurred', 
      details: error.message 
    });
  }
}