// Advanced Support/Resistance Analysis Utility Functions

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
  scores?: SupportResistanceScore;
}

export interface SupportResistanceScore {
  cleanTouches: number;
  touchPrecision: number;
  approachSpeed: number;
  candleBehavior: number;
  nearbyPriceHistory: number;
  potentialRR: number;
  marketContext: number;
  totalScore: number;
  probability: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface SupportResistanceAnalysis {
  supportLevels: SupportResistanceLevel[];
  resistanceLevels: SupportResistanceLevel[];
}

/**
 * Calculate Average True Range (ATR) for a given period
 * @param priceData Array of price data points
 * @param period Period for ATR calculation
 * @returns ATR value
 */
function calculateATR(priceData: PricePoint[], period: number = 14): number {
  if (priceData.length < period + 1) {
    return 0;
  }

  let trSum = 0;
  for (let i = 1; i < period + 1; i++) {
    const current = priceData[priceData.length - i];
    const previous = priceData[priceData.length - i - 1];
    
    // True Range calculation
    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - previous.close);
    const tr3 = Math.abs(current.low - previous.close);
    
    const tr = Math.max(tr1, tr2, tr3);
    trSum += tr;
  }
  
  return trSum / period;
}

/**
 * Calculate standard deviation of price changes
 * @param prices Array of price values
 * @returns Standard deviation value
 */
function calculateStdDev(prices: number[]): number {
  if (prices.length < 2) return 0;
  
  const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const squaredDiffs = prices.map(price => Math.pow(price - mean, 2));
  const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / prices.length;
  
  return Math.sqrt(variance);
}

/**
 * Check if volatility is decreasing in a series of values
 * @param values Array of volatility values
 * @returns Boolean indicating if volatility is decreasing
 */
function isDecreasingVolatility(values: number[]): boolean {
  if (values.length < 4) return false;
  
  // Split the array into two halves and compare average volatility
  const midpoint = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, midpoint);
  const secondHalf = values.slice(midpoint);
  
  const firstHalfAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
  
  return secondHalfAvg < firstHalfAvg;
}

/**
 * Calculate the slope of a line fitted to the data points
 * @param values Array of values
 * @returns Slope value
 */
