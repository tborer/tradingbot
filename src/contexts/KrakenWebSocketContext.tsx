import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { KrakenWebSocket, ConnectionStatus } from '@/lib/krakenWebSocketV2';
import { KrakenPrice } from '@/lib/kraken';
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
      setLastMessage(JSON.stringify(data));
      
      // Check if data contains price information
      if (data && Array.isArray(data.prices) && data.prices.length > 0) {
        setLastPrices(data.prices);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Error processing Kraken message:', err);
    }
  }, []);

  // Handle status changes
  const handleStatusChange = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
  }, []);

  // Initialize the WebSocket connection
  useEffect(() => {
    // Create a new KrakenWebSocket instance
    const socket = new KrakenWebSocket({
      symbols,
      onMessage: handleMessage,
      onStatusChange: handleStatusChange,
      autoConnect,
      reconnectDelay,
      addLog
    });
    
    setKrakenSocket(socket);
    
    // Cleanup function
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [symbols, handleMessage, handleStatusChange, autoConnect, reconnectDelay, addLog]);

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
      krakenSocket.updateSymbols(newSymbols);
    }
  }, [krakenSocket]);

  // Check if Kraken WebSocket is enabled in settings
  const [enableKrakenWebSocket, setEnableKrakenWebSocket] = useState<boolean>(true);
  
  // Reconnection delay in milliseconds (default: 1000ms = 1 second)
  const [reconnectDelay, setReconnectDelay] = useState<number>(1000);
  
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
    if (autoConnect && krakenSocket && !status.isConnected && enableKrakenWebSocket) {
      krakenSocket.connect();
    } else if (!enableKrakenWebSocket && krakenSocket && status.isConnected) {
      // Disconnect if WebSocket is disabled but connected
      krakenSocket.disconnect();
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