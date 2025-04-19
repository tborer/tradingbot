import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ErrorDetails, ErrorSeverity, ErrorCategory } from '@/lib/errorLogger';

// Define the structure for our error log entry
export interface ErrorLogEntry extends ErrorDetails {
  id: string;
  read: boolean;
  archived: boolean;
}

// Define the filter options for the error logs
export interface ErrorLogFilters {
  severity: ErrorSeverity[];
  category: ErrorCategory[];
  timeRange: 'all' | 'today' | 'week' | 'month';
  showRead: boolean;
  showArchived: boolean;
  searchTerm: string;
}

// Define the context interface
interface ErrorLogContextType {
  logs: ErrorLogEntry[];
  filters: ErrorLogFilters;
  isEnabled: boolean;
  setFilters: (filters: Partial<ErrorLogFilters>) => void;
  clearLogs: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  archiveLog: (id: string) => void;
  deleteLog: (id: string) => void;
  captureError: (error: Error | unknown, category?: ErrorCategory, context?: Record<string, any>) => void;
  captureLog: (message: string, severity: ErrorSeverity, category: ErrorCategory, context?: Record<string, any>) => void;
  setIsEnabled: (enabled: boolean) => void;
  filteredLogs: ErrorLogEntry[];
}

// Create the context with default values
const ErrorLogContext = createContext<ErrorLogContextType>({
  logs: [],
  filters: {
    severity: Object.values(ErrorSeverity),
    category: Object.values(ErrorCategory),
    timeRange: 'all',
    showRead: true,
    showArchived: false,
    searchTerm: '',
  },
  isEnabled: true,
  setFilters: () => {},
  clearLogs: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  archiveLog: () => {},
  deleteLog: () => {},
  captureError: () => {},
  captureLog: () => {},
  setIsEnabled: () => {},
  filteredLogs: [],
});

// Maximum number of logs to keep in memory
const MAX_LOGS = 1000;

// Storage key for persisting logs
const STORAGE_KEY = 'error-logs';
const FILTERS_STORAGE_KEY = 'error-log-filters';
const ENABLED_STORAGE_KEY = 'error-log-enabled';

