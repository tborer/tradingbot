import prisma from '@/lib/prisma';
import { schedulingLogger } from '@/lib/schedulingLogger';

/**
 * Calculate the strength of patterns based on confidence and completion
 */
export function calculatePatternStrength(patterns: any[]): number {
  if (!patterns || patterns.length === 0) return 0;
  
  // Weight by confidence and completion
  let totalStrength = 0;
  for (const pattern of patterns) {
    const confidence = pattern.confidence || 0.5;
    const completion = pattern.completion_percentage || 50;
    totalStrength += (confidence * completion / 100);
  }
  
  return totalStrength / patterns.length;
}

/**
 * Encode Fibonacci targets into a structured format
 */
export function encodeFibonacciTargets(fibData: any): any {
  if (!fibData) {
    console.log(`Cannot encode Fibonacci targets: missing data`);
    return [];
  }
  
  try {
    // Handle special string values like "none" that aren't valid JSON
    if (typeof fibData === 'string') {
      if (fibData.toLowerCase() === 'none') {
        console.log(`Fibonacci data is 'none', returning empty array`);
        return [];
      }
      
      try {
        console.log(`Attempting to parse Fibonacci data string`);
        fibData = JSON.parse(fibData);
      } catch (e) {
        console.error(`Could not parse Fibonacci data string: "${fibData.substring(0, 50)}${fibData.length > 50 ? '...' : ''}" - ${e.message}`);
        return [];
      }
    }
    
    // Handle non-array Fibonacci data
    if (!Array.isArray(fibData)) {
      console.log(`Fibonacci data is not an array, it's a ${typeof fibData}`);
      
      // If it's an object with level properties, convert to array
      if (typeof fibData === 'object' && fibData !== null) {
        // Check if it's a Fibonacci levels object with level0, level236, etc.
        if ('level0' in fibData || 'level236' in fibData || 'level382' in fibData) {
          console.log(`Converting Fibonacci levels object to array`);
          const levels = [];
          
          if ('level0' in fibData) levels.push({ ratio: 0, price: fibData.level0, strength: 1, proximity: 0 });
          if ('level236' in fibData) levels.push({ ratio: 0.236, price: fibData.level236, strength: 1, proximity: 0 });
          if ('level382' in fibData) levels.push({ ratio: 0.382, price: fibData.level382, strength: 1, proximity: 0 });
          if ('level500' in fibData) levels.push({ ratio: 0.5, price: fibData.level500, strength: 1, proximity: 0 });
          if ('level618' in fibData) levels.push({ ratio: 0.618, price: fibData.level618, strength: 1, proximity: 0 });
          if ('level786' in fibData) levels.push({ ratio: 0.786, price: fibData.level786, strength: 1, proximity: 0 });
          if ('level1000' in fibData) levels.push({ ratio: 1, price: fibData.level1000, strength: 1, proximity: 0 });
          
          return levels;
        }
        
        return [];
      }
      
      return [];
    }
    
    // Transform into a more structured format
    console.log(`Transforming ${fibData.length} Fibonacci levels`);
    return fibData.map(level => {
      if (!level || typeof level !== 'object') {
        console.log(`Invalid Fibonacci level: ${level}, using defaults`);
        return { ratio: 0, price: 0, strength: 1, proximity: 0 };
      }
      
      return {
        ratio: level.ratio || 0,
        price: level.price || 0,
        strength: level.strength || 1,
        proximity: level.proximity || 0,
      };
    });
  } catch (error) {
    console.error("Error encoding Fibonacci targets:", error);
    console.error(`Fibonacci data: ${typeof fibData === 'string' ? fibData.substring(0, 100) : JSON.stringify(fibData).substring(0, 100)}`);
    return [];
  }
}

/**
 * Encode support/resistance levels with strength metrics
 */
export function encodeSupportResistanceStrength(srLevels: any): any {
  if (!srLevels) return null;
  
  try {
    // If srLevels is a string, parse it
    const levels = typeof srLevels === 'string' ? JSON.parse(srLevels) : srLevels;
    
    if (!Array.isArray(levels)) {
      return {
        support: [],
        resistance: [],
      };
    }
    
    // Separate support and resistance levels
    const support = levels
      .filter(level => level.type === 'support')
      .map(level => ({
        price: level.price,
        strength: level.strength || level.confidence || 1,
        touches: level.touches || 1,
      }));
    
    const resistance = levels
      .filter(level => level.type === 'resistance')
      .map(level => ({
        price: level.price,
        strength: level.strength || level.confidence || 1,
        touches: level.touches || 1,
      }));
    
    return {
      support,
      resistance,
    };
  } catch (error) {
    console.error("Error encoding support/resistance strength:", error);
    return {
      support: [],
      resistance: [],
    };
  }
}

