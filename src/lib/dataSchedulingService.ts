import prisma from '@/lib/prisma';
import { 
  calculateSMA, 
  calculateEMA, 
  calculateRSI, 
  calculateBollingerBands, 
  identifyTrendLines,
  calculateFibonacciRetracements,
  detectBreakoutPatterns,
  calculateWeightedDecision
} from '@/lib/analysisUtils';
import { calculateDerivedIndicators } from '@/lib/derivedIndicatorsUtils';
import { generateTemporalFeatures, saveTemporalFeatures } from '@/lib/temporalFeaturesUtils';
import { generatePatternEncodings, savePatternEncodings } from '@/lib/patternEncodingsUtils';
import { generateComprehensiveFeatureSet, saveComprehensiveFeatureSet } from '@/lib/comprehensiveFeatureUtils';
import { 
  logApiCall, 
  logDataProcessing, 
  logAnalysis, 
  logScheduling,
  createOperationTimer
} from '@/lib/schedulingLogger';

// Constants for batch processing
const BATCH_SIZE = 5; // Number of cryptos to process in parallel
const FETCH_TIMEOUT = 30000; // 30 seconds timeout for API fetch
const ANALYSIS_TIMEOUT = 60000; // 60 seconds timeout for analysis

/**
 * Helper function to fetch with timeout and logging
 */
async function fetchWithTimeout(
  url: string, 
  options: RequestInit, 
  timeout: number, 
  logParams?: { 
    processId: string; 
    userId: string; 
    symbol: string; 
  }
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  // Log the API request if logging params are provided
  if (logParams) {
    await logApiCall({
      processId: logParams.processId,
      userId: logParams.userId,
      symbol: logParams.symbol,
      url,
      method: options.method || 'GET',
      headers: options.headers,
      requestBody: options.body ? JSON.parse(options.body.toString()) : undefined
    });
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    
    // Log the API response if logging params are provided
    if (logParams) {
      let responseBody;
      try {
        // Clone the response to read the body without consuming it
        const clonedResponse = response.clone();
        responseBody = await clonedResponse.text();
        
        // Try to parse as JSON if possible
        try {
          responseBody = JSON.parse(responseBody);
        } catch (parseError) {
          // Keep as text if not valid JSON
        }
      } catch (bodyError) {
        responseBody = 'Could not read response body';
      }
      
      await logApiCall({
        processId: logParams.processId,
        userId: logParams.userId,
        symbol: logParams.symbol,
        url,
        method: options.method || 'GET',
        responseStatus: response.status,
        responseBody
      });
    }
    
    return response;
  } catch (error) {
    clearTimeout(id);
    
    // Log the API error if logging params are provided
    if (logParams) {
      await logApiCall({
        processId: logParams.processId,
        userId: logParams.userId,
        symbol: logParams.symbol,
        url,
        method: options.method || 'GET',
        error
      });
    }
    
    throw error;
  }
}

/**
 * Process a batch of cryptocurrencies in parallel
 * If runTechnicalAnalysis is true, it will also run the analysis
 * Otherwise, it will only fetch and store the data
 */
