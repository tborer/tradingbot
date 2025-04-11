import React, { useEffect, useState, useCallback } from 'react';
import { KrakenPrice } from '@/lib/kraken';
import { useWebSocketLogs } from '@/contexts/WebSocketLogContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import WebSocketConnectionStatus from '@/components/WebSocketConnectionStatus';
import { useKrakenWebSocket } from '@/contexts/KrakenWebSocketContext';

interface KrakenPriceMonitorProps {
  symbols: string[];
  websocketUrl?: string;
  onPriceUpdate?: (prices: KrakenPrice[]) => void;
}

export default function KrakenPriceMonitor({ 
  symbols, 
  websocketUrl = 'wss://ws.kraken.com/v2',
  onPriceUpdate 
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
  
  // Fetch settings to check if auto trading is enabled and WebSocket is enabled
  const [enableKrakenWebSocket, setEnableKrakenWebSocket] = useState<boolean>(true);
  
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
        } else {
          setSystemDegraded(false);
          setDegradedReason('');
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
    
    return () => clearInterval(intervalId);
  }, [user]);

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
  
  const handlePriceUpdate = useCallback((newPrices: KrakenPrice[]) => {
    if (newPrices.length === 0) {
      console.log('No new prices to update in KrakenPriceMonitor');
      return;
    }
    
    console.log('KrakenPriceMonitor received price updates:', newPrices);
    
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
      
      // Skip update if it's too soon after the last one
      if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) {
        console.log(`Skipping price update, last update was ${now - lastUpdateTime}ms ago`);
        return;
      }
      
      // Create a function to batch update the lastPrice for all cryptos
      const updateLastPrices = async () => {
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
          
          // Send a single batch update request instead of multiple individual requests
          const response = await fetch('/api/cryptos/batch-update-prices', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ updates }),
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
          
          // Handle degraded mode response
          if (result.degraded) {
            console.log(`Batch processed in degraded mode for ${result.processedCount} cryptos`);
            
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
  
  useEffect(() => {
    // Load auto-connect setting from localStorage
    const savedAutoConnect = localStorage.getItem('kraken-websocket-auto-connect');
    if (savedAutoConnect !== null) {
      setAutoConnect(savedAutoConnect === 'true');
    }
  }, []);
  
  // Use the shared WebSocket context
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
    setEnableKrakenWebSocket: setContextEnableKrakenWebSocket
  } = useKrakenWebSocket();
  
  // Update symbols in the shared context when they change
  useEffect(() => {
    if (symbols.length > 0) {
      // Update the symbols in the shared context
      updateSymbols(symbols);
    }
  }, [symbols, updateSymbols]);
  
  // Process price updates from the shared context
  useEffect(() => {
    if (lastPrices.length > 0 && enableKrakenWebSocket) {
      console.log('Processing price updates from shared context:', lastPrices);
      handlePriceUpdate(lastPrices);
    } else if (lastPrices.length > 0 && !enableKrakenWebSocket) {
      console.log('Ignoring price updates because Kraken WebSocket is disabled');
    }
  }, [lastPrices, handlePriceUpdate, enableKrakenWebSocket]);
  
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
          
          {symbols.length === 0 ? (
            <p className="text-muted-foreground">No symbols to monitor</p>
          ) : (
            <>
              <p className="text-muted-foreground">
                Monitoring {symbols.length} cryptocurrencies for price updates.
              </p>
              
              {contextLastUpdated && (
                <p className="text-xs text-muted-foreground mt-4">
                  Last updated: {contextLastUpdated.toLocaleTimeString()}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}