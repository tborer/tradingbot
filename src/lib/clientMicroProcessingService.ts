import { updatePriceCache, getCachedPrice } from '@/lib/priceCache';
import { shouldSellCrypto } from '@/lib/kraken';
import { autoTradeLogger } from '@/lib/autoTradeLogger';

// Define types for micro processing
export interface MicroProcessingSettings {
  enabled: boolean;
  sellPercentage: number;
  tradeByShares: number;
  tradeByValue: boolean;
  totalValue: number;
  websocketProvider: 'kraken' | 'coinbase' | 'binance';
  tradingPlatform: 'kraken' | 'coinbase' | 'binance';
  purchasePrice?: number;
  lastBuyPrice?: number;
  lastBuyShares?: number;
  lastBuyTimestamp?: Date;
  processingStatus?: 'buying' | 'selling' | 'idle';
  crypto?: MicroProcessingCrypto; // Add the crypto relationship
}

export interface MicroProcessingCrypto {
  id: string;
  symbol: string;
  shares: number;
  purchasePrice: number;
  currentPrice?: number;
  microProcessingSettings?: MicroProcessingSettings;
}

// In-memory store for micro processing state
const microProcessingState = new Map<string, {
  status: 'idle' | 'buying' | 'selling' | 'processing';
  lastAction: Date;
  crypto: MicroProcessingCrypto;
  settings: MicroProcessingSettings;
}>();

// In-memory lock to prevent concurrent trades
const tradeLocks = new Map<string, {
  lockedAt: Date;
  action: 'buy' | 'sell';
}>();

/**
 * Initialize micro processing for a crypto
 */
export function initializeMicroProcessing(crypto: MicroProcessingCrypto): void {
  // Validate crypto object
  if (!crypto || !crypto.id || !crypto.symbol) {
    console.error('Cannot initialize micro processing: Invalid crypto object', crypto);
    return;
  }
  
  // Validate settings
  if (!crypto.microProcessingSettings) {
    console.error(`Cannot initialize micro processing for ${crypto.symbol}: Missing settings`);
    return;
  }
  
  if (!crypto.microProcessingSettings.enabled) {
    console.log(`Micro processing not enabled for ${crypto.symbol}, skipping initialization`);
    return;
  }

  const settings = crypto.microProcessingSettings;
  
  // Create a safe copy of the crypto object with default values for missing properties
  const safeCrypto: MicroProcessingCrypto = {
    id: crypto.id,
    symbol: crypto.symbol,
    shares: typeof crypto.shares === 'number' ? crypto.shares : 0,
    purchasePrice: typeof crypto.purchasePrice === 'number' ? crypto.purchasePrice : 0,
    currentPrice: typeof crypto.currentPrice === 'number' ? crypto.currentPrice : undefined,
    microProcessingSettings: settings
  };
  
  // Initialize or update the state
  microProcessingState.set(crypto.id, {
    status: settings.processingStatus || 'idle',
    lastAction: new Date(),
    crypto: safeCrypto,
    settings
  });

  console.log(`Initialized micro processing for ${crypto.symbol}`);
}

/**
 * Update the micro processing state with new price data
 */
export function updateMicroProcessingPrice(symbol: string, price: number): void {
  // Update the price cache
  updatePriceCache(symbol, price);
  
  // Find all cryptos with this symbol and update their state
  for (const [cryptoId, state] of microProcessingState.entries()) {
    if (state.crypto.symbol === symbol) {
      state.crypto.currentPrice = price;
    }
  }
}

/**
 * Check if a crypto should be traded based on micro processing settings
 */
export function shouldMicroTrade(cryptoId: string): { 
  shouldTrade: boolean; 
  action: 'buy' | 'sell' | null;
  reason: string;
} {
  const state = microProcessingState.get(cryptoId);
  
  if (!state || !state.settings.enabled) {
    return { shouldTrade: false, action: null, reason: 'Micro processing not enabled' };
  }
  
  // Check if there's a lock on this crypto
  if (isLocked(cryptoId)) {
    return { shouldTrade: false, action: null, reason: 'Trade already in progress' };
  }
  
  const { crypto, settings, status } = state;
  
  // If no current price, we can't make a decision
  if (!crypto.currentPrice) {
    return { shouldTrade: false, action: null, reason: 'No current price available' };
  }
  
  // If status is idle, we should buy
  if (status === 'idle') {
    return { 
      shouldTrade: true, 
      action: 'buy', 
      reason: 'Initial buy for micro processing cycle' 
    };
  }
  
  // If status is selling, check if we should sell based on the sell percentage
  if (status === 'selling') {
    // Get the reference price (either specified purchase price or last buy price)
    const referencePrice = settings.purchasePrice || settings.lastBuyPrice;
    
    if (!referencePrice) {
      return { 
        shouldTrade: false, 
        action: null, 
        reason: 'No reference price available for sell decision' 
      };
    }
    
    // Check if we've reached the sell percentage threshold
    const shouldSell = shouldSellCrypto(
      crypto.currentPrice,
      referencePrice,
      settings.sellPercentage
    );
    
    if (shouldSell) {
      return { 
        shouldTrade: true, 
        action: 'sell', 
        reason: `Price increased by ${((crypto.currentPrice - referencePrice) / referencePrice * 100).toFixed(2)}%, exceeding threshold of ${settings.sellPercentage}%` 
      };
    }
  }
  
  return { shouldTrade: false, action: null, reason: 'Conditions not met' };
}