/**
 * Get breakout patterns from technical analysis data
 */
export async function getBreakoutPatterns(
  symbol: string,
  date: Date
): Promise<any[]> {
  try {
    // Check if prisma is defined
    if (!prisma) {
      console.error("Prisma client is undefined in getBreakoutPatterns");
      return [];
    }
    
    let analysis;
    try {
      analysis = await prisma.technicalAnalysisOutput.findFirst({
        where: {
          symbol,
          timestamp: {
            lte: date,
          },
          breakoutDetected: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
      });
    } catch (dbError) {
      console.error(`Database error in getBreakoutPatterns for ${symbol}:`, dbError);
      return [];
    }
    
    if (!analysis || !analysis.breakoutType) {
      return [];
    }
    
    try {
      // If breakoutType is a string, parse it
      if (typeof analysis.breakoutType === 'string') {
        const pattern = {
          type: analysis.breakoutType,
          direction: analysis.recommendation === 'buy' ? 'bullish' : 'bearish',
          confidence: analysis.confidenceScore || 0.5,
          completion_percentage: 100, // Assume complete if detected
        };
        return [pattern];
      }
      
      return [{
        type: analysis.breakoutType,
        direction: analysis.recommendation === 'buy' ? 'bullish' : 'bearish',
        confidence: analysis.confidenceScore || 0.5,
        completion_percentage: 100,
      }];
    } catch (error) {
      console.error("Error getting breakout patterns:", error);
      return [];
    }
  } catch (error) {
    console.error(`Error in getBreakoutPatterns for ${symbol}:`, error);
    return [];
  }
}

/**
 * Get trend lines from technical analysis data
 */
export async function getTrendLines(
  symbol: string,
  date: Date
): Promise<any> {
  try {
    // Check if prisma is defined
    if (!prisma) {
      console.error("Prisma client is undefined in getTrendLines");
      return {
        strength: 0,
        direction: 'neutral',
        duration_days: 0,
        average_deviation: 0,
      };
    }
    
    let analysis;
    try {
      analysis = await prisma.technicalAnalysisOutput.findFirst({
        where: {
          symbol,
          timestamp: {
            lte: date,
          },
          rawData: {
            not: null,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
      });
    } catch (dbError) {
      console.error(`Database error in getTrendLines for ${symbol}:`, dbError);
      return {
        strength: 0,
        direction: 'neutral',
        duration_days: 0,
        average_deviation: 0,
      };
    }
    
    if (!analysis || !analysis.rawData) {
      return {
        strength: 0,
        direction: 'neutral',
        duration_days: 0,
        average_deviation: 0,
      };
    }
    
    try {
      const rawData = typeof analysis.rawData === 'string' 
        ? JSON.parse(analysis.rawData) 
        : analysis.rawData;
      
      // Check if rawData has trend information
      if (rawData.trend) {
        return {
          strength: rawData.trend.strength || 0,
          direction: rawData.trend.direction || 'neutral',
          duration_days: rawData.trend.duration || 0,
          average_deviation: rawData.trend.deviation || 0,
        };
      }
      
      // If no explicit trend data, infer from EMAs
      if (analysis.ema12 && analysis.ema26) {
        const direction = analysis.ema12 > analysis.ema26 ? 'up' : 'down';
        const strength = Math.abs((analysis.ema12 - analysis.ema26) / analysis.ema26);
        
        return {
          strength,
          direction,
          duration_days: 1, // Default
          average_deviation: 0, // Default
        };
      }
      
      return {
        strength: 0,
        direction: 'neutral',
        duration_days: 0,
        average_deviation: 0,
      };
    } catch (error) {
      console.error("Error getting trend lines:", error);
      return {
        strength: 0,
        direction: 'neutral',
        duration_days: 0,
        average_deviation: 0,
      };
    }
  } catch (error) {
    console.error(`Error in getTrendLines for ${symbol}:`, error);
    return {
      strength: 0,
      direction: 'neutral',
      duration_days: 0,
      average_deviation: 0,
    };
  }
}

/**
 * Get Fibonacci levels from technical analysis data
 */
export async function getFibonacciLevels(
  symbol: string,
  date: Date
): Promise<any> {
  try {
    // Check if prisma is defined
    if (!prisma) {
      console.error("Prisma client is undefined in getFibonacciLevels");
      return [];
    }
    
    let analysis;
    try {
      analysis = await prisma.technicalAnalysisOutput.findFirst({
        where: {
          symbol,
          timestamp: {
            lte: date,
          },
          fibonacciLevels: {
            not: null,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
      });
    } catch (dbError) {
      console.error(`Database error in getFibonacciLevels for ${symbol}:`, dbError);
      return [];
    }
    
    if (!analysis || !analysis.fibonacciLevels) {
      return [];
    }
    
    try {
      return typeof analysis.fibonacciLevels === 'string'
        ? JSON.parse(analysis.fibonacciLevels)
        : analysis.fibonacciLevels;
    } catch (error) {
      console.error("Error getting Fibonacci levels:", error);
      return [];
    }
  } catch (error) {
    console.error(`Error in getFibonacciLevels for ${symbol}:`, error);
    return [];
  }
}

/**
 * Get support/resistance levels from technical analysis data
 */
export async function getSupportResistanceLevels(
  symbol: string,
  date: Date
): Promise<any> {
  try {
    // Check if prisma is defined
    if (!prisma) {
      console.error("Prisma client is undefined in getSupportResistanceLevels");
      return [];
    }
    
    let analysis;
    try {
      analysis = await prisma.technicalAnalysisOutput.findFirst({
        where: {
          symbol,
          timestamp: {
            lte: date,
          },
          OR: [
            { supportLevel: { not: null } },
            { resistanceLevel: { not: null } },
          ],
        },
        orderBy: {
          timestamp: 'desc',
        },
      });
    } catch (dbError) {
      console.error(`Database error in getSupportResistanceLevels for ${symbol}:`, dbError);
      return [];
    }
    
    if (!analysis) {
      return [];
    }
    
    const levels = [];
    
    if (analysis.supportLevel) {
      levels.push({
        type: 'support',
        price: analysis.supportLevel,
        strength: 1,
        touches: 1,
      });
    }
    
    if (analysis.resistanceLevel) {
      levels.push({
        type: 'resistance',
        price: analysis.resistanceLevel,
        strength: 1,
        touches: 1,
      });
    }
    
    return levels;
  } catch (error) {
    console.error(`Error in getSupportResistanceLevels for ${symbol}:`, error);
    return [];
  }
}

/**
 * Generate pattern encodings for a cryptocurrency
 */
export async function generatePatternEncodings(
  symbol: string,
  date: Date,
  processId?: string,
  userId?: string
): Promise<{
  bullishPatternStrength: number;
  bearishPatternStrength: number;
  patternCompletion: any;
  trendEncoding: any;
  fibExtensionTargets: any;
  srStrength: any;
}> {
  try {
    console.log(`Generating pattern encodings for ${symbol} at ${date.toISOString()}`);
    
    if (processId && userId) {
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'PATTERN_ENCODINGS_START',
        symbol,
        message: `Starting pattern encodings generation for ${symbol}`
      });
    }
    
    // Get pattern data with error handling
    let patternData = [];
    try {
      patternData = await getBreakoutPatterns(symbol, date);
      console.log(`Retrieved ${patternData.length} breakout patterns`);
    } catch (error) {
      console.error(`Error getting breakout patterns for ${symbol}:`, error);
      if (processId && userId) {
        await schedulingLogger.log({
          processId,
          userId,
          level: 'ERROR',
          category: 'ANALYSIS',
          operation: 'PATTERN_DATA_ERROR',
          symbol,
          message: `Error getting breakout patterns: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
      patternData = [];
    }
    
    // Get trend data with error handling
    let trendData;
    try {
      trendData = await getTrendLines(symbol, date);
      console.log(`Retrieved trend data with direction: ${trendData.direction}`);
    } catch (error) {
      console.error(`Error getting trend lines for ${symbol}:`, error);
      if (processId && userId) {
        await schedulingLogger.log({
          processId,
          userId,
          level: 'ERROR',
          category: 'ANALYSIS',
          operation: 'TREND_DATA_ERROR',
          symbol,
          message: `Error getting trend lines: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
      trendData = {
        strength: 0,
        direction: 'neutral',
        duration_days: 0,
        average_deviation: 0,
      };
    }
    
    // Get Fibonacci data with error handling
    let fibData = [];
    try {
      fibData = await getFibonacciLevels(symbol, date);
      console.log(`Retrieved Fibonacci data: ${typeof fibData === 'string' ? fibData.substring(0, 50) : JSON.stringify(fibData).substring(0, 50)}...`);
    } catch (error) {
      console.error(`Error getting Fibonacci levels for ${symbol}:`, error);
      if (processId && userId) {
        await schedulingLogger.log({
          processId,
          userId,
          level: 'ERROR',
          category: 'ANALYSIS',
          operation: 'FIBONACCI_DATA_ERROR',
          symbol,
          message: `Error getting Fibonacci levels: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
      fibData = [];
    }
    
    // Get support/resistance levels with error handling
    let srLevels = [];
    try {
      srLevels = await getSupportResistanceLevels(symbol, date);
      console.log(`Retrieved ${srLevels.length} support/resistance levels`);
    } catch (error) {
      console.error(`Error getting support/resistance levels for ${symbol}:`, error);
      if (processId && userId) {
        await schedulingLogger.log({
          processId,
          userId,
          level: 'ERROR',
          category: 'ANALYSIS',
          operation: 'SR_LEVELS_ERROR',
          symbol,
          message: `Error getting support/resistance levels: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
      srLevels = [];
    }
    
    // Calculate bullish and bearish pattern strengths
    const bullishPatterns = patternData.filter(p => p.direction === 'bullish');
    const bearishPatterns = patternData.filter(p => p.direction === 'bearish');
    
    console.log(`Found ${bullishPatterns.length} bullish patterns and ${bearishPatterns.length} bearish patterns`);
    
    const bullishPatternStrength = calculatePatternStrength(bullishPatterns);
    const bearishPatternStrength = calculatePatternStrength(bearishPatterns);
    
    // Pattern completion data
    const patternCompletion = patternData.map(p => ({
      type: p.type || 'unknown',
      completion: p.completion_percentage || 0,
      confidence: p.confidence || 0,
    }));
    
    // Trend encoding
    const trendEncoding = {
      strength: trendData.strength || 0,
      direction: trendData.direction === 'up' ? 1 : (trendData.direction === 'down' ? -1 : 0),
      duration: trendData.duration_days || 0,
      deviation: trendData.average_deviation || 0,
    };
    
    // Fibonacci extension targets
    const fibExtensionTargets = encodeFibonacciTargets(fibData);
    console.log(`Encoded ${Array.isArray(fibExtensionTargets) ? fibExtensionTargets.length : 0} Fibonacci targets`);
    
    // Support/resistance strength encoding
    const srStrength = encodeSupportResistanceStrength(srLevels);
    console.log(`Encoded support/resistance strength with ${srStrength.support.length} support and ${srStrength.resistance.length} resistance levels`);
    
    console.log(`Successfully generated pattern encodings for ${symbol}`);
    
    return {
      bullishPatternStrength,
      bearishPatternStrength,
      patternCompletion,
      trendEncoding,
      fibExtensionTargets,
      srStrength,
    };
  } catch (error) {
    console.error(`Error generating pattern encodings for ${symbol}:`, error);
    // Return default values in case of error
    return {
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
}

/**
 * Save pattern encodings to the database
 */
export async function savePatternEncodings(
  symbol: string,
  encodings: any
): Promise<any> {
  try {
    // Check if prisma is defined
    if (!prisma) {
      console.error("Prisma client is undefined in savePatternEncodings");
      throw new Error("Prisma client is undefined");
    }
    
    return prisma.cryptoTechnicalPatternEncodings.create({
      data: {
        symbol,
        bullishPatternStrength: encodings.bullishPatternStrength,
        bearishPatternStrength: encodings.bearishPatternStrength,
        patternCompletion: encodings.patternCompletion,
        trendEncoding: encodings.trendEncoding,
        fibExtensionTargets: encodings.fibExtensionTargets,
        srStrength: encodings.srStrength,
      },
    });
  } catch (error) {
    console.error(`Error saving pattern encodings for ${symbol}:`, error);
    throw error;
  }
}