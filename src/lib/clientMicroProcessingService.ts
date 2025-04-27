import { updatePriceCache, getCachedPrice } from '@/lib/priceCache';
import { shouldSellCrypto } from '@/lib/kraken';

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
    
    // Execute the trade via API with standardized request configuration
    console.log(`Executing ${action} trade for ${crypto.symbol} using Binance platform (testMode: ${settings.testMode ? 'enabled' : 'disabled'})`);
    
    // Log the request payload for debugging
    const requestPayload = {
      cryptoId,
      action,
      shares,
      price: currentPrice,
      orderType: 'market',
      microProcessing: true,
      tradingPlatform: 'binance', // Explicitly set to use Binance
      testMode: settings.testMode // Pass the testMode setting to the API
    };
    
    console.log('Trade request payload:', requestPayload);
    
    // Log detailed request parameters for debugging
    console.log('Trade API request details:', {
      cryptoId,
      action,
      shares,
      price: currentPrice,
      orderType: 'market',
      microProcessing: true,
      tradingPlatform: 'binance',
      testMode: settings.testMode,
      sharesType: typeof shares,
      sharesIsNaN: isNaN(shares),
      priceType: typeof currentPrice,
      priceIsNaN: isNaN(currentPrice),
      requestPayloadString: JSON.stringify(requestPayload)
    });
    
    // Make the API request with enhanced error handling
    let response;
    try {
      response = await fetch('/api/cryptos/trade', {
        ...getStandardRequestConfig(),
        method: 'POST',
        body: JSON.stringify(requestPayload)
      });
      
      console.log(`Trade API response status: ${response.status} ${response.statusText}`);
      
      // Store the response status for error handling
      const responseStatus = response.status;
      const responseStatusText = response.statusText;
      
      if (!response.ok) {
        let errorData;
        let errorText = '';
        
        try {
          // Try to parse error response as JSON
          errorText = await response.text();
          console.log('Raw error response:', errorText.substring(0, 500));
          
          try {
            // Attempt to parse as JSON
            errorData = JSON.parse(errorText);
            console.error('Trade API error response (parsed):', errorData);
          } catch (jsonError) {
            // If JSON parsing fails, use the text directly
            console.error('Trade API error (non-JSON response):', errorText.substring(0, 200));
            errorData = { 
              error: 'Invalid error response format', 
              details: errorText.substring(0, 100),
              rawResponse: errorText.substring(0, 500)
            };
          }
        } catch (responseError) {
          console.error('Error reading response body:', responseError);
          errorData = { 
            error: 'Failed to read error response', 
            details: responseError.message 
          };
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
        
        throw apiError;
      }
    } catch (fetchError) {
      console.error(`Network error during trade API call for ${crypto.symbol}:`, fetchError);
      throw new Error(`Network error during trade: ${fetchError.message}`);
    }
    
    // Parse the successful response
    let transaction;
    let responseText = '';
    
    try {
      // First get the response as text for logging
      responseText = await response.text();
      console.log(`Raw response for ${crypto.symbol}:`, responseText.substring(0, 500));
      
      // Then parse it as JSON
      if (responseText) {
        transaction = JSON.parse(responseText);
      } else {
        console.error(`Empty response received for ${crypto.symbol}`);
        throw new Error('Received empty response from API');
      }
      
      // Validate transaction data
      if (!transaction) {
        console.error(`Null transaction data received for ${crypto.symbol}`);
        throw new Error('Received null transaction data from API');
      }
      
      console.log(`Successfully received transaction data for ${crypto.symbol}:`, {
        transactionId: transaction.transaction?.id,
        action: transaction.transaction?.action,
        shares: transaction.transaction?.shares,
        hasTransaction: !!transaction.transaction,
        responseKeys: Object.keys(transaction)
      });
    } catch (parseError) {
      console.error(`Error parsing transaction response for ${crypto.symbol}:`, parseError);
      console.error('Raw response that failed parsing:', responseText.substring(0, 1000));
      throw new Error(`Failed to parse transaction response: ${parseError.message}. Raw response: ${responseText.substring(0, 200)}`);
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