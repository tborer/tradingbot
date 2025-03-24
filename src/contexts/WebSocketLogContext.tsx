import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type LogLevel = 'info' | 'warning' | 'error' | 'success';

export interface WebSocketLog {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  details?: Record<string, any>;
}

interface WebSocketLogContextType {
  logs: WebSocketLog[];
  addLog: (level: LogLevel, message: string, details?: Record<string, any>) => void;
  clearLogs: () => void;
}

const WebSocketLogContext = createContext<WebSocketLogContextType | undefined>(undefined);

export const useWebSocketLogs = () => {
  const context = useContext(WebSocketLogContext);
  if (!context) {
    throw new Error('useWebSocketLogs must be used within a WebSocketLogProvider');
  }
  return context;
};

interface WebSocketLogProviderProps {
  children: ReactNode;
}

export const WebSocketLogProvider: React.FC<WebSocketLogProviderProps> = ({ children }) => {
  const [logs, setLogs] = useState<WebSocketLog[]>([]);

  const addLog = useCallback((level: LogLevel, message: string, details?: Record<string, any>) => {
    const newLog: WebSocketLog = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level,
      message,
      details,
    };
    
    setLogs((prevLogs) => [newLog, ...prevLogs]);
    
    // Also log to console for debugging
    const consoleMethod = level === 'error' ? console.error : 
                          level === 'warning' ? console.warn : 
                          level === 'success' ? console.info : 
                          console.log;
    
    consoleMethod(`[WebSocket ${level}]`, message, details || '');
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <WebSocketLogContext.Provider value={{ logs, addLog, clearLogs }}>
      {children}
    </WebSocketLogContext.Provider>
  );
};