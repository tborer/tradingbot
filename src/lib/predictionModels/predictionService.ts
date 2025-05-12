import { DirectionPredictionModel } from './directionPredictionModel';
import { VolatilityPredictionModel } from './volatilityPredictionModel';
import { KeyLevelsPredictionModel } from './keyLevelsPredictionModel';
import { PredictionModelInput, PredictionModelConfig } from './types';
import prisma from '@/lib/prisma';

/**
 * Service for managing prediction models
 */
export class PredictionService {
  private directionModels: Map<string, DirectionPredictionModel> = new Map();
  private volatilityModels: Map<string, VolatilityPredictionModel> = new Map();
  private keyLevelsModels: Map<string, KeyLevelsPredictionModel> = new Map();

  /**
   * Initialize the prediction service
   */
  async initialize(): Promise<void> {
    try {
      // Create default models if they don't exist
      await this.createDefaultModels();
      
      // Load existing models from database
      await this.loadModels();
    } catch (error) {
      console.error('Error initializing prediction service:', error);
      throw error;
    }
  }

  /**
   * Create default prediction models
   */
  private async createDefaultModels(): Promise<void> {
    try {
      // Direction prediction model - 1 hour timeframe
      const directionConfig1h: PredictionModelConfig = {
        modelType: 'direction',
        timeframe: '1h',
        featureSet: [
          'trendStrength',
          'rsiWithTrendContext',
          'bbPosition',
          'bullishPatternStrength',
          'bearishPatternStrength',
          'nearestSupportDistance',
          'nearestResistanceDistance'
        ],
        lookbackPeriod: 24,
        version: '1.0.0'
      };
      
      const directionModel1h = new DirectionPredictionModel(directionConfig1h);
      await directionModel1h.initialize('DirectionPredictor1h', 'Predicts price direction for 1-hour timeframe');
      this.directionModels.set('1h', directionModel1h);
      
      // Direction prediction model - 1 day timeframe
      const directionConfig1d: PredictionModelConfig = {
        modelType: 'direction',
        timeframe: '1d',
        featureSet: [
          'trendStrength',
          'rsiWithTrendContext',
          'bbPosition',
          'bullishPatternStrength',
          'bearishPatternStrength',
          'nearestSupportDistance',
          'nearestResistanceDistance',
          'priceVelocity',
          'trendConsistency'
        ],
        lookbackPeriod: 30,
        version: '1.0.0'
      };
      
      const directionModel1d = new DirectionPredictionModel(directionConfig1d);
      await directionModel1d.initialize('DirectionPredictor1d', 'Predicts price direction for 1-day timeframe');
      this.directionModels.set('1d', directionModel1d);
      
      // Volatility prediction model - 1 hour timeframe
      const volatilityConfig1h: PredictionModelConfig = {
        modelType: 'volatility',
        timeframe: '1h',
        featureSet: [
          'volatilityRatio',
          'rsiVelocity',
          'patternMaturity',
          'bbSqueezeStrength'
        ],
        lookbackPeriod: 24,
        version: '1.0.0'
      };
      
      const volatilityModel1h = new VolatilityPredictionModel(volatilityConfig1h);
      await volatilityModel1h.initialize('VolatilityPredictor1h', 'Predicts price volatility for 1-hour timeframe');
      this.volatilityModels.set('1h', volatilityModel1h);
      
      // Volatility prediction model - 1 day timeframe
      const volatilityConfig1d: PredictionModelConfig = {
        modelType: 'volatility',
        timeframe: '1d',
        featureSet: [
          'volatilityRatio',
          'rsiVelocity',
          'patternMaturity',
          'bbSqueezeStrength',
          'priceAcceleration'
        ],
        lookbackPeriod: 30,
        version: '1.0.0'
      };
      
      const volatilityModel1d = new VolatilityPredictionModel(volatilityConfig1d);
      await volatilityModel1d.initialize('VolatilityPredictor1d', 'Predicts price volatility for 1-day timeframe');
      this.volatilityModels.set('1d', volatilityModel1d);
      
      // Key levels prediction model - 1 day timeframe
      const keyLevelsConfig1d: PredictionModelConfig = {
        modelType: 'keyLevels',
        timeframe: '1d',
        featureSet: [
          'srStrength',
          'fibExtensionTargets',
          'trendEncoding'
        ],
        lookbackPeriod: 60,
        version: '1.0.0'
      };
      
      const keyLevelsModel1d = new KeyLevelsPredictionModel(keyLevelsConfig1d);
      await keyLevelsModel1d.initialize('KeyLevelsPredictor1d', 'Predicts key support and resistance levels for 1-day timeframe');
      this.keyLevelsModels.set('1d', keyLevelsModel1d);
    } catch (error) {
      console.error('Error creating default models:', error);
      throw error;
    }
  }

