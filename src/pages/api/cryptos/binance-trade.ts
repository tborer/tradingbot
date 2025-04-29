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
      action, // Support legacy 'action' parameter
      side, // Support new 'side' parameter that matches Binance API
      quantity, 
      shares, 
      price, 
      orderType = 'MARKET', // Support legacy 'orderType' parameter
      type = orderType, // Support new 'type' parameter that matches Binance API
      testMode = false,
      useTestEndpoint = false,
      microProcessing = false,
      isApiTest = false, // Flag for direct API testing
      symbol: directSymbol = null // Symbol parameter for direct API testing
    } = req.body;
    
    // Use 'side' if provided, otherwise fall back to 'action'
    const tradeAction = side || action;
    
    // Log extracted parameters with detailed type information
    autoTradeLogger.log(`[${requestId}] Binance trade API parameters extracted`, {
      cryptoId,
      action,
      side,
      tradeAction, // The resolved action/side value
      quantity,
      shares,
      price,
      orderType,
      type,
      testMode,
      useTestEndpoint,
      microProcessing,
      hasCryptoId: !!cryptoId,
      hasAction: !!action,
      hasSide: !!side,
      hasTradeAction: !!tradeAction,
      hasQuantity: !!quantity,
      hasShares: !!shares,
      hasPrice: !!price,
      cryptoIdType: typeof cryptoId,
      actionType: typeof action,
      sideType: typeof side,
      tradeActionType: typeof tradeAction,
      quantityType: typeof quantity,
      sharesType: typeof shares,
      priceType: typeof price,
      orderTypeType: typeof orderType,
      typeType: typeof type,
      testModeType: typeof testMode,
      useTestEndpointType: typeof useTestEndpoint,
      requestId,
      timestamp: new Date().toISOString()
    });
    
    // Use shares if quantity is not provided (for compatibility with trade.ts)
    let tradeQuantity;
    
    // Log the raw values for debugging
    autoTradeLogger.log(`[${requestId}] Raw quantity and shares values:`, {
      quantity: quantity,
      quantityType: typeof quantity,
      quantityIsNull: quantity === null,
      quantityIsUndefined: quantity === undefined,
      quantityIsNaN: typeof quantity === 'number' ? isNaN(quantity) : 'not a number',
      
      shares: shares,
      sharesType: typeof shares,
      sharesIsNull: shares === null,
      sharesIsUndefined: shares === undefined,
      sharesIsNaN: typeof shares === 'number' ? isNaN(shares) : 'not a number',
      
      timestamp: new Date().toISOString()
    });
    
    // Determine which value to use with explicit validation
    if (quantity !== undefined && quantity !== null) {
      // Try to convert quantity to a number
      const numQuantity = Number(quantity);
      if (!isNaN(numQuantity) && numQuantity > 0) {
        tradeQuantity = numQuantity;
        autoTradeLogger.log(`[${requestId}] Using quantity value: ${tradeQuantity}`, {
          originalValue: quantity,
          convertedValue: tradeQuantity,
          timestamp: new Date().toISOString()
        });
      } else {
        autoTradeLogger.log(`[${requestId}] Invalid quantity value: ${quantity}`, {
          numQuantity,
          isNaN: isNaN(numQuantity),
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // If quantity is invalid, try to use shares
    if ((tradeQuantity === undefined || tradeQuantity === null) && shares !== undefined && shares !== null) {
      const numShares = Number(shares);
      if (!isNaN(numShares) && numShares > 0) {
        tradeQuantity = numShares;
        autoTradeLogger.log(`[${requestId}] Using shares value: ${tradeQuantity}`, {
          originalValue: shares,
          convertedValue: tradeQuantity,
          timestamp: new Date().toISOString()
        });
      } else {
        autoTradeLogger.log(`[${requestId}] Invalid shares value: ${shares}`, {
          numShares,
          isNaN: isNaN(numShares),
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // If both quantity and shares are invalid, check if we can parse them as strings
    if (tradeQuantity === undefined || tradeQuantity === null) {
      // Try one more time with explicit string conversion
      if (quantity !== undefined && quantity !== null) {
        const stringQuantity = String(quantity).trim();
        const parsedQuantity = parseFloat(stringQuantity);
        
        if (!isNaN(parsedQuantity) && parsedQuantity > 0) {
          tradeQuantity = parsedQuantity;
          autoTradeLogger.log(`[${requestId}] Parsed quantity from string: ${tradeQuantity}`, {
            originalValue: quantity,
            stringValue: stringQuantity,
            parsedValue: tradeQuantity,
            timestamp: new Date().toISOString()
          });
        }
      } else if (shares !== undefined && shares !== null) {
        const stringShares = String(shares).trim();
        const parsedShares = parseFloat(stringShares);
        
        if (!isNaN(parsedShares) && parsedShares > 0) {
          tradeQuantity = parsedShares;
          autoTradeLogger.log(`[${requestId}] Parsed shares from string: ${tradeQuantity}`, {
            originalValue: shares,
            stringValue: stringShares,
            parsedValue: tradeQuantity,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
    
    // Collect validation errors for comprehensive error reporting
    const validationErrors = [];
    
    // Validate required parameters
    if (isApiTest && directSymbol) {
      // For direct API testing, we don't need to validate cryptoId
      autoTradeLogger.log(`[${requestId}] Direct API test mode - skipping cryptoId validation`, {
        directSymbol,
        timestamp: new Date().toISOString()
      });
    } else {
      // Regular flow - validate cryptoId
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
    }
    
    if (!tradeAction) {
      validationErrors.push('Missing action/side parameter');
      autoTradeLogger.log(`[${requestId}] Binance trade API validation error: Missing action/side`, {
        action,
        side,
        timestamp: new Date().toISOString()
      });
    } else if (typeof tradeAction !== 'string') {
      validationErrors.push('action/side must be a string');
      autoTradeLogger.log(`[${requestId}] Binance trade API validation error: action/side type`, {
        tradeActionType: typeof tradeAction,
        tradeAction,
        timestamp: new Date().toISOString()
      });
    } else if (!['buy', 'sell', 'BUY', 'SELL'].includes(tradeAction.toUpperCase ? tradeAction.toUpperCase() : tradeAction)) {
      validationErrors.push('Invalid action/side parameter. Must be "buy", "sell", "BUY", or "SELL"');
      autoTradeLogger.log(`[${requestId}] Binance trade API validation error: Invalid action/side value`, {
        tradeAction,
        timestamp: new Date().toISOString()
      });
    }
    
    if (tradeQuantity === undefined || tradeQuantity === null) {
      validationErrors.push('Missing or invalid quantity/shares parameter');
      autoTradeLogger.log(`[${requestId}] Binance trade API validation error: Missing or invalid quantity/shares`, {
        quantity,
        shares,
        tradeQuantity,
        quantityType: typeof quantity,
        sharesType: typeof shares,
        timestamp: new Date().toISOString()
      });
    } else if (isNaN(tradeQuantity) || tradeQuantity <= 0) {
      validationErrors.push('Invalid quantity/shares parameter. Must be a positive number');
      autoTradeLogger.log(`[${requestId}] Binance trade API validation error: Invalid quantity/shares value`, {
        quantity,
        shares,
        tradeQuantity,
        tradeQuantityType: typeof tradeQuantity,
        isNaN: isNaN(tradeQuantity),
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
    
    // Handle direct API test case
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
      
      symbol = crypto.symbol;
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
    
    // Execute the trade based on action/side and order type
    let tradeResult;
    const parsedQuantity = parseFloat(String(tradeQuantity));
    const parsedPrice = price ? parseFloat(String(price)) : undefined;
    
    // Normalize the action/side to lowercase for consistent processing
    const normalizedAction = tradeAction.toLowerCase();
    
    // Log detailed information about the quantity right before executing the trade
    console.log(`[${requestId}] Quantity details before executing trade:`, {
      tradeQuantity,
      tradeQuantityType: typeof tradeQuantity,
      tradeQuantityIsNaN: isNaN(tradeQuantity),
      parsedQuantity,
      parsedQuantityType: typeof parsedQuantity,
      parsedQuantityIsNaN: isNaN(parsedQuantity),
      parsedQuantityToString: parsedQuantity.toString(),
      originalQuantity: quantity,
      originalQuantityType: typeof quantity,
      originalQuantityIsNaN: typeof quantity === 'number' ? isNaN(quantity) : 'not a number',
      originalShares: shares,
      originalSharesType: typeof shares,
      originalSharesIsNaN: typeof shares === 'number' ? isNaN(shares) : 'not a number',
      timestamp: new Date().toISOString()
    });
    
    try {
      // If useTestEndpoint is true, we'll force testMode to true as well
      const effectiveTestMode = useTestEndpoint ? true : testMode;
      
      autoTradeLogger.log('Executing Binance trade', {
        userId: user.id,
        symbol: crypto.symbol,
        action: normalizedAction,
        orderType: type.toUpperCase(),
        quantity: parsedQuantity,
        price: parsedPrice,
        testMode: effectiveTestMode,
        useTestEndpoint,
        timestamp: new Date().toISOString()
      });
      
      // Log the exact format that will be sent to Binance API - STRICTLY PER BINANCE API SPEC
      autoTradeLogger.error(`[${requestId}] BINANCE API FORMAT MAPPING`, {
        clientRequest: {
          cryptoId,
          action,
          side,
          tradeAction,
          quantity: tradeQuantity,
          shares,
          price,
          orderType,
          type,
          testMode,
          useTestEndpoint,
          microProcessing
        },
        binanceApiFormat: {
          // ONLY include the exact fields required by Binance API
          symbol: crypto.symbol,
          side: normalizedAction === 'buy' ? 'BUY' : 'SELL',
          type: type.toUpperCase(),
          quantity: parsedQuantity,
          timestamp: Date.now(),
          // Only include price for LIMIT orders
          ...(type.toUpperCase() === 'LIMIT' && parsedPrice ? { price: parsedPrice } : {}),
          // Only include timeInForce for LIMIT orders
          ...(type.toUpperCase() === 'LIMIT' ? { timeInForce: 'GTC' } : {}),
          // Standard parameter for request window
          recvWindow: 5000
        },
        requiredHeader: "X-MBX-APIKEY header with API key",
        signatureGeneration: "HMAC SHA256 signature of query string with all parameters",
        timestamp: new Date().toISOString()
      });
      
      // Log the exact parameters that will be sent to the Binance API
      const formattedSymbol = crypto.symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const binanceSymbol = formattedSymbol.endsWith('USDT') ? formattedSymbol : `${formattedSymbol}USDT`;
      
      // Construct the exact parameters that will be sent to Binance API
      const binanceParams = {
        symbol: binanceSymbol,
        side: normalizedAction === 'buy' ? 'BUY' : 'SELL',
        type: type.toUpperCase(),
        quantity: parsedQuantity,
        ...(type.toUpperCase() === 'LIMIT' && parsedPrice ? { price: parsedPrice } : {}),
        ...(type.toUpperCase() === 'LIMIT' ? { timeInForce: 'GTC' } : {})
      };
      
      // Log the exact parameters that will be sent to Binance API
      autoTradeLogger.log(`[${requestId}] BINANCE API PARAMETERS (FINAL)`, {
        binanceParams,
        userId: user.id,
        testMode: effectiveTestMode,
        useTestEndpoint,
        timestamp: new Date().toISOString()
      });
      
      // IMPORTANT: Use createBinanceOrder directly with the binanceParams object
      // This ensures only the required parameters are sent to the Binance API
      // The same clean parameter handling is used for both production and test trading
      autoTradeLogger.log('Executing Binance trade with createBinanceOrder', {
        userId: user.id,
        binanceParams,
        testMode: effectiveTestMode,
        useTestEndpoint,
        timestamp: new Date().toISOString()
      });
      
      // Call createBinanceOrder directly with the properly formatted parameters
      // This approach is used for both production and test trading to ensure consistency
      tradeResult = await createBinanceOrder(
        user.id,
        binanceParams,
        effectiveTestMode,
        useTestEndpoint
      );
      
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
        action: testMode || useTestEndpoint ? `test_${normalizedAction}` : normalizedAction,
        shares: parsedQuantity,
        price: executedPrice,
        totalAmount,
        userId: user.id,
        apiRequest: JSON.stringify({
          side: normalizedAction.toUpperCase(),
          type: type.toUpperCase(),
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
        if (normalizedAction === 'buy') {
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
    const requestId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    console.error(`[${requestId}] Error in binance-trade API:`, error);
    
    // Log detailed error information
    autoTradeLogger.log(`[${requestId}] Unhandled error in binance-trade API`, {
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
      errorType: error.name || 'UnknownError',
      requestId
    };
    
    // Check if this is a Binance API error
    if (error.message && error.message.includes('Binance API error')) {
      // Extract error code and message if available
      const errorCodeMatch = error.message.match(/\(([^)]+)\)/);
      const errorCode = errorCodeMatch ? errorCodeMatch[1] : 'UNKNOWN';
      const errorMessage = error.message.replace(/Binance API error \([^)]+\): /, '');
      
      console.error(`[${requestId}] Binance API error detected:`, {
        errorCode,
        errorMessage,
        originalError: error.message
      });
      
      autoTradeLogger.log(`[${requestId}] Binance API error details`, {
        errorCode,
        errorMessage,
        originalError: error.message,
        stack: error.stack,
        timestamp: errorTimestamp
      });
      
      // Create a more specific error response for Binance API errors
      errorResponse = {
        error: 'Binance API error',
        details: errorMessage,
        errorCode,
        timestamp: errorTimestamp,
        errorType: 'BINANCE_API_ERROR',
        requestId
      };
      
      // Return a 400 status for Binance API errors instead of 500
      return res.status(400).json(errorResponse);
    }
    // Check for specific error types
    else if (error.message && error.message.includes('Cannot convert undefined or null to object')) {
      autoTradeLogger.log(`[${requestId}] Null/undefined object conversion error detected`, {
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
        requestId,
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
        errorType: 'CREDENTIALS_ERROR',
        requestId
      };
    } else if (error.message && error.message.includes('Network error')) {
      // Handle network errors
      errorResponse = {
        error: 'Trading service unavailable',
        details: 'Could not connect to the trading service. Please try again later.',
        timestamp: errorTimestamp,
        errorType: 'NETWORK_ERROR',
        requestId
      };
    }
    
    // Return a structured error response with appropriate status code
    // Use 400 for client errors like invalid data format, keep 500 for server errors
    if (errorResponse.errorType === 'DATA_FORMAT_ERROR' || 
        errorResponse.errorType === 'VALIDATION_ERROR' || 
        errorResponse.errorType === 'BINANCE_API_ERROR' || 
        errorResponse.errorType === 'CREDENTIALS_ERROR') {
      return res.status(400).json(errorResponse);
    } else {
      return res.status(500).json(errorResponse);
    }
  }
}