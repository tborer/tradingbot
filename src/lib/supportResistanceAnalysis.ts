// Support/Resistance Analysis Utility Functions

interface PricePoint {
  high: number;
  low: number;
  open: number;
  close: number;
  timestamp: Date;
}

export interface SupportResistanceLevel {
  price: number;
  strength: number;
  touches: number;
  isOptimal: boolean;
}

export interface SupportResistanceAnalysis {
  supportLevels: SupportResistanceLevel[];
  resistanceLevels: SupportResistanceLevel[];
}

/**
 * Analyze price data to identify support and resistance levels
 * @param priceData Array of price data points (sorted from oldest to newest)
 * @returns Analysis results including support and resistance levels
 */
export function analyzeSupportResistanceLevels(priceData: PricePoint[]): SupportResistanceAnalysis {
  console.log(`Analyzing support/resistance with ${priceData?.length || 0} data points`);
  
  if (!priceData || priceData.length < 10) {
    console.warn('Insufficient historical data for support/resistance calculation');
    return {
      supportLevels: [],
      resistanceLevels: []
    };
  }

  // Extract highs and lows for analysis
  const highs = priceData.map(point => point.high);
  const lows = priceData.map(point => point.low);
  
  // Find potential support and resistance levels
  const potentialLevels = findPotentialLevels(priceData);
  
  // Validate levels by checking for multiple touches
  const validatedLevels = validateLevels(potentialLevels, priceData);
  
  // Separate into support and resistance levels
  const currentPrice = priceData[priceData.length - 1].close;
  
  const supportLevels = validatedLevels
    .filter(level => level.price < currentPrice)
    .sort((a, b) => b.price - a.price); // Sort support levels from highest to lowest
  
  const resistanceLevels = validatedLevels
    .filter(level => level.price > currentPrice)
    .sort((a, b) => a.price - b.price); // Sort resistance levels from lowest to highest
  
  console.log(`Found ${supportLevels.length} support levels and ${resistanceLevels.length} resistance levels`);
  
  return {
    supportLevels,
    resistanceLevels
  };
}

/**
 * Find potential support and resistance levels from price data
 * @param priceData Array of price data points
 * @returns Array of potential price levels
 */
function findPotentialLevels(priceData: PricePoint[]): number[] {
  // Find swing highs and lows
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  
  // Use a window of 3 candles to identify swing points
  for (let i = 2; i < priceData.length - 2; i++) {
    // Check for swing high (current high is higher than neighboring highs)
    if (
      priceData[i].high > priceData[i-1].high && 
      priceData[i].high > priceData[i-2].high &&
      priceData[i].high > priceData[i+1].high && 
      priceData[i].high > priceData[i+2].high
    ) {
      swingHighs.push(priceData[i].high);
    }
    
    // Check for swing low (current low is lower than neighboring lows)
    if (
      priceData[i].low < priceData[i-1].low && 
      priceData[i].low < priceData[i-2].low &&
      priceData[i].low < priceData[i+1].low && 
      priceData[i].low < priceData[i+2].low
    ) {
      swingLows.push(priceData[i].low);
    }
  }
  
  console.log(`Found ${swingHighs.length} swing highs and ${swingLows.length} swing lows`);
  
  // Combine swing highs and lows
  const potentialLevels = [...swingHighs, ...swingLows];
  
  // Add recent significant price levels
  const recentData = priceData.slice(-20); // Last 20 candles
  
  // Add recent highs and lows
  const recentHighs = recentData.map(point => point.high);
  const recentLows = recentData.map(point => point.low);
  
  // Find the highest high and lowest low in recent data
  const highestHigh = Math.max(...recentHighs);
  const lowestLow = Math.min(...recentLows);
  
  // Add these as potential levels if not already included
  if (!potentialLevels.includes(highestHigh)) {
    potentialLevels.push(highestHigh);
  }
  
  if (!potentialLevels.includes(lowestLow)) {
    potentialLevels.push(lowestLow);
  }
  
  // Group similar price levels (within a small percentage threshold)
  const groupedLevels = groupSimilarLevels(potentialLevels);
  
  return groupedLevels;
}

/**
 * Group similar price levels to avoid duplicates
 * @param levels Array of price levels
 * @returns Array of grouped price levels
 */
function groupSimilarLevels(levels: number[]): number[] {
  if (levels.length === 0) return [];
  
  // Sort levels
  const sortedLevels = [...levels].sort((a, b) => a - b);
  
  // Calculate the average price to determine the threshold
  const avgPrice = sortedLevels.reduce((sum, price) => sum + price, 0) / sortedLevels.length;
  
  // Set threshold as a percentage of the average price (e.g., 0.5%)
  const threshold = avgPrice * 0.005;
  
  const groupedLevels: number[] = [];
  let currentGroup: number[] = [sortedLevels[0]];
  
  for (let i = 1; i < sortedLevels.length; i++) {
    const currentLevel = sortedLevels[i];
    const previousLevel = sortedLevels[i-1];
    
    // If current level is close to previous level, add to current group
    if (currentLevel - previousLevel <= threshold) {
      currentGroup.push(currentLevel);
    } else {
      // Calculate average of current group and add to grouped levels
      const groupAvg = currentGroup.reduce((sum, price) => sum + price, 0) / currentGroup.length;
      groupedLevels.push(groupAvg);
      
      // Start a new group
      currentGroup = [currentLevel];
    }
  }
  
  // Add the last group
  if (currentGroup.length > 0) {
    const groupAvg = currentGroup.reduce((sum, price) => sum + price, 0) / currentGroup.length;
    groupedLevels.push(groupAvg);
  }
  
  console.log(`Grouped ${levels.length} potential levels into ${groupedLevels.length} distinct levels`);
  
  return groupedLevels;
}

