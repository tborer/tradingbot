import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { 
  calculateDrawdownDrawup,
  extractPriceDataFromCoinDesk
} from '@/lib/trendAnalysis';
import { 
  ErrorCategory, 
  ErrorSeverity, 
  createAndLogError, 
  ApiErrorCodes 
} from '@/lib/errorLogger';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now();
  const requestId = `trend-analysis-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  
  // Log request details
  console.log(`[${requestId}] Trend analysis request started for symbol: ${req.body?.symbol || 'unknown'}`);
  
  // Create a log entry in the database for this request
  let logEntryId: string | null = null;
  try {
    const logEntry = await prisma.apiLog.create({
      data: {
        requestId,
        endpoint: '/api/cryptos/trend-analysis',
        method: req.method || 'UNKNOWN',
        requestBody: JSON.stringify(req.body),
        userAgent: req.headers['user-agent'] || 'Unknown',
        ipAddress: req.headers['x-forwarded-for'] as string || 'Unknown',
        status: 'PENDING',
        startTime: new Date()
      }
    });
    logEntryId = logEntry.id;
    console.log(`[${requestId}] Created API log entry with ID: ${logEntryId}`);
  } catch (dbError) {
    console.error(`[${requestId}] Failed to create API log entry:`, dbError);
    // Continue processing even if logging fails
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    const errorDetails = createAndLogError(
      ErrorCategory.API,
      ErrorSeverity.WARNING,
      4000,
      `Method ${req.method} not allowed for trend analysis`,
      { requestId, method: req.method }
    );
    
    // Update log entry with error
    if (logEntryId) {
      try {
        await prisma.apiLog.update({
          where: { id: logEntryId },
          data: {
            status: 'ERROR',
            statusCode: 405,
            responseBody: JSON.stringify({ error: 'Method not allowed', code: errorDetails.code }),
            errorMessage: `Method ${req.method} not allowed`,
            endTime: new Date(),
            duration: Date.now() - startTime
          }
        });
      } catch (dbError) {
        console.error(`[${requestId}] Failed to update API log entry:`, dbError);
      }
    }
    
    return res.status(405).json({ error: 'Method not allowed', code: errorDetails.code });
  }

  try {
    // Get the Supabase client
    const supabase = createClient(req);

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const errorDetails = createAndLogError(
        ErrorCategory.AUTH,
        ErrorSeverity.ERROR,
        4001,
        'Unauthorized access to trend analysis API',
        { requestId }
      );
      
      // Update log entry with error
      if (logEntryId) {
        try {
          await prisma.apiLog.update({
            where: { id: logEntryId },
            data: {
              status: 'ERROR',
              statusCode: 401,
              responseBody: JSON.stringify({ error: 'Unauthorized', code: errorDetails.code }),
              errorMessage: 'Unauthorized access',
              endTime: new Date(),
              duration: Date.now() - startTime
            }
          });
        } catch (dbError) {
          console.error(`[${requestId}] Failed to update API log entry:`, dbError);
        }
      }
      
      return res.status(401).json({ error: 'Unauthorized', code: errorDetails.code });
    }

    // Get the symbol from the request body
    const { symbol } = req.body;
    if (!symbol) {
      const errorDetails = createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.ERROR,
        4002,
        'Missing symbol in trend analysis request',
        { requestId, body: req.body }
      );
      
      // Update log entry with error
      if (logEntryId) {
        try {
          await prisma.apiLog.update({
            where: { id: logEntryId },
            data: {
              status: 'ERROR',
              statusCode: 400,
              responseBody: JSON.stringify({ error: 'Symbol is required', code: errorDetails.code }),
              errorMessage: 'Missing symbol in request',
              endTime: new Date(),
              duration: Date.now() - startTime
            }
          });
        } catch (dbError) {
          console.error(`[${requestId}] Failed to update API log entry:`, dbError);
        }
      }
      
      return res.status(400).json({ error: 'Symbol is required', code: errorDetails.code });
    }

    console.log(`[${requestId}] Processing trend analysis for symbol: ${symbol}`);

    // Update log entry with user and symbol info
    if (logEntryId) {
      try {
        await prisma.apiLog.update({
          where: { id: logEntryId },
          data: {
            userId: user.id,
            metadata: JSON.stringify({
              symbol,
              requestId,
              timestamp: new Date().toISOString()
            })
          }
        });
      } catch (dbError) {
        console.error(`[${requestId}] Failed to update API log entry with user info:`, dbError);
      }
    }

    // Fetch and analyze trend data
    console.log(`[${requestId}] Fetching and analyzing trend data for ${symbol}`);
    
    // Fetch historical data from CryptoHistoricalData table
    console.log(`[${requestId}] Fetching historical data from CryptoHistoricalData table for ${symbol}`);
    
    // Get the last 30 days of data (or as many as available)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const historicalRecords = await prisma.cryptoHistoricalData.findMany({
      where: {
        symbol: symbol.toUpperCase(),
        timestamp: {
          gte: thirtyDaysAgo
        }
      },
      orderBy: {
        timestamp: 'asc'
      },
      take: 1000 // Limit to 1000 records to prevent performance issues
    });
    
    console.log(`[${requestId}] Retrieved ${historicalRecords.length} historical records for ${symbol}`);
    
    if (!historicalRecords || historicalRecords.length === 0) {
      const errorDetails = createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.WARNING,
        4004,
        `No historical data found for ${symbol} in CryptoHistoricalData table`,
        { requestId, symbol }
      );
      
      // Update log entry with error
      if (logEntryId) {
        try {
          await prisma.apiLog.update({
            where: { id: logEntryId },
            data: {
              status: 'ERROR',
              statusCode: 404,
              responseBody: JSON.stringify({ error: 'No historical data available', code: errorDetails.code }),
              errorMessage: `No historical data found for ${symbol}`,
              endTime: new Date(),
              duration: Date.now() - startTime
            }
          });
        } catch (dbError) {
          console.error(`[${requestId}] Failed to update API log entry:`, dbError);
        }
      }
      
      return res.status(404).json({ 
        error: 'No historical data available', 
        message: `No historical data found for ${symbol}. Please upload historical data first.`,
        code: errorDetails.code 
      });
    }
    
    // Extract price data (closing prices) from the historical records
    console.log(`[${requestId}] Extracting price data from historical records`);
    const priceData = historicalRecords.map(record => record.close);
    
    if (priceData.length === 0) {
      const errorDetails = createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.ERROR,
        4006,
        `No price data found for ${symbol}`,
        { requestId, symbol }
      );
      
      // Update log entry with error
      if (logEntryId) {
        try {
          await prisma.apiLog.update({
            where: { id: logEntryId },
            data: {
              status: 'ERROR',
              statusCode: 500,
              responseBody: JSON.stringify({ error: 'No price data found', code: errorDetails.code }),
              errorMessage: `No price data found for ${symbol}`,
              endTime: new Date(),
              duration: Date.now() - startTime
            }
          });
        } catch (dbError) {
          console.error(`[${requestId}] Failed to update API log entry:`, dbError);
        }
      }
      
      return res.status(500).json({ error: 'No price data found', code: errorDetails.code });
    }
    
    // Calculate drawdown and drawup analysis
    console.log(`[${requestId}] Calculating drawdown and drawup analysis for ${priceData.length} price points`);
    const analysis = calculateDrawdownDrawup(priceData);
    
    if (!analysis) {
      const errorDetails = createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.ERROR,
        4007,
        `Failed to analyze trends for ${symbol}`,
        { requestId, symbol }
      );
      
      // Update log entry with error
      if (logEntryId) {
        try {
          await prisma.apiLog.update({
            where: { id: logEntryId },
            data: {
              status: 'ERROR',
              statusCode: 500,
              responseBody: JSON.stringify({ error: 'Failed to analyze trends', code: errorDetails.code }),
              errorMessage: `Failed to analyze trends for ${symbol}`,
              endTime: new Date(),
              duration: Date.now() - startTime
            }
          });
        } catch (dbError) {
          console.error(`[${requestId}] Failed to update API log entry:`, dbError);
        }
      }
      
      return res.status(500).json({ error: 'Failed to analyze trends', code: errorDetails.code });
    }

    // Log success
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Trend analysis completed successfully for ${symbol} in ${duration}ms`);

    // Create a success response
    const responseData = { 
      analysis,
      meta: {
        requestId,
        duration,
        timestamp: new Date().toISOString()
      }
    };
    
    // Update log entry with success
    if (logEntryId) {
      try {
        await prisma.apiLog.update({
          where: { id: logEntryId },
          data: {
            status: 'SUCCESS',
            statusCode: 200,
            responseBody: JSON.stringify(responseData),
            endTime: new Date(),
            duration
          }
        });
      } catch (dbError) {
        console.error(`[${requestId}] Failed to update API log entry with success:`, dbError);
      }
    }

    // Return the analysis results
    return res.status(200).json(responseData);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    const errorDetails = createAndLogError(
      ErrorCategory.API,
      ErrorSeverity.ERROR,
      4005,
      `Error analyzing trends: ${errorMessage}`,
      { 
        requestId, 
        symbol: req.body?.symbol,
        duration,
        stack: errorStack
      },
      error instanceof Error ? error : undefined
    );
    
    console.error(`[${requestId}] Error in trend analysis:`, error);
    
    // Update log entry with error
    if (logEntryId) {
      try {
        await prisma.apiLog.update({
          where: { id: logEntryId },
          data: {
            status: 'ERROR',
            statusCode: 500,
            responseBody: JSON.stringify({ 
              error: 'Internal server error', 
              message: errorMessage,
              code: errorDetails.code
            }),
            errorMessage: errorMessage,
            errorStack: errorStack,
            endTime: new Date(),
            duration
          }
        });
      } catch (dbError) {
        console.error(`[${requestId}] Failed to update API log entry with error:`, dbError);
      }
    }
    
    // Also log to error log table
    try {
      await prisma.errorLog.create({
        data: {
          code: errorDetails.code.toString(),
          message: errorMessage,
          category: ErrorCategory.API,
          severity: ErrorSeverity.ERROR,
          context: JSON.stringify({
            requestId,
            endpoint: '/api/cryptos/trend-analysis',
            method: req.method || 'UNKNOWN',
            symbol: req.body?.symbol,
            duration,
            timestamp: new Date().toISOString()
          }),
          stack: errorStack,
          timestamp: new Date()
        }
      });
    } catch (dbError) {
      console.error(`[${requestId}] Failed to create error log entry:`, dbError);
    }
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: errorMessage,
      code: errorDetails.code
    });
  }
}