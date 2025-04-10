/**
 * Connection Manager for handling database connections and rate limiting
 */
import { createAndLogError, ErrorCategory, ErrorSeverity, DatabaseErrorCodes } from '@/lib/errorLogger';

// Track the last time we had a database error
let lastDbErrorTime: number | null = null;
// Track consecutive errors
let consecutiveErrors = 0;
// Maximum number of consecutive errors before circuit breaking
const MAX_CONSECUTIVE_ERRORS = 5;
// Time window to track errors (in milliseconds)
const ERROR_WINDOW_MS = 60000; // 1 minute
// Circuit breaker timeout (in milliseconds)
const CIRCUIT_BREAKER_TIMEOUT_MS = 30000; // 30 seconds
// Track if circuit breaker is open
let circuitBreakerOpen = false;
// When the circuit breaker was opened
let circuitBreakerOpenedAt: number | null = null;
// Track partial degradation mode
let partialDegradationMode = false;
// When partial degradation mode was activated
let partialDegradationActivatedAt: number | null = null;
// Partial degradation timeout (in milliseconds)
const PARTIAL_DEGRADATION_TIMEOUT_MS = 120000; // 2 minutes

// Rate limiting
const REQUEST_LIMIT = 10; // Maximum requests per time window
const TIME_WINDOW_MS = 1000; // Time window in milliseconds (1 second)
const requestTimestamps: number[] = [];

// Cache for recent successful responses
interface CachedResponse {
  data: any;
  timestamp: number;
  key: string;
}
const responseCache: Map<string, CachedResponse> = new Map();
const CACHE_TTL_MS = 300000; // 5 minutes cache TTL

/**
 * Check if we should allow a new database request based on rate limiting
 * @returns boolean indicating if the request should be allowed
 */
export function shouldAllowRequest(): boolean {
  const now = Date.now();
  
  // If circuit breaker is open, check if it's time to try again
  if (circuitBreakerOpen) {
    if (circuitBreakerOpenedAt && now - circuitBreakerOpenedAt >= CIRCUIT_BREAKER_TIMEOUT_MS) {
      // Reset circuit breaker
      circuitBreakerOpen = false;
      circuitBreakerOpenedAt = null;
      consecutiveErrors = 0;
      console.log('Circuit breaker reset, allowing database requests again');
      return true;
    }
    return false;
  }
  
  // Remove timestamps outside the current time window
  while (
    requestTimestamps.length > 0 && 
    requestTimestamps[0] < now - TIME_WINDOW_MS
  ) {
    requestTimestamps.shift();
  }
  
  // Check if we're under the rate limit
  return requestTimestamps.length < REQUEST_LIMIT;
}

/**
 * Record a successful database request
 */
export function recordRequest(): void {
  requestTimestamps.push(Date.now());
}

/**
 * Record a database error and check if circuit breaker should be opened
 * @param errorDetails Optional error details for logging
 * @returns boolean indicating if circuit breaker is now open
 */
export function recordError(errorDetails?: { message: string; code?: string }): boolean {
  const now = Date.now();
  
  // If this is the first error or it's been a while since the last error
  if (!lastDbErrorTime || now - lastDbErrorTime > ERROR_WINDOW_MS) {
    consecutiveErrors = 1;
  } else {
    consecutiveErrors++;
  }
  
  lastDbErrorTime = now;
  
  // Log the error with details
  createAndLogError(
    ErrorCategory.DATABASE,
    consecutiveErrors >= 3 ? ErrorSeverity.ERROR : ErrorSeverity.WARNING,
    3010,
    `Database error occurred (${consecutiveErrors} consecutive errors)`,
    { 
      timestamp: now, 
      consecutiveErrors,
      errorMessage: errorDetails?.message,
      errorCode: errorDetails?.code
    }
  );
  
  // Enter partial degradation mode after 3 consecutive errors
  if (consecutiveErrors >= 3 && !partialDegradationMode) {
    enterPartialDegradationMode();
  }
  
  // Check if we should open the circuit breaker
  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    circuitBreakerOpen = true;
    circuitBreakerOpenedAt = now;
    console.error(`Circuit breaker opened after ${consecutiveErrors} consecutive errors`);
    return true;
  }
  
  return false;
}

/**
 * Record a successful database operation
 */
export function recordSuccess(): void {
  // Reset consecutive errors counter on success
  consecutiveErrors = 0;
}

