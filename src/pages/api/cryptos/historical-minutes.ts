import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

// Define batch size to prevent timeouts
const DEFAULT_LIMIT = 2000;
const BATCH_SIZE = 50; // Number of records to process in a single database operation
const REQUEST_TIMEOUT = 30000; // 30 seconds timeout for API requests to avoid Vercel function timeout

// Helper function for enhanced logging
const logWithTimestamp = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
};

// Define interface for manual data record
interface ManualDataRecord {
  symbol: string;
  timestamp: Date;
  unit: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  quoteVolume?: number;
  instrument?: string;
  market?: string;
}

// Function to handle manual data uploads
async function handleManualDataUpload(req: NextApiRequest, res: NextApiResponse, requestStartTime: number) {
  try {
    logWithTimestamp(`Processing manual data upload`);
    
    // Get the authenticated user
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logWithTimestamp(`Authentication error`, authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    logWithTimestamp(`User authenticated: ${user.id}`);
    
    // Validate request body
    const { records, symbol } = req.body;
    
    if (!records) {
      logWithTimestamp(`Invalid request body: records is null or undefined`);
      return res.status(400).json({ error: 'Records array is required' });
    }
    
    if (!Array.isArray(records)) {
      logWithTimestamp(`Invalid request body: records is not an array`);
      return res.status(400).json({ error: 'Records must be an array' });
    }
    
    if (records.length === 0) {
      logWithTimestamp(`Invalid request body: records array is empty`);
      return res.status(400).json({ error: 'Records array cannot be empty' });
    }
    
    if (!symbol || typeof symbol !== 'string') {
      logWithTimestamp(`Invalid request body: missing symbol`);
      return res.status(400).json({ error: 'Symbol is required' });
    }
    
    // Validate each record before processing
    const validRecords: ManualDataRecord[] = [];
    const invalidRecords: {index: number; reason: string}[] = [];
    
    records.forEach((record: any, index: number) => {
      if (!record) {
        invalidRecords.push({index, reason: 'Record is null or undefined'});
        return;
      }
      
      // Check required fields
      if (record.timestamp === undefined || record.timestamp === null) {
        invalidRecords.push({index, reason: 'Missing timestamp field'});
        return;
      }
      
      if (record.open === undefined || record.open === null) {
        invalidRecords.push({index, reason: 'Missing open field'});
        return;
      }
      
      if (record.high === undefined || record.high === null) {
        invalidRecords.push({index, reason: 'Missing high field'});
        return;
      }
      
      if (record.low === undefined || record.low === null) {
        invalidRecords.push({index, reason: 'Missing low field'});
        return;
      }
      
      if (record.close === undefined || record.close === null) {
        invalidRecords.push({index, reason: 'Missing close field'});
        return;
      }
      
      // Validate timestamp
      let timestamp: Date;
      try {
        timestamp = new Date(record.timestamp);
        if (isNaN(timestamp.getTime())) {
          invalidRecords.push({index, reason: `Invalid timestamp: ${record.timestamp}`});
          return;
        }
      } catch (error) {
        invalidRecords.push({index, reason: `Error parsing timestamp: ${error instanceof Error ? error.message : 'Unknown error'}`});
        return;
      }
      
      // Validate numeric fields
      try {
        const open = parseFloat(record.open);
        const high = parseFloat(record.high);
        const low = parseFloat(record.low);
        const close = parseFloat(record.close);
        const volume = record.volume !== undefined ? parseFloat(record.volume) : 0;
        const quoteVolume = record.quoteVolume !== undefined ? parseFloat(record.quoteVolume) : 0;
        
        if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume) || isNaN(quoteVolume)) {
          invalidRecords.push({index, reason: 'One or more numeric fields contain invalid values'});
          return;
        }
        
        validRecords.push({
          symbol: symbol.toUpperCase(),
          timestamp,
          unit: record.unit || 'MINUTE',
          open,
          high,
          low,
          close,
          volume,
          quoteVolume,
          instrument: record.instrument || `${symbol.toUpperCase()}-USD`,
          market: record.market || 'MANUAL',
        });
      } catch (error) {
        invalidRecords.push({index, reason: `Error parsing numeric fields: ${error instanceof Error ? error.message : 'Unknown error'}`});
      }
    });
    
    if (validRecords.length === 0) {
      logWithTimestamp(`No valid records found after validation`);
      return res.status(400).json({
        error: 'No valid records to process',
        invalidRecords
      });
    }
    
    logWithTimestamp(`Processing ${validRecords.length} valid manual records for ${symbol} (${invalidRecords.length} invalid records skipped)`);
    
    // Use a smaller batch size to prevent timeouts
    const BATCH_SIZE = 25; // Reduced from 50 to 25
    const savedRecords = [];
    const errors = [];
    const totalBatches = Math.ceil(validRecords.length / BATCH_SIZE);
    const batchStartTime = Date.now();
    
    // Process data in batches to avoid timeouts
    for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const batch = validRecords.slice(i, i + BATCH_SIZE);
      const batchSize = batch.length;
      
      logWithTimestamp(`Processing batch ${batchNumber} of ${totalBatches} (${batchSize} records)`);
      
      try {
        // Prepare batch operations
        const operations = batch.map((record: ManualDataRecord) => {
          return prisma.cryptoHistoricalData.upsert({
            where: {
              symbol_timestamp: {
                symbol: record.symbol.toUpperCase(),
                timestamp: record.timestamp,
              },
            },
            update: {
              open: record.open,
              high: record.high,
              low: record.low,
              close: record.close,
              volume: record.volume || 0,
              quoteVolume: record.quoteVolume || 0,
              instrument: record.instrument,
              market: record.market || 'MANUAL',
            },
            create: {
              symbol: record.symbol.toUpperCase(),
              timestamp: record.timestamp,
              unit: record.unit || 'MINUTE',
              open: record.open,
              high: record.high,
              low: record.low,
              close: record.close,
              volume: record.volume || 0,
              quoteVolume: record.quoteVolume || 0,
              instrument: record.instrument,
              market: record.market || 'MANUAL',
            },
          });
        });
        
        // Execute all operations in the batch
        const batchDbStartTime = Date.now();
        const results = await prisma.$transaction(operations);
        const batchDbDuration = Date.now() - batchDbStartTime;
        
        savedRecords.push(...results);
        
        logWithTimestamp(`Successfully processed batch ${batchNumber}, saved ${results.length} records in ${batchDbDuration}ms`);
        
        // Check if we're approaching the timeout limit (10 seconds)
        const elapsedTime = Date.now() - requestStartTime;
        if (elapsedTime > 10000 && i + BATCH_SIZE < validRecords.length) {
          // We're at risk of timeout, return partial results
          logWithTimestamp(`Approaching timeout limit (${elapsedTime}ms), returning partial results`);
          
          return res.status(202).json({
            success: true,
            partial: true,
            message: `Partially processed ${i + batchSize} of ${validRecords.length} records for ${symbol}`,
            savedCount: savedRecords.length,
            totalRecords: validRecords.length,
            remainingRecords: validRecords.length - (i + batchSize),
            processingTimeMs: Date.now() - batchStartTime,
            totalTimeMs: Date.now() - requestStartTime,
            invalidRecordsCount: invalidRecords.length,
          });
        }
      } catch (error) {
        logWithTimestamp(`Error processing batch ${batchNumber} for ${symbol}`, error);
        
        // If batch operation fails, try individual records
        logWithTimestamp(`Falling back to individual processing for batch ${batchNumber}`);
        
        for (const record of batch) {
          try {
            // Create or update the record in the database
            const savedRecord = await prisma.cryptoHistoricalData.upsert({
              where: {
                symbol_timestamp: {
                  symbol: record.symbol.toUpperCase(),
                  timestamp: record.timestamp,
                },
              },
              update: {
                open: record.open,
                high: record.high,
                low: record.low,
                close: record.close,
                volume: record.volume || 0,
                quoteVolume: record.quoteVolume || 0,
                instrument: record.instrument,
                market: record.market || 'MANUAL',
              },
              create: {
                symbol: record.symbol.toUpperCase(),
                timestamp: record.timestamp,
                unit: record.unit || 'MINUTE',
                open: record.open,
                high: record.high,
                low: record.low,
                close: record.close,
                volume: record.volume || 0,
                quoteVolume: record.quoteVolume || 0,
                instrument: record.instrument,
                market: record.market || 'MANUAL',
              },
            });

            savedRecords.push(savedRecord);
            
            // Check for timeout risk after each individual record
            const elapsedTime = Date.now() - requestStartTime;
            if (elapsedTime > 10000) {
              logWithTimestamp(`Approaching timeout during individual processing (${elapsedTime}ms), returning partial results`);
              
              return res.status(202).json({
                success: true,
                partial: true,
                message: `Partially processed records for ${symbol} (individual fallback mode)`,
                savedCount: savedRecords.length,
                totalRecords: validRecords.length,
                processingTimeMs: Date.now() - batchStartTime,
                totalTimeMs: Date.now() - requestStartTime,
                invalidRecordsCount: invalidRecords.length,
                errors: errors.length > 0 ? errors : undefined,
              });
            }
          } catch (error) {
            logWithTimestamp(`Error saving individual record for ${symbol}`, error);
            errors.push({
              record,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }
    }
    
    const totalProcessingTime = Date.now() - batchStartTime;
    logWithTimestamp(`Completed processing all batches in ${totalProcessingTime}ms`);
    
    const totalRequestTime = Date.now() - requestStartTime;
    logWithTimestamp(`Total request processing time: ${totalRequestTime}ms`);

    return res.status(200).json({
      success: true,
      message: `Processed ${validRecords.length} manual records for ${symbol}`,
      savedCount: savedRecords.length,
      errorCount: errors.length,
      processingTimeMs: totalProcessingTime,
      totalTimeMs: totalRequestTime,
      invalidRecordsCount: invalidRecords.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const totalRequestTime = Date.now() - requestStartTime;
    logWithTimestamp(`Error processing manual data after ${totalRequestTime}ms`, error);
    
    return res.status(500).json({
      error: 'Failed to process manual data',
      details: error instanceof Error ? error.message : 'Unknown error',
      requestDurationMs: totalRequestTime,
      timestamp: new Date().toISOString()
    });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestStartTime = Date.now();
  logWithTimestamp(`Historical minutes API request started with method: ${req.method}`);
  
  // Handle POST requests for manual data input
  if (req.method === 'POST') {
    return handleManualDataUpload(req, res, requestStartTime);
  }
  
  // Handle GET requests for API data fetching
  if (req.method !== 'GET') {
    logWithTimestamp(`Method not allowed: ${req.method}`);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { symbol, limit, to_ts } = req.query;

  if (!symbol || typeof symbol !== 'string') {
    logWithTimestamp(`Missing required parameter: symbol`);
    return res.status(400).json({ error: 'Symbol is required' });
  }
  
  // Parse limit parameter or use default
  const dataLimit = limit && !isNaN(Number(limit)) ? Math.min(Number(limit), DEFAULT_LIMIT) : DEFAULT_LIMIT;
  logWithTimestamp(`Using data limit: ${dataLimit}`);
  
  // Parse to_ts parameter if provided
  let toTimestamp: number | undefined;
  if (to_ts && !isNaN(Number(to_ts))) {
    toTimestamp = Number(to_ts);
    
    // Validate timestamp is not earlier than the earliest available data
    // July 17, 2010 in Unix timestamp (earliest BTC data available)
    const earliestBTCTimestamp = 1279324800;
    if (toTimestamp < earliestBTCTimestamp) {
      logWithTimestamp(`Timestamp ${toTimestamp} is earlier than the earliest available data (${earliestBTCTimestamp}). Adjusting to earliest available.`);
      toTimestamp = earliestBTCTimestamp;
    }
    
    logWithTimestamp(`Using custom timestamp: ${toTimestamp}`);
  } else {
    logWithTimestamp(`No custom timestamp provided, using current time`);
  }

  try {
    // Get the authenticated user
    logWithTimestamp(`Authenticating user`);
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logWithTimestamp(`Authentication error`, authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    logWithTimestamp(`User authenticated: ${user.id}`);

    // Fetch historical data from CoinDesk API
    const coinDeskApiKey = process.env.NEXT_PUBLIC_COINDESK_API_KEY;
    if (!coinDeskApiKey) {
      logWithTimestamp(`CoinDesk API key not configured`);
      return res.status(500).json({ error: 'CoinDesk API key is not configured' });
    }

    // Format the instrument based on the symbol
    const instrument = `${symbol.toUpperCase()}-USD`;
    
    logWithTimestamp(`Preparing to fetch historical data for ${symbol} from CoinDesk API`);
    
    // Construct the full URL with API key as a query parameter
    const baseUrl = 'https://data-api.coindesk.com/index/cc/v1/historical/minutes';
    const params: Record<string, string> = {
      "market": "cadli",
      "instrument": instrument,
      "api_key": coinDeskApiKey,
      "limit": dataLimit.toString(),
      "aggregate": "1",
      "fill": "true",
      "apply_mapping": "true",
      "response_format": "JSON"
    };
    
    // Add to_ts parameter if provided
    if (toTimestamp) {
      params["to_ts"] = toTimestamp.toString();
      logWithTimestamp(`Adding to_ts parameter: ${toTimestamp}`);
    }
    
    // Create URL with parameters using URLSearchParams
    const url = new URL(baseUrl);
    url.search = new URLSearchParams(params).toString();
    
    logWithTimestamp(`Fetching historical data for ${symbol} from CoinDesk API: ${url.toString().replace(coinDeskApiKey, '[REDACTED]')}`);
    
    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    try {
      // Make the API request with the correct headers and timeout
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          "Content-type": "application/json; charset=UTF-8"
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        logWithTimestamp(`CoinDesk API error (${response.status})`, errorText);
        return res.status(response.status).json({ 
          error: `Failed to fetch data from CoinDesk API: ${response.statusText}`,
          details: errorText,
          statusCode: response.status
        });
      }

      const data = await response.json();
      
      if (!data.Data || !Array.isArray(data.Data) || data.Data.length === 0) {
        logWithTimestamp(`No data returned from CoinDesk API`, data);
        return res.status(404).json({ 
          error: 'No data found for the specified symbol',
          apiResponse: data
        });
      }

      logWithTimestamp(`Received ${data.Data.length} records for ${symbol}`);
      
      // Process and save the data in batches
      const savedRecords = [];
      const errors = [];
      const recordsToProcess = data.Data;
      
      logWithTimestamp(`Processing ${recordsToProcess.length} records in batches of ${BATCH_SIZE}`);
      
      const totalBatches = Math.ceil(recordsToProcess.length / BATCH_SIZE);
      const batchStartTime = Date.now();
      
      // Process data in batches to avoid timeouts
      for (let i = 0; i < recordsToProcess.length; i += BATCH_SIZE) {
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const batch = recordsToProcess.slice(i, i + BATCH_SIZE);
        const batchSize = batch.length;
        
        logWithTimestamp(`Processing batch ${batchNumber} of ${totalBatches} (${batchSize} records)`);
        
        try {
          // Prepare batch operations
          const operations = batch.map(record => {
            // Convert UNIX timestamp to Date
            const timestamp = new Date(record.TIMESTAMP * 1000);
            
            return prisma.cryptoHistoricalData.upsert({
              where: {
                symbol_timestamp: {
                  symbol: symbol.toUpperCase(),
                  timestamp,
                },
              },
              update: {
                open: record.OPEN,
                high: record.HIGH,
                low: record.LOW,
                close: record.CLOSE,
                volume: record.VOLUME || 0,
                quoteVolume: record.QUOTE_VOLUME || 0,
                instrument: record.INSTRUMENT,
                market: record.MARKET,
              },
              create: {
                symbol: symbol.toUpperCase(),
                timestamp,
                unit: record.UNIT || 'MINUTE',
                open: record.OPEN,
                high: record.HIGH,
                low: record.LOW,
                close: record.CLOSE,
                volume: record.VOLUME || 0,
                quoteVolume: record.QUOTE_VOLUME || 0,
                instrument: record.INSTRUMENT,
                market: record.MARKET,
              },
            });
          });
          
          // Execute all operations in the batch
          const batchDbStartTime = Date.now();
          const results = await prisma.$transaction(operations);
          const batchDbDuration = Date.now() - batchDbStartTime;
          
          savedRecords.push(...results);
          
          logWithTimestamp(`Successfully processed batch ${batchNumber}, saved ${results.length} records in ${batchDbDuration}ms`);
        } catch (error) {
          logWithTimestamp(`Error processing batch ${batchNumber} for ${symbol}`, error);
          
          // If batch operation fails, try individual records
          logWithTimestamp(`Falling back to individual processing for batch ${batchNumber}`);
          
          for (const record of batch) {
            try {
              // Convert UNIX timestamp to Date
              const timestamp = new Date(record.TIMESTAMP * 1000);
              
              // Create or update the record in the database
              const savedRecord = await prisma.cryptoHistoricalData.upsert({
                where: {
                  symbol_timestamp: {
                    symbol: symbol.toUpperCase(),
                    timestamp,
                  },
                },
                update: {
                  open: record.OPEN,
                  high: record.HIGH,
                  low: record.LOW,
                  close: record.CLOSE,
                  volume: record.VOLUME || 0,
                  quoteVolume: record.QUOTE_VOLUME || 0,
                  instrument: record.INSTRUMENT,
                  market: record.MARKET,
                },
                create: {
                  symbol: symbol.toUpperCase(),
                  timestamp,
                  unit: record.UNIT || 'MINUTE',
                  open: record.OPEN,
                  high: record.HIGH,
                  low: record.LOW,
                  close: record.CLOSE,
                  volume: record.VOLUME || 0,
                  quoteVolume: record.QUOTE_VOLUME || 0,
                  instrument: record.INSTRUMENT,
                  market: record.MARKET,
                },
              });

              savedRecords.push(savedRecord);
            } catch (error) {
              logWithTimestamp(`Error saving individual record for ${symbol}`, error);
              errors.push({
                timestamp: record.TIMESTAMP,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        }
      }
      
      const totalProcessingTime = Date.now() - batchStartTime;
      logWithTimestamp(`Completed processing all batches in ${totalProcessingTime}ms`);
      
      const totalRequestTime = Date.now() - requestStartTime;
      logWithTimestamp(`Total request processing time: ${totalRequestTime}ms`);

      // Find the earliest timestamp in the data for client-side processing
      let earliestTimestamp = Number.MAX_SAFE_INTEGER;
      if (data.Data && Array.isArray(data.Data)) {
        for (const record of data.Data) {
          if (record.TIMESTAMP && record.TIMESTAMP < earliestTimestamp) {
            earliestTimestamp = record.TIMESTAMP;
          }
        }
      }
      
      // Calculate the next timestamp to use for batch processing
      // Subtract 60 seconds (1 minute) from the earliest timestamp to ensure we get the next batch
      // without any overlap or gaps
      const nextBatchTimestamp = earliestTimestamp !== Number.MAX_SAFE_INTEGER ? 
        earliestTimestamp - 60 : null;
      
      logWithTimestamp(`Earliest timestamp in batch: ${earliestTimestamp}, next batch timestamp: ${nextBatchTimestamp}`);

      return res.status(200).json({
        success: true,
        message: `Processed ${data.Data.length} records for ${symbol}`,
        savedCount: savedRecords.length,
        errorCount: errors.length,
        processingTimeMs: totalProcessingTime,
        totalTimeMs: totalRequestTime,
        errors: errors.length > 0 ? errors : undefined,
        earliestTimestamp: earliestTimestamp !== Number.MAX_SAFE_INTEGER ? earliestTimestamp : null,
        nextBatchTimestamp: nextBatchTimestamp,
        Data: data.Data // Include the raw data for client-side processing
      });
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        logWithTimestamp(`Request timeout after ${REQUEST_TIMEOUT/1000} seconds`);
        return res.status(504).json({ 
          error: 'Request timeout', 
          details: `The request to CoinDesk API timed out after ${REQUEST_TIMEOUT/1000} seconds`
        });
      }
      throw fetchError; // Re-throw to be caught by the outer try-catch
    }
  } catch (error) {
    const totalRequestTime = Date.now() - requestStartTime;
    logWithTimestamp(`Error processing historical data after ${totalRequestTime}ms`, error);
    
    // Provide detailed error information
    let errorDetails = 'Unknown error';
    let errorMessage = 'Failed to process historical data';
    let errorType = 'unknown';
    
    if (error instanceof Error) {
      errorDetails = error.message;
      errorType = error.name;
      
      // Check for network-related errors
      if (error.message === 'fetch failed' && 'cause' in error) {
        const cause = error.cause as any;
        if (cause && cause.code) {
          errorDetails = `Network error: ${cause.code} - ${cause.hostname || ''}`;
          errorMessage = 'Failed to connect to CoinDesk API';
          errorType = 'network';
        }
      }
      
      // Check for timeout errors
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        errorMessage = 'Request timed out';
        errorType = 'timeout';
      }
      
      // Check for database errors
      if (error.message.includes('prisma') || error.message.includes('database')) {
        errorMessage = 'Database operation failed';
        errorType = 'database';
      }
    }
    
    logWithTimestamp(`Returning error response: ${errorType} - ${errorMessage}`);
    
    return res.status(500).json({
      error: errorMessage,
      details: errorDetails,
      type: errorType,
      requestDurationMs: totalRequestTime,
      timestamp: new Date().toISOString()
    });
  }
}