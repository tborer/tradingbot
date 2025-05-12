import { TradingSignal, EntrySignal, ExitSignal, SignalGenerationContext, SignalGenerationParams } from './types';
import prisma from '@/lib/prisma';
import { PredictionContext, TechnicalContext, PositionContext } from './types';

/**
 * Generates entry signals based on prediction data and technical indicators
 */
export async function generateEntrySignals(
  params: SignalGenerationParams,
  context: SignalGenerationContext
): Promise<EntrySignal | null> {
  const { symbol, timeframe, currentPrice, userId } = params;
  const { technical, predictions, position } = context;

  // Don't generate entry signals if there's already an open position
  if (position.hasOpenPosition) {
    return null;
  }

  // Extract prediction data
  const directionPrediction = predictions.direction;
  const volatilityPrediction = predictions.volatility;
  const keyLevelsPrediction = predictions.keyLevels;

  // Default confidence if not available
  const directionConfidence = directionPrediction?.confidence || 0.5;

  // Bullish signal conditions
  const bullishSignal = 
    directionPrediction?.prediction === 'UP' && 
    directionConfidence > 0.7 && 
    (technical.rsi !== undefined && technical.rsi < 40) &&
    (technical.ema50 !== undefined && currentPrice > technical.ema50);

  if (bullishSignal) {
    // Calculate target and stop loss prices
    const nearestResistance = keyLevelsPrediction?.resistance?.[0] || currentPrice * 1.05;
    const nearestSupport = keyLevelsPrediction?.support?.[0] || currentPrice * 0.95;
    
    const targetPrice = nearestResistance;
    const stopLossPrice = nearestSupport;

    return {
      type: 'ENTRY',
      userId,
      symbol,
      timestamp: new Date(),
      direction: 'LONG',
      confidence: directionConfidence,
      price: currentPrice,
      reason: 'Strong upward prediction with RSI oversold condition',
      targetPrice,
      stopLossPrice,
      timeframe
    };
  }

  // Bearish signal conditions
  const bearishSignal = 
    directionPrediction?.prediction === 'DOWN' && 
    directionConfidence > 0.7 && 
    (technical.rsi !== undefined && technical.rsi > 70) &&
    (technical.ema50 !== undefined && currentPrice < technical.ema50);

  if (bearishSignal) {
    // Calculate target and stop loss prices
    const nearestResistance = keyLevelsPrediction?.resistance?.[0] || currentPrice * 1.05;
    const nearestSupport = keyLevelsPrediction?.support?.[0] || currentPrice * 0.95;
    
    const targetPrice = nearestSupport;
    const stopLossPrice = nearestResistance;

    return {
      type: 'ENTRY',
      userId,
      symbol,
      timestamp: new Date(),
      direction: 'SHORT',
      confidence: directionConfidence,
      price: currentPrice,
      reason: 'Strong downward prediction with RSI overbought condition',
      targetPrice,
      stopLossPrice,
      timeframe
    };
  }

  // Breakout signal conditions
  const breakoutSignal = 
    volatilityPrediction?.prediction === 'HIGH' && 
    volatilityPrediction.confidence > 0.7 &&
    technical.bollingerUpper !== undefined && 
    technical.bollingerLower !== undefined &&
    (currentPrice > technical.bollingerUpper || currentPrice < technical.bollingerLower);

  if (breakoutSignal) {
    const direction = currentPrice > technical.bollingerUpper ? 'LONG' : 'SHORT';
    const targetPrice = direction === 'LONG' 
      ? currentPrice * 1.05 
      : currentPrice * 0.95;
    const stopLossPrice = direction === 'LONG'
      ? technical.bollingerUpper
      : technical.bollingerLower;

    return {
      type: 'ENTRY',
      userId,
      symbol,
      timestamp: new Date(),
      direction,
      confidence: volatilityPrediction.confidence,
      price: currentPrice,
      reason: `Bollinger Band breakout with high predicted volatility`,
      targetPrice,
      stopLossPrice,
      timeframe
    };
  }

  // Trend confirmation signal
  const trendConfirmationSignal = 
    technical.macd !== undefined && 
    technical.macdSignal !== undefined &&
    technical.macdHistogram !== undefined &&
    technical.macdHistogram > 0 &&
    technical.macd > technical.macdSignal &&
    directionPrediction?.prediction === 'UP' &&
    directionConfidence > 0.6;

  if (trendConfirmationSignal) {
    return {
      type: 'ENTRY',
      userId,
      symbol,
      timestamp: new Date(),
      direction: 'LONG',
      confidence: directionConfidence,
      price: currentPrice,
      reason: 'MACD bullish crossover with upward price prediction',
      targetPrice: currentPrice * 1.05,
      stopLossPrice: currentPrice * 0.97,
      timeframe
    };
  }

  return null;
}

