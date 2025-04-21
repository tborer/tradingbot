/**
 * Selective price update service for auto-traded cryptocurrencies
 * This reduces database load by only writing price changes when they are within
 * a configurable range of buy/sell targets
 */

import { KrakenPrice } from '@/lib/kraken';
import { updatePriceCache, getCachedPrice } from '@/lib/priceCache';
import prisma from '@/lib/prisma';

// Configuration for selective price updates
interface SelectiveUpdateConfig {
  // Percentage range around buy/sell thresholds to start writing price updates
  // e.g., if buyThreshold is 5% and proximityThreshold is 2%, 
  // we'll start writing updates when price is within 3-7% of the purchase price
  proximityThreshold: number;
  
  // Minimum time between database writes for the same crypto (in milliseconds)
  minUpdateInterval: number;
  
  // Maximum time between database writes for the same crypto (in milliseconds)
  // This ensures we still update the database periodically even if not near thresholds
  maxUpdateInterval: number;
  
  // Whether to enable selective updates (if false, all price updates will be written)
  enabled: boolean;
}

// Default configuration
const DEFAULT_CONFIG: SelectiveUpdateConfig = {
  proximityThreshold: 2, // 2% around buy/sell thresholds
  minUpdateInterval: 10000, // 10 seconds
  maxUpdateInterval: 300000, // 5 minutes
  enabled: true
};

// Store the last update time for each crypto
const lastUpdateTimes = new Map<string, number>();

// Current configuration
let currentConfig: SelectiveUpdateConfig = { ...DEFAULT_CONFIG };

/**
 * Initialize the selective update service with configuration
 * @param config Configuration for selective price updates
 */
export function initializeSelectiveUpdates(config: Partial<SelectiveUpdateConfig> = {}): void {
  currentConfig = {
    ...DEFAULT_CONFIG,
    ...config
  };
  
  console.log('Selective price update service initialized with config:', currentConfig);
}

/**
 * Update the configuration for selective price updates
 * @param config New configuration (partial)
 */
export function updateConfig(config: Partial<SelectiveUpdateConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...config
  };
  
  console.log('Selective price update config updated:', currentConfig);
}

/**
 * Get the current configuration
 */
export function getConfig(): SelectiveUpdateConfig {
  return { ...currentConfig };
}

/**
 * Determine if a price update should be written to the database
 * @param symbol Cryptocurrency symbol
 * @param price Current price
 * @param crypto Crypto object from database (if available)
 * @param userId User ID
 */
