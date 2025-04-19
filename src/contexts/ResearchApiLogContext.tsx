import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export interface ResearchApiLog {
  id: string;
  timestamp: Date;
  url: string;
  method: string;
  requestBody?: any;
  response?: any;
  status?: number;
  error?: string;
  duration?: number;
}

interface ResearchApiLogContextType {
  logs: ResearchApiLog[];
  addLog: (log: Omit<ResearchApiLog, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  isLoggingEnabled: boolean;
  setLoggingEnabled: (enabled: boolean) => void;
}

const ResearchApiLogContext = createContext<ResearchApiLogContextType | undefined>(undefined);

export const useResearchApiLogs = () => {
  const context = useContext(ResearchApiLogContext);
  if (!context) {
    throw new Error('useResearchApiLogs must be used within a ResearchApiLogProvider');
  }
  return context;
};

interface ResearchApiLogProviderProps {
  children: ReactNode;
}

export const ResearchApiLogProvider: React.FC<ResearchApiLogProviderProps> = ({ children }) => {
  const [logs, setLogs] = useState<ResearchApiLog[]>([]);
  const [isLoggingEnabled, setIsLoggingEnabled] = useState<boolean>(false);

  // Load logging preferences from localStorage on mount
  useEffect(() => {
    const savedLoggingPreference = localStorage.getItem('research-api-logging-enabled');
    if (savedLoggingPreference !== null) {
      setIsLoggingEnabled(savedLoggingPreference === 'true');
    }
  }, []);

  // Save logging preferences to localStorage when they change
  useEffect(() => {
    localStorage.setItem('research-api-logging-enabled', isLoggingEnabled.toString());
  }, [isLoggingEnabled]);

  const addLog = useCallback((logData: Omit<ResearchApiLog, 'id' | 'timestamp'>) => {
    if (!isLoggingEnabled) return;
    
    const newLog: ResearchApiLog = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...logData
    };
    
    setLogs((prevLogs) => [newLog, ...prevLogs]);
    
    // Console logging
    console.log(`[Research API] ${logData.method} ${logData.url}`, {
      status: logData.status,
      duration: logData.duration ? `${logData.duration}ms` : undefined,
      error: logData.error
    });
  }, [isLoggingEnabled]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <ResearchApiLogContext.Provider value={{ 
      logs, 
      addLog, 
      clearLogs, 
      isLoggingEnabled, 
      setLoggingEnabled: setIsLoggingEnabled
    }}>
      {children}
    </ResearchApiLogContext.Provider>
  );
};