/**
 * Generates exit signals based on prediction data, technical indicators, and current position
 */
export async function generateExitSignals(
  params: SignalGenerationParams,
  context: SignalGenerationContext
): Promise<ExitSignal | null> {
  const { symbol, timeframe, currentPrice, userId } = params;
  const { technical, predictions, position } = context;

  // Don't generate exit signals if there's no open position
  if (!position.hasOpenPosition || position.openPositions.length === 0) {
    return null;
  }

  // Get the current position
  const currentPosition = position.openPositions[0];
  const { direction, entryPrice, entrySignalId } = currentPosition;

  // Take profit condition
  const takeProfitLong = 
    direction === 'LONG' && 
    currentPrice >= entryPrice * 1.05;

  const takeProfitShort = 
    direction === 'SHORT' && 
    currentPrice <= entryPrice * 0.95;

  if (takeProfitLong || takeProfitShort) {
    const profitLoss = direction === 'LONG' 
      ? currentPrice - entryPrice 
      : entryPrice - currentPrice;
    
    const profitLossPercentage = (profitLoss / entryPrice) * 100;

    return {
      type: 'EXIT',
      userId,
      symbol,
      timestamp: new Date(),
      price: currentPrice,
      reason: 'TAKE_PROFIT',
      relatedEntrySignalId: entrySignalId,
      profitLoss,
      profitLossPercentage,
      timeframe
    };
  }

  // Stop loss condition
  const stopLossLong = 
    direction === 'LONG' && 
    currentPrice <= entryPrice * 0.97;

  const stopLossShort = 
    direction === 'SHORT' && 
    currentPrice >= entryPrice * 1.03;

  if (stopLossLong || stopLossShort) {
    const profitLoss = direction === 'LONG' 
      ? currentPrice - entryPrice 
      : entryPrice - currentPrice;
    
    const profitLossPercentage = (profitLoss / entryPrice) * 100;

    return {
      type: 'EXIT',
      userId,
      symbol,
      timestamp: new Date(),
      price: currentPrice,
      reason: 'STOP_LOSS',
      relatedEntrySignalId: entrySignalId,
      profitLoss,
      profitLossPercentage,
      timeframe
    };
  }

  // Trend reversal condition
  const trendReversalLong = 
    direction === 'LONG' && 
    predictions.direction?.prediction === 'DOWN' &&
    predictions.direction.confidence > 0.7;

  const trendReversalShort = 
    direction === 'SHORT' && 
    predictions.direction?.prediction === 'UP' &&
    predictions.direction.confidence > 0.7;

  if (trendReversalLong || trendReversalShort) {
    const profitLoss = direction === 'LONG' 
      ? currentPrice - entryPrice 
      : entryPrice - currentPrice;
    
    const profitLossPercentage = (profitLoss / entryPrice) * 100;

    return {
      type: 'EXIT',
      userId,
      symbol,
      timestamp: new Date(),
      price: currentPrice,
      reason: 'TREND_REVERSAL',
      relatedEntrySignalId: entrySignalId,
      profitLoss,
      profitLossPercentage,
      timeframe
    };
  }

  // Risk management condition - exit if position has been open for too long
  // This would require checking the entry timestamp, which we have in the position context

  return null;
}

/**
 * Saves a trading signal to the database
 */