  /**
   * Load existing models from database
   */
  private async loadModels(): Promise<void> {
    try {
      const models = await prisma.cryptoPredictionModel.findMany();
      
      for (const model of models) {
        const config = model.configuration as PredictionModelConfig;
        
        if (model.type === 'direction') {
          const directionModel = new DirectionPredictionModel(config);
          await directionModel.initialize(model.name);
          this.directionModels.set(config.timeframe, directionModel);
        } else if (model.type === 'volatility') {
          const volatilityModel = new VolatilityPredictionModel(config);
          await volatilityModel.initialize(model.name);
          this.volatilityModels.set(config.timeframe, volatilityModel);
        } else if (model.type === 'keyLevels') {
          const keyLevelsModel = new KeyLevelsPredictionModel(config);
          await keyLevelsModel.initialize(model.name);
          this.keyLevelsModels.set(config.timeframe, keyLevelsModel);
        }
      }
    } catch (error) {
      console.error('Error loading models:', error);
      throw error;
    }
  }

  /**
   * Get direction prediction model for a specific timeframe
   */
  getDirectionModel(timeframe: string): DirectionPredictionModel | undefined {
    return this.directionModels.get(timeframe);
  }

  /**
   * Get volatility prediction model for a specific timeframe
   */
  getVolatilityModel(timeframe: string): VolatilityPredictionModel | undefined {
    return this.volatilityModels.get(timeframe);
  }

  /**
   * Get key levels prediction model for a specific timeframe
   */
  getKeyLevelsModel(timeframe: string): KeyLevelsPredictionModel | undefined {
    return this.keyLevelsModels.get(timeframe);
  }

  /**
   * Generate predictions for a symbol
   */
  async generatePredictions(symbol: string): Promise<{
    direction: any;
    volatility: any;
    keyLevels: any;
  }> {
    try {
      const timestamp = new Date();
      const input: PredictionModelInput = {
        symbol,
        timestamp,
        features: {}
      };
      
      // Generate predictions using all available models
      const directionPrediction1h = await this.generateDirectionPrediction(input, '1h');
      const directionPrediction1d = await this.generateDirectionPrediction(input, '1d');
      
      const volatilityPrediction1h = await this.generateVolatilityPrediction(input, '1h');
      const volatilityPrediction1d = await this.generateVolatilityPrediction(input, '1d');
      
      const keyLevelsPrediction1d = await this.generateKeyLevelsPrediction(input, '1d');
      
      return {
        direction: {
          '1h': directionPrediction1h,
          '1d': directionPrediction1d
        },
        volatility: {
          '1h': volatilityPrediction1h,
          '1d': volatilityPrediction1d
        },
        keyLevels: {
          '1d': keyLevelsPrediction1d
        }
      };
    } catch (error) {
      console.error(`Error generating predictions for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Generate direction prediction
   */
  private async generateDirectionPrediction(input: PredictionModelInput, timeframe: string): Promise<any> {
    try {
      const model = this.getDirectionModel(timeframe);
      if (!model) {
        throw new Error(`No direction model found for timeframe ${timeframe}`);
      }
      
      return await model.predict(input);
    } catch (error) {
      console.error(`Error generating direction prediction for ${input.symbol} (${timeframe}):`, error);
      return null;
    }
  }

  /**
   * Generate volatility prediction
   */
  private async generateVolatilityPrediction(input: PredictionModelInput, timeframe: string): Promise<any> {
    try {
      const model = this.getVolatilityModel(timeframe);
      if (!model) {
        throw new Error(`No volatility model found for timeframe ${timeframe}`);
      }
      
      return await model.predict(input);
    } catch (error) {
      console.error(`Error generating volatility prediction for ${input.symbol} (${timeframe}):`, error);
      return null;
    }
  }

  /**
   * Generate key levels prediction
   */
  private async generateKeyLevelsPrediction(input: PredictionModelInput, timeframe: string): Promise<any> {
    try {
      const model = this.getKeyLevelsModel(timeframe);
      if (!model) {
        throw new Error(`No key levels model found for timeframe ${timeframe}`);
      }
      
      return await model.predict(input);
    } catch (error) {
      console.error(`Error generating key levels prediction for ${input.symbol} (${timeframe}):`, error);
      return null;
    }
  }

  /**
   * Update model accuracies based on actual outcomes
   */
  async updateModelAccuracies(): Promise<void> {
    try {
      // Update direction model accuracies
      for (const [timeframe, model] of this.directionModels.entries()) {
        const accuracy = await model.updateAccuracy();
        console.log(`Updated direction model accuracy for ${timeframe}: ${accuracy}`);
      }
      
      // Update volatility model accuracies
      for (const [timeframe, model] of this.volatilityModels.entries()) {
        const accuracy = await model.updateAccuracy();
        console.log(`Updated volatility model accuracy for ${timeframe}: ${accuracy}`);
      }
      
      // Update key levels model accuracies
      for (const [timeframe, model] of this.keyLevelsModels.entries()) {
        const accuracy = await model.updateAccuracy();
        console.log(`Updated key levels model accuracy for ${timeframe}: ${accuracy}`);
      }
    } catch (error) {
      console.error('Error updating model accuracies:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const predictionService = new PredictionService();