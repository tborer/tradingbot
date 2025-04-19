/**
 * In-memory price cache for cryptocurrency prices
 * This reduces database writes and allows client-side evaluation of trading conditions
 * Optimized with Map for better lookup performance
 */

// Define the price cache entry type
export interface PriceCacheEntry {
  symbol: string;
  price: number;
  timestamp: number;
  previousPrice?: number;
}

// Use Map instead of object for better performance with string keys
// Maps have better performance characteristics for frequent additions and lookups
const priceCache = new Map<string, PriceCacheEntry>();

// Cache expiration time (5 minutes)
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;

/**
 * Update the price cache with new price data
 * @param symbol Cryptocurrency symbol
 * @param price Current price
 * @param timestamp Timestamp of the price update
 */
export function updatePriceCache(symbol: string, price: number, timestamp: number = Date.now()): void {
  // Store previous price before updating
  const previousPrice = priceCache.get(symbol)?.price;
  
  // Update the cache - Map.set is more efficient than object property assignment
  priceCache.set(symbol, {
    symbol,
    price,
    timestamp,
    previousPrice
  });
}

/**
 * Update multiple prices in the cache at once
 * @param prices Array of price updates
 */
export function batchUpdatePriceCache(prices: { symbol: string; price: number; timestamp?: number }[]): void {
  // Process all updates in a single loop for better performance
  const now = Date.now();
  
  for (const update of prices) {
    const symbol = update.symbol;
    const previousPrice = priceCache.get(symbol)?.price;
    
    priceCache.set(symbol, {
      symbol,
      price: update.price,
      timestamp: update.timestamp || now,
      previousPrice
    });
  }
}

/**
 * Get a price from the cache
 * @param symbol Cryptocurrency symbol
 * @returns The cached price entry or null if not found or expired
 */
export function getCachedPrice(symbol: string): PriceCacheEntry | null {
  const entry = priceCache.get(symbol);
  
  // Return null if no entry exists or if it's expired
  if (!entry || Date.now() - entry.timestamp > CACHE_EXPIRATION_MS) {
    return null;
  }
  
  return entry;
}

/**
 * Get all prices from the cache
 * @param includeExpired Whether to include expired entries
 * @returns Array of all cached price entries
 */
export function getAllCachedPrices(includeExpired: boolean = false): PriceCacheEntry[] {
  const now = Date.now();
  const result: PriceCacheEntry[] = [];
  
  // Using Map.forEach is more efficient than Object.values().filter()
  priceCache.forEach(entry => {
    if (includeExpired || (now - entry.timestamp <= CACHE_EXPIRATION_MS)) {
      result.push(entry);
    }
  });
  
  return result;
}

/**
 * Clear expired entries from the cache
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  
  // Using Map.forEach with delete is more efficient than Object.keys().forEach with delete
  priceCache.forEach((entry, symbol) => {
    if (now - entry.timestamp > CACHE_EXPIRATION_MS) {
      priceCache.delete(symbol);
    }
  });
}

/**
 * Check if a crypto should be bought based on cached price and threshold
 * @param symbol Cryptocurrency symbol
 * @param purchasePrice Purchase price to compare against
 * @param thresholdPercent Threshold percentage for buy condition
 * @returns Boolean indicating whether buy conditions are met
 */
export function shouldBuyCrypto(
  symbol: string,
  purchasePrice: number,
  thresholdPercent: number
): boolean {
  const cachedPrice = getCachedPrice(symbol);
  if (!cachedPrice) return false;
  
  // Handle edge cases with minimal logging
  if (purchasePrice <= 0 || cachedPrice.price <= 0) {
    return cachedPrice.price > 0;
  }
  
  // Calculate price drop percentage
  const percentDrop = ((purchasePrice - cachedPrice.price) / purchasePrice) * 100;
  
  // For buying, we want the price to have dropped by at least the threshold percentage
  return percentDrop >= thresholdPercent;
}

/**
 * Check if a crypto should be sold based on cached price and threshold
 * @param symbol Cryptocurrency symbol
 * @param purchasePrice Purchase price to compare against
 * @param thresholdPercent Threshold percentage for sell condition
 * @returns Boolean indicating whether sell conditions are met
 */
