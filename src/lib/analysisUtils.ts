import prisma from '@/lib/prisma';
import { schedulingLogger } from '@/lib/schedulingLogger';
import { generateComprehensiveFeatureSet } from '@/lib/comprehensiveFeatureUtils';
import { runPredictionsForAllCryptos, updatePredictionOutcomes } from '@/lib/predictionModels/predictionRunner';
import { generateTradingSignalsForAllCryptos } from '@/lib/tradingSignals/signalGenerator';
import { runTechnicalAnalysis as runTechnicalAnalysisFromData } from '@/lib/dataSchedulingService';

/**
 * Run technical analysis for a user's cryptocurrencies
 * This function is used by the runAnalysisProcess function
 */
export async function runTechnicalAnalysis(userId: string, processId: string): Promise<void> {
  console.log(`Starting technical analysis for user ${userId}, process ${processId}`);
  
  // Get user's cryptos
  const cryptos = await prisma.crypto.findMany({
    where: {
      userId
    }
  });

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
      
      // Get only the current day's hourly data for this crypto
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = BigInt(Math.floor(today.getTime() / 1000));
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'DATA_FETCH',
        symbol: crypto.symbol,
        message: `Fetching current day's data for ${crypto.symbol} (since timestamp ${todayTimestamp})`
      });
      
      const hourlyData = await prisma.hourlyCryptoHistoricalData.findMany({
        where: {
          instrument: `${crypto.symbol}-USD`,
          timestamp: {
            gte: todayTimestamp
          }
        },
        orderBy: {
          timestamp: 'desc'
        }
      });

      console.log(`Found ${hourlyData.length} hourly data records for ${crypto.symbol}`);

      if (hourlyData.length === 0) {
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

      // Convert BigInt to number for analysis
      const formattedData = hourlyData.map(entry => ({
        TIMESTAMP: Number(entry.timestamp),
        OPEN: entry.open,
        HIGH: entry.high,
        LOW: entry.low,
        CLOSE: entry.close,
        VOLUME: entry.volume,
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
      
      const result = await runTechnicalAnalysisFromData(
        formattedData,
        crypto.symbol,
        `${crypto.symbol}-USD`,
        processId,
        userId
      );

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
}

/**
 * Run the analysis process for a user
 * This function is used by both the API endpoint and the scheduler
 */
export async function runAnalysisProcess(processId: string, userId: string): Promise<void> {
  try {
    // Get user's cryptos
    const cryptos = await prisma.crypto.findMany({
      where: {
        userId
      }
    });

    // Create or update processing status
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
        startedAt: new Date()
      },
      create: {
        processId,
        userId,
        status: 'RUNNING',
        type: 'ANALYSIS',
        totalItems: cryptos.length * 5, // 5 steps per crypto
        processedItems: 0,
        startedAt: new Date()
      }
    });

    // Log the start of the analysis process
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'ANALYSIS_START',
      message: 'Starting analysis process'
    });

    let processedItems = 0;

    // Step 1: Run technical analysis
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'TECHNICAL_ANALYSIS_START',
      message: 'Starting technical analysis'
    });

    try {
      await runTechnicalAnalysis(userId, processId);
      
      // Update processed items
      processedItems += cryptos.length;
      await prisma.processingStatus.update({
        where: {
          processId
        },
        data: {
          processedItems
        }
      });
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'TECHNICAL_ANALYSIS_COMPLETE',
        message: 'Technical analysis completed'
      });
    } catch (error) {
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'TECHNICAL_ANALYSIS_ERROR',
        message: `Technical analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }

    // Step 2: Generate comprehensive features
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'FEATURE_GENERATION_START',
      message: 'Starting comprehensive feature generation'
    });

    try {
      for (const crypto of cryptos) {
        try {
          // Check if technical analysis data exists for this symbol
          const technicalAnalysis = await prisma.technicalAnalysisOutput.findFirst({
            where: {
              symbol: crypto.symbol
            },
            orderBy: {
              timestamp: 'desc'
            }
          });

          if (!technicalAnalysis) {
            await schedulingLogger.log({
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

          await generateComprehensiveFeatureSet(crypto.symbol);
          
          // Update processed items
          processedItems++;
          await prisma.processingStatus.update({
            where: {
              processId
            },
            data: {
              processedItems
            }
          });
          
          await schedulingLogger.log({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'FEATURE_GENERATION_PROGRESS',
            symbol: crypto.symbol,
            message: `Generated comprehensive features for ${crypto.symbol}`
          });
        } catch (cryptoError) {
          await schedulingLogger.log({
            processId,
            userId,
            level: 'ERROR',
            category: 'ANALYSIS',
            operation: 'FEATURE_GENERATION_ERROR',
            symbol: crypto.symbol,
            message: `Error generating features for ${crypto.symbol}: ${cryptoError instanceof Error ? cryptoError.message : 'Unknown error'}`
          });
        }
      }
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'FEATURE_GENERATION_COMPLETE',
        message: 'Comprehensive feature generation completed'
      });
    } catch (error) {
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'FEATURE_GENERATION_ERROR',
        message: `Feature generation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }

    // Step 3: Run prediction models
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'PREDICTION_START',
      message: 'Starting prediction model runs'
    });

    try {
      const predictionResult = await runPredictionsForAllCryptos(userId);
      
      // Update processed items
      processedItems += cryptos.length;
      await prisma.processingStatus.update({
        where: {
          processId
        },
        data: {
          processedItems
        }
      });
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'PREDICTION_COMPLETE',
        message: `Prediction models completed: ${predictionResult.message}`
      });
    } catch (error) {
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'PREDICTION_ERROR',
        message: `Prediction model error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }

    // Step 4: Update prediction outcomes
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'OUTCOME_UPDATE_START',
      message: 'Starting prediction outcome updates'
    });

    try {
      const outcomeResult = await updatePredictionOutcomes();
      
      // Update processed items
      processedItems += cryptos.length;
      await prisma.processingStatus.update({
        where: {
          processId
        },
        data: {
          processedItems
        }
      });
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'OUTCOME_UPDATE_COMPLETE',
        message: `Prediction outcome updates completed: ${outcomeResult.message}`
      });
    } catch (error) {
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'OUTCOME_UPDATE_ERROR',
        message: `Prediction outcome update error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }

    // Step 5: Generate trading signals
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'TRADING_SIGNALS_START',
      message: 'Starting trading signal generation'
    });

    try {
      const signalsResult = await generateTradingSignalsForAllCryptos(userId);
      
      // Update processed items
      processedItems += cryptos.length;
      await prisma.processingStatus.update({
        where: {
          processId
        },
        data: {
          processedItems
        }
      });
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'TRADING_SIGNALS_COMPLETE',
        message: `Trading signal generation completed: Generated signals for ${signalsResult.length} cryptocurrencies`
      });
    } catch (error) {
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'TRADING_SIGNALS_ERROR',
        message: `Trading signal generation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }

    // Mark process as completed
    try {
      await prisma.processingStatus.update({
        where: {
          processId
        },
        data: {
          status: 'COMPLETED',
          processedItems: cryptos.length * 5, // Ensure 100% completion
          completedAt: new Date()
        }
      });

      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'ANALYSIS_COMPLETE',
        message: 'Analysis process completed successfully'
      });
      
      console.log(`Analysis process ${processId} marked as COMPLETED`);
    } catch (statusError) {
      console.error(`Error updating final status for process ${processId}:`, statusError);
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'STATUS_UPDATE_ERROR',
        message: `Error updating final status: ${statusError instanceof Error ? statusError.message : 'Unknown error'}`
      });
    }
  } catch (error) {
    console.error(`Error in analysis process ${processId}:`, error);
    
    // Mark process as failed
    await prisma.processingStatus.update({
      where: {
        processId
      },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });

    await schedulingLogger.log({
      processId,
      userId,
      level: 'ERROR',
      category: 'ANALYSIS',
      operation: 'ANALYSIS_FAILED',
      message: `Analysis process failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
}

