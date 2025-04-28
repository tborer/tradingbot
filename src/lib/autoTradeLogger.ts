import { ErrorCategory, ErrorSeverity } from '@/lib/errorLogger';

// Enhanced logger for auto trade operations that integrates with ErrorLogContext
class AutoTradeLogger {
  // Store the ErrorLogContext's captureLog and captureError functions
  private captureLogFn: ((message: string, severity: ErrorSeverity, category: ErrorCategory, context?: Record<string, any>) => void) | null = null;
  private captureErrorFn: ((error: Error | unknown, category?: ErrorCategory, context?: Record<string, any>) => void) | null = null;

  // Method to set the ErrorLogContext functions
  setErrorLogFunctions(
    captureLog: (message: string, severity: ErrorSeverity, category: ErrorCategory, context?: Record<string, any>) => void,
    captureError: (error: Error | unknown, category?: ErrorCategory, context?: Record<string, any>) => void
  ) {
    this.captureLogFn = captureLog;
    this.captureErrorFn = captureError;
  }

  log(message: string, data?: any) {
    try {
      // Always log to console
      if (data) {
        console.log(`[AutoTrade] ${message}`, data);
      } else {
        console.log(`[AutoTrade] ${message}`);
      }

      // Log to ErrorLogContext if available
      if (this.captureLogFn) {
        this.captureLogFn(
          message,
          ErrorSeverity.INFO,
          ErrorCategory.API,
          data
        );
      }
    } catch (error) {
      console.error('Error in AutoTradeLogger.log:', error);
    }
  }

  error(message: string, data?: any) {
    try {
      // Always log to console
      if (data) {
        console.error(`[AutoTrade ERROR] ${message}`, data);
      } else {
        console.error(`[AutoTrade ERROR] ${message}`);
      }

      // Log to ErrorLogContext if available
      if (this.captureLogFn) {
        this.captureLogFn(
          message,
          ErrorSeverity.ERROR,
          ErrorCategory.API,
          data
        );
      }

      // Also capture as an error if it has a stack trace
      if (this.captureErrorFn && data && data.stack) {
        const error = new Error(message);
        error.stack = data.stack;
        this.captureErrorFn(error, ErrorCategory.API, data);
      }
    } catch (error) {
      console.error('Error in AutoTradeLogger.error:', error);
    }
  }

  warning(message: string, data?: any) {
    try {
      // Log to console
      if (data) {
        console.warn(`[AutoTrade WARNING] ${message}`, data);
      } else {
        console.warn(`[AutoTrade WARNING] ${message}`);
      }

      // Log to ErrorLogContext if available
      if (this.captureLogFn) {
        this.captureLogFn(
          message,
          ErrorSeverity.WARNING,
          ErrorCategory.API,
          data
        );
      }
    } catch (error) {
      console.error('Error in AutoTradeLogger.warning:', error);
    }
  }

  critical(message: string, data?: any) {
    try {
      // Log to console
      if (data) {
        console.error(`[AutoTrade CRITICAL] ${message}`, data);
      } else {
        console.error(`[AutoTrade CRITICAL] ${message}`);
      }

      // Log to ErrorLogContext if available
      if (this.captureLogFn) {
        this.captureLogFn(
          message,
          ErrorSeverity.CRITICAL,
          ErrorCategory.API,
          data
        );
      }
    } catch (error) {
      console.error('Error in AutoTradeLogger.critical:', error);
    }
  }
}

// Export a singleton instance
export const autoTradeLogger = new AutoTradeLogger();