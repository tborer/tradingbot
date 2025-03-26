import { useState, useEffect, useRef, useCallback } from 'react';
import { parseKrakenMessage, formatToKrakenSymbol, KrakenPrice } from '@/lib/kraken';
import { useWebSocketLogs } from '@/contexts/WebSocketLogContext';

// Constants for WebSocket connection management
const PING_INTERVAL = 15000; // 15 seconds
const RECONNECT_BASE_DELAY = 1000; // 1 second
const MAX_RECONNECT_ATTEMPTS = 5;
const CONNECTION_TIMEOUT = 10000; // 10 seconds

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

    // Clear any existing timeouts and intervals
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    try {
      // Add timestamp and random string to prevent caching issues
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 15);
      const wsUrl = `${url}?t=${timestamp}&r=${randomStr}`;
      
      console.log(`Connecting to Kraken WebSocket at ${wsUrl}`);
      addLog('info', 'Connecting to Kraken WebSocket', { url: wsUrl });
      
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      
      // Set a connection timeout
      const connectionTimeoutId = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          console.error('WebSocket connection timeout');
          addLog('error', 'WebSocket connection timeout', { url: wsUrl });
          
          // Force close and try to reconnect
          try {
            socket.close();
          } catch (err) {
            console.error('Error closing socket after timeout:', err);
          }
        }
      }, CONNECTION_TIMEOUT);

      socket.onopen = () => {
        // Clear the connection timeout
        clearTimeout(connectionTimeoutId);
        
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

        // Delay subscription slightly to ensure connection is fully established
        setTimeout(() => {
          try {
            console.log('Sending subscription message:', JSON.stringify(subscribeMessage));
            addLog('info', 'Sending Kraken subscription', { symbols: krakenSymbols });
            socket.send(JSON.stringify(subscribeMessage));
          } catch (err) {
            console.error('Error sending subscription:', err);
            addLog('error', 'Error sending subscription', { 
              error: err instanceof Error ? err.message : String(err) 
            });
          }
        }, 500);
        
        // Set up ping interval to keep connection alive
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }
        
        pingIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            try {
              console.log('Sending ping to Kraken WebSocket');
              socket.send(JSON.stringify({ method: "ping" }));
              
              // Set a timeout to check if we received a pong response
              const pongTimeoutId = setTimeout(() => {
                console.log('No pong response received, reconnecting...');
                addLog('warning', 'No pong response received', { url });
                reconnect();
              }, 5000);
              
              // Store the timeout ID so it can be cleared when we receive a pong
              (socket as any)._pongTimeoutId = pongTimeoutId;
            } catch (err) {
              console.error('Error sending ping:', err);
              addLog('error', 'Error sending ping', { 
                error: err instanceof Error ? err.message : String(err) 
              });
              
              // If we can't send a ping, the connection might be dead
              if (socket.readyState !== WebSocket.OPEN) {
                reconnect();
              }
            }
          } else if (socket.readyState !== WebSocket.CONNECTING) {
            // If the socket is not open or connecting, reconnect
            console.log('WebSocket not open during ping interval, reconnecting...');
            addLog('warning', 'WebSocket not open during ping interval', { 
              readyState: socket.readyState 
            });
            reconnect();
          }
        }, PING_INTERVAL);
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
        if (event.data.includes('"method":"ping"')) {
          console.log('Received ping message from Kraken, sending pong');
          try {
            socket.send(JSON.stringify({ method: "pong" }));
          } catch (err) {
            console.error('Error sending pong response:', err);
          }
          return;
        }
        
        // Handle pong responses
        if (event.data.includes('"method":"pong"')) {
          console.log('Received pong response from Kraken');
          
          // Clear the pong timeout if it exists
          if ((socket as any)._pongTimeoutId) {
            clearTimeout((socket as any)._pongTimeoutId);
            (socket as any)._pongTimeoutId = null;
          }
          return;
        }
        
        // Handle heartbeat messages
        if (event.data.includes('"channel":"heartbeat"')) {
          console.log('Received heartbeat from Kraken');
          return;
        }
        
        // Process the message
        handleMessage(event.data);
      };

      socket.onerror = (event) => {
        console.error('Kraken WebSocket error:', event);
        
        // Create a more detailed error log
        const errorDetails = {
          event: 'error',
          url,
          timestamp: Date.now(),
          readyState: socket.readyState,
          protocol: socket.protocol,
          extensions: socket.extensions,
          bufferedAmount: socket.bufferedAmount
        };
        
        console.error('Detailed Kraken WebSocket error:', JSON.stringify(errorDetails));
        addLog('error', 'Kraken WebSocket error', errorDetails);
        
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
                
                // Delay subscription slightly to ensure connection is fully established
                setTimeout(() => {
                  try {
                    console.log('Sending v1 subscription:', JSON.stringify(v1SubscribeMessage));
                    addLog('info', 'Sending v1 subscription', { symbols: krakenSymbols });
                    altSocket.send(JSON.stringify(v1SubscribeMessage));
                  } catch (err) {
                    console.error('Error sending v1 subscription:', err);
                    addLog('error', 'Error sending v1 subscription', { 
                      error: err instanceof Error ? err.message : String(err) 
                    });
                  }
                }, 500);
                
                // Set up ping interval
                if (pingIntervalRef.current) {
                  clearInterval(pingIntervalRef.current);
                }
                
                pingIntervalRef.current = setInterval(() => {
                  if (altSocket.readyState === WebSocket.OPEN) {
                    try {
                      console.log('Sending ping to alternative Kraken WebSocket');
                      altSocket.send(JSON.stringify({ name: "ping" }));
                      
                      // Set a timeout to check if we received a pong response
                      const pongTimeoutId = setTimeout(() => {
                        console.log('No pong response received from alternative WebSocket, reconnecting...');
                        addLog('warning', 'No pong response received from alternative WebSocket', { url: v1Url });
                        
                        // Force close and reconnect
                        try {
                          altSocket.close();
                        } catch (err) {
                          console.error('Error closing alternative socket after pong timeout:', err);
                        }
                        
                        // Reset and try the main URL again
                        reconnectAttemptsRef.current = 0;
                        connect();
                      }, 5000);
                      
                      // Store the timeout ID so it can be cleared when we receive a pong
                      (altSocket as any)._pongTimeoutId = pongTimeoutId;
                    } catch (err) {
                      console.error('Error sending ping to alternative WebSocket:', err);
                      addLog('error', 'Error sending ping to alternative WebSocket', { 
                        error: err instanceof Error ? err.message : String(err) 
                      });
                      
                      // If we can't send a ping, the connection might be dead
                      if (altSocket.readyState !== WebSocket.OPEN) {
                        // Reset and try the main URL again
                        reconnectAttemptsRef.current = 0;
                        connect();
                      }
                    }
                  } else if (altSocket.readyState !== WebSocket.CONNECTING) {
                    // If the socket is not open or connecting, reconnect
                    console.log('Alternative WebSocket not open during ping interval, reconnecting...');
                    addLog('warning', 'Alternative WebSocket not open during ping interval', { 
                      readyState: altSocket.readyState 
                    });
                    
                    // Reset and try the main URL again
                    reconnectAttemptsRef.current = 0;
                    connect();
                  }
                }, PING_INTERVAL);
              };
              
              // Set up other event handlers for the alternative socket
              altSocket.onmessage = socket.onmessage; // Reuse the same handler
              
              altSocket.onerror = (event) => {
                console.error('Alternative Kraken WebSocket error:', event);
                
                // Create a more detailed error log
                const errorDetails = {
                  event: 'error',
                  url: v1Url,
                  timestamp: Date.now(),
                  readyState: altSocket.readyState,
                  protocol: altSocket.protocol,
                  extensions: altSocket.extensions,
                  bufferedAmount: altSocket.bufferedAmount
                };
                
                console.error('Detailed alternative Kraken WebSocket error:', JSON.stringify(errorDetails));
                addLog('error', 'Alternative Kraken WebSocket error', errorDetails);
                
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