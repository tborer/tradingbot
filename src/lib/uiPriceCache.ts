/**
 * In-memory price cache specifically for UI display
 * This reduces database reads by caching current prices for display in the UI
 */

import { KrakenPrice } from './kraken';

// Define the UI price cache entry type
export interface UIPriceCacheEntry {
  symbol: string;
  price: number;
  timestamp: number;
  change?: number;  // Price change since last update
  changePercent?: number;  // Percentage change since last update
}

// Use Map for better performance with string keys
const uiPriceCache = new Map<string, UIPriceCacheEntry>();

// Cache expiration time (30 minutes)
const CACHE_EXPIRATION_MS = 30 * 60 * 1000;

/**
 * Update the UI price cache with new price data
 * @param symbol Cryptocurrency symbol
 * @param price Current price
 * @param timestamp Timestamp of the price update
 */
export function updateUIPriceCache(symbol: string, price: number, timestamp: number = Date.now()): void {
  const previousEntry = uiPriceCache.get(symbol);
  const previousPrice = previousEntry?.price;
  
  // Calculate change metrics if we have a previous price
  let change = undefined;
  let changePercent = undefined;
  
  if (previousPrice !== undefined) {
    change = price - previousPrice;
    changePercent = previousPrice > 0 ? (change / previousPrice) * 100 : 0;
  }
  
  // Update the cache
  uiPriceCache.set(symbol, {
    symbol,
    price,
    timestamp,
    change,
    changePercent
  });
}

/**
 * Update multiple prices in the UI cache at once
 * @param prices Array of price updates
 */
export function batchUpdateUIPriceCache(prices: KrakenPrice[]): void {
  const now = Date.now();
  
  for (const update of prices) {
    updateUIPriceCache(update.symbol, update.price, update.timestamp || now);
  }
}

/**
 * Get a price from the UI cache
 * @param symbol Cryptocurrency symbol
 * @returns The cached price entry or null if not found or expired
 */
export function getUICachedPrice(symbol: string): UIPriceCacheEntry | null {
  const entry = uiPriceCache.get(symbol);
  
  // Return null if no entry exists or if it's expired
  if (!entry || Date.now() - entry.timestamp > CACHE_EXPIRATION_MS) {
    return null;
  }
  
  return entry;
}

/**
 * Get all prices from the UI cache
 * @param includeExpired Whether to include expired entries
 * @returns Array of all cached price entries
 */
export function getAllUICachedPrices(includeExpired: boolean = false): UIPriceCacheEntry[] {
  const now = Date.now();
  const result: UIPriceCacheEntry[] = [];
  
  uiPriceCache.forEach(entry => {
    if (includeExpired || (now - entry.timestamp <= CACHE_EXPIRATION_MS)) {
      result.push(entry);
    }
  });
  
  return result;
}

/**
 * Clear expired entries from the UI cache*/
export function cleanupExpiredUIEntries(): void {
  const now = Date.now();
  
  uiPriceCache.forEach((entry, symbol) => {
    if (now - entry.timestamp > CACHE_EXPIRATION_MS) {
      uiPriceCache.delete(symbol);
    }
  });
}

/**
 * Get a formatted price string with change indicator
 * @param symbol Cryptocurrency symbol
 * @returns Formatted price string or null if not in cache
 */
export function getFormattedPrice(symbol: string): { price: string, change: string, direction: 'up' | 'down' | 'neutral' } | null {
  const entry = getUICachedPrice(symbol);
  
  if (!entry) {
    return null;
  }
  
  // Format the price with 2 decimal places
  const formattedPrice = `$${entry.price.toFixed(2)}`;
  
  // Format the change
  let formattedChange = '';
  let direction: 'up' | 'down' | 'neutral' = 'neutral';
  
  if (entry.change !== undefined && entry.changePercent !== undefined) {
    const changeSign = entry.change >= 0 ? '+' : '';
    formattedChange = `${changeSign}${entry.change.toFixed(2)} (${changeSign}${entry.changePercent.toFixed(2)}%)`;
    direction = entry.change > 0 ? 'up' : entry.change < 0 ? 'down' : 'neutral';
  }
  
  return {
    price: formattedPrice,
    change: formattedChange,
    direction
  };
}