async function processCryptoBatch(
  userId: string,
  cryptoSymbols: string[],
  apiUrl: string,
  apiToken: string,
  limit: number = 24,
  runTechnicalAnalysis: boolean = false,
  processId?: string
): Promise<any[]> {
  // Create crypto objects from symbols
  const cryptos = cryptoSymbols.map(symbol => ({ symbol }));
  
  // Create settings object
  const settings = {
    apiUrl,
    apiToken,
    limit,
    runTechnicalAnalysis
  };
  
  // Log batch processing start
  if (processId) {
    await logScheduling({
      processId,
      userId,
      operation: 'BATCH_PROCESSING_START',
      message: `Starting batch processing for ${cryptoSymbols.length} cryptocurrencies`,
      details: { symbols: cryptoSymbols, settings: { ...settings, apiToken: '[REDACTED]' } }
    });
  }
  
  // Process each crypto in the batch concurrently
  return Promise.all(
    cryptos.map(async (crypto) => {
      // Create a timer for the entire crypto processing operation
      const cryptoTimer = processId ? createOperationTimer({
        processId,
        userId,
        level: 'INFO',
        category: 'DATA_PROCESSING',
        operation: 'PROCESS_CRYPTO',
        symbol: crypto.symbol,
        message: `Processing ${crypto.symbol}`
      }) : null;
      
      try {
        // Construct the URL with the instrument and limit parameters
        const instrument = `${crypto.symbol}-USD`;
        
        // Properly format the base URL
        let baseUrl = settings.apiUrl;
        
        // Remove trailing slash if present
        if (baseUrl.endsWith('/')) {
          baseUrl = baseUrl.slice(0, -1);
        }
        
        // Ensure the base URL has the correct path but no query parameters
        let basePath;
        if (baseUrl.includes('/index/cc/v1/historical/hours')) {
          // Extract just the base path without any query parameters
          const urlParts = baseUrl.split('?');
          basePath = urlParts[0];
        } else {
          // Add the path if it's not already in the base URL
          basePath = `${baseUrl}/index/cc/v1/historical/hours`;
        }
        
        // Construct the full URL with all parameters
        const url = `${basePath}?market=cadli&instrument=${instrument}&limit=${settings.limit}&aggregate=1&response_format=JSON`;
        
        console.log(`Fetching data for ${instrument} from ${url}`);
        
        if (processId) {
          await logDataProcessing({
            processId,
            userId,
            symbol: crypto.symbol,
            operation: 'API_FETCH_START',
            details: { instrument, url }
          });
        }

        // Fetch data from the configured API with timeout and logging
        const response = await fetchWithTimeout(
          url, 
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${settings.apiToken}`,
              'Content-Type': 'application/json',
            },
          }, 
          FETCH_TIMEOUT,
          processId ? { processId, userId, symbol: crypto.symbol } : undefined
        );

        if (!response.ok) {
          const errorText = await response.text();
          
          if (processId) {
            await logDataProcessing({
              processId,
              userId,
              symbol: crypto.symbol,
              operation: 'API_FETCH_ERROR',
              error: new Error(`API request failed with status ${response.status}`),
              details: { status: response.status, response: errorText }
            });
          }
          
          if (cryptoTimer) await cryptoTimer.end({ success: false, error: `API request failed with status ${response.status}` });
          
          return {
            symbol: crypto.symbol,
            success: false,
            message: `API request failed with status ${response.status}`,
            error: errorText,
          };
        }

        const data = await response.json();
        
        if (processId) {
          await logDataProcessing({
            processId,
            userId,
            symbol: crypto.symbol,
            operation: 'API_DATA_RECEIVED',
            count: data.Data?.length || 0,
            details: { dataPoints: data.Data?.length || 0 }
          });
        }

        // Check if the data has the expected format
        if (!data.Data || !Array.isArray(data.Data)) {
          if (processId) {
            await logDataProcessing({
              processId,
              userId,
              symbol: crypto.symbol,
              operation: 'DATA_FORMAT_ERROR',
              error: new Error('Invalid data format received from API'),
              details: { data }
            });
          }
          
          if (cryptoTimer) await cryptoTimer.end({ success: false, error: 'Invalid data format' });
          
          return {
            symbol: crypto.symbol,
            success: false,
            message: 'Invalid data format received from API',
            data,
          };
        }

        // Log data storage start
        if (processId) {
          await logDataProcessing({
            processId,
            userId,
            symbol: crypto.symbol,
            operation: 'DATA_STORAGE_START',
            count: data.Data.length,
            details: { dataPoints: data.Data.length }
          });
        }

        // Store the data in the database
        const savedData = await Promise.all(
          data.Data.map(async (entry) => {
            try {
              // Safely convert timestamp values to BigInt, with fallbacks for missing values
              const safelyConvertToBigInt = (value: any) => {
                if (value === undefined || value === null) {
                  return BigInt(0); // Default to 0 if value is missing
                }
                return BigInt(value);
              };
              
              return await prisma.hourlyCryptoHistoricalData.create({
                data: {
                  unit: entry.UNIT || 'HOUR',
                  timestamp: safelyConvertToBigInt(entry.TIMESTAMP),
                  type: entry.TYPE || 'PRICE',
                  market: entry.MARKET || 'CRYPTO',
                  instrument: entry.INSTRUMENT || `${crypto.symbol}-USD`,
                  open: entry.OPEN || 0,
                  high: entry.HIGH || 0,
                  low: entry.LOW || 0,
                  close: entry.CLOSE || 0,
                  firstMessageTimestamp: safelyConvertToBigInt(entry.FIRST_MESSAGE_TIMESTAMP),
                  lastMessageTimestamp: safelyConvertToBigInt(entry.LAST_MESSAGE_TIMESTAMP),
                  firstMessageValue: entry.FIRST_MESSAGE_VALUE || 0,
                  highMessageValue: entry.HIGH_MESSAGE_VALUE || 0,
                  highMessageTimestamp: safelyConvertToBigInt(entry.HIGH_MESSAGE_TIMESTAMP),
                  lowMessageValue: entry.LOW_MESSAGE_VALUE || 0,
                  lowMessageTimestamp: safelyConvertToBigInt(entry.LOW_MESSAGE_TIMESTAMP),
                  lastMessageValue: entry.LAST_MESSAGE_VALUE || 0,
                  totalIndexUpdates: entry.TOTAL_INDEX_UPDATES || 0,
                  volume: entry.VOLUME || 0,
                  quoteVolume: entry.QUOTE_VOLUME || 0,
                  volumeTopTier: entry.VOLUME_TOP_TIER || 0,
                  quoteVolumeTopTier: entry.QUOTE_VOLUME_TOP_TIER || 0,
                  volumeDirect: entry.VOLUME_DIRECT || 0,
                  quoteVolumeDirect: entry.QUOTE_VOLUME_DIRECT || 0,
                  volumeTopTierDirect: entry.VOLUME_TOP_TIER_DIRECT || 0,
                  quoteVolumeTopTierDirect: entry.QUOTE_VOLUME_TOP_TIER_DIRECT || 0,
                },
              });
            } catch (error) {
              console.error('Error saving hourly crypto data entry:', error);
              
              if (processId) {
                await logDataProcessing({
                  processId,
                  userId,
                  symbol: crypto.symbol,
                  operation: 'DATA_STORAGE_ERROR',
                  error,
                  details: { entry }
                });
              }
              
              return { error: 'Failed to save entry', entry };
            }
          })
        );
        
        // Log data storage completion
        if (processId) {
          await logDataProcessing({
            processId,
            userId,
            symbol: crypto.symbol,
            operation: 'DATA_STORAGE_COMPLETE',
            count: savedData.length,
            details: { savedCount: savedData.length }
          });
        }

        // Run basic technical analysis if enabled
        // This only calculates and stores the basic indicators, not the derived ones
        let analysisResult = null;
        if (settings.runTechnicalAnalysis) {
          if (processId) {
            await logAnalysis({
              processId,
              userId,
              symbol: crypto.symbol,
              operation: 'BASIC_ANALYSIS_START',
              analysisType: 'TECHNICAL',
              details: { dataPoints: data.Data.length }
            });
          }
          
          try {
            // Run technical analysis with a timeout
            const analysisPromise = runTechnicalAnalysis(data.Data, crypto.symbol, instrument, processId, userId);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Analysis timed out')), ANALYSIS_TIMEOUT)
            );
            
            analysisResult = await Promise.race([analysisPromise, timeoutPromise]);
            
            if (processId) {
              await logAnalysis({
                processId,
                userId,
                symbol: crypto.symbol,
                operation: 'BASIC_ANALYSIS_COMPLETE',
                analysisType: 'TECHNICAL',
                success: analysisResult.success,
                details: { steps: analysisResult.steps }
              });
            }
          } catch (analysisError) {
            console.error(`Error in technical analysis for ${crypto.symbol}:`, analysisError);
            
            if (processId) {
              await logAnalysis({
                processId,
                userId,
                symbol: crypto.symbol,
                operation: 'BASIC_ANALYSIS_ERROR',
                analysisType: 'TECHNICAL',
                success: false,
                error: analysisError
              });
            }
            
            analysisResult = {
              success: false,
              error: analysisError instanceof Error ? analysisError.message : String(analysisError)
            };
          }
        }

        // Update processing status if process ID is provided
        if (processId) {
          try {
            await prisma.processingStatus.update({
              where: { processId },
              data: {
                processedItems: {
                  increment: 1
                },
                details: {
                  update: {
                    [crypto.symbol]: {
                      success: true,
                      dataCount: savedData.length,
                      analysisSuccess: analysisResult?.success || false
                    }
                  }
                },
                updatedAt: new Date()
              }
            });
          } catch (statusError) {
            console.error(`Error updating processing status for ${crypto.symbol}:`, statusError);
            
            if (processId) {
              await logScheduling({
                processId,
                userId,
                operation: 'STATUS_UPDATE_ERROR',
                message: `Error updating processing status for ${crypto.symbol}`,
                error: statusError
              });
            }
          }
        }
        
        if (cryptoTimer) await cryptoTimer.end({ 
          success: true, 
          dataCount: savedData.length, 
          analysisSuccess: analysisResult?.success || false 
        });

        return {
          symbol: crypto.symbol,
          success: true,
          message: `Successfully stored ${savedData.length} hourly crypto data entries`,
          count: savedData.length,
          analysisResult
        };
      } catch (error) {
        console.error(`Error processing ${crypto.symbol}:`, error);
        
        if (processId) {
          await logDataProcessing({
            processId,
            userId,
            symbol: crypto.symbol,
            operation: 'PROCESS_ERROR',
            error,
            details: { message: `Failed to process ${crypto.symbol}` }
          });
        }
        
        // Update processing status with error if process ID is provided
        if (processId) {
          try {
            await prisma.processingStatus.update({
              where: { processId },
              data: {
                processedItems: {
                  increment: 1
                },
                details: {
                  update: {
                    [crypto.symbol]: {
                      success: false,
                      error: error instanceof Error ? error.message : String(error)
                    }
                  }
                },
                updatedAt: new Date()
              }
            });
          } catch (statusError) {
            console.error(`Error updating processing status for ${crypto.symbol}:`, statusError);
            
            if (processId) {
              await logScheduling({
                processId,
                userId,
                operation: 'STATUS_UPDATE_ERROR',
                message: `Error updating processing status for ${crypto.symbol}`,
                error: statusError
              });
            }
          }
        }
        
        if (cryptoTimer) await cryptoTimer.end({ success: false, error: error instanceof Error ? error.message : String(error) });
        
        return {
          symbol: crypto.symbol,
          success: false,
          message: `Failed to process ${crypto.symbol}`,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );
}

/**
 * Fetches data from the configured API and stores it in the database
 * Uses batch processing to handle multiple cryptocurrencies efficiently
 */
export async function fetchAndStoreHourlyCryptoData(userId: string): Promise<{
  success: boolean;
  message: string;
  data?: any;
  error?: any;
  processId?: string;
}> {
  // Create a process ID for this run
  const processId = `data-fetch-${Date.now()}`;
  
  try {
    await logScheduling({
      processId,
      userId,
      operation: 'FETCH_START',
      message: 'Starting data fetch operation'
    });
    
    // Get the user's data scheduling settings
    const settings = await prisma.dataScheduling.findUnique({
      where: {
        userId,
      },
    });

    if (!settings) {
      await logScheduling({
        processId,
        userId,
        operation: 'SETTINGS_ERROR',
        message: 'Data scheduling settings not found',
        error: new Error('Data scheduling settings not found')
      });
      
      return {
        success: false,
        message: 'Data scheduling settings not found',
        processId
      };
    }
    
    await logScheduling({
      processId,
      userId,
      operation: 'SETTINGS_LOADED',
      message: 'Data scheduling settings loaded',
      details: { 
        apiUrl: settings.apiUrl,
        dailyRunTime: settings.dailyRunTime,
        timeZone: settings.timeZone,
        limit: settings.limit,
        runTechnicalAnalysis: settings.runTechnicalAnalysis
      }
    });

    // Get user's cryptos to use for data collection
    const userCryptos = await prisma.crypto.findMany({
      where: {
        userId,
      },
      select: {
        symbol: true,
      },
    });

    if (userCryptos.length === 0) {
      await logScheduling({
        processId,
        userId,
        operation: 'CRYPTOS_ERROR',
        message: 'No cryptocurrencies found in portfolio',
        error: new Error('No cryptocurrencies found in your portfolio')
      });
      
      return {
        success: false,
        message: 'No cryptocurrencies found in your portfolio. Please add some on the dashboard first.',
      };
    }

    // Create a processing status record
    const processId = `data-fetch-${Date.now()}`;
    await prisma.processingStatus.create({
      data: {
        processId,
        userId,
        status: 'RUNNING',
        type: 'DATA_SCHEDULING',
        totalItems: userCryptos.length,
        processedItems: 0,
        details: {},
        startedAt: new Date()
      }
    });

    console.log(`Processing ${userCryptos.length} cryptocurrencies in batches of ${BATCH_SIZE}`);
    
    // Process cryptos in batches
    const results = [];
    for (let i = 0; i < userCryptos.length; i += BATCH_SIZE) {
      const batch = userCryptos.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(userCryptos.length/BATCH_SIZE)}`);
      
      // Update processing status
      await prisma.processingStatus.update({
        where: { processId },
        data: {
          processedItems: i,
          updatedAt: new Date()
        }
      });
      
      const batchResults = await processCryptoBatch(
        userId,
        batch.map(c => c.symbol),
        settings.apiUrl,
        settings.apiToken,
        settings.limit,
        settings.runTechnicalAnalysis,
        processId
      );
      
      results.push(...batchResults);
      
      // Add a small delay between batches to avoid overwhelming the API
      if (i + BATCH_SIZE < userCryptos.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    // Update processing status to completed
    await prisma.processingStatus.update({
      where: { processId },
      data: {
        status: 'COMPLETED',
        processedItems: totalCount,
        completedAt: new Date()
      }
    });

    return {
      success: successCount > 0,
      message: `Successfully processed ${successCount} of ${totalCount} cryptocurrencies`,
      data: results,
      processId
    };
  } catch (error) {
    console.error('Error in fetchAndStoreHourlyCryptoData:', error);
    
    // Update processing status to failed
    const processId = `data-fetch-${Date.now()}`;
    try {
      await prisma.processingStatus.update({
        where: { processId },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
          completedAt: new Date()
        }
      });
    } catch (statusError) {
      console.error('Error updating processing status:', statusError);
    }
    
    return {
      success: false,
      message: 'Failed to fetch and store hourly crypto data',
      error: error instanceof Error ? error.message : String(error),
      processId
    };
  }
}

/**
 * Run basic technical analysis on the data and store the results
 * This only calculates and stores the basic indicators, not the derived ones
 * Returns a result object with success/error information
 */
async function runTechnicalAnalysis(
  data: any[], 
  symbol: string, 
  instrument: string,
  processId?: string,
  userId?: string
): Promise<{
  success: boolean;
  message?: string;
  error?: any;
  steps?: {
    basicIndicators: boolean;
  };
}> {
  // Track which steps completed successfully
  const completedSteps = {
    basicIndicators: false
  };
  
  try {
    // Validate input data
    if (!data || !Array.isArray(data) || data.length === 0) {
      if (processId && userId) {
        await logAnalysis({
          processId,
          userId,
          symbol,
          operation: 'ANALYSIS_VALIDATION_ERROR',
          analysisType: 'TECHNICAL',
          success: false,
          error: new Error('Invalid or empty data array provided')
        });
      }
      
      return {
        success: false,
        message: 'Invalid or empty data array provided',
        steps: completedSteps
      };
    }
    
    // Extract prices for analysis (most recent first)
    const prices = data
      .sort((a, b) => b.TIMESTAMP - a.TIMESTAMP)
      .map(entry => entry.CLOSE);
    
    if (prices.length === 0 || prices.some(p => p === undefined || p === null)) {
      if (processId && userId) {
        await logAnalysis({
          processId,
          userId,
          symbol,
          operation: 'ANALYSIS_DATA_ERROR',
          analysisType: 'TECHNICAL',
          success: false,
          error: new Error('Invalid price data in the provided dataset')
        });
      }
      
      return {
        success: false,
        message: 'Invalid price data in the provided dataset',
        steps: completedSteps
      };
    }
    
    // Create price points for support/resistance analysis
    const pricePoints = data
      .sort((a, b) => b.TIMESTAMP - a.TIMESTAMP)
      .map(entry => ({
        high: entry.HIGH || entry.CLOSE,
        low: entry.LOW || entry.CLOSE,
        open: entry.OPEN || entry.CLOSE,
        close: entry.CLOSE,
        timestamp: new Date(entry.TIMESTAMP * 1000)
      }));
    
    // Calculate technical indicators with error handling
    let technicalAnalysis;
    try {
      if (processId && userId) {
        await logAnalysis({
          processId,
          userId,
          symbol,
          operation: 'BASIC_INDICATORS_START',
          analysisType: 'TECHNICAL',
          details: { dataPoints: prices.length }
        });
      }
      
      const sma20 = calculateSMA(prices, 20);
      const sma50 = calculateSMA(prices, 50);
      const ema12 = calculateEMA(prices, 12);
      const ema26 = calculateEMA(prices, 26);
      const rsi14 = calculateRSI(prices, 14);
      const bollingerBands = calculateBollingerBands(prices, 20, 2);
      const trendLines = identifyTrendLines(prices);
      
      // Calculate Fibonacci retracements
      const highPrice = Math.max(...prices);
      const lowPrice = Math.min(...prices);
      const fibonacciLevels = calculateFibonacciRetracements(highPrice, lowPrice);
      
      // Detect breakout patterns
      const breakoutAnalysis = detectBreakoutPatterns(prices, trendLines, bollingerBands);
      
      // Calculate weighted decision
      const currentPrice = prices[0];
      const decision = calculateWeightedDecision(
        currentPrice,
        ema12,
        ema26,
        rsi14,
        bollingerBands,
        trendLines,
        sma20,
        fibonacciLevels,
        breakoutAnalysis
      );
      
      // Calculate previous indicators for comparison (if available)
      const previousEma12 = prices.length > 1 ? calculateEMA(prices.slice(1), 12) : null;
      const previousEma26 = prices.length > 1 ? calculateEMA(prices.slice(1), 26) : null;
      
      if (processId && userId) {
        await logAnalysis({
          processId,
          userId,
          symbol,
          operation: 'BASIC_INDICATORS_CALCULATED',
          analysisType: 'TECHNICAL',
          success: true,
          details: { 
            indicators: {
              sma20: !!sma20,
              sma50: !!sma50,
              ema12: !!ema12,
              ema26: !!ema26,
              rsi14: !!rsi14,
              bollingerBands: !!bollingerBands,
              trendLines: !!trendLines,
              fibonacciLevels: !!fibonacciLevels,
              breakoutAnalysis: !!breakoutAnalysis
            }
          }
        });
      }
      
      // Store the analysis results
      if (processId && userId) {
        await logAnalysis({
          processId,
          userId,
          symbol,
          operation: 'BASIC_INDICATORS_STORAGE_START',
          analysisType: 'TECHNICAL'
        });
      }
      
      technicalAnalysis = await prisma.technicalAnalysisOutput.create({
        data: {
          symbol,
          instrument,
          sma20,
          sma50,
          ema12,
          ema26,
          rsi14,
          bollingerUpper: bollingerBands.upper,
          bollingerMiddle: bollingerBands.middle,
          bollingerLower: bollingerBands.lower,
          supportLevel: trendLines.support,
          resistanceLevel: trendLines.resistance,
          fibonacciLevels: fibonacciLevels as any,
          breakoutDetected: breakoutAnalysis.breakoutDetected,
          breakoutType: breakoutAnalysis.breakoutType,
          breakoutStrength: breakoutAnalysis.breakoutStrength,
          recommendation: decision.decision,
          confidenceScore: decision.confidence,
          rawData: {
            prices,
            currentPrice,
            previousEma12,
            previousEma26,
            timestamp: new Date(),
            explanation: decision.explanation
          }
        }
      });
      
      if (processId && userId) {
        await logAnalysis({
          processId,
          userId,
          symbol,
          operation: 'BASIC_INDICATORS_STORAGE_COMPLETE',
          analysisType: 'TECHNICAL',
          success: true,
          details: { technicalAnalysisId: technicalAnalysis.id }
        });
      }
      
      completedSteps.basicIndicators = true;
    } catch (error) {
      console.error(`Error calculating basic indicators for ${symbol}:`, error);
      
      if (processId && userId) {
        await logAnalysis({
          processId,
          userId,
          symbol,
          operation: 'BASIC_INDICATORS_ERROR',
          analysisType: 'TECHNICAL',
          success: false,
          error
        });
      }
      
      return {
        success: false,
        message: 'Failed to calculate basic technical indicators',
        error: error instanceof Error ? error.message : String(error),
        steps: completedSteps
      };
    }
    
    // We're only calculating basic indicators now, not derived ones
    // The advanced analysis will be done separately
    
    // Determine success based on completed steps
    console.log(`Basic technical analysis for ${symbol} completed with steps:`, completedSteps);
    
    if (completedSteps.basicIndicators) {
      return {
        success: true,
        message: `Basic technical analysis completed successfully for ${symbol}`,
        steps: completedSteps
      };
    } else {
      return {
        success: false,
        message: `Failed to complete basic technical analysis for ${symbol}`,
        steps: completedSteps
      };
    }
  } catch (error) {
    console.error(`Unexpected error in technical analysis for ${symbol}:`, error);
    
    if (processId && userId) {
      await logAnalysis({
        processId,
        userId,
        symbol,
        operation: 'ANALYSIS_UNEXPECTED_ERROR',
        analysisType: 'TECHNICAL',
        success: false,
        error
      });
    }
    
    return {
      success: false,
      message: `Unexpected error in technical analysis for ${symbol}`,
      error: error instanceof Error ? error.message : String(error),
      steps: completedSteps
    };
  }
}

/**
 * Cleans up old data based on the configured retention period
 */
export async function cleanupOldData(userId: string): Promise<{
  success: boolean;
  message: string;
  count?: number;
  error?: any;
  processId?: string;
}> {
  // Create a process ID for this cleanup operation
  const processId = `data-cleanup-${Date.now()}`;
  
  try {
    await logScheduling({
      processId,
      userId,
      operation: 'CLEANUP_START',
      message: 'Starting data cleanup operation'
    });
    
    // Get the user's data scheduling settings
    const settings = await prisma.dataScheduling.findUnique({
      where: {
        userId,
      },
    });

    if (!settings) {
      await logScheduling({
        processId,
        userId,
        operation: 'SETTINGS_ERROR',
        message: 'Data scheduling settings not found',
        error: new Error('Data scheduling settings not found')
      });
      
      return {
        success: false,
        message: 'Data scheduling settings not found',
        processId
      };
    }
    
    await logScheduling({
      processId,
      userId,
      operation: 'SETTINGS_LOADED',
      message: 'Data scheduling settings loaded',
      details: { 
        cleanupEnabled: settings.cleanupEnabled,
        cleanupDays: settings.cleanupDays
      }
    });

    // Check if cleanup is enabled
    if (!settings.cleanupEnabled) {
      await logScheduling({
        processId,
        userId,
        operation: 'CLEANUP_DISABLED',
        message: 'Data cleanup is disabled'
      });
      
      return {
        success: true,
        message: 'Data cleanup is disabled',
        count: 0,
        processId
      };
    }

    // Calculate the cutoff timestamp for BigInt timestamp fields
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - settings.cleanupDays);
    const timestamp = BigInt(Math.floor(daysAgo.getTime() / 1000));

    // Calculate the cutoff date for DateTime timestamp fields
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - settings.cleanupDays);
    
    await logScheduling({
      processId,
      userId,
      operation: 'CLEANUP_PARAMETERS',
      message: `Cleaning up data older than ${settings.cleanupDays} days`,
      details: { 
        cleanupDays: settings.cleanupDays,
        cutoffDate: cutoffDate.toISOString()
      }
    });

    // Delete hourly crypto historical data
    await logScheduling({
      processId,
      userId,
      operation: 'HISTORICAL_DATA_CLEANUP_START',
      message: 'Starting cleanup of hourly crypto historical data'
    });
    
    const historicalDataResult = await prisma.hourlyCryptoHistoricalData.deleteMany({
      where: {
        timestamp: {
          lt: timestamp,
        },
      },
    });
    
    await logScheduling({
      processId,
      userId,
      operation: 'HISTORICAL_DATA_CLEANUP_COMPLETE',
      message: `Deleted ${historicalDataResult.count} hourly crypto historical data records`,
      details: { count: historicalDataResult.count }
    });

    // Delete temporal features
    await logScheduling({
      processId,
      userId,
      operation: 'TEMPORAL_FEATURES_CLEANUP_START',
      message: 'Starting cleanup of temporal features'
    });
    
    const temporalFeaturesResult = await prisma.cryptoTemporalFeatures.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });
    
    await logScheduling({
      processId,
      userId,
      operation: 'TEMPORAL_FEATURES_CLEANUP_COMPLETE',
      message: `Deleted ${temporalFeaturesResult.count} temporal features records`,
      details: { count: temporalFeaturesResult.count }
    });

    // Delete pattern encodings
    await logScheduling({
      processId,
      userId,
      operation: 'PATTERN_ENCODINGS_CLEANUP_START',
      message: 'Starting cleanup of pattern encodings'
    });
    
    const patternEncodingsResult = await prisma.cryptoTechnicalPatternEncodings.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });
    
    await logScheduling({
      processId,
      userId,
      operation: 'PATTERN_ENCODINGS_CLEANUP_COMPLETE',
      message: `Deleted ${patternEncodingsResult.count} pattern encodings records`,
      details: { count: patternEncodingsResult.count }
    });
    
    // Delete comprehensive features
    await logScheduling({
      processId,
      userId,
      operation: 'COMPREHENSIVE_FEATURES_CLEANUP_START',
      message: 'Starting cleanup of comprehensive features'
    });
    
    const comprehensiveFeaturesResult = await prisma.cryptoComprehensiveFeatures.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });
    
    await logScheduling({
      processId,
      userId,
      operation: 'COMPREHENSIVE_FEATURES_CLEANUP_COMPLETE',
      message: `Deleted ${comprehensiveFeaturesResult.count} comprehensive features records`,
      details: { count: comprehensiveFeaturesResult.count }
    });

    // Calculate total deleted records
    const totalCount = 
      historicalDataResult.count + 
      temporalFeaturesResult.count + 
      patternEncodingsResult.count +
      comprehensiveFeaturesResult.count;
    
    await logScheduling({
      processId,
      userId,
      operation: 'CLEANUP_COMPLETE',
      message: `Cleanup operation completed successfully: ${totalCount} total records deleted`,
      details: { 
        totalCount,
        historicalDataCount: historicalDataResult.count,
        temporalFeaturesCount: temporalFeaturesResult.count,
        patternEncodingsCount: patternEncodingsResult.count,
        comprehensiveFeaturesCount: comprehensiveFeaturesResult.count
      }
    });

    return {
      success: true,
      message: `Deleted ${totalCount} records older than ${settings.cleanupDays} days (${historicalDataResult.count} historical data, ${temporalFeaturesResult.count} temporal features, ${patternEncodingsResult.count} pattern encodings, ${comprehensiveFeaturesResult.count} comprehensive features)`,
      count: totalCount,
      processId
    };
  } catch (error) {
    console.error('Error in cleanupOldData:', error);
    
    await logScheduling({
      processId,
      userId,
      operation: 'CLEANUP_ERROR',
      message: 'Error in data cleanup operation',
      error
    });
    
    return {
      success: false,
      message: 'Failed to clean up old data',
      error: error instanceof Error ? error.message : String(error),
      processId
    };
  }
}

// Export the processCryptoBatch and runTechnicalAnalysis functions for use in other modules
export { processCryptoBatch, runTechnicalAnalysis };

/**
 * Cleans up stale processing statuses that have been "RUNNING" for too long
 */
export async function cleanupStaleProcessingStatuses(userId?: string): Promise<void> {
  try {
    // Find all statuses that have been "RUNNING" for more than 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    // Build the where clause based on whether userId is provided
    const whereClause: any = {
      status: 'RUNNING',
      updatedAt: {
        lt: thirtyMinutesAgo
      }
    };
    
    // Add userId filter if provided
    if (userId) {
      whereClause.userId = userId;
    }
    
    const staleStatuses = await prisma.processingStatus.updateMany({
      where: whereClause,
      data: {
        status: 'FAILED',
        error: 'Process timed out or was interrupted',
        completedAt: new Date()
      }
    });
    
    if (staleStatuses.count > 0) {
      console.log(`Cleaned up ${staleStatuses.count} stale processing statuses for user ${userId}`);
    }
  } catch (error) {
    console.error('Error cleaning up stale processing statuses:', error);
  }
}