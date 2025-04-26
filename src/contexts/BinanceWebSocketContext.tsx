import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useWebSocketLogs } from './WebSocketLogContext';
import { useMicroProcessing } from '@/hooks/useMicroProcessing';

// Starting message ID for Binance WebSocket messages
const INITIAL_MESSAGE_ID = 999999;

interface BinanceWebSocketContextType {
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  lastMessageTime: Date | null;
  lastPingTime: Date | null;
  lastPongTime: Date | null;
  error: Error | null;
  subscribedSymbols: string[];
  autoConnect: boolean;
  setAutoConnect: (autoConnect: boolean) => void;
}

const BinanceWebSocketContext = createContext<BinanceWebSocketContextType | undefined>(undefined);

export const useBinanceWebSocket = () => {
  const context = useContext(BinanceWebSocketContext);
  if (!context) {
    throw new Error('useBinanceWebSocket must be used within a BinanceWebSocketProvider');
  }
  return context;
};

interface BinanceWebSocketProviderProps {
  children: ReactNode;
}

export const BinanceWebSocketProvider: React.FC<BinanceWebSocketProviderProps> = ({ children }) => {
  const { addLog, logError } = useWebSocketLogs();
  const { enabledCryptos, handlePriceUpdate } = useMicroProcessing();
  
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastMessageTime, setLastMessageTime] = useState<Date | null>(null);
  const [lastPingTime, setLastPingTime] = useState<Date | null>(null);
  const [lastPongTime, setLastPongTime] = useState<Date | null>(null);
  const [subscribedSymbols, setSubscribedSymbols] = useState<string[]>([]);
  const [autoConnect, setAutoConnect] = useState<boolean>(false);
  
  // Message ID counter for WebSocket messages
  const messageIdRef = useRef<number>(INITIAL_MESSAGE_ID);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const minConnectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionAttemptRef = useRef<number>(0);
  
  const baseUrl = 'wss://stream.binance.us:9443';
  
  // Function to format symbol for Binance API
  const formatSymbolForBinance = useCallback((symbol: string): string => {
    // Convert symbol to lowercase and ensure it has the correct format
    // Binance expects symbols like "btcusdt" (all lowercase)
    let formattedSymbol = symbol.toLowerCase();
    
    // If the symbol ends with "USD", replace it with "usdt"
    if (formattedSymbol.endsWith('usd')) {
      formattedSymbol = formattedSymbol.replace(/usd$/, 'usdt');
    } else if (!formattedSymbol.endsWith('usdt')) {
      // If it doesn't end with "usdt", append it
      formattedSymbol = `${formattedSymbol}usdt`;
    }
    
    return formattedSymbol;
  }, []);

  // Function to get WebSocket URL based on subscribed symbols
  const getWebSocketUrl = useCallback(() => {
    // Always use the base WebSocket endpoint for dynamic subscriptions
    // This allows us to use the SUBSCRIBE method after connection
    return `${baseUrl}/ws`;
  }, [baseUrl]);
  
  // Update subscribed symbols when enabled cryptos change
  useEffect(() => {
    const binanceEnabledCryptos = enabledCryptos.filter(
      crypto => crypto.microProcessingSettings?.websocketProvider === 'binance'
    );
    
    const symbols = binanceEnabledCryptos.map(crypto => crypto.symbol);
    
    // Only update if the symbols have changed
    if (JSON.stringify(symbols) !== JSON.stringify(subscribedSymbols)) {
      setSubscribedSymbols(symbols);
      
      // If we're already connected, reconnect with the new symbols
      if (isConnected && wsRef.current) {
        reconnect();
      }
    }
  }, [enabledCryptos]);
  
  // Connect to WebSocket
  const connect = useCallback(() => {
    console.log('BinanceWebSocketContext: connect() called');
    addLog('info', 'Connect function called for Binance WebSocket');
    
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      console.log('BinanceWebSocketContext: Clearing existing reconnect timeout');
      addLog('info', 'Clearing existing reconnect timeout');
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Clear any existing ping interval
    if (pingIntervalRef.current) {
      console.log('BinanceWebSocketContext: Clearing existing ping interval');
      addLog('info', 'Clearing existing ping interval');
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    // Don't connect if there are no symbols to subscribe to
    if (subscribedSymbols.length === 0) {
      console.log('BinanceWebSocketContext: No symbols to subscribe to, adding BTC as default');
      addLog('info', 'No symbols to subscribe to. Adding BTC as default symbol.');
      
      // Add BTC as a default symbol for testing
      setSubscribedSymbols(['BTCUSD']);
      
      // Return early - the useEffect that watches subscribedSymbols will trigger connect again
      console.log('BinanceWebSocketContext: Returning early, will reconnect when symbols are updated');
      addLog('info', 'Will connect once symbols are updated');
      return;
    }

    // Close existing connection if any
    if (wsRef.current) {
      try {
        wsRef.current.close(1000, 'Creating new connection');
      } catch (err) {
        console.error('Error closing existing WebSocket connection:', err);
      }
      wsRef.current = null;
    }
    
    // Increment connection attempt counter
    connectionAttemptRef.current += 1;
    
    try {
      
      const wsUrl = getWebSocketUrl();
      addLog('info', `Connecting to Binance WebSocket: ${wsUrl}`);
      
      // Create new WebSocket connection
      wsRef.current = new WebSocket(wsUrl);
      
      // Set up event handlers
      wsRef.current.onopen = () => {
        setIsConnected(true);
        setError(null);
        connectionAttemptRef.current = 0; // Reset connection attempt counter on successful connection
        
        addLog('success', 'Connected to Binance WebSocket');
        console.log('BinanceWebSocketContext: WebSocket connection established');
        
        // Ensure connection stays open for at least 10 seconds after initial connect
        // This helps prevent premature connection closure before subscription confirmation
        if (minConnectionTimeoutRef.current) {
          clearTimeout(minConnectionTimeoutRef.current);
        }
        
        minConnectionTimeoutRef.current = setTimeout(() => {
          console.log('BinanceWebSocketContext: Minimum connection time elapsed');
          addLog('info', 'Minimum connection time elapsed (10 seconds)');
          minConnectionTimeoutRef.current = null;
        }, 10000);
        
        // Send subscription message immediately after connection is established
        // Subscribe to the streams for each symbol
        if (subscribedSymbols.length > 0) {
          // Format symbols correctly for Binance API (lowercase with usdt suffix)
          const streams = subscribedSymbols.flatMap(symbol => {
            const formattedSymbol = formatSymbolForBinance(symbol);
            console.log(`BinanceWebSocketContext: Formatted symbol ${symbol} to ${formattedSymbol}`);
            
            // Return the correctly formatted stream names
            return [`${formattedSymbol}@aggTrade`, `${formattedSymbol}@depth`];
          });
          
          // Use a simple numeric ID for the subscription message
          const subscribeId = 1; // Use a simple ID as shown in the example
          
          const subscribeMessage = {
            method: "SUBSCRIBE", // Uppercase 'SUBSCRIBE' as shown in the example
            params: streams,
            id: subscribeId
          };
          
          // Log the exact message that will be sent to ensure it matches the expected format
          const subscribeMessageString = JSON.stringify(subscribeMessage);
          console.log(`BinanceWebSocketContext: Subscribe message format:`, subscribeMessageString);
          
          // Log the raw message for debugging
          addLog('info', `Raw subscription message to be sent:`, {
            rawMessage: subscribeMessageString
          });
          
          console.log(`BinanceWebSocketContext: Sending subscribe message with ID ${subscribeId}`, subscribeMessage);
          
          try {
            // Send the stringified message to the WebSocket
            wsRef.current.send(subscribeMessageString);
            
            // Log successful subscription
            addLog('success', `Sent subscription request with ID ${subscribeId}`, 
              // Parse the stringified message back to an object to ensure clean formatting in logs
              JSON.parse(subscribeMessageString)
            );
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            addLog('error', `Failed to send subscription message: ${error.message}`, {
              error: error.message,
              stack: error.stack,
              readyState: wsRef.current?.readyState
            });
          }
        } else {
          addLog('warning', 'No symbols to subscribe to', {
            readyState: wsRef.current?.readyState
          });
        }
        
        // Set up ping interval (every 2.5 minutes to keep connection alive)
        pingIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
              // Simple ping message without ID - this matches Binance's expected format
              const pingMessage = { 
                method: "ping"
              };
              
              // Stringify the ping message
              const pingMessageString = JSON.stringify(pingMessage);
              
              // Send the ping message
              wsRef.current.send(pingMessageString);
              setLastPingTime(new Date());
              console.log(`BinanceWebSocketContext: Sent ping`, pingMessageString);
              
              // Log only the exact ping message that was sent
              addLog('info', `Sent ping to Binance WebSocket`, 
                // Parse the stringified message back to an object to ensure clean formatting in logs
                JSON.parse(pingMessageString)
              );
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              addLog('error', `Failed to send ping message: ${error.message}`, {
                error: error.message,
                stack: error.stack,
                readyState: wsRef.current?.readyState
              });
            }
          }
        }, 150000); // 2.5 minutes
      };
      
      wsRef.current.onmessage = (event) => {
        setLastMessageTime(new Date());
        
        try {
          // Log the raw message occasionally to verify format
          if (Math.random() < 0.05) { // Log approximately 5% of messages
            console.log(`BinanceWebSocketContext: Raw message received:`, event.data);
            // Also log to the WebSocketLogger for visibility
            addLog('info', `Raw message received from Binance WebSocket:`, {
              rawData: event.data
            });
          }
          
          const data = JSON.parse(event.data);
          
          // Handle subscription response - check for both numeric and UUID IDs
          if (data.id !== undefined) {
            console.log(`BinanceWebSocketContext: Received response for message ID ${data.id}`, data);
            
            if (data.result === null) {
              console.log(`BinanceWebSocketContext: Successfully subscribed with ID ${data.id}`);
              addLog('success', `Successfully subscribed to Binance streams with ID ${data.id}`, data);
            } else {
              console.error(`BinanceWebSocketContext: Failed to subscribe with ID ${data.id}`, data);
              addLog('error', `Failed to subscribe to Binance streams with ID ${data.id}`, data);
              
              // If subscription fails, attempt to reconnect after a delay
              setTimeout(() => {
                console.log('BinanceWebSocketContext: Attempting to reconnect after subscription failure');
                addLog('info', 'Attempting to reconnect after subscription failure');
                reconnect();
              }, 5000);
            }
            return;
          }
          
          // Handle pong response - check for all possible formats
          if (data.result === 'pong' || 
              (data.id && data.result === null && data.method === 'ping') ||
              data.method === 'pong') {
            setLastPongTime(new Date());
            addLog('info', 'Received pong from Binance WebSocket', data);
            return;
          }
          
          // Log the message type for debugging
          if (data.e) {
            addLog('info', `Received message with event type: ${data.e}`, {
              messageType: data.e,
              hasStream: !!data.stream,
              dataKeys: Object.keys(data)
            });
          }
          
          // Handle depth (order book) updates
          if ((data.stream && data.stream.includes('@depth')) || (data.e === 'depthUpdate')) {
            // Handle both stream format and direct message format
            let symbol, bestBidPrice;
            
            if (data.stream) {
              // Stream format (combined streams)
              // Extract symbol from stream name and convert back to our format (e.g., "btcusdt" -> "BTC")
              const rawSymbol = data.stream.split('@')[0];
              // Convert from "btcusdt" to "BTC"
              symbol = rawSymbol.replace(/usdt$/, '').toUpperCase();
              bestBidPrice = parseFloat(data.data.b && data.data.b[0] ? data.data.b[0][0] : 0);
              
              // Log the stream data structure for debugging
              if (Math.random() < 0.1) { // Log 10% of stream messages
                addLog('info', `Stream format depth update for ${symbol}`, {
                  stream: data.stream,
                  symbol,
                  bestBidPrice,
                  dataStructure: {
                    hasDataField: !!data.data,
                    hasBids: !!(data.data && data.data.b),
                    firstBid: data.data && data.data.b && data.data.b[0] ? data.data.b[0] : null
                  }
                });
              }
            } else {
              // Direct message format
              symbol = data.s.replace(/USDT$/, ''); // Symbol is in the 's' field, remove USDT suffix
              bestBidPrice = parseFloat(data.b && data.b[0] ? data.b[0][0] : 0);
              
              // Log the direct message data structure for debugging
              if (Math.random() < 0.1) { // Log 10% of direct messages
                addLog('info', `Direct format depth update for ${symbol}`, {
                  eventType: data.e,
                  symbol: data.s,
                  bestBidPrice,
                  dataStructure: {
                    hasBids: !!data.b,
                    firstBid: data.b && data.b[0] ? data.b[0] : null
                  }
                });
              }
            }
            
            // Update price in the micro processing service
            if (!isNaN(bestBidPrice) && bestBidPrice > 0) {
              handlePriceUpdate({
                symbol,
                price: bestBidPrice
              });
              
              // Log price update (but not too frequently to avoid flooding logs)
              if (Math.random() < 0.05) { // Log approximately 5% of updates
                const priceUpdate = {
                  symbol,
                  price: bestBidPrice,
                  source: 'binance-depth'
                };
                addLog('info', `Received price update for ${symbol}: $${bestBidPrice} (best bid from depth)`, priceUpdate);
              }
            }
          }
          
          // Handle trade updates
          if ((data.stream && data.stream.includes('@aggTrade')) || (data.e === 'aggTrade')) {
            let symbol, price;
            
            if (data.stream) {
              // Stream format
              // Extract symbol from stream name and convert back to our format (e.g., "btcusdt" -> "BTC")
              const rawSymbol = data.stream.split('@')[0];
              // Convert from "btcusdt" to "BTC"
              symbol = rawSymbol.replace(/usdt$/, '').toUpperCase();
              price = parseFloat(data.data.p);
              
              // Log the stream data structure for debugging
              if (Math.random() < 0.1) { // Log 10% of stream messages
                addLog('info', `Stream format trade update for ${symbol}`, {
                  stream: data.stream,
                  symbol,
                  price,
                  dataStructure: {
                    hasDataField: !!data.data,
                    hasPrice: !!(data.data && data.data.p)
                  }
                });
              }
            } else {
              // Direct message format for aggTrade
              symbol = data.s.replace(/USDT$/, ''); // Symbol is in the 's' field, remove USDT suffix
              price = parseFloat(data.p); // Price is in the 'p' field for direct messages
              
              // Log the direct message data structure for debugging
              if (Math.random() < 0.1) { // Log 10% of direct messages
                addLog('info', `Direct format trade update for ${symbol}`, {
                  eventType: data.e,
                  symbol: data.s,
                  price,
                  dataStructure: {
                    hasPrice: !!data.p
                  }
                });
              }
            }
            
            // Update price in the micro processing service
            if (!isNaN(price) && price > 0) {
              handlePriceUpdate({
                symbol,
                price
              });
              
              // Log price update (but not too frequently to avoid flooding logs)
              if (Math.random() < 0.05) { // Log approximately 5% of updates
                const priceUpdate = {
                  symbol,
                  price,
                  source: 'binance-trade'
                };
                addLog('info', `Received trade update for ${symbol}: $${price}`, priceUpdate);
              }
            }
          }
        } catch (err) {
          logError('Error processing WebSocket message', err, 'BINANCE-WS-0001', {
            rawData: event.data
          });
        }
      };
      
      wsRef.current.onerror = (event) => {
        const wsError = new Error('Binance WebSocket error');
        setError(wsError);
        logError('Binance WebSocket error', wsError, 'BINANCE-WS-0002', {
          event
        });
      };
      
      wsRef.current.onclose = (event) => {
        setIsConnected(false);
        
        // Clear minimum connection timeout if it exists
        if (minConnectionTimeoutRef.current) {
          clearTimeout(minConnectionTimeoutRef.current);
          minConnectionTimeoutRef.current = null;
        }
        
        // Log closure details
        const closeInfo = {
          code: event.code,
          reason: event.reason || 'No reason provided',
          wasClean: event.wasClean,
          timestamp: new Date().toISOString(),
          connectionAttempt: connectionAttemptRef.current
        };
        
        console.log(`BinanceWebSocketContext: Connection closed with code ${event.code}`, closeInfo);
        addLog('warning', `Binance WebSocket connection closed: ${event.code} ${event.reason || 'No reason provided'}`, closeInfo);
        
        // Add specific guidance based on close code
        if (event.code === 1006) {
          addLog('error', 'Abnormal closure (1006) - This typically indicates a network issue or server-side termination', {
            suggestion: 'Check network connection and verify subscription format',
            subscribedSymbols: subscribedSymbols
          });
        } else if (event.code === 1008) {
          addLog('error', 'Policy violation (1008) - Server rejected the connection due to policy reasons', {
            suggestion: 'Check subscription message format and parameters',
            subscribedSymbols: subscribedSymbols
          });
        } else if (event.code === 1011) {
          addLog('error', 'Server error (1011) - Server encountered an unexpected condition', {
            suggestion: 'Server may be experiencing issues, retry later',
            subscribedSymbols: subscribedSymbols
          });
        } else if (event.code === 1000) {
          // Normal closure - could be due to server expecting immediate subscription
          addLog('info', 'Normal closure (1000) - This could be due to server expecting immediate subscription', {
            suggestion: 'Check if subscription message was sent in time',
            subscribedSymbols: subscribedSymbols
          });
        }
        
        // Only reconnect if auto-connect is enabled and this wasn't a manual disconnect
        const isManualDisconnect = event.reason === 'User initiated manual disconnect';
        
        if (autoConnect && !isManualDisconnect && connectionAttemptRef.current < 5) {
          // Exponential backoff for reconnection attempts
          const delay = Math.min(30000, 1000 * Math.pow(1.5, Math.min(connectionAttemptRef.current, 10)));
          
          addLog('info', `Will attempt to reconnect in ${delay / 1000} seconds (attempt ${connectionAttemptRef.current + 1}/5)`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (connectionAttemptRef.current >= 5) {
          addLog('warning', 'Maximum reconnection attempts (5) reached. Automatic reconnection stopped.');
        } else if (isManualDisconnect) {
          addLog('info', 'No reconnection attempt because this was a manual disconnect.');
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      logError('Failed to establish Binance WebSocket connection', err, 'BINANCE-WS-0003');
    }
  }, [addLog, logError, subscribedSymbols, getWebSocketUrl, handlePriceUpdate]);
  
  // Disconnect from WebSocket - only called manually
  const disconnect = useCallback(() => {
    // Clear any existing timers
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    if (minConnectionTimeoutRef.current) {
      clearTimeout(minConnectionTimeoutRef.current);
      minConnectionTimeoutRef.current = null;
    }
    
    // Only close the connection if explicitly called
    if (wsRef.current) {
      addLog('info', 'Manual disconnect from Binance WebSocket requested');
      wsRef.current.close(1000, 'User initiated manual disconnect');
      wsRef.current = null;
      setIsConnected(false);
    }
  }, [addLog]);
  
  // Reconnect to WebSocket
  const reconnect = useCallback(() => {
    addLog('info', 'Reconnecting Binance WebSocket - closing current connection');
    
    // Close any existing connection
    if (wsRef.current) {
      wsRef.current.close(1000, 'Reconnecting');
      wsRef.current = null;
      setIsConnected(false);
    }
    
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Clear any existing ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    // Clear minimum connection timeout if it exists
    if (minConnectionTimeoutRef.current) {
      clearTimeout(minConnectionTimeoutRef.current);
      minConnectionTimeoutRef.current = null;
    }
    
    // Short delay before reconnecting
    setTimeout(() => {
      connect();
    }, 1000);
  }, [connect, addLog]);
  
  // Single useEffect for auto-connect on mount and cleanup on unmount
  useEffect(() => {
    // Load auto-connect preference from localStorage
    const savedAutoConnect = localStorage.getItem('binance-ws-auto-connect');
    if (savedAutoConnect !== null) {
      setAutoConnect(savedAutoConnect === 'true');
    }
    
    // Clean up on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      
      if (minConnectionTimeoutRef.current) {
        clearTimeout(minConnectionTimeoutRef.current);
      }
      
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
      }
    };
  }, []);
  
  // Save auto-connect preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('binance-ws-auto-connect', autoConnect.toString());
  }, [autoConnect]);
  
  // Monitor autoConnect and connection state to manage connection
  useEffect(() => {
    // Only connect if auto-connect is enabled and not already connected
    if (autoConnect && !isConnected && subscribedSymbols.length > 0 && !wsRef.current) {
      console.log('BinanceWebSocketContext: Auto-connecting because conditions are met');
      connect();
    }
    // Remove the automatic disconnect completely
    // No else if branch for disconnect
  }, [autoConnect, isConnected, subscribedSymbols, connect]);
  
  return (
    <BinanceWebSocketContext.Provider value={{
      isConnected,
      connect,
      disconnect,
      reconnect,
      lastMessageTime,
      lastPingTime,
      lastPongTime,
      error,
      subscribedSymbols,
      autoConnect,
      setAutoConnect
    }}>
      {children}
    </BinanceWebSocketContext.Provider>
  );
};