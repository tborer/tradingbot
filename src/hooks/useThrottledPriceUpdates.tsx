import { useState, useEffect, useRef, useCallback } from 'react';
import { KrakenPrice } from '@/lib/kraken';
import { useWebSocketLogs } from '@/contexts/WebSocketLogContext';

interface UseThrottledPriceUpdatesOptions {
  /**
   * The interval in milliseconds at which to batch and process updates
   */
  interval?: number;
  
  /**
   * The maximum number of updates to include in a single batch
   */
  maxBatchSize?: number;
  
  /**
   * Callback function to process the batched updates
   */
  onBatchProcess: (prices: KrakenPrice[]) => void;
  
  /**
   * Whether the throttling is enabled
   */
  enabled?: boolean;
  
  /**
   * Whether to enable detailed logging
   */
  enableDetailedLogging?: boolean;
}

/**
 * A hook that throttles price updates from WebSockets by batching them
 * and processing them at a specified interval.
 * Optimized for performance with Map-based lookups and reduced logging.
 */
export function useThrottledPriceUpdates({
  interval = 5000, // Default to 5 seconds
  maxBatchSize = 20, // Default to 20 updates per batch
  onBatchProcess,
  enabled = true,
  enableDetailedLogging = false
}: UseThrottledPriceUpdatesOptions) {
  const { addLog } = useWebSocketLogs();
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const pendingUpdatesRef = useRef<Map<string, KrakenPrice>>(new Map());
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessTimeRef = useRef<number>(0);
  const processingCountRef = useRef<number>(0);
  
  // Stats for monitoring
  const [stats, setStats] = useState({
    totalUpdatesReceived: 0,
    totalBatchesProcessed: 0,
    totalUpdatesProcessed: 0,
    averageBatchSize: 0,
    lastBatchSize: 0,
    lastProcessDuration: 0,
    maxBatchSize: 0
  });
  
  // Optimized logging function that only logs when detailed logging is enabled
  const logIfEnabled = useCallback((level: 'info' | 'warning' | 'error' | 'success', message: string, details?: Record<string, any>) => {
    if (enableDetailedLogging) {
      addLog(level, message, details);
    }
  }, [enableDetailedLogging, addLog]);
  
  // Function to add a price update to the pending batch
  const addPriceUpdate = useCallback((price: KrakenPrice) => {
    if (!enabled) {
      // If throttling is disabled, process immediately
      onBatchProcess([price]);
      return;
    }
    
    // Update stats without re-rendering on every update
    const newTotal = stats.totalUpdatesReceived + 1;
    if (newTotal % 10 === 0) { // Only update stats every 10 updates to reduce renders
      setStats(prev => ({
        ...prev,
        totalUpdatesReceived: newTotal
      }));
    }
    
    // Store only the latest price for each symbol
    pendingUpdatesRef.current.set(price.symbol, price);
    
    // Log the pending update (only if detailed logging is enabled)
    logIfEnabled('info', 'Price update queued for batching', { 
      timestamp: Date.now(),
      component: 'useThrottledPriceUpdates',
      symbol: price.symbol,
      price: price.price,
      pendingCount: pendingUpdatesRef.current.size
    });
    
    // Schedule processing if not already scheduled
    if (!processingTimeoutRef.current) {
      scheduleProcessing();
    }
  }, [enabled, onBatchProcess, logIfEnabled, stats.totalUpdatesReceived]);
  
  // Function to add multiple price updates to the pending batch
  const addPriceUpdates = useCallback((prices: KrakenPrice[]) => {
    if (!enabled || prices.length === 0) return;
    
    if (!enabled) {
      // If throttling is disabled, process immediately
      onBatchProcess(prices);
      return;
    }
    
    // Update stats without re-rendering on every update
    const newTotal = stats.totalUpdatesReceived + prices.length;
    setStats(prev => ({
      ...prev,
      totalUpdatesReceived: newTotal
    }));
    
    // Store only the latest price for each symbol - more efficient with Map
    for (const price of prices) {
      pendingUpdatesRef.current.set(price.symbol, price);
    }
    
    // Log the pending updates (only if detailed logging is enabled)
    logIfEnabled('info', 'Multiple price updates queued for batching', { 
      timestamp: Date.now(),
      component: 'useThrottledPriceUpdates',
      updateCount: prices.length,
      pendingCount: pendingUpdatesRef.current.size
    });
    
    // Schedule processing if not already scheduled
    if (!processingTimeoutRef.current) {
      scheduleProcessing();
    }
  }, [enabled, onBatchProcess, logIfEnabled, stats.totalUpdatesReceived]);
  
  // Function to schedule the processing of the pending batch
  const scheduleProcessing = useCallback(() => {
    // Clear any existing timeout
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    
    // Calculate time until next processing
    const now = Date.now();
    const timeSinceLastProcess = now - lastProcessTimeRef.current;
    const timeUntilNextProcess = Math.max(0, interval - timeSinceLastProcess);
    
    // Schedule the processing
    processingTimeoutRef.current = setTimeout(() => {
      processBatch();
    }, timeUntilNextProcess);
    
    // Log the scheduling (only if detailed logging is enabled)
    logIfEnabled('info', 'Scheduled batch processing', { 
      timestamp: now,
      component: 'useThrottledPriceUpdates',
      timeUntilNextProcess,
      pendingCount: pendingUpdatesRef.current.size
    });
  }, [interval, logIfEnabled]);
  
  // Function to process the pending batch
  const processBatch = useCallback(() => {
    // Reset the timeout ref
    processingTimeoutRef.current = null;
    
    // If there are no pending updates, do nothing
    if (pendingUpdatesRef.current.size === 0) {
      return;
    }
    
    // Set processing flag
    setIsProcessing(true);
    
    // Get the pending updates - more efficient to extract values directly from Map
    const updates = Array.from(pendingUpdatesRef.current.values());
    
    // Clear the pending updates
    pendingUpdatesRef.current.clear();
    
    // Limit the batch size if needed
    const batchToProcess = updates.length <= maxBatchSize ? 
      updates : 
      updates.slice(0, maxBatchSize);
    
    // If we had to limit the batch size, put the rest back in the pending queue
    if (updates.length > maxBatchSize) {
      // More efficient to use a loop with Map.set than forEach
      for (let i = maxBatchSize; i < updates.length; i++) {
        const price = updates[i];
        pendingUpdatesRef.current.set(price.symbol, price);
      }
      
      // Log warning about batch size limitation (always log this as it's important)
      addLog('warning', 'Batch size limited, remaining updates requeued', { 
        timestamp: Date.now(),
        component: 'useThrottledPriceUpdates',
        processedCount: batchToProcess.length,
        requeuedCount: updates.length - maxBatchSize
      });
    }
    
    // Log the batch processing (only if detailed logging is enabled)
    const processingStartTime = Date.now();
    processingCountRef.current++;
    const currentProcessingCount = processingCountRef.current;
    
    logIfEnabled('info', 'Processing price update batch', { 
      timestamp: processingStartTime,
      component: 'useThrottledPriceUpdates',
      batchSize: batchToProcess.length,
      batchNumber: currentProcessingCount
    });
    
    // Update the last process time
    lastProcessTimeRef.current = processingStartTime;
    
    // Process the batch
    try {
      onBatchProcess(batchToProcess);
      
      // Calculate processing duration
      const processingDuration = Date.now() - processingStartTime;
      
      // Update stats
      setStats(prev => {
        const newTotalBatches = prev.totalBatchesProcessed + 1;
        const newTotalProcessed = prev.totalUpdatesProcessed + batchToProcess.length;
        return {
          ...prev,
          totalBatchesProcessed: newTotalBatches,
          totalUpdatesProcessed: newTotalProcessed,
          averageBatchSize: Math.round(newTotalProcessed / newTotalBatches),
          lastBatchSize: batchToProcess.length,
          lastProcessDuration: processingDuration,
          maxBatchSize: Math.max(prev.maxBatchSize, batchToProcess.length)
        };
      });
      
      // Log successful processing (only if detailed logging is enabled)
      logIfEnabled('success', 'Successfully processed price update batch', { 
        timestamp: Date.now(),
        component: 'useThrottledPriceUpdates',
        batchSize: batchToProcess.length,
        processingDuration,
        batchNumber: currentProcessingCount
      });
    } catch (error) {
      // Always log errors
      addLog('error', 'Error processing price update batch', { 
        timestamp: Date.now(),
        component: 'useThrottledPriceUpdates',
        error: error instanceof Error ? error.message : String(error),
        batchSize: batchToProcess.length,
        batchNumber: currentProcessingCount
      });
      
      console.error('Error processing price update batch:', error);
    } finally {
      // Reset processing flag
      setIsProcessing(false);
      
      // If there are still pending updates, schedule another processing
      if (pendingUpdatesRef.current.size > 0) {
        scheduleProcessing();
      }
    }
  }, [maxBatchSize, onBatchProcess, addLog, logIfEnabled, scheduleProcessing]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, []);
  
  // Force processing when enabled changes to true
  useEffect(() => {
    if (enabled && pendingUpdatesRef.current.size > 0 && !processingTimeoutRef.current) {
      scheduleProcessing();
    }
  }, [enabled, scheduleProcessing]);
  
  return {
    addPriceUpdate,
    addPriceUpdates,
    isProcessing,
    pendingCount: pendingUpdatesRef.current.size,
    stats,
    processBatchNow: processBatch // Expose a function to force processing immediately
  };
}