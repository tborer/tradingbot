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

  // Fetch the API key when the component mounts
  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const data = await response.json();
          setApiKey(data.alphaVantageApiKey || null);
        }
      } catch (error) {
        console.error('Failed to fetch API key:', error);
      }
    };

    if (user) {
      fetchApiKey();
    }
  }, [user]);

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

    if (!apiKey) {
      toast({
        title: "API Key Missing",
        description: "Please add your AlphaVantage API key in the settings tab",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const data = await fetchHistoricalData(
        symbol, 
        market, 
        apiKey,
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
      
      setHistoricalData(data);
      
      if (data.Error) {
        setResult({
          success: false,
          message: `Error: ${data.Error}`
        });
      } else if (data.Note) {
        // API call limit reached
        setResult({
          success: false,
          message: `API Limit: ${data.Note}`
        });
      } else if (data.Information) {
        // Invalid API key
        setResult({
          success: false,
          message: `API Key Issue: ${data.Information}`
        });
      } else if (data['Meta Data']) {
        // Success
        const symbolCode = data['Meta Data']['2. Digital Currency Code'] || symbol;
        const symbolName = data['Meta Data']['3. Digital Currency Name'] || 'Unknown';
        
        setResult({
          success: true,
          message: `Successfully retrieved data for ${symbolCode} (${symbolName})`
        });
        
        // Determine if this is a crypto or stock based on the response
        const isCrypto = !!data['Meta Data']['2. Digital Currency Code'];
        
        // Get the current price from the most recent data point
        let currentPrice = 0;
        if (data['Time Series (Digital Currency Monthly)']) {
          const dates = Object.keys(data['Time Series (Digital Currency Monthly)']);
          if (dates.length > 0) {
            // Sort dates in descending order
            dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
            const latestDate = dates[0];
            currentPrice = parseFloat(data['Time Series (Digital Currency Monthly)'][latestDate]['4. close']);
          }
        }
        
        // Add to analysis dashboard
        addItem({
          symbol: symbolCode,
          currentPrice: currentPrice || undefined,
          purchasePrice: currentPrice || 0,
          type: isCrypto ? 'crypto' : 'stock',
          historicalData: data
        });
        
        toast({
          title: "Added to Analysis Dashboard",
          description: `${symbolCode} has been added to your analysis dashboard.`,
        });
      } else {
        setResult({
          success: false,
          message: "Received unexpected response format from API"
        });
      }
    } catch (error) {
      console.error('Error fetching historical data:', error);
      setResult({
        success: false,
        message: "Failed to fetch data. Please try again."
      });
    } finally {
      setLoading(false);
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
            
            {!apiKey && (
              <Alert variant="destructive" className="mt-4">
                <CrossCircledIcon className="h-4 w-4" />
                <AlertTitle>API Key Missing</AlertTitle>
                <AlertDescription>
                  Please add your AlphaVantage API key in the settings tab to use this feature.
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
            
            <Button type="submit" disabled={loading || !apiKey}>
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