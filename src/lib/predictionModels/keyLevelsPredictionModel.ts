import { BasePredictionModel } from './basePredictionModel';
import { PredictionModelInput, KeyLevelPredictionResult, PredictionModelConfig } from './types';
import prisma from '@/lib/prisma';

/**
 * Model for predicting key price levels (support/resistance)
 */
export class KeyLevelsPredictionModel extends BasePredictionModel {
  constructor(config: PredictionModelConfig) {
    super({
      ...config,
      modelType: 'keyLevels'
    });
  }

  /**
   * Predict key price levels
   */
  async predict(input: PredictionModelInput): Promise<KeyLevelPredictionResult> {
    try {
      if (!this.modelId) {
        throw new Error('Model not initialized. Call initialize() first.');
      }

      // Prepare features for prediction
      const features = await this.prepareFeatures(input);
      
      // Get historical data for context
      const historicalData = await this.getHistoricalData(
        input.symbol, 
        this.config.lookbackPeriod
      );

      // Get technical analysis data for existing support/resistance levels
      const technicalAnalysis = await prisma.technicalAnalysisOutput.findFirst({
        where: {
          symbol: input.symbol,
          timestamp: {
            lte: input.timestamp
          }
        },
        orderBy: {
          timestamp: 'desc'
        }
      });

      // Calculate prediction
      const prediction = this.calculatePrediction(features, historicalData, technicalAnalysis);
      
      // Create result object
      const result: KeyLevelPredictionResult = {
        symbol: input.symbol,
        timestamp: input.timestamp,
        levels: prediction.levels,
        confidence: prediction.confidence,
        timeframe: this.config.timeframe,
        modelVersion: this.config.version
      };

      // Save prediction to database
      await this.savePredictionResult(result);

      return result;
    } catch (error) {
      console.error('Error predicting key levels:', error);
      throw error;
    }
  }

  /**
   * Calculate prediction based on features and historical data
   * This is a simplified implementation that would be replaced with a real model
   */
  private calculatePrediction(
    features: Record<string, any>, 
    historicalData: any[],
    technicalAnalysis: any
  ): { 
    levels: Array<{price: number, type: 'support' | 'resistance', strength: number}>,
    confidence: number 
  } {
    try {
      const levels: Array<{price: number, type: 'support' | 'resistance', strength: number}> = [];
      
      // 1. Use existing support/resistance levels as a starting point
      if (technicalAnalysis) {
        if (technicalAnalysis.supportLevel) {
          levels.push({
            price: technicalAnalysis.supportLevel,
            type: 'support',
            strength: 0.7 // Base strength
          });
        }
        
        if (technicalAnalysis.resistanceLevel) {
          levels.push({
            price: technicalAnalysis.resistanceLevel,
            type: 'resistance',
            strength: 0.7 // Base strength
          });
        }
        
        // Add Fibonacci levels if available
        if (technicalAnalysis.fibonacciLevels) {
          const fibLevels = technicalAnalysis.fibonacciLevels as any;
          
          for (const [level, price] of Object.entries(fibLevels)) {
            if (typeof price === 'number') {
              // Determine if it's support or resistance based on current price
              const currentPrice = historicalData[0]?.close || 0;
              const type = price < currentPrice ? 'support' : 'resistance';
              
              // Assign strength based on Fibonacci level importance
              let strength = 0.5;
              if (level === '0.618' || level === '0.382') {
                strength = 0.8; // Key Fibonacci levels
              } else if (level === '0.5') {
                strength = 0.75; // Also important
              }
              
              levels.push({
                price: price as number,
                type,
                strength
              });
            }
          }
        }
      }
      
      // 2. Identify price clusters in historical data
      if (historicalData.length > 0) {
        const pricePoints: number[] = [];
        
        // Collect all price points (highs, lows)
        historicalData.forEach(bar => {
          pricePoints.push(bar.high);
          pricePoints.push(bar.low);
        });
        
        // Sort price points
        pricePoints.sort((a, b) => a - b);
        
        // Find clusters using a simple algorithm
        const clusters: {price: number, count: number}[] = [];
        const clusterThreshold = 0.005; // 0.5% price difference
        
        let currentCluster = {
          price: pricePoints[0],
          count: 1
        };
        
        for (let i = 1; i < pricePoints.length; i++) {
          const priceDiff = Math.abs(pricePoints[i] - currentCluster.price) / currentCluster.price;
          
          if (priceDiff <= clusterThreshold) {
            // Add to current cluster
            currentCluster.count++;
            // Update cluster price to average
            currentCluster.price = (currentCluster.price * (currentCluster.count - 1) + pricePoints[i]) / currentCluster.count;
          } else {
            // Only keep clusters with at least 3 points
            if (currentCluster.count >= 3) {
              clusters.push(currentCluster);
            }
            
            // Start new cluster
            currentCluster = {
              price: pricePoints[i],
              count: 1
            };
          }
        }
        
        // Add the last cluster if it has enough points
        if (currentCluster.count >= 3) {
          clusters.push(currentCluster);
        }
        
        // Convert significant clusters to support/resistance levels
        const currentPrice = historicalData[0]?.close || 0;
        
        clusters.forEach(cluster => {
          // Skip clusters too close to existing levels
          const tooClose = levels.some(level => 
            Math.abs(level.price - cluster.price) / level.price < 0.02
          );
          
          if (!tooClose) {
            const type = cluster.price < currentPrice ? 'support' : 'resistance';
            const strength = Math.min(0.9, 0.5 + (cluster.count / pricePoints.length) * 2);
            
            levels.push({
              price: cluster.price,
              type,
              strength
            });
          }
        });
      }
      
      // 3. Adjust strengths based on feature data
      if (features.srStrength && typeof features.srStrength === 'object') {
        const srStrength = features.srStrength as Record<string, any>;
        
        levels.forEach(level => {
          // Find the closest level in srStrength
          const priceStr = Object.keys(srStrength).find(price => {
            const numPrice = parseFloat(price);
            return Math.abs(numPrice - level.price) / level.price < 0.02;
          });
          
          if (priceStr && srStrength[priceStr]) {
            // Adjust strength based on srStrength data
            level.strength = Math.max(level.strength, srStrength[priceStr] as number);
          }
        });
      }
      
      // 4. Calculate overall confidence
      const confidenceFactors = {
        levelCount: Math.min(1, levels.length / 5), // More levels = higher confidence (up to 5)
        averageStrength: levels.reduce((sum, level) => sum + level.strength, 0) / Math.max(1, levels.length),
        dataQuality: Math.min(1, historicalData.length / 30) // More data = higher confidence (up to 30 bars)
      };
      
      const confidence = 
        confidenceFactors.levelCount * 0.3 +
        confidenceFactors.averageStrength * 0.5 +
        confidenceFactors.dataQuality * 0.2;
      
      return {
        levels: levels.sort((a, b) => a.price - b.price), // Sort by price
        confidence: Math.max(0, Math.min(1, confidence))
      };
    } catch (error) {
      console.error('Error calculating key levels prediction:', error);
      // Return empty prediction with low confidence
      return { 
        levels: [],
        confidence: 0.1
      };
    }
  }

