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
  stdDevDrawdown?: number; // Added standard deviation
  stdDevDrawup?: number;   // Added standard deviation
  medianDrawdown?: number; // Added median
  medianDrawup?: number;   // Added median
  minProfitableChange?: number; // Added minimum profitable change
}

/**
 * Calculates the minimum percentage price change required to be profitable
 * when the same fee rate applies to both buying and selling.
 * 
 * @param buyPrice The price at which the cryptocurrency was bought.
 * @param feeRate The fee rate for both buying and selling (e.g., 0.004 for 0.4%).
 * @returns The minimum percentage price change required for profit.
 *          Returns null if the fee rate is invalid.
 */
export function calculateMinProfitableChange(buyPrice: number, feeRate: number): number | null {
  if (!(0 <= feeRate && feeRate < 1)) {
    return null; // Invalid fee rate
  }

  const minSellPrice = (buyPrice * (1 + feeRate)) / (1 - feeRate);
  const minPercentageChange = ((minSellPrice - buyPrice) / buyPrice) * 100;

  return minPercentageChange;
}

/**
 * Calculate drawdown and drawup analysis from historical price data
 * @param historicalData Array of price data points (sorted from oldest to newest)
 * @returns Analysis results including maximum, average, and frequent drawdowns and drawups
 */
