import { useState, useEffect, useRef, useCallback } from 'react';
import { KrakenWebSocket, ConnectionStatus } from '@/lib/krakenWebSocketV2';
import { useWebSocketLogs } from '@/contexts/WebSocketLogContext';
import { parseKrakenMessage, formatToKrakenSymbol, KrakenPrice } from '@/lib/kraken';

interface UseKrakenWebSocketConnectionOptions {
  symbols: string[];
  onPriceUpdate?: (prices: KrakenPrice[]) => void;
  autoConnect?: boolean;
}

export function useKrakenWebSocketConnection({
  symbols,
  onPriceUpdate,
  autoConnect = false
}: UseKrakenWebSocketConnectionOptions) {
  const { addLog, logError } = useWebSocketLogs();
  const [status, setStatus] = useState<ConnectionStatus>({
    isConnected: false,
    error: null,
    lastPingTime: null,
    lastPongTime: null
  });
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const krakenSocketRef = useRef<KrakenWebSocket | null>(null);
  const formattedSymbols = symbols.map(formatToKrakenSymbol);

  // Handle WebSocket messages
  const handleMessage = useCallback((data: any) => {
    try {
      // Store the raw message for debugging
      setLastMessage(JSON.stringify(data));
      
      // Parse the message to extract price data
      const prices = parseKrakenMessage(JSON.stringify(data));
      
      if (prices.length > 0) {
        addLog('success', 'Successfully parsed price data', { 
          prices, 
          count: prices.length 
        });
        
        if (onPriceUpdate) {
          onPriceUpdate(prices);
        }
      }
    } catch (err) {
      logError('Error processing Kraken message', err, 'WS-ERROR-1002', {
        messagePreview: JSON.stringify(data).substring(0, 200),
        timestamp: Date.now()
      });
    }
  }, [onPriceUpdate, addLog, logError]);

  // Handle status changes
  const handleStatusChange = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
  }, []);

  // Initialize the WebSocket connection
  useEffect(() => {
    // Create a new KrakenWebSocket instance
    krakenSocketRef.current = new KrakenWebSocket({
      symbols: formattedSymbols,
      onMessage: handleMessage,
      onStatusChange: handleStatusChange,
      autoConnect,
      addLog
    });
    
    // Cleanup function
    return () => {
      if (krakenSocketRef.current) {
        krakenSocketRef.current.disconnect();
        krakenSocketRef.current = null;
      }
    };
  }, [formattedSymbols, handleMessage, handleStatusChange, autoConnect, addLog]);

  // Update symbols when they change
  useEffect(() => {
    if (krakenSocketRef.current) {
      krakenSocketRef.current.updateSymbols(formattedSymbols);
    }
  }, [formattedSymbols]);

  // Connect function
  const connect = useCallback(() => {
    if (krakenSocketRef.current) {
      krakenSocketRef.current.connect();
    }
  }, []);

  // Disconnect function
  const disconnect = useCallback(() => {
    if (krakenSocketRef.current) {
      krakenSocketRef.current.disconnect();
    }
  }, []);

  return {
    ...status,
    lastMessage,
    connect,
    disconnect
  };
}