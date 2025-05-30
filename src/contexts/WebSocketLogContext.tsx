import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
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
  isErrorLoggingEnabled: boolean;
  setErrorLoggingEnabled: (enabled: boolean) => void;
  errorSampleRate: number;
  setErrorSampleRate: (rate: number) => void;
  maxLogCount: number;
  setMaxLogCount: (count: number) => void;
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
  const [isLoggingEnabled, setIsLoggingEnabled] = useState<boolean>(false);
  const [isErrorLoggingEnabled, setIsErrorLoggingEnabled] = useState<boolean>(false);
  const [errorSampleRate, setErrorSampleRate] = useState<number>(100); // 100% by default
  const [maxLogCount, setMaxLogCount] = useState<number>(100); // Default to 100 logs
  const errorCountRef = useRef<number>(0);

  // Load logging preferences from localStorage on mount
  useEffect(() => {
    const savedLoggingPreference = localStorage.getItem('websocket-logging-enabled');
    if (savedLoggingPreference !== null) {
      setIsLoggingEnabled(savedLoggingPreference === 'true');
    }
    
    const savedErrorLoggingPreference = localStorage.getItem('websocket-error-logging-enabled');
    if (savedErrorLoggingPreference !== null) {
      setIsErrorLoggingEnabled(savedErrorLoggingPreference === 'true');
    }
    
    const savedErrorSampleRate = localStorage.getItem('websocket-error-sample-rate');
    if (savedErrorSampleRate !== null) {
      setErrorSampleRate(parseInt(savedErrorSampleRate, 10));
    }
    
    const savedMaxLogCount = localStorage.getItem('websocket-max-log-count');
    if (savedMaxLogCount !== null) {
      setMaxLogCount(parseInt(savedMaxLogCount, 10));
    }
  }, []);

  // Save logging preferences to localStorage when they change
  useEffect(() => {
    localStorage.setItem('websocket-logging-enabled', isLoggingEnabled.toString());
  }, [isLoggingEnabled]);
  
  useEffect(() => {
    localStorage.setItem('websocket-error-logging-enabled', isErrorLoggingEnabled.toString());
  }, [isErrorLoggingEnabled]);
  
  useEffect(() => {
    localStorage.setItem('websocket-error-sample-rate', errorSampleRate.toString());
  }, [errorSampleRate]);
  
  useEffect(() => {
    localStorage.setItem('websocket-max-log-count', maxLogCount.toString());
  }, [maxLogCount]);

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
  
  const setErrorLoggingEnabled = useCallback((enabled: boolean) => {
    setIsErrorLoggingEnabled(enabled);
    if (!enabled) {
      // Add a system log entry when error logging is disabled
      const disabledLog: WebSocketLog = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        level: 'info',
        message: 'WebSocket error logging has been disabled',
        code: 'WS-INFO-0003',
        details: { timestamp: Date.now() },
      };
      setLogs((prevLogs) => [disabledLog, ...prevLogs]);
    } else {
      // Add a system log entry when error logging is enabled
      const enabledLog: WebSocketLog = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        level: 'info',
        message: 'WebSocket error logging has been enabled',
        code: 'WS-INFO-0004',
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
    // For error logs, check if error logging is enabled and respect sample rate
    if (level === 'error') {
      // If error logging is disabled, don't log errors
      if (!isErrorLoggingEnabled) {
        return;
      }
      
      // Apply error sampling if sample rate is less than 100%
      if (errorSampleRate < 100) {
        errorCountRef.current += 1;
        // Only log errors based on the sample rate
        // For example, if rate is 10%, log every 10th error
        if (errorCountRef.current % Math.floor(100 / errorSampleRate) !== 0) {
          return;
        }
      }
    } 
    // For non-error logs, check if general logging is enabled
    else if (!isLoggingEnabled) {
      return;
    }
    
    // Add log to the UI logs collection
    const newLog: WebSocketLog = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level,
      message,
      code: errorCode,
      details,
    };
    
    setLogs((prevLogs) => {
      // Add the new log at the beginning
      const updatedLogs = [newLog, ...prevLogs];
      
      // If we exceed the maximum log count, trim the oldest logs
      if (updatedLogs.length > maxLogCount) {
        return updatedLogs.slice(0, maxLogCount);
      }
      
      return updatedLogs;
    });
    
    // Console logging
    if (level === 'error') {
      console.error(`[${errorCode || 'WebSocket error'}]`, message, details || '');
    } else {
      const consoleMethod = level === 'warning' ? console.warn : 
                          level === 'success' ? console.info : 
                          console.log;
    
      consoleMethod(`[${errorCode || `WebSocket ${level}`}]`, message, details || '');
    }
  }, [isLoggingEnabled, isErrorLoggingEnabled, errorSampleRate, maxLogCount]);

  // Enhanced error logging function that integrates with the errorLogger utility
  const logError = useCallback((
    message: string, 
    error: unknown, 
    code?: string, 
    context?: Record<string, any>
  ) => {
    // If error logging is disabled, don't log errors
    if (!isErrorLoggingEnabled) {
      return;
    }
    
    // Apply error sampling if sample rate is less than 100%
    if (errorSampleRate < 100) {
      errorCountRef.current += 1;
      // Only log errors based on the sample rate
      if (errorCountRef.current % Math.floor(100 / errorSampleRate) !== 0) {
        return;
      }
    }
    
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
    
    // Log using the error logger utility only if error logging is enabled
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
  }, [addLog, isErrorLoggingEnabled, errorSampleRate]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);
  
  const handleSetErrorSampleRate = useCallback((rate: number) => {
    // Ensure rate is between 1 and 100
    const validRate = Math.max(1, Math.min(100, rate));
    // Use the state setter function directly
    setErrorSampleRate(validRate);
    
    // Add a system log entry when error sample rate is changed
    const rateChangedLog: WebSocketLog = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level: 'info',
      message: `WebSocket error sampling rate set to ${validRate}%`,
      code: 'WS-INFO-0005',
      details: { timestamp: Date.now(), rate: validRate },
    };
    setLogs((prevLogs) => [rateChangedLog, ...prevLogs]);
  }, []);
  
  // Function to handle setting max log count with validation
  const handleSetMaxLogCount = useCallback((count: number) => {
    // Ensure count is at least 10
    const validCount = Math.max(10, count);
    setMaxLogCount(validCount);
    
    // Add a system log entry when max log count is changed
    const countChangedLog: WebSocketLog = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level: 'info',
      message: `WebSocket log retention limit set to ${validCount} logs`,
      code: 'WS-INFO-0006',
      details: { timestamp: Date.now(), count: validCount },
    };
    
    // When reducing the log count, we need to trim the logs immediately
    setLogs((prevLogs) => {
      const updatedLogs = [countChangedLog, ...prevLogs];
      if (updatedLogs.length > validCount) {
        return updatedLogs.slice(0, validCount);
      }
      return updatedLogs;
    });
  }, []);

  return (
    <WebSocketLogContext.Provider value={{ 
      logs, 
      addLog, 
      logError,
      clearLogs, 
      isLoggingEnabled, 
      setLoggingEnabled,
      isErrorLoggingEnabled,
      setErrorLoggingEnabled,
      errorSampleRate,
      setErrorSampleRate: handleSetErrorSampleRate,
      maxLogCount,
      setMaxLogCount: handleSetMaxLogCount
    }}>
      {children}
    </WebSocketLogContext.Provider>
  );
};