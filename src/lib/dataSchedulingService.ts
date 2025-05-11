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

// Constants for batch processing
const BATCH_SIZE = 5; // Number of cryptos to process in parallel
const FETCH_TIMEOUT = 30000; // 30 seconds timeout for API fetch
const ANALYSIS_TIMEOUT = 60000; // 60 seconds timeout for analysis

/**
 * Helper function to fetch with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeout: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * Process a batch of cryptocurrencies in parallel
 */
async function processCryptoBatch(
  cryptos: { symbol: string }[], 
  settings: any
): Promise<any[]> {
  // Process each crypto in the batch concurrently
  return Promise.all(
    cryptos.map(async (crypto) => {
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

        // Fetch data from the configured API with timeout
        const response = await fetchWithTimeout(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${settings.apiToken}`,
            'Content-Type': 'application/json',
          },
        }, FETCH_TIMEOUT);

        if (!response.ok) {
          return {
            symbol: crypto.symbol,
            success: false,
            message: `API request failed with status ${response.status}`,
            error: await response.text(),
          };
        }

        const data = await response.json();

        // Check if the data has the expected format
        if (!data.Data || !Array.isArray(data.Data)) {
          return {
            symbol: crypto.symbol,
            success: false,
            message: 'Invalid data format received from API',
            data,
          };
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
              return { error: 'Failed to save entry', entry };
            }
          })
        );

        // Run technical analysis if enabled
        let analysisResult = null;
        if (settings.runTechnicalAnalysis) {
          try {
            // Run technical analysis with a timeout
            const analysisPromise = runTechnicalAnalysis(data.Data, crypto.symbol, instrument);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Analysis timed out')), ANALYSIS_TIMEOUT)
            );
            
            analysisResult = await Promise.race([analysisPromise, timeoutPromise]);
          } catch (analysisError) {
            console.error(`Error in technical analysis for ${crypto.symbol}:`, analysisError);
            analysisResult = {
              success: false,
              error: analysisError instanceof Error ? analysisError.message : String(analysisError)
            };
          }
        }

        return {
          symbol: crypto.symbol,
          success: true,
          message: `Successfully stored ${savedData.length} hourly crypto data entries`,
          count: savedData.length,
          analysisResult
        };
      } catch (error) {
        console.error(`Error processing ${crypto.symbol}:`, error);
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
}> {
  try {
    // Get the user's data scheduling settings
    const settings = await prisma.dataScheduling.findUnique({
      where: {
        userId,
      },
    });

    if (!settings) {
      return {
        success: false,
        message: 'Data scheduling settings not found',
      };
    }

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
      return {
        success: false,
        message: 'No cryptocurrencies found in your portfolio. Please add some on the dashboard first.',
      };
    }

    console.log(`Processing ${userCryptos.length} cryptocurrencies in batches of ${BATCH_SIZE}`);
    
    // Process cryptos in batches
    const results = [];
    for (let i = 0; i < userCryptos.length; i += BATCH_SIZE) {
      const batch = userCryptos.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(userCryptos.length/BATCH_SIZE)}`);
      
      const batchResults = await processCryptoBatch(batch, settings);
      results.push(...batchResults);
      
      // Add a small delay between batches to avoid overwhelming the API
      if (i + BATCH_SIZE < userCryptos.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    return {
      success: successCount > 0,
      message: `Successfully processed ${successCount} of ${totalCount} cryptocurrencies`,
      data: results,
    };
  } catch (error) {
    console.error('Error in fetchAndStoreHourlyCryptoData:', error);
    return {
      success: false,
      message: 'Failed to fetch and store hourly crypto data',
      error,
    };
  }
}

/**
 * Run technical analysis on the data and store the results
 * Returns a result object with success/error information
 */
async function runTechnicalAnalysis(data: any[], symbol: string, instrument: string): Promise<{
  success: boolean;
  message?: string;
  error?: any;
  steps?: {
    basicIndicators: boolean;
    derivedIndicators: boolean;
    temporalFeatures: boolean;
    patternEncodings: boolean;
    comprehensiveFeatures: boolean;
  };
}> {
  // Track which steps completed successfully
  const completedSteps = {
    basicIndicators: false,
    derivedIndicators: false,
    temporalFeatures: false,
    patternEncodings: false,
    comprehensiveFeatures: false
  };
  
  try {
    // Validate input data
    if (!data || !Array.isArray(data) || data.length === 0) {
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
      
      // Store the analysis results
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
      
      completedSteps.basicIndicators = true;
    } catch (error) {
      console.error(`Error calculating basic indicators for ${symbol}:`, error);
      return {
        success: false,
        message: 'Failed to calculate basic technical indicators',
        error: error instanceof Error ? error.message : String(error),
        steps: completedSteps
      };
    }
    
    // Calculate and store derived indicators
    try {
      if (technicalAnalysis) {
        const technicalAnalysisWithPrevious = {
          ...technicalAnalysis,
          rawData: {
            ...technicalAnalysis.rawData,
            previousEma12: technicalAnalysis.rawData.previousEma12,
            previousEma26: technicalAnalysis.rawData.previousEma26
          }
        };
        
        const derivedIndicators = calculateDerivedIndicators(technicalAnalysisWithPrevious);
        
        await prisma.cryptoDerivedIndicators.create({
          data: {
            technicalAnalysisId: technicalAnalysis.id,
            symbol,
            timestamp: new Date(),
            trendStrength: derivedIndicators.trendStrength,
            volatilityRatio: derivedIndicators.volatilityRatio,
            rsiWithTrendContext: derivedIndicators.rsiWithTrendContext,
            maConvergence: derivedIndicators.maConvergence,
            nearestSupportDistance: derivedIndicators.nearestSupportDistance,
            nearestResistanceDistance: derivedIndicators.nearestResistanceDistance,
            fibConfluenceStrength: derivedIndicators.fibConfluenceStrength,
            bbPosition: derivedIndicators.bbPosition
          }
        });
        
        completedSteps.derivedIndicators = true;
      }
    } catch (error) {
      console.error(`Error calculating derived indicators for ${symbol}:`, error);
      // Continue with other steps even if this one fails
    }
    
    // Generate and store temporal features
    try {
      const now = new Date();
      const temporalFeatures = await generateTemporalFeatures(symbol, now);
      await saveTemporalFeatures(symbol, temporalFeatures);
      completedSteps.temporalFeatures = true;
    } catch (error) {
      console.error(`Error generating temporal features for ${symbol}:`, error);
      // Continue with other steps even if this one fails
    }
    
    // Generate and store pattern encodings
    try {
      const now = new Date();
      const patternEncodings = await generatePatternEncodings(symbol, now);
      await savePatternEncodings(symbol, patternEncodings);
      completedSteps.patternEncodings = true;
    } catch (error) {
      console.error(`Error generating pattern encodings for ${symbol}:`, error);
      // Continue with other steps even if this one fails
    }
    
    // Generate and store comprehensive feature set
    try {
      const now = new Date();
      const comprehensiveFeatures = await generateComprehensiveFeatureSet(symbol, 'hourly', now);
      await saveComprehensiveFeatureSet(symbol, comprehensiveFeatures);
      completedSteps.comprehensiveFeatures = true;
    } catch (error) {
      console.error(`Error generating comprehensive features for ${symbol}:`, error);
      // This is the last step, so we can just log the error
    }
    
    // Determine overall success based on completed steps
    const allStepsCompleted = Object.values(completedSteps).every(step => step);
    const someStepsCompleted = Object.values(completedSteps).some(step => step);
    
    console.log(`Technical analysis for ${symbol} completed with steps:`, completedSteps);
    
    if (allStepsCompleted) {
      return {
        success: true,
        message: `All technical analysis steps completed successfully for ${symbol}`,
        steps: completedSteps
      };
    } else if (someStepsCompleted) {
      return {
        success: true,
        message: `Some technical analysis steps completed for ${symbol}`,
        steps: completedSteps
      };
    } else {
      return {
        success: false,
        message: `Failed to complete any technical analysis steps for ${symbol}`,
        steps: completedSteps
      };
    }
  } catch (error) {
    console.error(`Unexpected error in technical analysis for ${symbol}:`, error);
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
}> {
  try {
    // Get the user's data scheduling settings
    const settings = await prisma.dataScheduling.findUnique({
      where: {
        userId,
      },
    });

    if (!settings) {
      return {
        success: false,
        message: 'Data scheduling settings not found',
      };
    }

    // Check if cleanup is enabled
    if (!settings.cleanupEnabled) {
      return {
        success: true,
        message: 'Data cleanup is disabled',
        count: 0,
      };
    }

    // Calculate the cutoff timestamp for BigInt timestamp fields
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - settings.cleanupDays);
    const timestamp = BigInt(Math.floor(daysAgo.getTime() / 1000));

    // Calculate the cutoff date for DateTime timestamp fields
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - settings.cleanupDays);

    // Delete hourly crypto historical data
    const historicalDataResult = await prisma.hourlyCryptoHistoricalData.deleteMany({
      where: {
        timestamp: {
          lt: timestamp,
        },
      },
    });

    // Delete temporal features
    const temporalFeaturesResult = await prisma.cryptoTemporalFeatures.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    // Delete pattern encodings
    const patternEncodingsResult = await prisma.cryptoTechnicalPatternEncodings.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });
    
    // Delete comprehensive features
    const comprehensiveFeaturesResult = await prisma.cryptoComprehensiveFeatures.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    // Calculate total deleted records
    const totalCount = 
      historicalDataResult.count + 
      temporalFeaturesResult.count + 
      patternEncodingsResult.count +
      comprehensiveFeaturesResult.count;

    return {
      success: true,
      message: `Deleted ${totalCount} records older than ${settings.cleanupDays} days (${historicalDataResult.count} historical data, ${temporalFeaturesResult.count} temporal features, ${patternEncodingsResult.count} pattern encodings, ${comprehensiveFeaturesResult.count} comprehensive features)`,
      count: totalCount,
    };
  } catch (error) {
    console.error('Error in cleanupOldData:', error);
    return {
      success: false,
      message: 'Failed to clean up old data',
      error,
    };
  }
}