/**
 * Get the exponential backoff delay based on consecutive errors
 * @returns delay in milliseconds
 */
export function getBackoffDelay(): number {
  // Start with 1 second, double for each consecutive error, max 30 seconds
  return Math.min(1000 * Math.pow(2, consecutiveErrors - 1), 30000);
}

/**
 * Check if the circuit breaker is currently open
 * @returns boolean indicating if circuit breaker is open
 */
export function isCircuitBreakerOpen(): boolean {
  return circuitBreakerOpen;
}

/**
 * Get the current status of the connection manager
 * @returns object with status information
 */
export function getConnectionStatus(): {
  circuitBreakerOpen: boolean;
  consecutiveErrors: number;
  requestsInWindow: number;
  circuitBreakerRemainingMs: number | null;
  partialDegradationMode: boolean;
  partialDegradationRemainingMs: number | null;
  cacheSize: number;
} {
  const now = Date.now();
  
  // Clean up old request timestamps
  while (
    requestTimestamps.length > 0 && 
    requestTimestamps[0] < now - TIME_WINDOW_MS
  ) {
    requestTimestamps.shift();
  }
  
  return {
    circuitBreakerOpen,
    consecutiveErrors,
    requestsInWindow: requestTimestamps.length,
    circuitBreakerRemainingMs: circuitBreakerOpenedAt 
      ? Math.max(0, CIRCUIT_BREAKER_TIMEOUT_MS - (now - circuitBreakerOpenedAt))
      : null,
    partialDegradationMode,
    partialDegradationRemainingMs: partialDegradationActivatedAt
      ? Math.max(0, PARTIAL_DEGRADATION_TIMEOUT_MS - (now - partialDegradationActivatedAt))
      : null,
    cacheSize: responseCache.size
  };
}

/**
 * Enter partial degradation mode when database is experiencing issues
 * but we don't want to completely stop all requests
 */
export function enterPartialDegradationMode(): void {
  const now = Date.now();
  partialDegradationMode = true;
  partialDegradationActivatedAt = now;
  
  createAndLogError(
    ErrorCategory.DATABASE,
    ErrorSeverity.WARNING,
    3005,
    'Entering partial degradation mode due to database connectivity issues',
    { timestamp: now, consecutiveErrors }
  );
  
  console.warn(`Entering partial degradation mode at ${new Date(now).toISOString()}`);
}

/**
 * Check if we're in partial degradation mode
 * @returns boolean indicating if we're in partial degradation mode
 */
export function isInPartialDegradationMode(): boolean {
  const now = Date.now();
  
  // If we're in partial degradation mode, check if it's time to exit
  if (partialDegradationMode && partialDegradationActivatedAt) {
    if (now - partialDegradationActivatedAt >= PARTIAL_DEGRADATION_TIMEOUT_MS) {
      // Exit partial degradation mode
      partialDegradationMode = false;
      partialDegradationActivatedAt = null;
      console.log('Exiting partial degradation mode, normal operation resumed');
      return false;
    }
    return true;
  }
  
  return false;
}

/**
 * Cache a successful response for potential fallback use
 * @param key Unique key for the cached response
 * @param data The data to cache
 */
export function cacheResponse(key: string, data: any): void {
  const now = Date.now();
  
  // Clean up expired cache entries
  for (const [cacheKey, entry] of responseCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      responseCache.delete(cacheKey);
    }
  }
  
  // Add new cache entry
  responseCache.set(key, {
    data,
    timestamp: now,
    key
  });
}

/**
 * Get a cached response if available
 * @param key The cache key to look up
 * @returns The cached data or null if not found or expired
 */
export function getCachedResponse(key: string): any | null {
  const now = Date.now();
  const cachedEntry = responseCache.get(key);
  
  if (cachedEntry && now - cachedEntry.timestamp <= CACHE_TTL_MS) {
    return cachedEntry.data;
  }
  
  return null;
}

/**
 * Clear all cached responses
 */
export function clearCache(): void {
  responseCache.clear();
}

/**
 * Determine if a request should use cached data based on current system state
 * @param key The cache key to check
 * @returns boolean indicating if cached data should be used
 */
export function shouldUseCachedResponse(key: string): boolean {
  // If circuit breaker is open or in partial degradation mode, try to use cache
  if (circuitBreakerOpen || partialDegradationMode) {
    return getCachedResponse(key) !== null;
  }
  
  return false;
}