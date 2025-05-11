import { calculateDistanceFrom, calculatePercentToNearestLevel, calculateFibonacciConfluence } from './analysisUtils';

/**
 * Calculate derived indicators from technical analysis data
 * @param technicalAnalysis The technical analysis data
 * @returns Object containing derived indicators
 */
export function calculateDerivedIndicators(technicalAnalysis: any): {
  trendStrength: number | null;
  volatilityRatio: number | null;
  rsiWithTrendContext: number | null;
  maConvergence: number | null;
  nearestSupportDistance: number | null;
  nearestResistanceDistance: number | null;
  fibConfluenceStrength: number | null;
  bbPosition: number | null;
} {
  // Extract data from technical analysis
  const {
    sma20, sma50, ema12, ema26, rsi14,
    bollingerUpper, bollingerMiddle, bollingerLower,
    supportLevel, resistanceLevel, fibonacciLevels, rawData
  } = technicalAnalysis;

  // Get current price from raw data
  const currentPrice = rawData?.currentPrice || null;
  
  // Get previous indicators if available
  const previousEma12 = rawData?.previousEma12 || null;
  const previousEma26 = rawData?.previousEma26 || null;

  // Calculate trend strength (distance between short and long EMAs relative to price)
  let trendStrength = null;
  if (currentPrice && ema12 && ema26) {
    trendStrength = Math.abs(ema12 - ema26) / currentPrice;
  }

  // Calculate volatility ratio (width of Bollinger Bands relative to middle band)
  let volatilityRatio = null;
  if (bollingerUpper && bollingerLower && bollingerMiddle) {
    volatilityRatio = (bollingerUpper - bollingerLower) / bollingerMiddle;
  }

  // Calculate RSI with trend context (RSI adjusted based on trend direction)
  let rsiWithTrendContext = null;
  if (rsi14 !== null && currentPrice && sma50) {
    // If price is above SMA50 (uptrend), use RSI as is
    // If price is below SMA50 (downtrend), reduce RSI weight
    const trendMultiplier = currentPrice > sma50 ? 1 : 0.8;
    rsiWithTrendContext = rsi14 * trendMultiplier;
  }

  // Calculate moving average convergence/divergence rate
  let maConvergence = null;
  if (ema12 && ema26 && previousEma12 && previousEma26) {
    const currentDiff = ema12 - ema26;
    const previousDiff = previousEma12 - previousEma26;
    
    // Avoid division by zero
    if (previousDiff !== 0) {
      maConvergence = (currentDiff / previousDiff) - 1;
    }
  }

  // Calculate distance to nearest support and resistance levels
  let nearestSupportDistance = null;
  let nearestResistanceDistance = null;
  
  if (currentPrice && supportLevel) {
    nearestSupportDistance = (currentPrice - supportLevel) / currentPrice;
  }
  
  if (currentPrice && resistanceLevel) {
    nearestResistanceDistance = (resistanceLevel - currentPrice) / currentPrice;
  }

  // Calculate Fibonacci confluence strength
  let fibConfluenceStrength = null;
  if (fibonacciLevels && (supportLevel || resistanceLevel)) {
    // Extract Fibonacci levels from the JSON object
    const fibLevels = Object.values(fibonacciLevels).filter(level => typeof level === 'number');
    
    // Create array of key levels (support and resistance)
    const keyLevels = [];
    if (supportLevel) keyLevels.push(supportLevel);
    if (resistanceLevel) keyLevels.push(resistanceLevel);
    
    // Count confluences (Fibonacci levels close to support/resistance)
    let confluenceCount = 0;
    fibLevels.forEach(fibLevel => {
      keyLevels.forEach(keyLevel => {
        if (Math.abs(fibLevel - keyLevel) / keyLevel < 0.01) { // Within 1%
          confluenceCount++;
        }
      });
    });
    
    fibConfluenceStrength = confluenceCount;
  }

  // Calculate Bollinger Band position (0-1 where 0.5 is middle band)
  let bbPosition = null;
  if (currentPrice && bollingerUpper && bollingerLower) {
    bbPosition = (currentPrice - bollingerLower) / (bollingerUpper - bollingerLower);
  }

  return {
    trendStrength,
    volatilityRatio,
    rsiWithTrendContext,
    maConvergence,
    nearestSupportDistance,
    nearestResistanceDistance,
    fibConfluenceStrength,
    bbPosition
  };
}

/**
 * Helper function to calculate distance between two values
 * @param value1 First value
 * @param value2 Second value
 * @returns The absolute distance between the values
 */
export function calculateDistanceFrom(value1: number, value2: number): number {
  return Math.abs(value1 - value2);
}

/**
 * Helper function to calculate percentage distance to nearest level
 * @param price Current price
 * @param levels Array of price levels
 * @returns The percentage distance to the nearest level
 */
export function calculatePercentToNearestLevel(price: number, levels: number[]): number | null {
  if (!levels || levels.length === 0) return null;
  
  // Find the nearest level
  const distances = levels.map(level => Math.abs(price - level));
  const minDistance = Math.min(...distances);
  const nearestLevel = levels[distances.indexOf(minDistance)];
  
  // Calculate percentage distance
  return Math.abs(price - nearestLevel) / price;
}

/**
 * Helper function to calculate Fibonacci confluence
 * @param fibLevels Array of Fibonacci levels
 * @param keyLevels Array of key levels (support/resistance)
 * @returns The number of confluences found
 */
export function calculateFibonacciConfluence(fibLevels: number[], keyLevels: number[]): number {
  let confluenceCount = 0;
  
  // Count how many fibonacci levels are close to support/resistance
  fibLevels.forEach(fibLevel => {
    keyLevels.forEach(keyLevel => {
      if (Math.abs(fibLevel - keyLevel) / keyLevel < 0.01) { // Within 1%
        confluenceCount++;
      }
    });
  });
  
  return confluenceCount;
}