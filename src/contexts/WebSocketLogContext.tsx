import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { 
  ErrorCategory, 
  ErrorSeverity, 
  createAndLogError, 
  WebSocketErrorCodes 
} from '@/lib/errorLogger';

export type LogLevel = 'info' | 'warning' | 'error' | 'success';

export interface WebSocketLog {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  code?: string;
  details?: Record<string, any>;
}

interface WebSocketLogContextType {
  logs: WebSocketLog[];
  addLog: (level: LogLevel, message: string, details?: Record<string, any>, errorCode?: string) => void;
  logError: (message: string, error: unknown, code?: string, context?: Record<string, any>) => void;
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
      // Add a system log entry when logging is disabled
      const disabledLog: WebSocketLog = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        level: 'info',
        message: 'WebSocket logging has been disabled',
        code: 'WS-INFO-0001',
        details: { timestamp: Date.now() },
      };
      setLogs((prevLogs) => [disabledLog, ...prevLogs]);
    } else {
      // Add a system log entry when logging is enabled
      const enabledLog: WebSocketLog = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        level: 'info',
        message: 'WebSocket logging has been enabled',
        code: 'WS-INFO-0002',
        details: { timestamp: Date.now() },
      };
      setLogs((prevLogs) => [enabledLog, ...prevLogs]);
    }
  }, []);

  const addLog = useCallback((
    level: LogLevel, 
    message: string, 
    details?: Record<string, any>, 
    errorCode?: string
  ) => {
    // Only add logs if logging is enabled
    if (isLoggingEnabled) {
      const newLog: WebSocketLog = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        level,
        message,
        code: errorCode,
        details,
      };
      
      setLogs((prevLogs) => [newLog, ...prevLogs]);
    }
    
    // Always log errors to console regardless of logging state
    if (level === 'error') {
      console.error(`[${errorCode || 'WebSocket error'}]`, message, details || '');
    } else if (isLoggingEnabled) {
      // Only log non-errors to console if logging is enabled
      const consoleMethod = level === 'warning' ? console.warn : 
                            level === 'success' ? console.info : 
                            console.log;
      
      consoleMethod(`[${errorCode || `WebSocket ${level}`}]`, message, details || '');
    }
  }, [isLoggingEnabled]);

  // Enhanced error logging function that integrates with the errorLogger utility
  const logError = useCallback((
    message: string, 
    error: unknown, 
    code?: string, 
    context?: Record<string, any>
  ) => {
    // Extract error details
    let errorMessage = message;
    let errorDetails = context || {};
    let errorStack: string | undefined;
    
    if (error instanceof Error) {
      errorMessage = `${message}: ${error.message}`;
      errorStack = error.stack;
      errorDetails = { ...errorDetails, originalError: error.message };
    } else if (typeof error === 'string') {
      errorMessage = `${message}: ${error}`;
      errorDetails = { ...errorDetails, originalError: error };
    }
    
    // Use the error code if provided, otherwise use a generic WebSocket error code
    const errorCode = code || WebSocketErrorCodes.INVALID_MESSAGE_FORMAT;
    
    // Log using the error logger utility
    createAndLogError(
      ErrorCategory.WEBSOCKET,
      ErrorSeverity.ERROR,
      parseInt(errorCode.split('-')[2], 10) || 9999,
      errorMessage,
      errorDetails,
      error instanceof Error ? error : new Error(errorMessage)
    );
    
    // Add to the WebSocket logs UI
    addLog('error', errorMessage, { ...errorDetails, stack: errorStack }, errorCode);
  }, [addLog]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <WebSocketLogContext.Provider value={{ 
      logs, 
      addLog, 
      logError,
      clearLogs, 
      isLoggingEnabled, 
      setLoggingEnabled 
    }}>
      {children}
    </WebSocketLogContext.Provider>
  );
};