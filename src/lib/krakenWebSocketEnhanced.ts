import { useEffect, useRef, useState } from 'react';

interface KrakenWebSocketOptions {
  url: string;
  symbols: string[];
  onMessage: (data: any) => void;
  onError?: (error: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onOpen?: () => void;
}

export const useKrakenWebSocket = ({
  url,
  symbols,
  onMessage,
  onError,
  onClose,
  onOpen
}: KrakenWebSocketOptions) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000; // 1 second

  // Try alternative WebSocket URL if the main one fails
  const tryAlternativeUrl = () => {
    // If we're already using an alternative URL (not the default), don't try again
    if (url !== 'wss://ws.kraken.com/v2') {
      console.log('Already using alternative WebSocket URL, not retrying');
      return;
    }
    
    console.log('Trying alternative Kraken WebSocket URL...');
    // Try the v1 WebSocket URL as a fallback
    const alternativeUrl = 'wss://ws.kraken.com';
    
    try {
      const socket = new WebSocket(alternativeUrl);
      socketRef.current = socket;
      
      socket.onopen = () => {
        console.log('Connected to alternative Kraken WebSocket URL');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        
        // Subscribe to ticker data with v1 format
        const subscribeMessage = {
          name: 'subscribe',
          subscription: {
            name: 'ticker'
          },
          pair: symbols.map(symbol => {
            // Convert BTC to XBT/USD format for Kraken
            if (symbol === 'BTC') {
              return 'XBT/USD';
            }
            return `${symbol}/USD`;
          })
        };
        
        console.log('Sending v1 subscription message:', JSON.stringify(subscribeMessage));
        socket.send(JSON.stringify(subscribeMessage));
        
        if (onOpen) {
          onOpen();
        }
      };
      
      // Set up the rest of the event handlers similar to the main connection
      socket.onmessage = (event) => {
        try {
          if (!event.data || event.data === '{}') {
            return;
          }
          
          console.log('Received message from alternative Kraken WebSocket:', 
            typeof event.data === 'string' && event.data.length > 200 
              ? event.data.substring(0, 200) + "..." 
              : event.data);
          
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (err) {
          console.error('Error parsing alternative WebSocket message:', err);
        }
      };
      
      socket.onerror = (event) => {
        console.error('Alternative WebSocket error:', event);
        setError(event);
        if (onError) {
          onError(event);
        }
      };
      
      socket.onclose = (event) => {
        console.log('Alternative WebSocket closed:', event);
        setIsConnected(false);
        if (onClose) {
          onClose(event);
        }
      };
    } catch (err) {
      console.error('Error creating alternative WebSocket connection:', err);
    }
  };

  const connect = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      console.log(`Connecting to Kraken WebSocket at URL: ${url}`);
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('Kraken WebSocket connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        
        // Convert symbols to Kraken format
        const krakenSymbols = symbols.map(symbol => {
          // Convert BTC to XBT/USD format for Kraken
          if (symbol === 'BTC') {
            return 'XBT/USD';
          }
          return `${symbol}/USD`;
        });
        
        console.log('Using Kraken symbols:', krakenSymbols);
        
        // Subscribe to ticker data for each symbol
        const subscribeMessage = {
          method: 'subscribe',
          params: {
            channel: 'ticker',
            symbol: krakenSymbols
          }
        };
        
        console.log('Sending Kraken subscription message:', JSON.stringify(subscribeMessage));
        socket.send(JSON.stringify(subscribeMessage));
        
        if (onOpen) {
          onOpen();
        }
      };

      socket.onmessage = (event) => {
        try {
          // Check if the message is empty or just '{}'
          if (!event.data || event.data === '{}') {
            console.log('Received empty message from Kraken, ignoring');
            return;
          }
          
          // Log the raw message for debugging (truncated for readability)
          const truncatedMessage = typeof event.data === 'string' && event.data.length > 200 
            ? event.data.substring(0, 200) + "..." 
            : event.data;
          console.log("Received Kraken message:", truncatedMessage);
          
          const data = JSON.parse(event.data);
          console.log("Parsed Kraken message data:", JSON.stringify(data).substring(0, 200));
          
          // Check if this is a heartbeat message
          if (data.method === 'heartbeat') {
            console.log('Received Kraken heartbeat');
            return;
          }
          
          // Check if this is a subscription status message
          if (data.method === 'subscribe' || data.method === 'unsubscribe') {
            console.log(`Kraken ${data.method} status:`, data.result);
            
            // If subscription failed, try to resubscribe with different format
            if (data.method === 'subscribe' && data.result === 'error') {
              console.log('Subscription failed, trying alternative format...');
              
              // Try alternative subscription format
              const altSubscribeMessage = {
                method: 'subscribe',
                params: {
                  channel: 'ticker',
                  symbol: symbols.map(symbol => {
                    // Convert BTC to XBT/USD format for Kraken
                    if (symbol === 'BTC') {
                      return 'XBT/USD';
                    }
                    return `${symbol}/USD`;
                  })
                }
              };
              
              console.log('Sending alternative subscription:', JSON.stringify(altSubscribeMessage));
              socket.send(JSON.stringify(altSubscribeMessage));
            }
            return;
          }
          
          // Log before passing to onMessage handler
          console.log("Passing Kraken message to handler");
          onMessage(data);
          console.log("Kraken message handler completed");
        } catch (err) {
          console.error('Error parsing Kraken WebSocket message:', err);
          console.error('Raw message that caused error:', typeof event.data === 'string' ? event.data : 'Non-string data');
        }
      };

      socket.onerror = (event) => {
        console.error('Kraken WebSocket error:', event);
        setError(event);
        if (onError) {
          onError(event);
        }
      };

      socket.onclose = (event) => {
        console.log('Kraken WebSocket closed:', event);
        setIsConnected(false);
        
        if (onClose) {
          onClose(event);
        }
        
        // Attempt to reconnect with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current += 1;
            connect();
          }, delay);
        } else {
          console.error('Max reconnection attempts reached, trying alternative URL');
          tryAlternativeUrl();
        }
      };
    } catch (err) {
      console.error('Error creating WebSocket connection:', err);
      setError(err as any);
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  };

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [url, JSON.stringify(symbols)]);

  // Reconnect if symbols change
  useEffect(() => {
    if (isConnected && socketRef.current) {
      // Unsubscribe from current symbols
      const unsubscribeMessage = {
        method: 'unsubscribe',
        params: {
          channel: 'ticker',
          symbol: symbols.map(symbol => {
            // Convert BTC to XBT/USD format for Kraken
            if (symbol === 'BTC') {
              return 'XBT/USD';
            }
            return `${symbol}/USD`;
          })
        }
      };
      
      console.log('Sending unsubscribe message:', JSON.stringify(unsubscribeMessage));
      socketRef.current.send(JSON.stringify(unsubscribeMessage));
      
      // Subscribe to new symbols
      const subscribeMessage = {
        method: 'subscribe',
        params: {
          channel: 'ticker',
          symbol: symbols.map(symbol => {
            // Convert BTC to XBT/USD format for Kraken
            if (symbol === 'BTC') {
              return 'XBT/USD';
            }
            return `${symbol}/USD`;
          })
        }
      };
      
      console.log('Sending subscribe message for new symbols:', JSON.stringify(subscribeMessage));
      socketRef.current.send(JSON.stringify(subscribeMessage));
    }
  }, [JSON.stringify(symbols), isConnected]);

  return {
    isConnected,
    error,
    connect,
    disconnect
  };
};