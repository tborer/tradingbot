import { BasePredictionModel } from './basePredictionModel';
import { PredictionModelInput, DirectionPredictionResult, PredictionModelConfig } from './types';
import prisma from '@/lib/prisma';

/**
 * Model for predicting price direction (up/down)
 */
export class DirectionPredictionModel extends BasePredictionModel {
  constructor(config: PredictionModelConfig) {
    super({
      ...config,
      modelType: 'direction'
    });
  }

  /**
   * Predict price direction
   */
  async predict(input: PredictionModelInput): Promise<DirectionPredictionResult> {
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

      // Calculate prediction
      // This is a simplified example - in a real implementation, this would use
      // a trained machine learning model or more sophisticated algorithm
      const prediction = this.calculatePrediction(features, historicalData);
      
      // Create result object
      const result: DirectionPredictionResult = {
        symbol: input.symbol,
        timestamp: input.timestamp,
        probability: prediction.probability,
        direction: prediction.probability > 0.5 ? 'up' : 'down',
        confidence: prediction.confidence,
        timeframe: this.config.timeframe,
        modelVersion: this.config.version
      };

      // Save prediction to database
      await this.savePredictionResult(result);

      return result;
    } catch (error) {
      console.error('Error predicting price direction:', error);
      throw error;
    }
  }

  /**
   * Calculate prediction based on features and historical data
   * This is a simplified implementation that would be replaced with a real model
   */
  private calculatePrediction(features: Record<string, any>, historicalData: any[]): { probability: number, confidence: number } {
    try {
      // Simple example logic - this would be replaced with actual model inference
      
      // 1. Check trend indicators
      let trendScore = 0;
      if (features.trendStrength && typeof features.trendStrength === 'number') {
        trendScore = features.trendStrength;
      }
      
      // 2. Check RSI
      let rsiScore = 0;
      if (features.rsiWithTrendContext && typeof features.rsiWithTrendContext === 'number') {
        // RSI below 30 suggests oversold (bullish), above 70 suggests overbought (bearish)
        if (features.rsiWithTrendContext < 30) rsiScore = 0.7; // Bullish
        else if (features.rsiWithTrendContext > 70) rsiScore = 0.3; // Bearish
        else rsiScore = 0.5; // Neutral
      }
      
      // 3. Check Bollinger Band position
      let bbScore = 0.5;
      if (features.bbPosition && typeof features.bbPosition === 'number') {
        // Position in Bollinger Bands (0 = lower band, 1 = upper band)
        bbScore = 1 - features.bbPosition; // Lower = more bullish potential
      }
      
      // 4. Check pattern strengths
      let patternScore = 0.5;
      if (
        features.bullishPatternStrength && 
        features.bearishPatternStrength && 
        typeof features.bullishPatternStrength === 'number' &&
        typeof features.bearishPatternStrength === 'number'
      ) {
        const bullStrength = features.bullishPatternStrength;
        const bearStrength = features.bearishPatternStrength;
        
        if (bullStrength > bearStrength) {
          patternScore = 0.5 + (bullStrength - bearStrength) / 2;
        } else {
          patternScore = 0.5 - (bearStrength - bullStrength) / 2;
        }
      }
      
      // 5. Check support/resistance proximity
      let srScore = 0.5;
      if (
        features.nearestSupportDistance && 
        features.nearestResistanceDistance &&
        typeof features.nearestSupportDistance === 'number' &&
        typeof features.nearestResistanceDistance === 'number'
      ) {
        // If closer to support than resistance, more bullish
        if (features.nearestSupportDistance < features.nearestResistanceDistance) {
          srScore = 0.5 + (features.nearestResistanceDistance - features.nearestSupportDistance) / 2;
        } else {
          srScore = 0.5 - (features.nearestSupportDistance - features.nearestResistanceDistance) / 2;
        }
      }
      
      // Combine scores with different weights
      const weights = {
        trend: 0.3,
        rsi: 0.15,
        bb: 0.15,
        pattern: 0.2,
        sr: 0.2
      };
      
      const normalizedTrendScore = (trendScore + 1) / 2; // Convert from [-1,1] to [0,1]
      
      const probability = 
        weights.trend * normalizedTrendScore +
        weights.rsi * rsiScore +
        weights.bb * bbScore +
        weights.pattern * patternScore +
        weights.sr * srScore;
      
      // Calculate confidence based on feature availability and consistency
      const availableFeatures = [
        trendScore !== 0,
        rsiScore !== 0,
        bbScore !== 0.5,
        patternScore !== 0.5,
        srScore !== 0.5
      ].filter(Boolean).length;
      
      const featureConsistency = 1 - Math.sqrt(
        Math.pow(normalizedTrendScore - probability, 2) +
        Math.pow(rsiScore - probability, 2) +
        Math.pow(bbScore - probability, 2) +
        Math.pow(patternScore - probability, 2) +
        Math.pow(srScore - probability, 2)
      ) / Math.sqrt(5);
      
      const confidence = 
        (availableFeatures / 5) * 0.5 + // More features = higher confidence
        featureConsistency * 0.5;       // More consistent features = higher confidence
      
      return {
        probability: Math.max(0, Math.min(1, probability)), // Ensure between 0 and 1
        confidence: Math.max(0, Math.min(1, confidence))    // Ensure between 0 and 1
      };
    } catch (error) {
      console.error('Error calculating prediction:', error);
      // Return a neutral prediction with low confidence
      return { probability: 0.5, confidence: 0.1 };
    }
  }

  /**
   * Save prediction result to database
   */
  protected async savePredictionResult(result: DirectionPredictionResult): Promise<void> {
    try {
      if (!this.modelId) {
        throw new Error('Model not initialized');
      }

      // Calculate prediction time based on timeframe
      const predictionTime = this.calculatePredictionTime(result.timestamp, result.timeframe);

      await prisma.cryptoPriceDirectionPrediction.create({
        data: {
          modelId: this.modelId,
          symbol: result.symbol,
          timestamp: result.timestamp,
          predictionTime,
          probability: result.probability,
          direction: result.direction,
          confidence: result.confidence,
          timeframe: result.timeframe,
          featureSnapshot: {} // Would store the features used for prediction
        }
      });
    } catch (error) {
      console.error('Error saving prediction result:', error);
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

      // Get all predictions with known outcomes
      const predictions = await prisma.cryptoPriceDirectionPrediction.findMany({
        where: {
          modelId: this.modelId,
          actualOutcome: {
            not: null
          }
        }
      });

      if (predictions.length === 0) {
        return 0;
      }

      // Calculate accuracy
      const correctPredictions = predictions.filter(
        p => p.direction === p.actualOutcome
      ).length;
      
      const accuracy = correctPredictions / predictions.length;

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
      console.error('Error updating accuracy:', error);
      return 0;
    }
  }
}