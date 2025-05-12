import { predictionService } from './predictionService';
import prisma from '@/lib/prisma';

/**
 * Run predictions for all user cryptos
 */
export async function runPredictionsForAllCryptos(userId: string): Promise<{
  success: boolean;
  message: string;
  processedCount: number;
  errorCount: number;
}> {
  try {
    // Initialize prediction service
    await predictionService.initialize();
    
    // Get all user cryptos
    const cryptos = await prisma.crypto.findMany({
      where: {
        userId
      }
    });
    
    if (cryptos.length === 0) {
      return {
        success: true,
        message: 'No cryptocurrencies found for user',
        processedCount: 0,
        errorCount: 0
      };
    }
    
    let processedCount = 0;
    let errorCount = 0;
    
    // Generate predictions for each crypto
    for (const crypto of cryptos) {
      try {
        await predictionService.generatePredictions(crypto.symbol);
        processedCount++;
      } catch (error) {
        console.error(`Error generating predictions for ${crypto.symbol}:`, error);
        errorCount++;
      }
    }
    
    return {
      success: true,
      message: `Generated predictions for ${processedCount} cryptocurrencies with ${errorCount} errors`,
      processedCount,
      errorCount
    };
  } catch (error) {
    console.error('Error running predictions for all cryptos:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      processedCount: 0,
      errorCount: 1
    };
  }
}

/**
 * Update prediction outcomes and model accuracies
 */
export async function updatePredictionOutcomes(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    // Update direction prediction outcomes
    await updateDirectionOutcomes();
    
    // Update volatility prediction outcomes
    await updateVolatilityOutcomes();
    
    // Update key levels prediction outcomes
    await updateKeyLevelsOutcomes();
    
    // Update model accuracies
    await predictionService.updateModelAccuracies();
    
    return {
      success: true,
      message: 'Prediction outcomes updated successfully'
    };
  } catch (error) {
    console.error('Error updating prediction outcomes:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Update direction prediction outcomes
 */
async function updateDirectionOutcomes() {
  // Get predictions that need outcome updates
  const predictions = await prisma.cryptoPriceDirectionPrediction.findMany({
    where: {
      actualOutcome: null,
      predictionTime: {
        lt: new Date() // Only update predictions whose time has passed
      }
    }
  });

  for (const prediction of predictions) {
    try {
      // Get the actual price at prediction time and current price
      const historicalData = await prisma.cryptoHistoricalData.findMany({
        where: {
          symbol: prediction.symbol,
          timestamp: {
            lte: prediction.predictionTime
          }
        },
        orderBy: {
          timestamp: 'desc'
        },
        take: 1
      });

      if (historicalData.length === 0) {
        continue; // Skip if no historical data found
      }

      // Get the price at prediction time
      const actualPrice = historicalData[0].close;

      // Get the price at prediction creation time
      const baseHistoricalData = await prisma.cryptoHistoricalData.findMany({
        where: {
          symbol: prediction.symbol,
          timestamp: {
            lte: prediction.timestamp
          }
        },
        orderBy: {
          timestamp: 'desc'
        },
        take: 1
      });

      if (baseHistoricalData.length === 0) {
        continue; // Skip if no base historical data found
      }

      const basePrice = baseHistoricalData[0].close;

      // Determine actual outcome
      const actualOutcome = actualPrice > basePrice ? 'up' : 'down';

      // Update prediction with actual outcome
      await prisma.cryptoPriceDirectionPrediction.update({
        where: {
          id: prediction.id
        },
        data: {
          actualOutcome
        }
      });
    } catch (error) {
      console.error(`Error updating direction outcome for prediction ${prediction.id}:`, error);
    }
  }
}

/**
 * Update volatility prediction outcomes
 */
async function updateVolatilityOutcomes() {
  // Get predictions that need outcome updates
  const predictions = await prisma.cryptoVolatilityPrediction.findMany({
    where: {
      actualVolatility: null,
      predictionTime: {
        lt: new Date() // Only update predictions whose time has passed
      }
    }
  });

  for (const prediction of predictions) {
    try {
      // Get historical data for the prediction period
      const historicalData = await prisma.cryptoHistoricalData.findMany({
        where: {
          symbol: prediction.symbol,
          timestamp: {
            gte: prediction.timestamp,
            lte: prediction.predictionTime
          }
        },
        orderBy: {
          timestamp: 'asc'
        }
      });

      if (historicalData.length < 2) {
        continue; // Skip if not enough data
      }

      // Calculate actual volatility
      const returns = [];
      for (let i = 1; i < historicalData.length; i++) {
        const prevClose = historicalData[i-1].close;
        const currClose = historicalData[i].close;
        returns.push(Math.log(currClose / prevClose));
      }
      
      // Standard deviation of returns
      const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length;
      const variance = returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length;
      const actualVolatility = Math.sqrt(variance) * Math.sqrt(365) * 100; // Annualized volatility in percentage

      // Update prediction with actual volatility
      await prisma.cryptoVolatilityPrediction.update({
        where: {
          id: prediction.id
        },
        data: {
          actualVolatility
        }
      });
    } catch (error) {
      console.error(`Error updating volatility outcome for prediction ${prediction.id}:`, error);
    }
  }
}

/**
 * Update key levels prediction outcomes
 */
async function updateKeyLevelsOutcomes() {
  // Get predictions that need outcome updates
  const predictions = await prisma.cryptoKeyLevelPrediction.findMany({
    where: {
      actualLevelsHit: null,
      predictionTime: {
        lt: new Date() // Only update predictions whose time has passed
      }
    }
  });

  for (const prediction of predictions) {
    try {
      // Get historical data for the prediction period
      const historicalData = await prisma.cryptoHistoricalData.findMany({
        where: {
          symbol: prediction.symbol,
          timestamp: {
            gte: prediction.timestamp,
            lte: prediction.predictionTime
          }
        },
        orderBy: {
          timestamp: 'asc'
        }
      });

      if (historicalData.length === 0) {
        continue; // Skip if no data
      }

      // Get predicted levels
      const levels = prediction.levels as any[];
      
      // Check which levels were hit
      const levelsHit = [];
      
      for (const level of levels) {
        // Check if price crossed this level
        let wasHit = false;
        
        for (let i = 1; i < historicalData.length; i++) {
          const prevBar = historicalData[i-1];
          const currBar = historicalData[i];
          
          // Check if price crossed the level
          if (
            (prevBar.low <= level.price && level.price <= prevBar.high) ||
            (currBar.low <= level.price && level.price <= currBar.high) ||
            (prevBar.low > level.price && currBar.high < level.price) ||
            (prevBar.high < level.price && currBar.low > level.price)
          ) {
            wasHit = true;
            break;
          }
        }
        
        if (wasHit) {
          levelsHit.push({
            price: level.price,
            type: level.type,
            strength: level.strength
          });
        }
      }
      
      // Update prediction with actual levels hit
      await prisma.cryptoKeyLevelPrediction.update({
        where: {
          id: prediction.id
        },
        data: {
          actualLevelsHit: levelsHit
        }
      });
    } catch (error) {
      console.error(`Error updating key levels outcome for prediction ${prediction.id}:`, error);
    }
  }
}