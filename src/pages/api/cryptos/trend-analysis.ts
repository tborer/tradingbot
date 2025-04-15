import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { 
  fetchCoinDeskHistoricalData, 
  formatCoinDeskDataForAnalysis 
} from '@/lib/coinDesk';
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

    // Get the CoinDesk API key from environment variables
    const apiKey = process.env.NEXT_PUBLIC_COINDESK_API_KEY;
    if (!apiKey) {
      const errorDetails = createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.CRITICAL,
        4003,
        'CoinDesk API key not configured',
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
              responseBody: JSON.stringify({ error: 'CoinDesk API key not configured', code: errorDetails.code }),
              errorMessage: 'CoinDesk API key not configured',
              endTime: new Date(),
              duration: Date.now() - startTime
            }
          });
        } catch (dbError) {
          console.error(`[${requestId}] Failed to update API log entry:`, dbError);
        }
      }
      
      return res.status(500).json({ error: 'CoinDesk API key not configured', code: errorDetails.code });
    }

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
    
    // Create a logging function for API requests
    const logApiRequest = async (url: string, method: string, requestBody: any, response?: any, status?: number, error?: string, duration?: number) => {
      try {
        await prisma.apiLog.create({
          data: {
            requestId: `${requestId}-coindesk-api`,
            endpoint: url,
            method: method,
            requestBody: JSON.stringify(requestBody),
            responseBody: response ? JSON.stringify(response) : null,
            status: error ? 'ERROR' : 'SUCCESS',
            statusCode: status || (error ? 500 : 200),
            errorMessage: error || null,
            startTime: new Date(Date.now() - (duration || 0)),
            endTime: new Date(),
            duration: duration || 0,
            userId: user.id,
            metadata: JSON.stringify({
              parentRequestId: requestId,
              symbol,
              timestamp: new Date().toISOString()
            })
          }
        });
      } catch (logError) {
        console.error(`[${requestId}] Failed to log CoinDesk API request:`, logError);
      }
    };
    
    // Fetch historical data from CoinDesk API
    console.log(`[${requestId}] Fetching historical data from CoinDesk API for ${symbol}`);
    const historicalData = await fetchCoinDeskHistoricalData(symbol, apiKey, 30, logApiRequest);
    
    if (!historicalData) {
      const errorDetails = createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.ERROR,
        4004,
        `Failed to fetch historical data for ${symbol} from CoinDesk API`,
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
              responseBody: JSON.stringify({ error: 'Failed to fetch historical data', code: errorDetails.code }),
              errorMessage: `Failed to fetch historical data for ${symbol}`,
              endTime: new Date(),
              duration: Date.now() - startTime
            }
          });
        } catch (dbError) {
          console.error(`[${requestId}] Failed to update API log entry:`, dbError);
        }
      }
      
      return res.status(500).json({ error: 'Failed to fetch historical data', code: errorDetails.code });
    }
    
    // Format the data for analysis
    console.log(`[${requestId}] Formatting historical data for analysis`);
    const formattedData = formatCoinDeskDataForAnalysis(historicalData);
    
    if (!formattedData) {
      const errorDetails = createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.ERROR,
        4005,
        `Failed to format historical data for ${symbol}`,
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
              responseBody: JSON.stringify({ error: 'Failed to format historical data', code: errorDetails.code }),
              errorMessage: `Failed to format historical data for ${symbol}`,
              endTime: new Date(),
              duration: Date.now() - startTime
            }
          });
        } catch (dbError) {
          console.error(`[${requestId}] Failed to update API log entry:`, dbError);
        }
      }
      
      return res.status(500).json({ error: 'Failed to format historical data', code: errorDetails.code });
    }
    
    // Extract price data (closing prices)
    console.log(`[${requestId}] Extracting price data from formatted data`);
    const priceData = extractPriceDataFromCoinDesk(formattedData);
    
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