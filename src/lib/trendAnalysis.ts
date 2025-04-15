// Trend Analysis Utility Functions

/**
 * Interface for drawdown and drawup analysis results
 */
export interface DrawdownDrawupAnalysis {
  maxDrawdown: number;
  maxDrawup: number;
  avgDrawdown: number;
  avgDrawup: number;
  frequentDrawdown: number;
  frequentDrawup: number;
  drawdowns: number[];
  drawups: number[];
}

/**
 * Calculate drawdown and drawup analysis from historical price data
 * @param historicalData Array of price data points (sorted from oldest to newest)
 * @returns Analysis results including maximum, average, and frequent drawdowns and drawups
 */
export function calculateDrawdownDrawup(historicalData: number[]): DrawdownDrawupAnalysis {
  if (!historicalData || historicalData.length < 2) {
    return {
      maxDrawdown: 0,
      maxDrawup: 0,
      avgDrawdown: 0,
      avgDrawup: 0,
      frequentDrawdown: 0,
      frequentDrawup: 0,
      drawdowns: [],
      drawups: []
    };
  }

  // Initialize arrays to store all drawdowns and drawups
  const drawdowns: number[] = [];
  const drawups: number[] = [];

  // Track peaks and troughs
  let peak = historicalData[0];
  let trough = historicalData[0];
  let inDrawdown = false;
  let inDrawup = true;

  // Analyze the price series
  for (let i = 1; i < historicalData.length; i++) {
    const currentPrice = historicalData[i];

    // Check for drawdown (peak to trough)
    if (inDrawup && currentPrice < peak) {
      // Transition from drawup to drawdown
      inDrawup = false;
      inDrawdown = true;
      trough = currentPrice;
      
      // Calculate drawup percentage and add to array
      const drawup = ((peak - historicalData[i-1]) / historicalData[i-1]) * 100;
      if (drawup > 0) drawups.push(drawup);
    } 
    // Continue drawdown
    else if (inDrawdown && currentPrice <= trough) {
      trough = currentPrice;
    } 
    // Check for drawup (trough to peak)
    else if (inDrawdown && currentPrice > trough) {
      // Transition from drawdown to drawup
      inDrawdown = false;
      inDrawup = true;
      peak = currentPrice;
      
      // Calculate drawdown percentage and add to array
      const drawdown = ((trough - historicalData[i-1]) / historicalData[i-1]) * -100;
      if (drawdown > 0) drawdowns.push(drawdown);
    } 
    // Continue drawup
    else if (inDrawup && currentPrice >= peak) {
      peak = currentPrice;
    }
  }

  // Calculate maximum drawdown and drawup
  const maxDrawdown = drawdowns.length > 0 ? Math.max(...drawdowns) : 0;
  const maxDrawup = drawups.length > 0 ? Math.max(...drawups) : 0;

  // Calculate average drawdown and drawup
  const avgDrawdown = drawdowns.length > 0 
    ? drawdowns.reduce((sum, value) => sum + value, 0) / drawdowns.length 
    : 0;
  const avgDrawup = drawups.length > 0 
    ? drawups.reduce((sum, value) => sum + value, 0) / drawups.length 
    : 0;

  // Calculate most frequent drawdown and drawup (rounded to nearest 0.5%)
  const frequentDrawdown = calculateMostFrequentValue(drawdowns);
  const frequentDrawup = calculateMostFrequentValue(drawups);

  return {
    maxDrawdown,
    maxDrawup,
    avgDrawdown,
    avgDrawup,
    frequentDrawdown,
    frequentDrawup,
    drawdowns,
    drawups
  };
}

/**
 * Calculate the most frequent value in an array (rounded to nearest 0.5%)
 * @param values Array of numeric values
 * @returns Most frequent value, or 0 if array is empty
 */
function calculateMostFrequentValue(values: number[]): number {
  if (values.length === 0) return 0;

  // Round values to nearest 0.5% for better frequency analysis
  const roundedValues = values.map(value => Math.round(value * 2) / 2);
  
  // Count occurrences of each rounded value
  const counts: Record<number, number> = {};
  roundedValues.forEach(value => {
    counts[value] = (counts[value] || 0) + 1;
  });

  // Find the most frequent value
  let mostFrequentValue = 0;
  let highestCount = 0;
  
  Object.entries(counts).forEach(([value, count]) => {
    if (count > highestCount) {
      highestCount = count;
      mostFrequentValue = parseFloat(value);
    }
  });

  return mostFrequentValue;
}

/**
 * Extract price data from CoinDesk API response format
 * @param data Formatted historical data
 * @returns Array of closing prices (oldest to newest)
 */
export function extractPriceDataFromCoinDesk(data: any): number[] {
  if (!data || !data['Time Series (Digital Currency Daily)']) {
    return [];
  }

  const timeSeries = data['Time Series (Digital Currency Daily)'];
  
  // Convert the time series object to an array of [date, price] pairs
  const priceArray = Object.entries(timeSeries).map(([date, values]: [string, any]) => {
    return {
      date,
      price: parseFloat(values['4. close'])
    };
  });

  // Sort by date (oldest first)
  priceArray.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Return just the prices
  return priceArray.map(item => item.price);
}