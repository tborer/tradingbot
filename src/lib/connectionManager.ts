/**
 * Connection Manager for handling database connections and rate limiting
 */

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

// Rate limiting
const REQUEST_LIMIT = 10; // Maximum requests per time window
const TIME_WINDOW_MS = 1000; // Time window in milliseconds (1 second)
const requestTimestamps: number[] = [];

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
 * @returns boolean indicating if circuit breaker is now open
 */
export function recordError(): boolean {
  const now = Date.now();
  
  // If this is the first error or it's been a while since the last error
  if (!lastDbErrorTime || now - lastDbErrorTime > ERROR_WINDOW_MS) {
    consecutiveErrors = 1;
  } else {
    consecutiveErrors++;
  }
  
  lastDbErrorTime = now;
  
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
      : null
  };
}