  /**
   * Save prediction result to database
   */
  protected async savePredictionResult(result: KeyLevelPredictionResult): Promise<void> {
    try {
      if (!this.modelId) {
        throw new Error('Model not initialized');
      }

      // Calculate prediction time based on timeframe
      const predictionTime = this.calculatePredictionTime(result.timestamp, result.timeframe);

      await prisma.cryptoKeyLevelPrediction.create({
        data: {
          modelId: this.modelId,
          symbol: result.symbol,
          timestamp: result.timestamp,
          predictionTime,
          levels: result.levels as any,
          confidence: result.confidence,
          timeframe: result.timeframe,
          featureSnapshot: {} // Would store the features used for prediction
        }
      });
    } catch (error) {
      console.error('Error saving key levels prediction result:', error);
      throw error;
    }
  }

  /**
   * Calculate prediction time based on timeframe
   */
  private calculatePredictionTime(timestamp: Date, timeframe: string): Date {
    const predictionTime = new Date(timestamp);
    
    // Parse timeframe (e.g., '1h', '4h', '1d')
    const match = timeframe.match(/^(\d+)([hd])$/);
    if (!match) {
      throw new Error(`Invalid timeframe format: ${timeframe}`);
    }
    
    const [, value, unit] = match;
    const numValue = parseInt(value, 10);
    
    if (unit === 'h') {
      predictionTime.setHours(predictionTime.getHours() + numValue);
    } else if (unit === 'd') {
      predictionTime.setDate(predictionTime.getDate() + numValue);
    }
    
    return predictionTime;
  }

  /**
   * Update model accuracy based on actual outcomes
   */
  async updateAccuracy(): Promise<number> {
    try {
      if (!this.modelId) {
        throw new Error('Model not initialized');
      }

      // Get all predictions with known actual levels hit
      const predictions = await prisma.cryptoKeyLevelPrediction.findMany({
        where: {
          modelId: this.modelId,
          actualLevelsHit: {
            not: null
          }
        }
      });

      if (predictions.length === 0) {
        return 0;
      }

      // Calculate accuracy based on predicted levels that were actually hit
      let totalAccuracy = 0;
      
      for (const prediction of predictions) {
        const predictedLevels = prediction.levels as any[];
        const actualLevelsHit = prediction.actualLevelsHit as any[];
        
        if (predictedLevels.length === 0) {
          continue;
        }
        
        // Count how many predicted levels were actually hit
        let hitCount = 0;
        for (const actual of actualLevelsHit) {
          for (const predicted of predictedLevels) {
            // Check if the actual hit is close to a predicted level
            if (Math.abs(actual.price - predicted.price) / predicted.price < 0.02) {
              hitCount++;
              break;
            }
          }
        }
        
        // Calculate accuracy for this prediction
        const predictionAccuracy = hitCount / predictedLevels.length;
        totalAccuracy += predictionAccuracy;
      }
      
      const accuracy = totalAccuracy / predictions.length;

      // Update model accuracy
      await prisma.cryptoPredictionModel.update({
        where: {
          id: this.modelId
        },
        data: {
          accuracy
        }
      });

      return accuracy;
    } catch (error) {
      console.error('Error updating key levels model accuracy:', error);
      return 0;
    }
  }
}