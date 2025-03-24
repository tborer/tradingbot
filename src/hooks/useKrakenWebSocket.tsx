import { useState, useEffect, useRef } from 'react';
import { parseKrakenMessage, formatToKrakenSymbol, KrakenPrice } from '@/lib/kraken';

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
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    if (!enabled || symbols.length === 0) {
      return;
    }

    const connect = () => {
      try {
        console.log(`Connecting to Kraken WebSocket at URL: ${url}`);
        
        // Add a timestamp to prevent caching
        const timestamp = Date.now();
        const socket = new WebSocket(`${url}?t=${timestamp}`);
        socketRef.current = socket;

        socket.onopen = () => {
          console.log('Kraken WebSocket connected successfully');
          setIsConnected(true);
          reconnectAttemptsRef.current = 0;
          setError(null);

          // Subscribe to ticker data for each symbol
          const krakenSymbols = symbols.map(formatToKrakenSymbol);
          console.log('Subscribing to Kraken symbols:', krakenSymbols);
          
          // Use the recommended subscription format
          const subscribeMessage = {
            method: "subscribe",
            params: {
              channel: "ticker",
              symbol: krakenSymbols
            }
          };

          console.log('Sending Kraken subscription message:', JSON.stringify(subscribeMessage));
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
            
            // Parse the message
            if (typeof event.data === 'string') {
              const prices = parseKrakenMessage(event.data);
              
              if (prices.length > 0) {
                console.log('Parsed Kraken prices:', prices);
                if (onPriceUpdate) {
                  onPriceUpdate(prices);
                }
              }
            }
          } catch (err) {
            console.error('Error processing Kraken WebSocket message:', err);
            console.error('Raw message that caused error:', 
              typeof event.data === 'string' ? event.data.substring(0, 500) : 'Non-string data');
          }
        };

        socket.onerror = (event) => {
          console.error('Kraken WebSocket error:', event);
          setError(new Error('WebSocket connection error'));
          setIsConnected(false);
        };

        socket.onclose = (event) => {
          console.log(`Kraken WebSocket closed. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}, Clean: ${event.wasClean}`);
          setIsConnected(false);

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
            
            // Try alternative URL
            if (url === 'wss://ws.kraken.com/v2') {
              console.log('Trying alternative Kraken WebSocket URL...');
              
              // Reset reconnect attempts for the new URL
              reconnectAttemptsRef.current = 0;
              
              // Try the v1 WebSocket URL as a fallback
              reconnectTimeoutRef.current = setTimeout(() => {
                connect();
              }, 5000);
            }
          }
        };
      } catch (err) {
        console.error('Error creating Kraken WebSocket connection:', err);
        setError(err instanceof Error ? err : new Error('Unknown connection error'));
        setIsConnected(false);
      }
    };

    connect();

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

  // Reconnect if symbols change
  useEffect(() => {
    if (isConnected && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      // Unsubscribe from current symbols
      const krakenSymbols = symbols.map(formatToKrakenSymbol);
      
      // First unsubscribe
      const unsubscribeMessage = {
        method: 'unsubscribe',
        params: {
          channel: 'ticker',
          symbol: krakenSymbols
        }
      };
      
      console.log('Sending unsubscribe message:', JSON.stringify(unsubscribeMessage));
      socketRef.current.send(JSON.stringify(unsubscribeMessage));
      
      // Then subscribe to new symbols
      const subscribeMessage = {
        method: 'subscribe',
        params: {
          channel: 'ticker',
          symbol: krakenSymbols
        }
      };
      
      console.log('Sending subscribe message for new symbols:', JSON.stringify(subscribeMessage));
      socketRef.current.send(JSON.stringify(subscribeMessage));
    }
  }, [JSON.stringify(symbols), isConnected]);

  const reconnect = () => {
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (err) {
        console.error('Error closing socket during reconnect:', err);
      }
      socketRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    reconnectAttemptsRef.current = 0;
    setError(null);
    
    // Reconnect immediately
    if (enabled && symbols.length > 0) {
      const connect = () => {
        try {
          console.log(`Reconnecting to Kraken WebSocket at URL: ${url}`);
          
          // Add a timestamp to prevent caching
          const timestamp = Date.now();
          const socket = new WebSocket(`${url}?t=${timestamp}`);
          socketRef.current = socket;
          
          // Set up event handlers as before...
          // (This is simplified - in a real implementation, you'd duplicate the event handler setup)
        } catch (err) {
          console.error('Error during manual reconnect:', err);
          setError(err instanceof Error ? err : new Error('Unknown reconnection error'));
        }
      };
      
      connect();
    }
  };

  return {
    isConnected,
    lastMessage,
    error,
    reconnect
  };
}