import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useWebSocketLogs } from './WebSocketLogContext';
import { useMicroProcessing } from '@/hooks/useMicroProcessing';

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
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionAttemptRef = useRef<number>(0);
  
  const baseUrl = 'wss://stream.binance.us:9443';
  
  // Function to get WebSocket URL based on subscribed symbols
  const getWebSocketUrl = useCallback(() => {
    if (subscribedSymbols.length === 0) {
      return `${baseUrl}/ws`;
    }
    
    if (subscribedSymbols.length === 1) {
      // For a single symbol, use the direct /ws/<symbol>@aggTrade format
      const lowerSymbol = subscribedSymbols[0].toLowerCase();
      return `${baseUrl}/ws/${lowerSymbol}@aggTrade`;
    } else {
      // For multiple symbols, use the combined stream format
      const streams = subscribedSymbols.flatMap(symbol => {
        const lowerSymbol = symbol.toLowerCase();
        return [`${lowerSymbol}@aggTrade`, `${lowerSymbol}@depth`];
      });
      
      return `${baseUrl}/stream?streams=${streams.join('/')}`;
    }
  }, [subscribedSymbols]);
  
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
    
    // Increment connection attempt counter
    connectionAttemptRef.current += 1;
    
    try {
      // Close existing connection if any
      if (wsRef.current) {
        wsRef.current.close();
      }
      
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
        
        // Subscribe to the streams for each symbol
        if (subscribedSymbols.length > 0) {
          const streams = subscribedSymbols.flatMap(symbol => {
            const lowerSymbol = symbol.toLowerCase();
            return [`${lowerSymbol}@aggTrade`, `${lowerSymbol}@depth`];
          });
          
          const subscribeMessage = {
            method: 'SUBSCRIBE',
            params: streams,
            id: 1
          };
          
          wsRef.current?.send(JSON.stringify(subscribeMessage));
          addLog('info', 'Sent subscription request', { subscribeMessage });
        }
        
        // Set up ping interval (every 2.5 minutes to keep connection alive)
        pingIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ method: 'PING' }));
            setLastPingTime(new Date());
            addLog('info', 'Sent ping to Binance WebSocket');
          }
        }, 150000); // 2.5 minutes
      };
      
      wsRef.current.onmessage = (event) => {
        setLastMessageTime(new Date());
        
        try {
          const data = JSON.parse(event.data);
          
          // Handle subscription response
          if (data.id === 1) {
            if (data.result === null) {
              addLog('success', 'Successfully subscribed to Binance streams', { data });
            } else {
              addLog('error', 'Failed to subscribe to Binance streams', { data });
            }
            return;
          }
          
          // Handle pong response
          if (data.result && data.result === 'pong') {
            setLastPongTime(new Date());
            addLog('info', 'Received pong from Binance WebSocket');
            return;
          }
          
          // Handle depth (order book) updates
          if ((data.stream && data.stream.includes('@depth')) || (data.e === 'depthUpdate')) {
            // Handle both stream format and direct message format
            let symbol, bestBidPrice;
            
            if (data.stream) {
              // Stream format (combined streams)
              symbol = data.stream.split('@')[0].toUpperCase();
              bestBidPrice = parseFloat(data.data.b && data.data.b[0] ? data.data.b[0][0] : 0);
            } else {
              // Direct message format
              symbol = data.s; // Symbol is in the 's' field
              bestBidPrice = parseFloat(data.b && data.b[0] ? data.b[0][0] : 0);
            }
            
            // Update price in the micro processing service
            if (!isNaN(bestBidPrice) && bestBidPrice > 0) {
              handlePriceUpdate({
                symbol,
                price: bestBidPrice
              });
              
              // Log price update (but not too frequently to avoid flooding logs)
              if (Math.random() < 0.05) { // Log approximately 5% of updates
                addLog('info', `Received price update for ${symbol}: $${bestBidPrice} (best bid from depth)`, {
                  symbol,
                  price: bestBidPrice,
                  source: 'binance-depth'
                });
              }
            }
          }
          
          // Handle trade updates
          if (data.stream && data.stream.includes('@aggTrade')) {
            const symbol = data.stream.split('@')[0].toUpperCase();
            const price = parseFloat(data.data.p);
            
            // Update price in the micro processing service
            if (!isNaN(price) && price > 0) {
              handlePriceUpdate({
                symbol,
                price
              });
              
              // Log price update (but not too frequently to avoid flooding logs)
              if (Math.random() < 0.05) { // Log approximately 5% of updates
                addLog('info', `Received trade update for ${symbol}: $${price}`, {
                  symbol,
                  price,
                  source: 'binance-trade'
                });
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
        addLog('warning', `Binance WebSocket connection closed: ${event.code} ${event.reason}`, {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        
        // Attempt to reconnect if auto-connect is enabled and not a normal closure
        if (autoConnect && event.code !== 1000) {
          // Exponential backoff for reconnection attempts
          const delay = Math.min(30000, 1000 * Math.pow(1.5, Math.min(connectionAttemptRef.current, 10)));
          
          addLog('info', `Will attempt to reconnect in ${delay / 1000} seconds`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      logError('Failed to establish Binance WebSocket connection', err, 'BINANCE-WS-0003');
    }
  }, [addLog, logError, subscribedSymbols, getWebSocketUrl, autoConnect, handlePriceUpdate]);
  
  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
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
    
    if (wsRef.current) {
      addLog('info', 'Disconnecting from Binance WebSocket');
      
      // If connected, send unsubscribe message before closing
      if (wsRef.current.readyState === WebSocket.OPEN && subscribedSymbols.length > 0) {
        const streams = subscribedSymbols.flatMap(symbol => {
          const lowerSymbol = symbol.toLowerCase();
          return [`${lowerSymbol}@aggTrade`, `${lowerSymbol}@depth`];
        });
        
        const unsubscribeMessage = {
          method: 'UNSUBSCRIBE',
          params: streams,
          id: 2
        };
        
        wsRef.current.send(JSON.stringify(unsubscribeMessage));
        addLog('info', 'Sent unsubscribe request', { unsubscribeMessage });
      }
      
      // Close the connection
      wsRef.current.close(1000, 'User initiated disconnect');
      wsRef.current = null;
      setIsConnected(false);
    }
  }, [addLog, subscribedSymbols]);
  
  // Reconnect to WebSocket
  const reconnect = useCallback(() => {
    disconnect();
    // Short delay before reconnecting
    setTimeout(() => {
      connect();
    }, 1000);
  }, [disconnect, connect]);
  
  // Auto-connect on mount if enabled
  useEffect(() => {
    // Load auto-connect preference from localStorage
    const savedAutoConnect = localStorage.getItem('binance-ws-auto-connect');
    if (savedAutoConnect !== null) {
      setAutoConnect(savedAutoConnect === 'true');
    }
    
    // Connect if auto-connect is enabled and there are symbols to subscribe to
    if ((savedAutoConnect === 'true' || autoConnect) && subscribedSymbols.length > 0) {
      connect();
    }
    
    // Clean up on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
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
  
  // Connect/disconnect when autoConnect changes
  useEffect(() => {
    if (autoConnect && !isConnected && subscribedSymbols.length > 0) {
      connect();
    } else if (!autoConnect && isConnected) {
      disconnect();
    }
  }, [autoConnect, isConnected, connect, disconnect, subscribedSymbols]);
  
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