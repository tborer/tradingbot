import prisma from '@/lib/prisma';

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
  if (!fibData) return null;
  
  try {
    // Handle special string values like "none" that aren't valid JSON
    if (typeof fibData === 'string') {
      if (fibData.toLowerCase() === 'none') {
        return [];
      }
      
      try {
        fibData = JSON.parse(fibData);
      } catch (e) {
        console.log(`Could not parse Fibonacci data: ${fibData}`);
        return [];
      }
    }
    
    if (!Array.isArray(fibData)) {
      return [];
    }
    
    // Transform into a more structured format
    return fibData.map(level => ({
      ratio: level.ratio || 0,
      price: level.price || 0,
      strength: level.strength || 1,
      proximity: level.proximity || 0,
    }));
  } catch (error) {
    console.error("Error encoding Fibonacci targets:", error);
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
  const analysis = await prisma.technicalAnalysisOutput.findFirst({
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
}

/**
 * Get trend lines from technical analysis data
 */
export async function getTrendLines(
  symbol: string,
  date: Date
): Promise<any> {
  const analysis = await prisma.technicalAnalysisOutput.findFirst({
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
}

/**
 * Get Fibonacci levels from technical analysis data
 */
export async function getFibonacciLevels(
  symbol: string,
  date: Date
): Promise<any> {
  const analysis = await prisma.technicalAnalysisOutput.findFirst({
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
}

/**
 * Get support/resistance levels from technical analysis data
 */
export async function getSupportResistanceLevels(
  symbol: string,
  date: Date
): Promise<any> {
  const analysis = await prisma.technicalAnalysisOutput.findFirst({
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
}

/**
 * Generate pattern encodings for a cryptocurrency
 */
export async function generatePatternEncodings(
  symbol: string,
  date: Date
): Promise<{
  bullishPatternStrength: number;
  bearishPatternStrength: number;
  patternCompletion: any;
  trendEncoding: any;
  fibExtensionTargets: any;
  srStrength: any;
}> {
  // Get pattern data
  const patternData = await getBreakoutPatterns(symbol, date);
  const trendData = await getTrendLines(symbol, date);
  const fibData = await getFibonacciLevels(symbol, date);
  const srLevels = await getSupportResistanceLevels(symbol, date);
  
  // Calculate bullish and bearish pattern strengths
  const bullishPatterns = patternData.filter(p => p.direction === 'bullish');
  const bearishPatterns = patternData.filter(p => p.direction === 'bearish');
  
  const bullishPatternStrength = calculatePatternStrength(bullishPatterns);
  const bearishPatternStrength = calculatePatternStrength(bearishPatterns);
  
  // Pattern completion data
  const patternCompletion = patternData.map(p => ({
    type: p.type,
    completion: p.completion_percentage,
    confidence: p.confidence,
  }));
  
  // Trend encoding
  const trendEncoding = {
    strength: trendData.strength,
    direction: trendData.direction === 'up' ? 1 : -1,
    duration: trendData.duration_days,
    deviation: trendData.average_deviation,
  };
  
  // Fibonacci extension targets
  const fibExtensionTargets = encodeFibonacciTargets(fibData);
  
  // Support/resistance strength encoding
  const srStrength = encodeSupportResistanceStrength(srLevels);
  
  return {
    bullishPatternStrength,
    bearishPatternStrength,
    patternCompletion,
    trendEncoding,
    fibExtensionTargets,
    srStrength,
  };
}

/**
 * Save pattern encodings to the database
 */
export async function savePatternEncodings(
  symbol: string,
  encodings: any
): Promise<any> {
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
}