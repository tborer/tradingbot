import prisma from '@/lib/prisma';
import { flattenObject } from '@/lib/comprehensiveFeatureUtils';

/**
 * Interface for the consolidated AI decision data structure
 */
export interface ConsolidatedAIDecisionData {
  asset_id: string;
  timestamp: string;
  price_data: {
    current: number;
    change_24h: number;
    historical: Array<{
      timestamp: string;
      price: number;
      volume?: number;
    }>;
  };
  technical_indicators: {
    bollinger_bands: {
      upper: number | null;
      middle: number | null;
      lower: number | null;
      bandwidth: number | null;
      position: number | null;
    };
    moving_averages: {
      sma_20: number | null;
      sma_50: number | null;
      ema_12: number | null;
      ema_26: number | null;
      crossovers: Array<{
        type: string;
        timestamp: string;
        price: number;
      }>;
    };
    rsi: {
      value: number | null;
      trend: string | null;
      divergence: boolean;
    };
    trend_analysis: {
      direction: string | null;
      strength: number | null;
      support_levels: number[];
      resistance_levels: number[];
    };
    fibonacci_retracements: {
      reference_high: number | null;
      reference_low: number | null;
      levels: {
        '0.236': number | null;
        '0.382': number | null;
        '0.5': number | null;
        '0.618': number | null;
        '0.786': number | null;
      };
    };
    breakout_patterns: {
      detected: string[];
      confidence: number | null;
      target: number | null;
    };
  };
  prediction_models: {
    price_targets: {
      '1h': {
        prediction: number | null;
        confidence: number | null;
        range: [number | null, number | null];
      };
      '24h': {
        prediction: number | null;
        confidence: number | null;
        range: [number | null, number | null];
      };
      '7d': {
        prediction: number | null;
        confidence: number | null;
        range: [number | null, number | null];
      };
    };
    trend_prediction: {
      direction: string | null;
      strength: number | null;
      key_levels: number[];
    };
  };
  trading_signals: {
    entry: {
      recommendation: string | null;
      confidence: number | null;
      target_price: number | null;
      trigger_conditions: string | null;
    };
    exit: {
      take_profit: Array<{
        price: number | null;
        portion: number | null;
      }>;
      stop_loss: number | null;
    };
    risk_reward: {
      ratio: number | null;
      expected_value: number | null;
    };
  };
}

/**
 * Generate a consolidated data structure for AI decision making
 * @param userId The user ID
 * @param symbol The cryptocurrency symbol
 * @returns A consolidated data structure for AI decision making
 */
