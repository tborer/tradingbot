import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircledIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchHistoricalData } from '@/lib/alphaVantage';
import { fetchCoinDeskHistoricalData, formatCoinDeskDataForAnalysis } from '@/lib/coinDesk';
import { useAuth } from '@/contexts/AuthContext';
import { useResearchApiLogs } from '@/contexts/ResearchApiLogContext';
import { useAnalysis } from '@/contexts/AnalysisContext';
import AnalysisDashboard from './AnalysisDashboardFixed';
import DataSchedulingSection from './DataSchedulingSection';
import SchedulingProcessLogs from './SchedulingProcessLogs';
import TradingSignals from './TradingSignals';
import AIDecisionData from './AIDecisionData';
import AnalysisDataCheck from './AnalysisDataCheck';

const Research: React.FC = () => {
  const [symbol, setSymbol] = useState('');
  const [market, setMarket] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [openAIApiKey, setOpenAIApiKey] = useState<string | null>(null);
  const [anthropicApiKey, setAnthropicApiKey] = useState<string | null>(null);
  const [researchApiPreference, setResearchApiPreference] = useState<string>('openai');
  const [plan, setPlan] = useState<string | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [historicalData, setHistoricalData] = useState<any>(null);
  const [selectedApi, setSelectedApi] = useState<'coindesk' | 'alphavantage'>('coindesk'); // Default to CoinDesk
  const [limit, setLimit] = useState<string>('30'); // Default to 30 days
  const [toTimestamp, setToTimestamp] = useState<string>(''); // Empty by default
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
            hasCoinDeskApiKey: !!data.coinDeskApiKey,
            hasOpenAIApiKey: !!data.openAIApiKey,
            hasAnthropicApiKey: !!data.anthropicApiKey,
            researchApiPreference: data.researchApiPreference
          });
          
          setAlphaVantageApiKey(data.alphaVantageApiKey || null);
          setCoinDeskApiKey(data.coinDeskApiKey || null);
          setOpenAIApiKey(data.openAIApiKey || null);
          setAnthropicApiKey(data.anthropicApiKey || null);
          setResearchApiPreference(data.researchApiPreference || 'openai');
          setApiKey(data.alphaVantageApiKey || null); // For backward compatibility
          
          // Add a log entry for debugging
          addLog({
            url: '/api/settings',
            method: 'GET',
            response: {
              hasAlphaVantageApiKey: !!data.alphaVantageApiKey,
              hasCoinDeskApiKey: !!data.coinDeskApiKey,
              hasOpenAIApiKey: !!data.openAIApiKey,
              hasAnthropicApiKey: !!data.anthropicApiKey,
              researchApiPreference: data.researchApiPreference
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
  const processAndAddToAnalysis = async (data: any, source: string, symbolName: string) => {
    try {
      // Log the start of processing
      addLog({
        url: `${source} Processing`,
        method: "INFO",
        requestBody: { symbol: symbolName, source },
        response: "Starting data processing"
      });
      
      console.log(`Processing ${source} data for analysis:`, { 
        dataType: typeof data,
        hasData: !!data,
        hasNestedData: data && !!data.data,
        hasMetaData: data && !!data['Meta Data'],
        hasTimeSeriesDaily: data && !!data['Time Series (Digital Currency Daily)'],
        hasTopLevelData: data && !!data.Data,
        hasNestedDataData: data && data.data && !!data.data.Data,
        hasEntries: data && data.data && !!data.data.entries
      });
      
      // Use trimmed symbol to prevent whitespace issues
      let symbolCode = symbolName.trim();
      let currentPrice = 0;
      let isCrypto = true; // Default to crypto for CoinDesk data
      let processedData = data; // Default to using the original data
      
      // Extract current price based on the data format
      if (source === 'alphavantage' && data && data['Meta Data']) {
        symbolCode = data['Meta Data']['2. Digital Currency Code'] || symbolName.trim();
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
            console.log(`Extracted current price from AlphaVantage: ${currentPrice}`);
          }
        }
      } else if (source === 'coindesk') {
        // Check which CoinDesk format we're dealing with
        if (data && data.data && data.data.entries && data.data.entries.length > 0) {
          // Original format with entries array in data.entries
          console.log('Extracting current price from CoinDesk original format with entries array');
          const entries = [...data.data.entries];
          // Sort entries by date (newest first)
          entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          currentPrice = entries[0].value;
          console.log(`Current price from entries array: ${currentPrice}`);
        } 
        else if (data && data.data && data.data.Data && Array.isArray(data.data.Data) && data.data.Data.length > 0) {
          // Format with Data array nested in data property
          console.log('Extracting current price from CoinDesk format with nested data.Data array');
          const dataEntries = [...data.data.Data];
          // Sort entries by timestamp (newest first)
          dataEntries.sort((a, b) => b.TIMESTAMP - a.TIMESTAMP);
          currentPrice = dataEntries[0].CLOSE;
          console.log(`Current price from nested data.Data array: ${currentPrice}`);
        }
        else if (data && data.Data && Array.isArray(data.Data) && data.Data.length > 0) {
          // New format with Data array at the top level
          console.log('Extracting current price from CoinDesk format with top-level Data array');
          const dataEntries = [...data.Data];
          // Sort entries by timestamp (newest first)
          dataEntries.sort((a, b) => b.TIMESTAMP - a.TIMESTAMP);
          currentPrice = dataEntries[0].CLOSE;
          console.log(`Current price from top-level Data array: ${currentPrice}`);
          
          // Extract symbol from the INSTRUMENT field if available
          if (dataEntries[0].INSTRUMENT) {
            const instrumentParts = dataEntries[0].INSTRUMENT.split('-');
            if (instrumentParts.length > 0) {
              symbolCode = instrumentParts[0];
              console.log(`Extracted symbol from INSTRUMENT: ${symbolCode}`);
            }
          }
        }
        
        // Format CoinDesk data to be compatible with analysis functions
        try {
          processedData = formatCoinDeskDataForAnalysis(data);
          
          // Log the formatted data for debugging
          console.log('Formatted CoinDesk data for analysis:', {
            hasFormattedData: !!processedData,
            hasMetaData: processedData && !!processedData['Meta Data'],
            hasTimeSeries: processedData && !!processedData['Time Series (Digital Currency Daily)']
          });
          
          // If formatting failed, use the original data
          if (!processedData) {
            processedData = data;
            console.warn('Failed to format CoinDesk data, using original format');
          }
        } catch (error) {
          console.error('Error formatting CoinDesk data:', error);
          
          // Log the formatting error
          addLog({
            url: `${source} Formatting Error`,
            method: "ERROR",
            requestBody: { symbol: symbolName },
            error: error instanceof Error ? error.message : "Unknown error during formatting"
          });
          
          processedData = data; // Use original data if formatting fails
        }
      }
      
      // If we still don't have a current price, try to extract it from the processed data
      if (!currentPrice && processedData) {
        try {
          // Import the extractHistoricalPrices function
          const { extractHistoricalPrices } = await import('@/lib/analysisUtils');
          
          // Extract prices from the processed data
          const prices = extractHistoricalPrices(processedData);
          
          if (prices.length > 0) {
            currentPrice = prices[0]; // Use the first (most recent) price
            console.log(`Extracted current price from processed data: ${currentPrice}`);
          }
        } catch (error) {
          console.error('Error extracting current price from processed data:', error);
          
          // Log the extraction error
          addLog({
            url: `${source} Price Extraction Error`,
            method: "ERROR",
            requestBody: { symbol: symbolName },
            error: error instanceof Error ? error.message : "Unknown error during price extraction"
          });
        }
      }
      
      // Add to analysis dashboard with explicit data source
      addItem({
        symbol: symbolCode,
        currentPrice: currentPrice || undefined,
        purchasePrice: currentPrice || 0,
        type: isCrypto ? 'crypto' : 'stock',
        historicalData: processedData,
        dataSource: source // Add explicit data source
      });
      
      // Log successful processing
      addLog({
        url: `${source} Processing Success`,
        method: "INFO",
        requestBody: { symbol: symbolName, source },
        response: {
          symbol: symbolCode,
          currentPrice: currentPrice || 0,
          dataSource: source
        },
        status: 200
      });
      
      setResult({
        success: true,
        message: `Successfully retrieved data for ${symbolCode} (${symbolName}) using ${source === 'alphavantage' ? 'AlphaVantage' : 'CoinDesk'} API`
      });
      
      toast({
        title: "Added to Analysis Dashboard",
        description: `${symbolCode} has been added to your analysis dashboard.`,
      });
    } catch (error) {
      console.error(`Error processing ${source} data:`, error);
      
      // Log the processing error
      addLog({
        url: `${source} Processing Error`,
        method: "ERROR",
        requestBody: { symbol: symbolName, source },
        error: error instanceof Error ? error.message : "Unknown error during data processing"
      });
      
      setResult({
        success: false,
        message: `Error processing data from ${source}. Please try again.`
      });
      
      toast({
        title: "Processing Error",
        description: `Failed to process data for ${symbolName}. Please try again.`,
        variant: "destructive"
      });
    } finally {
      // Always ensure loading state is reset
      setLoading(false);
    }
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
      // Use trimmed symbol to prevent whitespace issues
      const trimmedSymbol = symbol.trim();
      
      // Log that we're trying CoinDesk as fallback
      addLog({
        url: "CoinDesk API Request",
        method: "INFO",
        requestBody: { instrument: `${trimmedSymbol}-USD`, market: 'cadli' },
        response: "Attempting to use CoinDesk API",
        status: 200
      });
      
      // Use the updated fetchCoinDeskHistoricalData with logging
      const coinDeskData = await fetchCoinDeskHistoricalData(
        trimmedSymbol, 
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
      
      // Log the structure of the received data to help with debugging
      console.log('CoinDesk API response structure:', {
        hasData: !!coinDeskData,
        hasNestedData: coinDeskData && !!coinDeskData.data,
        hasEntries: coinDeskData && coinDeskData.data && !!coinDeskData.data.entries,
        hasNestedDataArray: coinDeskData && coinDeskData.data && !!coinDeskData.data.Data,
        hasTopLevelDataArray: coinDeskData && !!coinDeskData.Data
      });
      
      // Check for all possible data formats from CoinDesk API
      const hasOldFormat = coinDeskData && coinDeskData.data && coinDeskData.data.entries && coinDeskData.data.entries.length > 0;
      const hasNestedDataFormat = coinDeskData && coinDeskData.data && coinDeskData.data.Data && Array.isArray(coinDeskData.data.Data) && coinDeskData.data.Data.length > 0;
      const hasTopLevelDataFormat = coinDeskData && coinDeskData.Data && Array.isArray(coinDeskData.Data) && coinDeskData.Data.length > 0;
      
      if (hasOldFormat || hasNestedDataFormat || hasTopLevelDataFormat) {
        // Log the successful data format detection
        console.log(`CoinDesk data format detected: ${hasOldFormat ? 'old format with entries' : hasNestedDataFormat ? 'nested data.Data array' : 'top-level Data array'}`);
        
        try {
          // Format the CoinDesk data for analysis
          const formattedData = formatCoinDeskDataForAnalysis(coinDeskData);
          
          if (formattedData) {
            console.log('Successfully formatted CoinDesk data for analysis');
            // Process the formatted CoinDesk data
            processAndAddToAnalysis(formattedData, 'coindesk', trimmedSymbol);
          } else {
            console.warn('Failed to format CoinDesk data, attempting to use raw data');
            // Try to use the raw data as a fallback
            processAndAddToAnalysis(coinDeskData, 'coindesk', trimmedSymbol);
          }
        } catch (formatError) {
          console.error('Error formatting CoinDesk data:', formatError);
          
          // Log the formatting error
          addLog({
            url: "CoinDesk Format Error",
            method: "ERROR",
            requestBody: { instrument: `${trimmedSymbol}-USD`, market: 'cadli' },
            error: formatError instanceof Error ? formatError.message : "Unknown error during formatting"
          });
          
          // Try to use the raw data as a last resort
          try {
            processAndAddToAnalysis(coinDeskData, 'coindesk', trimmedSymbol);
          } catch (processError) {
            console.error('Error processing raw CoinDesk data:', processError);
            
            // Log the processing error
            addLog({
              url: "CoinDesk Processing Error",
              method: "ERROR",
              requestBody: { instrument: `${trimmedSymbol}-USD`, market: 'cadli' },
              error: processError instanceof Error ? processError.message : "Unknown error during processing"
            });
            
            throw processError; // Re-throw to be caught by the outer catch block
          }
        }
      } else {
        console.error('CoinDesk API returned data but in an unexpected format:', coinDeskData);
        
        // Log the unexpected format
        addLog({
          url: "CoinDesk Format Error",
          method: "ERROR",
          requestBody: { instrument: `${trimmedSymbol}-USD`, market: 'cadli' },
          response: coinDeskData,
          error: "Unexpected data format from CoinDesk API"
        });
        
        // Both APIs failed (logging is handled in the fetchCoinDeskHistoricalData function)
        setResult({
          success: false,
          message: `Symbol ${trimmedSymbol} not found in either AlphaVantage or CoinDesk APIs.`
        });
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching CoinDesk data:', error);
      
      // Log error
      addLog({
        url: `https://data-api.coindesk.com/index/cc/v1/historical/days?market=cadli&instrument=${symbol.trim()}-USD`,
        method: "GET",
        requestBody: { instrument: `${symbol.trim()}-USD`, market: 'cadli' },
        error: error instanceof Error ? error.message : "Unknown error"
      });
      
      setResult({
        success: false,
        message: "Both AlphaVantage and CoinDesk APIs failed. Please try again later."
      });
      setLoading(false);
    }
  };

  const generatePlan = useCallback(async () => {
    // Check if the appropriate API key is available based on preference
    if (researchApiPreference === 'openai' && !openAIApiKey) {
      toast({
        title: "OpenAI API Key Missing",
        description: "Please add your OpenAI API key in the settings tab",
        variant: "destructive"
      });
      return;
    }
    
    if (researchApiPreference === 'anthropic' && !anthropicApiKey) {
      toast({
        title: "Anthropic API Key Missing",
        description: "Please add your Anthropic API key in the settings tab",
        variant: "destructive"
      });
      return;
    }
    
    // Get items that are included in the plan
    const itemsForPlan = items.filter(item => item.includedInPlan);
    
    if (itemsForPlan.length === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select at least one item to include in the plan by checking 'Include in Plan'",
        variant: "destructive"
      });
      return;
    }
    
    setGeneratingPlan(true);
    setPlan(null);
    
    try {
      // Log the request data for debugging
      addLog({
        url: '/api/research/generate-plan',
        method: 'POST',
        requestBody: {
          analysisDataCount: itemsForPlan.length,
          symbols: itemsForPlan.map(item => item.symbol)
        }
      });
      
      const response = await fetch('/api/research/generate-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysisData: itemsForPlan
        }),
      });
      
      // Log the response status
      addLog({
        url: '/api/research/generate-plan',
        method: 'POST',
        status: response.status
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        // Log the error response
        addLog({
          url: '/api/research/generate-plan',
          method: 'POST',
          error: responseData.error || 'Unknown error',
          response: responseData
        });
        
        throw new Error(responseData.error || 'Failed to generate plan');
      }
      
      // Log successful response
      addLog({
        url: '/api/research/generate-plan',
        method: 'POST',
        response: { success: true, planLength: responseData.plan?.length || 0 }
      });
      
      setPlan(responseData.plan);
      
      toast({
        title: "Plan Generated",
        description: "Your trading plan has been generated successfully",
      });
    } catch (error) {
      console.error('Error generating plan:', error);
      
      // Log the error
      addLog({
        url: '/api/research/generate-plan',
        method: 'ERROR',
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      });
      
      toast({
        title: "Error Generating Plan",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: "destructive"
      });
    } finally {
      setGeneratingPlan(false);
    }
  }, [items, openAIApiKey, anthropicApiKey, researchApiPreference, toast, addLog]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset state to prevent stale data
    setSymbol(symbol.trim());
    
    if (!symbol.trim()) {
      toast({
        title: "Symbol Required",
        description: "Please enter a ticker or crypto symbol",
        variant: "destructive"
      });
      return;
    }

    // Check if the selected API key is available
    if (selectedApi === 'alphavantage' && !alphaVantageApiKey) {
      toast({
        title: "AlphaVantage API Key Missing",
        description: "Please add your AlphaVantage API key in the settings tab or switch to CoinDesk",
        variant: "destructive"
      });
      return;
    }

    if (selectedApi === 'coindesk' && !coinDeskApiKey) {
      toast({
        title: "CoinDesk API Key Missing",
        description: "Please add your CoinDesk API key in the settings tab or switch to AlphaVantage",
        variant: "destructive"
      });
      return;
    }

    // Prevent multiple submissions
    if (loading) {
      console.log('Already loading data, ignoring duplicate request');
      return;
    }

    setLoading(true);
    setResult(null);
    setHistoricalData(null);

    // Log the start of the request
    addLog({
      url: "Research Request",
      method: "INFO",
      requestBody: { 
        symbol: symbol.trim(), 
        market,
        api: selectedApi,
        limit,
        toTimestamp: toTimestamp || 'current'
      },
      response: "Starting historical data request"
    });

    try {
      if (selectedApi === 'alphavantage') {
        // Use AlphaVantage API
        const data = await fetchHistoricalData(
          symbol.trim(), 
          market, 
          alphaVantageApiKey!,
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
        if (data && data['Meta Data'] && (data['Time Series (Digital Currency Daily)'] || data['Time Series (Digital Currency Monthly)'])) {
          // AlphaVantage success
          setHistoricalData(data);
          processAndAddToAnalysis(data, 'alphavantage', symbol.trim());
        } else {
          // AlphaVantage failed, log the error and show it to the user
          let errorMessage = "Failed to fetch data from AlphaVantage.";
          
          if (data && data.Error) {
            errorMessage = `AlphaVantage error: ${data.Error}`;
            addLog({
              url: "AlphaVantage Error",
              method: "ERROR",
              requestBody: { symbol: symbol.trim(), market },
              response: data,
              error: data.Error
            });
          } else if (data && data.Note) {
            errorMessage = `AlphaVantage API limit reached: ${data.Note}`;
            addLog({
              url: "AlphaVantage Limit",
              method: "ERROR",
              requestBody: { symbol: symbol.trim(), market },
              response: data,
              error: data.Note
            });
          } else if (data && data.Information) {
            errorMessage = `AlphaVantage API key issue: ${data.Information}`;
            addLog({
              url: "AlphaVantage Key Issue",
              method: "ERROR",
              requestBody: { symbol: symbol.trim(), market },
              response: data,
              error: data.Information
            });
          } else {
            addLog({
              url: "AlphaVantage Unexpected Format",
              method: "ERROR",
              requestBody: { symbol: symbol.trim(), market },
              response: data,
              error: "Unexpected response format"
            });
          }
          
          setResult({
            success: false,
            message: errorMessage
          });
        }
      } else {
        // Use CoinDesk API
        const limitValue = parseInt(limit) || 30; // Default to 30 if not a valid number
        
        const coinDeskData = await fetchCoinDeskHistoricalData(
          symbol.trim(), 
          coinDeskApiKey!,
          limitValue, // Use the limit value from the input
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
          },
          toTimestamp // Pass the toTimestamp value
        );
        
        // Check for all possible data formats from CoinDesk API
        const hasOldFormat = coinDeskData && coinDeskData.data && coinDeskData.data.entries && coinDeskData.data.entries.length > 0;
        const hasNestedDataFormat = coinDeskData && coinDeskData.data && coinDeskData.data.Data && Array.isArray(coinDeskData.data.Data) && coinDeskData.data.Data.length > 0;
        const hasTopLevelDataFormat = coinDeskData && coinDeskData.Data && Array.isArray(coinDeskData.Data) && coinDeskData.Data.length > 0;
        
        if (hasOldFormat || hasNestedDataFormat || hasTopLevelDataFormat) {
          try {
            // Format the CoinDesk data for analysis
            const formattedData = formatCoinDeskDataForAnalysis(coinDeskData);
            
            if (formattedData) {
              console.log('Successfully formatted CoinDesk data for analysis');
              // Process the formatted CoinDesk data
              processAndAddToAnalysis(formattedData, 'coindesk', symbol.trim());
            } else {
              console.warn('Failed to format CoinDesk data, attempting to use raw data');
              // Try to use the raw data as a fallback
              processAndAddToAnalysis(coinDeskData, 'coindesk', symbol.trim());
            }
          } catch (formatError) {
            console.error('Error formatting CoinDesk data:', formatError);
            
            // Log the formatting error
            addLog({
              url: "CoinDesk Format Error",
              method: "ERROR",
              requestBody: { instrument: `${symbol.trim()}-USD`, market: 'cadli' },
              error: formatError instanceof Error ? formatError.message : "Unknown error during formatting"
            });
            
            setResult({
              success: false,
              message: `Error processing CoinDesk data: ${formatError instanceof Error ? formatError.message : "Unknown error"}`
            });
          }
        } else {
          console.error('CoinDesk API returned data but in an unexpected format:', coinDeskData);
          
          // Log the unexpected format
          addLog({
            url: "CoinDesk Format Error",
            method: "ERROR",
            requestBody: { instrument: `${symbol.trim()}-USD`, market: 'cadli' },
            response: coinDeskData,
            error: "Unexpected data format from CoinDesk API"
          });
          
          setResult({
            success: false,
            message: `Symbol ${symbol.trim()} not found in CoinDesk API or returned in an unexpected format.`
          });
        }
      }
    } catch (error) {
      console.error(`Error fetching ${selectedApi} data:`, error);
      
      // Log error
      addLog({
        url: selectedApi === 'alphavantage' 
          ? `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${symbol.trim()}&market=${market}`
          : `https://data-api.coindesk.com/index/cc/v1/historical/days?market=cadli&instrument=${symbol.trim()}-USD`,
        method: "GET",
        requestBody: { 
          symbol: symbol.trim(), 
          market: selectedApi === 'alphavantage' ? market : 'cadli',
          api: selectedApi
        },
        error: error instanceof Error ? error.message : "Unknown error"
      });
      
      setResult({
        success: false,
        message: `Failed to fetch data from ${selectedApi === 'alphavantage' ? 'AlphaVantage' : 'CoinDesk'}. Please try again later.`
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs for different sections */}
      <div className="w-full">
        <Tabs defaultValue="scheduling" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="scheduling">Data Scheduling</TabsTrigger>
            <TabsTrigger value="logs">Process Logs</TabsTrigger>
            <TabsTrigger value="signals">Trading Signals</TabsTrigger>
            <TabsTrigger value="ai-decision">AI Decision Data</TabsTrigger>
            <TabsTrigger value="data-check">Data Check</TabsTrigger>
          </TabsList>
          <TabsContent value="scheduling">
            <DataSchedulingSection />
          </TabsContent>
          <TabsContent value="logs">
            <SchedulingProcessLogs />
          </TabsContent>
          <TabsContent value="signals">
            <TradingSignals />
          </TabsContent>
          <TabsContent value="ai-decision">
            <AIDecisionData />
          </TabsContent>
          <TabsContent value="data-check">
            <AnalysisDataCheck />
          </TabsContent>
        </Tabs>
      </div>
      
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
            
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex items-center space-x-2">
                <Label htmlFor="api-toggle">AlphaVantage</Label>
                <Switch 
                  id="api-toggle" 
                  checked={selectedApi === 'coindesk'} 
                  onCheckedChange={(checked) => setSelectedApi(checked ? 'coindesk' : 'alphavantage')}
                />
                <Label htmlFor="api-toggle">CoinDesk</Label>
              </div>
              
              <div className="space-y-2 w-full md:w-24">
                <Label htmlFor="limit">Limit</Label>
                <Input
                  id="limit"
                  type="number"
                  placeholder="30"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
              
              <div className="space-y-2 w-full md:w-auto">
                <Label htmlFor="toTimestamp">To Timestamp</Label>
                <Input
                  id="toTimestamp"
                  type="text"
                  placeholder="YYYY-MM-DD"
                  value={toTimestamp}
                  onChange={(e) => setToTimestamp(e.target.value)}
                />
              </div>
              
              <Button 
                type="submit" 
                disabled={loading || (selectedApi === 'alphavantage' && !alphaVantageApiKey) || (selectedApi === 'coindesk' && !coinDeskApiKey)}
                className="w-full md:w-auto"
              >
                {loading ? "Loading..." : "Get Historical Data & Analyze"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      
      {/* Analysis Dashboard */}
      {items.length > 0 && (
        <AnalysisDashboard items={items} />
      )}
      
      {/* Plan Section */}
      <Card className="w-full mt-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Plan</CardTitle>
              <CardDescription>
                Your trading plan based on selected assets
              </CardDescription>
            </div>
            <Button 
              onClick={generatePlan} 
              disabled={generatingPlan || (researchApiPreference === 'openai' && !openAIApiKey) || (researchApiPreference === 'anthropic' && !anthropicApiKey)}
            >
              {generatingPlan ? "Generating..." : "Create Plan"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(researchApiPreference === 'openai' && !openAIApiKey) && (
            <Alert variant="destructive" className="mb-4">
              <CrossCircledIcon className="h-4 w-4" />
              <AlertTitle>OpenAI API Key Missing</AlertTitle>
              <AlertDescription>
                Please add your OpenAI API key in the settings tab to use this feature.
              </AlertDescription>
            </Alert>
          )}
          
          {(researchApiPreference === 'anthropic' && !anthropicApiKey) && (
            <Alert variant="destructive" className="mb-4">
              <CrossCircledIcon className="h-4 w-4" />
              <AlertTitle>Anthropic API Key Missing</AlertTitle>
              <AlertDescription>
                Please add your Anthropic API key in the settings tab to use this feature.
              </AlertDescription>
            </Alert>
          )}
          
          {plan ? (
            <div className="whitespace-pre-wrap bg-muted p-4 rounded-md">
              {plan}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              {generatingPlan 
                ? "Generating your trading plan..." 
                : "Select assets to include in your plan by checking \"Include in Plan\" on the analysis cards, then click \"Create Plan\"."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Research;