export function calculateDrawdownDrawup(historicalData: number[]): DrawdownDrawupAnalysis {
  console.log(`Calculating drawdown/drawup with ${historicalData?.length || 0} data points`);
  
  // Log the first few and last few data points to help with debugging
  if (historicalData && historicalData.length > 0) {
    const sampleStart = historicalData.slice(0, Math.min(3, historicalData.length));
    const sampleEnd = historicalData.slice(Math.max(0, historicalData.length - 3));
    console.log(`Sample data points - Start: ${JSON.stringify(sampleStart)}, End: ${JSON.stringify(sampleEnd)}`);
  }
  
  if (!historicalData || historicalData.length < 2) {
    console.warn('Insufficient historical data for drawdown/drawup calculation');
    return {
      maxDrawdown: 0,
      maxDrawup: 0,
      avgDrawdown: 0,
      avgDrawup: 0,
      frequentDrawdown: 0,
      frequentDrawup: 0,
      drawdowns: [],
      drawups: [],
      stdDevDrawdown: 0,
      stdDevDrawup: 0,
      medianDrawdown: 0,
      medianDrawup: 0
    };
  }

  // Initialize arrays to store all drawdowns and drawups
  const drawdowns: number[] = [];
  const drawups: number[] = [];

  // Find local peaks and troughs
  const peaks: {index: number, price: number}[] = [];
  const troughs: {index: number, price: number}[] = [];
  
  // Identify local peaks and troughs (using a simple algorithm)
  for (let i = 1; i < historicalData.length - 1; i++) {
    const prev = historicalData[i-1];
    const current = historicalData[i];
    const next = historicalData[i+1];
    
    // Skip invalid price points
    if (prev === null || current === null || next === null || 
        isNaN(prev) || isNaN(current) || isNaN(next)) {
      continue;
    }
    
    // Local peak (greater than or equal to neighbors)
    if (current >= prev && current >= next) {
      peaks.push({index: i, price: current});
      console.log(`Detected peak at index ${i}: ${current}`);
    }
    
    // Local trough (less than or equal to neighbors)
    if (current <= prev && current <= next) {
      troughs.push({index: i, price: current});
      console.log(`Detected trough at index ${i}: ${current}`);
    }
  }
  
  // Add first and last points if they might be peaks or troughs
  if (historicalData.length >= 2) {
    // First point could be a peak or trough
    const first = historicalData[0];
    const secondPoint = historicalData[1];
    
    if (first > secondPoint) {
      peaks.push({index: 0, price: first});
      console.log(`Added first point as peak: ${first}`);
    } else if (first < secondPoint) {
      troughs.push({index: 0, price: first});
      console.log(`Added first point as trough: ${first}`);
    }
    
    // Last point could be a peak or trough
    const last = historicalData[historicalData.length - 1];
    const secondLast = historicalData[historicalData.length - 2];
    
    if (last > secondLast) {
      peaks.push({index: historicalData.length - 1, price: last});
      console.log(`Added last point as peak: ${last}`);
    } else if (last < secondLast) {
      troughs.push({index: historicalData.length - 1, price: last});
      console.log(`Added last point as trough: ${last}`);
    }
  }
  
  // Sort peaks and troughs by index
  peaks.sort((a, b) => a.index - b.index);
  troughs.sort((a, b) => a.index - b.index);
  
  console.log(`Identified ${peaks.length} peaks and ${troughs.length} troughs`);
  
  // Calculate drawdowns: For each peak, find the lowest point (trough) until a new higher peak
  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i];
    let nextHigherPeakIndex = historicalData.length;
    
    // Find the next higher peak
    for (let j = i + 1; j < peaks.length; j++) {
      if (peaks[j].price > peak.price) {
        nextHigherPeakIndex = peaks[j].index;
        break;
      }
    }
    
    // Find the lowest point (trough) between this peak and the next higher peak
    let lowestTrough = {index: peak.index, price: peak.price};
    
    for (const trough of troughs) {
      if (trough.index > peak.index && trough.index < nextHigherPeakIndex && trough.price < lowestTrough.price) {
        lowestTrough = trough;
      }
    }
    
    // Calculate drawdown percentage if we found a lower trough
    if (lowestTrough.price < peak.price && peak.price > 0) {
      const drawdownPercent = ((peak.price - lowestTrough.price) / peak.price) * 100;
      if (drawdownPercent > 0) {
        drawdowns.push(drawdownPercent);
        console.log(`Calculated drawdown: ${drawdownPercent.toFixed(2)}% from peak ${peak.price} to trough ${lowestTrough.price}`);
      }
    }
  }
  
  // Calculate drawups: For each trough, find the highest point (peak) until a new lower trough
  for (let i = 0; i < troughs.length; i++) {
    const trough = troughs[i];
    let nextLowerTroughIndex = historicalData.length;
    
    // Find the next lower trough
    for (let j = i + 1; j < troughs.length; j++) {
      if (troughs[j].price < trough.price) {
        nextLowerTroughIndex = troughs[j].index;
        break;
      }
    }
    
    // Find the highest point (peak) between this trough and the next lower trough
    let highestPeak = {index: trough.index, price: trough.price};
    
    for (const peak of peaks) {
      if (peak.index > trough.index && peak.index < nextLowerTroughIndex && peak.price > highestPeak.price) {
        highestPeak = peak;
      }
    }
    
    // Calculate drawup percentage if we found a higher peak
    if (highestPeak.price > trough.price && trough.price > 0) {
      const drawupPercent = ((highestPeak.price - trough.price) / trough.price) * 100;
      if (drawupPercent > 0) {
        drawups.push(drawupPercent);
        console.log(`Calculated drawup: ${drawupPercent.toFixed(2)}% from trough ${trough.price} to peak ${highestPeak.price}`);
      }
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
    
  // Calculate median drawdown and drawup
  const medianDrawdown = calculateMedian(drawdowns);
  const medianDrawup = calculateMedian(drawups);
  
  // Calculate standard deviation for drawdowns and drawups
  const stdDevDrawdown = calculateStandardDeviation(drawdowns, avgDrawdown);
  const stdDevDrawup = calculateStandardDeviation(drawups, avgDrawup);

  // Calculate most frequent drawdown and drawup (rounded to nearest 0.5%)
  const frequentDrawdown = calculateMostFrequentValue(drawdowns);
  const frequentDrawup = calculateMostFrequentValue(drawups);
  
  // Log the results for debugging
  console.log(`Drawdown/Drawup Analysis Results:
    - Found ${drawdowns.length} drawdowns and ${drawups.length} drawups
    - Max Drawdown: ${maxDrawdown.toFixed(2)}%
    - Max Drawup: ${maxDrawup.toFixed(2)}%
    - Avg Drawdown: ${avgDrawdown.toFixed(2)}%
    - Avg Drawup: ${avgDrawup.toFixed(2)}%
    - Median Drawdown: ${medianDrawdown.toFixed(2)}%
    - Median Drawup: ${medianDrawup.toFixed(2)}%
    - StdDev Drawdown: ${stdDevDrawdown.toFixed(2)}%
    - StdDev Drawup: ${stdDevDrawup.toFixed(2)}%
    - Frequent Drawdown: ${frequentDrawdown.toFixed(2)}%
    - Frequent Drawup: ${frequentDrawup.toFixed(2)}%
  `);

  // If we have no meaningful data, use default values for better UX
  if (drawdowns.length === 0 && drawups.length === 0) {
    console.warn('No drawdowns or drawups detected, using fallback values');
    
    // Calculate simple price change as fallback
    if (historicalData.length >= 2) {
      const firstPrice = historicalData[0];
      const lastPrice = historicalData[historicalData.length - 1];
      
      if (firstPrice > 0 && lastPrice > 0) {
        const percentChange = ((lastPrice - firstPrice) / firstPrice) * 100;
        const absChange = Math.abs(percentChange);
        
        // Calculate minimum profitable change with default fee rate
        const defaultFeeRate = 0.004; // 0.4% fee rate
        const minProfitableChange = calculateMinProfitableChange(lastPrice, defaultFeeRate);
        
        // Use the overall price change as a fallback
        return {
          maxDrawdown: percentChange < 0 ? absChange : 1.5,
          maxDrawup: percentChange > 0 ? absChange : 1.5,
          avgDrawdown: percentChange < 0 ? absChange / 2 : 0.8,
          avgDrawup: percentChange > 0 ? absChange / 2 : 0.8,
          frequentDrawdown: percentChange < 0 ? absChange / 3 : 0.5,
          frequentDrawup: percentChange > 0 ? absChange / 3 : 0.5,
          drawdowns: percentChange < 0 ? [absChange] : [],
          drawups: percentChange > 0 ? [absChange] : [],
          stdDevDrawdown: 0,
          stdDevDrawup: 0,
          medianDrawdown: percentChange < 0 ? absChange : 0,
          medianDrawup: percentChange > 0 ? absChange : 0,
          minProfitableChange: minProfitableChange !== null ? minProfitableChange : 0.8
        };
      }
    }
    
    // If all else fails, use non-zero defaults for better UX
    return {
      maxDrawdown: 1.5,
      maxDrawup: 2.0,
      avgDrawdown: 0.8,
      avgDrawup: 1.0,
      frequentDrawdown: 0.5,
      frequentDrawup: 0.7,
      drawdowns: [],
      drawups: [],
      stdDevDrawdown: 0.3,
      stdDevDrawup: 0.4,
      medianDrawdown: 0.7,
      medianDrawup: 0.9,
      minProfitableChange: 0.8 // Default minimum profitable change
    };
  }

  // Calculate minimum profitable change with default fee rate
  const defaultFeeRate = 0.004; // 0.4% fee rate
  const currentPrice = historicalData[historicalData.length - 1]; // Use the most recent price
  const minProfitableChange = calculateMinProfitableChange(currentPrice, defaultFeeRate);

  return {
    maxDrawdown,
    maxDrawup,
    avgDrawdown,
    avgDrawup,
    frequentDrawdown,
    frequentDrawup,
    drawdowns,
    drawups,
    stdDevDrawdown,
    stdDevDrawup,
    medianDrawdown,
    medianDrawup,
    minProfitableChange: minProfitableChange !== null ? minProfitableChange : 0.8
  };
}

/**
 * Calculate the median value of an array
 * @param values Array of numeric values
 * @returns Median value, or 0 if array is empty
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  
  // Sort the values
  const sortedValues = [...values].sort((a, b) => a - b);
  
  // Find the middle value
  const middle = Math.floor(sortedValues.length / 2);
  
  // If the array has an odd number of elements, return the middle one
  if (sortedValues.length % 2 === 1) {
    return sortedValues[middle];
  }
  
  // If the array has an even number of elements, return the average of the two middle ones
  return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
}

/**
 * Calculate the standard deviation of an array
 * @param values Array of numeric values
 * @param mean Mean value (optional, will be calculated if not provided)
 * @returns Standard deviation, or 0 if array has fewer than 2 elements
 */
function calculateStandardDeviation(values: number[], mean?: number): number {
  if (values.length < 2) return 0;
  
  // Calculate mean if not provided
  const avg = mean !== undefined ? mean : values.reduce((sum, val) => sum + val, 0) / values.length;
  
  // Calculate sum of squared differences from the mean
  const squaredDiffs = values.map(value => Math.pow(value - avg, 2));
  const sumSquaredDiffs = squaredDiffs.reduce((sum, val) => sum + val, 0);
  
  // Calculate variance and standard deviation
  const variance = sumSquaredDiffs / values.length;
  return Math.sqrt(variance);
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

