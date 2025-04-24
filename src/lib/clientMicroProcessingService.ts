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
  if (!crypto.microProcessingSettings?.enabled) {
    return;
  }

  const settings = crypto.microProcessingSettings;
  
  // Initialize or update the state
  microProcessingState.set(crypto.id, {
    status: settings.processingStatus || 'idle',
    lastAction: new Date(),
    crypto,
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
      shares = calculateBuyShares(cryptoId, currentPrice);
    } else {
      // For sell, use the last buy shares
      shares = settings.lastBuyShares || 0;
      
      if (shares <= 0) {
        throw new Error('No shares available to sell');
      }
    }
    
    // Execute the trade via API with standardized request configuration
    const response = await fetch('/api/cryptos/trade', {
      ...standardRequestConfig,
      method: 'POST',
      body: JSON.stringify({
        cryptoId,
        action,
        shares,
        price: currentPrice,
        orderType: 'market',
        microProcessing: true
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to execute trade');
    }
    
    const transaction = await response.json();
    
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

// Standard request configuration for all API calls
const standardRequestConfig = {
  credentials: 'include' as RequestCredentials,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  }
};

/**
 * Update the server-side state of micro processing
 */
async function updateServerState(
  cryptoId: string, 
  settings: Partial<MicroProcessingSettings>
): Promise<void> {
  try {
    console.log(`Updating server state for crypto ${cryptoId} with settings:`, settings);
    
    // Ensure settings is not null or undefined
    const validSettings = settings || {};
    
    // Remove the crypto property if it exists to avoid circular references
    const { crypto, ...settingsWithoutCrypto } = validSettings;
    
    const response = await fetch('/api/cryptos/micro-processing-settings', {
      ...standardRequestConfig,
      method: 'POST',
      body: JSON.stringify({
        cryptoId,
        settings: settingsWithoutCrypto
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error(`Failed to update server state for crypto ${cryptoId}:`, errorData);
      throw new Error(`API error: ${errorData.error || 'Unknown error'} - ${errorData.details || ''}`);
    } else {
      console.log(`Successfully updated server state for crypto ${cryptoId}`);
    }
  } catch (error) {
    console.error(`Error updating server state for crypto ${cryptoId}:`, error);
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
  
  // Get all enabled cryptos
  const enabledCryptos = getEnabledMicroProcessingCryptos();
  
  if (enabledCryptos.length === 0) {
    result.messages.push('No enabled micro processing cryptos found');
    return result;
  }
  
  // Process each crypto
  for (const crypto of enabledCryptos) {
    try {
      // Check if we should trade
      const tradeDecision = shouldMicroTrade(crypto.id);
      
      if (tradeDecision.shouldTrade && tradeDecision.action) {
        // Process the trade
        const tradeResult = await processMicroTrade(crypto.id, tradeDecision.action);
        
        if (tradeResult.success) {
          result.processed++;
          result.messages.push(tradeResult.message);
        } else {
          result.errors++;
          result.messages.push(tradeResult.message);
        }
      }
    } catch (error) {
      result.errors++;
      result.messages.push(`Error processing ${crypto.symbol}: ${error.message}`);
    }
  }
  
  // Set overall success based on errors
  result.success = result.errors === 0;
  
  return result;
}