export async function generateConsolidatedAIDecisionData(
  userId: string,
  symbol: string
): Promise<ConsolidatedAIDecisionData> {
  try {
    // 1. Get the latest technical analysis data
    const technicalAnalysis = await prisma.technicalAnalysisOutput.findFirst({
      where: {
        symbol,
      },
      orderBy: {
        timestamp: 'desc',
      },
      include: {
        derivedIndicators: true,
      },
    });

    // 2. Get historical price data (last 30 days hourly)
    const historicalData = await prisma.hourlyCryptoHistoricalData.findMany({
      where: {
        instrument: `${symbol}-USD`,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 720, // 30 days * 24 hours
    });

    // 3. Get the latest comprehensive features
    const comprehensiveFeatures = await prisma.cryptoComprehensiveFeatures.findFirst({
      where: {
        symbol,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // 4. Get the latest trading signals
    const tradingSignals = await prisma.tradingSignal.findMany({
      where: {
        userId,
        symbol,
        status: 'ACTIVE',
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 5,
    });

    // 5. Get the latest prediction data
    const directionPredictions = await prisma.cryptoPriceDirectionPrediction?.findMany({
      where: {
        symbol,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 3,
    }) || [];

    const volatilityPredictions = await prisma.cryptoVolatilityPrediction?.findMany({
      where: {
        symbol,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 3,
    }) || [];

    const keyLevelPredictions = await prisma.cryptoKeyLevelPrediction?.findMany({
      where: {
        symbol,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 3,
    }) || [];

    // Calculate 24h price change
    const currentPrice = technicalAnalysis?.bollingerMiddle || 0;
    const yesterday = historicalData.find(d => 
      Number(d.timestamp) <= (Date.now() / 1000) - 24 * 60 * 60
    );
    const yesterdayPrice = yesterday?.close || currentPrice;
    const priceChange24h = ((currentPrice - yesterdayPrice) / yesterdayPrice) * 100;

    // Extract feature data
    const featureSet = comprehensiveFeatures?.featureSet || {};
    const flatFeatures = flattenObject(featureSet);

    // Extract Fibonacci levels from technical analysis
    const fibLevels = technicalAnalysis?.fibonacciLevels || {};
    const fibData = typeof fibLevels === 'string' ? JSON.parse(fibLevels) : fibLevels;

    // Find entry and exit signals
    const entrySignal = tradingSignals.find(s => s.signalType === 'ENTRY');
    const exitSignal = tradingSignals.find(s => s.signalType === 'EXIT');

    // Get the latest direction prediction
    const directionPrediction = directionPredictions[0];
    
    // Get the latest volatility prediction
    const volatilityPrediction = volatilityPredictions[0];
    
    // Get the latest key level prediction
    const keyLevelPrediction = keyLevelPredictions[0];

    // Build the consolidated data structure
    const consolidatedData: ConsolidatedAIDecisionData = {
      asset_id: symbol,
      timestamp: new Date().toISOString(),
      price_data: {
        current: currentPrice,
        change_24h: priceChange24h,
        historical: historicalData.map(d => ({
          timestamp: new Date(Number(d.timestamp) * 1000).toISOString(),
          price: d.close,
          volume: d.volume,
        })),
      },
      technical_indicators: {
        bollinger_bands: {
          upper: technicalAnalysis?.bollingerUpper || null,
          middle: technicalAnalysis?.bollingerMiddle || null,
          lower: technicalAnalysis?.bollingerLower || null,
          bandwidth: flatFeatures['derived_indicators.volatilityRatio'] || null,
          position: flatFeatures['derived_indicators.bbPosition'] || null,
        },
        moving_averages: {
          sma_20: technicalAnalysis?.sma20 || null,
          sma_50: technicalAnalysis?.sma50 || null,
          ema_12: technicalAnalysis?.ema12 || null,
          ema_26: technicalAnalysis?.ema26 || null,
          crossovers: [], // Would need historical data to detect crossovers
        },
        rsi: {
          value: technicalAnalysis?.rsi14 || null,
          trend: flatFeatures['temporal_features.rsiVelocity'] > 0 ? 'rising' : 'falling',
          divergence: false, // Would need more complex analysis to detect divergence
        },
        trend_analysis: {
          direction: technicalAnalysis?.recommendation || null,
          strength: flatFeatures['derived_indicators.trendStrength'] || null,
          support_levels: [technicalAnalysis?.supportLevel].filter(Boolean) as number[],
          resistance_levels: [technicalAnalysis?.resistanceLevel].filter(Boolean) as number[],
        },
        fibonacci_retracements: {
          reference_high: fibData.high || null,
          reference_low: fibData.low || null,
          levels: {
            '0.236': fibData['0.236'] || null,
            '0.382': fibData['0.382'] || null,
            '0.5': fibData['0.5'] || null,
            '0.618': fibData['0.618'] || null,
            '0.786': fibData['0.786'] || null,
          },
        },
        breakout_patterns: {
          detected: technicalAnalysis?.breakoutDetected ? [technicalAnalysis.breakoutType || ''] : [],
          confidence: technicalAnalysis?.confidenceScore || null,
          target: null, // Would need more complex analysis to set target
        },
      },
      prediction_models: {
        price_targets: {
          '1h': {
            prediction: directionPrediction?.predictedDirection === 'UP' ? 
              currentPrice * (1 + (volatilityPrediction?.expectedVolatility || 0.01) / 100) : 
              currentPrice * (1 - (volatilityPrediction?.expectedVolatility || 0.01) / 100),
            confidence: directionPrediction?.confidence || null,
            range: [
              volatilityPrediction?.volatilityRange?.min || null,
              volatilityPrediction?.volatilityRange?.max || null,
            ],
          },
          '24h': {
            prediction: directionPrediction?.predictedDirection === 'UP' ? 
              currentPrice * (1 + (volatilityPrediction?.expectedVolatility || 0.03) / 100 * 24) : 
              currentPrice * (1 - (volatilityPrediction?.expectedVolatility || 0.03) / 100 * 24),
            confidence: directionPrediction?.confidence ? directionPrediction.confidence * 0.8 : null, // Lower confidence for longer timeframe
            range: [
              volatilityPrediction?.volatilityRange?.min ? volatilityPrediction.volatilityRange.min * 0.95 : null,
              volatilityPrediction?.volatilityRange?.max ? volatilityPrediction.volatilityRange.max * 1.05 : null,
            ],
          },
          '7d': {
            prediction: directionPrediction?.predictedDirection === 'UP' ? 
              currentPrice * (1 + (volatilityPrediction?.expectedVolatility || 0.05) / 100 * 168) : 
              currentPrice * (1 - (volatilityPrediction?.expectedVolatility || 0.05) / 100 * 168),
            confidence: directionPrediction?.confidence ? directionPrediction.confidence * 0.6 : null, // Even lower confidence for weekly timeframe
            range: [
              volatilityPrediction?.volatilityRange?.min ? volatilityPrediction.volatilityRange.min * 0.9 : null,
              volatilityPrediction?.volatilityRange?.max ? volatilityPrediction.volatilityRange.max * 1.1 : null,
            ],
          },
        },
        trend_prediction: {
          direction: directionPrediction?.predictedDirection === 'UP' ? 'bullish' : 'bearish',
          strength: directionPrediction?.confidence || null,
          key_levels: keyLevelPrediction?.levels?.map(l => l.price) || [],
        },
      },
      trading_signals: {
        entry: {
          recommendation: entrySignal?.direction === 'LONG' ? 'buy' : entrySignal?.direction === 'SHORT' ? 'sell' : null,
          confidence: entrySignal?.confidence || null,
          target_price: entrySignal?.targetPrice || null,
          trigger_conditions: entrySignal?.reason || null,
        },
        exit: {
          take_profit: [
            {
              price: exitSignal?.reason === 'TAKE_PROFIT' ? exitSignal.price : entrySignal?.targetPrice || null,
              portion: 1.0, // Default to full position
            },
          ],
          stop_loss: entrySignal?.stopLossPrice || null,
        },
        risk_reward: {
          ratio: entrySignal && entrySignal.targetPrice && entrySignal.stopLossPrice ? 
            Math.abs((entrySignal.targetPrice - entrySignal.price) / (entrySignal.stopLossPrice - entrySignal.price)) : 
            null,
          expected_value: entrySignal?.confidence || null,
        },
      },
    };

    return consolidatedData;
  } catch (error) {
    console.error(`Error generating consolidated AI decision data for ${symbol}:`, error);
    
    // Return a default structure with empty/null values
    return {
      asset_id: symbol,
      timestamp: new Date().toISOString(),
      price_data: {
        current: 0,
        change_24h: 0,
        historical: [],
      },
      technical_indicators: {
        bollinger_bands: {
          upper: null,
          middle: null,
          lower: null,
          bandwidth: null,
          position: null,
        },
        moving_averages: {
          sma_20: null,
          sma_50: null,
          ema_12: null,
          ema_26: null,
          crossovers: [],
        },
        rsi: {
          value: null,
          trend: null,
          divergence: false,
        },
        trend_analysis: {
          direction: null,
          strength: null,
          support_levels: [],
          resistance_levels: [],
        },
        fibonacci_retracements: {
          reference_high: null,
          reference_low: null,
          levels: {
            '0.236': null,
            '0.382': null,
            '0.5': null,
            '0.618': null,
            '0.786': null,
          },
        },
        breakout_patterns: {
          detected: [],
          confidence: null,
          target: null,
        },
      },
      prediction_models: {
        price_targets: {
          '1h': {
            prediction: null,
            confidence: null,
            range: [null, null],
          },
          '24h': {
            prediction: null,
            confidence: null,
            range: [null, null],
          },
          '7d': {
            prediction: null,
            confidence: null,
            range: [null, null],
          },
        },
        trend_prediction: {
          direction: null,
          strength: null,
          key_levels: [],
        },
      },
      trading_signals: {
        entry: {
          recommendation: null,
          confidence: null,
          target_price: null,
          trigger_conditions: null,
        },
        exit: {
          take_profit: [
            {
              price: null,
              portion: null,
            },
          ],
          stop_loss: null,
        },
        risk_reward: {
          ratio: null,
          expected_value: null,
        },
      },
    };
  }
}

/**
 * Generate consolidated AI decision data for all user's cryptocurrencies
 * @param userId The user ID
 * @returns Consolidated AI decision data for all cryptocurrencies
 */
export async function generateConsolidatedAIDecisionDataForAllCryptos(
  userId: string
): Promise<Record<string, ConsolidatedAIDecisionData>> {
  try {
    // Get all user's cryptocurrencies
    const cryptos = await prisma.crypto.findMany({
      where: {
        userId,
      },
    });

    // Generate consolidated data for each cryptocurrency
    const result: Record<string, ConsolidatedAIDecisionData> = {};
    
    for (const crypto of cryptos) {
      const data = await generateConsolidatedAIDecisionData(userId, crypto.symbol);
      result[crypto.symbol] = data;
    }

    return result;
  } catch (error) {
    console.error('Error generating consolidated AI decision data for all cryptos:', error);
    return {};
  }
}