/**
 * Run analysis for a specific symbol
 * This function is used by the runAnalysisProcess function
 */
export async function runAnalysisForSymbol(symbol: string, userId: string, processId: string): Promise<void> {
  // Check if technical analysis data exists for this symbol
  const technicalAnalysis = await prisma.technicalAnalysisOutput.findFirst({
    where: {
      symbol
    },
    orderBy: {
      timestamp: 'desc'
    }
  });

  if (!technicalAnalysis) {
    throw new Error(`No technical analysis data found for ${symbol}`);
  }

  // Generate comprehensive features
  await generateComprehensiveFeatureSet(symbol);
  
  // Log success
  await schedulingLogger.log({
    processId,
    userId,
    level: 'INFO',
    category: 'ANALYSIS',
    operation: 'SYMBOL_ANALYSIS_COMPLETE',
    symbol,
    message: `Analysis completed for ${symbol}`
  });
}

// Export technical analysis calculation functions
export function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) {
    return prices[0]; // Return current price if not enough data
  }
  
  const sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
  return sum / period;
}

export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) {
    return prices[0]; // Return current price if not enough data
  }
  
  const k = 2 / (period + 1);
  let ema = prices[prices.length - 1];
  
  for (let i = prices.length - 2; i >= 0; i--) {
    ema = prices[i] * k + ema * (1 - k);
  }
  
  return ema;
}

