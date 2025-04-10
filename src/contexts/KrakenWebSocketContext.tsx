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
  manuallyDisconnected: boolean;
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
  // Flag to track if the user manually disconnected
  const [manuallyDisconnected, setManuallyDisconnected] = useState<boolean>(false);

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
      // Reset the manually disconnected flag when user explicitly connects
      setManuallyDisconnected(false);
      addLog('info', 'Manual connect requested, resetting manuallyDisconnected flag', {
        manuallyDisconnected: false
      });
      krakenSocket.connect();
    }
  }, [krakenSocket, addLog]);

  // Disconnect function
  const disconnect = useCallback(() => {
    if (krakenSocket) {
      // Set the manually disconnected flag when user explicitly disconnects
      setManuallyDisconnected(true);
      addLog('info', 'Manual disconnect requested, setting manuallyDisconnected flag', {
        manuallyDisconnected: true
      });
      krakenSocket.disconnect();
    }
  }, [krakenSocket, addLog]);

  // Update symbols function
  const updateSymbols = useCallback((newSymbols: string[]) => {
    console.log('Checking for Kraken WebSocket symbol updates:', newSymbols);
    addLog('info', 'Checking for Kraken WebSocket symbol updates', { symbols: newSymbols });
    
    // Ensure we have valid symbols to work with
    if (!newSymbols || newSymbols.length === 0) {
      console.warn('No symbols provided for Kraken WebSocket update');
      addLog('warning', 'No symbols provided for Kraken WebSocket update', {});
      return;
    }
    
    // Check if symbols have actually changed before updating
    const currentSymbolsSet = new Set(symbols);
    const newSymbolsSet = new Set(newSymbols);
    
    // Quick check for different array lengths
    let symbolsChanged = currentSymbolsSet.size !== newSymbolsSet.size;
    
    // If sizes are the same, check if all symbols in the new set are already in the current set
    if (!symbolsChanged) {
      for (const symbol of newSymbolsSet) {
        if (!currentSymbolsSet.has(symbol)) {
          symbolsChanged = true;
          break;
        }
      }
    }
    
    if (!symbolsChanged) {
      console.log('Kraken WebSocket symbols unchanged, skipping update');
      addLog('info', 'Kraken WebSocket symbols unchanged, skipping update', {
        currentSymbols: Array.from(currentSymbolsSet),
        newSymbols: Array.from(newSymbolsSet)
      });
      return;
    }
    
    console.log('Kraken WebSocket symbols changed, updating');
    addLog('info', 'Kraken WebSocket symbols changed, updating', {
      currentSymbols: Array.from(currentSymbolsSet),
      newSymbols: Array.from(newSymbolsSet)
    });
    
    setSymbols(newSymbols);
    if (krakenSocket) {
      // Format symbols to Kraken format (e.g., BTC -> XBT/USD)
      const formattedSymbols = newSymbols.map(formatToKrakenSymbol);
      console.log('Formatted symbols for Kraken WebSocket:', formattedSymbols);
      addLog('info', 'Formatted symbols for Kraken WebSocket', { formattedSymbols });
      
      krakenSocket.updateSymbols(formattedSymbols);
    }
  }, [krakenSocket, addLog, symbols]);

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
      if (autoConnect && !status.isConnected && enableKrakenWebSocket && !manuallyDisconnected) {
        // Only connect if not already connected, enabled, and not manually disconnected
        console.log('Auto-connecting Kraken WebSocket');
        addLog('info', 'Auto-connecting Kraken WebSocket', {
          autoConnect,
          isConnected: status.isConnected,
          enableKrakenWebSocket,
          manuallyDisconnected
        });
        krakenSocket.connect();
      } else if (!enableKrakenWebSocket && status.isConnected) {
        // Disconnect if WebSocket is disabled but connected
        console.log('Disconnecting Kraken WebSocket because it is disabled');
        addLog('info', 'Disconnecting Kraken WebSocket because it is disabled', {});
        krakenSocket.disconnect();
      } else if (!status.isConnected && manuallyDisconnected) {
        // Log that we're not auto-connecting due to manual disconnect
        console.log('Not auto-connecting because WebSocket was manually disconnected');
        addLog('info', 'Not auto-connecting because WebSocket was manually disconnected', {
          autoConnect,
          isConnected: status.isConnected,
          enableKrakenWebSocket,
          manuallyDisconnected
        });
      }
    }
  }, [autoConnect, krakenSocket, status.isConnected, enableKrakenWebSocket, manuallyDisconnected, addLog]);

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
    setReconnectDelay: handleReconnectDelayChange,
    manuallyDisconnected
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