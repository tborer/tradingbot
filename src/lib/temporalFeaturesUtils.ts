import prisma from '@/lib/prisma';
import { schedulingLogger } from '@/lib/schedulingLogger';
import { TechnicalAnalysisOutput } from '@prisma/client';

/**
 * Calculate the rate of change for a series of values
 */
export function calculateChangeRate(values: number[]): number {
  if (values.length < 2) return 0;
  
  // Calculate average rate of change
  let totalChange = 0;
  for (let i = 1; i < values.length; i++) {
    totalChange += (values[i] - values[i-1]) / values[i-1];
  }
  
  return totalChange / (values.length - 1);
}

/**
 * Calculate acceleration (change in velocity) for a series of values
 */
export function calculateAcceleration(values: number[]): number {
  if (values.length < 3) return 0;
  
  // Calculate velocities first
  const velocities: number[] = [];
  for (let i = 1; i < values.length; i++) {
    velocities.push((values[i] - values[i-1]) / values[i-1]);
  }
  
  // Then calculate acceleration (change in velocity)
  let totalAcceleration = 0;
  for (let i = 1; i < velocities.length; i++) {
    totalAcceleration += velocities[i] - velocities[i-1];
  }
  
  return totalAcceleration / (velocities.length - 1);
}

/**
 * Calculate consistency of a boolean condition (e.g., price > SMA50)
 */
export function calculateConsistency(booleanArray: boolean[]): number {
  if (booleanArray.length === 0) return 0;
  
  const trueCount = booleanArray.filter(x => x).length;
  return trueCount / booleanArray.length; // 0 to 1 consistency score
}

/**
 * Calculate pattern maturity by comparing initial and final pattern states
 */
export function calculatePatternMaturity(
  initialPatterns: any,
  finalPatterns: any
): number {
  if (!initialPatterns || !finalPatterns) {
    console.log(`Cannot calculate pattern maturity: missing patterns (initial: ${!!initialPatterns}, final: ${!!finalPatterns})`);
    return 0;
  }
  
  // Simple implementation - can be enhanced with more sophisticated logic
  try {
    // Handle special string values like "none" that aren't valid JSON
    const parseIfNeeded = (pattern: any) => {
      if (typeof pattern === 'string') {
        if (pattern.toLowerCase() === 'none') {
          console.log(`Pattern value is 'none', returning empty array`);
          return [];
        }
        try {
          return JSON.parse(pattern);
        } catch (e) {
          console.log(`Could not parse pattern string: "${pattern.substring(0, 50)}${pattern.length > 50 ? '...' : ''}" - ${e.message}`);
          return [];
        }
      }
      
      // If it's already an object but not an array, wrap it in an array
      if (pattern && typeof pattern === 'object' && !Array.isArray(pattern)) {
        console.log(`Pattern is an object but not an array, wrapping in array`);
        return [pattern];
      }
      
      return pattern;
    };
    
    const initial = parseIfNeeded(initialPatterns);
    const final = parseIfNeeded(finalPatterns);
    
    // Log the parsed patterns for debugging
    console.log(`Parsed initial pattern: ${JSON.stringify(initial).substring(0, 100)}`);
    console.log(`Parsed final pattern: ${JSON.stringify(final).substring(0, 100)}`);
    
    // Check if patterns have completion or confidence properties
    if (Array.isArray(initial) && Array.isArray(final)) {
      if (initial.length === 0 && final.length === 0) {
        console.log(`Both initial and final patterns are empty arrays`);
        return 0;
      }
      
      if (initial.length > 0 && final.length > 0) {
        // If we have completion percentages, use those
        if (final[0].completion_percentage !== undefined && initial[0].completion_percentage !== undefined) {
          const maturity = (final[0].completion_percentage - initial[0].completion_percentage) / 100;
          console.log(`Calculated pattern maturity using completion percentages: ${maturity}`);
          return maturity;
        }
        
        // Otherwise use a simple binary comparison
        const maturity = final.length >= initial.length ? 1 : 0;
        console.log(`Calculated pattern maturity using array length comparison: ${maturity}`);
        return maturity;
      }
      
      // If one array has items and the other doesn't
      if (initial.length === 0 && final.length > 0) {
        console.log(`Initial pattern is empty but final has items, returning 1`);
        return 1; // Pattern appeared
      }
      
      if (initial.length > 0 && final.length === 0) {
        console.log(`Initial pattern has items but final is empty, returning 0`);
        return 0; // Pattern disappeared
      }
    }
    
    console.log(`Could not determine pattern maturity, returning 0`);
    return 0;
  } catch (error) {
    console.error("Error calculating pattern maturity:", error);
    console.error(`Initial patterns: ${JSON.stringify(initialPatterns).substring(0, 100)}`);
    console.error(`Final patterns: ${JSON.stringify(finalPatterns).substring(0, 100)}`);
    return 0;
  }
}

/**
 * Count how many times price tests support/resistance levels
 */