/**
 * Acquire a lock for trading a specific crypto
 */
export function acquireLock(cryptoId: string, action: 'buy' | 'sell'): boolean {
  if (tradeLocks.has(cryptoId)) {
    return false;
  }
  
  tradeLocks.set(cryptoId, {
    lockedAt: new Date(),
    action
  });
  
  return true;
}

/**
 * Check if a crypto is locked for trading
 */
export function isLocked(cryptoId: string): boolean {
  if (!tradeLocks.has(cryptoId)) {
    return false;
  }
  
  const lock = tradeLocks.get(cryptoId);
  const now = new Date();
  const lockAge = now.getTime() - lock!.lockedAt.getTime();
  
  // If the lock is older than 5 minutes, consider it expired
  if (lockAge > 5 * 60 * 1000) {
    tradeLocks.delete(cryptoId);
    return false;
  }
  
  return true;
}

/**
 * Release a lock for a specific crypto
 */
export function releaseLock(cryptoId: string): void {
  tradeLocks.delete(cryptoId);
}

/**
 * Update the micro processing status for a crypto
 */
export function updateMicroProcessingStatus(
  cryptoId: string, 
  status: 'idle' | 'buying' | 'selling' | 'processing',
  additionalData?: Partial<MicroProcessingSettings>
): void {
  const state = microProcessingState.get(cryptoId);
  
  if (!state) {
    return;
  }
  
  // Update the status
  state.status = status;
  state.lastAction = new Date();
  
  // Update additional data if provided
  if (additionalData) {
    state.settings = {
      ...state.settings,
      ...additionalData
    };
  }
  
  // Update the state map
  microProcessingState.set(cryptoId, state);
  
  console.log(`Updated micro processing status for ${state.crypto.symbol} to ${status}`);
}

/**
 * Calculate the number of shares to buy based on settings
 */
export function calculateBuyShares(cryptoId: string, currentPrice: number): number {
  const state = microProcessingState.get(cryptoId);
  
  if (!state) {
    return 0;
  }
  
  const { settings } = state;
  
  if (settings.tradeByValue) {
    // Calculate shares based on total value
    return settings.totalValue / currentPrice;
  } else {
    // Use the specified number of shares
    return settings.tradeByShares;
  }
}

/**
 * Process a micro trade (buy or sell)
 */
