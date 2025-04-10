import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma, { checkPrismaConnection } from '@/lib/prisma';
import { PrismaClientInitializationError, PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import * as connectionManager from '@/lib/connectionManager';

// Add connection retry logic
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second base delay

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check if circuit breaker is open
  if (connectionManager.isCircuitBreakerOpen()) {
    const status = connectionManager.getConnectionStatus();
    console.log('Circuit breaker is open, rejecting request', status);
    return res.status(503).json({
      error: 'Database service temporarily unavailable',
      details: 'Too many database errors occurred recently. Please try again later.',
      code: 'CIRCUIT_BREAKER_OPEN',
      retryAfterMs: status.circuitBreakerRemainingMs
    });
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
    if (!isConnected) {
      console.error('Database connection check failed');
      connectionManager.recordError();
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
    
    // Find all cryptos by symbols for this user with retry logic
    let cryptos = [];
    let retries = 0;
    
    while (retries < MAX_RETRIES) {
      try {
        cryptos = await prisma.crypto.findMany({
          where: {
            symbol: { in: symbols },
            userId: user.id,
          },
        });
        
        // If successful, break out of the retry loop
        connectionManager.recordSuccess();
        break;
      } catch (error) {
        retries++;
        console.error(`Database error in batch-update-prices (attempt ${retries}/${MAX_RETRIES}):`, error);
        
        // Record the error for circuit breaker
        const isCircuitBreakerOpen = connectionManager.recordError();
        if (isCircuitBreakerOpen) {
          console.error('Circuit breaker opened due to consecutive errors');
          return res.status(503).json({
            error: 'Database service temporarily unavailable',
            details: 'Too many database errors occurred recently. Please try again later.',
            code: 'CIRCUIT_BREAKER_OPEN'
          });
        }
        
        // If we've reached max retries, throw the error to be caught by the outer try/catch
        if (retries >= MAX_RETRIES) {
          throw error;
        }
        
        // Use exponential backoff for retries
        const backoffDelay = connectionManager.getBackoffDelay();
        console.log(`Retrying after ${backoffDelay}ms (attempt ${retries}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
    
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
      lastPrice: Number(update.lastPrice)
    }));
    
    // Update the lastPrice for all cryptos in a single transaction with retry logic
    retries = 0;
    let updatedCount = 0;
    
    while (retries < MAX_RETRIES) {
      try {
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
        
        // Record successful operation
        connectionManager.recordSuccess();
        
        // If successful, break out of the retry loop
        break;
      } catch (error) {
        retries++;
        console.error(`Database error in batch update (attempt ${retries}/${MAX_RETRIES}):`, error);
        
        // Record the error for circuit breaker
        const isCircuitBreakerOpen = connectionManager.recordError();
        if (isCircuitBreakerOpen) {
          console.error('Circuit breaker opened due to consecutive errors');
          return res.status(503).json({
            error: 'Database service temporarily unavailable',
            details: 'Too many database errors occurred recently. Please try again later.',
            code: 'CIRCUIT_BREAKER_OPEN'
          });
        }
        
        // If we've reached max retries, throw the error to be caught by the outer try/catch
        if (retries >= MAX_RETRIES) {
          throw error;
        }
        
        // Use exponential backoff for retries
        const backoffDelay = connectionManager.getBackoffDelay();
        console.log(`Retrying after ${backoffDelay}ms (attempt ${retries}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
    
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
    connectionManager.recordError();
    
    // Handle specific Prisma errors
    if (error instanceof PrismaClientInitializationError) {
      console.error('Prisma initialization error:', error.message);
      return res.status(503).json({ 
        error: 'Database service unavailable', 
        details: 'Unable to connect to the database. Please try again later.',
        code: 'DB_CONNECTION_ERROR',
        status: 'error'
      });
    }
    
    if (error instanceof PrismaClientKnownRequestError) {
      // Handle "Max client connections reached" error
      if (error.message.includes('Max client connections reached')) {
        console.error('Max database connections reached:', error.message);
        return res.status(503).json({ 
          error: 'Database connection limit reached', 
          details: 'The system is experiencing high load. Please try again later.',
          code: 'DB_CONNECTION_LIMIT',
          status: 'error'
        });
      }
    }
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      status: 'error'
    });
  }
}