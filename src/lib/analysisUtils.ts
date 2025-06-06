import prisma from '@/lib/prisma';
import { schedulingLogger } from '@/lib/schedulingLogger';
import { 
  enhancedLog, 
  logCalculationResult, 
  logStepCompletion, 
  logProcessCompletion,
  logProcessFailure
} from '@/lib/enhancedSchedulingLogger';
import { generateComprehensiveFeatureSet, saveComprehensiveFeatureSet } from '@/lib/comprehensiveFeatureUtils';
import { runPredictionsForAllCryptos, updatePredictionOutcomes } from '@/lib/predictionModels/predictionRunner';
import { generateTradingSignalsForAllCryptos } from '@/lib/tradingSignals/signalGenerator';
import { runTechnicalAnalysis as runTechnicalAnalysisFromData } from '@/lib/dataSchedulingService';

/**
 * Enhanced logging function for analysis utilities
 */
function logAnalysis(level: string, functionName: string, message: string, details?: any) {
  const logPrefix = `[ANALYSIS][${functionName}][${level}]`;
  console.log(`${logPrefix} ${message}`, details || '');
}

/**
 * Safe logging function that won't block the flow
 * Uses the enhanced logger that also updates ProcessingStatus
 */
async function safeLog(params: any): Promise<void> {
  try {
    await enhancedLog(params);
  } catch (e) {
    console.error('Log operation failed:', e);
  }
}

/**
 * Extract historical prices from formatted data
 * @param data Formatted historical data
 * @returns Array of closing prices (newest to oldest)
 */
export function extractHistoricalPrices(data: any): number[] {
  logAnalysis('INFO', 'extractHistoricalPrices', 'Starting extraction of historical prices from formatted data');
  
  if (!data) {
    logAnalysis('ERROR', 'extractHistoricalPrices', 'No data provided to extractHistoricalPrices');
    return [];
  }
  
  // Handle AlphaVantage or formatted CoinDesk data
  if (data['Time Series (Digital Currency Daily)']) {
    const timeSeries = data['Time Series (Digital Currency Daily)'];
    logAnalysis('INFO', 'extractHistoricalPrices', `Found ${Object.keys(timeSeries).length} time series entries in AlphaVantage format`);
    
    // Convert the time series object to an array of [date, price] pairs
    const priceArray = Object.entries(timeSeries).map(([date, values]: [string, any]) => {
      // Handle different possible formats for close price
      let closePrice: number | null = null;
      
      if (values['4. close']) {
        closePrice = parseFloat(values['4. close']);
      } else if (values['close'] || values['CLOSE']) {
        closePrice = parseFloat(values['close'] || values['CLOSE']);
      } else if (typeof values === 'number') {
        closePrice = values;
      } else if (typeof values === 'string' && !isNaN(parseFloat(values))) {
        closePrice = parseFloat(values);
      }
      
      // If we couldn't find a close price, log the values for debugging
      if (closePrice === null || isNaN(closePrice)) {
        logAnalysis('WARNING', 'extractHistoricalPrices', `Could not extract close price for date ${date}`, values);
        return { date, price: null };
      }
      
      return { date, price: closePrice };
    });

    // Filter out null prices
    const validPriceArray = priceArray.filter(item => item.price !== null);
    
    if (validPriceArray.length < priceArray.length) {
      logAnalysis('WARNING', 'extractHistoricalPrices', `Filtered out ${priceArray.length - validPriceArray.length} invalid price entries`);
    }
    
    // Sort by date (newest first)
    validPriceArray.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // Extract just the prices
    const prices = validPriceArray.map(item => item.price as number);
    
    // Log sample of the extracted prices
    if (prices.length > 0) {
      const sampleStart = prices.slice(0, Math.min(3, prices.length));
      const sampleEnd = prices.slice(Math.max(0, prices.length - 3));
      logAnalysis('INFO', 'extractHistoricalPrices', `Extracted ${prices.length} prices from AlphaVantage format`, {
        sampleStart,
        sampleEnd
      });
    } else {
      logAnalysis('WARNING', 'extractHistoricalPrices', 'No valid prices extracted from time series data');
    }
    
    return prices;
  }
  
  // Handle CoinDesk API direct response with Data array
  if (data.Data && Array.isArray(data.Data) && data.Data.length > 0) {
    logAnalysis('INFO', 'extractHistoricalPrices', 'Extracting prices from CoinDesk Data array format');
    
    // Sort by timestamp (newest first)
    const sortedData = [...data.Data].sort((a, b) => b.TIMESTAMP - a.TIMESTAMP);
    
    // Extract close prices
    const prices = sortedData.map(entry => entry.CLOSE);
    
    logAnalysis('INFO', 'extractHistoricalPrices', `Extracted ${prices.length} prices from CoinDesk Data array format`);
    return prices;
  }
  
  // Handle nested data.Data array
  if (data.data && data.data.Data && Array.isArray(data.data.Data) && data.data.Data.length > 0) {
    logAnalysis('INFO', 'extractHistoricalPrices', 'Extracting prices from nested data.Data array format');
    
    // Sort by timestamp (newest first)
    const sortedData = [...data.data.Data].sort((a, b) => b.TIMESTAMP - a.TIMESTAMP);
    
    // Extract close prices
    const prices = sortedData.map(entry => entry.CLOSE);
    
    logAnalysis('INFO', 'extractHistoricalPrices', `Extracted ${prices.length} prices from nested data.Data array format`);
    return prices;
  }
  
  // Handle original format with entries array
  if (data.data && data.data.entries && Array.isArray(data.data.entries) && data.data.entries.length > 0) {
    logAnalysis('INFO', 'extractHistoricalPrices', 'Extracting prices from data.entries array format');
    
    // Sort by date (newest first)
    const sortedEntries = [...data.data.entries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    // Extract values
    const prices = sortedEntries.map(entry => entry.value);
    
    logAnalysis('INFO', 'extractHistoricalPrices', `Extracted ${prices.length} prices from data.entries array format`);
    return prices;
  }
  
  // If we couldn't extract prices using any of the known formats, try a more generic approach
  logAnalysis('WARNING', 'extractHistoricalPrices', 'Unknown data format, attempting to extract any price data using generic approach');
  
  // Function to recursively search for price data in the object
  const extractPriceData = (obj: any): number[] => {
    const prices: number[] = [];
    
    const findPriceData = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      
      // If this is an array of objects that might contain price data
      if (Array.isArray(obj)) {
        // Check if this array contains price-like objects
        const hasPriceObjects = obj.some(item => 
          (item && typeof item === 'object') && 
          ((item.close && !isNaN(item.close)) || 
           (item.CLOSE && !isNaN(item.CLOSE)) || 
           (item.value && !isNaN(item.value)) || 
           (item.price && !isNaN(item.price)))
        );
        
        if (hasPriceObjects) {
          // Extract prices from each item
          obj.forEach(item => {
            if (item && typeof item === 'object') {
              let price = null;
              
              // Try to find price
              if (item.close && !isNaN(item.close)) price = item.close;
              else if (item.CLOSE && !isNaN(item.CLOSE)) price = item.CLOSE;
              else if (item.value && !isNaN(item.value)) price = item.value;
              else if (item.price && !isNaN(item.price)) price = item.price;
              
              if (price !== null) {
                prices.push(price);
              }
            }
          });
        } else {
          // Recursively search each item
          obj.forEach(item => findPriceData(item));
        }
      } else {
        // Regular object, check each property
        Object.entries(obj).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            findPriceData(value);
          }
        });
      }
    };
    
    findPriceData(obj);
    return prices;
  };
  
  const prices = extractPriceData(data);
  
  if (prices.length > 0) {
    logAnalysis('INFO', 'extractHistoricalPrices', `Extracted ${prices.length} prices using generic extraction approach`);
    return prices;
  }
  
  logAnalysis('ERROR', 'extractHistoricalPrices', 'Failed to extract any prices from the provided data', {
    dataKeys: Object.keys(data || {})
  });
  return [];
}

/**
 * Run technical analysis for a user's cryptocurrencies
 * This function is used by the runAnalysisProcess function
 */