export function shouldSellCrypto(
  symbol: string,
  purchasePrice: number,
  thresholdPercent: number
): boolean {
  const cachedPrice = getCachedPrice(symbol);
  if (!cachedPrice) return false;
  
  // Handle edge cases with minimal logging
  if (purchasePrice <= 0 || cachedPrice.price <= 0) {
    return cachedPrice.price > 0;
  }
  
  // Calculate price gain percentage
  const percentGain = ((cachedPrice.price - purchasePrice) / purchasePrice) * 100;
  
  // For selling, we want the price to have increased by at least the threshold percentage
  return percentGain >= thresholdPercent;
}

/**
 * Evaluate trading conditions for a crypto based on cached prices
 * Optimized for performance with minimal logging and early returns
 * 
 * @param crypto The crypto object with trading settings
 * @param settings User settings with default thresholds
 * @returns Object with evaluation results
 */
export function evaluateTradingConditions(crypto: any, settings: any) {
  // Early returns for invalid inputs
  if (!crypto || !settings) return { shouldTrade: false };
  
  const cachedPrice = getCachedPrice(crypto.symbol);
  if (!cachedPrice) return { shouldTrade: false, reason: 'No price data available' };
  
  // Get auto trade settings using destructuring for cleaner code
  const {
    autoTradeSettings = {},
    autoBuy = false,
    autoSell = false,
    purchasePrice = 0,
    symbol
  } = crypto;
  
  const {
    buyThresholdPercent: defaultBuyThreshold = 5,
    sellThresholdPercent: defaultSellThreshold = 5
  } = settings;
  
  const {
    buyThresholdPercent = defaultBuyThreshold,
    sellThresholdPercent = defaultSellThreshold,
    enableContinuousTrading = false,
    oneTimeBuy = false,
    oneTimeSell = false,
    nextAction = 'buy'
  } = autoTradeSettings;
  
  // Prepare result object
  let result = {
    shouldTrade: false,
    action: null as 'buy' | 'sell' | null,
    reason: '',
    currentPrice: cachedPrice.price,
    purchasePrice,
    timestamp: cachedPrice.timestamp,
    nextAction,
    settings: {
      buyThreshold: buyThresholdPercent,
      sellThreshold: sellThresholdPercent,
      nextAction,
      oneTimeBuy,
      oneTimeSell,
      enableContinuous: enableContinuousTrading
    }
  };

  // Calculate percentages once for reuse
  const percentDrop = purchasePrice > 0 ? ((purchasePrice - cachedPrice.price) / purchasePrice * 100) : 0;
  const percentGain = purchasePrice > 0 ? ((cachedPrice.price - purchasePrice) / purchasePrice * 100) : 0;
  
  // Determine action based on nextAction setting
  if (nextAction === 'sell') {
    // Check sell conditions first
    if (autoSell && percentGain >= sellThresholdPercent) {
      result.shouldTrade = true;
      result.action = 'sell';
      result.reason = `Price increased by ${percentGain.toFixed(2)}%, exceeding threshold of ${sellThresholdPercent}%`;
      return result;
    }
    
    // Then check buy conditions if applicable
    if (autoBuy && oneTimeBuy && percentDrop >= buyThresholdPercent) {
      result.shouldTrade = true;
      result.action = 'buy';
      result.reason = `Price dropped by ${percentDrop.toFixed(2)}%, exceeding threshold of ${buyThresholdPercent}%`;
      return result;
    }
  } else {
    // Default: check buy conditions first
    if (autoBuy && percentDrop >= buyThresholdPercent) {
      result.shouldTrade = true;
      result.action = 'buy';
      result.reason = `Price dropped by ${percentDrop.toFixed(2)}%, exceeding threshold of ${buyThresholdPercent}%`;
      return result;
    }
    
    // Then check sell conditions if applicable
    if (autoSell && oneTimeSell && percentGain >= sellThresholdPercent) {
      result.shouldTrade = true;
      result.action = 'sell';
      result.reason = `Price increased by ${percentGain.toFixed(2)}%, exceeding threshold of ${sellThresholdPercent}%`;
      return result;
    }
  }

  return result;
}