export const ErrorLogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize state from localStorage if available
  const [logs, setLogs] = useState<ErrorLogEntry[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedLogs = localStorage.getItem(STORAGE_KEY);
        return savedLogs ? JSON.parse(savedLogs) : [];
      } catch (e) {
        console.error('Failed to parse logs from localStorage', e);
        return [];
      }
    }
    return [];
  });

  const [filters, setFiltersState] = useState<ErrorLogFilters>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedFilters = localStorage.getItem(FILTERS_STORAGE_KEY);
        return savedFilters ? JSON.parse(savedFilters) : {
          severity: Object.values(ErrorSeverity),
          category: Object.values(ErrorCategory),
          timeRange: 'all',
          showRead: true,
          showArchived: false,
          searchTerm: '',
        };
      } catch (e) {
        console.error('Failed to parse filters from localStorage', e);
        return {
          severity: Object.values(ErrorSeverity),
          category: Object.values(ErrorCategory),
          timeRange: 'all',
          showRead: true,
          showArchived: false,
          searchTerm: '',
        };
      }
    }
    return {
      severity: Object.values(ErrorSeverity),
      category: Object.values(ErrorCategory),
      timeRange: 'all',
      showRead: true,
      showArchived: false,
      searchTerm: '',
    };
  });

  const [isEnabled, setIsEnabledState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedEnabled = localStorage.getItem(ENABLED_STORAGE_KEY);
        return savedEnabled ? JSON.parse(savedEnabled) : false;
      } catch (e) {
        console.error('Failed to parse enabled state from localStorage', e);
        return false;
      }
    }
    return false;
  });

  // Save logs to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    }
  }, [logs]);

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    }
  }, [filters]);

  // Save enabled state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(ENABLED_STORAGE_KEY, JSON.stringify(isEnabled));
    }
  }, [isEnabled]);

  // Set up global error handler
  useEffect(() => {
    if (!isEnabled) return;

    const handleGlobalError = (event: ErrorEvent) => {
      captureError(event.error || new Error(event.message), ErrorCategory.UNKNOWN, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
      
      // Don't prevent default error handling
      return false;
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      captureError(event.reason, ErrorCategory.UNKNOWN, {
        type: 'unhandled-rejection',
      });
      
      // Don't prevent default error handling
      return false;
    };

    // Add event listeners
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Clean up
    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [isEnabled]);

  // Update filters
  const setFilters = useCallback((newFilters: Partial<ErrorLogFilters>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Clear all logs
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Mark a log as read
  const markAsRead = useCallback((id: string) => {
    setLogs(prevLogs => 
      prevLogs.map(log => 
        log.id === id ? { ...log, read: true } : log
      )
    );
  }, []);

  // Mark all logs as read
  const markAllAsRead = useCallback(() => {
    setLogs(prevLogs => 
      prevLogs.map(log => ({ ...log, read: true }))
    );
  }, []);

  // Archive a log
  const archiveLog = useCallback((id: string) => {
    setLogs(prevLogs => 
      prevLogs.map(log => 
        log.id === id ? { ...log, archived: true } : log
      )
    );
  }, []);

  // Delete a log
  const deleteLog = useCallback((id: string) => {
    setLogs(prevLogs => prevLogs.filter(log => log.id !== id));
  }, []);

  // Set enabled state
  const setIsEnabled = useCallback((enabled: boolean) => {
    setIsEnabledState(enabled);
  }, []);

  // Capture an error and add it to the logs
  const captureError = useCallback((
    error: Error | unknown, 
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    context?: Record<string, any>
  ) => {
    if (!isEnabled) return;

    let errorMessage = 'Unknown error';
    let errorStack: string | undefined;

    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      try {
        errorMessage = JSON.stringify(error);
      } catch (e) {
        errorMessage = 'Unserializable error object';
      }
    }

    const newLog: ErrorLogEntry = {
      id: Date.now().toString(),
      code: `${category}-ERROR-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      message: errorMessage,
      severity: ErrorSeverity.ERROR,
      timestamp: new Date(),
      context: context || {},
      stack: errorStack,
      read: false,
      archived: false,
    };

    setLogs(prevLogs => {
      // Add new log at the beginning and limit the total number
      const updatedLogs = [newLog, ...prevLogs].slice(0, MAX_LOGS);
      return updatedLogs;
    });

    // Also log to console for debugging
    console.error(`[${newLog.code}] ${errorMessage}`, context, errorStack);
  }, [isEnabled]);

  // Capture a log message with custom severity
  const captureLog = useCallback((
    message: string,
    severity: ErrorSeverity,
    category: ErrorCategory,
    context?: Record<string, any>
  ) => {
    if (!isEnabled) return;

    const newLog: ErrorLogEntry = {
      id: Date.now().toString(),
      code: `${category}-${severity}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      message,
      severity,
      timestamp: new Date(),
      context: context || {},
      stack: new Error().stack,
      read: false,
      archived: false,
    };

    setLogs(prevLogs => {
      // Add new log at the beginning and limit the total number
      const updatedLogs = [newLog, ...prevLogs].slice(0, MAX_LOGS);
      return updatedLogs;
    });

    // Also log to console based on severity
    switch (severity) {
      case ErrorSeverity.INFO:
        console.log(`[${newLog.code}] ${message}`, context);
        break;
      case ErrorSeverity.WARNING:
        console.warn(`[${newLog.code}] ${message}`, context);
        break;
      case ErrorSeverity.ERROR:
      case ErrorSeverity.CRITICAL:
        console.error(`[${newLog.code}] ${message}`, context);
        break;
    }
  }, [isEnabled]);

  // Apply filters to get filtered logs
  const filteredLogs = React.useMemo(() => {
    return logs.filter(log => {
      // Filter by severity
      if (!filters.severity.includes(log.severity)) {
        return false;
      }

      // Filter by category
      const logCategory = log.code.split('-')[0] as ErrorCategory;
      if (!filters.category.includes(logCategory)) {
        return false;
      }

      // Filter by read status
      if (!filters.showRead && log.read) {
        return false;
      }

      // Filter by archived status
      if (!filters.showArchived && log.archived) {
        return false;
      }

      // Filter by time range
      if (filters.timeRange !== 'all') {
        const logDate = new Date(log.timestamp);
        const now = new Date();
        
        switch (filters.timeRange) {
          case 'today':
            if (logDate.getDate() !== now.getDate() || 
                logDate.getMonth() !== now.getMonth() || 
                logDate.getFullYear() !== now.getFullYear()) {
              return false;
            }
            break;
          case 'week':
            const weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 7);
            if (logDate < weekAgo) {
              return false;
            }
            break;
          case 'month':
            const monthAgo = new Date();
            monthAgo.setMonth(now.getMonth() - 1);
            if (logDate < monthAgo) {
              return false;
            }
            break;
        }
      }

      // Filter by search term
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        return (
          log.message.toLowerCase().includes(searchLower) ||
          log.code.toLowerCase().includes(searchLower) ||
          (log.stack && log.stack.toLowerCase().includes(searchLower))
        );
      }

      return true;
    });
  }, [logs, filters]);

  const contextValue = {
    logs,
    filters,
    isEnabled,
    setFilters,
    clearLogs,
    markAsRead,
    markAllAsRead,
    archiveLog,
    deleteLog,
    captureError,
    captureLog,
    setIsEnabled,
    filteredLogs,
  };

  return (
    <ErrorLogContext.Provider value={contextValue}>
      {children}
    </ErrorLogContext.Provider>
  );
};

export const useErrorLog = () => useContext(ErrorLogContext);

// Error boundary component to catch errors in components
export class ErrorBoundary extends React.Component<
  { children: ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  static contextType = ErrorLogContext;
  context!: React.ContextType<typeof ErrorLogContext>;

  constructor(props: { children: ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error to our error logging system
    if (this.context) {
      this.context.captureError(error, ErrorCategory.UNKNOWN, {
        componentStack: errorInfo.componentStack,
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 border border-red-500 rounded bg-red-50 dark:bg-red-900/20">
          <h2 className="text-lg font-bold text-red-700 dark:text-red-300">Something went wrong</h2>
          <p className="text-red-600 dark:text-red-400 mt-2">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            className="mt-2 px-3 py-1 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-700"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}