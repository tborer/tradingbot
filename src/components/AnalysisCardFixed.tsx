import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
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
  getBollingerBandsMessage
} from '@/lib/analysisUtils';
import { useAuth } from '@/contexts/AuthContext';

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
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [dataSource, setDataSource] = useState<string>('');
  
  // Fetch historical data if not provided
  useEffect(() => {
    const fetchHistoricalData = async () => {
      if (!historicalData && type === 'crypto' && user) {
        setIsLoading(true);
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
            }
          } else {
            console.error('Failed to fetch historical data:', await response.text());
          }
        } catch (error) {
          console.error('Error fetching historical data:', error);
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
                } else {
                  console.error(`Still couldn't extract prices after formatting for ${symbol}`);
                }
              } else {
                console.error(`Failed to format data for ${symbol}`);
              }
            } else {
              console.error('formatCoinDeskDataForAnalysis function not found in the imported module');
            }
          } catch (importError) {
            console.error(`Error importing coinDesk module:`, importError);
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

      // Identify trend lines
      const trendLinesValues = identifyTrendLines(extractedPrices);
      setTrendLines(trendLinesValues);

      // Calculate Fibonacci retracement levels
      if (extractedPrices.length >= 2) {
        // Find highest and lowest prices in the dataset
        const sortedPrices = [...extractedPrices].sort((a, b) => a - b);
        const lowestPrice = sortedPrices[0];
        const highestPrice = sortedPrices[sortedPrices.length - 1];
        
        // Calculate Fibonacci levels
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
          <Badge variant={percentChange >= 0 ? "default" : "destructive"}>
            {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(2)}%
          </Badge>
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