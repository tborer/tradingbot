/**
 * Error Logger Utility
 * 
 * This utility provides standardized error logging functionality for the application.
 * It includes error codes, detailed messages, and context information to make debugging easier.
 */

// Define error code categories
export enum ErrorCategory {
  WEBSOCKET = 'WS',
  API = 'API',
  DATABASE = 'DB',
  AUTH = 'AUTH',
  NETWORK = 'NET',
  VALIDATION = 'VAL',
  UNKNOWN = 'UNK'
}

// Define error severity levels
export enum ErrorSeverity {
  INFO = 'INFO',
  WARNING = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRIT'
}

// Interface for structured error information
export interface ErrorDetails {
  code: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: Date;
  context?: Record<string, any>;
  originalError?: Error;
  stack?: string;
}

/**
 * Creates a standardized error code
 * Format: CATEGORY-SEVERITY-NUMERIC_CODE
 * Example: WS-ERROR-1001
 */
export const createErrorCode = (
  category: ErrorCategory,
  severity: ErrorSeverity,
  code: number
): string => {
  return `${category}-${severity}-${code.toString().padStart(4, '0')}`;
};

/**
 * Log an error with standardized format
 */
export const logError = (details: ErrorDetails): void => {
  // Create a structured log object
  const logObject = {
    code: details.code,
    message: details.message,
    severity: details.severity,
    timestamp: details.timestamp.toISOString(),
    context: details.context || {},
    stack: details.stack || details.originalError?.stack
  };

  // Log to console with appropriate method based on severity
  switch (details.severity) {
    case ErrorSeverity.INFO:
      console.log(`[${details.code}] ${details.message}`, logObject);
      break;
    case ErrorSeverity.WARNING:
      console.warn(`[${details.code}] ${details.message}`, logObject);
      break;
    case ErrorSeverity.ERROR:
      console.error(`[${details.code}] ${details.message}`, logObject);
      break;
    case ErrorSeverity.CRITICAL:
      console.error(`[${details.code}] CRITICAL: ${details.message}`, logObject);
      break;
  }

  // Here you could add additional logging destinations
  // For example, sending to a monitoring service or storing in a database
};

/**
 * Create and log an error in one step
 */
export const createAndLogError = (
  category: ErrorCategory,
  severity: ErrorSeverity,
  codeNumber: number,
  message: string,
  context?: Record<string, any>,
  originalError?: Error
): ErrorDetails => {
  const errorDetails: ErrorDetails = {
    code: createErrorCode(category, severity, codeNumber),
    message,
    severity,
    timestamp: new Date(),
    context,
    originalError,
    stack: originalError?.stack || new Error().stack
  };

  logError(errorDetails);
  return errorDetails;
};

/**
 * Format an error for API responses
 * Returns a sanitized version of the error suitable for client consumption
 */
export const formatErrorForResponse = (errorDetails: ErrorDetails): Record<string, any> => {
  return {
    error: {
      code: errorDetails.code,
      message: errorDetails.message,
      timestamp: errorDetails.timestamp.toISOString()
    }
  };
};

/**
 * Handle API errors with proper logging and response formatting
 */
export const handleApiError = (
  error: unknown,
  category: ErrorCategory = ErrorCategory.API,
  defaultMessage: string = 'An unexpected error occurred'
): ErrorDetails => {
  let errorMessage = defaultMessage;
  let originalError: Error | undefined;
  
  if (error instanceof Error) {
    errorMessage = error.message;
    originalError = error;
  } else if (typeof error === 'string') {
    errorMessage = error;
  }
  
  return createAndLogError(
    category,
    ErrorSeverity.ERROR,
    1000, // Generic error code
    errorMessage,
    { timestamp: Date.now() },
    originalError
  );
};

/**
 * WebSocket specific error codes and handlers
 */
export const WebSocketErrorCodes = {
  CONNECTION_FAILED: createErrorCode(ErrorCategory.WEBSOCKET, ErrorSeverity.ERROR, 1001),
  MESSAGE_PARSE_ERROR: createErrorCode(ErrorCategory.WEBSOCKET, ErrorSeverity.ERROR, 1002),
  SUBSCRIPTION_FAILED: createErrorCode(ErrorCategory.WEBSOCKET, ErrorSeverity.ERROR, 1003),
  CONNECTION_CLOSED: createErrorCode(ErrorCategory.WEBSOCKET, ErrorSeverity.WARNING, 1004),
  PING_TIMEOUT: createErrorCode(ErrorCategory.WEBSOCKET, ErrorSeverity.WARNING, 1005),
  INVALID_MESSAGE_FORMAT: createErrorCode(ErrorCategory.WEBSOCKET, ErrorSeverity.ERROR, 1006)
};

/**
 * API specific error codes and handlers
 */
export const ApiErrorCodes = {
  UNAUTHORIZED: createErrorCode(ErrorCategory.API, ErrorSeverity.ERROR, 2001),
  VALIDATION_FAILED: createErrorCode(ErrorCategory.API, ErrorSeverity.ERROR, 2002),
  RESOURCE_NOT_FOUND: createErrorCode(ErrorCategory.API, ErrorSeverity.ERROR, 2003),
  DATABASE_ERROR: createErrorCode(ErrorCategory.API, ErrorSeverity.ERROR, 2004),
  RATE_LIMIT_EXCEEDED: createErrorCode(ErrorCategory.API, ErrorSeverity.WARNING, 2005),
  EXTERNAL_API_ERROR: createErrorCode(ErrorCategory.API, ErrorSeverity.ERROR, 2006)
};

/**
 * Database specific error codes
 */
export const DatabaseErrorCodes = {
  QUERY_FAILED: createErrorCode(ErrorCategory.DATABASE, ErrorSeverity.ERROR, 3001),
  CONNECTION_FAILED: createErrorCode(ErrorCategory.DATABASE, ErrorSeverity.CRITICAL, 3002),
  CONSTRAINT_VIOLATION: createErrorCode(ErrorCategory.DATABASE, ErrorSeverity.ERROR, 3003),
  TRANSACTION_FAILED: createErrorCode(ErrorCategory.DATABASE, ErrorSeverity.ERROR, 3004)
};

/**
 * Authentication specific error codes
 */
export const AuthErrorCodes = {
  LOGIN_FAILED: createErrorCode(ErrorCategory.AUTH, ErrorSeverity.WARNING, 4001),
  SESSION_EXPIRED: createErrorCode(ErrorCategory.AUTH, ErrorSeverity.INFO, 4002),
  INSUFFICIENT_PERMISSIONS: createErrorCode(ErrorCategory.AUTH, ErrorSeverity.ERROR, 4003),
  INVALID_TOKEN: createErrorCode(ErrorCategory.AUTH, ErrorSeverity.ERROR, 4004)
};