function calculateSlope(values: number[]): number {
  if (values.length < 2) return 0;
  
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  
  for (let i = 0; i < values.length; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  
  const n = values.length;
  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
}

/**
 * Check if a price level has multiple clean touches
 * @param priceData Array of price data points
 * @param level Price level to check
 * @param tolerance Tolerance for price deviation
 * @returns Number of clean touches
 */
function countCleanTouches(priceData: PricePoint[], level: number, tolerance: number): number {
  let touches = 0;
  let lastTouchIndex = -10; // Ensure minimum spacing between touches
  
  for (let i = 2; i < priceData.length - 2; i++) {
    // Skip if too close to previous touch
    if (i - lastTouchIndex < 5) continue;
    
    const candle = priceData[i];
    const prevCandle = priceData[i-1];
    const nextCandle = priceData[i+1];
    
    // Check for swing high/low near the level
    const isSwingHigh = 
      candle.high > prevCandle.high && 
      candle.high > nextCandle.high &&
      Math.abs(candle.high - level) <= level * tolerance;
      
    const isSwingLow = 
      candle.low < prevCandle.low && 
      candle.low < nextCandle.low &&
      Math.abs(candle.low - level) <= level * tolerance;
    
    if (isSwingHigh || isSwingLow) {
      touches++;
      lastTouchIndex = i;
    }
  }
  
  return touches;
}

/**
 * Check the precision of touches at a level
 * @param priceData Array of price data points
 * @param level Price level to check
 * @returns Score for touch precision (0-1)
 */
function scoreTouchPrecision(priceData: PricePoint[], level: number): number {
  const deviations: number[] = [];
  
  // Find all touches and calculate their deviation from the level
  for (let i = 0; i < priceData.length; i++) {
    const candle = priceData[i];
    
    // Check if price touched or approached the level
    if (candle.low <= level && candle.high >= level) {
      // Calculate deviation as percentage of level
      const deviation = Math.min(
        Math.abs(candle.high - level),
        Math.abs(candle.low - level)
      ) / level;
      
      deviations.push(deviation);
    }
  }
  
  if (deviations.length === 0) return 0;
  
  // Calculate average deviation
  const avgDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / deviations.length;
  
  // Score based on deviation (lower is better)
  // If average deviation is less than 0.3%, score 1
  // If average deviation is more than 1%, score 0
  // Linear scale in between
  return Math.max(0, Math.min(1, 1 - (avgDeviation / 0.01)));
}

/**
 * Score the approach speed to a level
 * @param priceData Array of price data points
 * @param level Price level to check
 * @returns Score for approach speed (0-2)
 */
function scoreApproachSpeed(priceData: PricePoint[], level: number): number {
  let score = 0;
  
  // Find approaches to the level
  for (let i = 5; i < priceData.length; i++) {
    const candle = priceData[i];
    
    // Check if price is approaching the level
    const isApproachingSupport = 
      candle.low <= level * 1.01 && 
      candle.low >= level * 0.99 &&
      candle.close > level;
      
    const isApproachingResistance = 
      candle.high >= level * 0.99 && 
      candle.high <= level * 1.01 &&
      candle.close < level;
    
    if (isApproachingSupport || isApproachingResistance) {
      // Get previous 5 candles for approach analysis
      const approachCandles = priceData.slice(i-5, i);
      
      // Calculate ATR for approach
      const atr = calculateATR(approachCandles, 5);
      
      // Calculate close prices for volatility and slope
      const closePrices = approachCandles.map(c => c.close);
      
      // Check for decreasing volatility
      const volatility = calculateStdDev(closePrices);
      const isLowVolatility = volatility < atr * 0.5;
      
      // Check for small slope (slow approach)
      const slope = Math.abs(calculateSlope(closePrices));
      const isSlowApproach = slope < 0.002; // 0.2% change per candle
      
      if (isLowVolatility) score += 0.5;
      if (isSlowApproach) score += 0.5;
    }
  }
  
  // Cap score at 2
  return Math.min(2, score);
}

/**
 * Score candle behavior at level touches
 * @param priceData Array of price data points
 * @param level Price level to check
 * @returns Score for candle behavior (0-2)
 */
function scoreCandleBehavior(priceData: PricePoint[], level: number): number {
  let score = 0;
  
  // Find touches at the level
  for (let i = 0; i < priceData.length; i++) {
    const candle = priceData[i];
    
    // Check if price touched the level
    if (candle.low <= level && candle.high >= level) {
      // Calculate candle properties
      const bodySize = Math.abs(candle.close - candle.open);
      const upperWick = candle.high - Math.max(candle.open, candle.close);
      const lowerWick = Math.min(candle.open, candle.close) - candle.low;
      const totalSize = candle.high - candle.low;
      
      // Check for small-bodied candles
      if (bodySize < totalSize * 0.3) {
        score += 0.5;
      }
      
      // Check for appropriate wick direction
      if (level < candle.close && lowerWick > upperWick) {
        // Good support rejection
        score += 0.5;
      } else if (level > candle.close && upperWick > lowerWick) {
        // Good resistance rejection
        score += 0.5;
      }
      
      // Check for non-spike candles
      if (i > 0 && i < priceData.length - 1) {
        const prevCandle = priceData[i-1];
        const nextCandle = priceData[i+1];
        const avgSize = (
          (prevCandle.high - prevCandle.low) + 
          (nextCandle.high - nextCandle.low)
        ) / 2;
        
        if (totalSize < avgSize * 1.5) {
          score += 0.5;
        }
      }
    }
  }
  
  // Cap score at 2
  return Math.min(2, score);
}

/**
 * Score nearby price history
 * @param priceData Array of price data points
 * @param level Price level to check
 * @returns Score for nearby price history (0-1)
 */
function scoreNearbyPriceHistory(priceData: PricePoint[], level: number): number {
  // Check for price congestion within ±2% of the level
  const lowerBound = level * 0.98;
  const upperBound = level * 1.02;
  
  let timeSpentInZone = 0;
  
  for (const candle of priceData) {
    if (
      (candle.low <= upperBound && candle.low >= lowerBound) ||
      (candle.high <= upperBound && candle.high >= lowerBound) ||
      (candle.low <= lowerBound && candle.high >= upperBound)
    ) {
      timeSpentInZone++;
    }
  }
  
  // Calculate percentage of time spent in zone
  const percentageInZone = timeSpentInZone / priceData.length;
  
  // Score is inverse of time spent (less time = cleaner level)
  return Math.max(0, Math.min(1, 1 - percentageInZone));
}

/**
 * Score potential risk/reward ratio
 * @param priceData Array of price data points
 * @param level Price level to check
 * @returns Score for potential RR (0-2)
 */
function scorePotentialRR(priceData: PricePoint[], level: number): number {
  // Get current price
  const currentPrice = priceData[priceData.length - 1].close;
  
  // Calculate distance to level
  const distanceToLevel = Math.abs(currentPrice - level);
  
  // Find nearest opposing level
  let opposingLevel = 0;
  
  if (level > currentPrice) {
    // Level is resistance, find support below current price
    let lowestLow = Infinity;
    for (let i = priceData.length - 20; i < priceData.length; i++) {
      if (i >= 0 && priceData[i].low < lowestLow) {
        lowestLow = priceData[i].low;
      }
    }
    opposingLevel = lowestLow;
  } else {
    // Level is support, find resistance above current price
    let highestHigh = 0;
    for (let i = priceData.length - 20; i < priceData.length; i++) {
      if (i >= 0 && priceData[i].high > highestHigh) {
        highestHigh = priceData[i].high;
      }
    }
    opposingLevel = highestHigh;
  }
  
  // Calculate potential RR
  const risk = Math.abs(level - opposingLevel);
  const reward = distanceToLevel;
  
  const rr = reward / risk;
  
  // Score based on RR ratio
  if (rr >= 5) return 2;
  if (rr >= 3) return 1;
  if (rr >= 2) return 0.5;
  return 0;
}

/**
 * Score market context alignment
 * @param priceData Array of price data points
 * @param level Price level to check
 * @returns Score for market context (0-1)
 */
function scoreMarketContext(priceData: PricePoint[], level: number): number {
  // Get current price
  const currentPrice = priceData[priceData.length - 1].close;
  
  // Determine if level is support or resistance
  const isSupport = level < currentPrice;
  
  // Check overall trend direction (using last 30% of data)
  const startIdx = Math.floor(priceData.length * 0.7);
  const trendData = priceData.slice(startIdx);
  
  const firstPrice = trendData[0].close;
  const lastPrice = trendData[trendData.length - 1].close;
  
  const trendDirection = lastPrice > firstPrice ? 'up' : 'down';
  
  // Check if level aligns with trend
  const alignsWithTrend = 
    (isSupport && trendDirection === 'up') || 
    (!isSupport && trendDirection === 'down');
  
  return alignsWithTrend ? 1 : 0;
}

/**
 * Calculate comprehensive score for a support/resistance level
 * @param priceData Array of price data points
 * @param level Support/resistance level
 * @returns Scoring object with individual metrics and total score
 */
function calculateLevelScore(priceData: PricePoint[], level: SupportResistanceLevel): SupportResistanceScore {
  // Calculate individual scores
  const cleanTouches = Math.min(2, level.touches >= 2 ? 2 : 0);
  const touchPrecision = scoreTouchPrecision(priceData, level.price);
  const approachSpeed = scoreApproachSpeed(priceData, level.price);
  const candleBehavior = scoreCandleBehavior(priceData, level.price);
  const nearbyPriceHistory = scoreNearbyPriceHistory(priceData, level.price);
  const potentialRR = scorePotentialRR(priceData, level.price);
  const marketContext = scoreMarketContext(priceData, level.price);
  
  // Calculate total score (out of 10)
  const totalScore = 
    cleanTouches + 
    touchPrecision + 
    approachSpeed + 
    candleBehavior + 
    nearbyPriceHistory + 
    potentialRR + 
    marketContext;
  
  // Determine probability category
  let probability: 'HIGH' | 'MEDIUM' | 'LOW';
  if (totalScore >= 8) {
    probability = 'HIGH';
  } else if (totalScore >= 5) {
    probability = 'MEDIUM';
  } else {
    probability = 'LOW';
  }
  
  return {
    cleanTouches,
    touchPrecision,
    approachSpeed,
    candleBehavior,
    nearbyPriceHistory,
    potentialRR,
    marketContext,
    totalScore,
    probability
  };
}

/**
 * Analyze price data to identify support and resistance levels with detailed scoring
 * @param priceData Array of price data points (sorted from oldest to newest)
 * @returns Analysis results including support and resistance levels with scores
 */
export function analyzeAdvancedSupportResistanceLevels(priceData: PricePoint[]): SupportResistanceAnalysis {
  console.log(`Analyzing advanced support/resistance with ${priceData?.length || 0} data points`);
  
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
  
  // Calculate scores for each level
  const scoredLevels = validatedLevels.map(level => ({
    ...level,
    scores: calculateLevelScore(priceData, level)
  }));
  
  // Separate into support and resistance levels
  const currentPrice = priceData[priceData.length - 1].close;
  
  const supportLevels = scoredLevels
    .filter(level => level.price < currentPrice)
    .sort((a, b) => (b.scores?.totalScore || 0) - (a.scores?.totalScore || 0)); // Sort by score
  
  const resistanceLevels = scoredLevels
    .filter(level => level.price > currentPrice)
    .sort((a, b) => (b.scores?.totalScore || 0) - (a.scores?.totalScore || 0)); // Sort by score
  
  console.log(`Found ${supportLevels.length} support levels and ${resistanceLevels.length} resistance levels with scoring`);
  
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