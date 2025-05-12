/**
 * Types for prediction models
 */

export interface PredictionModelInput {
  symbol: string;
  features: Record<string, any>;
  timestamp: Date;
}

export interface DirectionPredictionResult {
  symbol: string;
  timestamp: Date;
  probability: number; // 0-1 probability of price increase
  direction: 'up' | 'down';
  confidence: number; // 0-1 confidence score
  timeframe: string; // e.g., '1h', '4h', '1d'
  modelVersion: string;
}

export interface VolatilityPredictionResult {
  symbol: string;
  timestamp: Date;
  expectedVolatility: number; // Percentage
  volatilityRange: {
    min: number;
    max: number;
  };
  confidence: number; // 0-1 confidence score
  timeframe: string; // e.g., '1h', '4h', '1d'
  modelVersion: string;
}

export interface KeyLevelPredictionResult {
  symbol: string;
  timestamp: Date;
  levels: Array<{
    price: number;
    type: 'support' | 'resistance';
    strength: number; // 0-1 strength score
  }>;
  confidence: number; // 0-1 confidence score
  timeframe: string; // e.g., '1h', '4h', '1d'
  modelVersion: string;
}

export interface PredictionModelConfig {
  modelType: 'direction' | 'volatility' | 'keyLevels';
  timeframe: string; // e.g., '1h', '4h', '1d'
  featureSet: string[]; // List of features to use
  lookbackPeriod: number; // Number of periods to look back
  version: string;
  hyperparameters?: Record<string, any>;
}