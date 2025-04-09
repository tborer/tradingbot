import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircledIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import { useToast } from '@/components/ui/use-toast';
import { fetchHistoricalData } from '@/lib/alphaVantage';
import { fetchCoinDeskHistoricalData, formatCoinDeskDataForAnalysis } from '@/lib/coinDesk';
import { useAuth } from '@/contexts/AuthContext';
import { useResearchApiLogs } from '@/contexts/ResearchApiLogContext';
import { useAnalysis } from '@/contexts/AnalysisContext';
import AnalysisDashboard from './AnalysisDashboard';

const Research: React.FC = () => {
  const [symbol, setSymbol] = useState('');
  const [market, setMarket] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [historicalData, setHistoricalData] = useState<any>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { addLog } = useResearchApiLogs();
  const { items, addItem } = useAnalysis();

  // State for API keys
  const [alphaVantageApiKey, setAlphaVantageApiKey] = useState<string | null>(null);
  const [coinDeskApiKey, setCoinDeskApiKey] = useState<string | null>(null);

  // Fetch API keys when the component mounts
  useEffect(() => {
    const fetchApiKeys = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const data = await response.json();
          
          // Log the API keys for debugging (without showing the actual keys)
          console.log('API keys fetched:', {
            hasAlphaVantageApiKey: !!data.alphaVantageApiKey,
            hasCoinDeskApiKey: !!data.coinDeskApiKey
          });
          
          setAlphaVantageApiKey(data.alphaVantageApiKey || null);
          setCoinDeskApiKey(data.coinDeskApiKey || null);
          setApiKey(data.alphaVantageApiKey || null); // For backward compatibility
          
          // Add a log entry for debugging
          addLog({
            url: '/api/settings',
            method: 'GET',
            response: {
              hasAlphaVantageApiKey: !!data.alphaVantageApiKey,
              hasCoinDeskApiKey: !!data.coinDeskApiKey
            },
            status: 200
          });
        } else {
          console.error('Failed to fetch API keys, status:', response.status);
          addLog({
            url: '/api/settings',
            method: 'GET',
            error: `Failed to fetch API keys, status: ${response.status}`,
            status: response.status
          });
        }
      } catch (error) {
        console.error('Failed to fetch API keys:', error);
        addLog({
          url: '/api/settings',
          method: 'GET',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    };

    if (user) {
      fetchApiKeys();
    }
  }, [user, addLog]);

  // Function to process and add data to the analysis dashboard
  const processAndAddToAnalysis = (data: any, source: string, symbolName: string) => {
    let symbolCode = symbol;
    let currentPrice = 0;
    let isCrypto = true; // Default to crypto for CoinDesk data
    let processedData = data; // Default to using the original data
    
    if (source === 'alphavantage' && data['Meta Data']) {
      symbolCode = data['Meta Data']['2. Digital Currency Code'] || symbol;
      symbolName = data['Meta Data']['3. Digital Currency Name'] || symbolName;
      isCrypto = !!data['Meta Data']['2. Digital Currency Code'];
      
      // Get the current price from the most recent data point
      const timeSeriesKey = data['Time Series (Digital Currency Daily)'] 
        ? 'Time Series (Digital Currency Daily)' 
        : 'Time Series (Digital Currency Monthly)';
        
      if (data[timeSeriesKey]) {
        const dates = Object.keys(data[timeSeriesKey]);
        if (dates.length > 0) {
          // Sort dates in descending order
          dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
          const latestDate = dates[0];
          currentPrice = parseFloat(data[timeSeriesKey][latestDate]['4. close']);
        }
      }
    } else if (source === 'coindesk') {
      // Check which CoinDesk format we're dealing with
      if (data.data && data.data.entries) {
        // Original format with entries array
        const entries = [...data.data.entries];
        if (entries.length > 0) {
          // Sort entries by date (newest first)
          entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          currentPrice = entries[0].value;
        }
      } else if (data.data && data.data.Data && Array.isArray(data.data.Data)) {
        // New format with Data array
        const dataEntries = [...data.data.Data];
        if (dataEntries.length > 0) {
          // Sort entries by timestamp (newest first)
          dataEntries.sort((a, b) => b.TIMESTAMP - a.TIMESTAMP);
          currentPrice = dataEntries[0].CLOSE;
        }
      }
      
      // Format CoinDesk data to be compatible with analysis functions
      processedData = formatCoinDeskDataForAnalysis(data);
      
      // Log the formatted data for debugging
      console.log('Formatted CoinDesk data for analysis:', processedData);
      
      // If formatting failed, use the original data
      if (!processedData) {
        processedData = data;
        console.warn('Failed to format CoinDesk data, using original format');
      }
    }
    
    // Add to analysis dashboard
    addItem({
      symbol: symbolCode,
      currentPrice: currentPrice || undefined,
      purchasePrice: currentPrice || 0,
      type: isCrypto ? 'crypto' : 'stock',
      historicalData: processedData
    });
    
    setResult({
      success: true,
      message: `Successfully retrieved data for ${symbolCode} (${symbolName}) using ${source === 'alphavantage' ? 'AlphaVantage' : 'CoinDesk'} API`
    });
    
    toast({
      title: "Added to Analysis Dashboard",
      description: `${symbolCode} has been added to your analysis dashboard.`,
    });
  };

  // Function to try CoinDesk API as fallback
  const tryWithCoinDesk = async () => {
    if (!coinDeskApiKey) {
      setResult({
        success: false,
        message: "Both AlphaVantage and CoinDesk APIs failed. Please check your API keys and the symbol."
      });
      setLoading(false);
      return;
    }
    
    try {
      // Log that we're trying CoinDesk as fallback
      addLog({
        url: "CoinDesk API Fallback",
        method: "INFO",
        requestBody: { instrument: `${symbol}-USD`, market: 'cadli' },
        response: "Attempting to use CoinDesk API as fallback",
        status: 200
      });
      
      // Use the updated fetchCoinDeskHistoricalData with logging
      const coinDeskData = await fetchCoinDeskHistoricalData(
        symbol, 
        coinDeskApiKey,
        30, // Default to 30 days
        // Pass the logging function
        (url, method, requestBody, response, status, error, duration) => {
          addLog({
            url,
            method,
            requestBody,
            response,
            status,
            error,
            duration
          });
        }
      );
      
      if (coinDeskData && coinDeskData.data && coinDeskData.data.entries && coinDeskData.data.entries.length > 0) {
        // Process CoinDesk data (logging is handled in the fetchCoinDeskHistoricalData function)
        processAndAddToAnalysis(coinDeskData, 'coindesk', symbol);
      } else {
        // Both APIs failed (logging is handled in the fetchCoinDeskHistoricalData function)
        setResult({
          success: false,
          message: `Symbol ${symbol} not found in either AlphaVantage or CoinDesk APIs.`
        });
      }
    } catch (error) {
      console.error('Error fetching CoinDesk data:', error);
      
      // Log error
      addLog({
        url: `https://data-api.coindesk.com/index/cc/v1/historical/days?market=cadli&instrument=${symbol}-USD`,
        method: "GET",
        requestBody: { instrument: `${symbol}-USD`, market: 'cadli' },
        error: error instanceof Error ? error.message : "Unknown error"
      });
      
      setResult({
        success: false,
        message: "Both AlphaVantage and CoinDesk APIs failed. Please try again later."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!symbol) {
      toast({
        title: "Symbol Required",
        description: "Please enter a ticker or crypto symbol",
        variant: "destructive"
      });
      return;
    }

    if (!alphaVantageApiKey && !coinDeskApiKey) {
      toast({
        title: "API Keys Missing",
        description: "Please add at least one API key (AlphaVantage or CoinDesk) in the settings tab",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setResult(null);
    setHistoricalData(null);

    try {
      // If AlphaVantage API key is available, try it first
      if (alphaVantageApiKey) {
        const data = await fetchHistoricalData(
          symbol, 
          market, 
          alphaVantageApiKey,
          // Pass the logging function to the API call
          (url, method, requestBody, response, status, error, duration) => {
            addLog({
              url,
              method,
              requestBody,
              response,
              status,
              error,
              duration
            });
          }
        );
        
        // Check if AlphaVantage returned valid data
        if (data['Meta Data'] && (data['Time Series (Digital Currency Daily)'] || data['Time Series (Digital Currency Monthly)'])) {
          // AlphaVantage success
          setHistoricalData(data);
          processAndAddToAnalysis(data, 'alphavantage', 'Unknown');
          return; // Exit early on success
        } else {
          // AlphaVantage failed, log the error but don't show it to the user
          if (data.Error) {
            console.error(`AlphaVantage API error: ${data.Error}`);
            addLog({
              url: "AlphaVantage Error",
              method: "ERROR",
              requestBody: { symbol, market },
              response: data,
              error: data.Error
            });
          } else if (data.Note) {
            console.error(`AlphaVantage API limit: ${data.Note}`);
            addLog({
              url: "AlphaVantage Limit",
              method: "ERROR",
              requestBody: { symbol, market },
              response: data,
              error: data.Note
            });
          } else if (data.Information) {
            console.error(`AlphaVantage API key issue: ${data.Information}`);
            addLog({
              url: "AlphaVantage Key Issue",
              method: "ERROR",
              requestBody: { symbol, market },
              response: data,
              error: data.Information
            });
          } else {
            console.error("Unexpected AlphaVantage API response format");
            addLog({
              url: "AlphaVantage Unexpected Format",
              method: "ERROR",
              requestBody: { symbol, market },
              response: data,
              error: "Unexpected response format"
            });
          }
        }
      } else {
        // Log that we're skipping AlphaVantage because no API key is available
        addLog({
          url: "AlphaVantage Skipped",
          method: "INFO",
          requestBody: { symbol, market },
          response: "AlphaVantage API key not available, skipping to CoinDesk",
          status: 200
        });
      }
      
      // Try with CoinDesk (either as fallback or primary if AlphaVantage key is not available)
      await tryWithCoinDesk();
    } catch (error) {
      console.error('Error in API request:', error);
      
      // Log the error
      addLog({
        url: alphaVantageApiKey 
          ? `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${symbol}&market=${market}`
          : "API Error",
        method: "ERROR",
        requestBody: { symbol, market },
        error: error instanceof Error ? error.message : "Unknown error"
      });
      
      // If error occurred with AlphaVantage, try CoinDesk as fallback
      if (alphaVantageApiKey) {
        await tryWithCoinDesk();
      } else {
        // If we're already trying CoinDesk as primary, show error
        setResult({
          success: false,
          message: "Failed to fetch data. Please try again later."
        });
        setLoading(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Research</CardTitle>
          <CardDescription>
            Look up historical data for cryptocurrencies and stocks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  placeholder="Enter ticker or crypto symbol (e.g. BTC, AAPL)"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="market">Market</Label>
                <Select value={market} onValueChange={setMarket}>
                  <SelectTrigger id="market">
                    <SelectValue placeholder="Select market" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {!alphaVantageApiKey && !coinDeskApiKey && (
              <Alert variant="destructive" className="mt-4">
                <CrossCircledIcon className="h-4 w-4" />
                <AlertTitle>API Keys Missing</AlertTitle>
                <AlertDescription>
                  Please add at least one API key (AlphaVantage or CoinDesk) in the settings tab to use this feature.
                </AlertDescription>
              </Alert>
            )}
            
            {result && (
              <Alert variant={result.success ? "default" : "destructive"} className="mt-4">
                {result.success ? (
                  <CheckCircledIcon className="h-4 w-4" />
                ) : (
                  <CrossCircledIcon className="h-4 w-4" />
                )}
                <AlertTitle>{result.success ? "Success" : "Error"}</AlertTitle>
                <AlertDescription>{result.message}</AlertDescription>
              </Alert>
            )}
            
            <Button 
              type="submit" 
              disabled={loading || (!alphaVantageApiKey && !coinDeskApiKey)}
            >
              {loading ? "Loading..." : "Get Historical Data"}
            </Button>
          </form>
        </CardContent>
      </Card>
      
      {/* Analysis Dashboard */}
      {items.length > 0 && (
        <AnalysisDashboard items={items} />
      )}
    </div>
  );
};

export default Research;