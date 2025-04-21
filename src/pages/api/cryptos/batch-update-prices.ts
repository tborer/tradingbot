import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma, { checkPrismaConnection, executeWithFallback } from '@/lib/prisma';
import { PrismaClientInitializationError, PrismaClientKnownRequestError, PrismaClientValidationError } from '@prisma/client/runtime/library';
import * as connectionManager from '@/lib/connectionManager';
import { createAndLogError, ErrorCategory, ErrorSeverity, DatabaseErrorCodes } from '@/lib/errorLogger';
import { processSelectivePriceUpdates } from '@/lib/selectivePriceUpdates';
import { batchUpdateUIPriceCache } from '@/lib/uiPriceCache';

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
  
  // Log the API request for error tracking
  createAndLogError(
    ErrorCategory.API,
    ErrorSeverity.INFO,
    3000,
    `Batch update prices request received`,
    { 
      requestId,
      timestamp: requestStartTime,
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
        'x-forwarded-for': req.headers['x-forwarded-for']
      }
    }
  );
  
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
    
    // Prepare price update data for selective processing
    const priceUpdates = validUpdates.map(update => ({
      symbol: update.symbol,
      price: Number(update.lastPrice),
      timestamp: Date.now()
    }));
    
    // Always update the UI price cache regardless of whether we write to the database
    console.log(`[${requestId}] Updating UI price cache for ${priceUpdates.length} cryptos`);
    batchUpdateUIPriceCache(priceUpdates);
    
    // Create a transaction cache key
    const transactionCacheKey = `price-updates-${user.id}-${Date.now()}`;
    
    // If we're in partial degradation mode, we'll skip the database update
    // but still return a success response with the data we would have updated
    if (inPartialDegradation) {
      console.log(`[${requestId}] Skipping database update due to partial degradation mode`);
      
      // Cache the update data for when the system recovers
      connectionManager.cacheResponse(transactionCacheKey, priceUpdates);
      
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
    
    // Use selective price updates to only write to the database when necessary
    console.log(`[${requestId}] Processing selective price updates for ${priceUpdates.length} cryptos`);
    const transactionStartTime = Date.now();
    
    // Log the selective update attempt
    createAndLogError(
      ErrorCategory.DATABASE,
      ErrorSeverity.INFO,
      3001,
      `Starting selective price updates`,
      { 
        requestId,
        timestamp: Date.now(),
        userId: user.id,
        updateCount: priceUpdates.length,
        symbols: priceUpdates.map(d => d.symbol)
      }
    );
    
    try {
      // Process selective price updates
      const result = await processSelectivePriceUpdates(priceUpdates, user.id);
      
      const transactionDuration = Date.now() - transactionStartTime;
      console.log(`[${requestId}] Selective price updates completed in ${transactionDuration}ms, updated ${result.updated.length} cryptos, skipped ${result.skipped.length} cryptos`);
      
      // Cache the successful result
      connectionManager.cacheResponse(transactionCacheKey, {
        updatedCount: result.updated.length,
        skippedCount: result.skipped.length,
        priceUpdates
      });
      
      // Log successful updates with detailed performance metrics
      createAndLogError(
        ErrorCategory.DATABASE,
        ErrorSeverity.INFO,
        4014,
        `Successfully processed selective price updates`,
        { 
          requestId,
          userId: user.id,
          timestamp: Date.now(),
          updatedCount: result.updated.length,
          skippedCount: result.skipped.length,
          transactionDuration,
          totalRequested: updates.length,
          averageTimePerUpdate: result.updated.length > 0 ? Math.round(transactionDuration / result.updated.length) : 0,
          updatedSymbols: result.updated,
          skippedSymbols: result.skipped,
          cacheKey: transactionCacheKey
        }
      );
      
      // Get user settings to check if auto trading is enabled
      const settings = await prisma.settings.findUnique({
        where: { userId: user.id }
      });
      
      // Trigger auto trade evaluation for the updated cryptos if auto trading is enabled
      if (settings?.enableAutoCryptoTrading) {
        try {
          console.log(`[${requestId}] Triggering auto trade evaluation for ${result.updated.length} cryptos`);
          
          // Use the price objects we already created
          const priceObjects = priceUpdates;
          
          // Log that we're triggering auto trades
          createAndLogError(
            ErrorCategory.API,
            ErrorSeverity.INFO,
            4020,
            `Triggering auto trade evaluation after price update`,
            { 
              requestId,
              userId: user.id,
              timestamp: Date.now(),
              updateCount: result.updated.length,
              symbols: priceUpdates.map(d => d.symbol)
            }
          );
          
          // Import the auto trade service function
          const { processAutoCryptoTrades } = require('@/lib/autoTradeService');
          
          // Process auto trades asynchronously without waiting for the result
          // This prevents the price update API from being slowed down
          processAutoCryptoTrades(priceObjects, user.id)
            .then(results => {
              const successfulTrades = results.filter(r => r.success && r.action);
              
              if (successfulTrades.length > 0) {
                console.log(`[${requestId}] Successfully executed ${successfulTrades.length} auto trades:`, 
                  successfulTrades.map(t => `${t.action} ${t.symbol}`).join(', '));
                
                createAndLogError(
                  ErrorCategory.API,
                  ErrorSeverity.INFO,
                  4021,
                  `Successfully executed auto trades after price update`,
                  { 
                    requestId,
                    userId: user.id,
                    timestamp: Date.now(),
                    successCount: successfulTrades.length,
                    trades: successfulTrades.map(t => ({ 
                      symbol: t.symbol, 
                      action: t.action, 
                      shares: t.shares,
                      price: t.price
                    }))
                  }
                );
              } else {
                console.log(`[${requestId}] No auto trades executed after price update`);
              }
            })
            .catch(error => {
              console.error(`[${requestId}] Error processing auto trades:`, error);
              
              createAndLogError(
                ErrorCategory.API,
                ErrorSeverity.ERROR,
                4022,
                `Error processing auto trades after price update`,
                { 
                  requestId,
                  userId: user.id,
                  timestamp: Date.now(),
                  error: error.message,
                  stack: error.stack
                }
              );
            });
        } catch (error) {
          console.error(`[${requestId}] Error triggering auto trades:`, error);
          
          createAndLogError(
            ErrorCategory.API,
            ErrorSeverity.ERROR,
            4023,
            `Error triggering auto trades after price update`,
            { 
              requestId,
              userId: user.id,
              timestamp: Date.now(),
              error: error.message,
              stack: error.stack
            }
          );
        }
      }
      
      // Calculate request duration
      const requestDuration = Date.now() - requestStartTime;
      
      return res.status(200).json({ 
        message: `Successfully processed price updates for ${priceUpdates.length} cryptos`,
        updatedCount: result.updated.length,
        skippedCount: result.skipped.length,
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