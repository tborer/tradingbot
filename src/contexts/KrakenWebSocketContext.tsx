import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { KrakenWebSocket, ConnectionStatus } from '@/lib/krakenWebSocketV2';
import { KrakenPrice, parseKrakenMessage, formatToKrakenSymbol } from '@/lib/kraken';
import { useWebSocketLogs } from './WebSocketLogContext';

interface KrakenWebSocketContextType {
  isConnected: boolean;
  error: Error | null;
  lastPingTime: Date | null;
  lastPongTime: Date | null;
  lastMessage: string | null;
  lastPrices: KrakenPrice[];
  lastUpdated: Date | null;
  connect: () => void;
  disconnect: () => void;
  updateSymbols: (symbols: string[]) => void;
  autoConnect: boolean;
  setAutoConnect: (autoConnect: boolean) => void;
  enableKrakenWebSocket: boolean;
  setEnableKrakenWebSocket: (enabled: boolean) => void;
  reconnectDelay: number;
  setReconnectDelay: (delay: number) => void;
}

const KrakenWebSocketContext = createContext<KrakenWebSocketContextType | null>(null);

interface KrakenWebSocketProviderProps {
  children: ReactNode;
  initialSymbols?: string[];
}

export const KrakenWebSocketProvider: React.FC<KrakenWebSocketProviderProps> = ({ 
  children, 
  initialSymbols = [] 
}) => {
  const { addLog } = useWebSocketLogs();
  const [status, setStatus] = useState<ConnectionStatus>({
    isConnected: false,
    error: null,
    lastPingTime: null,
    lastPongTime: null
  });
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [lastPrices, setLastPrices] = useState<KrakenPrice[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [symbols, setSymbols] = useState<string[]>(initialSymbols);
  const [krakenSocket, setKrakenSocket] = useState<KrakenWebSocket | null>(null);
  const [autoConnect, setAutoConnect] = useState<boolean>(false);
  // Check if Kraken WebSocket is enabled in settings
  const [enableKrakenWebSocket, setEnableKrakenWebSocket] = useState<boolean>(true);
  // Reconnection delay in milliseconds (default: 1000ms = 1 second)
  const [reconnectDelay, setReconnectDelay] = useState<number>(1000);

  // Load auto-connect setting from localStorage
  useEffect(() => {
    const savedAutoConnect = localStorage.getItem('kraken-websocket-auto-connect');
    if (savedAutoConnect !== null) {
      setAutoConnect(savedAutoConnect === 'true');
    }
  }, []);

  // Save auto-connect setting to localStorage when it changes
  const handleAutoConnectChange = useCallback((value: boolean) => {
    setAutoConnect(value);
    localStorage.setItem('kraken-websocket-auto-connect', value.toString());
  }, []);

  // Handle WebSocket messages
  const handleMessage = useCallback((data: any) => {
    try {
      // Store the raw message for debugging
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);
      setLastMessage(dataString);
      
      // Parse the message to extract price data
      const prices = parseKrakenMessage(dataString);
      
      if (prices.length > 0) {
        console.log('Successfully parsed Kraken prices:', prices);
        addLog('success', 'Successfully parsed Kraken prices', { prices });
        
        setLastPrices(prices);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Error processing Kraken message:', err);
      addLog('error', 'Error processing Kraken message', { 
        error: err instanceof Error ? err.message : String(err),
        dataPreview: typeof data === 'string' 
          ? data.substring(0, 200) 
          : JSON.stringify(data).substring(0, 200)
      });
    }
  }, [addLog]);

  // Handle status changes
  const handleStatusChange = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
  }, []);

  // Initialize the WebSocket connection
  useEffect(() => {
    // Only create a new socket if we don't have one or if critical parameters have changed
    if (!krakenSocket || krakenSocket.getStatus().error) {
      // Format symbols to Kraken format (e.g., BTC -> XBT/USD)
      const formattedSymbols = symbols.map(formatToKrakenSymbol);
      
      // Check if we have any symbols to subscribe to
      if (formattedSymbols.length === 0) {
        console.warn('No symbols provided for Kraken WebSocket. Adding default symbol XBT/USD');
        addLog('warning', 'No symbols provided for Kraken WebSocket. Adding default symbol XBT/USD', {});
        formattedSymbols.push('XBT/USD'); // Add a default symbol to ensure we have something to subscribe to
      }
      
      console.log('Initializing Kraken WebSocket with symbols:', formattedSymbols);
      addLog('info', 'Initializing Kraken WebSocket', { symbols: formattedSymbols });
      
      // Create a new KrakenWebSocket instance
      const socket = new KrakenWebSocket({
        symbols: formattedSymbols,
        onMessage: handleMessage,
        onStatusChange: handleStatusChange,
        autoConnect: false, // Don't auto-connect here, we'll handle it separately
        reconnectDelay,
        addLog
      });
      
      setKrakenSocket(socket);
    } else if (krakenSocket) {
      // Just update the symbols on the existing socket
      let formattedSymbols = symbols.map(formatToKrakenSymbol);
      
      // Check if we have any symbols to subscribe to
      if (formattedSymbols.length === 0) {
        console.warn('No symbols provided for Kraken WebSocket update. Adding default symbol XBT/USD');
        addLog('warning', 'No symbols provided for Kraken WebSocket update. Adding default symbol XBT/USD', {});
        formattedSymbols.push('XBT/USD'); // Add a default symbol to ensure we have something to subscribe to
      }
      
      krakenSocket.updateSymbols(formattedSymbols);
    }
    
    // Cleanup function
    return () => {
      if (krakenSocket) {
        krakenSocket.disconnect();
      }
    };
  }, [symbols, handleMessage, handleStatusChange, reconnectDelay, addLog]);

  // Connect function
  const connect = useCallback(() => {
    if (krakenSocket) {
      krakenSocket.connect();
    }
  }, [krakenSocket]);

  // Disconnect function
  const disconnect = useCallback(() => {
    if (krakenSocket) {
      krakenSocket.disconnect();
    }
  }, [krakenSocket]);

  // Update symbols function
  const updateSymbols = useCallback((newSymbols: string[]) => {
    setSymbols(newSymbols);
    if (krakenSocket) {
      // Format symbols to Kraken format (e.g., BTC -> XBT/USD)
      const formattedSymbols = newSymbols.map(formatToKrakenSymbol);
      krakenSocket.updateSymbols(formattedSymbols);
    }
  }, [krakenSocket]);

  // These state variables are already declared above, so we don't need to declare them again
  
  // Load enableKrakenWebSocket setting from localStorage
  useEffect(() => {
    const savedEnableKrakenWebSocket = localStorage.getItem('kraken-websocket-enabled');
    if (savedEnableKrakenWebSocket !== null) {
      setEnableKrakenWebSocket(savedEnableKrakenWebSocket === 'true');
    }
    
    // Load reconnectDelay from localStorage
    const savedReconnectDelay = localStorage.getItem('kraken-websocket-reconnect-delay');
    if (savedReconnectDelay !== null) {
      setReconnectDelay(parseInt(savedReconnectDelay, 10));
    }
  }, []);
  
  // Auto-connect when autoConnect is true and WebSocket is enabled
  useEffect(() => {
    if (krakenSocket) {
      if (autoConnect && !status.isConnected && enableKrakenWebSocket) {
        // Only connect if not already connected and enabled
        console.log('Auto-connecting Kraken WebSocket');
        krakenSocket.connect();
      } else if (!enableKrakenWebSocket && status.isConnected) {
        // Disconnect if WebSocket is disabled but connected
        console.log('Disconnecting Kraken WebSocket because it is disabled');
        krakenSocket.disconnect();
      }
    }
  }, [autoConnect, krakenSocket, status.isConnected, enableKrakenWebSocket]);

  // Save enableKrakenWebSocket setting to localStorage when it changes
  const handleEnableKrakenWebSocketChange = useCallback((value: boolean) => {
    setEnableKrakenWebSocket(value);
    localStorage.setItem('kraken-websocket-enabled', value.toString());
  }, []);
  
  // Save reconnectDelay setting to localStorage when it changes
  const handleReconnectDelayChange = useCallback((value: number) => {
    setReconnectDelay(value);
    localStorage.setItem('kraken-websocket-reconnect-delay', value.toString());
  }, []);

  const value = {
    isConnected: status.isConnected,
    error: status.error,
    lastPingTime: status.lastPingTime,
    lastPongTime: status.lastPongTime,
    lastMessage,
    lastPrices,
    lastUpdated,
    connect,
    disconnect,
    updateSymbols,
    autoConnect,
    setAutoConnect: handleAutoConnectChange,
    enableKrakenWebSocket,
    setEnableKrakenWebSocket: handleEnableKrakenWebSocketChange,
    reconnectDelay,
    setReconnectDelay: handleReconnectDelayChange
  };

  return (
    <KrakenWebSocketContext.Provider value={value}>
      {children}
    </KrakenWebSocketContext.Provider>
  );
};

export const useKrakenWebSocket = () => {
  const context = useContext(KrakenWebSocketContext);
  if (!context) {
    throw new Error('useKrakenWebSocket must be used within a KrakenWebSocketProvider');
  }
  return context;
};