/**
 * Validate potential levels by checking for multiple touches
 * @param potentialLevels Array of potential price levels
 * @param priceData Array of price data points
 * @returns Array of validated support/resistance levels with strength and touch count
 */
function validateLevels(potentialLevels: number[], priceData: PricePoint[]): SupportResistanceLevel[] {
  const validatedLevels: SupportResistanceLevel[] = [];
  
  // Calculate the average price to determine the touch threshold
  const avgPrice = priceData.reduce((sum, point) => sum + point.close, 0) / priceData.length;
  
  // Set touch threshold as a percentage of the average price (e.g., 0.5%)
  const touchThreshold = avgPrice * 0.005;
  
  for (const level of potentialLevels) {
    // Count touches (price approaching within threshold of the level)
    let touchCount = 0;
    let touchStrength = 0;
    let approachSlowdown = false;
    let volatilityReduction = false;
    let cleanApproaches = 0;
    
    // Track price movement to detect slowdowns before touches
    let priceVelocities: number[] = [];
    let priceVolatilities: number[] = [];
    
    // Check each candle for touches or approaches
    for (let i = 5; i < priceData.length; i++) {
      const currentCandle = priceData[i];
      const previousCandles = priceData.slice(i-5, i);
      
      // Calculate if price touched or approached the level
      const touchedAsSupport = 
        Math.abs(currentCandle.low - level) <= touchThreshold ||
        (currentCandle.low < level && currentCandle.close > level);
        
      const touchedAsResistance = 
        Math.abs(currentCandle.high - level) <= touchThreshold ||
        (currentCandle.high > level && currentCandle.close < level);
      
      if (touchedAsSupport || touchedAsResistance) {
        touchCount++;
        
        // Calculate strength of the touch based on price rejection
        const rejectionStrength = touchedAsSupport 
          ? (currentCandle.close - currentCandle.low) / currentCandle.low
          : (currentCandle.high - currentCandle.close) / currentCandle.close;
        
        touchStrength += rejectionStrength * 100; // Convert to percentage
        
        // Check for clean approach (gradual approach to level)
        const previousPrices = previousCandles.map(c => c.close);
        const priceDirection = touchedAsSupport 
          ? previousPrices.every((price, idx) => idx === 0 || price <= previousPrices[idx-1])
          : previousPrices.every((price, idx) => idx === 0 || price >= previousPrices[idx-1]);
        
        if (priceDirection) {
          cleanApproaches++;
        }
        
        // Calculate price velocity (rate of change) before touch
        const velocities = [];
        for (let j = 1; j < previousCandles.length; j++) {
          const velocity = (previousCandles[j].close - previousCandles[j-1].close) / previousCandles[j-1].close;
          velocities.push(Math.abs(velocity));
        }
        
        // Check if velocity decreased before touch (slowdown)
        if (velocities.length >= 2) {
          const avgVelocityStart = (velocities[0] + velocities[1]) / 2;
          const avgVelocityEnd = (velocities[velocities.length-2] + velocities[velocities.length-1]) / 2;
          
          if (avgVelocityEnd < avgVelocityStart) {
            approachSlowdown = true;
          }
          
          priceVelocities.push(...velocities);
        }
        
        // Calculate price volatility before touch
        const volatilities = [];
        for (let j = 0; j < previousCandles.length; j++) {
          const candle = previousCandles[j];
          const volatility = (candle.high - candle.low) / candle.low;
          volatilities.push(volatility);
        }
        
        // Check if volatility decreased before touch
        if (volatilities.length >= 2) {
          const avgVolatilityStart = (volatilities[0] + volatilities[1]) / 2;
          const avgVolatilityEnd = (volatilities[volatilities.length-2] + volatilities[volatilities.length-1]) / 2;
          
          if (avgVolatilityEnd < avgVolatilityStart) {
            volatilityReduction = true;
          }
          
          priceVolatilities.push(...volatilities);
        }
      }
    }
    
    // Validate level if it has at least 2 touches
    if (touchCount >= 2) {
      // Calculate average strength per touch
      const avgStrength = touchStrength / touchCount;
      
      // Determine if this is an optimal level
      const isOptimal = 
        cleanApproaches >= touchCount / 2 && // At least half of approaches were clean
        (approachSlowdown || volatilityReduction) && // Either slowdown or volatility reduction observed
        avgStrength > 1.0; // Good rejection strength
      
      validatedLevels.push({
        price: level,
        strength: avgStrength,
        touches: touchCount,
        isOptimal
      });
    }
  }
  
  console.log(`Validated ${validatedLevels.length} levels out of ${potentialLevels.length} potential levels`);
  
  // Sort by strength (descending)
  return validatedLevels.sort((a, b) => b.strength - a.strength);
}