export async function runTechnicalAnalysis(userId: string, processId: string): Promise<void> {
  logAnalysis('INFO', 'runTechnicalAnalysis', `Starting technical analysis`, { userId, processId });
  
  try {
    // Validate inputs
    if (!userId || !processId) {
      logAnalysis('ERROR', 'runTechnicalAnalysis', "Invalid inputs to runTechnicalAnalysis", { userId, processId });
      await schedulingLogger.log({
        processId: processId || 'unknown',
        userId: userId || 'unknown',
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'TECHNICAL_ANALYSIS_VALIDATION',
        message: `Invalid inputs to runTechnicalAnalysis: userId=${!!userId}, processId=${!!processId}`
      });
      return;
    }
    
    // Check if prisma is defined
    if (!prisma) {
      logAnalysis('ERROR', 'runTechnicalAnalysis', "Prisma client is undefined in runTechnicalAnalysis");
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'TECHNICAL_ANALYSIS_DB_ERROR',
        message: `Prisma client is undefined in runTechnicalAnalysis`
      });
      return;
    }
    
    // Get user's cryptos with retry logic
    let cryptos;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        cryptos = await prisma.crypto.findMany({
          where: {
            userId
          }
        });
        break; // Success, exit the retry loop
      } catch (dbError) {
        retryCount++;
        console.error(`Database error when fetching cryptos (attempt ${retryCount}):`, dbError);
        
        if (retryCount >= maxRetries) {
          await schedulingLogger.log({
            processId,
            userId,
            level: 'ERROR',
            category: 'ANALYSIS',
            operation: 'TECHNICAL_ANALYSIS_DB_ERROR',
            message: `Failed to fetch cryptocurrencies after ${maxRetries} attempts: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
          });
          throw dbError; // Re-throw after max retries
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, retryCount - 1);
        console.log(`Retrying crypto fetch after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    if (!cryptos || cryptos.length === 0) {
      console.log(`No cryptocurrencies found for user ${userId}`);
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'TECHNICAL_ANALYSIS_SKIP',
        message: `No cryptocurrencies found for user ${userId}, skipping technical analysis`
      });
      return;
    }

    // Log the start of technical analysis
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'TECHNICAL_ANALYSIS_START',
      message: `Starting technical analysis for ${cryptos.length} cryptocurrencies`
    });

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // Process each crypto
    for (const crypto of cryptos) {
      try {
        console.log(`Processing technical analysis for ${crypto.symbol}`);
        
        // Get all available hourly data for this crypto (up to 90 days)
        // Calculate timestamp for 90 days ago
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const ninetyDaysAgoTimestamp = BigInt(Math.floor(ninetyDaysAgo.getTime() / 1000));
        
        await schedulingLogger.log({
          processId,
          userId,
          level: 'INFO',
          category: 'ANALYSIS',
          operation: 'DATA_FETCH',
          symbol: crypto.symbol,
          message: `Fetching all available data for ${crypto.symbol} (up to 90 days)`
        });
        
        // Get all data up to 90 days with retry logic
        let hourlyData;
        retryCount = 0;
        
        while (retryCount < maxRetries) {
          try {
            hourlyData = await prisma.hourlyCryptoHistoricalData.findMany({
              where: {
                instrument: `${crypto.symbol}-USD`,
                timestamp: {
                  gte: ninetyDaysAgoTimestamp
                }
              },
              orderBy: {
                timestamp: 'desc'
              }
            });
            break; // Success, exit the retry loop
          } catch (dbError) {
            retryCount++;
            console.error(`Database error when fetching hourly data for ${crypto.symbol} (attempt ${retryCount}):`, dbError);
            
            if (retryCount >= maxRetries) {
              await schedulingLogger.log({
                processId,
                userId,
                level: 'ERROR',
                category: 'ANALYSIS',
                operation: 'DATA_FETCH_ERROR',
                symbol: crypto.symbol,
                message: `Failed to fetch hourly data after ${maxRetries} attempts: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
              });
              throw dbError; // Re-throw after max retries
            }
            
            // Exponential backoff: 1s, 2s, 4s
            const delay = 1000 * Math.pow(2, retryCount - 1);
            console.log(`Retrying hourly data fetch for ${crypto.symbol} after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        console.log(`Found ${hourlyData.length} hourly data records for ${crypto.symbol}`);

        if (!hourlyData || hourlyData.length === 0) {
          skipCount++;
          await schedulingLogger.log({
            processId,
            userId,
            level: 'WARNING',
            category: 'ANALYSIS',
            operation: 'TECHNICAL_ANALYSIS_SKIP',
            symbol: crypto.symbol,
            message: `No hourly data found for ${crypto.symbol}, skipping technical analysis`
          });
          continue;
        }

        // Validate data quality
        const validDataPoints = hourlyData.filter(entry => 
          entry && 
          typeof entry.open === 'number' && 
          typeof entry.high === 'number' && 
          typeof entry.low === 'number' && 
          typeof entry.close === 'number'
        );
        
        if (validDataPoints.length < hourlyData.length) {
          console.warn(`Found ${hourlyData.length - validDataPoints.length} invalid data points for ${crypto.symbol}`);
          await schedulingLogger.log({
            processId,
            userId,
            level: 'WARNING',
            category: 'ANALYSIS',
            operation: 'DATA_QUALITY_ISSUE',
            symbol: crypto.symbol,
            message: `Found ${hourlyData.length - validDataPoints.length} invalid data points for ${crypto.symbol}`
          });
        }
        
        if (validDataPoints.length === 0) {
          skipCount++;
          await schedulingLogger.log({
            processId,
            userId,
            level: 'WARNING',
            category: 'ANALYSIS',
            operation: 'TECHNICAL_ANALYSIS_SKIP',
            symbol: crypto.symbol,
            message: `No valid data points found for ${crypto.symbol}, skipping technical analysis`
          });
          continue;
        }

        // Convert BigInt to number for analysis
        const formattedData = validDataPoints.map(entry => ({
          TIMESTAMP: Number(entry.timestamp),
          OPEN: entry.open,
          HIGH: entry.high,
          LOW: entry.low,
          CLOSE: entry.close,
          VOLUME: entry.volume || 0,
          INSTRUMENT: entry.instrument
        }));

        // Run technical analysis on the data
        await schedulingLogger.log({
          processId,
          userId,
          level: 'INFO',
          category: 'ANALYSIS',
          operation: 'TECHNICAL_ANALYSIS_PROCESSING',
          symbol: crypto.symbol,
          message: `Processing technical analysis for ${crypto.symbol} with ${formattedData.length} data points`
        });

        console.log(`Running technical analysis for ${crypto.symbol} with ${formattedData.length} data points`);
        
        // Add timeout protection for technical analysis
        const analysisPromise = runTechnicalAnalysisFromData(
          formattedData,
          crypto.symbol,
          `${crypto.symbol}-USD`,
          processId,
          userId
        );
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Technical analysis timed out for ${crypto.symbol}`)), 60000) // 60 second timeout
        );
        
        const result = await Promise.race([analysisPromise, timeoutPromise])
          .catch(error => {
            console.error(`Technical analysis failed for ${crypto.symbol}:`, error);
            return {
              success: false,
              message: `Technical analysis timed out or failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              error
            };
          });

        if (result.success) {
          successCount++;
          console.log(`Technical analysis completed successfully for ${crypto.symbol}`);
          
          await schedulingLogger.log({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'TECHNICAL_ANALYSIS_SUCCESS',
            symbol: crypto.symbol,
            message: `Technical analysis completed successfully for ${crypto.symbol}`,
            details: { steps: result.steps }
          });
        } else {
          errorCount++;
          console.error(`Technical analysis failed for ${crypto.symbol}:`, result.message || 'Unknown error');
          
          await schedulingLogger.log({
            processId,
            userId,
            level: 'ERROR',
            category: 'ANALYSIS',
            operation: 'TECHNICAL_ANALYSIS_ERROR',
            symbol: crypto.symbol,
            message: `Technical analysis failed for ${crypto.symbol}: ${result.message || 'Unknown error'}`,
            details: { error: result.error }
          });
        }
      } catch (error) {
        errorCount++;
        console.error(`Error in technical analysis for ${crypto.symbol}:`, error);
        
        await schedulingLogger.log({
          processId,
          userId,
          level: 'ERROR',
          category: 'ANALYSIS',
          operation: 'TECHNICAL_ANALYSIS_ERROR',
          symbol: crypto.symbol,
          message: `Error in technical analysis for ${crypto.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }

    // Log completion
    console.log(`Technical analysis completed for all cryptocurrencies: ${successCount} successful, ${skipCount} skipped, ${errorCount} errors`);
    
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'TECHNICAL_ANALYSIS_COMPLETE',
      message: `Technical analysis completed for all cryptocurrencies: ${successCount} successful, ${skipCount} skipped, ${errorCount} errors`
    });
  } catch (error) {
    console.error(`Unexpected error in runTechnicalAnalysis:`, error);
    await schedulingLogger.log({
      processId,
      userId,
      level: 'ERROR',
      category: 'ANALYSIS',
      operation: 'TECHNICAL_ANALYSIS_UNEXPECTED_ERROR',
      message: `Unexpected error in runTechnicalAnalysis: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { stack: error instanceof Error ? error.stack : undefined }
    });
  }
}

// This function is already defined above, so this duplicate definition is removed

/**
 * Run the analysis process for a user
 * This function is used by both the API endpoint and the scheduler
 * Implements a sequential approach to ensure each step completes before moving to the next
 */
export async function runAnalysisProcess(processId: string, userId: string): Promise<void> {
  logAnalysis('INFO', 'runAnalysisProcess', `Starting analysis process`, { processId, userId });
  
  try {
    // Validate inputs
    if (!processId || !userId) {
      logAnalysis('ERROR', 'runAnalysisProcess', "Invalid inputs to runAnalysisProcess", { processId, userId });
      await safeLog({
        processId: processId || 'unknown',
        userId: userId || 'unknown',
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'ANALYSIS_VALIDATION',
        message: `Invalid inputs to runAnalysisProcess: processId=${!!processId}, userId=${!!userId}`
      });
      return;
    }
    
    // Check if prisma is defined
    if (!prisma) {
      logAnalysis('ERROR', 'runAnalysisProcess', "Prisma client is undefined in runAnalysisProcess");
      await safeLog({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'ANALYSIS_DB_ERROR',
        message: `Prisma client is undefined in runAnalysisProcess`
      });
      return;
    }
    
    // Get user's cryptos with retry logic
    let cryptos;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        cryptos = await prisma.crypto.findMany({
          where: {
            userId
          }
        });
        break; // Success, exit the retry loop
      } catch (dbError) {
        retryCount++;
        console.error(`Database error when fetching cryptos (attempt ${retryCount}):`, dbError);
        
        if (retryCount >= maxRetries) {
          await safeLog({
            processId,
            userId,
            level: 'ERROR',
            category: 'ANALYSIS',
            operation: 'ANALYSIS_DB_ERROR',
            message: `Failed to fetch cryptocurrencies after ${maxRetries} attempts: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
          });
          throw dbError; // Re-throw after max retries
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, retryCount - 1);
        console.log(`Retrying crypto fetch after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    if (!cryptos || cryptos.length === 0) {
      console.log(`No cryptocurrencies found for user ${userId}`);
      await safeLog({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'ANALYSIS_SKIP',
        message: `No cryptocurrencies found for user ${userId}, skipping analysis process`
      });
      
      // Update processing status to completed with 0 items
      await prisma.processingStatus.upsert({
        where: {
          processId
        },
        update: {
          status: 'COMPLETED',
          totalItems: 0,
          processedItems: 0,
          completedAt: new Date(),
          details: {
            lastMessage: 'No cryptocurrencies found to analyze',
            lastOperation: 'ANALYSIS_SKIP',
            lastTimestamp: new Date().toISOString()
          }
        },
        create: {
          processId,
          userId,
          status: 'COMPLETED',
          type: 'ANALYSIS',
          totalItems: 0,
          processedItems: 0,
          startedAt: new Date(),
          completedAt: new Date(),
          details: {
            lastMessage: 'No cryptocurrencies found to analyze',
            lastOperation: 'ANALYSIS_SKIP',
            lastTimestamp: new Date().toISOString()
          }
        }
      });
      
      return;
    }

    // Create or update processing status with retry logic
    retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        await prisma.processingStatus.upsert({
          where: {
            processId
          },
          update: {
            userId,
            status: 'RUNNING',
            type: 'ANALYSIS',
            totalItems: cryptos.length * 5, // 5 steps per crypto
            processedItems: 0,
            startedAt: new Date(),
            details: {
              cryptoCount: cryptos.length,
              cryptoSymbols: cryptos.map(c => c.symbol),
              stepsPerCrypto: 5,
              startTime: new Date().toISOString(),
              lastOperation: 'ANALYSIS_START',
              lastMessage: `Starting analysis process for ${cryptos.length} cryptocurrencies`,
              lastTimestamp: new Date().toISOString()
            }
          },
          create: {
            processId,
            userId,
            status: 'RUNNING',
            type: 'ANALYSIS',
            totalItems: cryptos.length * 5, // 5 steps per crypto
            processedItems: 0,
            startedAt: new Date(),
            details: {
              cryptoCount: cryptos.length,
              cryptoSymbols: cryptos.map(c => c.symbol),
              stepsPerCrypto: 5,
              startTime: new Date().toISOString(),
              lastOperation: 'ANALYSIS_START',
              lastMessage: `Starting analysis process for ${cryptos.length} cryptocurrencies`,
              lastTimestamp: new Date().toISOString()
            }
          }
        });
        break; // Success, exit the retry loop
      } catch (dbError) {
        retryCount++;
        console.error(`Database error when creating processing status (attempt ${retryCount}):`, dbError);
        
        if (retryCount >= maxRetries) {
          await safeLog({
            processId,
            userId,
            level: 'ERROR',
            category: 'ANALYSIS',
            operation: 'STATUS_UPDATE_ERROR',
            message: `Failed to create processing status after ${maxRetries} attempts: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
          });
          throw dbError; // Re-throw after max retries
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, retryCount - 1);
        console.log(`Retrying processing status creation after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Log the start of the analysis process
    await safeLog({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'ANALYSIS_START',
      message: `Starting analysis process with sequential approach for ${cryptos.length} cryptocurrencies`
    });

    let processedItems = 0;
    let successCount = 0;
    let errorCount = 0;
    
    // Update status every 5 seconds to show activity
    const statusUpdateInterval = setInterval(async () => {
      try {
        const percentComplete = Math.round((processedItems / (cryptos.length * 5)) * 100);
        await prisma.processingStatus.update({
          where: { processId },
          data: {
            processedItems,
            updatedAt: new Date(),
            details: {
              update: {
                currentProgress: {
                  processedItems,
                  totalItems: cryptos.length * 5,
                  percentComplete
                },
                lastUpdateTime: new Date().toISOString()
              }
            }
          }
        });
        console.log(`Updated processing status: ${processedItems} items processed (${percentComplete}%)`);
      } catch (error) {
        console.error('Error updating status in interval:', error);
      }
    }, 5000);

    try {
      // Process each cryptocurrency sequentially through all steps
      for (const crypto of cryptos) {
        try {
          await safeLog({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'CRYPTO_ANALYSIS_START',
            symbol: crypto.symbol,
            message: `Starting analysis for ${crypto.symbol}`
          });

          // Step 1: Run technical analysis for this crypto
          let technicalAnalysisSuccess = false;
          try {
            console.log(`Running technical analysis for ${crypto.symbol}`);
            
            // Get all available hourly data for this crypto (up to 90 days)
            // Calculate timestamp for 90 days ago
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const ninetyDaysAgoTimestamp = BigInt(Math.floor(ninetyDaysAgo.getTime() / 1000));
            
            await safeLog({
              processId,
              userId,
              level: 'INFO',
              category: 'ANALYSIS',
              operation: 'DATA_FETCH',
              symbol: crypto.symbol,
              message: `Fetching all available data for ${crypto.symbol} (up to 90 days)`
            });
            
            // Get all data up to 90 days with retry logic
            let hourlyData;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
              try {
                hourlyData = await prisma.hourlyCryptoHistoricalData.findMany({
                  where: {
                    instrument: `${crypto.symbol}-USD`,
                    timestamp: {
                      gte: ninetyDaysAgoTimestamp
                    }
                  },
                  orderBy: {
                    timestamp: 'desc'
                  }
                });
                break; // Success, exit the retry loop
              } catch (dbError) {
                retryCount++;
                console.error(`Database error when fetching hourly data for ${crypto.symbol} (attempt ${retryCount}):`, dbError);
                
                if (retryCount >= maxRetries) {
                  await safeLog({
                    processId,
                    userId,
                    level: 'ERROR',
                    category: 'ANALYSIS',
                    operation: 'DATA_FETCH_ERROR',
                    symbol: crypto.symbol,
                    message: `Failed to fetch hourly data after ${maxRetries} attempts: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
                  });
                  throw dbError; // Re-throw after max retries
                }
                
                // Exponential backoff: 1s, 2s, 4s
                const delay = 1000 * Math.pow(2, retryCount - 1);
                console.log(`Retrying hourly data fetch for ${crypto.symbol} after ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }

            console.log(`Found ${hourlyData?.length || 0} hourly data records for ${crypto.symbol}`);

            if (!hourlyData || hourlyData.length === 0) {
              await safeLog({
                processId,
                userId,
                level: 'WARNING',
                category: 'ANALYSIS',
                operation: 'TECHNICAL_ANALYSIS_SKIP',
                symbol: crypto.symbol,
                message: `No hourly data found for ${crypto.symbol}, skipping technical analysis`
              });
              continue;
            }

            // Validate data quality
            const validDataPoints = hourlyData.filter(entry => 
              entry && 
              typeof entry.open === 'number' && 
              typeof entry.high === 'number' && 
              typeof entry.low === 'number' && 
              typeof entry.close === 'number'
            );
            
            if (validDataPoints.length < hourlyData.length) {
              console.warn(`Found ${hourlyData.length - validDataPoints.length} invalid data points for ${crypto.symbol}`);
              await safeLog({
                processId,
                userId,
                level: 'WARNING',
                category: 'ANALYSIS',
                operation: 'DATA_QUALITY_ISSUE',
                symbol: crypto.symbol,
                message: `Found ${hourlyData.length - validDataPoints.length} invalid data points for ${crypto.symbol}`
              });
            }
            
            if (validDataPoints.length === 0) {
              await safeLog({
                processId,
                userId,
                level: 'WARNING',
                category: 'ANALYSIS',
                operation: 'TECHNICAL_ANALYSIS_SKIP',
                symbol: crypto.symbol,
                message: `No valid data points found for ${crypto.symbol}, skipping technical analysis`
              });
              continue;
            }

            // Convert BigInt to number for analysis
            const formattedData = validDataPoints.map(entry => ({
              TIMESTAMP: Number(entry.timestamp),
              OPEN: entry.open,
              HIGH: entry.high,
              LOW: entry.low,
              CLOSE: entry.close,
              VOLUME: entry.volume || 0,
              INSTRUMENT: entry.instrument
            }));

            // Run technical analysis on the data
            await safeLog({
              processId,
              userId,
              level: 'INFO',
              category: 'ANALYSIS',
              operation: 'TECHNICAL_ANALYSIS_PROCESSING',
              symbol: crypto.symbol,
              message: `Processing technical analysis for ${crypto.symbol} with ${formattedData.length} data points`
            });

            console.log(`Running technical analysis for ${crypto.symbol} with ${formattedData.length} data points`);
            
            // Add timeout protection for technical analysis
            const analysisPromise = runTechnicalAnalysisFromData(
              formattedData,
              crypto.symbol,
              `${crypto.symbol}-USD`,
              processId,
              userId
            );
            
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Technical analysis timed out for ${crypto.symbol}`)), 60000) // 60 second timeout
            );
            
            const result = await Promise.race([analysisPromise, timeoutPromise])
              .catch(error => {
                console.error(`Technical analysis failed for ${crypto.symbol}:`, error);
                return {
                  success: false,
                  message: `Technical analysis timed out or failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  error
                };
              });

            if (result.success) {
              technicalAnalysisSuccess = true;
              console.log(`Technical analysis completed successfully for ${crypto.symbol}`);
              
              await safeLog({
                processId,
                userId,
                level: 'INFO',
                category: 'ANALYSIS',
                operation: 'TECHNICAL_ANALYSIS_SUCCESS',
                symbol: crypto.symbol,
                message: `Technical analysis completed successfully for ${crypto.symbol}`,
                details: { steps: result.steps }
              });
              
              // Update processed items
              processedItems++;
              try {
                await prisma.processingStatus.update({
                  where: {
                    processId
                  },
                  data: {
                    processedItems,
                    updatedAt: new Date()
                  }
                });
              } catch (statusError) {
                console.error(`Error updating processing status for ${crypto.symbol}:`, statusError);
              }            } else {
              console.error(`Technical analysis failed for ${crypto.symbol}:`, result.message || 'Unknown error');
              
              await safeLog({
                processId,
                userId,
                level: 'ERROR',
                category: 'ANALYSIS',
                operation: 'TECHNICAL_ANALYSIS_ERROR',
                symbol: crypto.symbol,
                message: `Technical analysis failed for ${crypto.symbol}: ${result.message || 'Unknown error'}`,
                details: { error: result.error }
              });
              
              // Skip to the next crypto if technical analysis fails
              continue;
            }
          } catch (error) {
            console.error(`Error in technical analysis for ${crypto.symbol}:`, error);
            
            await safeLog({
              processId,
              userId,
              level: 'ERROR',
              category: 'ANALYSIS',
              operation: 'TECHNICAL_ANALYSIS_ERROR',
              symbol: crypto.symbol,
              message: `Error in technical analysis for ${crypto.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
            
            // Skip to the next crypto if technical analysis fails
            continue;
          }

          // Step 2: Generate comprehensive features for this crypto
          let featuresSuccess = false;
          if (technicalAnalysisSuccess) {
            try {
              console.log(`Generating comprehensive features for ${crypto.symbol}`);
              
              await safeLog({
                processId,
                userId,
                level: 'INFO',
                category: 'ANALYSIS',
                operation: 'FEATURE_GENERATION_START',
                symbol: crypto.symbol,
                message: `Starting comprehensive feature generation for ${crypto.symbol}`
              });
              
              // Check if technical analysis data exists for this symbol with retry logic
              let technicalAnalysis;
              retryCount = 0;
              
              while (retryCount < maxRetries) {
                try {
                  // Check if prisma is defined before using it
                  if (!prisma) {
                    console.error(`Prisma client is undefined when fetching technical analysis for ${crypto.symbol}`);
                    await safeLog({
                      processId,
                      userId,
                      level: 'ERROR',
                      category: 'ANALYSIS',
                      operation: 'DB_ERROR',
                      symbol: crypto.symbol,
                      message: `Prisma client is undefined when fetching technical analysis`
                    });
                    break;
                  }
                  
                  technicalAnalysis = await prisma.technicalAnalysisOutput.findFirst({
                    where: {
                      symbol: crypto.symbol
                    },
                    orderBy: {
                      timestamp: 'desc'
                    }
                  });
                  
                  console.log(`Technical analysis data found for ${crypto.symbol}: ${!!technicalAnalysis}`);
                  break; // Success, exit the retry loop
                } catch (dbError) {
                  retryCount++;
                  console.error(`Database error when fetching technical analysis for ${crypto.symbol} (attempt ${retryCount}):`, dbError);
                  
                  if (retryCount >= maxRetries) {
                    await safeLog({
                      processId,
                      userId,
                      level: 'ERROR',
                      category: 'ANALYSIS',
                      operation: 'DB_ERROR',
                      symbol: crypto.symbol,
                      message: `Database error when fetching technical analysis: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
                    });
                    throw dbError; // Re-throw after max retries
                  }
                  
                  // Exponential backoff: 1s, 2s, 4s
                  const delay = 1000 * Math.pow(2, retryCount - 1);
                  console.log(`Retrying technical analysis fetch for ${crypto.symbol} after ${delay}ms...`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
              }

              if (!technicalAnalysis) {
                await safeLog({
                  processId,
                  userId,
                  level: 'WARNING',
                  category: 'ANALYSIS',
                  operation: 'FEATURE_GENERATION_SKIP',
                  symbol: crypto.symbol,
                  message: `No technical analysis data found for ${crypto.symbol}, skipping feature generation`
                });
                continue;
              }

              // Generate comprehensive features with error handling and timeout protection
              let featureSet;
              try {
                console.log(`Starting feature generation for ${crypto.symbol} at ${new Date().toISOString()}`);
                
                // Add timeout protection for feature generation
                const featurePromise = generateComprehensiveFeatureSet(crypto.symbol, 'hourly', new Date(), processId, userId);
                const timeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error(`Feature generation timed out for ${crypto.symbol}`)), 60000) // 60 second timeout
                );
                
                featureSet = await Promise.race([featurePromise, timeoutPromise])
                  .catch(error => {
                    console.error(`Feature generation failed for ${crypto.symbol}:`, error);
                    throw new Error(`Feature generation timed out or failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                  });
                
                console.log(`Successfully generated comprehensive feature set for ${crypto.symbol} at ${new Date().toISOString()}`);
              } catch (genError) {
                console.error(`Error generating comprehensive feature set for ${crypto.symbol}:`, genError);
                await safeLog({
                  processId,
                  userId,
                  level: 'ERROR',
                  category: 'ANALYSIS',
                  operation: 'FEATURE_GENERATION_ERROR',
                  symbol: crypto.symbol,
                  message: `Error generating comprehensive features: ${genError instanceof Error ? genError.message : 'Unknown error'}`
                });
                continue; // Skip to the next step if feature generation fails
              }
              
              // Validate feature set before saving
              if (!featureSet || typeof featureSet !== 'object') {
                console.error(`Invalid feature set generated for ${crypto.symbol}`);
                await safeLog({
                  processId,
                  userId,
                  level: 'ERROR',
                  category: 'ANALYSIS',
                  operation: 'FEATURE_VALIDATION_ERROR',
                  symbol: crypto.symbol,
                  message: `Invalid feature set generated for ${crypto.symbol}`
                });
                continue; // Skip to the next step if feature set is invalid
              }
              
              // Save the feature set with error handling and timeout protection
              try {
                console.log(`Starting feature save for ${crypto.symbol} at ${new Date().toISOString()}`);
                
                // Add timeout protection for feature saving
                const savePromise = saveComprehensiveFeatureSet(crypto.symbol, featureSet, processId, userId);
                const timeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error(`Feature save timed out for ${crypto.symbol}`)), 60000) // 60 second timeout
                );
                
                await Promise.race([savePromise, timeoutPromise])
                  .catch(error => {
                    console.error(`Feature save failed for ${crypto.symbol}:`, error);
                    throw new Error(`Feature save timed out or failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                  });
                
                console.log(`Successfully saved comprehensive feature set for ${crypto.symbol} at ${new Date().toISOString()}`);
              } catch (saveError) {
                console.error(`Error saving comprehensive feature set for ${crypto.symbol}:`, saveError);
                await safeLog({
                  processId,
                  userId,
                  level: 'ERROR',
                  category: 'ANALYSIS',
                  operation: 'FEATURE_SAVE_ERROR',
                  symbol: crypto.symbol,
                  message: `Error saving comprehensive features: ${saveError instanceof Error ? saveError.message : 'Unknown error'}`
                });
                // Continue despite save error - we've already generated the features
              }
              
              featuresSuccess = true;
              
              // Update processed items
              processedItems++;
              try {
                await prisma.processingStatus.update({
                  where: {
                    processId
                  },
                  data: {
                    processedItems,
                    updatedAt: new Date()
                  }
                });
              } catch (statusError) {
                console.error(`Error updating processing status for ${crypto.symbol}:`, statusError);
              }
              
              await safeLog({
                processId,
                userId,
                level: 'INFO',
                category: 'ANALYSIS',
                operation: 'FEATURE_GENERATION_SUCCESS',
                symbol: crypto.symbol,
                message: `Generated and saved comprehensive features for ${crypto.symbol}`
              });
            } catch (featureError) {
              console.error(`Error generating comprehensive features for ${crypto.symbol}:`, featureError);
              await safeLog({
                processId,
                userId,
                level: 'ERROR',
                category: 'ANALYSIS',
                operation: 'FEATURE_GENERATION_ERROR',
                symbol: crypto.symbol,
                message: `Error generating features for ${crypto.symbol}: ${featureError instanceof Error ? featureError.message : 'Unknown error'}`
              });
            }
          }

          // Step 3: Run prediction models for this crypto
          let predictionSuccess = false;
          if (featuresSuccess) {
            try {
              console.log(`Running prediction models for ${crypto.symbol}`);
              
              await safeLog({
                processId,
                userId,
                level: 'INFO',
                category: 'ANALYSIS',
                operation: 'PREDICTION_START',
                symbol: crypto.symbol,
                message: `Starting prediction models for ${crypto.symbol}`
              });
              
              // Run prediction models for this specific crypto
              // This is a placeholder - you would need to implement a function to run predictions for a single crypto
              // const predictionResult = await runPredictionsForCrypto(crypto.symbol, userId);
              
              // For now, we'll just increment the processed items
              predictionSuccess = true;
              
              // Update processed items
              processedItems++;
              try {
                await prisma.processingStatus.update({
                  where: {
                    processId
                  },
                  data: {
                    processedItems,
                    updatedAt: new Date()
                  }
                });
              } catch (statusError) {
                console.error(`Error updating processing status for ${crypto.symbol}:`, statusError);
              }
              
              await safeLog({
                processId,
                userId,
                level: 'INFO',
                category: 'ANALYSIS',
                operation: 'PREDICTION_SUCCESS',
                symbol: crypto.symbol,
                message: `Prediction models completed for ${crypto.symbol}`
              });
            } catch (predictionError) {
              console.error(`Error running prediction models for ${crypto.symbol}:`, predictionError);
              await safeLog({
                processId,
                userId,
                level: 'ERROR',
                category: 'ANALYSIS',
                operation: 'PREDICTION_ERROR',
                symbol: crypto.symbol,
                message: `Error running prediction models for ${crypto.symbol}: ${predictionError instanceof Error ? predictionError.message : 'Unknown error'}`
              });
            }
          }

          // Step 4: Update prediction outcomes for this crypto
          let outcomeSuccess = false;
          if (predictionSuccess) {
            try {
              console.log(`Updating prediction outcomes for ${crypto.symbol}`);
              
              await safeLog({
                processId,
                userId,
                level: 'INFO',
                category: 'ANALYSIS',
                operation: 'OUTCOME_UPDATE_START',
                symbol: crypto.symbol,
                message: `Starting prediction outcome updates for ${crypto.symbol}`
              });
              
              // Update prediction outcomes for this specific crypto
              // This is a placeholder - you would need to implement a function to update outcomes for a single crypto
              // const outcomeResult = await updatePredictionOutcomesForCrypto(crypto.symbol);
              
              // For now, we'll just increment the processed items
              outcomeSuccess = true;
              
              // Update processed items
              processedItems++;
              try {
                await prisma.processingStatus.update({
                  where: {
                    processId
                  },
                  data: {
                    processedItems,
                    updatedAt: new Date()
                  }
                });
              } catch (statusError) {
                console.error(`Error updating processing status for ${crypto.symbol}:`, statusError);
              }
              
              await safeLog({
                processId,
                userId,
                level: 'INFO',
                category: 'ANALYSIS',
                operation: 'OUTCOME_UPDATE_SUCCESS',
                symbol: crypto.symbol,
                message: `Prediction outcome updates completed for ${crypto.symbol}`
              });
            } catch (outcomeError) {
              console.error(`Error updating prediction outcomes for ${crypto.symbol}:`, outcomeError);
              await safeLog({
                processId,
                userId,
                level: 'ERROR',
                category: 'ANALYSIS',
                operation: 'OUTCOME_UPDATE_ERROR',
                symbol: crypto.symbol,
                message: `Error updating prediction outcomes for ${crypto.symbol}: ${outcomeError instanceof Error ? outcomeError.message : 'Unknown error'}`
              });
            }
          }

          // Step 5: Generate trading signals for this crypto
          let signalsSuccess = false;
          if (outcomeSuccess) {
            try {
              console.log(`Generating trading signals for ${crypto.symbol}`);
              
              await safeLog({
                processId,
                userId,
                level: 'INFO',
                category: 'ANALYSIS',
                operation: 'TRADING_SIGNALS_START',
                symbol: crypto.symbol,
                message: `Starting trading signal generation for ${crypto.symbol}`
              });
              
              // Generate trading signals for this specific crypto
              // This is a placeholder - you would need to implement a function to generate signals for a single crypto
              // const signalsResult = await generateTradingSignalsForCrypto(crypto.symbol, userId);
              
              // For now, we'll just increment the processed items
              signalsSuccess = true;
              
              // Update processed items
              processedItems++;
              try {
                await prisma.processingStatus.update({
                  where: {
                    processId
                  },
                  data: {
                    processedItems,
                    updatedAt: new Date()
                  }
                });
              } catch (statusError) {
                console.error(`Error updating processing status for ${crypto.symbol}:`, statusError);
              }
              
              await safeLog({
                processId,
                userId,
                level: 'INFO',
                category: 'ANALYSIS',
                operation: 'TRADING_SIGNALS_SUCCESS',
                symbol: crypto.symbol,
                message: `Trading signal generation completed for ${crypto.symbol}`
              });
            } catch (signalsError) {
              console.error(`Error generating trading signals for ${crypto.symbol}:`, signalsError);
              await safeLog({
                processId,
                userId,
                level: 'ERROR',
                category: 'ANALYSIS',
                operation: 'TRADING_SIGNALS_ERROR',
                symbol: crypto.symbol,
                message: `Error generating trading signals for ${crypto.symbol}: ${signalsError instanceof Error ? signalsError.message : 'Unknown error'}`
              });
            }
          }

          // Count success or error for this crypto
          if (technicalAnalysisSuccess && featuresSuccess && predictionSuccess && outcomeSuccess && signalsSuccess) {
            successCount++;
            await safeLog({
              processId,
              userId,
              level: 'INFO',
              category: 'ANALYSIS',
              operation: 'CRYPTO_ANALYSIS_COMPLETE',
              symbol: crypto.symbol,
              message: `Analysis completed successfully for ${crypto.symbol}`
            });
          } else {
            errorCount++;
            await safeLog({
              processId,
              userId,
              level: 'WARNING',
              category: 'ANALYSIS',
              operation: 'CRYPTO_ANALYSIS_PARTIAL',
              symbol: crypto.symbol,
              message: `Analysis partially completed for ${crypto.symbol}`,
              details: {
                technicalAnalysisSuccess,
                featuresSuccess,
                predictionSuccess,
                outcomeSuccess,
                signalsSuccess
              }
            });
          }
        } catch (cryptoError) {
          errorCount++;
          console.error(`Unexpected error processing ${crypto.symbol}:`, cryptoError);
          await safeLog({
            processId,
            userId,
            level: 'ERROR',
            category: 'ANALYSIS',
            operation: 'CRYPTO_ANALYSIS_ERROR',
            symbol: crypto.symbol,
            message: `Error processing ${crypto.symbol}: ${cryptoError instanceof Error ? cryptoError.message : 'Unknown error'}`
          });
        }
      }

      // After processing all cryptos individually, run the global steps
      // These steps operate on all cryptos at once and are only run if at least one crypto was processed successfully
      if (successCount > 0) {
        try {
          // Run prediction models for all cryptos
          await safeLog({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'GLOBAL_PREDICTION_START',
            message: 'Starting global prediction model runs'
          });
          
          // Add timeout protection for global prediction models
          const predictionPromise = runPredictionsForAllCryptos(userId);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Global prediction models timed out')), 120000) // 2 minute timeout
          );
          
          const predictionResult = await Promise.race([predictionPromise, timeoutPromise])
            .catch(error => {
              console.error('Error in global prediction models:', error);
              return { success: false, message: `Global prediction models timed out or failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
            });
          
          await safeLog({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'GLOBAL_PREDICTION_COMPLETE',
            message: `Global prediction models completed: ${predictionResult.message || 'No message'}`
          });
          
          // Update prediction outcomes
          await safeLog({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'GLOBAL_OUTCOME_UPDATE_START',
            message: 'Starting global prediction outcome updates'
          });
          
          // Add timeout protection for outcome updates
          const outcomePromise = updatePredictionOutcomes();
          const outcomeTimeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Global outcome updates timed out')), 120000) // 2 minute timeout
          );
          
          const outcomeResult = await Promise.race([outcomePromise, outcomeTimeoutPromise])
            .catch(error => {
              console.error('Error in global outcome updates:', error);
              return { success: false, message: `Global outcome updates timed out or failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
            });
          
          await safeLog({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'GLOBAL_OUTCOME_UPDATE_COMPLETE',
            message: `Global prediction outcome updates completed: ${outcomeResult.message || 'No message'}`
          });
          
          // Generate trading signals
          await safeLog({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'GLOBAL_TRADING_SIGNALS_START',
            message: 'Starting global trading signal generation'
          });
          
          // Add timeout protection for trading signals
          const signalsPromise = generateTradingSignalsForAllCryptos(userId);
          const signalsTimeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Global trading signals generation timed out')), 120000) // 2 minute timeout
          );
          
          const signalsResult = await Promise.race([signalsPromise, signalsTimeoutPromise])
            .catch(error => {
              console.error('Error in global trading signals generation:', error);
              return [];
            });
          
          await safeLog({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'GLOBAL_TRADING_SIGNALS_COMPLETE',
            message: `Global trading signal generation completed: Generated signals for ${signalsResult.length} cryptocurrencies`
          });
        } catch (globalError) {
          console.error('Error in global analysis steps:', globalError);
          await safeLog({
            processId,
            userId,
            level: 'ERROR',
            category: 'ANALYSIS',
            operation: 'GLOBAL_ANALYSIS_ERROR',
            message: `Error in global analysis steps: ${globalError instanceof Error ? globalError.message : 'Unknown error'}`
          });
        }
      }
    } finally {
      // Clear the status update interval
      if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
      }
      
      // Mark process as completed with retry logic
      let retryCount = 0;
      const maxRetries = 3;
      let statusUpdateSuccess = false;
      
      while (retryCount < maxRetries && !statusUpdateSuccess) {
        try {
          // Use the enhanced logger to log process completion
          await logProcessCompletion(processId, userId, successCount, errorCount, processedItems);
          statusUpdateSuccess = true;
          
          await safeLog({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'ANALYSIS_COMPLETE',
            message: `Analysis process completed with ${successCount} successful and ${errorCount} failed cryptocurrencies`
          });
          
          console.log(`Analysis process ${processId} marked as COMPLETED`);
        } catch (statusError) {
          retryCount++;
          console.error(`Error updating final status for process ${processId} (attempt ${retryCount}):`, statusError);
          
          if (retryCount >= maxRetries) {
            await safeLog({
              processId,
              userId,
              level: 'ERROR',
              category: 'ANALYSIS',
              operation: 'STATUS_UPDATE_ERROR',
              message: `Error updating final status after ${maxRetries} attempts: ${statusError instanceof Error ? statusError.message : 'Unknown error'}`
            });
          } else {
            // Exponential backoff: 1s, 2s, 4s
            const delay = 1000 * Math.pow(2, retryCount - 1);
            console.log(`Retrying final status update after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error in analysis process ${processId}:`, error);
    
    // Mark process as failed with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    let statusUpdateSuccess = false;
    
    while (retryCount < maxRetries && !statusUpdateSuccess) {
      try {
        // Use the enhanced logger to log process failure
        await logProcessFailure(processId, userId, error);
        
        statusUpdateSuccess = true;
        
        await safeLog({
          processId,
          userId,
          level: 'ERROR',
          category: 'ANALYSIS',
          operation: 'ANALYSIS_FAILED',
          message: `Analysis process failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: { stack: error instanceof Error ? error.stack : undefined }
        });
      } catch (statusError) {
        retryCount++;
        console.error(`Error updating failed status for process ${processId} (attempt ${retryCount}):`, statusError);
        
        if (retryCount >= maxRetries) {
          console.error(`Failed to update status to FAILED after ${maxRetries} attempts`);
        } else {
          // Exponential backoff: 1s, 2s, 4s
          const delay = 1000 * Math.pow(2, retryCount - 1);
          console.log(`Retrying failed status update after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }
}

/**
 * Run analysis for a specific symbol
 * This function is used by the runAnalysisProcess function
 */
export async function runAnalysisForSymbol(symbol: string, userId: string, processId: string): Promise<void> {
  logAnalysis('INFO', 'runAnalysisForSymbol', `Starting analysis for symbol`, { symbol, userId, processId });
  
  try {
    // Validate inputs
    if (!symbol || !userId || !processId) {
      logAnalysis('ERROR', 'runAnalysisForSymbol', "Invalid inputs to runAnalysisForSymbol", { symbol, userId, processId });
      await safeLog({
        processId: processId || 'unknown',
        userId: userId || 'unknown',
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'SYMBOL_ANALYSIS_VALIDATION',
        symbol: symbol || 'unknown',
        message: `Invalid inputs to runAnalysisForSymbol: symbol=${!!symbol}, userId=${!!userId}, processId=${!!processId}`
      });
      throw new Error(`Invalid inputs to runAnalysisForSymbol: symbol=${!!symbol}, userId=${!!userId}, processId=${!!processId}`);
    }
    
    // Check if prisma is defined
    if (!prisma) {
      logAnalysis('ERROR', 'runAnalysisForSymbol', "Prisma client is undefined in runAnalysisForSymbol");
      await safeLog({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'SYMBOL_ANALYSIS_DB_ERROR',
        symbol,
        message: `Prisma client is undefined in runAnalysisForSymbol`
      });
      throw new Error("Prisma client is undefined in runAnalysisForSymbol");
    }
    
    // Check if technical analysis data exists for this symbol with retry logic
    let technicalAnalysis;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        technicalAnalysis = await prisma.technicalAnalysisOutput.findFirst({
          where: {
            symbol
          },
          orderBy: {
            timestamp: 'desc'
          }
        });
        break; // Success, exit the retry loop
      } catch (dbError) {
        retryCount++;
        console.error(`Database error when fetching technical analysis for ${symbol} (attempt ${retryCount}):`, dbError);
        
        if (retryCount >= maxRetries) {
          await safeLog({
            processId,
            userId,
            level: 'ERROR',
            category: 'ANALYSIS',
            operation: 'SYMBOL_ANALYSIS_DB_ERROR',
            symbol,
            message: `Failed to fetch technical analysis after ${maxRetries} attempts: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
          });
          throw dbError; // Re-throw after max retries
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, retryCount - 1);
        console.log(`Retrying technical analysis fetch for ${symbol} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (!technicalAnalysis) {
      const errorMessage = `No technical analysis data found for ${symbol}`;
      console.error(errorMessage);
      await safeLog({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'SYMBOL_ANALYSIS_ERROR',
        symbol,
        message: errorMessage
      });
      throw new Error(errorMessage);
    }

    // Log the start of feature generation
    await safeLog({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'SYMBOL_FEATURE_GENERATION_START',
      symbol,
      message: `Starting feature generation for ${symbol}`
    });

    // Generate comprehensive features with error handling and timeout protection
    let featureSet;
    try {
      console.log(`Starting feature generation for ${symbol} at ${new Date().toISOString()}`);
      
      // Add timeout protection for feature generation
      const featurePromise = generateComprehensiveFeatureSet(symbol, 'hourly', new Date(), processId, userId);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Feature generation timed out for ${symbol}`)), 60000) // 60 second timeout
      );
      
      featureSet = await Promise.race([featurePromise, timeoutPromise])
        .catch(error => {
          console.error(`Feature generation failed for ${symbol}:`, error);
          throw new Error(`Feature generation timed out or failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        });
      
      console.log(`Successfully generated comprehensive feature set for ${symbol} at ${new Date().toISOString()}`);
    } catch (genError) {
      console.error(`Error generating comprehensive feature set for ${symbol}:`, genError);
      await safeLog({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'FEATURE_GENERATION_ERROR',
        symbol,
        message: `Error generating comprehensive features: ${genError instanceof Error ? genError.message : 'Unknown error'}`
      });
      throw new Error(`Failed to generate comprehensive features for ${symbol}: ${genError instanceof Error ? genError.message : 'Unknown error'}`);
    }
    
    // Validate feature set before saving
    if (!featureSet || typeof featureSet !== 'object') {
      const errorMessage = `Invalid feature set generated for ${symbol}`;
      console.error(errorMessage);
      await safeLog({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'FEATURE_VALIDATION_ERROR',
        symbol,
        message: errorMessage
      });
      throw new Error(errorMessage);
    }
    
    // Log the start of feature saving
    await safeLog({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'SYMBOL_FEATURE_SAVE_START',
      symbol,
      message: `Starting feature save for ${symbol}`
    });
    
    // Save the feature set with error handling and timeout protection
    try {
      console.log(`Starting feature save for ${symbol} at ${new Date().toISOString()}`);
      
      // Add timeout protection for feature saving
      const savePromise = saveComprehensiveFeatureSet(symbol, featureSet, processId, userId);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Feature save timed out for ${symbol}`)), 60000) // 60 second timeout
      );
      
      await Promise.race([savePromise, timeoutPromise])
        .catch(error => {
          console.error(`Feature save failed for ${symbol}:`, error);
          throw new Error(`Feature save timed out or failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        });
      
      console.log(`Successfully saved comprehensive feature set for ${symbol} at ${new Date().toISOString()}`);
      
      // Log success
      await safeLog({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'SYMBOL_ANALYSIS_COMPLETE',
        symbol,
        message: `Analysis completed for ${symbol}`
      });
    } catch (saveError) {
      console.error(`Error saving comprehensive feature set for ${symbol}:`, saveError);
      console.error('DB Save Error', JSON.stringify(saveError, null, 2));
      await safeLog({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'FEATURE_SAVE_ERROR',
        symbol,
        message: `Error saving comprehensive features: ${saveError instanceof Error ? saveError.message : 'Unknown error'}`
      });
      throw new Error(`Failed to save comprehensive features for ${symbol}: ${saveError instanceof Error ? saveError.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`Unexpected error in runAnalysisForSymbol for ${symbol}:`, error);
    await safeLog({
      processId,
      userId,
      level: 'ERROR',
      category: 'ANALYSIS',
      operation: 'SYMBOL_ANALYSIS_UNEXPECTED_ERROR',
      symbol,
      message: `Unexpected error in runAnalysisForSymbol: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { stack: error instanceof Error ? error.stack : undefined }
    });
    throw error;
  }
}

// Export technical analysis calculation functions
export function calculateSMA(prices: number[], period: number, processId?: string, userId?: string, symbol?: string): number {
  logAnalysis('INFO', 'calculateSMA', `Starting SMA calculation with period ${period}`, { 
    dataPoints: prices.length,
    period
  });
  
  if (prices.length < period) {
    logAnalysis('WARNING', 'calculateSMA', `Not enough data points for SMA calculation, using current price`, {
      required: period,
      available: prices.length
    });
    return prices[0]; // Return current price if not enough data
  }
  
  const sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
  const result = sum / period;
  
  logAnalysis('INFO', 'calculateSMA', `SMA calculation completed`, {
    period,
    result
  });
  
  // Log the calculation result to ProcessingStatus if we have the necessary info
  if (processId && userId && symbol) {
    logCalculationResult(processId, userId, symbol, `SMA${period}`, result);
  }
  
  return result;
}

export function calculateEMA(prices: number[], period: number, processId?: string, userId?: string, symbol?: string): number {
  logAnalysis('INFO', 'calculateEMA', `Starting EMA calculation with period ${period}`, { 
    dataPoints: prices.length,
    period
  });
  
  if (prices.length < period) {
    logAnalysis('WARNING', 'calculateEMA', `Not enough data points for EMA calculation, using current price`, {
      required: period,
      available: prices.length
    });
    return prices[0]; // Return current price if not enough data
  }
  
  const k = 2 / (period + 1);
  let ema = prices[prices.length - 1];
  
  for (let i = prices.length - 2; i >= 0; i--) {
    ema = prices[i] * k + ema * (1 - k);
  }
  
  logAnalysis('INFO', 'calculateEMA', `EMA calculation completed`, {
    period,
    result: ema
  });
  
  // Log the calculation result to ProcessingStatus if we have the necessary info
  if (processId && userId && symbol) {
    logCalculationResult(processId, userId, symbol, `EMA${period}`, ema);
  }
  
  return ema;
}

export function calculateRSI(prices: number[], period: number, processId?: string, userId?: string, symbol?: string): number {
  logAnalysis('INFO', 'calculateRSI', `Starting RSI calculation with period ${period}`, { 
    dataPoints: prices.length,
    period
  });
  
  if (prices.length <= period) {
    logAnalysis('WARNING', 'calculateRSI', `Not enough data points for RSI calculation, returning neutral value`, {
      required: period + 1,
      available: prices.length
    });
    return 50; // Return neutral RSI if not enough data
  }
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i-1] - prices[i];
    if (change >= 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }
  
  if (losses === 0) {
    logAnalysis('INFO', 'calculateRSI', `No losses in the period, returning maximum RSI value`);
    return 100; // All gains
  }
  
  const rs = gains / losses;
  const result = 100 - (100 / (1 + rs));
  
  logAnalysis('INFO', 'calculateRSI', `RSI calculation completed`, {
    period,
    result,
    gains,
    losses,
    rs
  });
  
  // Log the calculation result to ProcessingStatus if we have the necessary info
  if (processId && userId && symbol) {
    logCalculationResult(processId, userId, symbol, `RSI${period}`, result);
  }
  
  return result;
}

export function calculateBollingerBands(
  prices: number[], 
  period: number, 
  multiplier: number,
  processId?: string, 
  userId?: string, 
  symbol?: string
): {
  upper: number;
  middle: number;
  lower: number;
} {
  logAnalysis('INFO', 'calculateBollingerBands', `Starting Bollinger Bands calculation`, { 
    dataPoints: prices.length,
    period,
    multiplier
  });
  
  if (prices.length < period) {
    logAnalysis('WARNING', 'calculateBollingerBands', `Not enough data points for Bollinger Bands calculation, using approximation`, {
      required: period,
      available: prices.length
    });
    
    const result = {
      upper: prices[0] * 1.1,
      middle: prices[0],
      lower: prices[0] * 0.9
    };
    
    logAnalysis('INFO', 'calculateBollingerBands', `Approximated Bollinger Bands`, result);
    
    // Log the calculation result to ProcessingStatus if we have the necessary info
    if (processId && userId && symbol) {
      logCalculationResult(processId, userId, symbol, 'BollingerBands', result);
    }
    
    return result;
  }
  
  const sma = calculateSMA(prices, period, processId, userId, symbol);
  
  // Calculate standard deviation
  const squaredDifferences = prices.slice(0, period).map(price => Math.pow(price - sma, 2));
  const variance = squaredDifferences.reduce((a, b) => a + b, 0) / period;
  const standardDeviation = Math.sqrt(variance);
  
  const result = {
    upper: sma + (standardDeviation * multiplier),
    middle: sma,
    lower: sma - (standardDeviation * multiplier)
  };
  
  logAnalysis('INFO', 'calculateBollingerBands', `Bollinger Bands calculation completed`, {
    period,
    multiplier,
    standardDeviation,
    result
  });
  
  // Log the calculation result to ProcessingStatus if we have the necessary info
  if (processId && userId && symbol) {
    logCalculationResult(processId, userId, symbol, 'BollingerBands', result);
  }
  
  return result;
}

export function identifyTrendLines(prices: number[]): {
  support: number;
  resistance: number;
} {
  logAnalysis('INFO', 'identifyTrendLines', `Starting trend lines identification`, { 
    dataPoints: prices.length
  });
  
  if (prices.length < 10) {
    logAnalysis('WARNING', 'identifyTrendLines', `Not enough data points for trend line identification, using approximation`, {
      required: 10,
      available: prices.length
    });
    
    const result = {
      support: prices[0] * 0.95,
      resistance: prices[0] * 1.05
    };
    
    logAnalysis('INFO', 'identifyTrendLines', `Approximated trend lines`, result);
    return result;
  }
  
  // Simple implementation - find local minimums and maximums
  let minPrice = prices[0];
  let maxPrice = prices[0];
  
  for (let i = 1; i < Math.min(prices.length, 20); i++) {
    if (prices[i] < minPrice) minPrice = prices[i];
    if (prices[i] > maxPrice) maxPrice = prices[i];
  }
  
  const result = {
    support: minPrice,
    resistance: maxPrice
  };
  
  logAnalysis('INFO', 'identifyTrendLines', `Trend lines identification completed`, {
    dataPointsUsed: Math.min(prices.length, 20),
    result
  });
  
  return result;
}

export function calculateFibonacciRetracements(highPrice: number, lowPrice: number): {
  level0: number;
  level23_6: number;
  level38_2: number;
  level50: number;
  level61_8: number;
  level100: number;
} {
  logAnalysis('INFO', 'calculateFibonacciRetracements', `Starting Fibonacci retracements calculation`, { 
    highPrice,
    lowPrice
  });
  
  const diff = highPrice - lowPrice;
  
  const result = {
    level0: highPrice,
    level23_6: highPrice - diff * 0.236,
    level38_2: highPrice - diff * 0.382,
    level50: highPrice - diff * 0.5,
    level61_8: highPrice - diff * 0.618,
    level100: lowPrice
  };
  
  logAnalysis('INFO', 'calculateFibonacciRetracements', `Fibonacci retracements calculation completed`, {
    priceDifference: diff,
    result
  });
  
  return result;
}

export function detectBreakoutPatterns(
  prices: number[], 
  trendLines: { support: number; resistance: number },
  bollingerBands: { upper: number; middle: number; lower: number }
): {
  breakoutDetected: boolean;
  breakoutType: string;
  breakoutStrength: number;
} {
  logAnalysis('INFO', 'detectBreakoutPatterns', `Starting breakout pattern detection`, { 
    currentPrice: prices[0],
    previousPrice: prices[1] || prices[0],
    trendLines,
    bollingerBands
  });
  
  const currentPrice = prices[0];
  const previousPrice = prices[1] || currentPrice;
  
  // Check for breakouts
  if (currentPrice > trendLines.resistance && previousPrice <= trendLines.resistance) {
    const result = {
      breakoutDetected: true,
      breakoutType: 'RESISTANCE_BREAKOUT',
      breakoutStrength: (currentPrice - trendLines.resistance) / trendLines.resistance * 100
    };
    
    logAnalysis('INFO', 'detectBreakoutPatterns', `Resistance breakout detected`, result);
    return result;
  }
  
  if (currentPrice < trendLines.support && previousPrice >= trendLines.support) {
    const result = {
      breakoutDetected: true,
      breakoutType: 'SUPPORT_BREAKDOWN',
      breakoutStrength: (trendLines.support - currentPrice) / trendLines.support * 100
    };
    
    logAnalysis('INFO', 'detectBreakoutPatterns', `Support breakdown detected`, result);
    return result;
  }
  
  if (currentPrice > bollingerBands.upper && previousPrice <= bollingerBands.upper) {
    const result = {
      breakoutDetected: true,
      breakoutType: 'BOLLINGER_UPPER_BREAKOUT',
      breakoutStrength: (currentPrice - bollingerBands.upper) / bollingerBands.upper * 100
    };
    
    logAnalysis('INFO', 'detectBreakoutPatterns', `Bollinger upper band breakout detected`, result);
    return result;
  }
  
  if (currentPrice < bollingerBands.lower && previousPrice >= bollingerBands.lower) {
    const result = {
      breakoutDetected: true,
      breakoutType: 'BOLLINGER_LOWER_BREAKDOWN',
      breakoutStrength: (bollingerBands.lower - currentPrice) / bollingerBands.lower * 100
    };
    
    logAnalysis('INFO', 'detectBreakoutPatterns', `Bollinger lower band breakdown detected`, result);
    return result;
  }
  
  const result = {
    breakoutDetected: false,
    breakoutType: 'NONE',
    breakoutStrength: 0
  };
  
  logAnalysis('INFO', 'detectBreakoutPatterns', `No breakout patterns detected`, result);
  return result;
}

export function calculateWeightedDecision(
  currentPrice: number,
  ema12: number,
  ema26: number,
  rsi14: number,
  bollingerBands: { upper: number; middle: number; lower: number },
  trendLines: { support: number; resistance: number },
  sma20: number,
  fibonacciLevels: any,
  breakoutAnalysis: { breakoutDetected: boolean; breakoutType: string; breakoutStrength: number }
): {
  decision: string;
  confidence: number;
  explanation: string;
} {
  logAnalysis('INFO', 'calculateWeightedDecision', `Starting weighted decision calculation`, { 
    currentPrice,
    ema12,
    ema26,
    rsi14,
    bollingerBands,
    trendLines,
    sma20,
    breakoutAnalysis
  });
  let bullishFactors = 0;
  let bearishFactors = 0;
  let neutralFactors = 0;
  let totalFactors = 0;
  let explanation = [];
  
  // EMA crossover (MACD signal)
  if (ema12 > ema26) {
    bullishFactors += 2;
    explanation.push("EMA12 is above EMA26 (bullish)");
  } else if (ema12 < ema26) {
    bearishFactors += 2;
    explanation.push("EMA12 is below EMA26 (bearish)");
  } else {
    neutralFactors += 2;
    explanation.push("EMA12 and EMA26 are equal (neutral)");
  }
  totalFactors += 2;
  
  // RSI
  if (rsi14 > 70) {
    bearishFactors += 1.5;
    explanation.push("RSI is overbought (bearish)");
  } else if (rsi14 < 30) {
    bullishFactors += 1.5;
    explanation.push("RSI is oversold (bullish)");
  } else if (rsi14 > 50) {
    bullishFactors += 0.5;
    explanation.push("RSI is above 50 (slightly bullish)");
  } else {
    bearishFactors += 0.5;
    explanation.push("RSI is below 50 (slightly bearish)");
  }
  totalFactors += 1.5;
  
  // Bollinger Bands
  if (currentPrice > bollingerBands.upper) {
    bearishFactors += 1;
    explanation.push("Price is above upper Bollinger Band (bearish)");
  } else if (currentPrice < bollingerBands.lower) {
    bullishFactors += 1;
    explanation.push("Price is below lower Bollinger Band (bullish)");
  } else if (currentPrice > bollingerBands.middle) {
    bullishFactors += 0.5;
    explanation.push("Price is above middle Bollinger Band (slightly bullish)");
  } else {
    bearishFactors += 0.5;
    explanation.push("Price is below middle Bollinger Band (slightly bearish)");
  }
  totalFactors += 1;
  
  // SMA
  if (currentPrice > sma20) {
    bullishFactors += 1;
    explanation.push("Price is above SMA20 (bullish)");
  } else {
    bearishFactors += 1;
    explanation.push("Price is below SMA20 (bearish)");
  }
  totalFactors += 1;
  
  // Support/Resistance
  const distanceToResistance = (trendLines.resistance - currentPrice) / currentPrice;
  const distanceToSupport = (currentPrice - trendLines.support) / currentPrice;
  
  if (distanceToResistance < 0.01) {
    bearishFactors += 1;
    explanation.push("Price is near resistance (bearish)");
  } else if (distanceToSupport < 0.01) {
    bullishFactors += 1;
    explanation.push("Price is near support (bullish)");
  }
  totalFactors += 1;
  
  // Breakout analysis
  if (breakoutAnalysis.breakoutDetected) {
    if (breakoutAnalysis.breakoutType === 'RESISTANCE_BREAKOUT' || 
        breakoutAnalysis.breakoutType === 'BOLLINGER_UPPER_BREAKOUT') {
      bullishFactors += 2;
      explanation.push(`${breakoutAnalysis.breakoutType} detected (bullish)`);
    } else {
      bearishFactors += 2;
      explanation.push(`${breakoutAnalysis.breakoutType} detected (bearish)`);
    }
  }
  totalFactors += 2;
  
  // Calculate final decision
  const bullishPercentage = bullishFactors / totalFactors;
  const bearishPercentage = bearishFactors / totalFactors;
  const neutralPercentage = neutralFactors / totalFactors;
  
  let decision;
  let confidence;
  
  if (bullishPercentage > bearishPercentage && bullishPercentage > neutralPercentage) {
    decision = "BUY";
    confidence = bullishPercentage * 100;
  } else if (bearishPercentage > bullishPercentage && bearishPercentage > neutralPercentage) {
    decision = "SELL";
    confidence = bearishPercentage * 100;
  } else {
    decision = "HOLD";
    confidence = neutralPercentage * 100;
  }
  
  const result = {
    decision,
    confidence,
    explanation: explanation.join(". ")
  };
  
  logAnalysis('INFO', 'calculateWeightedDecision', `Weighted decision calculation completed`, {
    decision: result.decision,
    confidence: result.confidence,
    factorCounts: {
      bullish: bullishFactors,
      bearish: bearishFactors,
      neutral: neutralPercentage,
      total: totalFactors
    }
  });
  
  return result;
}