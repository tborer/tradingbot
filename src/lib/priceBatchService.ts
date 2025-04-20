/**
 * Service for batching price updates for non-auto-trading cryptocurrencies
 * This reduces database load by batching updates for cryptocurrencies that don't need real-time processing
 */

import { KrakenPrice } from '@/lib/kraken';
import { batchUpdatePriceCache } from '@/lib/priceCache';

// Define the batch configuration
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_BATCH_INTERVAL = 10000; // 10 seconds

// Store for pending price updates
interface PendingPriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
}

// Use a Map for better performance with string keys
const pendingUpdates = new Map<string, PendingPriceUpdate>();
let batchInterval: number = DEFAULT_BATCH_INTERVAL;
let batchSize: number = DEFAULT_BATCH_SIZE;
let batchIntervalId: NodeJS.Timeout | null = null;
let processingCallback: ((updates: PendingPriceUpdate[]) => Promise<void>) | null = null;
let isEnabled: boolean = true;

/**
 * Initialize the batch service with configuration
 * @param interval Interval in milliseconds between batch processing
 * @param maxBatchSize Maximum number of updates to include in a single batch
 * @param onBatchProcess Callback function to process the batched updates
 */
export function initializeBatchService(
  interval: number = DEFAULT_BATCH_INTERVAL,
  maxBatchSize: number = DEFAULT_BATCH_SIZE,
  onBatchProcess: (updates: PendingPriceUpdate[]) => Promise<void>
): void {
  batchInterval = interval;
  batchSize = maxBatchSize;
  processingCallback = onBatchProcess;
  
  // Start the batch processing interval
  startBatchProcessing();
  
  console.log(`Price batch service initialized with interval ${interval}ms and batch size ${maxBatchSize}`);
}

/**
 * Start the batch processing interval
 */
export function startBatchProcessing(): void {
  if (batchIntervalId) {
    clearInterval(batchIntervalId);
  }
  
  batchIntervalId = setInterval(() => {
    processBatch();
  }, batchInterval);
  
  console.log(`Batch processing started with interval ${batchInterval}ms`);
}

/**
 * Stop the batch processing interval
 */
export function stopBatchProcessing(): void {
  if (batchIntervalId) {
    clearInterval(batchIntervalId);
    batchIntervalId = null;
  }
  
  console.log('Batch processing stopped');
}

/**
 * Enable or disable the batch service
 * @param enabled Whether the service should be enabled
 */
export function setEnabled(enabled: boolean): void {
  isEnabled = enabled;
  
  if (enabled && !batchIntervalId) {
    startBatchProcessing();
  } else if (!enabled && batchIntervalId) {
    stopBatchProcessing();
  }
  
  console.log(`Batch service ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Add a price update to the pending batch
 * @param symbol Cryptocurrency symbol
 * @param price Current price
 * @param timestamp Timestamp of the price update
 */
export function addPriceUpdate(symbol: string, price: number, timestamp: number = Date.now()): void {
  if (!isEnabled) return;
  
  // Store only the latest price for each symbol
  pendingUpdates.set(symbol, {
    symbol,
    price,
    timestamp
  });
  
  // Also update the client-side price cache for immediate use
  batchUpdatePriceCache([{ symbol, price, timestamp }]);
}

/**
 * Add multiple price updates to the pending batch
 * @param prices Array of price updates
 */
export function addPriceUpdates(prices: KrakenPrice[]): void {
  if (!isEnabled || prices.length === 0) return;
  
  // Store only the latest price for each symbol
  for (const price of prices) {
    pendingUpdates.set(price.symbol, {
      symbol: price.symbol,
      price: price.price,
      timestamp: Date.now()
    });
  }
  
  // Also update the client-side price cache for immediate use
  batchUpdatePriceCache(prices);
}

/**
 * Process the pending batch of price updates
 */
export async function processBatch(): Promise<void> {
  if (!isEnabled || !processingCallback || pendingUpdates.size === 0) return;
  
  // Get the pending updates
  const updates = Array.from(pendingUpdates.values());
  
  // Clear the pending updates
  pendingUpdates.clear();
  
  // Limit the batch size if needed
  const batchToProcess = updates.length <= batchSize ? 
    updates : 
    updates.slice(0, batchSize);
  
  // If we had to limit the batch size, put the rest back in the pending queue
  if (updates.length > batchSize) {
    for (let i = batchSize; i < updates.length; i++) {
      const update = updates[i];
      pendingUpdates.set(update.symbol, update);
    }
    
    console.log(`Batch size limited to ${batchSize}, ${updates.length - batchSize} updates requeued`);
  }
  
  // Process the batch
  try {
    console.log(`Processing batch of ${batchToProcess.length} price updates`);
    await processingCallback(batchToProcess);
    console.log(`Successfully processed batch of ${batchToProcess.length} price updates`);
  } catch (error) {
    console.error('Error processing price update batch:', error);
  }
}

/**
 * Get the current number of pending updates
 */
export function getPendingCount(): number {
  return pendingUpdates.size;
}

/**
 * Get the current batch configuration
 */
export function getBatchConfig(): { interval: number; batchSize: number; isEnabled: boolean } {
  return {
    interval: batchInterval,
    batchSize,
    isEnabled
  };
}

/**
 * Update the batch configuration
 * @param config New batch configuration
 */
export function updateBatchConfig(config: { interval?: number; batchSize?: number }): void {
  if (config.interval !== undefined) {
    batchInterval = config.interval;
  }
  
  if (config.batchSize !== undefined) {
    batchSize = config.batchSize;
  }
  
  // Restart the batch processing with the new configuration
  if (batchIntervalId && isEnabled) {
    startBatchProcessing();
  }
  
  console.log(`Batch configuration updated: interval=${batchInterval}ms, batchSize=${batchSize}`);
}