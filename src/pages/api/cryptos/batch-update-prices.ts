import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma, { checkPrismaConnection, executeWithFallback } from '@/lib/prisma';
import { PrismaClientInitializationError, PrismaClientKnownRequestError, PrismaClientValidationError } from '@prisma/client/runtime/library';
import * as connectionManager from '@/lib/connectionManager';
import { createAndLogError, ErrorCategory, ErrorSeverity, DatabaseErrorCodes } from '@/lib/errorLogger';

// Define types for better type safety
interface PriceUpdate {
  symbol: string;
  lastPrice: number;
}

interface BatchUpdateRequest {
  updates: PriceUpdate[];
  statusCheckOnly?: boolean;
}

// Error codes for better categorization
enum BatchUpdateErrorCodes {
  INVALID_REQUEST = 'INVALID_REQUEST',
  EMPTY_UPDATES = 'EMPTY_UPDATES',
  INVALID_UPDATE_FORMAT = 'INVALID_UPDATE_FORMAT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CONNECTION_CHECK_FAILED = 'CONNECTION_CHECK_FAILED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR'
}

// Add connection retry logic
const MAX_RETRIES = 3;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Start request logging
  const requestId = `batch-update-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const requestStartTime = Date.now();
  
  console.log(`[${requestId}] Batch update prices request received at ${new Date().toISOString()}`);
  
  // Check if circuit breaker is open
  if (connectionManager.isCircuitBreakerOpen()) {
    const status = connectionManager.getConnectionStatus();
    console.log(`[${requestId}] Circuit breaker is open, rejecting request`, status);
    
    createAndLogError(
      ErrorCategory.SYSTEM,
      ErrorSeverity.WARNING,
      4001,
      `Batch update request rejected due to open circuit breaker`,
      { 
        requestId,
        circuitBreakerStatus: status,
        timestamp: Date.now()
      }
    );
    
    // Return a 503 with detailed information
    return res.status(503).json({
      error: 'Database service temporarily unavailable',
      details: 'Too many database errors occurred recently. Please try again later.',
      code: BatchUpdateErrorCodes.CIRCUIT_BREAKER_OPEN,
      requestId,
      retryAfterMs: status.circuitBreakerRemainingMs,
      degradationStatus: {
        circuitBreakerOpen: status.circuitBreakerOpen,
        partialDegradation: status.partialDegradationMode,
        estimatedRecovery: status.circuitBreakerRemainingMs
      }
    });
  }

  // Check if we're in partial degradation mode
  const inPartialDegradation = connectionManager.isInPartialDegradationMode();
  if (inPartialDegradation) {
    const status = connectionManager.getConnectionStatus();
    console.log('In partial degradation mode, proceeding with caution', status);
  }

  // Check if we should allow this request based on rate limiting
  if (!connectionManager.shouldAllowRequest()) {
    console.log(`[${requestId}] Rate limit exceeded, rejecting request`);
    
    createAndLogError(
      ErrorCategory.SYSTEM,
      ErrorSeverity.WARNING,
      4002,
      `Batch update request rejected due to rate limiting`,
      { 
        requestId,
        timestamp: Date.now()
      }
    );
    
    return res.status(429).json({
      error: 'Too many requests',
      details: 'Please try again in a few seconds.',
      code: BatchUpdateErrorCodes.RATE_LIMIT_EXCEEDED,
      requestId
    });
  }

  // Record this request for rate limiting
  connectionManager.recordRequest();
  
  console.log(`[${requestId}] Request passed rate limiting checks`);

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      console.log(`[${requestId}] Method not allowed in batch-update-prices: ${req.method}`);
      
      createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.WARNING,
        4003,
        `Invalid method used for batch update prices API`,
        { 
          requestId,
          method: req.method,
          timestamp: Date.now()
        }
      );
      
      return res.status(405).json({ 
        error: 'Method not allowed', 
        code: BatchUpdateErrorCodes.INVALID_REQUEST,
        requestId
      });
    }

    // Check database connection health before proceeding
    console.log(`[${requestId}] Checking database connection health`);
    const isConnected = await checkPrismaConnection();
    if (!isConnected && !inPartialDegradation) {
      console.error(`[${requestId}] Database connection check failed`);
      
      connectionManager.recordError({
        message: 'Database connection check failed',
        code: BatchUpdateErrorCodes.CONNECTION_CHECK_FAILED
      });
      
      createAndLogError(
        ErrorCategory.DATABASE,
        ErrorSeverity.ERROR,
        4004,
        `Database connection check failed during batch update`,
        { 
          requestId,
          timestamp: Date.now()
        }
      );
      
      return res.status(503).json({
        error: 'Database service unavailable',
        details: 'Unable to connect to the database. Please try again later.',
        code: BatchUpdateErrorCodes.CONNECTION_CHECK_FAILED,
        requestId
      });
    }
    
    console.log(`[${requestId}] Database connection check passed`);

    // Initialize Supabase client
    console.log(`[${requestId}] Initializing Supabase client and authenticating user`);
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log(`[${requestId}] Unauthorized access attempt to batch-update-prices`);
      
      createAndLogError(
        ErrorCategory.SECURITY,
        ErrorSeverity.WARNING,
        4005,
        `Unauthorized access attempt to batch update prices API`,
        { 
          requestId,
          timestamp: Date.now(),
          ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
        }
      );
      
      return res.status(401).json({ 
        error: 'Unauthorized', 
        code: BatchUpdateErrorCodes.UNAUTHORIZED,
        requestId
      });
    }
    
    console.log(`[${requestId}] User authenticated: ${user.id}`);
    
    // Parse and validate the request body
    const { updates, statusCheckOnly } = req.body as BatchUpdateRequest;
    
    // If this is just a status check, return success without processing
    if (statusCheckOnly === true) {
      console.log(`[${requestId}] Status check request received, returning OK`);
      return res.status(200).json({ 
        status: 'ok', 
        message: 'System operational',
        degraded: inPartialDegradation,
        requestId
      });
    }
    
    // Validate updates array
    if (!updates) {
      console.log(`[${requestId}] Missing updates array in batch-update-prices`);
      
      createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.WARNING,
        4006,
        `Missing updates array in batch update request`,
        { 
          requestId,
          userId: user.id,
          timestamp: Date.now()
        }
      );
      
      return res.status(400).json({ 
        error: 'Missing updates array', 
        code: BatchUpdateErrorCodes.EMPTY_UPDATES,
        requestId
      });
    }
    
    if (!Array.isArray(updates)) {
      console.log(`[${requestId}] Invalid updates format in batch-update-prices: not an array`);
      
      createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.WARNING,
        4007,
        `Invalid updates format in batch update request`,
        { 
          requestId,
          userId: user.id,
          timestamp: Date.now(),
          receivedType: typeof updates
        }
      );
      
      return res.status(400).json({ 
        error: 'Updates must be an array', 
        code: BatchUpdateErrorCodes.INVALID_UPDATE_FORMAT,
        requestId
      });
    }
    
    if (updates.length === 0) {
      console.log(`[${requestId}] Empty updates array in batch-update-prices`);
      
      createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.INFO,
        4008,
        `Empty updates array in batch update request`,
        { 
          requestId,
          userId: user.id,
          timestamp: Date.now()
        }
      );
      
      return res.status(400).json({ 
        error: 'Updates array cannot be empty', 
        code: BatchUpdateErrorCodes.EMPTY_UPDATES,
        requestId
      });
    }
    
    // Limit the number of updates in a single batch to prevent overload
    const MAX_UPDATES_PER_BATCH = 20;
    let originalLength = updates.length;
    
    if (updates.length > MAX_UPDATES_PER_BATCH) {
      console.log(`[${requestId}] Limiting batch size from ${updates.length} to ${MAX_UPDATES_PER_BATCH}`);
      updates.length = MAX_UPDATES_PER_BATCH;
      
      createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.INFO,
        4009,
        `Batch size limited due to exceeding maximum allowed updates`,
        { 
          requestId,
          userId: user.id,
          timestamp: Date.now(),
          originalSize: originalLength,
          limitedSize: MAX_UPDATES_PER_BATCH
        }
      );
    }
    
    console.log(`[${requestId}] Processing batch-update-prices for ${updates.length} cryptos for user ${user.id}`);
    
    // Validate all updates have required fields and proper types
    const invalidUpdates: any[] = [];
    
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      
      // Check for missing required fields
      if (!update.symbol || update.lastPrice === undefined) {
        console.log(`[${requestId}] Invalid update at index ${i}: missing required fields`, update);
        invalidUpdates.push({ index: i, update, reason: 'Missing required fields' });
        continue;
      }
      
      // Check symbol format
      if (typeof update.symbol !== 'string' || update.symbol.trim() === '') {
        console.log(`[${requestId}] Invalid symbol at index ${i}: ${update.symbol}`);
        invalidUpdates.push({ index: i, update, reason: 'Invalid symbol format' });
        continue;
      }
      
      // Check price format
      if (isNaN(Number(update.lastPrice)) || Number(update.lastPrice) <= 0) {
        console.log(`[${requestId}] Invalid lastPrice at index ${i}: ${update.lastPrice}`);
        invalidUpdates.push({ index: i, update, reason: 'Invalid price format' });
        continue;
      }
    }
    
    // If there are any invalid updates, reject the entire request
    if (invalidUpdates.length > 0) {
      console.log(`[${requestId}] Found ${invalidUpdates.length} invalid updates in batch-update-prices`);
      
      createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.WARNING,
        4010,
        `Invalid updates found in batch update request`,
        { 
          requestId,
          userId: user.id,
          timestamp: Date.now(),
          invalidCount: invalidUpdates.length,
          totalCount: updates.length,
          invalidUpdates
        }
      );
      
      return res.status(400).json({ 
        error: 'Invalid updates in request', 
        code: BatchUpdateErrorCodes.INVALID_UPDATE_FORMAT,
        invalidUpdates,
        requestId
      });
    }
    
    // Get all symbols from the updates
    const symbols = updates.map(update => update.symbol);
    
    console.log(`[${requestId}] Querying database for ${symbols.length} symbols: ${symbols.join(', ')}`);
    
    // Create a cache key based on user ID and symbols
    const cacheKey = `user-cryptos-${user.id}-${symbols.sort().join('-')}`;
    
    // Find all cryptos by symbols for this user with enhanced fallback logic
    console.log(`[${requestId}] Executing database query with fallback`);
    const queryStartTime = Date.now();
    
    const cryptos = await executeWithFallback(
      async () => {
        return await prisma.crypto.findMany({
          where: {
            symbol: { in: symbols },
            userId: user.id,
          },
        });
      },
      [], // Fallback to empty array if all else fails
      cacheKey,
      MAX_RETRIES
    );
    
    const queryDuration = Date.now() - queryStartTime;
    console.log(`[${requestId}] Database query completed in ${queryDuration}ms, found ${cryptos.length} cryptos`);
    
    // Log the result
    createAndLogError(
      ErrorCategory.DATABASE,
      ErrorSeverity.INFO,
      3030,
      `Successfully retrieved ${cryptos.length} cryptos for user ${user.id}`,
      { 
        requestId,
        timestamp: Date.now(), 
        symbols,
        queryDuration,
        userId: user.id
      }
    );
    
    if (cryptos.length === 0) {
      // If no cryptos found for this user, we'll just ignore the update
      console.log(`[${requestId}] No cryptos found with symbols ${symbols.join(', ')} for user ${user.id}`);
      
      createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.INFO,
        4011,
        `No matching cryptos found for batch update`,
        { 
          requestId,
          userId: user.id,
          timestamp: Date.now(),
          symbols
        }
      );
      
      return res.status(200).json({ 
        message: `No cryptos found with the provided symbols for this user`,
        processedCount: 0,
        status: 'success',
        requestId
      });
    }
    
    // Create a map of symbol to crypto id for quick lookup
    const cryptoMap = new Map();
    cryptos.forEach(crypto => {
      cryptoMap.set(crypto.symbol, crypto.id);
    });
    
    // Filter updates to only include cryptos that exist for this user
    const validUpdates = updates.filter(update => cryptoMap.has(update.symbol));
    
    if (validUpdates.length === 0) {
      console.log(`[${requestId}] No valid updates found for user ${user.id}`);
      
      createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.INFO,
        4012,
        `No valid updates found for batch update after filtering`,
        { 
          requestId,
          userId: user.id,
          timestamp: Date.now(),
          requestedSymbols: symbols,
          availableSymbols: Array.from(cryptoMap.keys())
        }
      );
      
      return res.status(200).json({ 
        message: `No valid updates found for this user`,
        processedCount: 0,
        status: 'success',
        requestId
      });
    }
    
    console.log(`[${requestId}] Found ${validUpdates.length} valid updates out of ${updates.length} requested`);
    
    // Prepare batch update data
    const updateData = validUpdates.map(update => ({
      id: cryptoMap.get(update.symbol),
      lastPrice: Number(update.lastPrice),
      symbol: update.symbol
    }));
    
    // Create a transaction cache key
    const transactionCacheKey = `price-updates-${user.id}-${Date.now()}`;
    
    // Update the lastPrice for all cryptos in a single transaction with enhanced error handling
    let updatedCount = 0;
    
    // If we're in partial degradation mode, we'll skip the database update
    // but still return a success response with the data we would have updated
    if (inPartialDegradation) {
      console.log(`[${requestId}] Skipping database update due to partial degradation mode`);
      
      // Cache the update data for when the system recovers
      connectionManager.cacheResponse(transactionCacheKey, updateData);
      
      createAndLogError(
        ErrorCategory.SYSTEM,
        ErrorSeverity.INFO,
        4013,
        `Batch update processed in degraded mode`,
        { 
          requestId,
          userId: user.id,
          timestamp: Date.now(),
          updateCount: validUpdates.length,
          cachedKey: transactionCacheKey
        }
      );
      
      return res.status(200).json({ 
        message: `Processed price updates in degraded mode (database updates queued)`,
        processedCount: validUpdates.length,
        totalRequested: updates.length,
        status: 'partial_success',
        degraded: true,
        requestId
      });
    }
    
    // Use our enhanced executeWithFallback for the transaction
    console.log(`[${requestId}] Executing database transaction with fallback for ${updateData.length} updates`);
    const transactionStartTime = Date.now();
    
    try {
      const result = await executeWithFallback(
        async () => {
          // Use a transaction to ensure all updates succeed or fail together
          await prisma.$transaction(async (prismaClient) => {
            for (const data of updateData) {
              await prismaClient.crypto.update({
                where: { id: data.id },
                data: { lastPrice: data.lastPrice },
              });
              updatedCount++;
            }
          });
          
          // Cache the successful result
          connectionManager.cacheResponse(transactionCacheKey, {
            updatedCount,
            updateData
          });
          
          return { updatedCount };
        },
        { updatedCount: 0 }, // Fallback data if all else fails
        transactionCacheKey,
        MAX_RETRIES
      );
      
      const transactionDuration = Date.now() - transactionStartTime;
      console.log(`[${requestId}] Database transaction completed in ${transactionDuration}ms, updated ${updatedCount} cryptos`);
      
      // Log successful transaction
      createAndLogError(
        ErrorCategory.DATABASE,
        ErrorSeverity.INFO,
        4014,
        `Successfully updated crypto prices in batch`,
        { 
          requestId,
          userId: user.id,
          timestamp: Date.now(),
          updateCount: updatedCount,
          transactionDuration,
          totalRequested: updates.length
        }
      );
      
      // Calculate request duration
      const requestDuration = Date.now() - requestStartTime;
      
      return res.status(200).json({ 
        message: `Successfully updated lastPrice for ${updatedCount} cryptos`,
        processedCount: updatedCount,
        totalRequested: updates.length,
        status: 'success',
        requestId,
        duration: requestDuration
      });
    } catch (error) {
      // Log transaction error
      const transactionDuration = Date.now() - transactionStartTime;
      console.error(`[${requestId}] Transaction failed after ${transactionDuration}ms:`, error);
      
      // Rethrow to be caught by the outer try/catch
      throw error;
    }
  } catch (error) {
    // Calculate request duration even for errors
    const requestDuration = Date.now() - requestStartTime;
    
    console.error(`[${requestId}] API error in batch-update-prices after ${requestDuration}ms:`, error);
    
    // Record the error for circuit breaker
    connectionManager.recordError({
      message: error instanceof Error ? error.message : 'Unknown error',
      code: BatchUpdateErrorCodes.INTERNAL_SERVER_ERROR
    });
    
    // Log detailed error information
    createAndLogError(
      ErrorCategory.API,
      ErrorSeverity.ERROR,
      4015,
      `Error processing batch update request`,
      { 
        requestId,
        userId: user?.id,
        timestamp: Date.now(),
        duration: requestDuration,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        errorName: error instanceof Error ? error.name : undefined
      }
    );
    
    // Handle specific Prisma errors
    if (error instanceof PrismaClientInitializationError) {
      console.error(`[${requestId}] Prisma initialization error:`, error.message);
      
      // Enter partial degradation mode
      connectionManager.enterPartialDegradationMode();
      
      createAndLogError(
        ErrorCategory.DATABASE,
        ErrorSeverity.ERROR,
        4016,
        `Prisma initialization error during batch update`,
        { 
          requestId,
          userId: user?.id,
          timestamp: Date.now(),
          errorMessage: error.message
        }
      );
      
      return res.status(503).json({ 
        error: 'Database service unavailable', 
        details: 'Unable to connect to the database. Please try again later.',
        code: BatchUpdateErrorCodes.DATABASE_ERROR,
        status: 'error',
        degraded: true,
        requestId
      });
    }
    
    if (error instanceof PrismaClientKnownRequestError) {
      console.error(`[${requestId}] Prisma known request error:`, error.message, error.code);
      
      createAndLogError(
        ErrorCategory.DATABASE,
        ErrorSeverity.ERROR,
        4017,
        `Prisma known request error during batch update`,
        { 
          requestId,
          userId: user?.id,
          timestamp: Date.now(),
          errorMessage: error.message,
          errorCode: error.code,
          meta: error.meta
        }
      );
      
      // Handle "Max client connections reached" error
      if (error.message.includes('Max client connections reached')) {
        console.error(`[${requestId}] Max database connections reached:`, error.message);
        
        // Enter partial degradation mode
        connectionManager.enterPartialDegradationMode();
        
        return res.status(503).json({ 
          error: 'Database connection limit reached', 
          details: 'The system is experiencing high load. Please try again later.',
          code: BatchUpdateErrorCodes.DATABASE_ERROR,
          status: 'error',
          degraded: true,
          requestId
        });
      }
      
      // Handle other known Prisma errors with specific codes
      if (error.code === 'P2002') {
        return res.status(409).json({ 
          error: 'Conflict in database operation', 
          details: 'A unique constraint would be violated.',
          code: BatchUpdateErrorCodes.DATABASE_ERROR,
          status: 'error',
          requestId
        });
      }
      
      if (error.code === 'P2025') {
        return res.status(404).json({ 
          error: 'Record not found', 
          details: 'One or more records being updated could not be found.',
          code: BatchUpdateErrorCodes.DATABASE_ERROR,
          status: 'error',
          requestId
        });
      }
    }
    
    if (error instanceof PrismaClientValidationError) {
      console.error(`[${requestId}] Prisma validation error:`, error.message);
      
      createAndLogError(
        ErrorCategory.DATABASE,
        ErrorSeverity.ERROR,
        4018,
        `Prisma validation error during batch update`,
        { 
          requestId,
          userId: user?.id,
          timestamp: Date.now(),
          errorMessage: error.message
        }
      );
      
      return res.status(400).json({ 
        error: 'Invalid data format for database operation', 
        details: 'The data provided could not be processed by the database.',
        code: BatchUpdateErrorCodes.INVALID_UPDATE_FORMAT,
        status: 'error',
        requestId
      });
    }
    
    // Generic error response for all other errors
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error',
      code: BatchUpdateErrorCodes.INTERNAL_SERVER_ERROR,
      status: 'error',
      requestId
    });
  } finally {
    // Log request completion regardless of success or failure
    const totalDuration = Date.now() - requestStartTime;
    console.log(`[${requestId}] Batch update request completed in ${totalDuration}ms`);
  }
}