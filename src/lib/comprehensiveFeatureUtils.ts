import prisma from '@/lib/prisma';
import { calculateDerivedIndicators } from '@/lib/derivedIndicatorsUtils';
import { generateTemporalFeatures } from '@/lib/temporalFeaturesUtils';
import { generatePatternEncodings } from '@/lib/patternEncodingsUtils';

/**
 * Generate a comprehensive set of features for a cryptocurrency
 * @param symbol The cryptocurrency symbol
 * @param timeframe The timeframe for analysis (e.g., 'hourly', 'daily')
 * @param date The date for which to generate features
 * @returns A comprehensive feature set combining all feature types
 */
export async function generateComprehensiveFeatureSet(
  symbol: string,
  timeframe: string = 'hourly',
  date: Date = new Date(),
  processId?: string,
  userId?: string
): Promise<any> {
  try {
    console.log(`Generating comprehensive feature set for ${symbol} (${timeframe}) at ${date.toISOString()}`);
    
    // Check if prisma is defined
    if (!prisma) {
      console.error("Prisma client is undefined in generateComprehensiveFeatureSet");
      throw new Error("Prisma client is undefined");
    }
    
    // Get the most recent technical analysis data
    const technicalAnalysis = await prisma.technicalAnalysisOutput.findFirst({
      where: {
        symbol,
        timestamp: {
          lte: date,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      include: {
        derivedIndicators: true,
      },
    });

    if (!technicalAnalysis) {
      console.error(`No technical analysis data found for ${symbol}`);
      return {
        crypto: symbol,
        timeframe,
        date,
        price: 0,
        original_indicators: {
          sma20: null,
          sma50: null,
          ema12: null,
          ema26: null,
          rsi14: null,
          bollingerUpper: null,
          bollingerMiddle: null,
          bollingerLower: null,
          supportLevel: null,
          resistanceLevel: null,
          breakoutDetected: false,
          breakoutType: 'none',
          recommendation: 'hold',
          confidenceScore: 0,
        },
        derived_indicators: {
          trendStrength: null,
          volatilityRatio: null,
          rsiWithTrendContext: null,
          maConvergence: null,
          nearestSupportDistance: null,
          nearestResistanceDistance: null,
          fibConfluenceStrength: null,
          bbPosition: null,
        },
        temporal_features: {
          priceVelocity: 0,
          priceAcceleration: 0,
          rsiVelocity: 0,
          trendConsistency: 0,
          patternMaturity: 0,
          srTestFrequency: 0,
          bbSqueezeStrength: 0,
          maCrossoverRecent: false,
        },
        pattern_encodings: {
          bullishPatternStrength: 0,
          bearishPatternStrength: 0,
          patternCompletion: [],
          trendEncoding: {
            strength: 0,
            direction: 0,
            duration: 0,
            deviation: 0,
          },
          fibExtensionTargets: [],
          srStrength: {
            support: [],
            resistance: [],
          },
        },
        generated_at: new Date()
      };
    }

    console.log(`Found technical analysis data from ${technicalAnalysis.timestamp}`);

    // Get price data from technical analysis
    let priceData = null;
    try {
      if (technicalAnalysis.rawData) {
        priceData = typeof technicalAnalysis.rawData === 'string' ? 
          JSON.parse(technicalAnalysis.rawData) : 
          technicalAnalysis.rawData;
        console.log(`Successfully parsed price data from rawData`);
      }
    } catch (error) {
      console.error(`Error parsing rawData:`, error);
      priceData = null;
    }

    // Generate derived indicators if not already available
    let derivedIndicators = technicalAnalysis.derivedIndicators;
    if (!derivedIndicators) {
      console.log(`No derived indicators found, calculating them now`);
      try {
        const calculatedIndicators = calculateDerivedIndicators(technicalAnalysis);
        derivedIndicators = calculatedIndicators;
        console.log(`Successfully calculated derived indicators`);
      } catch (error) {
        console.error(`Error calculating derived indicators:`, error);
        derivedIndicators = {
          trendStrength: null,
          volatilityRatio: null,
          rsiWithTrendContext: null,
          maConvergence: null,
          nearestSupportDistance: null,
          nearestResistanceDistance: null,
          fibConfluenceStrength: null,
          bbPosition: null,
        };
      }
    } else {
      console.log(`Using existing derived indicators`);
    }

    // Generate temporal features
    let temporalFeatures;
    try {
      console.log(`Generating temporal features`);
      temporalFeatures = await generateTemporalFeatures(symbol, date);
      console.log(`Successfully generated temporal features`);
    } catch (error) {
      console.error(`Error generating temporal features:`, error);
      temporalFeatures = {
        priceVelocity: 0,
        priceAcceleration: 0,
        rsiVelocity: 0,
        trendConsistency: 0,
        patternMaturity: 0,
        srTestFrequency: 0,
        bbSqueezeStrength: 0,
        maCrossoverRecent: false,
      };
    }

    // Generate pattern encodings
    let patternEncodings;
    try {
      console.log(`Generating pattern encodings`);
      patternEncodings = await generatePatternEncodings(symbol, date, processId, userId);
      console.log(`Successfully generated pattern encodings`);
    } catch (error) {
      console.error(`Error generating pattern encodings:`, error);
      patternEncodings = {
        bullishPatternStrength: 0,
        bearishPatternStrength: 0,
        patternCompletion: [],
        trendEncoding: {
          strength: 0,
          direction: 0,
          duration: 0,
          deviation: 0,
        },
        fibExtensionTargets: [],
        srStrength: {
          support: [],
          resistance: [],
        },
      };
    }

    // Combine all features into a single feature vector
    console.log(`Combining all features into a comprehensive feature set`);
    return {
      // Basic information
      crypto: symbol,
      timeframe,
      date,
      
      // Raw price data
      price: priceData?.currentPrice || priceData?.price || technicalAnalysis.bollingerMiddle || 0,
      
      // Original indicators
      original_indicators: {
        sma20: technicalAnalysis.sma20,
        sma50: technicalAnalysis.sma50,
        ema12: technicalAnalysis.ema12,
        ema26: technicalAnalysis.ema26,
        rsi14: technicalAnalysis.rsi14,
        bollingerUpper: technicalAnalysis.bollingerUpper,
        bollingerMiddle: technicalAnalysis.bollingerMiddle,
        bollingerLower: technicalAnalysis.bollingerLower,
        supportLevel: technicalAnalysis.supportLevel,
        resistanceLevel: technicalAnalysis.resistanceLevel,
        breakoutDetected: technicalAnalysis.breakoutDetected || false,
        breakoutType: technicalAnalysis.breakoutType || 'none',
        recommendation: technicalAnalysis.recommendation || 'hold',
        confidenceScore: technicalAnalysis.confidenceScore || 0,
      },
      
      // Generated features
      derived_indicators: derivedIndicators,
      temporal_features: temporalFeatures,
      pattern_encodings: patternEncodings,
      
      // Feature timestamp
      generated_at: new Date()
    };
  } catch (error) {
    console.error(`Error generating comprehensive feature set for ${symbol}:`, error);
    // Return a default feature set instead of throwing an error
    return {
      crypto: symbol,
      timeframe,
      date,
      price: 0,
      original_indicators: {
        sma20: null,
        sma50: null,
        ema12: null,
        ema26: null,
        rsi14: null,
        bollingerUpper: null,
        bollingerMiddle: null,
        bollingerLower: null,
        supportLevel: null,
        resistanceLevel: null,
        breakoutDetected: false,
        breakoutType: 'none',
        recommendation: 'hold',
        confidenceScore: 0,
      },
      derived_indicators: {
        trendStrength: null,
        volatilityRatio: null,
        rsiWithTrendContext: null,
        maConvergence: null,
        nearestSupportDistance: null,
        nearestResistanceDistance: null,
        fibConfluenceStrength: null,
        bbPosition: null,
      },
      temporal_features: {
        priceVelocity: 0,
        priceAcceleration: 0,
        rsiVelocity: 0,
        trendConsistency: 0,
        patternMaturity: 0,
        srTestFrequency: 0,
        bbSqueezeStrength: 0,
        maCrossoverRecent: false,
      },
      pattern_encodings: {
        bullishPatternStrength: 0,
        bearishPatternStrength: 0,
        patternCompletion: [],
        trendEncoding: {
          strength: 0,
          direction: 0,
          duration: 0,
          deviation: 0,
        },
        fibExtensionTargets: [],
        srStrength: {
          support: [],
          resistance: [],
        },
      },
      generated_at: new Date()
    };
  }
}

/**
 * Flatten a nested object structure
 * @param obj The object to flatten
 * @param prefix Optional prefix for nested keys
 * @returns A flattened object with dot notation for nested keys
 */
export function flattenObject(obj: any, prefix: string = ''): Record<string, any> {
  return Object.keys(obj).reduce((acc: Record<string, any>, k: string) => {
    const pre = prefix.length ? prefix + '.' : '';
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      Object.assign(acc, flattenObject(obj[k], pre + k));
    } else {
      acc[pre + k] = obj[k];
    }
    return acc;
  }, {});
}

/**
 * Normalize feature values to appropriate scales
 * @param features The features to normalize
 * @returns Normalized features
 */
export function normalizeFeatures(features: Record<string, any>): Record<string, any> {
  const normalizedFeatures: Record<string, any> = {};
  
  // Define normalization rules for specific feature types
  const normalizationRules: Record<string, (value: any) => any> = {
    // RSI is already 0-100, normalize to 0-1
    'original_indicators.rsi14': (value) => value !== null ? value / 100 : null,
    
    // Normalize price-based features relative to current price
    'original_indicators.sma20': (value) => 
      value !== null && features.price ? (value - features.price) / features.price : null,
    'original_indicators.sma50': (value) => 
      value !== null && features.price ? (value - features.price) / features.price : null,
    'original_indicators.ema12': (value) => 
      value !== null && features.price ? (value - features.price) / features.price : null,
    'original_indicators.ema26': (value) => 
      value !== null && features.price ? (value - features.price) / features.price : null,
    'original_indicators.bollingerUpper': (value) => 
      value !== null && features.price ? (value - features.price) / features.price : null,
    'original_indicators.bollingerLower': (value) => 
      value !== null && features.price ? (value - features.price) / features.price : null,
    'original_indicators.supportLevel': (value) => 
      value !== null && features.price ? (value - features.price) / features.price : null,
    'original_indicators.resistanceLevel': (value) => 
      value !== null && features.price ? (value - features.price) / features.price : null,
  };
  
  // Apply normalization rules or pass through values
  for (const [key, value] of Object.entries(features)) {
    if (key in normalizationRules) {
      normalizedFeatures[key] = normalizationRules[key](value);
    } else if (typeof value === 'boolean') {
      // Convert booleans to 0/1
      normalizedFeatures[key] = value ? 1 : 0;
    } else if (value === null || value === undefined) {
      // Handle null/undefined values
      normalizedFeatures[key] = 0; // Default to 0 for missing values
    } else if (typeof value === 'number') {
      // Pass through numbers
      normalizedFeatures[key] = value;
    } else if (typeof value === 'string') {
      // For string values like recommendations, create one-hot encoding
      if (key === 'original_indicators.recommendation') {
        normalizedFeatures[`${key}_buy`] = value === 'buy' ? 1 : 0;
        normalizedFeatures[`${key}_sell`] = value === 'sell' ? 1 : 0;
        normalizedFeatures[`${key}_hold`] = value === 'hold' ? 1 : 0;
      } else {
        // For other strings, just pass through
        normalizedFeatures[key] = value;
      }
    } else if (Array.isArray(value)) {
      // For arrays, convert to string
      normalizedFeatures[key] = JSON.stringify(value);
    } else if (typeof value === 'object' && value !== null) {
      // For objects, convert to string
      normalizedFeatures[key] = JSON.stringify(value);
    } else {
      // For any other type, pass through
      normalizedFeatures[key] = value;
    }
  }
  
  return normalizedFeatures;
}

/**
 * Filter out features that aren't useful for prediction
 * @param features The features to filter
 * @returns Filtered features
 */
export function filterRelevantFeatures(features: Record<string, any>): Record<string, any> {
  const filteredFeatures: Record<string, any> = {};
  
  // Define keys to exclude
  const excludeKeys = [
    'generated_at', // Timestamp isn't predictive
    'date', // Date isn't predictive in raw form
    'timeframe', // Timeframe is constant in most cases
  ];
  
  // Copy only relevant features
  for (const [key, value] of Object.entries(features)) {
    if (!excludeKeys.includes(key) && !key.includes('JSON')) {
      filteredFeatures[key] = value;
    }
  }
  
  return filteredFeatures;
}

/**
 * Ensure consistent feature vector shape by filling in missing values
 * @param features The features to ensure consistency for
 * @returns Features with consistent shape
 */
export function ensureFeatureVectorConsistency(features: Record<string, any>): Record<string, any> {
  // Define expected feature keys and their default values
  const expectedFeatures: Record<string, any> = {
    // Basic info
    'crypto': '',
    'price': 0,
    
    // Original indicators
    'original_indicators.sma20': 0,
    'original_indicators.sma50': 0,
    'original_indicators.ema12': 0,
    'original_indicators.ema26': 0,
    'original_indicators.rsi14': 0,
    'original_indicators.bollingerUpper': 0,
    'original_indicators.bollingerMiddle': 0,
    'original_indicators.bollingerLower': 0,
    'original_indicators.supportLevel': 0,
    'original_indicators.resistanceLevel': 0,
    'original_indicators.breakoutDetected': 0,
    'original_indicators.recommendation_buy': 0,
    'original_indicators.recommendation_sell': 0,
    'original_indicators.recommendation_hold': 0,
    'original_indicators.confidenceScore': 0,
    
    // Derived indicators
    'derived_indicators.trendStrength': 0,
    'derived_indicators.volatilityRatio': 0,
    'derived_indicators.rsiWithTrendContext': 0,
    'derived_indicators.maConvergence': 0,
    'derived_indicators.nearestSupportDistance': 0,
    'derived_indicators.nearestResistanceDistance': 0,
    'derived_indicators.fibConfluenceStrength': 0,
    'derived_indicators.bbPosition': 0,
    
    // Temporal features
    'temporal_features.priceVelocity': 0,
    'temporal_features.priceAcceleration': 0,
    'temporal_features.rsiVelocity': 0,
    'temporal_features.trendConsistency': 0,
    'temporal_features.patternMaturity': 0,
    'temporal_features.srTestFrequency': 0,
    'temporal_features.bbSqueezeStrength': 0,
    'temporal_features.maCrossoverRecent': 0,
    
    // Pattern encodings
    'pattern_encodings.bullishPatternStrength': 0,
    'pattern_encodings.bearishPatternStrength': 0,
  };
  
  // Create a new object with all expected features
  const consistentFeatures = { ...expectedFeatures };
  
  // Override defaults with actual values where available
  for (const [key, value] of Object.entries(features)) {
    consistentFeatures[key] = value;
  }
  
  return consistentFeatures;
}

/**
 * Prepare feature vector for AI model consumption
 * @param featureSet The comprehensive feature set
 * @returns A prepared feature vector ready for model input
 */
export function prepareFeatureVectorForModel(featureSet: any): Record<string, any> {
  // Flatten nested structure for ML model input
  const flattenedFeatures = flattenObject(featureSet);
  
  // Normalize values to appropriate scales
  const normalizedFeatures = normalizeFeatures(flattenedFeatures);
  
  // Remove any features that aren't useful for prediction
  const filteredFeatures = filterRelevantFeatures(normalizedFeatures);
  
  // Ensure consistent feature vector shape
  return ensureFeatureVectorConsistency(filteredFeatures);
}

/**
 * Save comprehensive feature set to the database
 * @param symbol The cryptocurrency symbol
 * @param featureSet The comprehensive feature set
 * @returns The saved record
 */
export async function saveComprehensiveFeatureSet(
  symbol: string,
  featureSet: any
): Promise<any> {
  try {
    // Check if prisma is defined
    if (!prisma) {
      console.error("Prisma client is undefined in saveComprehensiveFeatureSet");
      throw new Error("Prisma client is undefined");
    }
    
    // Create a record in a new table to store the comprehensive feature set
    return prisma.cryptoComprehensiveFeatures.create({
      data: {
        symbol,
        timestamp: new Date(),
        featureSet: featureSet as any,
        modelReadyFeatures: prepareFeatureVectorForModel(featureSet) as any,
      },
    });
  } catch (error) {
    console.error(`Error in saveComprehensiveFeatureSet for ${symbol}:`, error);
    throw error;
  }
}