export async function saveTradingSignal(signal: TradingSignal): Promise<TradingSignal> {
  const { type } = signal as any;
  
  if (type === 'ENTRY') {
    const entrySignal = signal as EntrySignal;
    return await prisma.tradingSignal.create({
      data: {
        userId: entrySignal.userId,
        symbol: entrySignal.symbol,
        timestamp: entrySignal.timestamp,
        signalType: 'ENTRY',
        direction: entrySignal.direction,
        price: entrySignal.price,
        confidence: entrySignal.confidence,
        reason: entrySignal.reason,
        timeframe: entrySignal.timeframe,
        targetPrice: entrySignal.targetPrice,
        stopLossPrice: entrySignal.stopLossPrice,
        status: 'ACTIVE'
      }
    });
  } else if (type === 'EXIT') {
    const exitSignal = signal as ExitSignal;
    return await prisma.tradingSignal.create({
      data: {
        userId: exitSignal.userId,
        symbol: exitSignal.symbol,
        timestamp: exitSignal.timestamp,
        signalType: 'EXIT',
        price: exitSignal.price,
        reason: exitSignal.reason,
        timeframe: exitSignal.timeframe,
        relatedSignalId: exitSignal.relatedEntrySignalId,
        profitLoss: exitSignal.profitLoss,
        profitLossPercentage: exitSignal.profitLossPercentage,
        status: 'ACTIVE'
      }
    });
  }
  
  throw new Error('Invalid signal type');
}

/**
 * Retrieves the latest technical context for a symbol
 */
export async function getTechnicalContext(userId: string, symbol: string, timeframe: string): Promise<TechnicalContext> {
  const latestAnalysis = await prisma.cryptoTechnicalAnalysis.findFirst({
    where: {
      userId,
      symbol,
      timeframe
    },
    orderBy: {
      timestamp: 'desc'
    }
  });

  if (!latestAnalysis) {
    return {};
  }

  return {
    rsi: latestAnalysis.rsi || undefined,
    ema12: latestAnalysis.ema12 || undefined,
    ema26: latestAnalysis.ema26 || undefined,
    sma20: latestAnalysis.sma20 || undefined,
    sma50: latestAnalysis.sma50 || undefined,
    bollingerUpper: latestAnalysis.bollingerUpper || undefined,
    bollingerLower: latestAnalysis.bollingerLower || undefined,
    macd: latestAnalysis.macd || undefined,
    macdSignal: latestAnalysis.macdSignal || undefined,
    macdHistogram: latestAnalysis.macdHistogram || undefined
  };
}

/**
 * Retrieves the latest prediction context for a symbol
 */
export async function getPredictionContext(userId: string, symbol: string, timeframe: string): Promise<PredictionContext> {
  // Get the latest direction prediction
  const directionModel = await prisma.cryptoPredictionModel.findFirst({
    where: {
      userId,
      modelType: 'direction',
      timeframe,
      OR: [
        { symbol },
        { symbol: null }
      ]
    }
  });

  const directionPrediction = directionModel ? await prisma.cryptoPriceDirectionPrediction.findFirst({
    where: {
      modelId: directionModel.id,
      symbol
    },
    orderBy: {
      timestamp: 'desc'
    }
  }) : null;

  // Get the latest volatility prediction
  const volatilityModel = await prisma.cryptoPredictionModel.findFirst({
    where: {
      userId,
      modelType: 'volatility',
      timeframe,
      OR: [
        { symbol },
        { symbol: null }
      ]
    }
  });

  const volatilityPrediction = volatilityModel ? await prisma.cryptoPriceDirectionPrediction.findFirst({
    where: {
      modelId: volatilityModel.id,
      symbol
    },
    orderBy: {
      timestamp: 'desc'
    }
  }) : null;

  // Get the latest key levels prediction
  const keyLevelsModel = await prisma.cryptoPredictionModel.findFirst({
    where: {
      userId,
      modelType: 'keyLevels',
      timeframe,
      OR: [
        { symbol },
        { symbol: null }
      ]
    }
  });

  const keyLevelsPrediction = keyLevelsModel ? await prisma.cryptoKeyLevelPrediction.findFirst({
    where: {
      modelId: keyLevelsModel.id,
      symbol
    },
    orderBy: {
      timestamp: 'desc'
    }
  }) : null;

  return {
    direction: directionPrediction ? {
      prediction: directionPrediction.predictedDirection as 'UP' | 'DOWN',
      confidence: directionPrediction.confidence
    } : undefined,
    volatility: volatilityPrediction ? {
      prediction: volatilityPrediction.predictedDirection as any,
      confidence: volatilityPrediction.confidence
    } : undefined,
    keyLevels: keyLevelsPrediction ? {
      support: keyLevelsPrediction.predictedSupport as any,
      resistance: keyLevelsPrediction.predictedResistance as any,
      confidence: keyLevelsPrediction.confidence
    } : undefined
  };
}

