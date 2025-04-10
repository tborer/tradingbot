import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { processAutoCryptoTrades } from '@/lib/autoTradeService';
import { PrismaClientInitializationError, PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// Add timeout for long-running operations
const PROCESS_TIMEOUT = 25000; // 25 seconds (Vercel functions timeout at 30s)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { prices } = req.body;
    
    if (!prices || !Array.isArray(prices)) {
      return res.status(400).json({ error: 'Missing or invalid prices array' });
    }
    
    // Process auto trades using the server-side function with a timeout
    // Create a promise that resolves with the results or rejects after timeout
    const processWithTimeout = Promise.race([
      processAutoCryptoTrades(prices, user.id),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Operation timed out after ' + PROCESS_TIMEOUT + 'ms'));
        }, PROCESS_TIMEOUT);
      })
    ]);
    
    // Wait for either the process to complete or the timeout
    const results = await processWithTimeout as Awaited<ReturnType<typeof processAutoCryptoTrades>>;
    
    return res.status(200).json({ 
      success: true,
      results
    });
  } catch (error) {
    console.error('API error in process-auto-trades:', error);
    
    // Handle timeout errors
    if (error.message && error.message.includes('Operation timed out')) {
      return res.status(504).json({ 
        error: 'Gateway Timeout', 
        details: 'The operation took too long to complete. Please try with fewer prices or at a less busy time.',
        code: 'TIMEOUT_ERROR'
      });
    }
    
    // Handle specific Prisma errors
    if (error instanceof PrismaClientInitializationError) {
      console.error('Prisma initialization error:', error.message);
      return res.status(503).json({ 
        error: 'Database service unavailable', 
        details: 'Unable to connect to the database. Please try again later.',
        code: 'DB_CONNECTION_ERROR'
      });
    }
    
    if (error instanceof PrismaClientKnownRequestError) {
      // Handle "Max client connections reached" error
      if (error.message.includes('Max client connections reached')) {
        console.error('Max database connections reached:', error.message);
        return res.status(503).json({ 
          error: 'Database connection limit reached', 
          details: 'The system is experiencing high load. Please try again later.',
          code: 'DB_CONNECTION_LIMIT'
        });
      }
    }
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}