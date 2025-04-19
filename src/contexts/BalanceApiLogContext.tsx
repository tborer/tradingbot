import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export interface BalanceApiLog {
  id: string;
  timestamp: Date;
  requestMethod: string;
  requestPath: string;
  requestHeaders: any;
  requestBody: any;
  responseStatus: number;
  responseBody: any;
  error: string | null;
}

interface BalanceApiLogContextType {
  logs: BalanceApiLog[];
  addLog: (log: Omit<BalanceApiLog, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  isLoggingEnabled: boolean;
  setLoggingEnabled: (enabled: boolean) => void;
}

const BalanceApiLogContext = createContext<BalanceApiLogContextType | undefined>(undefined);

export const useBalanceApiLogs = () => {
  const context = useContext(BalanceApiLogContext);
  if (!context) {
    throw new Error('useBalanceApiLogs must be used within a BalanceApiLogProvider');
  }
  return context;
};

interface BalanceApiLogProviderProps {
  children: ReactNode;
}

export const BalanceApiLogProvider: React.FC<BalanceApiLogProviderProps> = ({ children }) => {
  const [logs, setLogs] = useState<BalanceApiLog[]>([]);
  const [isLoggingEnabled, setIsLoggingEnabled] = useState<boolean>(false);

  // Load logging preferences from localStorage on mount
  useEffect(() => {
    const savedLoggingPreference = localStorage.getItem('balance-api-logging-enabled');
    if (savedLoggingPreference !== null) {
      setIsLoggingEnabled(savedLoggingPreference === 'true');
    }
  }, []);

  // Save logging preferences to localStorage when they change
  useEffect(() => {
    localStorage.setItem('balance-api-logging-enabled', isLoggingEnabled.toString());
  }, [isLoggingEnabled]);

  const addLog = useCallback((logData: Omit<BalanceApiLog, 'id' | 'timestamp'>) => {
    if (!isLoggingEnabled) return;
    
    const newLog: BalanceApiLog = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...logData
    };
    
    setLogs((prevLogs) => [newLog, ...prevLogs]);
    
    // Console logging
    console.log(`[Balance API] ${logData.requestMethod} ${logData.requestPath}`, {
      status: logData.responseStatus,
      error: logData.error
    });
  }, [isLoggingEnabled]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <BalanceApiLogContext.Provider value={{ 
      logs, 
      addLog, 
      clearLogs, 
      isLoggingEnabled, 
      setLoggingEnabled: setIsLoggingEnabled
    }}>
      {children}
    </BalanceApiLogContext.Provider>
  );
};