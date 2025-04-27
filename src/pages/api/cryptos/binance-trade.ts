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
    autoTradeLogger.log('Binance trade API method not allowed', {
      method: req.method,
      url: req.url
    });
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Log the incoming request for debugging with timestamp
    const requestTimestamp = new Date().toISOString();
    console.log('Binance trade API request:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      timestamp: requestTimestamp
    });
    
    // Log detailed request information
    autoTradeLogger.log('Binance trade API request received', { 
      method: req.method,
      url: req.url,
      body: JSON.stringify(req.body),
      bodyType: typeof req.body,
      bodyIsNull: req.body === null,
      bodyIsUndefined: req.body === undefined,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      headers: JSON.stringify(Object.fromEntries(
        Object.entries(req.headers).filter(([key]) => 
          !['authorization', 'cookie'].includes(key.toLowerCase())
        )
      )),
      timestamp: requestTimestamp
    });
    
    // Validate request body
    if (!req.body) {
      const error = new Error('Request body is empty or undefined');
      autoTradeLogger.log('Binance trade API validation error', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({ error: 'Request body is required', details: error.message });
    }
    
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
    
    // Extract and validate request body with detailed error handling
    // Generate a request ID for tracking this specific request
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    // First, validate that req.body exists and is an object
    if (!req.body || typeof req.body !== 'object') {
      const error = new Error('Request body is missing or invalid');
      autoTradeLogger.log(`[${requestId}] Binance trade API validation error`, {
        error: error.message,
        bodyType: typeof req.body,
        body: req.body,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({ 
        error: 'Invalid data format', 
        details: 'Request body must be a valid JSON object',
        requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Extract request body - support both formats (from direct calls and from trade.ts)
    // Use destructuring with default values to handle missing properties
    const { 
      cryptoId, 
      action, 
      quantity, 
      shares, 
      price, 
      orderType = 'MARKET',
      testMode = false,
      useTestEndpoint = false,
      microProcessing = false
    } = req.body;
    
    // Log extracted parameters with detailed type information
    autoTradeLogger.log(`[${requestId}] Binance trade API parameters extracted`, {
      cryptoId,
      action,
      quantity,
      shares,
      price,
      orderType,
      testMode,
      useTestEndpoint,
      microProcessing,
      hasCryptoId: !!cryptoId,
      hasAction: !!action,
      hasQuantity: !!quantity,
      hasShares: !!shares,
      hasPrice: !!price,
      cryptoIdType: typeof cryptoId,
      actionType: typeof action,
      quantityType: typeof quantity,
      sharesType: typeof shares,
      priceType: typeof price,
      orderTypeType: typeof orderType,
      testModeType: typeof testMode,
      useTestEndpointType: typeof useTestEndpoint,
      requestId,
      timestamp: new Date().toISOString()
    });
    
    // Use shares if quantity is not provided (for compatibility with trade.ts)
    const tradeQuantity = quantity !== undefined && quantity !== null ? quantity : shares;
    
    // Collect validation errors for comprehensive error reporting
    const validationErrors = [];
    
    // Validate required parameters
    if (!cryptoId) {
      validationErrors.push('Missing cryptoId parameter');
      autoTradeLogger.log(`[${requestId}] Binance trade API validation error: Missing cryptoId`, {
        timestamp: new Date().toISOString()
      });
    } else if (typeof cryptoId !== 'string') {
      validationErrors.push('cryptoId must be a string');
      autoTradeLogger.log(`[${requestId}] Binance trade API validation error: cryptoId type`, {
        cryptoIdType: typeof cryptoId,
        cryptoId,
        timestamp: new Date().toISOString()
      });
    }
    
    if (!action) {
      validationErrors.push('Missing action parameter');
      autoTradeLogger.log(`[${requestId}] Binance trade API validation error: Missing action`, {
        timestamp: new Date().toISOString()
      });
    } else if (typeof action !== 'string') {
      validationErrors.push('action must be a string');
      autoTradeLogger.log(`[${requestId}] Binance trade API validation error: action type`, {
        actionType: typeof action,
        action,
        timestamp: new Date().toISOString()
      });
    } else if (!['buy', 'sell'].includes(action.toLowerCase())) {
      validationErrors.push('Invalid action parameter. Must be "buy" or "sell"');
      autoTradeLogger.log(`[${requestId}] Binance trade API validation error: Invalid action value`, {
        action,
        timestamp: new Date().toISOString()
      });
    }
    
    if (tradeQuantity === undefined || tradeQuantity === null) {
      validationErrors.push('Missing quantity/shares parameter');
      autoTradeLogger.log(`[${requestId}] Binance trade API validation error: Missing quantity/shares`, {
        quantity,
        shares,
        tradeQuantity,
        timestamp: new Date().toISOString()
      });
    } else if (isNaN(parseFloat(String(tradeQuantity))) || parseFloat(String(tradeQuantity)) <= 0) {
      validationErrors.push('Invalid quantity/shares parameter. Must be a positive number');
      autoTradeLogger.log(`[${requestId}] Binance trade API validation error: Invalid quantity/shares value`, {
        quantity,
        shares,
        tradeQuantity,
        parsedValue: parseFloat(String(tradeQuantity)),
        isNaN: isNaN(parseFloat(String(tradeQuantity))),
        timestamp: new Date().toISOString()
      });
    }
    
    // Return all validation errors at once if any exist
    if (validationErrors.length > 0) {
      autoTradeLogger.log(`[${requestId}] Binance trade API validation failed with multiple errors`, {
        errors: validationErrors,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationErrors.join('; '),
        requestId,
        timestamp: new Date().toISOString(),
        errorType: 'VALIDATION_ERROR'
      });
    }
    
    // For limit orders, price is required
    if (orderType.toUpperCase() === 'LIMIT') {
      if (!price || isNaN(parseFloat(String(price))) || parseFloat(String(price)) <= 0) {
        const error = new Error(`Invalid price parameter for LIMIT order: ${price}`);
        autoTradeLogger.log('Binance trade API validation error', {
          error: error.message,
          price,
          orderType,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ error: 'Invalid price parameter. Must be a positive number for limit orders' });
      }
    }
    
    // Check if the crypto belongs to the user
    autoTradeLogger.log('Fetching crypto for Binance trade', {
      cryptoId,
      userId: user.id,
      timestamp: new Date().toISOString()
    });
    
    const crypto = await prisma.crypto.findFirst({
      where: {
        id: cryptoId,
        userId: user.id
      }
    });
    
    if (!crypto) {
      const error = new Error(`Crypto not found: ${cryptoId}`);
      autoTradeLogger.log('Binance trade API crypto not found', {
        error: error.message,
        cryptoId,
        userId: user.id,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      return res.status(404).json({ error: 'Crypto not found' });
    }
    
    autoTradeLogger.log('Crypto found for Binance trade', {
      cryptoId,
      symbol: crypto.symbol,
      userId: user.id,
      timestamp: new Date().toISOString()
    });
    
    // Log the trade request
    autoTradeLogger.log(`Binance trade request: ${action} ${tradeQuantity} ${crypto.symbol} at ${price || 'market price'} (${orderType})`, {
      cryptoId,
      symbol: crypto.symbol,
      action,
      quantity: tradeQuantity,
      price,
      orderType,
      testMode,
      useTestEndpoint,
      timestamp: new Date().toISOString()
    });
    
    // Execute the trade based on action and order type
    let tradeResult;
    const parsedQuantity = parseFloat(String(tradeQuantity));
    const parsedPrice = price ? parseFloat(String(price)) : undefined;
    
    try {
      // If useTestEndpoint is true, we'll force testMode to true as well
      const effectiveTestMode = useTestEndpoint ? true : testMode;
      
      autoTradeLogger.log('Executing Binance trade', {
        userId: user.id,
        symbol: crypto.symbol,
        action: action.toLowerCase(),
        orderType: orderType.toUpperCase(),
        quantity: parsedQuantity,
        price: parsedPrice,
        testMode: effectiveTestMode,
        useTestEndpoint,
        timestamp: new Date().toISOString()
      });
      
      if (action.toLowerCase() === 'buy') {
        if (orderType.toUpperCase() === 'MARKET') {
          autoTradeLogger.log('Executing Binance market buy', {
            userId: user.id,
            symbol: crypto.symbol,
            quantity: parsedQuantity,
            testMode: effectiveTestMode,
            useTestEndpoint,
            timestamp: new Date().toISOString()
          });
          
          tradeResult = await executeBinanceMarketBuy(user.id, crypto.symbol, parsedQuantity, effectiveTestMode, useTestEndpoint);
        } else if (orderType.toUpperCase() === 'LIMIT' && parsedPrice) {
          autoTradeLogger.log('Executing Binance limit buy', {
            userId: user.id,
            symbol: crypto.symbol,
            quantity: parsedQuantity,
            price: parsedPrice,
            testMode: effectiveTestMode,
            useTestEndpoint,
            timestamp: new Date().toISOString()
          });
          
          tradeResult = await executeBinanceLimitBuy(user.id, crypto.symbol, parsedQuantity, parsedPrice, effectiveTestMode, useTestEndpoint);
        } else {
          const error = new Error(`Invalid order type or missing price for limit order: ${orderType}`);
          autoTradeLogger.log('Binance trade API validation error', {
            error: error.message,
            orderType,
            price: parsedPrice,
            stack: error.stack,
            timestamp: new Date().toISOString()
          });
          return res.status(400).json({ error: 'Invalid order type or missing price for limit order' });
        }
      } else { // sell
        if (orderType.toUpperCase() === 'MARKET') {
          autoTradeLogger.log('Executing Binance market sell', {
            userId: user.id,
            symbol: crypto.symbol,
            quantity: parsedQuantity,
            testMode: effectiveTestMode,
            useTestEndpoint,
            timestamp: new Date().toISOString()
          });
          
          tradeResult = await executeBinanceMarketSell(user.id, crypto.symbol, parsedQuantity, effectiveTestMode, useTestEndpoint);
        } else if (orderType.toUpperCase() === 'LIMIT' && parsedPrice) {
          autoTradeLogger.log('Executing Binance limit sell', {
            userId: user.id,
            symbol: crypto.symbol,
            quantity: parsedQuantity,
            price: parsedPrice,
            testMode: effectiveTestMode,
            useTestEndpoint,
            timestamp: new Date().toISOString()
          });
          
          tradeResult = await executeBinanceLimitSell(user.id, crypto.symbol, parsedQuantity, parsedPrice, effectiveTestMode, useTestEndpoint);
        } else {
          const error = new Error(`Invalid order type or missing price for limit order: ${orderType}`);
          autoTradeLogger.log('Binance trade API validation error', {
            error: error.message,
            orderType,
            price: parsedPrice,
            stack: error.stack,
            timestamp: new Date().toISOString()
          });
          return res.status(400).json({ error: 'Invalid order type or missing price for limit order' });
        }
      }
      
      // Log successful trade execution
      autoTradeLogger.log('Binance trade executed successfully', {
        userId: user.id,
        symbol: crypto.symbol,
        action: action.toLowerCase(),
        orderType: orderType.toUpperCase(),
        quantity: parsedQuantity,
        price: parsedPrice,
        testMode: effectiveTestMode,
        useTestEndpoint,
        tradeResultType: typeof tradeResult,
        tradeResultIsNull: tradeResult === null,
        tradeResultIsUndefined: tradeResult === undefined,
        tradeResultKeys: tradeResult ? Object.keys(tradeResult) : [],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // Enhanced error logging
      autoTradeLogger.log(`Binance trade error: ${error.message}`, {
        error: error.message,
        stack: error.stack,
        userId: user.id,
        symbol: crypto.symbol,
        action: action.toLowerCase(),
        orderType: orderType.toUpperCase(),
        quantity: parsedQuantity,
        price: parsedPrice,
        testMode,
        useTestEndpoint,
        timestamp: new Date().toISOString()
      });
      
      return res.status(500).json({ 
        error: 'Failed to execute Binance trade', 
        details: error.message 
      });
    }
    
    // Add null check for tradeResult after the try-catch block
    if (!tradeResult) {
      const error = new Error('Trade execution returned null result');
      autoTradeLogger.log('Binance trade null result error', {
        error: error.message,
        stack: error.stack,
        userId: user.id,
        symbol: crypto.symbol,
        action: action.toLowerCase(),
        orderType: orderType.toUpperCase(),
        quantity: parsedQuantity,
        price: parsedPrice,
        testMode,
        useTestEndpoint,
        timestamp: new Date().toISOString()
      });
      
      return res.status(500).json({ 
        error: 'Failed to execute Binance trade', 
        details: 'Trade execution returned null result' 
      });
    }
    
    // Create a transaction record
    try {
      autoTradeLogger.log('Processing trade result for transaction record', {
        tradeResultExists: !!tradeResult,
        tradeResultType: typeof tradeResult,
        tradeResultIsNull: tradeResult === null,
        tradeResultIsUndefined: tradeResult === undefined,
        tradeResultKeys: tradeResult ? Object.keys(tradeResult) : [],
        hasFills: !!(tradeResult && tradeResult.fills),
        fillsLength: tradeResult && tradeResult.fills ? tradeResult.fills.length : 0,
        hasPrice: !!(tradeResult && tradeResult.price),
        hasExecutedQty: !!(tradeResult && tradeResult.executedQty),
        timestamp: new Date().toISOString()
      });
      
      // Calculate total amount based on the trade result
      let totalAmount = 0;
      let executedPrice = 0;
      
      if (tradeResult && tradeResult.fills && tradeResult.fills.length > 0) {
        // Calculate weighted average price from fills
        let totalQty = 0;
        let totalValue = 0;
        
        autoTradeLogger.log('Calculating price from fills', {
          fillsCount: tradeResult.fills.length,
          timestamp: new Date().toISOString()
        });
        
        for (const fill of tradeResult.fills) {
          try {
            const fillQty = parseFloat(fill.qty);
            const fillPrice = parseFloat(fill.price);
            
            autoTradeLogger.log('Processing fill', {
              fillQty,
              fillPrice,
              fillQtyRaw: fill.qty,
              fillPriceRaw: fill.price,
              isQtyValid: !isNaN(fillQty),
              isPriceValid: !isNaN(fillPrice),
              timestamp: new Date().toISOString()
            });
            
            if (isNaN(fillQty) || isNaN(fillPrice)) {
              throw new Error(`Invalid fill data: qty=${fill.qty}, price=${fill.price}`);
            }
            
            totalQty += fillQty;
            totalValue += fillQty * fillPrice;
          } catch (fillError) {
            autoTradeLogger.log('Error processing fill', {
              error: fillError.message,
              stack: fillError.stack,
              fill: JSON.stringify(fill),
              timestamp: new Date().toISOString()
            });
            throw fillError;
          }
        }
        
        executedPrice = totalValue / totalQty;
        totalAmount = totalValue;
        
        autoTradeLogger.log('Calculated price from fills', {
          totalQty,
          totalValue,
          executedPrice,
          totalAmount,
          timestamp: new Date().toISOString()
        });
      } else if (tradeResult && tradeResult.price && tradeResult.executedQty) {
        // Use price and executedQty if available
        try {
          executedPrice = parseFloat(tradeResult.price);
          const executedQty = parseFloat(tradeResult.executedQty);
          
          autoTradeLogger.log('Using price and executedQty from result', {
            priceRaw: tradeResult.price,
            executedQtyRaw: tradeResult.executedQty,
            executedPrice,
            executedQty,
            isPriceValid: !isNaN(executedPrice),
            isQtyValid: !isNaN(executedQty),
            timestamp: new Date().toISOString()
          });
          
          if (isNaN(executedPrice) || isNaN(executedQty)) {
            throw new Error(`Invalid price/qty data: price=${tradeResult.price}, qty=${tradeResult.executedQty}`);
          }
          
          totalAmount = executedPrice * executedQty;
        } catch (priceError) {
          autoTradeLogger.log('Error processing price and executedQty', {
            error: priceError.message,
            stack: priceError.stack,
            price: tradeResult.price,
            executedQty: tradeResult.executedQty,
            timestamp: new Date().toISOString()
          });
          throw priceError;
        }
      } else {
        // Fallback to estimated calculation
        try {
          executedPrice = parsedPrice || crypto.lastPrice || 0;
          
          autoTradeLogger.log('Using fallback price calculation', {
            parsedPrice,
            cryptoLastPrice: crypto.lastPrice,
            executedPrice,
            parsedQuantity,
            timestamp: new Date().toISOString()
          });
          
          if (executedPrice === 0) {
            autoTradeLogger.log('Warning: Using zero price for calculation', {
              parsedPrice,
              cryptoLastPrice: crypto.lastPrice,
              timestamp: new Date().toISOString()
            });
          }
          
          totalAmount = executedPrice * parsedQuantity;
        } catch (fallbackError) {
          autoTradeLogger.log('Error in fallback price calculation', {
            error: fallbackError.message,
            stack: fallbackError.stack,
            parsedPrice,
            cryptoLastPrice: crypto.lastPrice,
            parsedQuantity,
            timestamp: new Date().toISOString()
          });
          throw fallbackError;
        }
      }
      
      // Prepare transaction data
      const transactionData = {
        cryptoId: crypto.id,
        action: testMode || useTestEndpoint ? `test_${action.toLowerCase()}` : action.toLowerCase(),
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
          testMode,
          useTestEndpoint
        }, null, 2),
        apiResponse: JSON.stringify(tradeResult, null, 2),
        logInfo: `Binance ${orderType.toLowerCase()} ${action.toLowerCase()}: ${parsedQuantity} shares of ${crypto.symbol} at ${executedPrice}`
      };
      
      autoTradeLogger.log('Creating transaction record', {
        transactionData: {
          ...transactionData,
          // Don't log the full API request/response in the transaction data log
          apiRequest: '(omitted for brevity)',
          apiResponse: '(omitted for brevity)'
        },
        timestamp: new Date().toISOString()
      });
      
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
      if (!testMode) {
        if (action.toLowerCase() === 'buy') {
          autoTradeLogger.log('Updating crypto shares and balance for buy', {
            cryptoId: crypto.id,
            userId: user.id,
            incrementShares: parsedQuantity,
            decrementBalance: totalAmount,
            timestamp: new Date().toISOString()
          });
          
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
          autoTradeLogger.log('Updating crypto shares and balance for sell', {
            cryptoId: crypto.id,
            userId: user.id,
            decrementShares: parsedQuantity,
            incrementBalance: totalAmount,
            timestamp: new Date().toISOString()
          });
          
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
      } else {
        autoTradeLogger.log('Skipping balance updates (test mode)', {
          testMode,
          useTestEndpoint,
          timestamp: new Date().toISOString()
        });
      }
      
      // Prepare success response
      const successResponse = {
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
      };
      
      autoTradeLogger.log('Returning success response', {
        success: true,
        transactionId: transaction.id,
        timestamp: new Date().toISOString()
      });
      
      // Return success with transaction details
      return res.status(200).json(successResponse);
    } catch (error) {
      // Enhanced error logging for transaction creation
      autoTradeLogger.log(`Error creating transaction record: ${error.message}`, {
        error: error.message,
        stack: error.stack,
        tradeResultExists: !!tradeResult,
        tradeResultType: typeof tradeResult,
        tradeResultKeys: tradeResult ? Object.keys(tradeResult) : [],
        timestamp: new Date().toISOString()
      });
      
      return res.status(500).json({ 
        error: 'Trade executed but failed to create transaction record', 
        details: error.message,
        tradeResult: tradeResult ? {
          // Include only essential information to avoid potential circular references
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
    console.error('Error in binance-trade API:', error);
    
    // Log detailed error information
    autoTradeLogger.log('Unhandled error in binance-trade API', {
      error: error.message,
      stack: error.stack,
      errorType: error.name,
      errorCode: error.code,
      timestamp: errorTimestamp,
      // Include request information for context
      requestMethod: req.method,
      requestUrl: req.url,
      requestBodyType: typeof req.body,
      requestBodyKeys: req.body ? Object.keys(req.body) : []
    });
    
    // Enhanced error handling with specific error types
    let errorResponse = {
      error: 'An unexpected error occurred',
      details: error.message || 'Unknown error',
      timestamp: errorTimestamp,
      errorType: error.name || 'UnknownError'
    };
    
    // Check for specific error types
    if (error.message && error.message.includes('Cannot convert undefined or null to object')) {
      autoTradeLogger.log('Null/undefined object conversion error detected', {
        error: error.message,
        stack: error.stack,
        timestamp: errorTimestamp,
        // Try to identify the source of the null/undefined value
        requestBody: req.body ? JSON.stringify(req.body) : 'null',
        bodyType: typeof req.body,
        bodyIsNull: req.body === null,
        bodyIsUndefined: req.body === undefined
      });
      
      // Create a more specific error response
      errorResponse = {
        error: 'Invalid data format',
        details: 'The request contains null or undefined values that cannot be processed',
        timestamp: errorTimestamp,
        errorType: 'DATA_FORMAT_ERROR',
        requestInfo: {
          bodyType: typeof req.body,
          hasBody: !!req.body,
          bodyKeys: req.body ? Object.keys(req.body) : []
        }
      };
    } else if (error.message && error.message.includes('Binance API credentials not configured')) {
      // Handle missing API credentials
      errorResponse = {
        error: 'Trading configuration error',
        details: 'Binance API credentials are not properly configured',
        timestamp: errorTimestamp,
        errorType: 'CREDENTIALS_ERROR'
      };
    } else if (error.message && error.message.includes('Network error')) {
      // Handle network errors
      errorResponse = {
        error: 'Trading service unavailable',
        details: 'Could not connect to the trading service. Please try again later.',
        timestamp: errorTimestamp,
        errorType: 'NETWORK_ERROR'
      };
    }
    
    // Return a structured error response
    return res.status(500).json(errorResponse);
  }
}