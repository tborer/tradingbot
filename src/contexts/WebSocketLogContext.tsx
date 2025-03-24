import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

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
  isLoggingEnabled: boolean;
  setLoggingEnabled: (enabled: boolean) => void;
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
  const [isLoggingEnabled, setIsLoggingEnabled] = useState<boolean>(true);

  // Load logging preference from localStorage on mount
  useEffect(() => {
    const savedPreference = localStorage.getItem('websocket-logging-enabled');
    if (savedPreference !== null) {
      setIsLoggingEnabled(savedPreference === 'true');
    }
  }, []);

  // Save logging preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('websocket-logging-enabled', isLoggingEnabled.toString());
  }, [isLoggingEnabled]);

  const setLoggingEnabled = useCallback((enabled: boolean) => {
    setIsLoggingEnabled(enabled);
    if (!enabled) {
      // Optional: Add a system log entry when logging is disabled
      const disabledLog: WebSocketLog = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        level: 'info',
        message: 'WebSocket logging has been disabled',
        details: { timestamp: Date.now() },
      };
      setLogs((prevLogs) => [disabledLog, ...prevLogs]);
    } else {
      // Optional: Add a system log entry when logging is enabled
      const enabledLog: WebSocketLog = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        level: 'info',
        message: 'WebSocket logging has been enabled',
        details: { timestamp: Date.now() },
      };
      setLogs((prevLogs) => [enabledLog, ...prevLogs]);
    }
  }, []);

  const addLog = useCallback((level: LogLevel, message: string, details?: Record<string, any>) => {
    // Only add logs if logging is enabled
    if (isLoggingEnabled) {
      const newLog: WebSocketLog = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        level,
        message,
        details,
      };
      
      setLogs((prevLogs) => [newLog, ...prevLogs]);
    }
    
    // Always log errors to console regardless of logging state
    if (level === 'error') {
      console.error(`[WebSocket ${level}]`, message, details || '');
    } else if (isLoggingEnabled) {
      // Only log non-errors to console if logging is enabled
      const consoleMethod = level === 'warning' ? console.warn : 
                            level === 'success' ? console.info : 
                            console.log;
      
      consoleMethod(`[WebSocket ${level}]`, message, details || '');
    }
  }, [isLoggingEnabled]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <WebSocketLogContext.Provider value={{ 
      logs, 
      addLog, 
      clearLogs, 
      isLoggingEnabled, 
      setLoggingEnabled 
    }}>
      {children}
    </WebSocketLogContext.Provider>
  );
};