export function calculateRSI(prices: number[], period: number): number {
  if (prices.length <= period) {
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
  
  if (losses === 0) return 100; // All gains
  
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

export function calculateBollingerBands(prices: number[], period: number, multiplier: number): {
  upper: number;
  middle: number;
  lower: number;
} {
  if (prices.length < period) {
    return {
      upper: prices[0] * 1.1,
      middle: prices[0],
      lower: prices[0] * 0.9
    };
  }
  
  const sma = calculateSMA(prices, period);
  
  // Calculate standard deviation
  const squaredDifferences = prices.slice(0, period).map(price => Math.pow(price - sma, 2));
  const variance = squaredDifferences.reduce((a, b) => a + b, 0) / period;
  const standardDeviation = Math.sqrt(variance);
  
  return {
    upper: sma + (standardDeviation * multiplier),
    middle: sma,
    lower: sma - (standardDeviation * multiplier)
  };
}

export function identifyTrendLines(prices: number[]): {
  support: number;
  resistance: number;
} {
  if (prices.length < 10) {
    return {
      support: prices[0] * 0.95,
      resistance: prices[0] * 1.05
    };
  }
  
  // Simple implementation - find local minimums and maximums
  let minPrice = prices[0];
  let maxPrice = prices[0];
  
  for (let i = 1; i < Math.min(prices.length, 20); i++) {
    if (prices[i] < minPrice) minPrice = prices[i];
    if (prices[i] > maxPrice) maxPrice = prices[i];
  }
  
  return {
    support: minPrice,
    resistance: maxPrice
  };
}

export function calculateFibonacciRetracements(highPrice: number, lowPrice: number): {
  level0: number;
  level23_6: number;
  level38_2: number;
  level50: number;
  level61_8: number;
  level100: number;
} {
  const diff = highPrice - lowPrice;
  
  return {
    level0: highPrice,
    level23_6: highPrice - diff * 0.236,
    level38_2: highPrice - diff * 0.382,
    level50: highPrice - diff * 0.5,
    level61_8: highPrice - diff * 0.618,
    level100: lowPrice
  };
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
  const currentPrice = prices[0];
  const previousPrice = prices[1] || currentPrice;
  
  // Check for breakouts
  if (currentPrice > trendLines.resistance && previousPrice <= trendLines.resistance) {
    return {
      breakoutDetected: true,
      breakoutType: 'RESISTANCE_BREAKOUT',
      breakoutStrength: (currentPrice - trendLines.resistance) / trendLines.resistance * 100
    };
  }
  
  if (currentPrice < trendLines.support && previousPrice >= trendLines.support) {
    return {
      breakoutDetected: true,
      breakoutType: 'SUPPORT_BREAKDOWN',
      breakoutStrength: (trendLines.support - currentPrice) / trendLines.support * 100
    };
  }
  
  if (currentPrice > bollingerBands.upper && previousPrice <= bollingerBands.upper) {
    return {
      breakoutDetected: true,
      breakoutType: 'BOLLINGER_UPPER_BREAKOUT',
      breakoutStrength: (currentPrice - bollingerBands.upper) / bollingerBands.upper * 100
    };
  }
  
  if (currentPrice < bollingerBands.lower && previousPrice >= bollingerBands.lower) {
    return {
      breakoutDetected: true,
      breakoutType: 'BOLLINGER_LOWER_BREAKDOWN',
      breakoutStrength: (bollingerBands.lower - currentPrice) / bollingerBands.lower * 100
    };
  }
  
  return {
    breakoutDetected: false,
    breakoutType: 'NONE',
    breakoutStrength: 0
  };
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
  
  return {
    decision,
    confidence,
    explanation: explanation.join(". ")
  };
}