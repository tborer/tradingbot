import { PrismaClient } from '@prisma/client'
import { createAndLogError, ErrorCategory, ErrorSeverity } from '@/lib/errorLogger';
import * as connectionManager from '@/lib/connectionManager';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// Learn more: 
// https://pris.ly/d/help/next-js-best-practices

const prismaClientSingleton = () => {
  return new PrismaClient({
    // Configure connection pool settings
    log: ['error', 'warn'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Add connection timeout
    // @ts-ignore - These are valid Prisma connection options
    __internal: {
      engine: {
        connectionTimeout: 5000, // 5 seconds
        pollInterval: 100, // 100ms
      },
    },
  })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

// Track the last successful connection time
let lastSuccessfulConnectionTime: number | null = null;

// Add a connection health check method
export const checkPrismaConnection = async (): Promise<boolean> => {
  try {
    // Simple query to check if the connection is working
    await prisma.$queryRaw`SELECT 1`
    
    // Record successful connection
    lastSuccessfulConnectionTime = Date.now();
    connectionManager.recordSuccess();
    
    // Log successful connection check
    createAndLogError(
      ErrorCategory.DATABASE,
      ErrorSeverity.INFO,
      3050,
      'Database connection check successful',
      { 
        timestamp: Date.now(),
        lastSuccessfulConnectionTime,
        connectionStatus: connectionManager.getConnectionStatus()
      }
    );
    
    return true
  } catch (error) {
    // Enhanced error logging with more context
    const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorCode = error instanceof Error && 'code' in error ? (error as any).code : 'UNKNOWN';
    
    createAndLogError(
      ErrorCategory.DATABASE,
      ErrorSeverity.ERROR,
      3051,
      `Prisma connection check failed: ${errorMessage}`,
      { 
        timestamp: Date.now(),
        errorCode,
        lastSuccessfulConnectionTime,
        connectionStatus: connectionManager.getConnectionStatus(),
        databaseUrl: process.env.DATABASE_URL ? '(set)' : '(not set)',
        directUrl: process.env.DIRECT_URL ? '(set)' : '(not set)'
      },
      error instanceof Error ? error : new Error(errorMessage)
    );
    
    // Record the error for circuit breaker
    connectionManager.recordError({
      message: errorMessage,
      code: `CONNECTION_CHECK_FAILED_${errorCode}`
    });
    
    return false
  }
}

// Enhanced query wrapper with retry logic and fallback
export const executeWithFallback = async <T>(
  operation: () => Promise<T>,
  fallbackData: T | null = null,
  cacheKey?: string,
  maxRetries: number = 3
): Promise<T> => {
  // Check if circuit breaker is open
  if (connectionManager.isCircuitBreakerOpen()) {
    // If we have a cache key and cached data is available, use it
    if (cacheKey && connectionManager.shouldUseCachedResponse(cacheKey)) {
      const cachedData = connectionManager.getCachedResponse(cacheKey);
      if (cachedData) {
        createAndLogError(
          ErrorCategory.DATABASE,
          ErrorSeverity.INFO,
          3020,
          `Using cached data for ${cacheKey} due to circuit breaker being open`,
          { timestamp: Date.now() }
        );
        return cachedData;
      }
    }
    
    // If no cached data and fallback provided, use fallback
    if (fallbackData !== null) {
      return fallbackData;
    }
    
    // Otherwise throw an error
    throw new Error('Database service unavailable (circuit breaker open)');
  }
  
  // Check if we're in partial degradation mode and have cached data
  if (cacheKey && connectionManager.isInPartialDegradationMode() && connectionManager.shouldUseCachedResponse(cacheKey)) {
    const cachedData = connectionManager.getCachedResponse(cacheKey);
    if (cachedData) {
      createAndLogError(
        ErrorCategory.DATABASE,
        ErrorSeverity.INFO,
        3021,
        `Using cached data for ${cacheKey} due to partial degradation mode`,
        { timestamp: Date.now() }
      );
      return cachedData;
    }
  }
  
  // Try to execute the operation with retries
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      
      // On success, record it and cache the result if a cache key was provided
      connectionManager.recordSuccess();
      if (cacheKey) {
        connectionManager.cacheResponse(cacheKey, result);
      }
      
      // Log successful operation after retries if it wasn't the first attempt
      if (attempt > 1) {
        createAndLogError(
          ErrorCategory.DATABASE,
          ErrorSeverity.INFO,
          3060,
          `Database operation succeeded after ${attempt} attempts`,
          { 
            timestamp: Date.now(),
            attempt,
            maxRetries,
            cacheKey,
            connectionStatus: connectionManager.getConnectionStatus()
          }
        );
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Enhanced error logging with more context
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorCode = error instanceof Error && 'code' in error ? (error as any).code : 'UNKNOWN';
      
      createAndLogError(
        ErrorCategory.DATABASE,
        ErrorSeverity.ERROR,
        3061,
        `Database operation failed (attempt ${attempt}/${maxRetries}): ${errorMessage}`,
        { 
          timestamp: Date.now(),
          attempt,
          maxRetries,
          errorCode,
          cacheKey,
          connectionStatus: connectionManager.getConnectionStatus(),
          hasCircuitBreakerOpened: connectionManager.isCircuitBreakerOpen(),
          hasPartialDegradation: connectionManager.isInPartialDegradationMode(),
          stack: errorStack
        },
        error instanceof Error ? error : new Error(errorMessage)
      );
      
      // Record the error
      connectionManager.recordError({
        message: errorMessage,
        code: `QUERY_EXECUTION_FAILED_${errorCode}`
      });
      
      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const backoffDelay = connectionManager.getBackoffDelay();
        createAndLogError(
          ErrorCategory.DATABASE,
          ErrorSeverity.INFO,
          3062,
          `Retrying database operation after backoff delay`,
          { 
            timestamp: Date.now(),
            attempt,
            maxRetries,
            backoffDelay,
            cacheKey
          }
        );
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }
  
  // If we have a cache key and cached data is available, use it as a last resort
  if (cacheKey) {
    const cachedData = connectionManager.getCachedResponse(cacheKey);
    if (cachedData) {
      createAndLogError(
        ErrorCategory.DATABASE,
        ErrorSeverity.WARNING,
        3022,
        `Using cached data for ${cacheKey} after all retries failed`,
        { timestamp: Date.now(), error: lastError }
      );
      return cachedData;
    }
  }
  
  // If we have fallback data, use it
  if (fallbackData !== null) {
    return fallbackData;
  }
  
  // Otherwise throw the last error
  throw lastError;
};

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma