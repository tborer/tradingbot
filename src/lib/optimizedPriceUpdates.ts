import { KrakenPrice } from './kraken';

/**
 * Converts a standard KrakenPrice object to an optimized format with shortened field names
 * @param price The standard KrakenPrice object
 * @returns An optimized price object with shortened field names
 */
export function createOptimizedPriceUpdate(price: KrakenPrice): { s: string; lp: number; t: number } {
  return {
    s: price.symbol,    // shortened symbol
    lp: price.price,    // shortened lastPrice
    t: price.timestamp  // timestamp
  };
}

/**
 * Converts an array of standard KrakenPrice objects to optimized format
 * @param prices Array of standard KrakenPrice objects
 * @returns Array of optimized price objects with shortened field names
 */
export function createOptimizedPriceUpdates(prices: KrakenPrice[]): { s: string; lp: number; t: number }[] {
  return prices.map(createOptimizedPriceUpdate);
}

/**
 * Converts an optimized price update back to standard KrakenPrice format
 * @param optimizedPrice The optimized price object with shortened field names
 * @returns A standard KrakenPrice object
 */
export function convertToStandardPrice(optimizedPrice: { s: string; lp: number; t?: number }): KrakenPrice {
  return {
    symbol: optimizedPrice.s,
    price: optimizedPrice.lp,
    timestamp: optimizedPrice.t || Date.now(),
    // Include shortened fields for compatibility
    s: optimizedPrice.s,
    lp: optimizedPrice.lp
  };
}

/**
 * Converts an array of optimized price updates back to standard KrakenPrice format
 * @param optimizedPrices Array of optimized price objects
 * @returns Array of standard KrakenPrice objects
 */
export function convertToStandardPrices(optimizedPrices: { s: string; lp: number; t?: number }[]): KrakenPrice[] {
  return optimizedPrices.map(convertToStandardPrice);
}

/**
 * Determines if a message contains optimized price updates
 * @param message The message to check
 * @returns True if the message contains optimized price updates
 */
export function isOptimizedPriceUpdate(message: any): boolean {
  if (!message) return false;
  
  // Check if it's a string that needs parsing
  if (typeof message === 'string') {
    try {
      const parsed = JSON.parse(message);
      return isOptimizedPriceUpdate(parsed);
    } catch {
      return false;
    }
  }
  
  // Check for single optimized price update
  if (message.s && message.lp !== undefined) {
    return true;
  }
  
  // Check for array of optimized price updates
  if (Array.isArray(message) && message.length > 0 && message[0].s && message[0].lp !== undefined) {
    return true;
  }
  
  return false;
}