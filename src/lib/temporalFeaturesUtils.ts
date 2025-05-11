import prisma from '@/lib/prisma';
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
  if (!initialPatterns || !finalPatterns) return 0;
  
  // Simple implementation - can be enhanced with more sophisticated logic
  try {
    // Handle special string values like "none" that aren't valid JSON
    const parseIfNeeded = (pattern: any) => {
      if (typeof pattern === 'string') {
        if (pattern.toLowerCase() === 'none') {
          return [];
        }
        try {
          return JSON.parse(pattern);
        } catch (e) {
          console.log(`Could not parse pattern: ${pattern}`);
          return [];
        }
      }
      return pattern;
    };
    
    const initial = parseIfNeeded(initialPatterns);
    const final = parseIfNeeded(finalPatterns);
    
    // Check if patterns have completion or confidence properties
    if (Array.isArray(initial) && Array.isArray(final) && initial.length > 0 && final.length > 0) {
      // If we have completion percentages, use those
      if (final[0].completion_percentage && initial[0].completion_percentage) {
        return (final[0].completion_percentage - initial[0].completion_percentage) / 100;
      }
      
      // Otherwise use a simple binary comparison
      return final.length >= initial.length ? 1 : 0;
    }
    
    return 0;
  } catch (error) {
    console.error("Error calculating pattern maturity:", error);
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
  const startDate = new Date(date);
  startDate.setDate(startDate.getDate() - lookbackDays);
  
  // Fetch technical analysis data for the period
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
  // Get sequence of indicators for lookback period
  const indicatorSequence = await getIndicatorSequence(symbol, date, lookbackDays);
  
  if (indicatorSequence.length < 2) {
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
    if (d.rawData && typeof d.rawData === 'object') {
      const rawData = d.rawData as any;
      return rawData.price || d.bollingerMiddle || 0;
    }
    return d.bollingerMiddle || 0;
  }).filter(p => p > 0);
  
  // Extract RSI data
  const rsiValues = indicatorSequence.map(d => d.rsi14 || 0).filter(r => r > 0);
  
  // Extract support/resistance levels
  const supportLevels = indicatorSequence
    .filter(d => d.supportLevel)
    .map(d => d.supportLevel as number);
  
  const resistanceLevels = indicatorSequence
    .filter(d => d.resistanceLevel)
    .map(d => d.resistanceLevel as number);
  
  // Extract Bollinger Band data
  const bollingerData = indicatorSequence
    .filter(d => d.bollingerUpper && d.bollingerLower && d.bollingerMiddle)
    .map(d => ({
      upper: d.bollingerUpper as number,
      lower: d.bollingerLower as number,
      middle: d.bollingerMiddle as number,
    }));
  
  // Extract EMA data for crossover detection
  const emaShort = indicatorSequence.map(d => d.ema12 || 0).filter(e => e > 0);
  const emaLong = indicatorSequence.map(d => d.ema26 || 0).filter(e => e > 0);
  
  // Calculate trend consistency (price > SMA50)
  const trendBooleans = indicatorSequence
    .filter(d => d.sma50 && d.bollingerMiddle)
    .map(d => (d.bollingerMiddle as number) > (d.sma50 as number));
  
  // Calculate pattern maturity
  let patternMaturity = 0;
  if (indicatorSequence.length >= 2) {
    const firstPatterns = indicatorSequence[0].breakoutType;
    const lastPatterns = indicatorSequence[indicatorSequence.length - 1].breakoutType;
    patternMaturity = calculatePatternMaturity(firstPatterns, lastPatterns);
  }
  
  return {
    priceVelocity: calculateChangeRate(prices),
    priceAcceleration: calculateAcceleration(prices),
    rsiVelocity: calculateChangeRate(rsiValues),
    trendConsistency: calculateConsistency(trendBooleans),
    patternMaturity,
    srTestFrequency: countLevelTests(prices, [...supportLevels, ...resistanceLevels]),
    bbSqueezeStrength: calculateBollingerSqueeze(bollingerData),
    maCrossoverRecent: detectRecentCrossover(emaShort, emaLong),
  };
}

/**
 * Save temporal features to the database
 */
export async function saveTemporalFeatures(
  symbol: string,
  features: any,
  lookbackDays: number = 10
): Promise<any> {
  return prisma.cryptoTemporalFeatures.create({
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
}