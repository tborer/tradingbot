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

/**
 * Fetches data from the configured API and stores it in the database
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

    const results = [];

    // Process each crypto in the user's portfolio
    for (const crypto of userCryptos) {
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

        // Fetch data from the configured API
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${settings.apiToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          results.push({
            symbol: crypto.symbol,
            success: false,
            message: `API request failed with status ${response.status}`,
            error: await response.text(),
          });
          continue;
        }

        const data = await response.json();

        // Check if the data has the expected format
        if (!data.Data || !Array.isArray(data.Data)) {
          results.push({
            symbol: crypto.symbol,
            success: false,
            message: 'Invalid data format received from API',
            data,
          });
          continue;
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
        if (settings.runTechnicalAnalysis) {
          await runTechnicalAnalysis(data.Data, crypto.symbol, instrument);
        }

        results.push({
          symbol: crypto.symbol,
          success: true,
          message: `Successfully stored ${savedData.length} hourly crypto data entries`,
          count: savedData.length,
        });
      } catch (error) {
        console.error(`Error processing ${crypto.symbol}:`, error);
        results.push({
          symbol: crypto.symbol,
          success: false,
          message: `Failed to process ${crypto.symbol}`,
          error: error instanceof Error ? error.message : String(error),
        });
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
 */
async function runTechnicalAnalysis(data: any[], symbol: string, instrument: string): Promise<void> {
  try {
    // Extract prices for analysis (most recent first)
    const prices = data
      .sort((a, b) => b.TIMESTAMP - a.TIMESTAMP)
      .map(entry => entry.CLOSE);
    
    // Create price points for support/resistance analysis
    const pricePoints = data
      .sort((a, b) => b.TIMESTAMP - a.TIMESTAMP)
      .map(entry => ({
        high: entry.HIGH,
        low: entry.LOW,
        open: entry.OPEN,
        close: entry.CLOSE,
        timestamp: new Date(entry.TIMESTAMP * 1000)
      }));
    
    // Calculate technical indicators
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
    const technicalAnalysis = await prisma.technicalAnalysisOutput.create({
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
    
    // Calculate and store derived indicators
    const technicalAnalysisWithPrevious = {
      ...technicalAnalysis,
      rawData: {
        ...technicalAnalysis.rawData,
        previousEma12,
        previousEma26
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
    
    // Generate and store temporal features
    const now = new Date();
    const temporalFeatures = await generateTemporalFeatures(symbol, now);
    await saveTemporalFeatures(symbol, temporalFeatures);
    
    // Generate and store pattern encodings
    const patternEncodings = await generatePatternEncodings(symbol, now);
    await savePatternEncodings(symbol, patternEncodings);
    
    // Generate and store comprehensive feature set
    const comprehensiveFeatures = await generateComprehensiveFeatureSet(symbol, 'hourly', now);
    await saveComprehensiveFeatureSet(symbol, comprehensiveFeatures);
    
    console.log(`Technical analysis and advanced features completed for ${symbol}`);
  } catch (error) {
    console.error(`Error running technical analysis for ${symbol}:`, error);
    // Don't throw, just log the error to prevent stopping the entire process
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