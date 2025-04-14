import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  calculateSMA, 
  getSMAMessage, 
  identifyTrendLines, 
  getTrendLinesMessage,
  generateRecommendation,
  extractHistoricalPrices,
  calculateFibonacciRetracements,
  getFibonacciMessage,
  calculateBollingerBands,
  getBollingerBandsMessage,
  calculateEMA,
  getEMAMessage,
  calculateRSI,
  getRSIMessage,
  detectBreakoutPatterns,
  getBreakoutMessage,
  calculateWeightedDecision
} from '@/lib/analysisUtils';
import { useAuth } from '@/contexts/AuthContext';

// Define constants at the module level to avoid temporal dead zone issues
const MAX_DATABASE_RETRIES = 3;
// Ensure no references to contextMaxDatabaseRetries which causes temporal dead zone issues

interface AnalysisCardProps {
  symbol: string;
  currentPrice?: number;
  purchasePrice: number;
  historicalData: any;
  type: 'stock' | 'crypto';
  dataSource?: string; // Add dataSource prop
}

const AnalysisCard: React.FC<AnalysisCardProps> = ({ 
  symbol, 
  currentPrice, 
  purchasePrice, 
  historicalData,
  type,
  dataSource: propDataSource // Rename to avoid conflict
}) => {
  const { user } = useAuth();
  const [prices, setPrices] = useState<number[]>([]);
  const [sma20, setSma20] = useState<number | null>(null);
  const [sma50, setSma50] = useState<number | null>(null);
  const [ema12, setEma12] = useState<number | null>(null);
  const [ema26, setEma26] = useState<number | null>(null);
  const [rsi14, setRsi14] = useState<number | null>(null);
  const [trendLines, setTrendLines] = useState<{ support: number | null; resistance: number | null }>({
    support: null,
    resistance: null
  });
  const [recommendation, setRecommendation] = useState<string>('');
  const [fibonacciLevels, setFibonacciLevels] = useState<ReturnType<typeof calculateFibonacciRetracements> | null>(null);
  const [bollingerBands, setBollingerBands] = useState<{ upper: number | null; middle: number | null; lower: number | null }>({
    upper: null,
    middle: null,
    lower: null
  });
  const [breakoutAnalysis, setBreakoutAnalysis] = useState<ReturnType<typeof detectBreakoutPatterns> | null>(null);
  const [weightedDecision, setWeightedDecision] = useState<{ 
    decision: 'buy' | 'sell' | 'hold'; 
    confidence: number; 
    explanation: string 
  } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [dataSource, setDataSource] = useState<string>('');
  const [includedInPlan, setIncludedInPlan] = useState<boolean>(false);
  
  // Fetch historical data if not provided
  useEffect(() => {
    const fetchHistoricalData = async () => {
      if (!historicalData && type === 'crypto' && user) {
        setIsLoading(true);
        try {
          // Use the constant MAX_DATABASE_RETRIES
          let retries = 0;
          let success = false;
          
          while (retries < MAX_DATABASE_RETRIES && !success) {
            try {
              const response = await fetch(`/api/cryptos/historical?symbol=${symbol}`);
              if (response.ok) {
                const data = await response.json();
                if (data && data.data) {
                  // Determine the data source
                  let source = 'unknown';
                  if (data.source) {
                    source = data.source;
                  } else if (data.data.data && data.data.data.entries) {
                    source = 'coindesk';
                  } else if (data.data['Meta Data']) {
                    source = 'alphavantage';
                  }
                  setDataSource(source);
                  
                  // Process the historical data
                  const extractedPrices = extractHistoricalPrices(data.data);
                  setPrices(extractedPrices);
                  
                  // Calculate SMA values
                  const sma20Value = calculateSMA(extractedPrices, 20);
                  const sma50Value = calculateSMA(extractedPrices, 50);
                  setSma20(sma20Value);
                  setSma50(sma50Value);
                  
                  // Identify trend lines
                  const trendLinesValues = identifyTrendLines(extractedPrices);
                  setTrendLines(trendLinesValues);
                  
                  // Calculate Fibonacci retracement levels
                  if (extractedPrices.length >= 2) {
                    const sortedPrices = [...extractedPrices].sort((a, b) => a - b);
                    const lowestPrice = sortedPrices[0];
                    const highestPrice = sortedPrices[sortedPrices.length - 1];
                    const fibLevels = calculateFibonacciRetracements(highestPrice, lowestPrice);
                    setFibonacciLevels(fibLevels);
                  }
                  
                  // Calculate Bollinger Bands
                  const bands = calculateBollingerBands(extractedPrices, 20, 2);
                  setBollingerBands(bands);
                  
                  // Generate recommendation
                  const price = currentPrice || (extractedPrices.length > 0 ? extractedPrices[0] : purchasePrice);
                  const recommendationText = generateRecommendation(
                    price,
                    sma20Value,
                    trendLinesValues.support,
                    trendLinesValues.resistance,
                    bands
                  );
                  setRecommendation(recommendationText);
                  
                  success = true;
                }
              } else {
                console.error('Failed to fetch historical data:', await response.text());
                retries++;
                if (retries < MAX_DATABASE_RETRIES) {
                  // Wait before retrying
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }
            } catch (fetchError) {
              console.error(`Fetch attempt ${retries + 1} failed:`, fetchError);
              retries++;
              if (retries < MAX_DATABASE_RETRIES) {
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }
          
          if (!success) {
            console.error(`Failed to fetch historical data after ${MAX_DATABASE_RETRIES} attempts`);
          }
        } catch (error) {
          console.error('Error in fetchHistoricalData:', error);
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    fetchHistoricalData();
  }, [symbol, type, user, historicalData, currentPrice, purchasePrice]);

  useEffect(() => {
    // Use the dataSource prop if provided, otherwise determine from the data structure
    if (propDataSource) {
      setDataSource(propDataSource);
    } else if (historicalData) {
      // Determine the data source from the structure
      if (historicalData.data && historicalData.data.entries) {
        setDataSource('coindesk');
      } else if (historicalData.data && historicalData.data.Data) {
        setDataSource('coindesk');
      } else if (historicalData.Data && Array.isArray(historicalData.Data)) {
        setDataSource('coindesk');
      } else if (historicalData['Meta Data']) {
        // Check if this is formatted CoinDesk data by looking for a special marker
        // or by examining the Meta Data Information field
        const metaInfo = historicalData['Meta Data']['1. Information'];
        if (metaInfo && typeof metaInfo === 'string' && metaInfo.includes('CoinDesk')) {
          setDataSource('coindesk');
        } else {
          setDataSource('alphavantage');
        }
      } else if (historicalData['Time Series (Digital Currency Daily)'] && !historicalData['Meta Data']) {
        setDataSource('coindesk');
      }
    }
    
    // Process the historical data
    const processData = async () => {
      try {
        console.log(`Processing historical data for ${symbol}...`);
        
        // Extract prices from the historical data
        const extractedPrices = extractHistoricalPrices(historicalData);
        
        // Check if we have enough data
        if (extractedPrices.length === 0) {
          console.warn(`No prices extracted for ${symbol}, attempting to format data`);
          
          // Use the module-level MAX_DATABASE_RETRIES constant for retries
          let retries = 0;
          let success = false;
          
          while (retries < MAX_DATABASE_RETRIES && !success) {
            try {
              // Import the formatCoinDeskDataForAnalysis function
              // Use dynamic import with error handling
              const coinDeskModule = await import('@/lib/coinDesk');
              
              // Check if the module and function exist
              if (coinDeskModule && typeof coinDeskModule.formatCoinDeskDataForAnalysis === 'function') {
                const formattedData = coinDeskModule.formatCoinDeskDataForAnalysis(historicalData);
                
                if (formattedData) {
                  console.log(`Successfully formatted data for ${symbol}, extracting prices again`);
                  const newExtractedPrices = extractHistoricalPrices(formattedData);
                  
                  if (newExtractedPrices.length > 0) {
                    console.log(`Extracted ${newExtractedPrices.length} prices after formatting`);
                    setPrices(newExtractedPrices);
                    
                    // Calculate analysis metrics with the new prices
                    calculateAnalysisMetrics(newExtractedPrices);
                    success = true;
                  } else {
                    console.error(`Still couldn't extract prices after formatting for ${symbol}`);
                    retries++;
                  }
                } else {
                  console.error(`Failed to format data for ${symbol}`);
                  retries++;
                }
              } else {
                console.error('formatCoinDeskDataForAnalysis function not found in the imported module');
                retries++;
              }
              
              if (!success && retries < MAX_DATABASE_RETRIES) {
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            } catch (importError) {
              console.error(`Error importing coinDesk module (attempt ${retries + 1}):`, importError);
              retries++;
              
              if (retries < MAX_DATABASE_RETRIES) {
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }
          
          if (!success) {
            console.error(`Failed to format data after ${MAX_DATABASE_RETRIES} attempts`);
          }
        } else {
          console.log(`Extracted ${extractedPrices.length} prices for ${symbol}`);
          setPrices(extractedPrices);
          
          // Calculate analysis metrics with the extracted prices
          calculateAnalysisMetrics(extractedPrices);
        }
      } catch (error) {
        console.error(`Error processing data for ${symbol}:`, error);
      }
    };
    
    // Helper function to calculate all analysis metrics
    const calculateAnalysisMetrics = (extractedPrices: number[]) => {
      // Calculate SMA values
      const sma20Value = calculateSMA(extractedPrices, 20);
      const sma50Value = calculateSMA(extractedPrices, 50);
      setSma20(sma20Value);
      setSma50(sma50Value);

      // Calculate EMA values
      const ema12Value = calculateEMA(extractedPrices, 12);
      const ema26Value = calculateEMA(extractedPrices, 26);
      setEma12(ema12Value);
      setEma26(ema26Value);
      
      // Calculate RSI
      const rsi14Value = calculateRSI(extractedPrices, 14);
      setRsi14(rsi14Value);

      // Identify trend lines
      const trendLinesValues = identifyTrendLines(extractedPrices);
      setTrendLines(trendLinesValues);

      // Calculate Fibonacci retracement levels
      let fibLevels = null;
      if (extractedPrices.length >= 2) {
        // Find highest and lowest prices in the dataset
        const sortedPrices = [...extractedPrices].sort((a, b) => a - b);
        const lowestPrice = sortedPrices[0];
        const highestPrice = sortedPrices[sortedPrices.length - 1];
        
        // Calculate Fibonacci levels
        fibLevels = calculateFibonacciRetracements(highestPrice, lowestPrice);
        setFibonacciLevels(fibLevels);
      }
      
      // Calculate Bollinger Bands
      const bands = calculateBollingerBands(extractedPrices, 20, 2);
      setBollingerBands(bands);

      // Detect breakout patterns
      const price = currentPrice || (extractedPrices.length > 0 ? extractedPrices[0] : purchasePrice);
      if (extractedPrices.length >= 10 && trendLinesValues.support !== null && trendLinesValues.resistance !== null && 
          bands.upper !== null && bands.middle !== null && bands.lower !== null) {
        const breakoutResult = detectBreakoutPatterns(extractedPrices, trendLinesValues, bands);
        setBreakoutAnalysis(breakoutResult);
      }

      // Generate recommendation
      const recommendationText = generateRecommendation(
        price,
        sma20Value,
        trendLinesValues.support,
        trendLinesValues.resistance,
        bands
      );
      setRecommendation(recommendationText);

      // Calculate weighted decision
      if (ema12Value !== null && ema26Value !== null && rsi14Value !== null && 
          bands.upper !== null && bands.middle !== null && bands.lower !== null && 
          trendLinesValues.support !== null && trendLinesValues.resistance !== null && 
          sma20Value !== null && breakoutAnalysis !== null) {
        const decision = calculateWeightedDecision(
          price,
          ema12Value,
          ema26Value,
          rsi14Value,
          bands,
          trendLinesValues,
          sma20Value,
          fibLevels,
          breakoutAnalysis
        );
        setWeightedDecision(decision);
      }
    };
    
    if (historicalData) {
      processData();
    }
  }, [historicalData, currentPrice, purchasePrice, propDataSource, symbol]);

  const price = currentPrice || (prices.length > 0 ? prices[0] : purchasePrice);
  const percentChange = purchasePrice > 0 
    ? ((price - purchasePrice) / purchasePrice) * 100 
    : 0;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle>{symbol}</CardTitle>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id={`include-in-plan-${symbol}`} 
              checked={includedInPlan} 
              onCheckedChange={(checked) => setIncludedInPlan(checked as boolean)}
            />
            <Label htmlFor={`include-in-plan-${symbol}`} className="text-sm">Include in Plan</Label>
          </div>
        </div>
        <CardDescription>
          Current: ${price?.toFixed(2)} | Purchase: ${purchasePrice.toFixed(2)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4">Loading historical data...</div>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="analysis">
              <AccordionTrigger>Analysis & Insights</AccordionTrigger>
              <AccordionContent>
                {dataSource && (
                  <div className="mb-2 text-xs text-muted-foreground">
                    Data source: {dataSource === 'coindesk' ? 'CoinDesk API' : 'AlphaVantage API'}
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-1">Recommendation</h4>
                    <p className="text-sm">{recommendation || "Analyzing data..."}</p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-medium mb-1">Simple Moving Average (SMA)</h4>
                    <p className="text-sm mb-2">
                      {sma20 !== null 
                        ? getSMAMessage(price, sma20, 20) 
                        : "Calculating 20-day SMA..."}
                    </p>
                    <p className="text-sm">
                      {sma50 !== null 
                        ? getSMAMessage(price, sma50, 50) 
                        : "Calculating 50-day SMA..."}
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-medium mb-1">Trend Lines</h4>
                    <p className="text-sm">
                      {trendLines.support !== null && trendLines.resistance !== null
                        ? getTrendLinesMessage(price, trendLines.support, trendLines.resistance)
                        : "Identifying support and resistance levels..."}
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-medium mb-1">Fibonacci Retracements</h4>
                    <p className="text-sm">
                      {fibonacciLevels !== null
                        ? getFibonacciMessage(price, fibonacciLevels)
                        : "Calculating Fibonacci retracement levels..."}
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-medium mb-1">Bollinger Bands</h4>
                    <p className="text-sm">
                      {bollingerBands.upper !== null && bollingerBands.middle !== null && bollingerBands.lower !== null
                        ? getBollingerBandsMessage(price, bollingerBands)
                        : "Calculating Bollinger Bands..."}
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-medium mb-1">Exponential Moving Average (EMA)</h4>
                    <p className="text-sm mb-2">
                      {ema12 !== null 
                        ? getEMAMessage(price, ema12, 12) 
                        : "Calculating 12-day EMA..."}
                    </p>
                    <p className="text-sm">
                      {ema26 !== null 
                        ? getEMAMessage(price, ema26, 26) 
                        : "Calculating 26-day EMA..."}
                    </p>
                    {ema12 !== null && ema26 !== null && (
                      <p className="text-sm mt-2">
                        {ema12 > ema26 
                          ? "12-day EMA is above 26-day EMA, indicating a bullish trend." 
                          : ema12 < ema26 
                            ? "12-day EMA is below 26-day EMA, indicating a bearish trend." 
                            : "12-day EMA equals 26-day EMA, indicating a potential trend reversal."}
                      </p>
                    )}
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-medium mb-1">Relative Strength Index (RSI)</h4>
                    <p className="text-sm">
                      {rsi14 !== null 
                        ? getRSIMessage(rsi14) 
                        : "Calculating 14-day RSI..."}
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-medium mb-1">Breakout Patterns</h4>
                    <p className="text-sm">
                      {breakoutAnalysis !== null && trendLines.support !== null && trendLines.resistance !== null
                        ? getBreakoutMessage(breakoutAnalysis, price, trendLines)
                        : "Analyzing breakout patterns..."}
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div className="bg-secondary/30 p-3 rounded-md mt-4">
                    <h4 className="font-medium mb-1 text-primary">Weighted Average Decision</h4>
                    {weightedDecision ? (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-lg font-bold ${
                            weightedDecision.decision === 'buy' 
                              ? 'text-green-500' 
                              : weightedDecision.decision === 'sell' 
                                ? 'text-red-500' 
                                : 'text-yellow-500'
                          }`}>
                            {weightedDecision.decision.toUpperCase()}
                          </span>
                          <span className="text-sm">
                            ({(weightedDecision.confidence * 100).toFixed(1)}% confidence)
                          </span>
                        </div>
                        <p className="text-sm">{weightedDecision.explanation}</p>
                        <p className="text-xs mt-2 text-muted-foreground">
                          Based on weighted analysis: EMA (15%), RSI (20%), Bollinger Bands (15%), 
                          Trend Lines (15%), SMA (10%), Fibonacci (10%), Breakout Patterns (15%)
                        </p>
                      </>
                    ) : (
                      <p className="text-sm">Calculating weighted decision...</p>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};

export default AnalysisCard;