/**
 * Retrieves the current position context for a symbol
 */
export async function getPositionContext(userId: string, symbol: string): Promise<PositionContext> {
  // Get active entry signals that haven't been exited yet
  const activeEntrySignals = await prisma.tradingSignal.findMany({
    where: {
      userId,
      symbol,
      signalType: 'ENTRY',
      status: 'ACTIVE'
    },
    orderBy: {
      timestamp: 'desc'
    }
  });

  // For each active entry signal, check if there's a corresponding exit signal
  const openPositions = [];
  
  for (const entrySignal of activeEntrySignals) {
    const exitSignal = await prisma.tradingSignal.findFirst({
      where: {
        userId,
        symbol,
        signalType: 'EXIT',
        relatedSignalId: entrySignal.id
      }
    });

    // If no exit signal exists, this is an open position
    if (!exitSignal) {
      openPositions.push({
        direction: entrySignal.direction as 'LONG' | 'SHORT',
        entryPrice: entrySignal.price,
        entryTimestamp: entrySignal.timestamp,
        entrySignalId: entrySignal.id,
        size: 1 // Default size, could be calculated based on user settings
      });
    }
  }

  return {
    hasOpenPosition: openPositions.length > 0,
    openPositions
  };
}

/**
 * Generates trading signals for a specific symbol
 */
export async function generateTradingSignals(
  userId: string, 
  symbol: string, 
  timeframe: string,
  currentPrice: number
): Promise<TradingSignal[]> {
  // Get contexts
  const technicalContext = await getTechnicalContext(userId, symbol, timeframe);
  const predictionContext = await getPredictionContext(userId, symbol, timeframe);
  const positionContext = await getPositionContext(userId, symbol);

  const context: SignalGenerationContext = {
    technical: technicalContext,
    predictions: predictionContext,
    position: positionContext
  };

  const params: SignalGenerationParams = {
    userId,
    symbol,
    timeframe,
    currentPrice
  };

  const signals: TradingSignal[] = [];

  // Generate entry signals if no open position
  if (!positionContext.hasOpenPosition) {
    const entrySignal = await generateEntrySignals(params, context);
    if (entrySignal) {
      const savedEntrySignal = await saveTradingSignal(entrySignal);
      signals.push(savedEntrySignal as TradingSignal);
    }
  } 
  // Generate exit signals if there's an open position
  else {
    const exitSignal = await generateExitSignals(params, context);
    if (exitSignal) {
      const savedExitSignal = await saveTradingSignal(exitSignal);
      signals.push(savedExitSignal as TradingSignal);
    }
  }

  return signals;
}

/**
 * Generates trading signals for all user's cryptocurrencies
 */
export async function generateTradingSignalsForAllCryptos(
  userId: string,
  timeframe: string = '1h'
): Promise<{ symbol: string, signals: TradingSignal[] }[]> {
  // Get all user's cryptocurrencies
  const cryptos = await prisma.crypto.findMany({
    where: {
      userId
    }
  });

  const results = [];

  for (const crypto of cryptos) {
    // Get the current price
    const currentPrice = crypto.lastPrice || 0;
    
    if (currentPrice === 0) {
      continue; // Skip if no price available
    }

    // Generate signals for this crypto
    const signals = await generateTradingSignals(userId, crypto.symbol, timeframe, currentPrice);
    
    results.push({
      symbol: crypto.symbol,
      signals
    });
  }

  return results;
}