import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

// Define a smaller batch size to prevent timeouts
const DEFAULT_LIMIT = 500; // Reduced from 2000
const BATCH_SIZE = 50; // Number of records to process in a single database operation

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { symbol, limit, days } = req.query;

  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Symbol is required' });
  }
  
  // Parse limit parameter or use default
  const dataLimit = limit && !isNaN(Number(limit)) ? Math.min(Number(limit), DEFAULT_LIMIT) : DEFAULT_LIMIT;
  
  // Calculate start date if days parameter is provided
  let startDate: Date | undefined;
  if (days && !isNaN(Number(days))) {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));
  }

  try {
    // Get the authenticated user
    const supabase = createClient(req, res);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch historical data from CoinDesk API
    const coinDeskApiKey = process.env.NEXT_PUBLIC_COINDESK_API_KEY;
    if (!coinDeskApiKey) {
      return res.status(500).json({ error: 'CoinDesk API key is not configured' });
    }

    // Format the instrument based on the symbol
    const instrument = `${symbol.toUpperCase()}-USD`;
    
    console.log(`Preparing to fetch historical data for ${symbol} from CoinDesk API`);
    
    // Construct the full URL with API key as a query parameter (as used in coinDesk.ts)
    const baseUrl = 'https://data-api.coindesk.com/index/cc/v1/historical/minutes';
    const params: Record<string, string> = {
      "market": "cadli",
      "instrument": instrument,
      "api_key": coinDeskApiKey, // API key as query parameter instead of header
      "limit": dataLimit.toString(),
      "aggregate": "1",
      "fill": "true",
      "apply_mapping": "true",
      "response_format": "JSON"
    };
    
    // Add start_time parameter if days was specified
    if (startDate) {
      // Convert to Unix timestamp (seconds)
      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      params["start_time"] = startTimestamp.toString();
    }
    
    // Create URL with parameters using URLSearchParams
    const url = new URL(baseUrl);
    url.search = new URLSearchParams(params).toString();
    
    console.log(`Fetching historical data for ${symbol} from CoinDesk API: ${url.toString()}`);
    
    // Make the API request with the correct headers
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        "Content-type": "application/json; charset=UTF-8"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`CoinDesk API error (${response.status}):`, errorText);
      return res.status(response.status).json({ 
        error: `Failed to fetch data from CoinDesk API: ${response.statusText}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    if (!data.Data || !Array.isArray(data.Data) || data.Data.length === 0) {
      console.error('No data returned from CoinDesk API:', data);
      return res.status(404).json({ error: 'No data found for the specified symbol' });
    }

    console.log(`Received ${data.Data.length} records for ${symbol}`);

    // Process and save the data in batches
    const savedRecords = [];
    const errors = [];
    const recordsToProcess = data.Data;
    
    console.log(`Processing ${recordsToProcess.length} records in batches of ${BATCH_SIZE}`);
    
    // Process data in batches to avoid timeouts
    for (let i = 0; i < recordsToProcess.length; i += BATCH_SIZE) {
      const batch = recordsToProcess.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(recordsToProcess.length / BATCH_SIZE)} (${batch.length} records)`);
      
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
        const results = await prisma.$transaction(operations);
        savedRecords.push(...results);
        
        console.log(`Successfully processed batch ${Math.floor(i / BATCH_SIZE) + 1}, saved ${results.length} records`);
      } catch (error) {
        console.error(`Error processing batch for ${symbol}:`, error);
        
        // If batch operation fails, try individual records
        console.log(`Falling back to individual processing for batch ${Math.floor(i / BATCH_SIZE) + 1}`);
        
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
            console.error(`Error saving individual record for ${symbol}:`, error);
            errors.push({
              timestamp: record.TIMESTAMP,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Processed ${data.Data.length} records for ${symbol}`,
      savedCount: savedRecords.length,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error processing historical data:', error);
    
    // Provide more detailed error information
    let errorDetails = 'Unknown error';
    let errorMessage = 'Failed to process historical data';
    
    if (error instanceof Error) {
      errorDetails = error.message;
      
      // Check for network-related errors
      if (error.message === 'fetch failed' && 'cause' in error) {
        const cause = error.cause as any;
        if (cause && cause.code) {
          errorDetails = `Network error: ${cause.code} - ${cause.hostname || ''}`;
          errorMessage = 'Failed to connect to CoinDesk API';
        }
      }
    }
    
    return res.status(500).json({
      error: errorMessage,
      details: errorDetails,
    });
  }
}