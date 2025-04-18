/**
 * In-memory price cache for cryptocurrency prices
 * This reduces database writes and allows client-side evaluation of trading conditions
 */

// Define the price cache entry type
export interface PriceCacheEntry {
  symbol: string;
  price: number;
  timestamp: number;
  previousPrice?: number;
}

// Define the cache type
type PriceCache = {
  [symbol: string]: PriceCacheEntry;
};

// Global in-memory cache
let priceCache: PriceCache = {};

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
  const previousPrice = priceCache[symbol]?.price;
  
  // Update the cache
  priceCache[symbol] = {
    symbol,
    price,
    timestamp,
    previousPrice
  };
}

/**
 * Update multiple prices in the cache at once
 * @param prices Array of price updates
 */
export function batchUpdatePriceCache(prices: { symbol: string; price: number; timestamp?: number }[]): void {
  for (const update of prices) {
    updatePriceCache(update.symbol, update.price, update.timestamp || Date.now());
  }
}

/**
 * Get a price from the cache
 * @param symbol Cryptocurrency symbol
 * @returns The cached price entry or null if not found or expired
 */
export function getCachedPrice(symbol: string): PriceCacheEntry | null {
  const entry = priceCache[symbol];
  
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
  return Object.values(priceCache).filter(entry => {
    return includeExpired || (now - entry.timestamp <= CACHE_EXPIRATION_MS);
  });
}

/**
 * Clear expired entries from the cache
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  Object.keys(priceCache).forEach(symbol => {
    if (now - priceCache[symbol].timestamp > CACHE_EXPIRATION_MS) {
      delete priceCache[symbol];
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
  
  // Handle edge cases
  if (purchasePrice <= 0) {
    console.log(`BUY CHECK SKIPPED: Invalid purchase price (${purchasePrice}). Using current price as reference.`);
    return cachedPrice.price > 0;
  }
  
  if (cachedPrice.price <= 0) {
    console.log(`BUY CHECK FAILED: Invalid current price (${cachedPrice.price})`);
    return false;
  }
  
  const percentDrop = ((purchasePrice - cachedPrice.price) / purchasePrice) * 100;
  console.log(`BUY CHECK: Current: $${cachedPrice.price}, Purchase: $${purchasePrice}, Drop: ${percentDrop.toFixed(2)}%, Threshold: ${thresholdPercent}%`);
  
  // For buying, we want the price to have dropped by at least the threshold percentage
  const shouldBuy = percentDrop >= thresholdPercent;
  
  if (shouldBuy) {
    console.log(`BUY CONDITION MET: Price dropped by ${percentDrop.toFixed(2)}%, which is >= threshold of ${thresholdPercent}%`);
  } else {
    console.log(`BUY CONDITION NOT MET: ${percentDrop.toFixed(2)}% drop is less than threshold of ${thresholdPercent}%`);
  }
  
  return shouldBuy;
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
  
  // Handle edge cases
  if (purchasePrice <= 0) {
    console.log(`SELL CHECK SKIPPED: Invalid purchase price (${purchasePrice}). Using fallback comparison.`);
    return cachedPrice.price > 0;
  }
  
  if (cachedPrice.price <= 0) {
    console.log(`SELL CHECK FAILED: Invalid current price (${cachedPrice.price})`);
    return false;
  }
  
  const percentGain = ((cachedPrice.price - purchasePrice) / purchasePrice) * 100;
  console.log(`SELL CHECK: Current: $${cachedPrice.price}, Purchase: $${purchasePrice}, Gain: ${percentGain.toFixed(2)}%, Threshold: ${thresholdPercent}%`);
  
  // For selling, we want the price to have increased by at least the threshold percentage
  const shouldSell = percentGain >= thresholdPercent;
  
  if (shouldSell) {
    console.log(`SELL CONDITION MET: Price increased by ${percentGain.toFixed(2)}%, which is >= threshold of ${thresholdPercent}%`);
  } else {
    console.log(`SELL CONDITION NOT MET: ${percentGain.toFixed(2)}% gain is less than threshold of ${thresholdPercent}%`);
  }
  
  return shouldSell;
}

/**
 * Evaluate trading conditions for a crypto based on cached prices
 * @param crypto The crypto object with trading settings
 * @param settings User settings with default thresholds
 * @returns Object with evaluation results
 */
export function evaluateTradingConditions(crypto: any, settings: any) {
  if (!crypto || !settings) return { shouldTrade: false };
  
  const cachedPrice = getCachedPrice(crypto.symbol);
  if (!cachedPrice) return { shouldTrade: false, reason: 'No price data available' };
  
  // Get auto trade settings
  const buyThreshold = crypto.autoTradeSettings?.buyThresholdPercent || settings.buyThresholdPercent;
  const sellThreshold = crypto.autoTradeSettings?.sellThresholdPercent || settings.sellThresholdPercent;
  const enableContinuous = crypto.autoTradeSettings?.enableContinuousTrading || false;
  const oneTimeBuy = crypto.autoTradeSettings?.oneTimeBuy || false;
  const oneTimeSell = crypto.autoTradeSettings?.oneTimeSell || false;
  const nextAction = crypto.autoTradeSettings?.nextAction || 'buy';
  
  // Determine if we should buy or sell
  let shouldTrade = false;
  let action: 'buy' | 'sell' | null = null;
  let reason = '';

  // Check for auto buy conditions
  if (crypto.autoBuy && (nextAction === 'buy' || oneTimeBuy)) {
    if (shouldBuyCrypto(crypto.symbol, crypto.purchasePrice, buyThreshold)) {
      shouldTrade = true;
      action = 'buy';
      reason = `Price dropped by ${((crypto.purchasePrice - cachedPrice.price) / crypto.purchasePrice * 100).toFixed(2)}%, exceeding threshold of ${buyThreshold}%`;
    }
  }

  // Check for auto sell conditions
  if (!shouldTrade && crypto.autoSell && (nextAction === 'sell' || oneTimeSell)) {
    if (shouldSellCrypto(crypto.symbol, crypto.purchasePrice, sellThreshold)) {
      shouldTrade = true;
      action = 'sell';
      reason = `Price increased by ${((cachedPrice.price - crypto.purchasePrice) / crypto.purchasePrice * 100).toFixed(2)}%, exceeding threshold of ${sellThreshold}%`;
    }
  }

  return {
    shouldTrade,
    action,
    reason,
    currentPrice: cachedPrice.price,
    purchasePrice: crypto.purchasePrice,
    timestamp: cachedPrice.timestamp,
    settings: {
      buyThreshold,
      sellThreshold,
      nextAction,
      oneTimeBuy,
      oneTimeSell,
      enableContinuous
    }
  };
}