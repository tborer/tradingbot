import { PredictionModelInput, PredictionModelConfig } from './types';
import prisma from '@/lib/prisma';

/**
 * Base class for all prediction models
 */
export abstract class BasePredictionModel {
  protected config: PredictionModelConfig;
  protected modelId: string | null = null;

  constructor(config: PredictionModelConfig) {
    this.config = config;
  }

  /**
   * Initialize the model, creating a database entry if needed
   */
  async initialize(name: string, description?: string): Promise<string> {
    // Check if model exists in database
    const existingModel = await prisma.cryptoPredictionModel.findUnique({
      where: {
        name_version: {
          name,
          version: this.config.version
        }
      }
    });

    if (existingModel) {
      this.modelId = existingModel.id;
      return existingModel.id;
    }

    // Create new model entry
    const newModel = await prisma.cryptoPredictionModel.create({
      data: {
        name,
        type: this.config.modelType,
        version: this.config.version,
        description,
        configuration: this.config as any,
      }
    });

    this.modelId = newModel.id;
    return newModel.id;
  }

  /**
   * Prepare features for the model
   */
  protected async prepareFeatures(input: PredictionModelInput): Promise<Record<string, any>> {
    try {
      // Get comprehensive features for the symbol
      const features = await prisma.cryptoComprehensiveFeatures.findFirst({
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

      if (!features) {
        throw new Error(`No features found for ${input.symbol} at ${input.timestamp}`);
      }

      // Extract the model-ready features
      const modelReadyFeatures = features.modelReadyFeatures as Record<string, any>;

      // Filter to only include the features specified in the config
      if (this.config.featureSet.length > 0) {
        const filteredFeatures: Record<string, any> = {};
        for (const feature of this.config.featureSet) {
          if (feature in modelReadyFeatures) {
            filteredFeatures[feature] = modelReadyFeatures[feature];
          }
        }
        return filteredFeatures;
      }

      return modelReadyFeatures;
    } catch (error) {
      console.error('Error preparing features:', error);
      throw error;
    }
  }

  /**
   * Get historical data for the model
   */
  protected async getHistoricalData(symbol: string, lookbackPeriods: number): Promise<any[]> {
    try {
      // Get historical data for the symbol
      const historicalData = await prisma.cryptoHistoricalData.findMany({
        where: {
          symbol,
        },
        orderBy: {
          timestamp: 'desc'
        },
        take: lookbackPeriods
      });

      return historicalData;
    } catch (error) {
      console.error('Error getting historical data:', error);
      throw error;
    }
  }

  /**
   * Abstract method to be implemented by each model type
   */
  abstract predict(input: PredictionModelInput): Promise<any>;

  /**
   * Save prediction results to the database
   */
  protected abstract savePredictionResult(result: any): Promise<void>;

  /**
   * Update model accuracy based on actual outcomes
   */
  async updateAccuracy(): Promise<number> {
    // Implementation will depend on the model type
    return 0;
  }
}