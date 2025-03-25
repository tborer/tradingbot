import { useState, useEffect, useRef, useCallback } from 'react';
import { parseKrakenMessage, formatToKrakenSymbol, KrakenPrice } from '@/lib/kraken';
import { useWebSocketLogs } from '@/contexts/WebSocketLogContext';

interface UseKrakenWebSocketOptions {
  symbols: string[];
  url?: string;
  onPriceUpdate?: (prices: KrakenPrice[]) => void;
  enabled?: boolean;
}

export function useKrakenWebSocket({
  symbols,
  url = 'wss://ws.kraken.com/v2',
  onPriceUpdate,
  enabled = true
}: UseKrakenWebSocketOptions) {
  const { addLog } = useWebSocketLogs();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to handle WebSocket messages
  const handleMessage = useCallback((data: string) => {
    try {
      // Parse the message to extract price data
      const prices = parseKrakenMessage(data);
      
      if (prices.length > 0) {
        console.log('Successfully parsed Kraken prices:', prices);
        addLog('success', 'Successfully parsed Kraken prices', { prices });
        
        if (onPriceUpdate) {
          onPriceUpdate(prices);
        }
      }
    } catch (err) {
      console.error('Error processing Kraken message:', err);
      addLog('error', 'Error processing Kraken message', { 
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }, [onPriceUpdate, addLog]);

  // Function to establish WebSocket connection
  const connect = useCallback(() => {
    if (!enabled || symbols.length === 0) {
      return;
    }

    // Close any existing connection
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (err) {
        console.error('Error closing existing WebSocket:', err);
      }
      socketRef.current = null;
    }

    try {
      // Add timestamp to prevent caching
      const timestamp = Date.now();
      const wsUrl = `${url}?t=${timestamp}`;
      
      console.log(`Connecting to Kraken WebSocket at ${wsUrl}`);
      addLog('info', 'Connecting to Kraken WebSocket', { url: wsUrl });
      
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('Kraken WebSocket connected successfully');
        addLog('success', 'Kraken WebSocket connected', { url });
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Subscribe to ticker data for each symbol
        const krakenSymbols = symbols.map(formatToKrakenSymbol);
        console.log('Subscribing to Kraken symbols:', krakenSymbols);
        
        // Use the correct subscription format exactly as specified in the Kraken API docs
        const subscribeMessage = {
          method: "subscribe",
          params: {
            channel: "ticker",
            symbol: krakenSymbols,
            snapshot: true
          }
        };

        console.log('Sending subscription message:', JSON.stringify(subscribeMessage));
        addLog('info', 'Sending Kraken subscription', { symbols: krakenSymbols });
        socket.send(JSON.stringify(subscribeMessage));
        
        // Set up ping interval to keep connection alive
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }
        
        pingIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            try {
              console.log('Sending ping to Kraken WebSocket');
              socket.send(JSON.stringify({ method: "ping" }));
            } catch (err) {
              console.error('Error sending ping:', err);
            }
          }
        }, 30000); // Send ping every 30 seconds
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') {
          console.log('Received non-string message from Kraken');
          return;
        }

        // Log the raw message (truncated for readability)
        const truncatedMessage = event.data.length > 200 
          ? event.data.substring(0, 200) + "..." 
          : event.data;
        console.log("Received Kraken message:", truncatedMessage);
        
        // Check for ping/pong messages
        if (event.data.includes('"method":"ping"') || event.data.includes('"method":"pong"')) {
          console.log('Received ping/pong message from Kraken');
          return;
        }
        
        // Process the message
        handleMessage(event.data);
      };

      socket.onerror = (event) => {
        console.error('Kraken WebSocket error:', event);
        addLog('error', 'Kraken WebSocket error', { 
          event: 'error',
          url,
          timestamp: Date.now()
        });
        
        setError(new Error('WebSocket connection error'));
        setIsConnected(false);
      };

      socket.onclose = (event) => {
        console.log(`Kraken WebSocket closed. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}`);
        addLog('warning', 'Kraken WebSocket closed', {
          code: event.code,
          reason: event.reason || 'No reason provided',
          wasClean: event.wasClean
        });
        
        setIsConnected(false);
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Attempt to reconnect with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = 1000 * Math.pow(2, reconnectAttemptsRef.current);
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current += 1;
            connect();
          }, delay);
        } else {
          console.error('Max reconnection attempts reached');
          setError(new Error('Failed to connect after maximum attempts'));
          
          // Try alternative URL if we're using the default
          if (url === 'wss://ws.kraken.com/v2') {
            console.log('Trying alternative Kraken WebSocket URL...');
            
            // Reset reconnect attempts for the new URL
            reconnectAttemptsRef.current = 0;
            
            // Try the v1 WebSocket URL as a fallback
            reconnectTimeoutRef.current = setTimeout(() => {
              // Create a new connection with v1 URL
              const v1Url = 'wss://ws.kraken.com';
              
              console.log(`Connecting to alternative Kraken WebSocket at ${v1Url}`);
              addLog('info', 'Connecting to alternative Kraken WebSocket', { url: v1Url });
              
              const altSocket = new WebSocket(v1Url);
              socketRef.current = altSocket;
              
              altSocket.onopen = () => {
                console.log('Connected to alternative Kraken WebSocket');
                addLog('success', 'Connected to alternative Kraken WebSocket', { url: v1Url });
                setIsConnected(true);
                setError(null);
                
                // Subscribe using v1 format
                const krakenSymbols = symbols.map(formatToKrakenSymbol);
                const v1SubscribeMessage = {
                  name: 'subscribe',
                  subscription: {
                    name: 'ticker'
                  },
                  pair: krakenSymbols
                };
                
                console.log('Sending v1 subscription:', JSON.stringify(v1SubscribeMessage));
                addLog('info', 'Sending v1 subscription', { symbols: krakenSymbols });
                altSocket.send(JSON.stringify(v1SubscribeMessage));
                
                // Set up ping interval
                if (pingIntervalRef.current) {
                  clearInterval(pingIntervalRef.current);
                }
                
                pingIntervalRef.current = setInterval(() => {
                  if (altSocket.readyState === WebSocket.OPEN) {
                    try {
                      console.log('Sending ping to alternative Kraken WebSocket');
                      altSocket.send(JSON.stringify({ name: "ping" }));
                    } catch (err) {
                      console.error('Error sending ping to alternative WebSocket:', err);
                    }
                  }
                }, 30000);
              };
              
              // Set up other event handlers for the alternative socket
              altSocket.onmessage = socket.onmessage; // Reuse the same handler
              
              altSocket.onerror = (event) => {
                console.error('Alternative Kraken WebSocket error:', event);
                addLog('error', 'Alternative Kraken WebSocket error', { 
                  event: 'error',
                  url: v1Url,
                  timestamp: Date.now()
                });
                setError(new Error('Alternative WebSocket connection error'));
                setIsConnected(false);
              };
              
              altSocket.onclose = (event) => {
                console.log(`Alternative Kraken WebSocket closed. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}`);
                addLog('warning', 'Alternative Kraken WebSocket closed', {
                  code: event.code,
                  reason: event.reason || 'No reason provided',
                  wasClean: event.wasClean
                });
                setIsConnected(false);
                
                // Clear ping interval
                if (pingIntervalRef.current) {
                  clearInterval(pingIntervalRef.current);
                  pingIntervalRef.current = null;
                }
              };
            }, 5000);
          }
        }
      };
    } catch (err) {
      console.error('Error creating Kraken WebSocket connection:', err);
      addLog('error', 'Error creating Kraken WebSocket connection', {
        error: err instanceof Error ? err.message : String(err)
      });
      setError(err instanceof Error ? err : new Error('Unknown connection error'));
      setIsConnected(false);
    }
  }, [url, symbols, enabled, handleMessage, addLog]);

  // Connect when component mounts or when dependencies change
  useEffect(() => {
    if (enabled && symbols.length > 0) {
      connect();
    }
    
    // Cleanup function
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      
      if (socketRef.current) {
        try {
          if (socketRef.current.readyState === WebSocket.OPEN) {
            // Unsubscribe before closing
            const krakenSymbols = symbols.map(formatToKrakenSymbol);
            const unsubscribeMessage = {
              method: 'unsubscribe',
              params: {
                channel: 'ticker',
                symbol: krakenSymbols
              }
            };
            
            socketRef.current.send(JSON.stringify(unsubscribeMessage));
          }
          
          socketRef.current.close();
        } catch (err) {
          console.error('Error closing Kraken WebSocket:', err);
        }
        socketRef.current = null;
      }
    };
  }, [url, JSON.stringify(symbols), enabled, connect]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    console.log('Manual reconnect initiated');
    addLog('info', 'Manual reconnect initiated', { url });
    
    // Clear any existing timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Clear ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    // Close existing connection
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (err) {
        console.error('Error closing socket during reconnect:', err);
      }
      socketRef.current = null;
    }
    
    // Reset reconnect attempts
    reconnectAttemptsRef.current = 0;
    setError(null);
    
    // Connect immediately
    connect();
  }, [connect, url, addLog]);

  return {
    isConnected,
    error,
    reconnect
  };
}