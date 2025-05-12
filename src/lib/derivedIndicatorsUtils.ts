// Helper functions for derived indicators calculations

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
  try {
    console.log(`Calculating derived indicators from technical analysis data`);
    
    if (!technicalAnalysis) {
      console.error(`Technical analysis data is null or undefined`);
      return {
        trendStrength: null,
        volatilityRatio: null,
        rsiWithTrendContext: null,
        maConvergence: null,
        nearestSupportDistance: null,
        nearestResistanceDistance: null,
        fibConfluenceStrength: null,
        bbPosition: null
      };
    }
    
    // Extract data from technical analysis
    const {
      sma20, sma50, ema12, ema26, rsi14,
      bollingerUpper, bollingerMiddle, bollingerLower,
      supportLevel, resistanceLevel, fibonacciLevels
    } = technicalAnalysis;
    
    // Get raw data safely
    let rawData;
    if (technicalAnalysis.rawData) {
      try {
        rawData = typeof technicalAnalysis.rawData === 'string' 
          ? JSON.parse(technicalAnalysis.rawData) 
          : technicalAnalysis.rawData;
      } catch (error) {
        console.error(`Error parsing rawData:`, error);
        rawData = {};
      }
    } else {
      rawData = {};
    }

    // Get current price from raw data
    const currentPrice = rawData?.currentPrice || rawData?.price || bollingerMiddle || null;
    console.log(`Current price: ${currentPrice}`);
    
    // Get previous indicators if available
    const previousEma12 = rawData?.previousEma12 || null;
    const previousEma26 = rawData?.previousEma26 || null;
    console.log(`Previous EMA12: ${previousEma12}, Previous EMA26: ${previousEma26}`);

    // Calculate trend strength (distance between short and long EMAs relative to price)
    let trendStrength = null;
    if (currentPrice && ema12 && ema26) {
      trendStrength = Math.abs(ema12 - ema26) / currentPrice;
      console.log(`Calculated trend strength: ${trendStrength}`);
    } else {
      console.log(`Cannot calculate trend strength: missing data (currentPrice: ${!!currentPrice}, ema12: ${!!ema12}, ema26: ${!!ema26})`);
    }

    // Calculate volatility ratio (width of Bollinger Bands relative to middle band)
    let volatilityRatio = null;
    if (bollingerUpper && bollingerLower && bollingerMiddle) {
      volatilityRatio = (bollingerUpper - bollingerLower) / bollingerMiddle;
      console.log(`Calculated volatility ratio: ${volatilityRatio}`);
    } else {
      console.log(`Cannot calculate volatility ratio: missing Bollinger Bands data (upper: ${!!bollingerUpper}, middle: ${!!bollingerMiddle}, lower: ${!!bollingerLower})`);
    }

    // Calculate RSI with trend context (RSI adjusted based on trend direction)
    let rsiWithTrendContext = null;
    if (rsi14 !== null && currentPrice && sma50) {
      // If price is above SMA50 (uptrend), use RSI as is
      // If price is below SMA50 (downtrend), reduce RSI weight
      const trendMultiplier = currentPrice > sma50 ? 1 : 0.8;
      rsiWithTrendContext = rsi14 * trendMultiplier;
      console.log(`Calculated RSI with trend context: ${rsiWithTrendContext}`);
    } else {
      console.log(`Cannot calculate RSI with trend context: missing data (rsi14: ${!!rsi14}, currentPrice: ${!!currentPrice}, sma50: ${!!sma50})`);
    }

    // Calculate moving average convergence/divergence rate
    let maConvergence = null;
    if (ema12 && ema26 && previousEma12 && previousEma26) {
      const currentDiff = ema12 - ema26;
      const previousDiff = previousEma12 - previousEma26;
      
      // Avoid division by zero
      if (previousDiff !== 0) {
        maConvergence = (currentDiff / previousDiff) - 1;
        console.log(`Calculated MA convergence: ${maConvergence}`);
      } else {
        console.log(`Cannot calculate MA convergence: previous difference is zero`);
      }
    } else {
      console.log(`Cannot calculate MA convergence: missing data (ema12: ${!!ema12}, ema26: ${!!ema26}, previousEma12: ${!!previousEma12}, previousEma26: ${!!previousEma26})`);
    }

    // Calculate distance to nearest support and resistance levels
    let nearestSupportDistance = null;
    let nearestResistanceDistance = null;
    
    if (currentPrice && supportLevel) {
      nearestSupportDistance = (currentPrice - supportLevel) / currentPrice;
      console.log(`Calculated nearest support distance: ${nearestSupportDistance}`);
    } else {
      console.log(`Cannot calculate nearest support distance: missing data (currentPrice: ${!!currentPrice}, supportLevel: ${!!supportLevel})`);
    }
    
    if (currentPrice && resistanceLevel) {
      nearestResistanceDistance = (resistanceLevel - currentPrice) / currentPrice;
      console.log(`Calculated nearest resistance distance: ${nearestResistanceDistance}`);
    } else {
      console.log(`Cannot calculate nearest resistance distance: missing data (currentPrice: ${!!currentPrice}, resistanceLevel: ${!!resistanceLevel})`);
    }

    // Calculate Fibonacci confluence strength
    let fibConfluenceStrength = null;
    if (fibonacciLevels && (supportLevel || resistanceLevel)) {
      try {
        // Parse Fibonacci levels if it's a string
        const parsedFibLevels = typeof fibonacciLevels === 'string' 
          ? JSON.parse(fibonacciLevels) 
          : fibonacciLevels;
        
        // Extract Fibonacci levels from the JSON object
        const fibLevels = Object.values(parsedFibLevels).filter(level => typeof level === 'number');
        console.log(`Extracted ${fibLevels.length} Fibonacci levels`);
        
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
        console.log(`Calculated Fibonacci confluence strength: ${fibConfluenceStrength}`);
      } catch (error) {
        console.error(`Error calculating Fibonacci confluence strength:`, error);
        fibConfluenceStrength = 0;
      }
    } else {
      console.log(`Cannot calculate Fibonacci confluence strength: missing data (fibonacciLevels: ${!!fibonacciLevels}, supportLevel: ${!!supportLevel}, resistanceLevel: ${!!resistanceLevel})`);
    }

    // Calculate Bollinger Band position (0-1 where 0.5 is middle band)
    let bbPosition = null;
    if (currentPrice && bollingerUpper && bollingerLower) {
      bbPosition = (currentPrice - bollingerLower) / (bollingerUpper - bollingerLower);
      console.log(`Calculated Bollinger Band position: ${bbPosition}`);
    } else {
      console.log(`Cannot calculate Bollinger Band position: missing data (currentPrice: ${!!currentPrice}, bollingerUpper: ${!!bollingerUpper}, bollingerLower: ${!!bollingerLower})`);
    }

    console.log(`Successfully calculated derived indicators`);
    
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
  } catch (error) {
    console.error(`Error calculating derived indicators:`, error);
    return {
      trendStrength: null,
      volatilityRatio: null,
      rsiWithTrendContext: null,
      maConvergence: null,
      nearestSupportDistance: null,
      nearestResistanceDistance: null,
      fibConfluenceStrength: null,
      bbPosition: null
    };
  }
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