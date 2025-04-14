// Analysis utility functions for stock and crypto data

/**
 * Calculate Exponential Moving Average (EMA) for a given period
 * @param prices Array of price data points (most recent first)
 * @param period Number of periods to calculate EMA for
 * @returns The calculated EMA value
 */
export function calculateEMA(prices: number[], period: number): number | null {
  if (!prices || prices.length < period) {
    return null;
  }

  // Calculate the multiplier
  const multiplier = 2 / (period + 1);
  
  // Start with SMA for the first EMA value
  const sma = calculateSMA(prices.slice(0, period), period);
  if (sma === null) {
    return null;
  }
  
  // Calculate EMA starting with SMA as the first value
  let ema = sma;
  
  // Calculate EMA for each price after the initial period
  for (let i = period - 1; i >= 0; i--) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

/**
 * Generate a message about the EMA trend
 * @param currentPrice Current price
 * @param ema EMA value
 * @param period Period used for EMA calculation
 * @returns A message describing the EMA trend
 */
export function getEMAMessage(currentPrice: number, ema: number | null, period: number): string {
  if (ema === null) {
    return `Not enough data to calculate ${period}-day EMA.`;
  }

  const percentDiff = ((currentPrice - ema) / ema) * 100;
  
  if (currentPrice > ema) {
    return `Current price is ${percentDiff.toFixed(2)}% above the ${period}-day EMA (${ema.toFixed(2)}), suggesting a strong upward trend.`;
  } else if (currentPrice < ema) {
    return `Current price is ${Math.abs(percentDiff).toFixed(2)}% below the ${period}-day EMA (${ema.toFixed(2)}), suggesting a strong downward trend.`;
  } else {
    return `Current price is at the ${period}-day EMA (${ema.toFixed(2)}), suggesting a neutral trend.`;
  }
}

/**
 * Calculate Relative Strength Index (RSI)
 * @param prices Array of price data points (most recent first)
 * @param period Number of periods to calculate RSI for (typically 14)
 * @returns The calculated RSI value (0-100)
 */
export function calculateRSI(prices: number[], period: number = 14): number | null {
  if (!prices || prices.length < period + 1) {
    return null;
  }

  // Calculate price changes
  const priceChanges: number[] = [];
  for (let i = prices.length - 1; i > 0; i--) {
    priceChanges.push(prices[i - 1] - prices[i]);
  }
  
  // Calculate gains and losses
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 0; i < priceChanges.length; i++) {
    if (priceChanges[i] >= 0) {
      gains.push(priceChanges[i]);
      losses.push(0);
    } else {
      gains.push(0);
      losses.push(Math.abs(priceChanges[i]));
    }
  }
  
  // Calculate average gain and average loss for the first period
  let avgGain = gains.slice(0, period).reduce((sum, gain) => sum + gain, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((sum, loss) => sum + loss, 0) / period;
  
  // Calculate smoothed average gain and loss for subsequent periods
  for (let i = period; i < gains.length; i++) {
    avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
    avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
  }
  
  // Calculate RS and RSI
  if (avgLoss === 0) {
    return 100; // No losses means RSI is 100
  }
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return rsi;
}

/**
 * Generate a message about the RSI value
 * @param rsi RSI value
 * @param period Period used for RSI calculation
 * @returns A message describing the RSI value
 */
export function getRSIMessage(rsi: number | null, period: number = 14): string {
  if (rsi === null) {
    return `Not enough data to calculate ${period}-day RSI.`;
  }

  let message = `${period}-day RSI: ${rsi.toFixed(2)}. `;
  
  if (rsi > 70) {
    message += `RSI is above 70, indicating overbought conditions. This suggests a potential reversal or correction to the downside.`;
  } else if (rsi < 30) {
    message += `RSI is below 30, indicating oversold conditions. This suggests a potential reversal or bounce to the upside.`;
  } else if (rsi > 60) {
    message += `RSI is in the upper neutral zone, showing bullish momentum but not yet overbought.`;
  } else if (rsi < 40) {
    message += `RSI is in the lower neutral zone, showing bearish momentum but not yet oversold.`;
  } else {
    message += `RSI is in the neutral zone, suggesting no strong momentum in either direction.`;
  }
  
  return message;
}

/**
 * Calculate standard deviation for a set of values
 * @param values Array of values
 * @param mean The mean value of the array
 * @returns The standard deviation
 */
export function calculateStandardDeviation(values: number[], mean: number): number {
  if (!values || values.length === 0) {
    return 0;
  }
  
  const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
  const variance = squaredDifferences.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate Bollinger Bands for a given period and standard deviation multiplier
 * @param prices Array of price data points
 * @param period Number of periods to calculate SMA for (typically 20)
 * @param stdDevMultiplier Multiplier for standard deviation (typically 2)
 * @returns Object containing upper band, middle band (SMA), and lower band values
 */
export function calculateBollingerBands(
  prices: number[], 
  period: number = 20, 
  stdDevMultiplier: number = 2
): { upper: number | null; middle: number | null; lower: number | null } {
  if (!prices || prices.length < period) {
    return { upper: null, middle: null, lower: null };
  }

  // Calculate SMA (middle band)
  const periodPrices = prices.slice(0, period);
  const sma = periodPrices.reduce((sum, price) => sum + price, 0) / period;
  
  // Calculate standard deviation
  const stdDev = calculateStandardDeviation(periodPrices, sma);
  
  // Calculate upper and lower bands
  const upperBand = sma + (stdDevMultiplier * stdDev);
  const lowerBand = sma - (stdDevMultiplier * stdDev);
  
  return {
    upper: upperBand,
    middle: sma,
    lower: lowerBand
  };
}

/**
 * Generate a message about Bollinger Bands analysis
 * @param currentPrice Current price
 * @param bands Bollinger Bands values
 * @returns A message describing the Bollinger Bands analysis
 */
export function getBollingerBandsMessage(
  currentPrice: number, 
  bands: { upper: number | null; middle: number | null; lower: number | null }
): string {
  if (bands.upper === null || bands.middle === null || bands.lower === null) {
    return "Not enough data to calculate Bollinger Bands.";
  }

  // Calculate bandwidth (volatility indicator)
  const bandwidth = (bands.upper - bands.lower) / bands.middle;
  const bandwidthPercentage = bandwidth * 100;
  
  // Calculate %B (position within the bands)
  const percentB = (currentPrice - bands.lower) / (bands.upper - bands.lower);
  const percentBFormatted = (percentB * 100).toFixed(2);
  
  let message = `Bollinger Bands: Upper: $${bands.upper.toFixed(2)}, Middle: $${bands.middle.toFixed(2)}, Lower: $${bands.lower.toFixed(2)}. `;
  
  // Add volatility assessment
  message += `Volatility is ${bandwidthPercentage > 20 ? 'high' : bandwidthPercentage > 10 ? 'moderate' : 'low'} `;
  message += `(bandwidth: ${bandwidthPercentage.toFixed(2)}%). `;
  
  // Add position assessment
  if (currentPrice > bands.upper) {
    message += `Price is above the upper band, suggesting overbought conditions. `;
    message += `This could indicate a potential reversal or continuation of a strong trend.`;
  } else if (currentPrice < bands.lower) {
    message += `Price is below the lower band, suggesting oversold conditions. `;
    message += `This could indicate a potential reversal or continuation of a strong downtrend.`;
  } else {
    message += `Price is within the bands (${percentBFormatted}% of the range from lower to upper band). `;
    
    if (percentB > 0.8) {
      message += `Price is near the upper band, suggesting strong momentum but approaching overbought territory.`;
    } else if (percentB < 0.2) {
      message += `Price is near the lower band, suggesting weakness but approaching oversold territory.`;
    } else {
      message += `Price is near the middle band, suggesting neutral momentum.`;
    }
  }
  
  return message;
}

/**
 * Calculate Simple Moving Average (SMA) for a given period
 * @param prices Array of price data points
 * @param period Number of periods to calculate SMA for
 * @returns The calculated SMA value
 */
export function calculateSMA(prices: number[], period: number): number | null {
  if (!prices || prices.length < period) {
    return null;
  }

  const sum = prices.slice(0, period).reduce((acc, price) => acc + price, 0);
  return sum / period;
}

/**
 * Generate a message about the SMA trend
 * @param currentPrice Current price
 * @param sma SMA value
 * @param period Period used for SMA calculation
 * @returns A message describing the SMA trend
 */
export function getSMAMessage(currentPrice: number, sma: number | null, period: number): string {
  if (sma === null) {
    return `Not enough data to calculate ${period}-day SMA.`;
  }

  const percentDiff = ((currentPrice - sma) / sma) * 100;
  
  if (currentPrice > sma) {
    return `Current price is ${percentDiff.toFixed(2)}% above the ${period}-day SMA (${sma.toFixed(2)}), suggesting an upward trend.`;
  } else if (currentPrice < sma) {
    return `Current price is ${Math.abs(percentDiff).toFixed(2)}% below the ${period}-day SMA (${sma.toFixed(2)}), suggesting a downward trend.`;
  } else {
    return `Current price is at the ${period}-day SMA (${sma.toFixed(2)}), suggesting a neutral trend.`;
  }
}

/**
 * Identify support and resistance levels from historical price data
 * @param prices Array of price data points
 * @returns Object containing support and resistance levels
 */
export function identifyTrendLines(prices: number[]): { support: number | null; resistance: number | null } {
  if (!prices || prices.length < 10) {
    return { support: null, resistance: null };
  }

  // Sort prices to find min and max
  const sortedPrices = [...prices].sort((a, b) => a - b);
  
  // Find support (lower 25% of price range)
  const supportIndex = Math.floor(sortedPrices.length * 0.25);
  const support = sortedPrices[supportIndex];
  
  // Find resistance (upper 75% of price range)
  const resistanceIndex = Math.floor(sortedPrices.length * 0.75);
  const resistance = sortedPrices[resistanceIndex];

  return { support, resistance };
}

/**
 * Generate a message about support and resistance levels
 * @param currentPrice Current price
 * @param support Support level
 * @param resistance Resistance level
 * @returns A message describing the support and resistance levels
 */
export function getTrendLinesMessage(currentPrice: number, support: number | null, resistance: number | null): string {
  if (support === null || resistance === null) {
    return "Not enough data to identify support and resistance levels.";
  }

  const supportDiff = ((currentPrice - support) / support) * 100;
  const resistanceDiff = ((resistance - currentPrice) / currentPrice) * 100;

  let message = `Support level: $${support.toFixed(2)}, Resistance level: $${resistance.toFixed(2)}. `;

  if (currentPrice < support) {
    message += `Current price is ${Math.abs(supportDiff).toFixed(2)}% below support level, suggesting a strong downward trend.`;
  } else if (currentPrice > resistance) {
    message += `Current price is ${Math.abs(resistanceDiff).toFixed(2)}% above resistance level, suggesting a strong upward trend.`;
  } else if (currentPrice - support < resistance - currentPrice) {
    message += `Current price is closer to support (${Math.abs(supportDiff).toFixed(2)}% away) than resistance (${resistanceDiff.toFixed(2)}% away).`;
  } else {
    message += `Current price is closer to resistance (${resistanceDiff.toFixed(2)}% away) than support (${Math.abs(supportDiff).toFixed(2)}% away).`;
  }

  return message;
}

/**
 * Extract historical prices from AlphaVantage API response or CoinDesk API response
 * @param data AlphaVantage or CoinDesk API response data
 * @returns Array of price data points (closing prices)
 */
export function extractHistoricalPrices(data: any): number[] {
  if (!data) {
    console.warn('No data provided to extractHistoricalPrices');
    return [];
  }
  
  // Log the data structure to help with debugging
  console.log('Extracting historical prices from data with structure:', {
    hasData: !!data.data,
    hasDataEntries: data.data && !!data.data.entries,
    hasDataData: data.data && !!data.data.Data,
    hasTopLevelData: !!data.Data,
    hasTimeSeries: !!data['Time Series (Digital Currency Daily)'],
    hasMetaData: !!data['Meta Data']
  });
  
  // Check if this is CoinDesk data format with top-level Data array (new format)
  if (data.Data && Array.isArray(data.Data)) {
    console.log('Detected CoinDesk top-level Data array format, extracting prices...');
    const prices: number[] = [];
    
    // Sort entries by timestamp (newest first)
    const sortedEntries = [...data.Data].sort(
      (a, b) => b.TIMESTAMP - a.TIMESTAMP
    );
    
    // Extract closing prices
    sortedEntries.forEach(entry => {
      if (entry.CLOSE && !isNaN(entry.CLOSE)) {
        prices.push(entry.CLOSE);
      }
    });
    
    console.log(`Extracted ${prices.length} prices from CoinDesk top-level Data array`);
    return prices;
  }
  
  // Check if this is CoinDesk data format with nested data.Data array
  if (data.data && data.data.Data && Array.isArray(data.data.Data)) {
    console.log('Detected CoinDesk nested data.Data array format, extracting prices...');
    const prices: number[] = [];
    
    // Sort entries by timestamp (newest first)
    const sortedEntries = [...data.data.Data].sort(
      (a, b) => b.TIMESTAMP - a.TIMESTAMP
    );
    
    // Extract closing prices
    sortedEntries.forEach(entry => {
      if (entry.CLOSE && !isNaN(entry.CLOSE)) {
        prices.push(entry.CLOSE);
      }
    });
    
    console.log(`Extracted ${prices.length} prices from CoinDesk nested data.Data array`);
    return prices;
  }
  
  // Check if this is CoinDesk data format with entries array (original format)
  if (data.data && data.data.entries && Array.isArray(data.data.entries)) {
    console.log('Detected CoinDesk entries array format, extracting prices...');
    const prices: number[] = [];
    
    // Sort entries by date (newest first)
    const sortedEntries = [...data.data.entries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    // Extract values
    sortedEntries.forEach(entry => {
      if (entry.value && !isNaN(entry.value)) {
        prices.push(entry.value);
      }
    });
    
    console.log(`Extracted ${prices.length} prices from CoinDesk entries array`);
    return prices;
  }
  
  // Check if this is AlphaVantage data format
  if (data['Meta Data'] && data['Time Series (Digital Currency Daily)']) {
    console.log('Detected AlphaVantage data format with Meta Data and Time Series, extracting prices...');
    const timeSeries = data['Time Series (Digital Currency Daily)'];
    const prices: number[] = [];
    
    // Sort dates in descending order (newest first)
    const sortedDates = Object.keys(timeSeries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    
    // Extract closing prices
    sortedDates.forEach(date => {
      const closePrice = parseFloat(timeSeries[date]['4. close']);
      if (!isNaN(closePrice)) {
        prices.push(closePrice);
      }
    });
    
    console.log(`Extracted ${prices.length} prices from AlphaVantage Time Series format`);
    return prices;
  }
  
  // Check if this is formatted CoinDesk data (converted to AlphaVantage-like format)
  if (data['Time Series (Digital Currency Daily)'] && !data['Meta Data']) {
    console.log('Detected formatted CoinDesk data with Time Series but no Meta Data, extracting prices...');
    const timeSeries = data['Time Series (Digital Currency Daily)'];
    const prices: number[] = [];
    
    // Sort dates in descending order (newest first)
    const sortedDates = Object.keys(timeSeries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    
    // Extract closing prices
    sortedDates.forEach(date => {
      const closePrice = parseFloat(timeSeries[date]['4. close']);
      if (!isNaN(closePrice)) {
        prices.push(closePrice);
      }
    });
    
    console.log(`Extracted ${prices.length} prices from formatted CoinDesk Time Series format`);
    return prices;
  }
  
  // Check if this is a direct array of price objects (sometimes returned by internal APIs)
  if (Array.isArray(data)) {
    console.log('Detected direct array of price objects, extracting prices...');
    const prices: number[] = [];
    
    // Try to extract prices from array elements
    data.forEach(item => {
      if (item.close && !isNaN(item.close)) {
        prices.push(item.close);
      } else if (item.CLOSE && !isNaN(item.CLOSE)) {
        prices.push(item.CLOSE);
      } else if (item.value && !isNaN(item.value)) {
        prices.push(item.value);
      } else if (item.price && !isNaN(item.price)) {
        prices.push(item.price);
      }
    });
    
    if (prices.length > 0) {
      console.log(`Extracted ${prices.length} prices from direct array format`);
      return prices;
    }
  }
  
  // If we reach here, we couldn't identify the data format
  // As a last resort, try to find any numeric properties that might contain price data
  console.warn('Unknown data format in extractHistoricalPrices, attempting to extract any numeric values');
  
  const prices: number[] = [];
  
  // Function to recursively search for numeric values in the object
  const findNumericValues = (obj: any, path: string = '') => {
    if (!obj || typeof obj !== 'object') return;
    
    Object.entries(obj).forEach(([key, value]) => {
      const currentPath = path ? `${path}.${key}` : key;
      
      // If the key suggests it might be a price (close, price, value)
      const isPriceKey = /close|price|value/i.test(key);
      
      if (typeof value === 'number' && isPriceKey) {
        console.log(`Found potential price value at ${currentPath}: ${value}`);
        prices.push(value);
      } else if (typeof value === 'string' && isPriceKey) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          console.log(`Found potential price string at ${currentPath}: ${numValue}`);
          prices.push(numValue);
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively search nested objects
        findNumericValues(value, currentPath);
      }
    });
  };
  
  findNumericValues(data);
  
  if (prices.length > 0) {
    console.log(`Extracted ${prices.length} potential price values from unknown format`);
    return prices;
  }
  
  console.error('Failed to extract any prices from the data');
  return [];
}

/**
 * Calculate Fibonacci Retracement levels
 * @param highPrice The highest price in the period
 * @param lowPrice The lowest price in the period
 * @returns Object containing Fibonacci retracement levels
 */
export function calculateFibonacciRetracements(highPrice: number, lowPrice: number): {
  level0: number;   // 0% retracement (high)
  level236: number; // 23.6% retracement
  level382: number; // 38.2% retracement
  level500: number; // 50% retracement
  level618: number; // 61.8% retracement
  level786: number; // 78.6% retracement
  level1000: number; // 100% retracement (low)
} {
  const diff = highPrice - lowPrice;
  
  return {
    level0: highPrice,
    level236: highPrice - (diff * 0.236),
    level382: highPrice - (diff * 0.382),
    level500: highPrice - (diff * 0.5),
    level618: highPrice - (diff * 0.618),
    level786: highPrice - (diff * 0.786),
    level1000: lowPrice
  };
}

/**
 * Generate a message about Fibonacci retracement levels
 * @param currentPrice Current price
 * @param fibLevels Fibonacci retracement levels
 * @returns A message describing the Fibonacci retracement levels
 */
export function getFibonacciMessage(currentPrice: number, fibLevels: ReturnType<typeof calculateFibonacciRetracements>): string {
  // Find the closest Fibonacci level
  const levels = [
    { name: '0%', value: fibLevels.level0 },
    { name: '23.6%', value: fibLevels.level236 },
    { name: '38.2%', value: fibLevels.level382 },
    { name: '50%', value: fibLevels.level500 },
    { name: '61.8%', value: fibLevels.level618 },
    { name: '78.6%', value: fibLevels.level786 },
    { name: '100%', value: fibLevels.level1000 }
  ];
  
  // Sort levels by distance to current price
  const sortedLevels = [...levels].sort((a, b) => 
    Math.abs(a.value - currentPrice) - Math.abs(b.value - currentPrice)
  );
  
  const closestLevel = sortedLevels[0];
  const secondClosestLevel = sortedLevels[1];
  
  // Determine if price is between two levels
  const betweenLevels = levels.findIndex(l => l.name === closestLevel.name);
  const nextLevelIndex = betweenLevels === levels.length - 1 ? betweenLevels - 1 : betweenLevels + 1;
  const nextLevel = levels[nextLevelIndex];
  
  // Determine if price is moving up or down relative to Fibonacci levels
  const movingUp = closestLevel.value < nextLevel.value;
  
  let message = `Fibonacci Retracement Levels: 0% ($${fibLevels.level0.toFixed(2)}), ` +
    `23.6% ($${fibLevels.level236.toFixed(2)}), ` +
    `38.2% ($${fibLevels.level382.toFixed(2)}), ` +
    `50% ($${fibLevels.level500.toFixed(2)}), ` +
    `61.8% ($${fibLevels.level618.toFixed(2)}), ` +
    `78.6% ($${fibLevels.level786.toFixed(2)}), ` +
    `100% ($${fibLevels.level1000.toFixed(2)}). `;
  
  message += `Current price ($${currentPrice.toFixed(2)}) is closest to the ${closestLevel.name} retracement level ($${closestLevel.value.toFixed(2)}). `;
  
  // Add interpretation
  if (Math.abs(currentPrice - closestLevel.value) < 0.01 * closestLevel.value) {
    // Within 1% of a Fibonacci level
    message += `This is a significant support/resistance level. `;
    
    if (closestLevel.name === '0%' || closestLevel.name === '100%') {
      message += `Price is at an extreme level, suggesting a potential reversal. `;
    } else if (closestLevel.name === '50%') {
      message += `The 50% retracement is a key decision point that could go either way. `;
    } else if (closestLevel.name === '61.8%') {
      message += `The 61.8% golden ratio is a strong support/resistance level. `;
    }
  } else {
    // Between levels
    message += `Price is moving ${movingUp ? 'up' : 'down'} between the ${closestLevel.name} and ${secondClosestLevel.name} levels. `;
  }
  
  return message;
}

/**
 * Generate an overall recommendation based on analysis
 * @param currentPrice Current price
 * @param sma SMA value
 * @param support Support level
 * @param resistance Resistance level
 * @param bollingerBands Bollinger Bands values
 * @returns A recommendation string
 */
/**
 * Detect potential breakout patterns using trend lines and Bollinger Bands
 * @param prices Array of price data points (most recent first)
 * @param trendLines Support and resistance levels
 * @param bollingerBands Bollinger Bands values
 * @returns Object containing breakout analysis
 */
export function detectBreakoutPatterns(
  prices: number[],
  trendLines: { support: number | null; resistance: number | null },
  bollingerBands: { upper: number | null; middle: number | null; lower: number | null }
): {
  breakoutDetected: boolean;
  breakoutType: 'bullish' | 'bearish' | 'none';
  breakoutStrength: 'strong' | 'moderate' | 'weak' | 'none';
  consolidationDetected: boolean;
  volatilityContraction: boolean;
  priceNearResistance: boolean;
  priceNearSupport: boolean;
} {
  if (!prices || prices.length < 10 || !trendLines.support || !trendLines.resistance || 
      !bollingerBands.upper || !bollingerBands.middle || !bollingerBands.lower) {
    return {
      breakoutDetected: false,
      breakoutType: 'none',
      breakoutStrength: 'none',
      consolidationDetected: false,
      volatilityContraction: false,
      priceNearResistance: false,
      priceNearSupport: false
    };
  }

  const currentPrice = prices[0];
  const previousPrice = prices[1];
  
  // Check if price is near support or resistance (within 3%)
  const priceNearSupport = Math.abs((currentPrice - trendLines.support) / trendLines.support) < 0.03;
  const priceNearResistance = Math.abs((currentPrice - trendLines.resistance) / trendLines.resistance) < 0.03;
  
  // Calculate Bollinger Band width (volatility indicator)
  const bandWidth = (bollingerBands.upper - bollingerBands.lower) / bollingerBands.middle;
  
  // Check for volatility contraction (narrowing Bollinger Bands)
  // Calculate previous Bollinger Bands (using prices[1:21] instead of prices[0:20])
  const previousPeriodPrices = prices.slice(1, 21);
  const previousSMA = previousPeriodPrices.reduce((sum, price) => sum + price, 0) / 20;
  const previousStdDev = calculateStandardDeviation(previousPeriodPrices, previousSMA);
  const previousBandWidth = (2 * previousStdDev) / previousSMA;
  
  const volatilityContraction = bandWidth < previousBandWidth;
  
  // Check for price consolidation (prices moving in a narrow range)
  const recentPrices = prices.slice(0, 10);
  const priceRange = Math.max(...recentPrices) - Math.min(...recentPrices);
  const avgPrice = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
  const consolidationDetected = (priceRange / avgPrice) < 0.05; // Less than 5% range
  
  // Detect breakout
  let breakoutDetected = false;
  let breakoutType: 'bullish' | 'bearish' | 'none' = 'none';
  let breakoutStrength: 'strong' | 'moderate' | 'weak' | 'none' = 'none';
  
  // Bullish breakout: price breaks above resistance or upper Bollinger Band
  if (previousPrice < trendLines.resistance && currentPrice > trendLines.resistance) {
    breakoutDetected = true;
    breakoutType = 'bullish';
    breakoutStrength = 'strong';
  } else if (previousPrice < bollingerBands.upper && currentPrice > bollingerBands.upper) {
    breakoutDetected = true;
    breakoutType = 'bullish';
    breakoutStrength = 'moderate';
  } else if (consolidationDetected && currentPrice > bollingerBands.middle && previousPrice < bollingerBands.middle) {
    breakoutDetected = true;
    breakoutType = 'bullish';
    breakoutStrength = 'weak';
  }
  
  // Bearish breakout: price breaks below support or lower Bollinger Band
  if (previousPrice > trendLines.support && currentPrice < trendLines.support) {
    breakoutDetected = true;
    breakoutType = 'bearish';
    breakoutStrength = 'strong';
  } else if (previousPrice > bollingerBands.lower && currentPrice < bollingerBands.lower) {
    breakoutDetected = true;
    breakoutType = 'bearish';
    breakoutStrength = 'moderate';
  } else if (consolidationDetected && currentPrice < bollingerBands.middle && previousPrice > bollingerBands.middle) {
    breakoutDetected = true;
    breakoutType = 'bearish';
    breakoutStrength = 'weak';
  }
  
  return {
    breakoutDetected,
    breakoutType,
    breakoutStrength,
    consolidationDetected,
    volatilityContraction,
    priceNearResistance,
    priceNearSupport
  };
}

/**
 * Generate a message about breakout patterns
 * @param breakoutAnalysis Breakout analysis results
 * @param currentPrice Current price
 * @param trendLines Support and resistance levels
 * @returns A message describing the breakout pattern analysis
 */
export function getBreakoutMessage(
  breakoutAnalysis: ReturnType<typeof detectBreakoutPatterns>,
  currentPrice: number,
  trendLines: { support: number | null; resistance: number | null }
): string {
  if (!trendLines.support || !trendLines.resistance) {
    return "Not enough data to analyze breakout patterns.";
  }

  let message = "Breakout Pattern Analysis: ";
  
  // Describe consolidation and volatility
  if (breakoutAnalysis.consolidationDetected) {
    message += "Price is consolidating in a narrow range. ";
    
    if (breakoutAnalysis.volatilityContraction) {
      message += "Volatility is contracting (narrowing Bollinger Bands), which often precedes a significant price movement. ";
    } else {
      message += "Volatility remains stable during consolidation. ";
    }
  } else {
    if (breakoutAnalysis.volatilityContraction) {
      message += "Volatility is contracting, which may lead to a breakout soon. ";
    } else {
      message += "Price is showing normal volatility patterns. ";
    }
  }
  
  // Describe proximity to support/resistance
  if (breakoutAnalysis.priceNearResistance) {
    message += `Price is testing resistance at $${trendLines.resistance.toFixed(2)}. `;
    if (breakoutAnalysis.consolidationDetected) {
      message += "Multiple tests of resistance during consolidation often precede a breakout. ";
    }
  } else if (breakoutAnalysis.priceNearSupport) {
    message += `Price is testing support at $${trendLines.support.toFixed(2)}. `;
    if (breakoutAnalysis.consolidationDetected) {
      message += "Multiple tests of support during consolidation often precede a breakout. ";
    }
  }
  
  // Describe breakout if detected
  if (breakoutAnalysis.breakoutDetected) {
    if (breakoutAnalysis.breakoutType === 'bullish') {
      message += `A ${breakoutAnalysis.breakoutStrength} bullish breakout has been detected. `;
      
      if (breakoutAnalysis.breakoutStrength === 'strong') {
        message += `Price has broken above resistance at $${trendLines.resistance.toFixed(2)}, suggesting potential for continued upward movement. `;
      } else if (breakoutAnalysis.breakoutStrength === 'moderate') {
        message += "Price has broken above the upper Bollinger Band, suggesting increased buying pressure. ";
      } else {
        message += "Price is showing early signs of bullish momentum. Confirmation is needed for a stronger signal. ";
      }
    } else if (breakoutAnalysis.breakoutType === 'bearish') {
      message += `A ${breakoutAnalysis.breakoutStrength} bearish breakout has been detected. `;
      
      if (breakoutAnalysis.breakoutStrength === 'strong') {
        message += `Price has broken below support at $${trendLines.support.toFixed(2)}, suggesting potential for continued downward movement. `;
      } else if (breakoutAnalysis.breakoutStrength === 'moderate') {
        message += "Price has broken below the lower Bollinger Band, suggesting increased selling pressure. ";
      } else {
        message += "Price is showing early signs of bearish momentum. Confirmation is needed for a stronger signal. ";
      }
    }
    
    // Add volume consideration note
    message += "Note: Breakouts are more reliable when accompanied by increased trading volume. ";
  } else {
    // No breakout detected
    if (breakoutAnalysis.consolidationDetected && breakoutAnalysis.volatilityContraction) {
      message += "No breakout yet, but the combination of price consolidation and decreasing volatility suggests a potential breakout may occur soon. ";
    } else {
      message += "No breakout patterns detected at this time. ";
    }
  }
  
  return message;
}

/**
 * Calculate a weighted average decision based on all technical indicators
 * @param currentPrice Current price
 * @param ema12 12-day EMA value
 * @param ema26 26-day EMA value
 * @param rsi14 14-day RSI value
 * @param bollingerBands Bollinger Bands values
 * @param trendLines Support and resistance levels
 * @param sma20 20-day SMA value
 * @param fibonacciLevels Fibonacci retracement levels
 * @param breakoutAnalysis Breakout pattern analysis results
 * @returns Object containing decision (buy/sell/hold) and confidence score
 */
export function calculateWeightedDecision(
  currentPrice: number,
  ema12: number | null,
  ema26: number | null,
  rsi14: number | null,
  bollingerBands: { upper: number | null; middle: number | null; lower: number | null },
  trendLines: { support: number | null; resistance: number | null },
  sma20: number | null,
  fibonacciLevels: ReturnType<typeof calculateFibonacciRetracements> | null,
  breakoutAnalysis: ReturnType<typeof detectBreakoutPatterns> | null
): { decision: 'buy' | 'sell' | 'hold'; confidence: number; explanation: string } {
  // Initialize scores for each decision type
  let buyScore = 0;
  let sellScore = 0;
  let holdScore = 0;
  
  // Track which indicators contributed to the decision
  const buyIndicators: string[] = [];
  const sellIndicators: string[] = [];
  const holdIndicators: string[] = [];
  
  // 1. EMA Analysis (15% weight)
  if (ema12 !== null && ema26 !== null) {
    const emaWeight = 0.15;
    
    // Bullish: EMA12 > EMA26
    if (ema12 > ema26) {
      buyScore += emaWeight;
      buyIndicators.push('EMA crossover (bullish)');
    } 
    // Bearish: EMA12 < EMA26
    else if (ema12 < ema26) {
      sellScore += emaWeight;
      sellIndicators.push('EMA crossover (bearish)');
    }
    // Neutral: EMA12 ≈ EMA26
    else {
      holdScore += emaWeight;
      holdIndicators.push('EMA (neutral)');
    }
  }
  
  // 2. RSI Analysis (20% weight)
  if (rsi14 !== null) {
    const rsiWeight = 0.20;
    
    // Oversold: RSI < 30 (buy signal)
    if (rsi14 < 30) {
      buyScore += rsiWeight;
      buyIndicators.push('RSI oversold');
    }
    // Overbought: RSI > 70 (sell signal)
    else if (rsi14 > 70) {
      sellScore += rsiWeight;
      sellIndicators.push('RSI overbought');
    }
    // Approaching oversold: 30 <= RSI < 40
    else if (rsi14 < 40) {
      buyScore += rsiWeight * 0.5;
      holdScore += rsiWeight * 0.5;
      buyIndicators.push('RSI approaching oversold');
    }
    // Approaching overbought: 60 < RSI <= 70
    else if (rsi14 > 60) {
      sellScore += rsiWeight * 0.5;
      holdScore += rsiWeight * 0.5;
      sellIndicators.push('RSI approaching overbought');
    }
    // Neutral: 40 <= RSI <= 60
    else {
      holdScore += rsiWeight;
      holdIndicators.push('RSI neutral');
    }
  }
  
  // 3. Bollinger Bands Analysis (15% weight)
  if (bollingerBands.upper !== null && bollingerBands.middle !== null && bollingerBands.lower !== null) {
    const bbWeight = 0.15;
    
    // Calculate %B (position within the bands)
    const percentB = (currentPrice - bollingerBands.lower) / (bollingerBands.upper - bollingerBands.lower);
    
    // Below lower band (oversold)
    if (currentPrice < bollingerBands.lower) {
      buyScore += bbWeight;
      buyIndicators.push('Price below lower Bollinger Band');
    }
    // Above upper band (overbought)
    else if (currentPrice > bollingerBands.upper) {
      sellScore += bbWeight;
      sellIndicators.push('Price above upper Bollinger Band');
    }
    // Near lower band (approaching oversold)
    else if (percentB < 0.2) {
      buyScore += bbWeight * 0.7;
      holdScore += bbWeight * 0.3;
      buyIndicators.push('Price near lower Bollinger Band');
    }
    // Near upper band (approaching overbought)
    else if (percentB > 0.8) {
      sellScore += bbWeight * 0.7;
      holdScore += bbWeight * 0.3;
      sellIndicators.push('Price near upper Bollinger Band');
    }
    // Middle of the bands (neutral)
    else {
      holdScore += bbWeight;
      holdIndicators.push('Price within Bollinger Bands');
    }
  }
  
  // 4. Trend Lines Analysis (15% weight)
  if (trendLines.support !== null && trendLines.resistance !== null) {
    const trendWeight = 0.15;
    
    // Below support (strong buy or continued downtrend)
    if (currentPrice < trendLines.support) {
      // If we're in a confirmed downtrend, this could be continuation
      if (sma20 !== null && currentPrice < sma20) {
        sellScore += trendWeight * 0.6;
        buyScore += trendWeight * 0.4; // Still some buy potential due to oversold
        sellIndicators.push('Price below support in downtrend');
      } else {
        buyScore += trendWeight;
        buyIndicators.push('Price below support');
      }
    }
    // Above resistance (strong sell or continued uptrend)
    else if (currentPrice > trendLines.resistance) {
      // If we're in a confirmed uptrend, this could be continuation
      if (sma20 !== null && currentPrice > sma20) {
        buyScore += trendWeight * 0.6;
        sellScore += trendWeight * 0.4; // Still some sell potential due to overbought
        buyIndicators.push('Price above resistance in uptrend');
      } else {
        sellScore += trendWeight;
        sellIndicators.push('Price above resistance');
      }
    }
    // Near support (potential buy)
    else if (Math.abs((currentPrice - trendLines.support) / trendLines.support) < 0.03) {
      buyScore += trendWeight * 0.8;
      holdScore += trendWeight * 0.2;
      buyIndicators.push('Price near support');
    }
    // Near resistance (potential sell)
    else if (Math.abs((currentPrice - trendLines.resistance) / trendLines.resistance) < 0.03) {
      sellScore += trendWeight * 0.8;
      holdScore += trendWeight * 0.2;
      sellIndicators.push('Price near resistance');
    }
    // In the middle of the range (hold)
    else {
      holdScore += trendWeight;
      holdIndicators.push('Price between support and resistance');
    }
  }
  
  // 5. Simple Moving Average Analysis (10% weight)
  if (sma20 !== null) {
    const smaWeight = 0.10;
    
    // Price above SMA (bullish)
    if (currentPrice > sma20) {
      buyScore += smaWeight;
      buyIndicators.push('Price above SMA');
    }
    // Price below SMA (bearish)
    else if (currentPrice < sma20) {
      sellScore += smaWeight;
      sellIndicators.push('Price below SMA');
    }
    // Price at SMA (neutral)
    else {
      holdScore += smaWeight;
      holdIndicators.push('Price at SMA');
    }
  }
  
  // 6. Fibonacci Retracement Analysis (10% weight)
  if (fibonacciLevels !== null) {
    const fibWeight = 0.10;
    
    // Find the closest Fibonacci level
    const levels = [
      { name: '0%', value: fibonacciLevels.level0 },
      { name: '23.6%', value: fibonacciLevels.level236 },
      { name: '38.2%', value: fibonacciLevels.level382 },
      { name: '50%', value: fibonacciLevels.level500 },
      { name: '61.8%', value: fibonacciLevels.level618 },
      { name: '78.6%', value: fibonacciLevels.level786 },
      { name: '100%', value: fibonacciLevels.level1000 }
    ];
    
    // Sort levels by distance to current price
    const sortedLevels = [...levels].sort((a, b) => 
      Math.abs(a.value - currentPrice) - Math.abs(b.value - currentPrice)
    );
    
    const closestLevel = sortedLevels[0];
    
    // At 0% level (potential reversal/sell)
    if (closestLevel.name === '0%' && Math.abs(currentPrice - closestLevel.value) / closestLevel.value < 0.02) {
      sellScore += fibWeight;
      sellIndicators.push('Price at 0% Fibonacci level');
    }
    // At 100% level (potential reversal/buy)
    else if (closestLevel.name === '100%' && Math.abs(currentPrice - closestLevel.value) / closestLevel.value < 0.02) {
      buyScore += fibWeight;
      buyIndicators.push('Price at 100% Fibonacci level');
    }
    // At 61.8% level (golden ratio - strong support/resistance)
    else if (closestLevel.name === '61.8%' && Math.abs(currentPrice - closestLevel.value) / closestLevel.value < 0.02) {
      // If price is falling to this level, it's a potential buy
      if (currentPrice < fibonacciLevels.level500) {
        buyScore += fibWeight * 0.7;
        holdScore += fibWeight * 0.3;
        buyIndicators.push('Price at 61.8% Fibonacci support');
      }
      // If price is rising to this level, it's a potential resistance/sell
      else {
        sellScore += fibWeight * 0.7;
        holdScore += fibWeight * 0.3;
        sellIndicators.push('Price at 61.8% Fibonacci resistance');
      }
    }
    // At 50% level (neutral retracement)
    else if (closestLevel.name === '50%' && Math.abs(currentPrice - closestLevel.value) / closestLevel.value < 0.02) {
      holdScore += fibWeight;
      holdIndicators.push('Price at 50% Fibonacci level');
    }
    // At other levels or between levels
    else {
      holdScore += fibWeight * 0.7;
      
      // Slight bias based on position in the retracement
      if (currentPrice < fibonacciLevels.level500) {
        buyScore += fibWeight * 0.3;
        holdIndicators.push('Price in lower half of Fibonacci range');
      } else {
        sellScore += fibWeight * 0.3;
        holdIndicators.push('Price in upper half of Fibonacci range');
      }
    }
  }
  
  // 7. Breakout Patterns Analysis (15% weight)
  if (breakoutAnalysis !== null) {
    const breakoutWeight = 0.15;
    
    if (breakoutAnalysis.breakoutDetected) {
      // Strong bullish breakout
      if (breakoutAnalysis.breakoutType === 'bullish' && breakoutAnalysis.breakoutStrength === 'strong') {
        buyScore += breakoutWeight;
        buyIndicators.push('Strong bullish breakout');
      }
      // Moderate bullish breakout
      else if (breakoutAnalysis.breakoutType === 'bullish' && breakoutAnalysis.breakoutStrength === 'moderate') {
        buyScore += breakoutWeight * 0.8;
        holdScore += breakoutWeight * 0.2;
        buyIndicators.push('Moderate bullish breakout');
      }
      // Weak bullish breakout
      else if (breakoutAnalysis.breakoutType === 'bullish' && breakoutAnalysis.breakoutStrength === 'weak') {
        buyScore += breakoutWeight * 0.6;
        holdScore += breakoutWeight * 0.4;
        buyIndicators.push('Weak bullish breakout');
      }
      // Strong bearish breakout
      else if (breakoutAnalysis.breakoutType === 'bearish' && breakoutAnalysis.breakoutStrength === 'strong') {
        sellScore += breakoutWeight;
        sellIndicators.push('Strong bearish breakout');
      }
      // Moderate bearish breakout
      else if (breakoutAnalysis.breakoutType === 'bearish' && breakoutAnalysis.breakoutStrength === 'moderate') {
        sellScore += breakoutWeight * 0.8;
        holdScore += breakoutWeight * 0.2;
        sellIndicators.push('Moderate bearish breakout');
      }
      // Weak bearish breakout
      else if (breakoutAnalysis.breakoutType === 'bearish' && breakoutAnalysis.breakoutStrength === 'weak') {
        sellScore += breakoutWeight * 0.6;
        holdScore += breakoutWeight * 0.4;
        sellIndicators.push('Weak bearish breakout');
      }
    } else {
      // No breakout, but potential setup
      if (breakoutAnalysis.consolidationDetected && breakoutAnalysis.volatilityContraction) {
        holdScore += breakoutWeight * 0.8;
        // Slight bias based on price position
        if (breakoutAnalysis.priceNearResistance) {
          buyScore += breakoutWeight * 0.2;
          holdIndicators.push('Consolidation near resistance');
        } else if (breakoutAnalysis.priceNearSupport) {
          sellScore += breakoutWeight * 0.2;
          holdIndicators.push('Consolidation near support');
        } else {
          holdScore += breakoutWeight * 0.2;
          holdIndicators.push('Price consolidation with contracting volatility');
        }
      }
      // Normal market conditions
      else {
        holdScore += breakoutWeight;
        holdIndicators.push('No breakout patterns');
      }
    }
  }
  
  // Determine the final decision
  let decision: 'buy' | 'sell' | 'hold';
  let confidence: number;
  let explanation: string;
  
  // Calculate total score (should be close to 1.0 if all indicators were available)
  const totalScore = buyScore + sellScore + holdScore;
  
  // Normalize scores if we have a valid total
  if (totalScore > 0) {
    buyScore = buyScore / totalScore;
    sellScore = sellScore / totalScore;
    holdScore = holdScore / totalScore;
  }
  
  // Determine decision based on highest score
  if (buyScore > sellScore && buyScore > holdScore) {
    decision = 'buy';
    confidence = buyScore;
    explanation = `Buy recommendation (${(buyScore * 100).toFixed(1)}% confidence) based on: ${buyIndicators.join(', ')}`;
  } else if (sellScore > buyScore && sellScore > holdScore) {
    decision = 'sell';
    confidence = sellScore;
    explanation = `Sell recommendation (${(sellScore * 100).toFixed(1)}% confidence) based on: ${sellIndicators.join(', ')}`;
  } else {
    decision = 'hold';
    confidence = holdScore;
    explanation = `Hold recommendation (${(holdScore * 100).toFixed(1)}% confidence) based on: ${holdIndicators.join(', ')}`;
  }
  
  return { decision, confidence, explanation };
}

export function generateRecommendation(
  currentPrice: number,
  sma: number | null,
  support: number | null,
  resistance: number | null,
  bollingerBands: { upper: number | null; middle: number | null; lower: number | null } = { upper: null, middle: null, lower: null }
): string {
  if (sma === null || support === null || resistance === null) {
    return "Insufficient data for a recommendation.";
  }

  // Check if price is above SMA (bullish)
  const aboveSMA = currentPrice > sma;
  
  // Check if price is near support or resistance
  const nearSupport = support && Math.abs((currentPrice - support) / support) < 0.05; // Within 5% of support
  const nearResistance = resistance && Math.abs((currentPrice - resistance) / resistance) < 0.05; // Within 5% of resistance
  
  // Check Bollinger Bands signals if available
  let bollingerSignal = "";
  if (bollingerBands.upper !== null && bollingerBands.middle !== null && bollingerBands.lower !== null) {
    if (currentPrice > bollingerBands.upper) {
      bollingerSignal = "overbought";
    } else if (currentPrice < bollingerBands.lower) {
      bollingerSignal = "oversold";
    } else {
      // Calculate %B (position within the bands)
      const percentB = (currentPrice - bollingerBands.lower) / (bollingerBands.upper - bollingerBands.lower);
      if (percentB > 0.8) {
        bollingerSignal = "approaching overbought";
      } else if (percentB < 0.2) {
        bollingerSignal = "approaching oversold";
      } else {
        bollingerSignal = "neutral";
      }
    }
  }
  
  // Generate recommendation incorporating Bollinger Bands
  let recommendation = "";
  
  if (bollingerSignal === "overbought") {
    if (nearResistance) {
      recommendation = "Consider taking profits. Price is above the upper Bollinger Band and near resistance level, indicating overbought conditions.";
    } else {
      recommendation = "Consider reducing position. Price is above the upper Bollinger Band, indicating potential overbought conditions, but watch for continued momentum.";
    }
  } else if (bollingerSignal === "oversold") {
    if (nearSupport) {
      recommendation = "Consider buying. Price is below the lower Bollinger Band and near support level, indicating oversold conditions with potential for reversal.";
    } else {
      recommendation = "Watch for buying opportunity. Price is below the lower Bollinger Band, indicating potential oversold conditions, but may continue downward.";
    }
  } else {
    // Use the original SMA and support/resistance based logic
    if (aboveSMA && nearResistance) {
      recommendation = "Consider taking profits. Price is above SMA and near resistance level.";
      if (bollingerSignal === "approaching overbought") {
        recommendation += " Bollinger Bands confirm approaching overbought conditions.";
      }
    } else if (aboveSMA && !nearResistance) {
      recommendation = "Hold or buy. Price is above SMA and has room to grow before hitting resistance.";
      if (bollingerSignal === "approaching overbought") {
        recommendation += " However, Bollinger Bands suggest approaching overbought conditions.";
      }
    } else if (!aboveSMA && nearSupport) {
      recommendation = "Consider buying. Price is below SMA but near support level, suggesting potential upward movement.";
      if (bollingerSignal === "approaching oversold") {
        recommendation += " Bollinger Bands confirm approaching oversold conditions.";
      }
    } else if (!aboveSMA && !nearSupport) {
      recommendation = "Hold or wait. Price is below SMA and not near support level yet.";
      if (bollingerSignal === "approaching oversold") {
        recommendation += " Bollinger Bands suggest approaching oversold conditions, which may present a buying opportunity soon.";
      }
    } else {
      recommendation = "Neutral outlook. Monitor for clearer signals.";
      if (bollingerSignal !== "neutral") {
        recommendation += ` Bollinger Bands suggest ${bollingerSignal} conditions.`;
      }
    }
  }
  
  return recommendation;
}