// Analysis utility functions for stock and crypto data

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
    return [];
  }
  
  // Check if this is CoinDesk data format
  if (data.data && data.data.entries && Array.isArray(data.data.entries)) {
    console.log('Detected CoinDesk data format, extracting prices...');
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
    
    return prices;
  }
  
  // Otherwise, assume AlphaVantage format
  // Check for daily data first, then fall back to monthly if needed
  const timeSeriesKey = data['Time Series (Digital Currency Daily)'] 
    ? 'Time Series (Digital Currency Daily)' 
    : 'Time Series (Digital Currency Monthly)';
    
  if (!data[timeSeriesKey]) {
    return [];
  }

  const timeSeries = data[timeSeriesKey];
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

  return prices;
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