export async function shouldWritePriceUpdate(
  symbol: string,
  price: number,
  crypto: any = null,
  userId: string | null = null
): Promise<boolean> {
  // Always update the in-memory cache regardless of whether we write to the database
  updatePriceCache(symbol, price);
  
  // If selective updates are disabled, always write to the database
  if (!currentConfig.enabled) {
    return true;
  }
  
  // Get the crypto from the database if not provided
  let cryptoData = crypto;
  if (!cryptoData && userId) {
    try {
      cryptoData = await prisma.crypto.findFirst({
        where: {
          symbol,
          userId
        },
        include: {
          autoTradeSettings: true
        }
      });
    } catch (error) {
      console.error(`Error fetching crypto data for ${symbol}:`, error);
      // If we can't get the crypto data, default to writing the update
      return true;
    }
  }
  
  // If we don't have crypto data, default to writing the update
  if (!cryptoData) {
    return true;
  }
  
  // Check if this crypto has auto trading enabled
  const hasAutoTrading = cryptoData.autoBuy || cryptoData.autoSell;
  
  // If auto trading is not enabled, use standard batch updates
  if (!hasAutoTrading) {
    return false; // Let the batch service handle non-auto-traded cryptos
  }
  
  // Get the last update time for this crypto
  const lastUpdateTime = lastUpdateTimes.get(cryptoData.id) || 0;
  const now = Date.now();
  
  // Always update if we've exceeded the maximum update interval
  if (now - lastUpdateTime >= currentConfig.maxUpdateInterval) {
    lastUpdateTimes.set(cryptoData.id, now);
    return true;
  }
  
  // Don't update if we haven't reached the minimum update interval
  if (now - lastUpdateTime < currentConfig.minUpdateInterval) {
    return false;
  }
  
  // Get auto trade settings
  const settings = await prisma.settings.findUnique({
    where: { userId: cryptoData.userId }
  });
  
  if (!settings) {
    // If we can't get settings, default to writing the update
    lastUpdateTimes.set(cryptoData.id, now);
    return true;
  }
  
  // Get thresholds from crypto-specific settings or global settings
  const buyThreshold = cryptoData.autoTradeSettings?.buyThresholdPercent || settings.buyThresholdPercent;
  const sellThreshold = cryptoData.autoTradeSettings?.sellThresholdPercent || settings.sellThresholdPercent;
  const nextAction = cryptoData.autoTradeSettings?.nextAction || 'buy';
  
  // Calculate price change percentages
  const purchasePrice = cryptoData.purchasePrice;
  
  // Handle edge cases
  if (purchasePrice <= 0 || price <= 0) {
    lastUpdateTimes.set(cryptoData.id, now);
    return true;
  }
  
  // Calculate price drop percentage (for buy)
  const percentDrop = ((purchasePrice - price) / purchasePrice) * 100;
  
  // Calculate price gain percentage (for sell)
  const percentGain = ((price - purchasePrice) / purchasePrice) * 100;
  
  // Determine which threshold to check based on next action
  let isNearThreshold = false;
  
  if (nextAction === 'buy' && cryptoData.autoBuy) {
    // Check if price is within proximity of buy threshold
    const lowerBound = buyThreshold - currentConfig.proximityThreshold;
    const upperBound = buyThreshold + currentConfig.proximityThreshold;
    isNearThreshold = percentDrop >= lowerBound && percentDrop <= upperBound;
    
    if (isNearThreshold) {
      console.log(`Price for ${symbol} is near buy threshold: ${percentDrop.toFixed(2)}% drop (threshold: ${buyThreshold}%, range: ${lowerBound}-${upperBound}%)`);
    }
  } else if (nextAction === 'sell' && cryptoData.autoSell) {
    // Check if price is within proximity of sell threshold
    const lowerBound = sellThreshold - currentConfig.proximityThreshold;
    const upperBound = sellThreshold + currentConfig.proximityThreshold;
    isNearThreshold = percentGain >= lowerBound && percentGain <= upperBound;
    
    if (isNearThreshold) {
      console.log(`Price for ${symbol} is near sell threshold: ${percentGain.toFixed(2)}% gain (threshold: ${sellThreshold}%, range: ${lowerBound}-${upperBound}%)`);
    }
  }
  
  // If price is near threshold, update the database
  if (isNearThreshold) {
    lastUpdateTimes.set(cryptoData.id, now);
    return true;
  }
  
  // If we've reached this point, don't update the database
  return false;
}

/**
 * Process price updates for auto-traded cryptocurrencies
 * @param prices Array of price updates
 * @param userId User ID
 */
export async function processSelectivePriceUpdates(
  prices: KrakenPrice[],
  userId: string
): Promise<{ updated: string[], skipped: string[] }> {
  const updated: string[] = [];
  const skipped: string[] = [];
  
  // Get all auto-traded cryptos for this user
  const autoTradedCryptos = await prisma.crypto.findMany({
    where: {
      userId,
      OR: [
        { autoBuy: true },
        { autoSell: true }
      ]
    },
    include: {
      autoTradeSettings: true
    }
  });
  
  // Create a map for faster lookups
  const cryptoMap = new Map(autoTradedCryptos.map(crypto => [crypto.symbol, crypto]));
  
  // Process each price update
  for (const price of prices) {
    const crypto = cryptoMap.get(price.symbol);
    
    // Skip if we don't have this crypto or it's not auto-traded
    if (!crypto) {
      skipped.push(price.symbol);
      continue;
    }
    
    // Check if we should write this update
    const shouldWrite = await shouldWritePriceUpdate(price.symbol, price.price, crypto, userId);
    
    if (shouldWrite) {
      try {
        // Update the price in the database
        await prisma.crypto.update({
          where: { id: crypto.id },
          data: { lastPrice: price.price }
        });
        
        updated.push(price.symbol);
        
        // Check if auto trading is enabled for this user
        const settings = await prisma.settings.findUnique({
          where: { userId }
        });
        
        // If auto trading is enabled, trigger auto trade evaluation
        if (settings?.enableAutoCryptoTrading) {
          try {
            // Import the auto trade service function
            const { checkCryptoForAutoTrade } = require('./autoTradeService');
            
            // Process auto trade
            console.log(`Executing auto trade check for ${price.symbol} (ID: ${crypto.id}) at price ${price.price}`);
            await checkCryptoForAutoTrade(crypto.id, price.price, userId);
          } catch (error) {
            console.error(`Error triggering auto trade for ${price.symbol}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error updating price for ${price.symbol}:`, error);
      }
    } else {
      skipped.push(price.symbol);
    }
  }
  
  return { updated, skipped };
}