export async function processMicroTrade(
  cryptoId: string, 
  action: 'buy' | 'sell'
): Promise<{
  success: boolean;
  message: string;
  transaction?: any;
}> {
  const state = microProcessingState.get(cryptoId);
  
  if (!state) {
    return { success: false, message: 'Crypto not found in micro processing state' };
  }
  
  const { crypto, settings } = state;
  
  // Log the current state and settings
  console.log(`Processing micro trade for ${crypto.symbol}: ${action}`, {
    currentPrice: crypto.currentPrice,
    lastBuyPrice: settings.lastBuyPrice,
    testMode: settings.testMode,
    processingStatus: settings.processingStatus
  });
  
  // Acquire a lock for this trade
  if (!acquireLock(cryptoId, action)) {
    return { success: false, message: 'Trade already in progress' };
  }
  
  try {
    // Update status to processing
    updateMicroProcessingStatus(cryptoId, 'processing');
    
    // Get the current price
    const currentPrice = crypto.currentPrice;
    
    if (!currentPrice) {
      throw new Error('No current price available');
    }
    
    // Calculate shares based on action
    let shares: number;
    
    if (action === 'buy') {
      // Validate currentPrice before calculating shares
      if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
        throw new Error(`Invalid current price for ${crypto.symbol}: ${currentPrice}`);
      }
      
      shares = calculateBuyShares(cryptoId, currentPrice);
      
      // Validate calculated shares
      if (!shares || isNaN(shares) || shares <= 0) {
        throw new Error(`Invalid calculated shares for ${crypto.symbol}: ${shares}`);
      }
    } else {
      // For sell, use the last buy shares
      shares = settings.lastBuyShares || 0;
      
      if (!shares || isNaN(shares) || shares <= 0) {
        throw new Error(`No valid shares available to sell for ${crypto.symbol}: ${shares}`);
      }
    }
    
    // Log the calculated shares for debugging
    console.log(`Calculated ${action} shares for ${crypto.symbol}:`, {
      shares,
      currentPrice,
      action
    });
    
    // Check if manual trading is enabled in settings
    try {
      const settingsResponse = await fetch('/api/settings', {
        ...getStandardRequestConfig(),
        method: 'GET'
      });
      
      if (!settingsResponse.ok) {
        throw new Error('Failed to fetch settings');
      }
      
      const settings = await settingsResponse.json();
      
      if (settings.enableManualCryptoTrading !== true) {
        throw new Error('Manual crypto trading is not enabled. Please enable it in settings.');
      }
    } catch (settingsError) {
      console.error('Error checking manual trading settings:', settingsError);
      throw settingsError;
    }
    
    // Generate a unique request ID for tracking this specific trade
    const tradeRequestId = `trade_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Execute the trade via API with standardized request configuration
    console.log(`[${tradeRequestId}] Executing ${action} trade for ${crypto.symbol} using Binance platform (testMode: ${settings.testMode ? 'enabled' : 'disabled'})`);
    
    // Add detailed logging for trade parameters to help diagnose issues
    console.log(`[${tradeRequestId}] Trade parameters before validation:`, {
      cryptoId: cryptoId,
      cryptoIdType: typeof cryptoId,
      cryptoIdIsNull: cryptoId === null,
      cryptoIdIsUndefined: cryptoId === undefined,
      
      action: action,
      actionType: typeof action,
      actionIsNull: action === null,
      actionIsUndefined: action === undefined,
      
      shares: shares,
      sharesType: typeof shares,
      sharesIsNull: shares === null,
      sharesIsUndefined: shares === undefined,
      sharesIsNaN: isNaN(shares),
      sharesValue: Number(shares),
      
      currentPrice: currentPrice,
      currentPriceType: typeof currentPrice,
      currentPriceIsNull: currentPrice === null,
      currentPriceIsUndefined: currentPrice === undefined,
      currentPriceIsNaN: isNaN(currentPrice),
      currentPriceValue: Number(currentPrice),
      
      symbol: crypto.symbol,
      testMode: settings.testMode,
      timestamp: new Date().toISOString()
    });
    
    // Validate all required parameters before creating the request payload
    if (!cryptoId || typeof cryptoId !== 'string') {
      throw new Error(`Invalid cryptoId: ${cryptoId}. Must be a non-empty string.`);
    }
    
    if (!action || typeof action !== 'string' || !['buy', 'sell'].includes(action.toLowerCase())) {
      throw new Error(`Invalid action: ${action}. Must be 'buy' or 'sell'.`);
    }
    
    if (!shares || isNaN(shares) || shares <= 0) {
      throw new Error(`Invalid shares: ${shares}. Must be a positive number.`);
    }
    
    if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
      throw new Error(`Invalid currentPrice: ${currentPrice}. Must be a positive number.`);
    }
    
    // Create a validated request payload with explicit type conversions
    // First, ensure all values are valid
    if (!cryptoId || typeof cryptoId !== 'string') {
      throw new Error(`Invalid cryptoId: ${cryptoId}. Must be a non-empty string.`);
    }
    
    if (!action || typeof action !== 'string' || !['buy', 'sell'].includes(action.toLowerCase())) {
      throw new Error(`Invalid action: ${action}. Must be 'buy' or 'sell'.`);
    }
    
    // Ensure shares is a valid number
    const validatedShares = Number(shares);
    if (isNaN(validatedShares) || validatedShares <= 0) {
      throw new Error(`Invalid shares: ${shares} (${typeof shares}). Must be a positive number.`);
    }
    
    // Ensure currentPrice is a valid number
    const validatedPrice = Number(currentPrice);
    if (isNaN(validatedPrice) || validatedPrice <= 0) {
      throw new Error(`Invalid currentPrice: ${currentPrice} (${typeof currentPrice}). Must be a positive number.`);
    }
    
    // Create a payload for the binance-trade.ts API endpoint
    // Note: These parameters will be processed by our API endpoint, not sent directly to Binance API
    // The API endpoint will extract only the required parameters for the Binance API
    const requestPayload = {
      cryptoId: String(cryptoId),
      side: String(action).toUpperCase(), // Use 'side' instead of 'action' to match Binance API naming
      quantity: validatedShares,
      type: 'MARKET', // Use 'type' instead of 'orderType' to match Binance API naming
      testMode: Boolean(settings.testMode),
      useTestEndpoint: Boolean(settings.testMode)
    };
    
    // Log the test mode status
    console.log(`Trade request for ${crypto.symbol} with testMode: ${settings.testMode}`, {
      testMode: settings.testMode,
      useTestEndpoint: settings.testMode
    });
    
    // Log the final validated payload with detailed type information
    console.log(`[${tradeRequestId}] Trade request payload:`, {
      ...requestPayload,
      cryptoIdType: typeof requestPayload.cryptoId,
      actionType: typeof requestPayload.action,
      sharesType: typeof requestPayload.shares,
      sharesValue: requestPayload.shares,
      quantityType: typeof requestPayload.quantity,
      quantityValue: requestPayload.quantity,
      priceType: typeof requestPayload.price,
      priceValue: requestPayload.price,
      orderTypeType: typeof requestPayload.orderType,
      microProcessingType: typeof requestPayload.microProcessing,
      tradingPlatformType: typeof requestPayload.tradingPlatform,
      testModeType: typeof requestPayload.testMode
    });
    
    // Log detailed request parameters for debugging
    console.log(`[${tradeRequestId}] Trade API request details:`, {
      cryptoId: requestPayload.cryptoId,
      action: requestPayload.action,
      shares: requestPayload.shares,
      quantity: requestPayload.quantity,
      price: requestPayload.price,
      orderType: requestPayload.orderType,
      microProcessing: requestPayload.microProcessing,
      tradingPlatform: requestPayload.tradingPlatform,
      testMode: requestPayload.testMode,
      sharesType: typeof requestPayload.shares,
      sharesIsNaN: isNaN(requestPayload.shares),
      priceType: typeof requestPayload.price,
      priceIsNaN: isNaN(requestPayload.price),
      requestPayloadString: JSON.stringify(requestPayload)
    });
    
    // DETAILED LOGGING: Log the Request Data before calling the trade API
    // Use ERROR severity to ensure it shows up in the Error Logs tab
    autoTradeLogger.error(`[${tradeRequestId}] TRADE API REQUEST DATA - EXACT PAYLOAD BEING SENT`, {
      cryptoId: requestPayload.cryptoId,
      cryptoIdType: typeof requestPayload.cryptoId,
      cryptoIdIsNull: requestPayload.cryptoId === null,
      cryptoIdIsUndefined: requestPayload.cryptoId === undefined,
      cryptoIdValue: String(requestPayload.cryptoId),
      
      action: requestPayload.action,
      actionType: typeof requestPayload.action,
      actionIsNull: requestPayload.action === null,
      actionIsUndefined: requestPayload.action === undefined,
      actionValue: String(requestPayload.action),
      
      shares: requestPayload.shares,
      sharesType: typeof requestPayload.shares,
      sharesIsNaN: isNaN(requestPayload.shares),
      sharesIsNull: requestPayload.shares === null,
      sharesIsUndefined: requestPayload.shares === undefined,
      sharesValue: Number(requestPayload.shares),
      
      quantity: requestPayload.quantity,
      quantityType: typeof requestPayload.quantity,
      quantityIsNaN: isNaN(requestPayload.quantity),
      quantityIsNull: requestPayload.quantity === null,
      quantityIsUndefined: requestPayload.quantity === undefined,
      quantityValue: Number(requestPayload.quantity),
      
      price: requestPayload.price,
      priceType: typeof requestPayload.price,
      priceIsNaN: isNaN(requestPayload.price),
      priceIsNull: requestPayload.price === null,
      priceIsUndefined: requestPayload.price === undefined,
      priceValue: Number(requestPayload.price),
      
      orderType: requestPayload.orderType,
      orderTypeType: typeof requestPayload.orderType,
      orderTypeIsNull: requestPayload.orderType === null,
      orderTypeIsUndefined: requestPayload.orderType === undefined,
      orderTypeValue: String(requestPayload.orderType),
      
      microProcessing: requestPayload.microProcessing,
      microProcessingType: typeof requestPayload.microProcessing,
      microProcessingIsNull: requestPayload.microProcessing === null,
      microProcessingIsUndefined: requestPayload.microProcessing === undefined,
      microProcessingValue: String(requestPayload.microProcessing),
      
      tradingPlatform: requestPayload.tradingPlatform,
      tradingPlatformType: typeof requestPayload.tradingPlatform,
      tradingPlatformIsNull: requestPayload.tradingPlatform === null,
      tradingPlatformIsUndefined: requestPayload.tradingPlatform === undefined,
      tradingPlatformValue: String(requestPayload.tradingPlatform),
      
      testMode: requestPayload.testMode,
      testModeType: typeof requestPayload.testMode,
      testModeIsNull: requestPayload.testMode === null,
      testModeIsUndefined: requestPayload.testMode === undefined,
      testModeValue: String(requestPayload.testMode),
      
      useTestEndpoint: requestPayload.useTestEndpoint,
      useTestEndpointType: typeof requestPayload.useTestEndpoint,
      useTestEndpointIsNull: requestPayload.useTestEndpoint === null,
      useTestEndpointIsUndefined: requestPayload.useTestEndpoint === undefined,
      useTestEndpointValue: String(requestPayload.useTestEndpoint),
      
      // Include the complete payload as both string and object for easier debugging
      fullPayload: JSON.stringify(requestPayload),
      rawPayload: requestPayload,
      timestamp: new Date().toISOString()
    });
    
    // Make the API request with enhanced error handling
    let response;
    try {
      // Add request ID to headers for tracking
      const requestConfig = {
        ...getStandardRequestConfig(),
        method: 'POST',
        headers: {
          ...getStandardRequestConfig().headers,
          'X-Request-ID': tradeRequestId,
          'X-Micro-Processing': 'true'
        },
        body: JSON.stringify(requestPayload)
      };
      
      // Log the complete request configuration with ERROR severity to ensure it shows in Error Logs tab
      autoTradeLogger.error(`[${tradeRequestId}] COMPLETE REQUEST CONFIGURATION`, {
        method: requestConfig.method,
        headers: JSON.stringify(requestConfig.headers),
        bodyLength: requestConfig.body ? requestConfig.body.length : 0,
        bodyContent: requestConfig.body, // Log the complete body content
        bodyContentType: typeof requestConfig.body,
        bodyContentIsNull: requestConfig.body === null,
        bodyContentIsUndefined: requestConfig.body === undefined,
        timestamp: new Date().toISOString()
      });
      
      console.log(`[${tradeRequestId}] Sending trade API request to /api/cryptos/binance-trade`);
      
      response = await fetch('/api/cryptos/binance-trade', requestConfig);
      
      console.log(`[${tradeRequestId}] Trade API response status: ${response.status} ${response.statusText}`);
      
      // Store the response status for error handling
      const responseStatus = response.status;
      const responseStatusText = response.statusText;
      
      if (!response.ok) {
        let errorData;
        let errorText = '';
        
        try {
          // Try to parse error response as JSON
          errorText = await response.text();
          console.log(`[${tradeRequestId}] Raw error response:`, errorText.substring(0, 500));
          
          // Log the complete error response to Error Logs tab
          autoTradeLogger.error(`[${tradeRequestId}] COMPLETE ERROR RESPONSE FROM BINANCE TRADE API`, {
            status: responseStatus,
            statusText: responseStatusText,
            rawResponse: errorText,
            responseLength: errorText.length,
            timestamp: new Date().toISOString()
          });
          
          try {
            // Attempt to parse as JSON
            errorData = JSON.parse(errorText);
            console.error(`[${tradeRequestId}] Trade API error response (parsed):`, errorData);
            
            // Log the parsed error data to Error Logs tab
            autoTradeLogger.error(`[${tradeRequestId}] PARSED ERROR RESPONSE`, {
              errorData,
              error: errorData.error,
              details: errorData.details,
              errorType: errorData.errorType,
              requestInfo: errorData.requestInfo,
              timestamp: new Date().toISOString()
            });
          } catch (jsonError) {
            // If JSON parsing fails, use the text directly
            console.error(`[${tradeRequestId}] Trade API error (non-JSON response):`, errorText.substring(0, 200));
            errorData = { 
              error: 'Invalid error response format', 
              details: errorText.substring(0, 100),
              rawResponse: errorText.substring(0, 500)
            };
            
            // Log the JSON parsing error to Error Logs tab
            autoTradeLogger.error(`[${tradeRequestId}] JSON PARSING ERROR FOR ERROR RESPONSE`, {
              jsonError: jsonError.message,
              errorText: errorText,
              timestamp: new Date().toISOString()
            });
          }
        } catch (responseError) {
          console.error(`[${tradeRequestId}] Error reading response body:`, responseError);
          errorData = { 
            error: 'Failed to read error response', 
            details: responseError.message 
          };
          
          // Log the response reading error to Error Logs tab
          autoTradeLogger.error(`[${tradeRequestId}] ERROR READING RESPONSE BODY`, {
            responseError: responseError.message,
            stack: responseError.stack,
            timestamp: new Date().toISOString()
          });
        }
        
        // Create a detailed error object
        const apiError = new Error(
          errorData.error || 
          errorData.message || 
          `API error: ${responseStatus} ${responseStatusText}`
        );
        
        // Add additional properties to the error object
        (apiError as any).status = responseStatus;
        (apiError as any).statusText = responseStatusText;
        (apiError as any).details = errorData.details || errorText;
        (apiError as any).rawResponse = errorText;
        (apiError as any).requestId = tradeRequestId;
        (apiError as any).requestPayload = requestPayload; // Include the original request payload
        
        // Log the complete error object to Error Logs tab
        autoTradeLogger.error(`[${tradeRequestId}] COMPLETE API ERROR OBJECT`, {
          message: apiError.message,
          status: (apiError as any).status,
          statusText: (apiError as any).statusText,
          details: (apiError as any).details,
          requestId: (apiError as any).requestId,
          requestPayload: (apiError as any).requestPayload,
          timestamp: new Date().toISOString()
        });
        
        throw apiError;
      }
    } catch (fetchError) {
      console.error(`[${tradeRequestId}] Network error during trade API call for ${crypto.symbol}:`, fetchError);
      
      // Log the network error to Error Logs tab
      autoTradeLogger.error(`[${tradeRequestId}] NETWORK ERROR DURING TRADE API CALL`, {
        symbol: crypto.symbol,
        error: fetchError.message,
        stack: fetchError.stack,
        requestPayload: requestPayload,
        timestamp: new Date().toISOString()
      });
      
      throw new Error(`Network error during trade: ${fetchError.message}`);
    }
    
    // Parse the successful response with enhanced error handling
    let transaction;
    let responseText = '';
    
    try {
      // First get the response as text for logging
      responseText = await response.text();
      console.log(`[${tradeRequestId}] Raw response for ${crypto.symbol}:`, responseText.substring(0, 500));
      
      // Validate response text
      if (!responseText || responseText.trim() === '') {
        console.error(`[${tradeRequestId}] Empty response received for ${crypto.symbol}`);
        throw new Error('Received empty response from API');
      }
      
      try {
        // Then parse it as JSON with explicit error handling
        transaction = JSON.parse(responseText);
      } catch (jsonError) {
        console.error(`[${tradeRequestId}] JSON parse error:`, jsonError);
        console.error(`[${tradeRequestId}] Failed JSON content:`, responseText.substring(0, 1000));
        throw new Error(`Failed to parse JSON response: ${jsonError.message}`);
      }
      
      // Validate transaction data with detailed checks
      if (!transaction) {
        console.error(`[${tradeRequestId}] Null transaction data received for ${crypto.symbol}`);
        throw new Error('Received null transaction data from API');
      }
      
      // Check for error response that might have been parsed as valid JSON
      if (transaction.error) {
        console.error(`[${tradeRequestId}] Error in transaction response:`, transaction.error);
        throw new Error(`API returned error: ${transaction.error} - ${transaction.details || ''}`);
      }
      
      // Log successful transaction data
      console.log(`[${tradeRequestId}] Successfully received transaction data for ${crypto.symbol}:`, {
        transactionId: transaction.transaction?.id,
        action: transaction.transaction?.action,
        shares: transaction.transaction?.shares,
        hasTransaction: !!transaction.transaction,
        responseKeys: Object.keys(transaction),
        transactionType: typeof transaction,
        transactionIsArray: Array.isArray(transaction)
      });
    } catch (parseError) {
      console.error(`[${tradeRequestId}] Error processing transaction response for ${crypto.symbol}:`, parseError);
      console.error(`[${tradeRequestId}] Raw response that failed processing:`, responseText.substring(0, 1000));
      
      // Create a more detailed error with context
      const enhancedError = new Error(`Failed to process transaction response: ${parseError.message}`);
      (enhancedError as any).originalError = parseError;
      (enhancedError as any).responseText = responseText.substring(0, 500);
      (enhancedError as any).requestId = tradeRequestId;
      
      throw enhancedError;
    }
    
    // Update the micro processing state based on the action
    if (action === 'buy') {
      updateMicroProcessingStatus(cryptoId, 'selling', {
        lastBuyPrice: currentPrice,
        lastBuyShares: shares,
        lastBuyTimestamp: new Date(),
        processingStatus: 'selling'
      });
      
      // Also update the server-side state
      await updateServerState(cryptoId, {
        lastBuyPrice: currentPrice,
        lastBuyShares: shares,
        lastBuyTimestamp: new Date(),
        processingStatus: 'selling'
      });
      
      return { 
        success: true, 
        message: `Successfully bought ${shares} shares of ${crypto.symbol} at $${currentPrice}`,
        transaction
      };
    } else {
      // Reset the state for the next cycle
      updateMicroProcessingStatus(cryptoId, 'idle', {
        lastBuyPrice: undefined,
        lastBuyShares: undefined,
        lastBuyTimestamp: undefined,
        processingStatus: 'idle'
      });
      
      // Also update the server-side state
      await updateServerState(cryptoId, {
        lastBuyPrice: null,
        lastBuyShares: null,
        lastBuyTimestamp: null,
        processingStatus: 'idle'
      });
      
      return { 
        success: true, 
        message: `Successfully sold ${shares} shares of ${crypto.symbol} at $${currentPrice}`,
        transaction
      };
    }
  } catch (error) {
    console.error(`Error processing micro trade for ${crypto.symbol}:`, error);
    
    // Reset the status to the previous state
    if (action === 'buy') {
      updateMicroProcessingStatus(cryptoId, 'idle');
    } else {
      updateMicroProcessingStatus(cryptoId, 'selling');
    }
    
    return { 
      success: false, 
      message: `Failed to ${action} ${crypto.symbol}: ${error.message}` 
    };
  } finally {
    // Release the lock
    releaseLock(cryptoId);
  }
}

// Get the authentication token from the AuthContext
function getAuthToken(): string | null {
  try {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined') {
      // Access the AuthContext from the global window object
      // This is a workaround since we can't use React hooks directly in a non-component file
      const authState = (window as any).__AUTH_STATE__;
      return authState?.token || null;
    }
  } catch (error) {
    console.error('Error getting auth token:', error);
  }
  return null;
}

// Standard request configuration for all API calls with dynamic token
function getStandardRequestConfig() {
  const token = getAuthToken();
  
  // Log token status for debugging (without revealing the actual token)
  console.log('[MICRO-SERVICE] Preparing request config:', { 
    hasToken: !!token,
    tokenLength: token ? token.length : 0
  });
  
  return {
    credentials: 'include' as RequestCredentials,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Client-Info': 'client-micro-processing-service',
      // Add auth token if available
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  };
}

/**
 * Update the server-side state of micro processing with enhanced error handling
 */
async function updateServerState(
  cryptoId: string, 
  settings: Partial<MicroProcessingSettings>
): Promise<void> {
  // Generate a request ID for tracking
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  try {
    console.log(`[${requestId}] Updating server state for crypto ${cryptoId}`);
    
    // Validate inputs
    if (!cryptoId) {
      throw new Error('Cannot update server state: Missing cryptoId');
    }
    
    // Ensure settings is not null or undefined
    const validSettings = settings || {};
    
    // Remove the crypto property if it exists to avoid circular references
    const { crypto, ...settingsWithoutCrypto } = validSettings;
    
    // Log sanitized settings (without sensitive data)
    console.log(`[${requestId}] Settings to update:`, {
      enabled: settingsWithoutCrypto.enabled,
      sellPercentage: settingsWithoutCrypto.sellPercentage,
      tradeByShares: settingsWithoutCrypto.tradeByShares,
      tradeByValue: settingsWithoutCrypto.tradeByValue,
      processingStatus: settingsWithoutCrypto.processingStatus
    });
    
    // Create request config with request ID for tracking
    const requestConfig = {
      ...getStandardRequestConfig(),
      method: 'POST',
      headers: {
        ...getStandardRequestConfig().headers,
        'X-Request-ID': requestId
      },
      body: JSON.stringify({
        cryptoId,
        settings: settingsWithoutCrypto
      })
    };
    
    console.log(`[${requestId}] Sending request to update server state`);
    const response = await fetch('/api/cryptos/micro-processing-settings', requestConfig);
    
    if (!response.ok) {
      let errorData;
      try {
        // Try to parse error response as JSON
        errorData = await response.json();
        console.error(`[${requestId}] Failed to update server state:`, errorData);
      } catch (parseError) {
        // If JSON parsing fails, try to get text
        const errorText = await response.text();
        console.error(`[${requestId}] Failed to update server state (non-JSON response):`, 
          errorText.substring(0, 200));
        errorData = { error: 'Invalid response format', details: errorText.substring(0, 100) };
      }
      
      // Create detailed error object
      const apiError = new Error(`API error: ${errorData.error || 'Unknown error'} - ${errorData.details || ''}`);
      (apiError as any).status = response.status;
      (apiError as any).details = errorData;
      (apiError as any).requestId = requestId;
      
      throw apiError;
    } else {
      console.log(`[${requestId}] Successfully updated server state for crypto ${cryptoId}`);
    }
  } catch (error) {
    console.error(`[${requestId}] Error updating server state for crypto ${cryptoId}:`, error);
    
    // Add request ID to error for tracking
    if (error instanceof Error) {
      (error as any).requestId = requestId;
    }
    
    // Re-throw the error to allow the caller to handle it
    throw error;
  }
}

/**
 * Get all cryptos with enabled micro processing
 */
export function getEnabledMicroProcessingCryptos(): MicroProcessingCrypto[] {
  const enabledCryptos: MicroProcessingCrypto[] = [];
  
  for (const state of microProcessingState.values()) {
    if (state.settings.enabled) {
      enabledCryptos.push(state.crypto);
    }
  }
  
  return enabledCryptos;
}

/**
 * Process all enabled micro processing cryptos
 */
export async function processAllMicroProcessingCryptos(): Promise<{
  success: boolean;
  processed: number;
  errors: number;
  messages: string[];
}> {
  const result = {
    success: true,
    processed: 0,
    errors: 0,
    messages: [] as string[]
  };
  
  try {
    // Get all enabled cryptos
    const enabledCryptos = getEnabledMicroProcessingCryptos();
    
    console.log(`Processing ${enabledCryptos.length} enabled micro processing cryptos`);
    
    if (enabledCryptos.length === 0) {
      result.messages.push('No enabled micro processing cryptos found');
      return result;
    }
    
    // Process each crypto
    for (const crypto of enabledCryptos) {
      try {
        if (!crypto || !crypto.id) {
          console.warn('Invalid crypto object found in enabled cryptos:', crypto);
          result.errors++;
          result.messages.push('Encountered invalid crypto data');
          continue;
        }
        
        // Additional null checks for critical properties
        if (!crypto.symbol) {
          console.warn('Crypto missing symbol:', crypto.id);
          result.errors++;
          result.messages.push(`Crypto ${crypto.id} missing symbol`);
          continue;
        }
        
        console.log(`Processing crypto: ${crypto.symbol} (${crypto.id})`);
        
        // Check if we should trade
        const tradeDecision = shouldMicroTrade(crypto.id);
        
        // Add null check for tradeDecision
        if (!tradeDecision) {
          console.error(`shouldMicroTrade returned null for ${crypto.symbol} (${crypto.id})`);
          result.errors++;
          result.messages.push(`Error evaluating trade decision for ${crypto.symbol}: null result`);
          continue;
        }
        
        if (tradeDecision.shouldTrade && tradeDecision.action) {
          console.log(`Trade decision for ${crypto.symbol}: ${tradeDecision.action} - ${tradeDecision.reason}`);
          
          try {
            // Process the trade with additional error handling
            const tradeResult = await processMicroTrade(crypto.id, tradeDecision.action);
            
            // Add null check for tradeResult
            if (!tradeResult) {
              throw new Error('Received null result from processMicroTrade');
            }
            
            if (tradeResult.success) {
              result.processed++;
              result.messages.push(tradeResult.message);
            } else {
              result.errors++;
              result.messages.push(tradeResult.message);
            }
          } catch (tradeError: any) {
            console.error(`Error during trade execution for ${crypto.symbol}:`, tradeError);
            result.errors++;
            result.messages.push(`Trade execution error for ${crypto.symbol}: ${tradeError.message || 'Unknown error'}`);
          }
        } else {
          console.log(`No trade needed for ${crypto.symbol}: ${tradeDecision.reason}`);
        }
      } catch (error: any) {
        console.error(`Error processing individual crypto ${crypto?.symbol || 'unknown'}:`, error);
        result.errors++;
        result.messages.push(`Error processing ${crypto?.symbol || 'unknown'}: ${error?.message || 'Unknown error'}`);
      }
    }
  } catch (error: any) {
    console.error('Critical error in processAllMicroProcessingCryptos:', error);
    result.success = false;
    result.errors++;
    result.messages.push(`Critical error: ${error?.message || 'Unknown error'}`);
  }
  
  // Set overall success based on errors
  result.success = result.errors === 0;
  
  console.log(`Micro processing complete: ${result.processed} processed, ${result.errors} errors`);
  return result;
}