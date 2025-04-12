import { useState, useEffect, useRef } from 'react';
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
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const previousSymbolsRef = useRef<string[]>([]);
  const maxReconnectAttempts = 5;

  // Helper function to calculate symbol differences
  const calculateSymbolDifferences = (prevSymbols: string[], currentSymbols: string[]) => {
    const prevSet = new Set(prevSymbols.map(formatToKrakenSymbol));
    const currentSet = new Set(currentSymbols.map(formatToKrakenSymbol));
    
    // Symbols to unsubscribe (in previous but not in current)
    const symbolsToUnsubscribe = Array.from(prevSet).filter(symbol => !currentSet.has(symbol));
    
    // Symbols to subscribe (in current but not in previous)
    const symbolsToSubscribe = Array.from(currentSet).filter(symbol => !prevSet.has(symbol));
    
    return { symbolsToUnsubscribe, symbolsToSubscribe };
  };

  // Extracted shared connection logic
  const establishKrakenConnection = (connectionUrl: string, connectionSymbols: string[]) => {
    try {
      // Ensure we're using the secure WebSocket protocol (wss://)
      let secureUrl = connectionUrl;
      if (secureUrl.startsWith('ws://')) {
        console.warn('Insecure WebSocket URL detected, upgrading to secure wss:// protocol');
        addLog('warning', 'Insecure WebSocket URL detected, upgrading to secure protocol', { 
          originalUrl: connectionUrl, 
          timestamp: Date.now() 
        });
        secureUrl = secureUrl.replace('ws://', 'wss://');
      } else if (!secureUrl.startsWith('wss://')) {
        console.warn('WebSocket URL does not specify protocol, adding secure wss:// protocol');
        addLog('warning', 'WebSocket URL does not specify protocol, adding secure protocol', { 
          originalUrl: connectionUrl, 
          timestamp: Date.now() 
        });
        secureUrl = `wss://${secureUrl}`;
      }
      
      console.log(`Connecting to Kraken WebSocket using secure URL: ${secureUrl}`);
      addLog('info', 'Connecting to WebSocket', { url: secureUrl, timestamp: Date.now() });
      
      // Add a timestamp to prevent caching
      const timestamp = Date.now();
      const socket = new WebSocket(`${secureUrl}?t=${timestamp}`);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('Kraken WebSocket connected successfully');
        addLog('success', 'WebSocket connected successfully', { url: connectionUrl });
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        setError(null);

        // Subscribe to ticker data for each symbol
        const krakenSymbols = connectionSymbols.map(formatToKrakenSymbol);
        console.log('Subscribing to Kraken symbols:', krakenSymbols);
        
        // Use the correct subscription format
        const subscribeMessage = {
          method: "subscribe",
          params: {
            channel: "ticker",
            symbol: krakenSymbols
          }
        };

        console.log('Sending Kraken subscription message:', JSON.stringify(subscribeMessage));
        addLog('info', 'Sending subscription message', { 
          message: subscribeMessage, 
          symbols: krakenSymbols 
        });
        socket.send(JSON.stringify(subscribeMessage));
        
        // Try alternative subscription format if needed
        setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN) {
            // Send a v1 format subscription as a fallback
            const v1SubscribeMessage = {
              name: 'subscribe',
              subscription: {
                name: 'ticker'
              },
              pair: krakenSymbols
            };
            
            console.log('Sending v1 subscription message as fallback:', JSON.stringify(v1SubscribeMessage));
            addLog('info', 'Sending fallback v1 subscription message', { 
              message: v1SubscribeMessage, 
              symbols: krakenSymbols 
            });
            socket.send(JSON.stringify(v1SubscribeMessage));
          }
        }, 2000);
      };

      socket.onmessage = (event) => {
        try {
          if (!event.data) return;
          
          // Store the raw message for debugging
          setLastMessage(typeof event.data === 'string' ? event.data : 'Binary data');
          
          // Log the raw message (truncated for readability)
          const truncatedMessage = typeof event.data === 'string' && event.data.length > 200 
            ? event.data.substring(0, 200) + "..." 
            : event.data;
          console.log("Received Kraken message:", truncatedMessage);
          
          // Add to log context
          addLog('info', 'Received WebSocket message', {
            data: truncatedMessage,
            timestamp: Date.now()
          });
          
          // Parse the message
          if (typeof event.data === 'string') {
            const prices = parseKrakenMessage(event.data);
            
            if (prices.length > 0) {
              console.log('Parsed Kraken prices:', JSON.stringify(prices));
              addLog('success', 'Successfully parsed price data', { 
                prices, 
                count: prices.length 
              });
              
              if (onPriceUpdate) {
                onPriceUpdate(prices);
              }
            } else {
              console.log('No prices extracted from message');
            }
          }
        } catch (err) {
          console.error('Error processing Kraken WebSocket message:', err);
          console.error('Raw message that caused error:', 
            typeof event.data === 'string' ? event.data.substring(0, 500) : 'Non-string data');
          
          addLog('error', 'Error processing WebSocket message', {
            error: err instanceof Error ? err.message : String(err),
            rawData: typeof event.data === 'string' ? event.data.substring(0, 500) : 'Non-string data'
          });
        }
      };

      socket.onerror = (event) => {
        console.error('Kraken WebSocket error:', event);
        addLog('error', 'WebSocket error event', { 
          event: 'error',
          url: connectionUrl,
          timestamp: Date.now()
        });
        setError(new Error('WebSocket connection error'));
        setIsConnected(false);
      };

      socket.onclose = (event) => {
        console.log(`Kraken WebSocket closed. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}, Clean: ${event.wasClean}`);
        addLog('warning', 'WebSocket connection closed', {
          code: event.code,
          reason: event.reason || 'No reason provided',
          wasClean: event.wasClean,
          url: connectionUrl,
          timestamp: Date.now()
        });
        setIsConnected(false);

        // Attempt to reconnect with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = 1000 * Math.pow(2, reconnectAttemptsRef.current);
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
          addLog('info', 'Attempting to reconnect', {
            attempt: reconnectAttemptsRef.current + 1,
            maxAttempts: maxReconnectAttempts,
            delay,
            url: connectionUrl
          });
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current += 1;
            establishKrakenConnection(connectionUrl, connectionSymbols);
          }, delay);
        } else {
          console.error('Max reconnection attempts reached');
          addLog('error', 'Max reconnection attempts reached', {
            attempts: reconnectAttemptsRef.current,
            url: connectionUrl
          });
          setError(new Error('Failed to connect after maximum attempts'));
          
          // Try alternative URL
          if (connectionUrl === 'wss://ws.kraken.com/v2') {
            console.log('Trying alternative Kraken WebSocket URL...');
            addLog('info', 'Trying alternative WebSocket URL', {
              currentUrl: connectionUrl,
              timestamp: Date.now()
            });
            
            // Reset reconnect attempts for the new URL
            reconnectAttemptsRef.current = 0;
            
            // Try the v1 WebSocket URL as a fallback
            reconnectTimeoutRef.current = setTimeout(() => {
              establishKrakenConnection(connectionUrl, connectionSymbols);
            }, 5000);
          }
        }
      };

      return socket;
    } catch (err) {
      console.error('Error creating Kraken WebSocket connection:', err);
      addLog('error', 'Error creating WebSocket connection', {
        error: err instanceof Error ? err.message : String(err),
        url: connectionUrl,
        timestamp: Date.now()
      });
      setError(err instanceof Error ? err : new Error('Unknown connection error'));
      setIsConnected(false);
      return null;
    }
  };

  useEffect(() => {
    if (!enabled || symbols.length === 0) {
      return;
    }

    // Use the shared connection function
    const socket = establishKrakenConnection(url, symbols);
    
    // Store the initial symbols for future diffing
    previousSymbolsRef.current = [...symbols];

    // Cleanup function
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
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
  }, [url, JSON.stringify(symbols), enabled, onPriceUpdate]);

  // Optimized symbol change handling with diffing
  useEffect(() => {
    if (isConnected && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      // Calculate the differences between previous and current symbols
      const { symbolsToUnsubscribe, symbolsToSubscribe } = calculateSymbolDifferences(
        previousSymbolsRef.current,
        symbols
      );
      
      // Only send unsubscribe message if there are symbols to unsubscribe
      if (symbolsToUnsubscribe.length > 0) {
        const unsubscribeMessage = {
          method: 'unsubscribe',
          params: {
            channel: 'ticker',
            symbol: symbolsToUnsubscribe
          }
        };
        
        console.log('Sending unsubscribe message for removed symbols:', JSON.stringify(unsubscribeMessage));
        addLog('info', 'Unsubscribing from removed symbols', { 
          count: symbolsToUnsubscribe.length,
          symbols: symbolsToUnsubscribe
        });
        socketRef.current.send(JSON.stringify(unsubscribeMessage));
      }
      
      // Only send subscribe message if there are symbols to subscribe
      if (symbolsToSubscribe.length > 0) {
        const subscribeMessage = {
          method: 'subscribe',
          params: {
            channel: 'ticker',
            symbol: symbolsToSubscribe
          }
        };
        
        console.log('Sending subscribe message for new symbols:', JSON.stringify(subscribeMessage));
        addLog('info', 'Subscribing to new symbols', { 
          count: symbolsToSubscribe.length,
          symbols: symbolsToSubscribe
        });
        socketRef.current.send(JSON.stringify(subscribeMessage));
      }
      
      // Update the previous symbols reference for future diffing
      previousSymbolsRef.current = [...symbols];
    }
  }, [JSON.stringify(symbols), isConnected]);

  const reconnect = () => {
    addLog('info', 'Manual reconnect initiated', { url, timestamp: Date.now() });
    
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (err) {
        console.error('Error closing socket during reconnect:', err);
        addLog('error', 'Error closing socket during manual reconnect', {
          error: err instanceof Error ? err.message : String(err),
          url
        });
      }
      socketRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    reconnectAttemptsRef.current = 0;
    setError(null);
    
    // Reconnect immediately using the shared connection function
    if (enabled && symbols.length > 0) {
      establishKrakenConnection(url, symbols);
    }
  };

  return {
    isConnected,
    lastMessage,
    error,
    reconnect
  };
}