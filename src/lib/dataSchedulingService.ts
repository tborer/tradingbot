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
        const baseUrl = settings.apiUrl.endsWith('/') ? settings.apiUrl.slice(0, -1) : settings.apiUrl;
        const url = `${baseUrl}/index/cc/v1/historical/hours?market=cadli&instrument=${instrument}&limit=${settings.limit}&aggregate=1&response_format=JSON`;
        
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
              return await prisma.hourlyCryptoHistoricalData.create({
                data: {
                  unit: entry.UNIT,
                  timestamp: BigInt(entry.TIMESTAMP),
                  type: entry.TYPE,
                  market: entry.MARKET,
                  instrument: entry.INSTRUMENT,
                  open: entry.OPEN,
                  high: entry.HIGH,
                  low: entry.LOW,
                  close: entry.CLOSE,
                  firstMessageTimestamp: BigInt(entry.FIRST_MESSAGE_TIMESTAMP),
                  lastMessageTimestamp: BigInt(entry.LAST_MESSAGE_TIMESTAMP),
                  firstMessageValue: entry.FIRST_MESSAGE_VALUE,
                  highMessageValue: entry.HIGH_MESSAGE_VALUE,
                  highMessageTimestamp: BigInt(entry.HIGH_MESSAGE_TIMESTAMP),
                  lowMessageValue: entry.LOW_MESSAGE_VALUE,
                  lowMessageTimestamp: BigInt(entry.LOW_MESSAGE_TIMESTAMP),
                  lastMessageValue: entry.LAST_MESSAGE_VALUE,
                  totalIndexUpdates: entry.TOTAL_INDEX_UPDATES,
                  volume: entry.VOLUME,
                  quoteVolume: entry.QUOTE_VOLUME,
                  volumeTopTier: entry.VOLUME_TOP_TIER,
                  quoteVolumeTopTier: entry.QUOTE_VOLUME_TOP_TIER,
                  volumeDirect: entry.VOLUME_DIRECT,
                  quoteVolumeDirect: entry.QUOTE_VOLUME_DIRECT,
                  volumeTopTierDirect: entry.VOLUME_TOP_TIER_DIRECT,
                  quoteVolumeTopTierDirect: entry.QUOTE_VOLUME_TOP_TIER_DIRECT,
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
    
    // Store the analysis results
    await prisma.technicalAnalysisOutput.create({
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
          timestamp: new Date(),
          explanation: decision.explanation
        }
      }
    });
    
    console.log(`Technical analysis completed for ${symbol}`);
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

    // Calculate the cutoff timestamp
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - settings.cleanupDays);
    const timestamp = BigInt(Math.floor(daysAgo.getTime() / 1000));

    // Delete records older than the specified number of days
    const result = await prisma.hourlyCryptoHistoricalData.deleteMany({
      where: {
        timestamp: {
          lt: timestamp,
        },
      },
    });

    return {
      success: true,
      message: `Deleted ${result.count} records older than ${settings.cleanupDays} days`,
      count: result.count,
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