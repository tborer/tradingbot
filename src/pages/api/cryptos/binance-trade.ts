import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { autoTradeLogger } from '@/lib/autoTradeLogger';
import { 
  executeBinanceOrder,
  formatBinanceSymbol
} from '@/lib/binanceTradeApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    autoTradeLogger.log('Binance trade API method not allowed', {
      method: req.method,
      url: req.url
    });
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Log the incoming request for debugging with timestamp
    const requestTimestamp = new Date().toISOString();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    autoTradeLogger.log(`[${requestId}] Binance trade API request received`, { 
      method: req.method,
      url: req.url,
      queryParams: JSON.stringify(req.query),
      timestamp: requestTimestamp
    });
    
    // Get the user from Supabase auth
    autoTradeLogger.log('Authenticating user for Binance trade API', {
      timestamp: new Date().toISOString()
    });
    
    const supabase = createClient({ req, res });
    const { data, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      autoTradeLogger.log('Binance trade API authentication error', {
        error: authError.message,
        timestamp: new Date().toISOString()
      });
      return res.status(401).json({ error: 'Authentication error', details: authError.message });
    }
    
    if (!data || !data.user) {
      autoTradeLogger.log('Binance trade API unauthorized access attempt', {
        timestamp: new Date().toISOString()
      });
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = data.user;
    autoTradeLogger.log('User authenticated for Binance trade API', {
      userId: user.id,
      timestamp: new Date().toISOString()
    });
    
    // Extract parameters from query string only
    const params = req.query;
    
    // Extract and validate parameters
    const { 
      cryptoId, 
      side = params.action, // Support legacy 'action' parameter
      quantity = params.shares, // Support legacy 'shares' parameter
      testMode = false,
      useTestEndpoint = false,
      isApiTest = false, // Flag for direct API testing
      symbol: directSymbol = null // Symbol parameter for direct API testing
    } = params;
    
    // Normalize side to uppercase
    const normalizedSide = typeof side === 'string' 
      ? side.toUpperCase() === 'BUY' ? 'BUY' : side.toUpperCase() === 'SELL' ? 'SELL' : null
      : null;
    
    // Parse quantity to number
    const parsedQuantity = quantity ? parseFloat(String(quantity)) : null;
    
    // Validate parameters
    const validationErrors = [];
    
    // Validate cryptoId unless in API test mode
    if (!isApiTest && !directSymbol) {
      if (!cryptoId) {
        validationErrors.push('Missing cryptoId parameter');
      }
    }
    
    // Validate side
    if (!normalizedSide) {
      validationErrors.push('Side must be BUY or SELL');
    }
    
    // Validate quantity
    if (!parsedQuantity || isNaN(parsedQuantity) || parsedQuantity <= 0) {
      validationErrors.push('Quantity must be a positive number');
    }
    
    // Return all validation errors at once if any exist
    if (validationErrors.length > 0) {
      autoTradeLogger.log(`[${requestId}] Binance trade API validation failed`, {
        errors: validationErrors,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationErrors.join('; '),
        requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Handle direct API test case or get crypto from database
    let crypto;
    let symbol;
    
    if (isApiTest && directSymbol) {
      // For direct API testing, we don't need to fetch a crypto from the database
      autoTradeLogger.log('Direct API test mode detected', {
        directSymbol,
        userId: user.id,
        timestamp: new Date().toISOString()
      });
      
      // Create a mock crypto object with the provided symbol
      crypto = {
        id: 'API_TEST',
        symbol: directSymbol,
        userId: user.id,
        lastPrice: 0,
        shares: 0
      };
      
      symbol = directSymbol;
    } else {
      // Regular flow - check if the crypto belongs to the user
      autoTradeLogger.log('Fetching crypto for Binance trade', {
        cryptoId,
        userId: user.id,
        timestamp: new Date().toISOString()
      });
      
      crypto = await prisma.crypto.findFirst({
        where: {
          id: String(cryptoId),
          userId: user.id
        }
      });
      
      if (!crypto) {
        const error = new Error(`Crypto not found: ${cryptoId}`);
        autoTradeLogger.log('Binance trade API crypto not found', {
          error: error.message,
          cryptoId,
          userId: user.id,
          timestamp: new Date().toISOString()
        });
        return res.status(404).json({ error: 'Crypto not found' });
      }
      
      symbol = crypto.symbol;
    }
    
    // Log the trade request
    autoTradeLogger.log(`Binance trade request: ${normalizedSide} ${parsedQuantity} ${symbol}`, {
      cryptoId,
      symbol,
      side: normalizedSide,
      quantity: parsedQuantity,
      testMode,
      useTestEndpoint,
      timestamp: new Date().toISOString()
    });
    
    // Execute the trade
    let tradeResult;
    try {
      // If useTestEndpoint is true, we'll force testMode to true as well
      const effectiveTestMode = useTestEndpoint ? true : testMode;
      
      // Format the symbol for Binance API
      const formattedSymbol = formatBinanceSymbol(symbol);
      
      // Log the actual parameters being sent to Binance API
      autoTradeLogger.log('Binance API parameters', {
        userId: user.id,
        symbol: formattedSymbol,
        side: normalizedSide,
        quantity: parsedQuantity,
        testMode: effectiveTestMode,
        useTestEndpoint,
        timestamp: new Date().toISOString()
      });
      
      // Execute the order - only pass the parameters that Binance API expects
      const { result: tradeResult, requestDetails } = await executeBinanceOrder(
        user.id,
        formattedSymbol,
        normalizedSide as 'BUY' | 'SELL',
        parsedQuantity,
        effectiveTestMode,
        useTestEndpoint
      );
      
      // Log successful trade execution
      autoTradeLogger.log('Binance trade executed successfully', {
        userId: user.id,
        symbol,
        side: normalizedSide,
        quantity: parsedQuantity,
        testMode: effectiveTestMode,
        useTestEndpoint,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // Enhanced error logging
      autoTradeLogger.log(`Binance trade error: ${error.message}`, {
        error: error.message,
        stack: error.stack,
        userId: user.id,
        symbol,
        side: normalizedSide,
        quantity: parsedQuantity,
        testMode,
        useTestEndpoint,
        timestamp: new Date().toISOString()
      });
      
      return res.status(500).json({ 
        error: 'Failed to execute Binance trade', 
        details: error.message 
      });
    }
    
    // Add null check for tradeResult
    if (!tradeResult) {
      const error = new Error('Trade execution returned null result');
      autoTradeLogger.log('Binance trade null result error', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      
      return res.status(500).json({ 
        error: 'Failed to execute Binance trade', 
        details: 'Trade execution returned null result' 
      });
    }
    
    // Create a transaction record
    try {
      // Calculate total amount based on the trade result
      let executedPrice = 0;
      let totalAmount = 0;
      
      if (tradeResult.fills && tradeResult.fills.length > 0) {
        // Calculate weighted average price from fills
        let totalQty = 0;
        let totalValue = 0;
        
        for (const fill of tradeResult.fills) {
          const fillQty = parseFloat(fill.qty);
          const fillPrice = parseFloat(fill.price);
          
          if (isNaN(fillQty) || isNaN(fillPrice)) {
            throw new Error(`Invalid fill data: qty=${fill.qty}, price=${fill.price}`);
          }
          
          totalQty += fillQty;
          totalValue += fillQty * fillPrice;
        }
        
        executedPrice = totalValue / totalQty;
        totalAmount = totalValue;
      } else if (tradeResult.price && tradeResult.executedQty) {
        // Use price and executedQty if available
        executedPrice = parseFloat(tradeResult.price);
        const executedQty = parseFloat(tradeResult.executedQty);
        
        if (isNaN(executedPrice) || isNaN(executedQty)) {
          throw new Error(`Invalid price/qty data: price=${tradeResult.price}, qty=${tradeResult.executedQty}`);
        }
        
        totalAmount = executedPrice * executedQty;
      } else {
        // Fallback to estimated calculation
        executedPrice = crypto.lastPrice || 0;
        totalAmount = executedPrice * parsedQuantity;
      }
      
      // Prepare transaction data
      const transactionData = {
        cryptoId: crypto.id,
        action: testMode || useTestEndpoint ? `test_${normalizedSide.toLowerCase()}` : normalizedSide.toLowerCase(),
        shares: parsedQuantity,
        price: executedPrice,
        totalAmount,
        userId: user.id,
        apiRequest: JSON.stringify({
          side: normalizedSide,
          type: 'MARKET',
          quantity: parsedQuantity,
          symbol,
          testMode,
          useTestEndpoint
        }, null, 2),
        apiResponse: JSON.stringify(tradeResult, null, 2),
        logInfo: `Binance market ${normalizedSide.toLowerCase()}: ${parsedQuantity} shares of ${symbol} at ${executedPrice}`
      };
      
      // Create transaction record
      const transaction = await prisma.cryptoTransaction.create({
        data: transactionData
      });
      
      autoTradeLogger.log('Transaction record created', {
        transactionId: transaction.id,
        action: transaction.action,
        shares: transaction.shares,
        price: transaction.price,
        totalAmount: transaction.totalAmount,
        timestamp: new Date().toISOString()
      });
      
      // If not in test mode, update crypto shares and user balance
      if (!testMode && !useTestEndpoint) {
        if (normalizedSide === 'BUY') {
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
        } else { // SELL
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
      
      // Prepare success response
      const successResponse = {
        success: true,
        message: `Binance ${normalizedSide.toLowerCase()} order executed successfully`,
        transaction: {
          id: transaction.id,
          action: transaction.action,
          shares: transaction.shares,
          price: transaction.price,
          totalAmount: transaction.totalAmount,
          createdAt: transaction.createdAt
        },
        tradeResult,
        requestDetails
      };
      
      // Return success with transaction details
      return res.status(200).json(successResponse);
    } catch (error) {
      // Enhanced error logging for transaction creation
      autoTradeLogger.log(`Error creating transaction record: ${error.message}`, {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      
      return res.status(500).json({ 
        error: 'Trade executed but failed to create transaction record', 
        details: error.message,
        tradeResult: tradeResult ? {
          success: tradeResult.success,
          status: tradeResult.status,
          message: tradeResult.msg || tradeResult.message,
          code: tradeResult.code
        } : null
      });
    }
  } catch (error) {
    // Enhanced error logging for the main try-catch block
    const errorTimestamp = new Date().toISOString();
    const requestId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    console.error(`[${requestId}] Error in binance-trade API:`, error);
    
    // Log detailed error information
    autoTradeLogger.log(`[${requestId}] Unhandled error in binance-trade API`, {
      error: error.message,
      stack: error.stack,
      errorType: error.name,
      errorCode: error.code,
      timestamp: errorTimestamp
    });
    
    // Return a structured error response
    return res.status(500).json({
      error: 'An unexpected error occurred',
      details: error.message || 'Unknown error',
      timestamp: errorTimestamp,
      errorType: error.name || 'UnknownError',
      requestId
    });
  }
}