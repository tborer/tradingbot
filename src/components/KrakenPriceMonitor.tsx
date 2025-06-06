import React, { useEffect, useState, useCallback, useRef } from 'react';
import { KrakenPrice } from '@/lib/kraken';
import { useWebSocketLogs } from '@/contexts/WebSocketLogContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import WebSocketConnectionStatus from '@/components/WebSocketConnectionStatus';
import { useKrakenWebSocket } from '@/contexts/KrakenWebSocketContext';
import { useThrottledPriceUpdates } from '@/hooks/useThrottledPriceUpdates';
import { useCryptoPriceMonitor } from '@/hooks/useCryptoPriceMonitor';
import { batchUpdatePriceCache } from '@/lib/priceCache';
import * as priceBatchService from '@/lib/priceBatchService';

interface KrakenPriceMonitorProps {
  symbols: string[];
  websocketUrl?: string;
  onPriceUpdate?: (prices: KrakenPrice[]) => void;
  maxDatabaseRetries?: number;
}

export default function KrakenPriceMonitor({ 
  symbols, 
  websocketUrl = 'wss://ws.kraken.com/v2',
  onPriceUpdate,
  maxDatabaseRetries: propMaxDatabaseRetries
}: KrakenPriceMonitorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prices, setPrices] = useState<KrakenPrice[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoTradeEnabled, setAutoTradeEnabled] = useState<boolean>(false);
  const [lastAutoTradeCheck, setLastAutoTradeCheck] = useState<Date | null>(null);
  const [autoTradeResults, setAutoTradeResults] = useState<any[]>([]);
  const [systemDegraded, setSystemDegraded] = useState<boolean>(false);
  const [degradedReason, setDegradedReason] = useState<string>('');
  
  // Database connection retry state
  const [dbConnectionAttempts, setDbConnectionAttempts] = useState<number>(0);
  const [dbConnectionPaused, setDbConnectionPaused] = useState<boolean>(false);
  const [dbConnectionLastError, setDbConnectionLastError] = useState<string>('');
  const [dbConnectionRetryTime, setDbConnectionRetryTime] = useState<number | null>(null);
  const dbRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Fetch settings to check if auto trading is enabled and WebSocket is enabled
  const [enableKrakenWebSocket, setEnableKrakenWebSocket] = useState<boolean>(true);
  
  // Get maxDatabaseRetries from context
  const { 
    isConnected, 
    error, 
    connect, 
    disconnect,
    lastPingTime,
    lastPongTime,
    lastPrices,
    lastUpdated: contextLastUpdated,
    autoConnect: contextAutoConnect,
    setAutoConnect: setContextAutoConnect,
    updateSymbols,
    enableKrakenWebSocket: contextEnableKrakenWebSocket,
    setEnableKrakenWebSocket: setContextEnableKrakenWebSocket,
    maxDatabaseRetries: contextMaxDatabaseRetries,
    setMaxDatabaseRetries: setContextMaxDatabaseRetries,
    compressionEnabled,
    setCompressionEnabled
  } = useKrakenWebSocket();
  
  // Use context maxDatabaseRetries if available, otherwise use prop or default
  const effectiveMaxDatabaseRetries = contextMaxDatabaseRetries || propMaxDatabaseRetries || 5;
  
  // Update maxDatabaseRetries when context value changes
  useEffect(() => {
    if (contextMaxDatabaseRetries && contextMaxDatabaseRetries !== effectiveMaxDatabaseRetries) {
      console.log(`Updating maxDatabaseRetries from context: ${contextMaxDatabaseRetries}`);
    }
  }, [contextMaxDatabaseRetries]);
  
  // Check for system degraded mode periodically
  useEffect(() => {
    // Function to check system status
    const checkSystemStatus = async () => {
      try {
        // Check if we're in client-side circuit breaker mode
        const now = Date.now();
        const clientCircuitBreakerKey = 'price-update-circuit-breaker-until';
        const circuitBreakerUntil = parseInt(localStorage.getItem(clientCircuitBreakerKey) || '0', 10);
        
        if (now < circuitBreakerUntil) {
          setSystemDegraded(true);
          setDegradedReason('Client-side circuit breaker active due to repeated connection failures');
          return;
        }
        
        // If database connection is paused due to too many failures, don't check
        if (dbConnectionPaused) {
          console.log('Skipping system status check because database connection is paused');
          return;
        }
        
        // Make a lightweight request to check system status
        // Use a dedicated status check endpoint or a minimal valid payload
        // to avoid triggering validation errors
        const response = await fetch('/api/cryptos/batch-update-prices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            updates: [{ symbol: 'STATUS_CHECK', lastPrice: 1.0 }],
            statusCheckOnly: true
          }),
        });
        
        if (response.status === 503) {
          const data = await response.json();
          setSystemDegraded(true);
          setDegradedReason(data.details || 'Database service unavailable');
          
          // Increment connection attempts
          const newAttempts = dbConnectionAttempts + 1;
          setDbConnectionAttempts(newAttempts);
          setDbConnectionLastError(data.details || 'Database service unavailable');
          
          // If we've reached the maximum number of retries, pause connection attempts
          if (newAttempts >= effectiveMaxDatabaseRetries) {
            console.log(`Maximum database connection attempts (${effectiveMaxDatabaseRetries}) reached, pausing reconnection`);
            setDbConnectionPaused(true);
            
            // Set a retry time in the future (30 minutes)
            const retryTime = now + 30 * 60 * 1000;
            setDbConnectionRetryTime(retryTime);
            
            // Show a toast notification
            toast({
              title: 'Database Connection Paused',
              description: `Connection attempts paused after ${effectiveMaxDatabaseRetries} failures. You can manually reconnect when the database is available.`,
              variant: 'destructive',
            });
          }
        } else {
          // Reset connection attempts on success
          if (dbConnectionAttempts > 0) {
            setDbConnectionAttempts(0);
          }
          
          // If we were in degraded mode, show a toast that we're back online
          if (systemDegraded) {
            toast({
              title: 'Database Connection Restored',
              description: 'The system is now operating normally.',
              variant: 'default',
            });
          }
          
          setSystemDegraded(false);
          setDegradedReason('');
          
          // If connection was paused, unpause it
          if (dbConnectionPaused) {
            setDbConnectionPaused(false);
            setDbConnectionRetryTime(null);
            
            // Clear any scheduled retry
            if (dbRetryTimeoutRef.current) {
              clearTimeout(dbRetryTimeoutRef.current);
              dbRetryTimeoutRef.current = null;
            }
          }
        }
      } catch (error) {
        console.error('Error checking system status:', error);
        // Don't set degraded mode here as it might be a temporary network issue
      }
    };
    
    // Check immediately on component mount
    if (user) {
      checkSystemStatus();
    }
    
    // Then check periodically
    const intervalId = setInterval(() => {
      if (user) {
        checkSystemStatus();
      }
    }, 60000); // Check every minute
    
    // Set up automatic retry after the pause period
    if (dbConnectionPaused && dbConnectionRetryTime) {
      const now = Date.now();
      const timeUntilRetry = dbConnectionRetryTime - now;
      
      if (timeUntilRetry > 0) {
        console.log(`Scheduling automatic database reconnection attempt in ${Math.ceil(timeUntilRetry / 60000)} minutes`);
        
        // Clear any existing timeout
        if (dbRetryTimeoutRef.current) {
          clearTimeout(dbRetryTimeoutRef.current);
        }
        
        // Set a new timeout
        dbRetryTimeoutRef.current = setTimeout(() => {
          console.log('Automatic database reconnection attempt triggered');
          setDbConnectionPaused(false);
          setDbConnectionAttempts(0);
          setDbConnectionRetryTime(null);
          checkSystemStatus();
        }, timeUntilRetry);
      }
    }
    
    return () => {
      clearInterval(intervalId);
      if (dbRetryTimeoutRef.current) {
        clearTimeout(dbRetryTimeoutRef.current);
      }
    };
  }, [user, dbConnectionPaused, dbConnectionRetryTime, dbConnectionAttempts, effectiveMaxDatabaseRetries, systemDegraded, toast]);
  
  // Function to manually attempt reconnection
  const handleManualReconnect = useCallback(() => {
    console.log('Manual database reconnection attempt triggered');
    setDbConnectionPaused(false);
    setDbConnectionAttempts(0);
    setDbConnectionRetryTime(null);
    
    // Clear any scheduled retry
    if (dbRetryTimeoutRef.current) {
      clearTimeout(dbRetryTimeoutRef.current);
      dbRetryTimeoutRef.current = null;
    }
    
    // Show toast
    toast({
      title: 'Reconnection Attempt',
      description: 'Attempting to reconnect to the database...',
      variant: 'default',
    });
    
    // Check system status immediately
    const checkSystemStatus = async () => {
      try {
        const response = await fetch('/api/cryptos/batch-update-prices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            updates: [{ symbol: 'STATUS_CHECK', lastPrice: 1.0 }],
            statusCheckOnly: true
          }),
        });
        
        if (response.status === 503) {
          const data = await response.json();
          setSystemDegraded(true);
          setDegradedReason(data.details || 'Database service unavailable');
          
          toast({
            title: 'Reconnection Failed',
            description: data.details || 'Database service still unavailable. You can try again later.',
            variant: 'destructive',
          });
        } else {
          setSystemDegraded(false);
          setDegradedReason('');
          
          toast({
            title: 'Reconnection Successful',
            description: 'Database connection restored. The system is now operating normally.',
            variant: 'default',
          });
        }
      } catch (error) {
        console.error('Error checking system status during manual reconnect:', error);
        
        toast({
          title: 'Reconnection Error',
          description: 'An error occurred while trying to reconnect. Please try again.',
          variant: 'destructive',
        });
      }
    };
    
    checkSystemStatus();
  }, [toast]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const settings = await response.json();
          setAutoTradeEnabled(settings.enableAutoCryptoTrading || false);
          setEnableKrakenWebSocket(settings.enableKrakenWebSocket !== false);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };
    
    if (user) {
      fetchSettings();
    }
  }, [user]);
  
  // Process auto trades when prices update
  const processAutoTrades = useCallback(async (prices: KrakenPrice[]) => {
    if (!user || !autoTradeEnabled || prices.length === 0 || !enableKrakenWebSocket) {
      if (!enableKrakenWebSocket && autoTradeEnabled) {
        console.log('Skipping auto trades because Kraken WebSocket is disabled');
      }
      return;
    }
    
    try {
      // Call the server-side API endpoint instead of using the client-side function
      const response = await fetch('/api/cryptos/process-auto-trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prices }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to process auto trades');
      }
      
      const data = await response.json();
      const results = data.results || [];
      
      // Filter for successful trades
      const successfulTrades = results.filter(result => result.success && result.action);
      
      if (successfulTrades.length > 0) {
        // Show toast for successful trades
        successfulTrades.forEach(trade => {
          toast({
            title: `Auto ${trade.action} Executed`,
            description: `${trade.action === 'buy' ? 'Bought' : 'Sold'} ${trade.shares?.toFixed(6)} shares of ${trade.symbol} at $${trade.price?.toFixed(2)}`,
            variant: 'default',
          });
        });
        
        // Update auto trade results
        setAutoTradeResults(prev => [...successfulTrades, ...prev].slice(0, 5));
      }
      
      setLastAutoTradeCheck(new Date());
    } catch (error) {
      console.error('Error processing auto trades:', error);
    }
  }, [user, autoTradeEnabled, toast, enableKrakenWebSocket]);
  
  const { addLog } = useWebSocketLogs();
  
  const handlePriceUpdate = useCallback((newPrices: KrakenPrice[]) => {
    if (newPrices.length === 0) {
      console.log('No new prices to update in KrakenPriceMonitor');
      addLog('info', 'No new prices to update', { 
        timestamp: Date.now(),
        component: 'KrakenPriceMonitor'
      });
      return;
    }
    
    // Enhanced logging for price updates
    const updateTimestamp = Date.now();
    const symbols = newPrices.map(p => p.symbol);
    const priceData = newPrices.map(p => ({ symbol: p.symbol, price: p.price }));
    
    console.log(`KrakenPriceMonitor received ${newPrices.length} price updates at ${new Date(updateTimestamp).toISOString()}:`, newPrices);
    
    // Log detailed information about the price update
    addLog('info', `Received price updates for ${newPrices.length} symbols`, { 
      timestamp: updateTimestamp,
      component: 'KrakenPriceMonitor',
      updateCount: newPrices.length,
      symbols: symbols,
      prices: priceData,
      memoryUsage: performance.memory ? {
        jsHeapSizeLimit: Math.round(performance.memory.jsHeapSizeLimit / (1024 * 1024)),
        totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / (1024 * 1024)),
        usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / (1024 * 1024))
      } : undefined
    });
    
    setPrices(prevPrices => {
      // Merge new prices with existing ones
      const updatedPrices = [...prevPrices];
      
      newPrices.forEach(newPrice => {
        const existingIndex = updatedPrices.findIndex(p => 
          p.symbol.toUpperCase() === newPrice.symbol.toUpperCase()
        );
        
        if (existingIndex >= 0) {
          console.log(`Updating existing price for ${newPrice.symbol}: $${newPrice.price}`);
          updatedPrices[existingIndex] = newPrice;
        } else {
          console.log(`Adding new price for ${newPrice.symbol}: $${newPrice.price}`);
          updatedPrices.push(newPrice);
        }
      });
      
      return updatedPrices;
    });
    
    setLastUpdated(new Date());
    
    // Update lastPrice in the database for all cryptos in a single batch request if WebSocket is enabled
    if (user && newPrices.length > 0 && enableKrakenWebSocket) {
      // Track last successful update time to prevent too frequent updates
      const lastUpdateKey = 'last-price-update-time';
      const now = Date.now();
      const lastUpdateTime = parseInt(localStorage.getItem(lastUpdateKey) || '0', 10);
      const MIN_UPDATE_INTERVAL = 2000; // 2 seconds minimum between updates
      
      // Log database update attempt
      addLog('info', 'Preparing database price update', { 
        timestamp: now,
        component: 'KrakenPriceMonitor',
        updateCount: newPrices.length,
        symbols: newPrices.map(p => p.symbol),
        timeSinceLastUpdate: now - lastUpdateTime,
        minUpdateInterval: MIN_UPDATE_INTERVAL
      });
      
      // Skip update if it's too soon after the last one
      if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) {
        console.log(`Skipping price update, last update was ${now - lastUpdateTime}ms ago`);
        addLog('warning', 'Skipping price update due to rate limiting', { 
          timestamp: now,
          component: 'KrakenPriceMonitor',
          timeSinceLastUpdate: now - lastUpdateTime,
          minUpdateInterval: MIN_UPDATE_INTERVAL
        });
        return;
      }
      
      // Create a function to batch update the lastPrice for all cryptos
      const updateLastPrices = async () => {
        // If database connection is paused, skip this update
        if (dbConnectionPaused) {
          console.log('Skipping price update because database connection is paused');
          return;
        }
        
        // Track if we're currently in a backoff period
        const backoffKey = 'price-update-backoff-until';
        const backoffUntil = parseInt(localStorage.getItem(backoffKey) || '0', 10);
        
        // If we're in a backoff period, skip this update
        if (now < backoffUntil) {
          console.log(`Skipping price update due to backoff, ${Math.ceil((backoffUntil - now) / 1000)}s remaining`);
          return;
        }
        
        // Track consecutive errors for client-side circuit breaking
        const consecutiveErrorsKey = 'price-update-consecutive-errors';
        const consecutiveErrors = parseInt(localStorage.getItem(consecutiveErrorsKey) || '0', 10);
        
        // If we've had too many consecutive errors, implement client-side circuit breaking
        const MAX_CLIENT_CONSECUTIVE_ERRORS = 5;
        if (consecutiveErrors >= MAX_CLIENT_CONSECUTIVE_ERRORS) {
          const clientCircuitBreakerKey = 'price-update-circuit-breaker-until';
          const circuitBreakerUntil = parseInt(localStorage.getItem(clientCircuitBreakerKey) || '0', 10);
          
          if (now < circuitBreakerUntil) {
            console.log(`Client-side circuit breaker active, ${Math.ceil((circuitBreakerUntil - now) / 1000)}s remaining`);
            return;
          } else {
            // Reset circuit breaker after timeout
            localStorage.setItem(consecutiveErrorsKey, '0');
            localStorage.removeItem(clientCircuitBreakerKey);
            console.log('Client-side circuit breaker reset');
          }
        }
        
        try {
          // Prepare the updates array for the batch update
          const updates = newPrices
            .filter(priceUpdate => {
              // Validate each price update before including it
              if (!priceUpdate.symbol || typeof priceUpdate.symbol !== 'string' || priceUpdate.symbol.trim() === '') {
                console.warn('Skipping price update with invalid symbol:', priceUpdate);
                return false;
              }
              
              if (priceUpdate.price === undefined || priceUpdate.price === null || 
                  isNaN(Number(priceUpdate.price)) || Number(priceUpdate.price) <= 0) {
                console.warn('Skipping price update with invalid price:', priceUpdate);
                return false;
              }
              
              return true;
            })
            .map(priceUpdate => ({
              symbol: priceUpdate.symbol.trim(),
              lastPrice: Number(priceUpdate.price)
            }));
          
          // Don't make the API call if there are no valid updates
          if (updates.length === 0) {
            console.log('No valid price updates to send to the API');
            return;
          }
          
          // Log the API call attempt
          const apiCallStartTime = Date.now();
          addLog('info', 'Sending batch price update to API', { 
            timestamp: apiCallStartTime,
            component: 'KrakenPriceMonitor',
            updateCount: updates.length,
            symbols: updates.map(u => u.symbol),
            endpoint: '/api/cryptos/batch-update-prices'
          });
          
          // Send a single batch update request instead of multiple individual requests
          const response = await fetch('/api/cryptos/batch-update-prices', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ updates }),
          });
          
          // Calculate API call duration
          const apiCallDuration = Date.now() - apiCallStartTime;
          
          // Log the API response
          addLog('info', 'Received batch price update API response', { 
            timestamp: Date.now(),
            component: 'KrakenPriceMonitor',
            status: response.status,
            statusText: response.statusText,
            duration: apiCallDuration,
            endpoint: '/api/cryptos/batch-update-prices'
          });
          
          // Store the update time
          localStorage.setItem(lastUpdateKey, now.toString());
          
          if (!response.ok) {
            const errorData = await response.json();
            
            // Increment consecutive errors
            localStorage.setItem(consecutiveErrorsKey, (consecutiveErrors + 1).toString());
            
            // Handle specific error codes
            if (response.status === 429 || response.status === 503) {
              // Calculate backoff time based on the error
              let backoffTime = 5000; // Default 5 seconds
              
              if (errorData.retryAfterMs) {
                // Use server-provided retry time if available
                backoffTime = errorData.retryAfterMs;
              } else if (errorData.code === 'CIRCUIT_BREAKER_OPEN') {
                // Longer backoff for circuit breaker
                backoffTime = 30000; // 30 seconds
              }
              
              console.log(`Setting backoff timer for ${backoffTime}ms due to ${errorData.code}`);
              localStorage.setItem(backoffKey, (now + backoffTime).toString());
              
              // If we've reached the max consecutive errors, activate client-side circuit breaker
              if (consecutiveErrors + 1 >= MAX_CLIENT_CONSECUTIVE_ERRORS) {
                const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
                localStorage.setItem(clientCircuitBreakerKey, (now + CIRCUIT_BREAKER_TIMEOUT).toString());
                console.log(`Activating client-side circuit breaker for ${CIRCUIT_BREAKER_TIMEOUT / 1000}s`);
              }
              
              // Show a toast only for the first error to avoid spamming
              const lastErrorKey = 'last-price-update-error-time';
              const lastErrorTime = parseInt(localStorage.getItem(lastErrorKey) || '0', 10);
              const ERROR_NOTIFICATION_INTERVAL = 60000; // Only show error toast once per minute
              
              if (now - lastErrorTime > ERROR_NOTIFICATION_INTERVAL) {
                localStorage.setItem(lastErrorKey, now.toString());
                
                // Show different messages based on error type
                let toastTitle = 'Price Update Temporarily Unavailable';
                let toastDescription = errorData.details || 'The system is experiencing high load. Price updates will resume automatically.';
                
                if (errorData.degraded) {
                  toastTitle = 'System Operating in Degraded Mode';
                  toastDescription = 'Database connectivity issues detected. Some features may be limited until service is restored.';
                }
                
                toast({
                  title: toastTitle,
                  description: toastDescription,
                  variant: 'destructive',
                });
              }
            }
            
            throw new Error(`Failed to update prices: ${errorData.error || response.statusText}`);
          }
          
          // Clear backoff and reset consecutive errors on success
          localStorage.removeItem(backoffKey);
          localStorage.setItem(consecutiveErrorsKey, '0');
          
          const result = await response.json();
          
          // Log the detailed API response data
          addLog('success', 'Successfully processed batch price update', { 
            timestamp: Date.now(),
            component: 'KrakenPriceMonitor',
            processedCount: result.processedCount,
            totalRequested: result.totalRequested,
            requestId: result.requestId,
            duration: result.duration,
            degraded: result.degraded || false,
            status: result.status
          });
          
          // Handle degraded mode response
          if (result.degraded) {
            console.log(`Batch processed in degraded mode for ${result.processedCount} cryptos`);
            
            // Log degraded mode operation
            addLog('warning', 'Batch processed in degraded mode', { 
              timestamp: Date.now(),
              component: 'KrakenPriceMonitor',
              processedCount: result.processedCount,
              totalRequested: result.totalRequested,
              requestId: result.requestId
            });
            
            // Show degraded mode toast (but not too frequently)
            const lastDegradedToastKey = 'last-degraded-mode-toast-time';
            const lastDegradedToastTime = parseInt(localStorage.getItem(lastDegradedToastKey) || '0', 10);
            const DEGRADED_TOAST_INTERVAL = 300000; // 5 minutes
            
            if (now - lastDegradedToastTime > DEGRADED_TOAST_INTERVAL) {
              localStorage.setItem(lastDegradedToastKey, now.toString());
              
              toast({
                title: 'System Operating in Degraded Mode',
                description: 'Price updates are being processed but database updates may be delayed.',
                variant: 'warning',
              });
            }
          } else {
            console.log(`Batch updated lastPrice for ${result.processedCount} cryptos`);
            
            // Log successful update with performance metrics
            addLog('success', 'Batch updated prices in database', { 
              timestamp: Date.now(),
              component: 'KrakenPriceMonitor',
              processedCount: result.processedCount,
              totalRequested: result.totalRequested,
              requestId: result.requestId,
              apiDuration: result.duration,
              totalDuration: Date.now() - apiCallStartTime
            });
          }
        } catch (error) {
          console.error('Error batch updating lastPrices:', error);
          
          // Don't spam the console with the same error
          const errorMessage = error instanceof Error ? error.message : String(error);
          const lastErrorMsgKey = 'last-price-update-error-msg';
          const lastErrorMsg = localStorage.getItem(lastErrorMsgKey);
          
          if (lastErrorMsg !== errorMessage) {
            localStorage.setItem(lastErrorMsgKey, errorMessage);
            console.error('New error updating prices:', errorMessage);
          }
        }
      };
      
      // Execute the batch update function
      updateLastPrices();
    } else if (!enableKrakenWebSocket && newPrices.length > 0) {
      console.log('Skipping price updates because Kraken WebSocket is disabled');
    }
    
    if (onPriceUpdate) {
      console.log('Forwarding price updates to parent component');
      onPriceUpdate(newPrices);
    }
    
    // Process auto trades with the new prices only if WebSocket is enabled
    if (enableKrakenWebSocket) {
      processAutoTrades(newPrices);
    }
  }, [onPriceUpdate, processAutoTrades, user, enableKrakenWebSocket]);
  
  // Get settings for auto-connect
  const [autoConnect, setAutoConnect] = useState<boolean>(false);
  
  // Get settings for throttling
  const [enableThrottling, setEnableThrottling] = useState<boolean>(true);
  const [throttleInterval, setThrottleInterval] = useState<number>(5000); // 5 seconds default
  
  // Settings for non-auto-trading batch processing
  const [enableBatchProcessing, setEnableBatchProcessing] = useState<boolean>(true);
  const [batchInterval, setBatchInterval] = useState<number>(10000); // 10 seconds default
  const [batchSize, setBatchSize] = useState<number>(20); // 20 updates per batch
  const [batchPendingCount, setBatchPendingCount] = useState<number>(0);
  
  // Initialize the throttled updates hook
  const { 
    addPriceUpdates, 
    isProcessing, 
    pendingCount, 
    stats: throttleStats 
  } = useThrottledPriceUpdates({
    interval: throttleInterval,
    maxBatchSize: 20,
    onBatchProcess: handlePriceUpdate,
    enabled: enableThrottling
  });
  
  useEffect(() => {
    // Load auto-connect setting from localStorage
    const savedAutoConnect = localStorage.getItem('kraken-websocket-auto-connect');
    if (savedAutoConnect !== null) {
      setAutoConnect(savedAutoConnect === 'true');
    }
    
    // Load throttling settings from localStorage
    const savedEnableThrottling = localStorage.getItem('kraken-websocket-throttling-enabled');
    if (savedEnableThrottling !== null) {
      setEnableThrottling(savedEnableThrottling === 'true');
    }
    
    const savedThrottleInterval = localStorage.getItem('kraken-websocket-throttle-interval');
    if (savedThrottleInterval !== null) {
      setThrottleInterval(parseInt(savedThrottleInterval, 10));
    }
    
    // Load batch processing settings from localStorage
    const savedEnableBatchProcessing = localStorage.getItem('kraken-batch-processing-enabled');
    if (savedEnableBatchProcessing !== null) {
      setEnableBatchProcessing(savedEnableBatchProcessing === 'true');
    }
    
    const savedBatchInterval = localStorage.getItem('kraken-batch-processing-interval');
    if (savedBatchInterval !== null) {
      setBatchInterval(parseInt(savedBatchInterval, 10));
    }
    
    const savedBatchSize = localStorage.getItem('kraken-batch-processing-size');
    if (savedBatchSize !== null) {
      setBatchSize(parseInt(savedBatchSize, 10));
    }
  }, []);
  
  // The shared WebSocket context is already initialized above
  
  // Update symbols in the shared context when they change
  useEffect(() => {
    if (symbols.length > 0) {
      // Update the symbols in the shared context
      updateSymbols(symbols);
    }
  }, [symbols, updateSymbols]);
  
  // Initialize the client-side price monitor
  const {
    cryptos,
    loading: cryptosLoading,
    error: cryptosError,
    lastUpdated: cryptosLastUpdated,
    pendingTrades,
    handlePriceUpdate: handleClientPriceUpdate,
    evaluateAllTradingConditions
  } = useCryptoPriceMonitor();
  
  // Initialize the price batch service for non-auto-trading cryptocurrencies
  useEffect(() => {
    if (!user) return;
    
    // Define the batch processing function
    const processBatchedPriceUpdates = async (updates: any[]) => {
      if (!user || updates.length === 0 || !enableKrakenWebSocket || !enableBatchProcessing) {
        return;
      }
      
      try {
        console.log(`Processing batch of ${updates.length} non-auto-trading crypto price updates`);
        
        // Log the batch processing
        addLog('info', 'Processing batch of non-auto-trading price updates', { 
          timestamp: Date.now(),
          component: 'KrakenPriceMonitor',
          updateCount: updates.length,
          batchInterval,
          batchSize
        });
        
        // Prepare the updates array for the batch update
        const batchUpdates = updates.map(update => ({
          symbol: update.symbol,
          lastPrice: update.price
        }));
        
        // Send a batch update request
        const response = await fetch('/api/cryptos/batch-update-prices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ updates: batchUpdates }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Failed to update prices: ${errorData.error || response.statusText}`);
        }
        
        const result = await response.json();
        
        // Log the successful batch update
        addLog('success', 'Successfully processed batch of non-auto-trading price updates', { 
          timestamp: Date.now(),
          component: 'KrakenPriceMonitor',
          processedCount: result.processedCount,
          totalRequested: updates.length,
          requestId: result.requestId,
          duration: result.duration
        });
        
        console.log(`Successfully processed batch of ${updates.length} non-auto-trading crypto price updates`);
      } catch (error) {
        console.error('Error processing batch of non-auto-trading price updates:', error);
        
        // Log the error
        addLog('error', 'Error processing batch of non-auto-trading price updates', { 
          timestamp: Date.now(),
          component: 'KrakenPriceMonitor',
          error: error instanceof Error ? error.message : String(error),
          updateCount: updates.length
        });
      }
    };
    
    // Initialize the batch service
    priceBatchService.initializeBatchService(
      batchInterval,
      batchSize,
      processBatchedPriceUpdates
    );
    
    // Set the enabled state
    priceBatchService.setEnabled(enableBatchProcessing);
    
    // Update the batch configuration when settings change
    priceBatchService.updateBatchConfig({
      interval: batchInterval,
      batchSize: batchSize
    });
    
    // Set up an interval to update the pending count
    const pendingCountInterval = setInterval(() => {
      setBatchPendingCount(priceBatchService.getPendingCount());
    }, 1000);
    
    // Clean up on unmount
    return () => {
      priceBatchService.stopBatchProcessing();
      clearInterval(pendingCountInterval);
    };
  }, [user, batchInterval, batchSize, enableBatchProcessing, enableKrakenWebSocket, addLog]);
  
  // Process price updates from the shared context
  useEffect(() => {
    if (lastPrices.length > 0 && enableKrakenWebSocket) {
      console.log('Processing price updates from shared context:', lastPrices);
      
      // Log the incoming price updates
      addLog('info', 'Received WebSocket price updates', { 
        timestamp: Date.now(),
        component: 'KrakenPriceMonitor',
        updateCount: lastPrices.length,
        symbols: lastPrices.map(p => p.symbol),
        throttlingEnabled: enableThrottling
      });
      
      // Update the client-side price cache
      batchUpdatePriceCache(lastPrices);
      
      // Update client-side state
      handleClientPriceUpdate(lastPrices);
      
      // Separate auto-trading cryptos from non-auto-trading cryptos
      const autoTradingCryptos = cryptos.filter(c => c.autoBuy || c.autoSell);
      const autoTradingSymbols = new Set(autoTradingCryptos.map(c => c.symbol));
      
      // Split price updates into auto-trading and non-auto-trading
      const autoTradingPrices = lastPrices.filter(p => autoTradingSymbols.has(p.symbol));
      const nonAutoTradingPrices = lastPrices.filter(p => !autoTradingSymbols.has(p.symbol));
      
      // Log the split
      addLog('info', 'Split price updates by auto-trading status', { 
        timestamp: Date.now(),
        component: 'KrakenPriceMonitor',
        autoTradingCount: autoTradingPrices.length,
        nonAutoTradingCount: nonAutoTradingPrices.length,
        autoTradingSymbols: Array.from(autoTradingSymbols)
      });
      
      // We already imported the price batch service at the top of the file
      
      // Process auto-trading cryptos in real-time
      if (autoTradingPrices.length > 0) {
        console.log(`Processing ${autoTradingPrices.length} auto-trading crypto price updates in real-time`);
        
        if (enableThrottling) {
          // Add to throttled batch for auto-trading cryptos
          addPriceUpdates(autoTradingPrices);
          
          // Log the throttling for auto-trading cryptos
          addLog('info', 'Added auto-trading price updates to throttled batch', { 
            timestamp: Date.now(),
            component: 'KrakenPriceMonitor',
            updateCount: autoTradingPrices.length,
            pendingCount: pendingCount,
            isProcessing: isProcessing,
            throttleInterval: throttleInterval
          });
        } else {
          // Process immediately if throttling is disabled
          handlePriceUpdate(autoTradingPrices);
        }
      }
      
      // Batch non-auto-trading cryptos for less frequent updates
      if (nonAutoTradingPrices.length > 0) {
        console.log(`Adding ${nonAutoTradingPrices.length} non-auto-trading crypto price updates to batch service`);
        
        // Add to the batch service
        priceBatchService.addPriceUpdates(nonAutoTradingPrices);
        
        // Log the batching for non-auto-trading cryptos
        addLog('info', 'Added non-auto-trading price updates to batch service', { 
          timestamp: Date.now(),
          component: 'KrakenPriceMonitor',
          updateCount: nonAutoTradingPrices.length,
          pendingCount: priceBatchService.getPendingCount(),
          batchConfig: priceBatchService.getBatchConfig()
        });
      }
    } else if (lastPrices.length > 0 && !enableKrakenWebSocket) {
      console.log('Ignoring price updates because Kraken WebSocket is disabled');
    }
  }, [lastPrices, handlePriceUpdate, handleClientPriceUpdate, enableKrakenWebSocket, enableThrottling, addPriceUpdates, pendingCount, isProcessing, throttleInterval, addLog, cryptos]);
  
  // Clear prices when symbols change
  useEffect(() => {
    setPrices([]);
  }, [JSON.stringify(symbols)]);
  
  // Handle auto-connect toggle
  const handleAutoConnectChange = useCallback((enabled: boolean) => {
    setAutoConnect(enabled);
    localStorage.setItem('kraken-websocket-auto-connect', enabled.toString());
  }, []);

  // If Kraken WebSocket is disabled, show a message
  if (!enableKrakenWebSocket) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Kraken Price Monitor</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="default" className="mb-4 bg-amber-50 dark:bg-amber-900/20 border-amber-500">
            <AlertTitle className="text-amber-700 dark:text-amber-300">WebSocket Disabled</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              The Kraken WebSocket connection is currently disabled in settings. 
              Enable it in the settings tab to receive real-time crypto price updates.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <WebSocketConnectionStatus
        isConnected={isConnected}
        url={websocketUrl}
        error={error}
        connect={connect}
        disconnect={disconnect}
        lastMessageTime={contextLastUpdated}
        lastPingTime={lastPingTime}
        lastPongTime={lastPongTime}
        autoConnect={contextAutoConnect}
        onAutoConnectChange={setContextAutoConnect}
        compressionEnabled={compressionEnabled}
      />
      
      <Card>
        <CardHeader>
          <CardTitle>Kraken Price Monitor</CardTitle>
        </CardHeader>
        <CardContent>
          {systemDegraded && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>System Operating in Degraded Mode</AlertTitle>
              <AlertDescription>
                {degradedReason || 'Database connectivity issues detected. Some features may be limited until service is restored.'}
                <div className="text-xs mt-1">
                  Price updates will continue to be displayed but may not be saved to the database until service is restored.
                </div>
                {dbConnectionPaused && (
                  <div className="mt-3">
                    <div className="text-xs mb-2">
                      Database connection attempts paused after {effectiveMaxDatabaseRetries} failures.
                      {dbConnectionRetryTime && (
                        <span> Automatic retry in {Math.ceil((dbConnectionRetryTime - Date.now()) / 60000)} minutes.</span>
                      )}
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleManualReconnect}
                      className="bg-red-950 hover:bg-red-900 border-red-800"
                    >
                      Attempt Manual Reconnection
                    </Button>
                  </div>
                )}
                {!dbConnectionPaused && dbConnectionAttempts > 0 && (
                  <div className="text-xs mt-2">
                    Connection attempt {dbConnectionAttempts} of {effectiveMaxDatabaseRetries}.
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
          
          {autoTradeEnabled && (
            <Alert variant="default" className="mb-4 bg-blue-50 dark:bg-blue-900/20 border-blue-500">
              <AlertTitle className="text-blue-700 dark:text-blue-300">Auto Trading Enabled</AlertTitle>
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                Automatic trading is enabled for cryptocurrencies.
                {lastAutoTradeCheck && (
                  <div className="text-xs mt-1">Last check: {lastAutoTradeCheck.toLocaleTimeString()}</div>
                )}
                {systemDegraded && (
                  <div className="text-xs mt-1 text-amber-600 dark:text-amber-400">
                    Note: Auto-trading may be delayed or limited while in degraded mode.
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
          
          {autoTradeResults.length > 0 && (
            <Alert variant="default" className="mb-4 bg-green-50 dark:bg-green-900/20 border-green-500">
              <AlertTitle className="text-green-700 dark:text-green-300">Recent Auto Trades</AlertTitle>
              <AlertDescription className="text-green-700 dark:text-green-300">
                <ul className="text-xs mt-1 space-y-1">
                  {autoTradeResults.map((result, index) => (
                    <li key={index}>
                      {result.action === 'buy' ? 'Bought' : 'Sold'} {result.shares?.toFixed(6)} {result.symbol} at ${result.price?.toFixed(2)}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          
          {pendingTrades.length > 0 && (
            <Alert variant="default" className="mb-4 bg-amber-50 dark:bg-amber-900/20 border-amber-500">
              <AlertTitle className="text-amber-700 dark:text-amber-300">Pending Auto Trades</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                <ul className="text-xs mt-1 space-y-1">
                  {pendingTrades.map((crypto, index) => (
                    <li key={index}>
                      {crypto.tradingConditions?.action === 'buy' ? 'Buy' : 'Sell'} {crypto.symbol} at ${crypto.tradingConditions?.currentPrice?.toFixed(2)}
                      <div className="text-xs opacity-75">{crypto.tradingConditions?.reason}</div>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          
          {symbols.length === 0 ? (
            <p className="text-muted-foreground">No symbols to monitor</p>
          ) : (
            <>
              <p className="text-muted-foreground">
                Monitoring {symbols.length} cryptocurrencies for price updates.
              </p>
              
              {/* WebSocket Compression Status */}
              <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-md">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300">WebSocket Compression</h4>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className={compressionEnabled ? "bg-purple-100 hover:bg-purple-200 dark:bg-purple-800 dark:hover:bg-purple-700" : ""}
                    onClick={() => {
                      const newValue = !compressionEnabled;
                      setCompressionEnabled(newValue);
                      addLog('info', `WebSocket compression ${newValue ? 'enabled' : 'disabled'}`, { 
                        timestamp: Date.now(),
                        component: 'KrakenPriceMonitor'
                      });
                    }}
                  >
                    {compressionEnabled ? 'Disable' : 'Enable'}
                  </Button>
                </div>
                <div className="mt-2 text-xs text-purple-700 dark:text-purple-300">
                  <p>
                    {compressionEnabled 
                      ? "Compression is enabled, reducing WebSocket data transfer size." 
                      : "Compression is disabled. Enable to reduce data transfer size."}
                  </p>
                  <p className="mt-1">
                    WebSocket compression can significantly reduce bandwidth usage, especially for high-frequency price updates.
                  </p>
                </div>
              </div>

              {enableThrottling && (
                <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-md">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-medium">WebSocket Throttling (Auto-Trading Cryptos)</h4>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        const newValue = !enableThrottling;
                        setEnableThrottling(newValue);
                        localStorage.setItem('kraken-websocket-throttling-enabled', newValue.toString());
                        addLog('info', `WebSocket throttling ${newValue ? 'enabled' : 'disabled'}`, { 
                          timestamp: Date.now(),
                          component: 'KrakenPriceMonitor'
                        });
                      }}
                    >
                      {enableThrottling ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    <div className="grid grid-cols-2 gap-2">
                      <div>Interval: {throttleInterval / 1000}s</div>
                      <div>Pending: {pendingCount}</div>
                      <div>Batches: {throttleStats.totalBatchesProcessed}</div>
                      <div>Avg Size: {throttleStats.averageBatchSize}</div>
                      <div>Last Size: {throttleStats.lastBatchSize}</div>
                      <div>Last Duration: {throttleStats.lastProcessDuration}ms</div>
                    </div>
                  </div>
                </div>
              )}
              
              {!enableThrottling && (
                <div className="mt-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setEnableThrottling(true);
                      localStorage.setItem('kraken-websocket-throttling-enabled', 'true');
                      addLog('info', 'WebSocket throttling enabled', { 
                        timestamp: Date.now(),
                        component: 'KrakenPriceMonitor'
                      });
                    }}
                  >
                    Enable Throttling
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    Throttling batches WebSocket updates for auto-trading cryptos to reduce database load.
                  </p>
                </div>
              )}
              
              {/* Batch Processing for Non-Auto-Trading Cryptos */}
              <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-md">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Batch Processing (Non-Auto-Trading Cryptos)</h4>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className={enableBatchProcessing ? "bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-800 dark:hover:bg-indigo-700" : ""}
                    onClick={() => {
                      const newValue = !enableBatchProcessing;
                      setEnableBatchProcessing(newValue);
                      localStorage.setItem('kraken-batch-processing-enabled', newValue.toString());
                      priceBatchService.setEnabled(newValue);
                      addLog('info', `Batch processing for non-auto-trading cryptos ${newValue ? 'enabled' : 'disabled'}`, { 
                        timestamp: Date.now(),
                        component: 'KrakenPriceMonitor'
                      });
                    }}
                  >
                    {enableBatchProcessing ? 'Disable' : 'Enable'}
                  </Button>
                </div>
                <div className="mt-2 text-xs text-indigo-700 dark:text-indigo-300">
                  <div className="grid grid-cols-2 gap-2">
                    <div>Batch Interval: {batchInterval / 1000}s</div>
                    <div>Batch Size: {batchSize}</div>
                    <div>Pending Updates: {batchPendingCount}</div>
                    <div>Status: {enableBatchProcessing ? 'Active' : 'Disabled'}</div>
                  </div>
                  <p className="mt-2">
                    Non-auto-trading cryptocurrencies are batched for less frequent database updates to optimize system performance.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-800 dark:hover:bg-indigo-700"
                      onClick={() => {
                        // Process the batch immediately
                        priceBatchService.processBatch();
                        addLog('info', 'Manually triggered batch processing for non-auto-trading cryptos', { 
                          timestamp: Date.now(),
                          component: 'KrakenPriceMonitor',
                          pendingCount: batchPendingCount
                        });
                      }}
                    >
                      Process Now
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-800 dark:hover:bg-indigo-700"
                      onClick={() => {
                        // Update the batch interval
                        const newInterval = parseInt(prompt('Enter new batch interval in seconds:', (batchInterval / 1000).toString()) || '10') * 1000;
                        if (newInterval > 0) {
                          setBatchInterval(newInterval);
                          localStorage.setItem('kraken-batch-processing-interval', newInterval.toString());
                          priceBatchService.updateBatchConfig({ interval: newInterval });
                          addLog('info', 'Updated batch interval for non-auto-trading cryptos', { 
                            timestamp: Date.now(),
                            component: 'KrakenPriceMonitor',
                            newInterval
                          });
                        }
                      }}
                    >
                      Change Interval
                    </Button>
                  </div>
                </div>
              </div>
              
              {contextLastUpdated && (
                <p className="text-xs text-muted-foreground mt-4">
                  Last updated: {contextLastUpdated.toLocaleTimeString()}
                </p>
              )}
              
              {cryptos.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Client-Side Trading Conditions</h4>
                  <div className="text-xs space-y-2">
                    {cryptos.filter(c => c.autoBuy || c.autoSell).map(crypto => (
                      <div key={crypto.id} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-md">
                        <div className="font-medium">{crypto.symbol} - ${crypto.lastPrice?.toFixed(2)}</div>
                        <div className="grid grid-cols-2 gap-x-4 mt-1">
                          <div>Purchase: ${crypto.purchasePrice?.toFixed(2)}</div>
                          <div>Shares: {crypto.shares?.toFixed(6)}</div>
                          <div>Next Action: {crypto.autoTradeSettings?.nextAction === 'sell' ? 'Sell' : 'Buy'}</div>
                          <div>
                            {crypto.autoTradeSettings?.nextAction === 'sell' 
                              ? `Auto Sell: ${crypto.autoSell ? 'Yes' : 'No'}`
                              : `Auto Buy: ${crypto.autoBuy ? 'Yes' : 'No'}`}
                          </div>
                        </div>
                        {crypto.tradingConditions && (
                          <div className={`mt-2 p-1 rounded ${crypto.tradingConditions.shouldTrade ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                            {crypto.tradingConditions.shouldTrade ? (
                              <>
                                <span className="font-medium">Ready to {crypto.tradingConditions.action}: </span>
                                {crypto.tradingConditions.reason}
                              </>
                            ) : (
                              <span>Waiting for {crypto.tradingConditions.nextAction || crypto.autoTradeSettings?.nextAction || 'buy'} conditions to be met</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3"
                    onClick={evaluateAllTradingConditions}
                  >
                    Evaluate Trading Conditions
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}