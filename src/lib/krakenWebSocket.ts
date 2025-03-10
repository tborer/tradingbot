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

  const connect = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('Kraken WebSocket connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        
        // Subscribe to ticker data for each symbol
        const subscribeMessage = {
          method: 'subscribe',
          params: {
            channel: 'ticker',
            symbol: symbols
          }
        };
        
        socket.send(JSON.stringify(subscribeMessage));
        
        if (onOpen) {
          onOpen();
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
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
          console.error('Max reconnection attempts reached');
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
          symbol: symbols
        }
      };
      
      socketRef.current.send(JSON.stringify(unsubscribeMessage));
      
      // Subscribe to new symbols
      const subscribeMessage = {
        method: 'subscribe',
        params: {
          channel: 'ticker',
          symbol: symbols
        }
      };
      
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