export function countLevelTests(
  prices: number[],
  levels: number[]
): number {
  if (prices.length < 2 || levels.length === 0) return 0;
  
  let testCount = 0;
  const threshold = 0.01; // 1% threshold for "testing" a level
  
  for (let i = 0; i < prices.length; i++) {
    for (const level of levels) {
      const distancePercent = Math.abs(prices[i] - level) / level;
      if (distancePercent <= threshold) {
        testCount++;
        break; // Count at most one test per price point
      }
    }
  }
  
  return testCount;
}

/**
 * Calculate Bollinger Band squeeze strength
 * Lower values indicate tighter squeeze (higher potential for breakout)
 */
export function calculateBollingerSqueeze(bollingerData: {
  upper: number;
  lower: number;
  middle: number;
}[]): number {
  if (bollingerData.length === 0) return 0;
  
  // Calculate average band width as percentage of middle band
  let totalWidthRatio = 0;
  for (const data of bollingerData) {
    if (data.middle && data.upper && data.lower) {
      const width = data.upper - data.lower;
      const ratio = width / data.middle;
      totalWidthRatio += ratio;
    }
  }
  
  const avgWidthRatio = totalWidthRatio / bollingerData.length;
  
  // Normalize to 0-1 scale where lower values indicate tighter squeeze
  // Using 0.1 as reference for very tight bands (10% of price)
  return Math.min(1, avgWidthRatio / 0.1);
}

/**
 * Detect if a moving average crossover occurred recently
 */
