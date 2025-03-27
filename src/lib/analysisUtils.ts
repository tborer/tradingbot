// Analysis utility functions for stock and crypto data

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
 * Extract historical prices from AlphaVantage API response
 * @param data AlphaVantage API response data
 * @returns Array of price data points (closing prices)
 */
export function extractHistoricalPrices(data: any): number[] {
  if (!data || !data['Time Series (Digital Currency Monthly)']) {
    return [];
  }

  const timeSeries = data['Time Series (Digital Currency Monthly)'];
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
 * Generate an overall recommendation based on analysis
 * @param currentPrice Current price
 * @param sma SMA value
 * @param support Support level
 * @param resistance Resistance level
 * @returns A recommendation string
 */
export function generateRecommendation(
  currentPrice: number,
  sma: number | null,
  support: number | null,
  resistance: number | null
): string {
  if (sma === null || support === null || resistance === null) {
    return "Insufficient data for a recommendation.";
  }

  // Check if price is above SMA (bullish)
  const aboveSMA = currentPrice > sma;
  
  // Check if price is near support or resistance
  const nearSupport = support && Math.abs((currentPrice - support) / support) < 0.05; // Within 5% of support
  const nearResistance = resistance && Math.abs((currentPrice - resistance) / resistance) < 0.05; // Within 5% of resistance
  
  // Generate recommendation
  if (aboveSMA && nearResistance) {
    return "Consider taking profits. Price is above SMA and near resistance level.";
  } else if (aboveSMA && !nearResistance) {
    return "Hold or buy. Price is above SMA and has room to grow before hitting resistance.";
  } else if (!aboveSMA && nearSupport) {
    return "Consider buying. Price is below SMA but near support level, suggesting potential upward movement.";
  } else if (!aboveSMA && !nearSupport) {
    return "Hold or wait. Price is below SMA and not near support level yet.";
  } else {
    return "Neutral outlook. Monitor for clearer signals.";
  }
}