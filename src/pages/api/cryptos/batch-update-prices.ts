import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma, { checkPrismaConnection, executeWithFallback } from '@/lib/prisma';
import { PrismaClientInitializationError, PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import * as connectionManager from '@/lib/connectionManager';
import { createAndLogError, ErrorCategory, ErrorSeverity, DatabaseErrorCodes } from '@/lib/errorLogger';

// Add connection retry logic
const MAX_RETRIES = 3;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check if circuit breaker is open
  if (connectionManager.isCircuitBreakerOpen()) {
    const status = connectionManager.getConnectionStatus();
    console.log('Circuit breaker is open, rejecting request', status);
    
    // Return a 503 with detailed information
    return res.status(503).json({
      error: 'Database service temporarily unavailable',
      details: 'Too many database errors occurred recently. Please try again later.',
      code: 'CIRCUIT_BREAKER_OPEN',
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
    console.log('Rate limit exceeded, rejecting request');
    return res.status(429).json({
      error: 'Too many requests',
      details: 'Please try again in a few seconds.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }

  // Record this request for rate limiting
  connectionManager.recordRequest();

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      console.log('Method not allowed in batch-update-prices:', req.method);
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check database connection health before proceeding
    const isConnected = await checkPrismaConnection();
    if (!isConnected && !inPartialDegradation) {
      console.error('Database connection check failed');
      connectionManager.recordError({
        message: 'Database connection check failed',
        code: 'CONNECTION_CHECK_FAILED'
      });
      return res.status(503).json({
        error: 'Database service unavailable',
        details: 'Unable to connect to the database. Please try again later.',
        code: 'DB_CONNECTION_ERROR'
      });
    }

    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('Unauthorized access attempt to batch-update-prices');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { updates } = req.body;
    
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      console.log('Missing or invalid updates array in batch-update-prices');
      return res.status(400).json({ error: 'Missing or invalid updates array' });
    }
    
    // Limit the number of updates in a single batch to prevent overload
    const MAX_UPDATES_PER_BATCH = 20;
    if (updates.length > MAX_UPDATES_PER_BATCH) {
      console.log(`Limiting batch size from ${updates.length} to ${MAX_UPDATES_PER_BATCH}`);
      updates.length = MAX_UPDATES_PER_BATCH;
    }
    
    console.log(`Processing batch-update-prices for ${updates.length} cryptos`);
    
    // Validate all updates have required fields and proper types
    for (const update of updates) {
      if (!update.symbol || update.lastPrice === undefined) {
        console.log('Invalid update in batch-update-prices:', update);
        return res.status(400).json({ 
          error: 'Each update must include symbol and lastPrice',
          invalidUpdate: update
        });
      }
      
      if (isNaN(Number(update.lastPrice))) {
        console.log('Invalid lastPrice in batch-update-prices:', update.lastPrice);
        return res.status(400).json({ 
          error: 'lastPrice must be a valid number',
          invalidUpdate: update
        });
      }
    }
    
    // Get all symbols from the updates
    const symbols = updates.map(update => update.symbol);
    
    // Create a cache key based on user ID and symbols
    const cacheKey = `user-cryptos-${user.id}-${symbols.sort().join('-')}`;
    
    // Find all cryptos by symbols for this user with enhanced fallback logic
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
    
    // Log the result
    createAndLogError(
      ErrorCategory.DATABASE,
      ErrorSeverity.INFO,
      3030,
      `Successfully retrieved ${cryptos.length} cryptos for user ${user.id}`,
      { timestamp: Date.now(), symbols }
    );
    
    if (cryptos.length === 0) {
      // If no cryptos found for this user, we'll just ignore the update
      console.log(`No cryptos found with symbols ${symbols.join(', ')} for user ${user.id}`);
      return res.status(200).json({ 
        message: `No cryptos found with the provided symbols for this user`,
        processedCount: 0,
        status: 'success'
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
      console.log(`No valid updates found for user ${user.id}`);
      return res.status(200).json({ 
        message: `No valid updates found for this user`,
        processedCount: 0,
        status: 'success'
      });
    }
    
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
      console.log('Skipping database update due to partial degradation mode');
      
      // Cache the update data for when the system recovers
      connectionManager.cacheResponse(transactionCacheKey, updateData);
      
      return res.status(200).json({ 
        message: `Processed price updates in degraded mode (database updates queued)`,
        processedCount: validUpdates.length,
        totalRequested: updates.length,
        status: 'partial_success',
        degraded: true
      });
    }
    
    // Use our enhanced executeWithFallback for the transaction
    await executeWithFallback(
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
    
    console.log(`Successfully updated lastPrice for ${updatedCount} cryptos`);
    
    return res.status(200).json({ 
      message: `Successfully updated lastPrice for ${updatedCount} cryptos`,
      processedCount: updatedCount,
      totalRequested: updates.length,
      status: 'success'
    });
  } catch (error) {
    console.error('API error in batch-update-prices:', error);
    
    // Record the error for circuit breaker
    connectionManager.recordError({
      message: error instanceof Error ? error.message : 'Unknown error',
      code: 'API_ERROR'
    });
    
    // Handle specific Prisma errors
    if (error instanceof PrismaClientInitializationError) {
      console.error('Prisma initialization error:', error.message);
      
      // Enter partial degradation mode
      connectionManager.enterPartialDegradationMode();
      
      return res.status(503).json({ 
        error: 'Database service unavailable', 
        details: 'Unable to connect to the database. Please try again later.',
        code: 'DB_CONNECTION_ERROR',
        status: 'error',
        degraded: true
      });
    }
    
    if (error instanceof PrismaClientKnownRequestError) {
      // Handle "Max client connections reached" error
      if (error.message.includes('Max client connections reached')) {
        console.error('Max database connections reached:', error.message);
        
        // Enter partial degradation mode
        connectionManager.enterPartialDegradationMode();
        
        return res.status(503).json({ 
          error: 'Database connection limit reached', 
          details: 'The system is experiencing high load. Please try again later.',
          code: 'DB_CONNECTION_LIMIT',
          status: 'error',
          degraded: true
        });
      }
    }
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_SERVER_ERROR',
      status: 'error'
    });
  }
}