export function detectRecentCrossover(
  shortMA: number[],
  longMA: number[]
): boolean {
  if (shortMA.length < 2 || longMA.length < 2) return false;
  
  // Check if there was a crossover in the most recent periods
  const recentPeriods = Math.min(3, shortMA.length - 1); // Look at last 3 periods or fewer
  
  for (let i = 1; i <= recentPeriods; i++) {
    const shortAboveLongBefore = shortMA[shortMA.length - i - 1] > longMA[longMA.length - i - 1];
    const shortAboveLongAfter = shortMA[shortMA.length - i] > longMA[longMA.length - i];
    
    // If the relationship changed, there was a crossover
    if (shortAboveLongBefore !== shortAboveLongAfter) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get sequence of indicators for a specific crypto over a lookback period
 */
export async function getIndicatorSequence(
  symbol: string,
  date: Date,
  lookbackDays: number = 10
): Promise<TechnicalAnalysisOutput[]> {
  try {
    // Check if prisma is defined
    if (!prisma) {
      console.error("Prisma client is undefined in getIndicatorSequence");
      return [];
    }
    
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - lookbackDays);
    
    // Fetch technical analysis data for the period
    try {
      const indicators = await prisma.technicalAnalysisOutput.findMany({
        where: {
          symbol,
          timestamp: {
            gte: startDate,
            lte: date,
          },
        },
        orderBy: {
          timestamp: 'asc',
        },
      });
      
      return indicators;
    } catch (dbError) {
      console.error(`Database error in getIndicatorSequence for ${symbol}:`, dbError);
      return [];
    }
  } catch (error) {
    console.error(`Error in getIndicatorSequence for ${symbol}:`, error);
    return [];
  }
}

/**
 * Generate temporal features for a cryptocurrency
 */
export async function generateTemporalFeatures(
  symbol: string,
  date: Date,
  lookbackDays: number = 10
): Promise<{
  priceVelocity: number;
  priceAcceleration: number;
  rsiVelocity: number;
  trendConsistency: number;
  patternMaturity: number;
  srTestFrequency: number;
  bbSqueezeStrength: number;
  maCrossoverRecent: boolean;
}> {
  try {
    console.log(`Generating temporal features for ${symbol} at ${date.toISOString()} with ${lookbackDays} days lookback`);
    
    // Get sequence of indicators for lookback period
    const indicatorSequence = await getIndicatorSequence(symbol, date, lookbackDays);
    
    console.log(`Retrieved ${indicatorSequence.length} indicator records for analysis`);
    
    if (indicatorSequence.length < 2) {
      console.log(`Insufficient indicator data (${indicatorSequence.length} records, need at least 2)`);
      return {
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
    
    // Extract price data (using bollingerMiddle as price proxy if available)
    const prices = indicatorSequence.map(d => {
      try {
        if (d.rawData) {
          const rawData = typeof d.rawData === 'string' ? JSON.parse(d.rawData) : d.rawData;
          return rawData.currentPrice || rawData.price || d.bollingerMiddle || 0;
        }
        return d.bollingerMiddle || 0;
      } catch (error) {
        console.error(`Error extracting price from rawData:`, error);
        return d.bollingerMiddle || 0;
      }
    }).filter(p => p > 0);
    
    console.log(`Extracted ${prices.length} valid price points`);
    
    // Extract RSI data
    const rsiValues = indicatorSequence.map(d => d.rsi14 || 0).filter(r => r > 0);
    console.log(`Extracted ${rsiValues.length} valid RSI values`);
    
    // Extract support/resistance levels
    const supportLevels = indicatorSequence
      .filter(d => d.supportLevel)
      .map(d => d.supportLevel as number);
    
    const resistanceLevels = indicatorSequence
      .filter(d => d.resistanceLevel)
      .map(d => d.resistanceLevel as number);
    
    console.log(`Extracted ${supportLevels.length} support levels and ${resistanceLevels.length} resistance levels`);
    
    // Extract Bollinger Band data
    const bollingerData = indicatorSequence
      .filter(d => d.bollingerUpper && d.bollingerLower && d.bollingerMiddle)
      .map(d => ({
        upper: d.bollingerUpper as number,
        lower: d.bollingerLower as number,
        middle: d.bollingerMiddle as number,
      }));
    
    console.log(`Extracted ${bollingerData.length} complete Bollinger Band data points`);
    
    // Extract EMA data for crossover detection
    const emaShort = indicatorSequence.map(d => d.ema12 || 0).filter(e => e > 0);
    const emaLong = indicatorSequence.map(d => d.ema26 || 0).filter(e => e > 0);
    
    console.log(`Extracted ${emaShort.length} EMA12 values and ${emaLong.length} EMA26 values`);
    
    // Calculate trend consistency (price > SMA50)
    const trendBooleans = indicatorSequence
      .filter(d => d.sma50 && d.bollingerMiddle)
      .map(d => (d.bollingerMiddle as number) > (d.sma50 as number));
    
    console.log(`Calculated ${trendBooleans.length} trend boolean values`);
    
    // Calculate pattern maturity
    let patternMaturity = 0;
    if (indicatorSequence.length >= 2) {
      console.log(`Calculating pattern maturity from ${indicatorSequence.length} indicators`);
      try {
        const firstPatterns = indicatorSequence[0].breakoutType;
        const lastPatterns = indicatorSequence[indicatorSequence.length - 1].breakoutType;
        
        console.log(`First pattern type: ${typeof firstPatterns === 'string' ? firstPatterns : JSON.stringify(firstPatterns).substring(0, 100)}`);
        console.log(`Last pattern type: ${typeof lastPatterns === 'string' ? lastPatterns : JSON.stringify(lastPatterns).substring(0, 100)}`);
        
        patternMaturity = calculatePatternMaturity(firstPatterns, lastPatterns);
        console.log(`Calculated pattern maturity: ${patternMaturity}`);
      } catch (error) {
        console.error(`Error calculating pattern maturity:`, error);
        patternMaturity = 0;
      }
    } else {
      console.log(`Not enough indicators to calculate pattern maturity`);
    }
    
    // Calculate all features
    const priceVelocity = prices.length >= 2 ? calculateChangeRate(prices) : 0;
    const priceAcceleration = prices.length >= 3 ? calculateAcceleration(prices) : 0;
    const rsiVelocity = rsiValues.length >= 2 ? calculateChangeRate(rsiValues) : 0;
    const trendConsistency = trendBooleans.length > 0 ? calculateConsistency(trendBooleans) : 0;
    const srTestFrequency = prices.length > 0 && (supportLevels.length > 0 || resistanceLevels.length > 0) ? 
      countLevelTests(prices, [...supportLevels, ...resistanceLevels]) : 0;
    const bbSqueezeStrength = bollingerData.length > 0 ? calculateBollingerSqueeze(bollingerData) : 0;
    const maCrossoverRecent = emaShort.length >= 2 && emaLong.length >= 2 ? 
      detectRecentCrossover(emaShort, emaLong) : false;
    
    console.log(`Successfully calculated all temporal features for ${symbol}`);
    
    return {
      priceVelocity,
      priceAcceleration,
      rsiVelocity,
      trendConsistency,
      patternMaturity,
      srTestFrequency,
      bbSqueezeStrength,
      maCrossoverRecent,
    };
  } catch (error) {
    console.error(`Error generating temporal features for ${symbol}:`, error);
    // Return default values in case of error
    return {
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
}

/**
 * Save temporal features to the database
 */
export async function saveTemporalFeatures(
  symbol: string,
  features: any,
  lookbackDays: number = 10
): Promise<any> {
  try {
    // Check if prisma is defined
    if (!prisma) {
      console.error("Prisma client is undefined in saveTemporalFeatures");
      throw new Error("Prisma client is undefined");
    }
    
    try {
      return await prisma.cryptoTemporalFeatures.create({
        data: {
          symbol,
          lookbackDays,
          priceVelocity: features.priceVelocity,
          priceAcceleration: features.priceAcceleration,
          rsiVelocity: features.rsiVelocity,
          trendConsistency: features.trendConsistency,
          patternMaturity: features.patternMaturity,
          srTestFrequency: features.srTestFrequency,
          bbSqueezeStrength: features.bbSqueezeStrength,
          maCrossoverRecent: features.maCrossoverRecent,
        },
      });
    } catch (dbError) {
      console.error(`Database error in saveTemporalFeatures for ${symbol}:`, dbError);
      throw dbError;
    }
  } catch (error) {
    console.error(`Error in saveTemporalFeatures for ${symbol}:`, error);
    throw error;
  }
}