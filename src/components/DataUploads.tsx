import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface Crypto {
  id: string;
  symbol: string;
}

const DataUploads: React.FC = () => {
  const { toast } = useToast();
  const [cryptos, setCryptos] = useState<Crypto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCryptos, setSelectedCryptos] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<Record<string, string>>({});
  const [dataLimit, setDataLimit] = useState<string>("200");
  const [timestampAdjustment, setTimestampAdjustment] = useState<string>("0");
  const [collectFullDay, setCollectFullDay] = useState<boolean>(false);
  const [maxBatchCount, setMaxBatchCount] = useState<string>("24");
  const [processingDetails, setProcessingDetails] = useState<Record<string, { total: number; saved: number; errors: number; batchCount?: number }>>({});
  const [activeTab, setActiveTab] = useState<string>("coindesk-api");
  const [jsonInput, setJsonInput] = useState<string>("");
  const [jsonParsingStatus, setJsonParsingStatus] = useState<string>("idle"); // idle, parsing, success, error
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch available cryptos
  useEffect(() => {
    const fetchCryptos = async () => {
      try {
        const response = await fetch('/api/cryptos');
        if (response.ok) {
          const data = await response.json();
          setCryptos(data.map((crypto: any) => ({
            id: crypto.id,
            symbol: crypto.symbol
          })));
        } else {
          throw new Error('Failed to fetch cryptos');
        }
      } catch (error) {
        console.error('Error fetching cryptos:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load cryptocurrencies. Please try again.',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchCryptos();
  }, [toast]);

  const handleCheckboxChange = (symbol: string) => {
    setSelectedCryptos(prev => {
      if (prev.includes(symbol)) {
        return prev.filter(s => s !== symbol);
      } else {
        return [...prev, symbol];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedCryptos.length === cryptos.length) {
      setSelectedCryptos([]);
    } else {
      setSelectedCryptos(cryptos.map(crypto => crypto.symbol));
    }
  };
  
  const getSampleJsonData = () => {
    const now = Math.floor(Date.now() / 1000);
    const oneMinuteInSeconds = 60;
    
    return JSON.stringify({
      "Data": [
        {
          "TIMESTAMP": now - (oneMinuteInSeconds * 5),
          "OPEN": 42000.5,
          "HIGH": 42100.3,
          "LOW": 41900.8,
          "CLOSE": 42050.2,
          "VOLUME": 100.5,
          "UNIT": "MINUTE"
        },
        {
          "TIMESTAMP": now - (oneMinuteInSeconds * 4),
          "OPEN": 42050.2,
          "HIGH": 42150.0,
          "LOW": 42000.0,
          "CLOSE": 42125.5,
          "VOLUME": 95.2,
          "UNIT": "MINUTE"
        },
        {
          "TIMESTAMP": now - (oneMinuteInSeconds * 3),
          "OPEN": 42125.5,
          "HIGH": 42200.1,
          "LOW": 42100.0,
          "CLOSE": 42180.3,
          "VOLUME": 105.8,
          "UNIT": "MINUTE"
        }
      ]
    }, null, 2);
  };

  const handleKillRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      
      toast({
        title: "Request Cancelled",
        description: "The data collection request has been cancelled.",
      });
      
      setIsProcessing(false);
      
      // Update status for all processing cryptos to show they were cancelled
      const updatedStatus = { ...processingStatus };
      Object.keys(updatedStatus).forEach(symbol => {
        if (updatedStatus[symbol] === 'processing') {
          updatedStatus[symbol] = 'cancelled';
        }
      });
      setProcessingStatus(updatedStatus);
    }
  };

  const handleGetData = async () => {
    if (selectedCryptos.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Cryptos Selected',
        description: 'Please select at least one cryptocurrency to fetch data for.',
      });
      return;
    }

    // Create a new AbortController for this request session
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsProcessing(true);
    setProcessingStatus({});
    setProcessingDetails({});

    // Validate inputs
    const limit = parseInt(dataLimit);
    const adjustmentMinutes = parseInt(timestampAdjustment);
    const maxBatches = parseInt(maxBatchCount);
    
    if (isNaN(limit) || limit <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Limit',
        description: 'Please enter a valid number for the data limit.',
      });
      setIsProcessing(false);
      return;
    }
    
    if (isNaN(adjustmentMinutes)) {
      toast({
        variant: 'destructive',
        title: 'Invalid Timestamp Adjustment',
        description: 'Please enter a valid number for the timestamp adjustment.',
      });
      setIsProcessing(false);
      return;
    }
    
    if (collectFullDay && (isNaN(maxBatches) || maxBatches <= 0)) {
      toast({
        variant: 'destructive',
        title: 'Invalid Max Batch Count',
        description: 'Please enter a valid positive number for the maximum batch count.',
      });
      setIsProcessing(false);
      return;
    }

    // Calculate adjusted timestamp if needed
    let toTimestamp;
    if (adjustmentMinutes > 0) {
      // Convert minutes to seconds and subtract from current timestamp
      const adjustmentSeconds = adjustmentMinutes * 60;
      toTimestamp = Math.floor(Date.now() / 1000) - adjustmentSeconds;
      
      // Ensure timestamp is not earlier than the earliest available data (July 17, 2010)
      const earliestBTCTimestamp = 1279324800; // July 17, 2010 in Unix timestamp
      if (toTimestamp < earliestBTCTimestamp) {
        toast({
          variant: 'warning',
          title: 'Timestamp Adjusted',
          description: `Timestamp was too early. Using the earliest available data point (July 17, 2010).`,
        });
        toTimestamp = earliestBTCTimestamp;
      }
    }

    // Process each selected crypto
    for (const symbol of selectedCryptos) {
      try {
        setProcessingStatus(prev => ({ ...prev, [symbol]: 'processing' }));
        
        // Track total records saved for this symbol across all batches
        let totalSavedRecords = 0;
        let totalProcessedRecords = 0;
        let batchCount = 0;
        let currentTimestamp = toTimestamp;
        let targetTimestamp = null;
        
        // If collecting full day, calculate the target timestamp (24 hours before the current/adjusted timestamp)
        if (collectFullDay) {
          // Current timestamp or adjusted timestamp
          const startTimestamp = toTimestamp || Math.floor(Date.now() / 1000);
          // Target is 24 hours (86400 seconds) before the start timestamp
          targetTimestamp = startTimestamp - 86400;
          
          toast({
            title: 'Full Day Collection',
            description: `Starting collection for ${symbol} until reaching data from ${new Date(targetTimestamp * 1000).toLocaleString()}`,
          });
        }
        
        // Flag to track if we should continue fetching data
        let continueDataCollection = true;
        
        // Keep track of the earliest timestamp we've seen
        let earliestTimestampSeen = Number.MAX_SAFE_INTEGER;
        
        // Parse max batch count once outside the loop
        const maxBatches = parseInt(maxBatchCount);
        
        while (continueDataCollection) {
          batchCount++;
          
          // Check if we've reached the max batch count before making the request
          if (collectFullDay && maxBatches > 0 && batchCount > maxBatches) {
            console.log(`Reached maximum batch count (${maxBatches}). Stopping data collection.`);
            continueDataCollection = false;
            
            toast({
              variant: 'warning',
              title: 'Data Collection Stopped',
              description: `Reached maximum batch count (${maxBatches}) for ${symbol}`,
            });
            break;
          }
          
          // Build URL with parameters
          const url = new URL(`/api/cryptos/historical-minutes`, window.location.origin);
          url.searchParams.append('symbol', symbol);
          url.searchParams.append('limit', limit.toString());
          
          // Add to_ts parameter if we have a timestamp
          if (currentTimestamp) {
            url.searchParams.append('to_ts', currentTimestamp.toString());
          }
          
          console.log(`Fetching batch ${batchCount} for ${symbol} with timestamp: ${currentTimestamp || 'current'}`);
          
          // Check if the request has been aborted
          if (signal.aborted) {
            throw new Error('Request was cancelled');
          }
          
          const response = await fetch(url.toString(), { signal });
          
          if (!response.ok) {
            // Handle different error status codes differently
            if (response.status === 504) {
              console.error(`Timeout error for ${symbol} (batch ${batchCount}):`, { status: response.status });
              
              // For timeout errors, we'll try again with a smaller limit
              const reducedLimit = Math.floor(limit / 2);
              if (reducedLimit >= 10) {
                console.log(`Retrying with reduced limit of ${reducedLimit} for ${symbol} (batch ${batchCount})`);
                
                toast({
                  variant: 'warning',
                  title: 'Request Timeout',
                  description: `Retrying with smaller batch size for ${symbol}`,
                });
                
                // Update the limit for future requests
                url.searchParams.set('limit', reducedLimit.toString());
                
                // Check if the request has been aborted before retry
                if (signal.aborted) {
                  throw new Error('Request was cancelled');
                }
                
                // Try the request again with the reduced limit
                const retryResponse = await fetch(url.toString(), { signal });
                
                if (!retryResponse.ok) {
                  // If retry also fails, throw error
                  const retryErrorData = await retryResponse.json().catch(() => null);
                  console.error(`Retry also failed for ${symbol} (batch ${batchCount}):`, { status: retryResponse.status, data: retryErrorData });
                  throw new Error(`Failed to fetch data for ${symbol} (batch ${batchCount}) even with reduced limit`);
                }
                
                // If retry succeeds, continue with the data
                const retryData = await retryResponse.json();
                return retryData;
              } else {
                // If we can't reduce the limit further, throw error
                throw new Error(`Timeout error fetching data for ${symbol} (batch ${batchCount}). Try with a smaller limit.`);
              }
            } else {
              // Handle other error types
              const errorData = await response.json().catch(() => null);
              console.error(`API error for ${symbol} (batch ${batchCount}):`, { status: response.status, data: errorData });
              
              let errorMessage = `Failed to fetch data for ${symbol} (batch ${batchCount})`;
              let detailedError = '';
              
              if (errorData && errorData.error) {
                errorMessage = errorData.error;
                
                // Try to parse and extract more detailed error information
                if (errorData.details) {
                  console.error(`Error details:`, errorData.details);
                  
                  try {
                    // Try to parse the details if it's a JSON string
                    const parsedDetails = typeof errorData.details === 'string' 
                      ? JSON.parse(errorData.details) 
                      : errorData.details;
                    
                    // Check for CoinDesk API specific error messages
                    if (parsedDetails.Err && parsedDetails.Err.message) {
                      detailedError = parsedDetails.Err.message;
                      
                      // If there's information about timestamp requirements, add it to the error
                      if (parsedDetails.Err.other_info && 
                          parsedDetails.Err.other_info.first && 
                          parsedDetails.Err.other_info.param === 'to_ts') {
                        const earliestTimestamp = parsedDetails.Err.other_info.first;
                        const earliestDate = new Date(earliestTimestamp * 1000).toLocaleDateString();
                        detailedError += ` Earliest available data is from ${earliestDate} (timestamp: ${earliestTimestamp}).`;
                      }
                    }
                  } catch (parseError) {
                    // If parsing fails, use the raw details
                    detailedError = String(errorData.details);
                  }
                }
              }
              
              throw new Error(detailedError || errorMessage);
            }
          }
          
          const data = await response.json();
          
          // Validate data structure
          if (!data) {
            throw new Error(`Invalid response data for ${symbol} (batch ${batchCount}): Response is empty`);
          }
          
          // Update total counts
          const batchSavedCount = data.savedCount || 0;
          const batchTotalCount = data.message && typeof data.message === 'string' 
            ? parseInt(data.message.match(/Processed (\d+) records/)?.[1] || '0') 
            : 0;
          
          totalSavedRecords += batchSavedCount;
          totalProcessedRecords += batchTotalCount;
          
          // Update processing details for this symbol
          setProcessingDetails(prev => ({ 
            ...prev, 
            [symbol]: { 
              total: totalProcessedRecords,
              saved: totalSavedRecords,
              errors: (prev[symbol]?.errors || 0) + (data.errorCount || 0),
              batchCount: batchCount
            } 
          }));
          
          // Show batch success message
          const processingTime = data.processingTimeMs ? `(${(data.processingTimeMs/1000).toFixed(1)}s)` : '';
          
          toast({
            title: `Batch ${batchCount} Complete`,
            description: `Saved ${batchSavedCount} records for ${symbol} ${processingTime}`,
          });
          
          // If we're not collecting a full day, we're done after the first batch
          if (!collectFullDay) {
            continueDataCollection = false;
          } else {
            // Check if we have the nextBatchTimestamp directly from the API response
            if (data.nextBatchTimestamp) {
              // Use the nextBatchTimestamp provided by the API
              const nextTimestamp = data.nextBatchTimestamp;
              
              // Use the next batch timestamp for the next batch
              currentTimestamp = nextTimestamp;
              
              console.log(`Using next batch timestamp from API response: ${nextTimestamp} (${new Date(nextTimestamp * 1000).toLocaleString()})`);
            }
            // Fallback to using earliestTimestamp if available
            else if (data.earliestTimestamp) {
              // Use the earliest timestamp provided by the API and subtract 60 seconds (1 minute)
              const batchEarliestTimestamp = data.earliestTimestamp;
              const nextTimestamp = batchEarliestTimestamp - 60;
              
              // Update the earliest timestamp we've seen
              if (batchEarliestTimestamp < earliestTimestampSeen) {
                earliestTimestampSeen = batchEarliestTimestamp;
              }
              
              // Use the calculated next timestamp for the next batch
              currentTimestamp = nextTimestamp;
              
              console.log(`Using calculated next timestamp (earliest - 60s): ${nextTimestamp} (${new Date(nextTimestamp * 1000).toLocaleString()})`);
            } 
            // Fallback to finding the earliest timestamp in the data if available
            else if (data.Data && Array.isArray(data.Data)) {
              // Find the earliest timestamp in this batch
              let batchEarliestTimestamp = Number.MAX_SAFE_INTEGER;
              
              for (const record of data.Data) {
                if (record.TIMESTAMP && record.TIMESTAMP < batchEarliestTimestamp) {
                  batchEarliestTimestamp = record.TIMESTAMP;
                }
              }
              
              // Calculate the next timestamp by subtracting 60 seconds (1 minute)
              const nextTimestamp = batchEarliestTimestamp - 60;
              
              // Update the earliest timestamp we've seen
              if (batchEarliestTimestamp < earliestTimestampSeen) {
                earliestTimestampSeen = batchEarliestTimestamp;
              }
              
              // Use the calculated next timestamp for the next batch
              currentTimestamp = nextTimestamp;
              
              console.log(`Calculated next timestamp for batch ${batchCount + 1}: ${nextTimestamp} (${new Date(nextTimestamp * 1000).toLocaleString()})`);
              
              // Check if we've reached our target timestamp
              if (targetTimestamp && batchEarliestTimestamp <= targetTimestamp) {
                console.log(`Reached target timestamp (${targetTimestamp}). Stopping data collection.`);
                continueDataCollection = false;
                
                toast({
                  title: 'Full Day Collection Complete',
                  description: `Collected data for ${symbol} reaching ${new Date(batchEarliestTimestamp * 1000).toLocaleString()}`,
                });
              } else if (data.Data.length < limit) {
                // If we got fewer records than requested, we've likely reached the end of available data
                console.log(`Received fewer records (${data.Data.length}) than requested (${limit}). Stopping data collection.`);
                continueDataCollection = false;
                
                toast({
                  variant: 'warning',
                  title: 'Data Collection Stopped',
                  description: `Reached the limit of available data for ${symbol}`,
                });
              } else if (collectFullDay && batchCount >= maxBatches) {
                // User-defined batch limit reached
                console.log(`Reached user-defined maximum batch count (${maxBatches}). Stopping data collection.`);
                continueDataCollection = false;
                
                toast({
                  variant: 'warning',
                  title: 'Data Collection Stopped',
                  description: `Reached maximum batch count (${maxBatches}) for ${symbol}`,
                });
              }
            } else {
              // If we can't find data to determine the next timestamp, stop collection
              console.log(`No data found to determine next timestamp. Stopping data collection.`);
              continueDataCollection = false;
              
              toast({
                variant: 'warning',
                title: 'Data Collection Stopped',
                description: `Could not determine next timestamp for ${symbol}`,
              });
            }
          }
        }
        
        // Update final status
        setProcessingStatus(prev => ({ ...prev, [symbol]: 'success' }));
        
        // Show final success message
        toast({
          title: 'Data Collection Complete',
          description: `Successfully fetched and saved ${totalSavedRecords} records for ${symbol} in ${batchCount} batch(es).`,
        });
      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error);
        
        // Check if this was an abort error
        if (error.name === 'AbortError' || error.message === 'Request was cancelled') {
          setProcessingStatus(prev => ({ ...prev, [symbol]: 'cancelled' }));
          
          toast({
            variant: 'warning',
            title: 'Request Cancelled',
            description: `Data collection for ${symbol} was cancelled.`,
          });
        } else {
          setProcessingStatus(prev => ({ ...prev, [symbol]: 'error' }));
          
          // Provide more detailed error message
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          
          toast({
            variant: 'destructive',
            title: 'Error',
            description: errorMessage,
          });
        }
      }
    }

    setIsProcessing(false);
  };
  
  const handleProcessJsonData = async () => {
    if (!selectedSymbol) {
      toast({
        variant: 'destructive',
        title: 'No Symbol Selected',
        description: 'Please select a cryptocurrency symbol for this data.',
      });
      return;
    }
    
    if (!jsonInput.trim()) {
      toast({
        variant: 'destructive',
        title: 'No Data Provided',
        description: 'Please paste JSON data to process.',
      });
      return;
    }
    
    setJsonParsingStatus('parsing');
    
    try {
      // Parse the JSON input
      let parsedData;
      try {
        parsedData = JSON.parse(jsonInput);
      } catch (error) {
        throw new Error('Invalid JSON format. Please check your input and try again.');
      }
      
      // Validate the data structure
      if (!parsedData) {
        throw new Error('Invalid JSON data: parsed result is null or undefined.');
      }
      
      // Check if Data property exists and is an array
      if (!parsedData.Data) {
        throw new Error('Invalid data format: Missing "Data" property in JSON.');
      }
      
      if (!Array.isArray(parsedData.Data)) {
        throw new Error('Invalid data format: "Data" property must be an array.');
      }
      
      if (parsedData.Data.length === 0) {
        throw new Error('Invalid data format: "Data" array is empty.');
      }
      
      // Process the data
      const records = parsedData.Data;
      const processStartTime = Date.now();
      
      // Prepare the data for saving
      const formattedRecords = records.map((record, index) => {
        // Skip null or undefined records
        if (!record) {
          console.warn(`Skipping null or undefined record at index ${index}`);
          return null;
        }
        
        // Ensure required fields exist
        if (record.TIMESTAMP === undefined || record.TIMESTAMP === null) {
          throw new Error(`Missing TIMESTAMP field in record at index ${index}`);
        }
        
        if (record.OPEN === undefined || record.OPEN === null) {
          throw new Error(`Missing OPEN field in record at index ${index}`);
        }
        
        if (record.HIGH === undefined || record.HIGH === null) {
          throw new Error(`Missing HIGH field in record at index ${index}`);
        }
        
        if (record.LOW === undefined || record.LOW === null) {
          throw new Error(`Missing LOW field in record at index ${index}`);
        }
        
        if (record.CLOSE === undefined || record.CLOSE === null) {
          throw new Error(`Missing CLOSE field in record at index ${index}`);
        }
        
        // Convert UNIX timestamp to Date
        const timestamp = new Date(record.TIMESTAMP * 1000);
        
        // Validate timestamp
        if (isNaN(timestamp.getTime())) {
          throw new Error(`Invalid timestamp value at index ${index}: ${record.TIMESTAMP}`);
        }
        
        return {
          symbol: selectedSymbol.toUpperCase(),
          timestamp,
          unit: record.UNIT || 'MINUTE',
          open: parseFloat(record.OPEN),
          high: parseFloat(record.HIGH),
          low: parseFloat(record.LOW),
          close: parseFloat(record.CLOSE),
          volume: record.VOLUME !== undefined ? parseFloat(record.VOLUME) : 0,
          quoteVolume: record.QUOTE_VOLUME !== undefined ? parseFloat(record.QUOTE_VOLUME) : 0,
          instrument: record.INSTRUMENT || `${selectedSymbol.toUpperCase()}-USD`,
          market: record.MARKET || 'MANUAL',
        };
      }).filter(record => record !== null);
      
      if (formattedRecords.length === 0) {
        throw new Error('No valid records found after processing.');
      }
      
      // Save the data to the database
      const response = await fetch('/api/cryptos/historical-minutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: formattedRecords,
          symbol: selectedSymbol.toUpperCase(),
        }),
      });
      
      // Handle different response statuses
      if (response.status === 202) {
        // Partial success - some records were processed but not all
        const result = await response.json();
        const processingTime = Date.now() - processStartTime;
        
        toast({
          title: 'Partial Data Processing',
          description: `Processed ${result.savedCount} of ${result.totalRecords} records for ${selectedSymbol}. The remaining records were not processed due to time constraints.`,
          variant: 'warning',
        });
        
        // Clear the input after partial success
        setJsonInput('');
        setJsonParsingStatus('success');
        
        return; // Exit early
      } else if (!response.ok) {
        let errorMessage = 'Failed to save data to the database.';
        
        try {
          const errorData = await response.json();
          console.error('Error saving manual data:', errorData);
          errorMessage = errorData?.error || errorMessage;
          
          if (errorData?.details) {
            errorMessage += ` Details: ${errorData.details}`;
          }
          
          // If there are invalid records, show more details
          if (errorData?.invalidRecords && Array.isArray(errorData.invalidRecords) && errorData.invalidRecords.length > 0) {
            const firstFewErrors = errorData.invalidRecords.slice(0, 3);
            const errorDetails = firstFewErrors.map(err => `Record ${err.index}: ${err.reason}`).join('; ');
            errorMessage += ` Invalid records: ${errorDetails}${errorData.invalidRecords.length > 3 ? ` and ${errorData.invalidRecords.length - 3} more...` : ''}`;
          }
        } catch (parseError) {
          // If we can't parse the response as JSON, try to get the text
          const errorText = await response.text().catch(() => null);
          if (errorText) {
            console.error('Error response text:', errorText);
            errorMessage = `Server error: ${response.status} ${response.statusText}. ${errorText}`;
          } else {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
        }
        
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      const processingTime = Date.now() - processStartTime;
      
      // Show information about invalid records if any
      if (result.invalidRecordsCount && result.invalidRecordsCount > 0) {
        toast({
          variant: 'warning',
          title: 'Some Records Skipped',
          description: `${result.invalidRecordsCount} invalid records were skipped during processing.`,
        });
      }
      
      setJsonParsingStatus('success');
      
      toast({
        title: 'Data Processed',
        description: `Successfully processed and saved ${result.savedCount || formattedRecords.length} records for ${selectedSymbol} (${(processingTime/1000).toFixed(1)}s).`,
      });
      
      // Clear the input after successful processing
      setJsonInput('');
      
    } catch (error) {
      console.error('Error processing JSON data:', error);
      setJsonParsingStatus('error');
      
      toast({
        variant: 'destructive',
        title: 'Error Processing Data',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    } finally {
      setTimeout(() => {
        setJsonParsingStatus('idle');
      }, 3000);
    }
  };

  if (loading) {
    return <div>Loading data...</div>;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Data Uploads</CardTitle>
        <CardDescription>
          Upload and manage historical cryptocurrency data for analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center mb-6">
          <p className="text-sm text-muted-foreground">
            Use this section to fetch and store historical cryptocurrency data for analysis.
          </p>
          <Button onClick={() => setIsDialogOpen(true)}>Get Data</Button>
        </div>

        {/* Data selection dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Get Historical Data</DialogTitle>
              <DialogDescription>
                Choose how you want to retrieve historical cryptocurrency data.
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="coindesk-api" value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="coindesk-api">CoinDesk API</TabsTrigger>
                <TabsTrigger value="manual-input">Manual Text Input</TabsTrigger>
              </TabsList>
              
              {/* CoinDesk API Tab */}
              <TabsContent value="coindesk-api" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="dataLimit">Data Limit (records)</Label>
                  <Input
                    id="dataLimit"
                    type="number"
                    value={dataLimit}
                    onChange={(e) => setDataLimit(e.target.value)}
                    min="1"
                    max="2000"
                    placeholder="200"
                  />
                  <p className="text-xs text-muted-foreground">Max: 2000 records</p>
                </div>
                
                <div className="space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center">
                          <Label htmlFor="timestampAdjustment" className="mr-2">Timestamp Adjustment (minutes)</Label>
                          <div className="text-muted-foreground text-sm">ⓘ</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Enter a value in minutes to adjust the current timestamp. For example, enter 60 to go back 1 hour, 
                          1440 to go back 1 day, etc. This value is converted to seconds and subtracted from the current timestamp.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Input
                    id="timestampAdjustment"
                    type="number"
                    value={timestampAdjustment}
                    onChange={(e) => setTimestampAdjustment(e.target.value)}
                    min="0"
                    placeholder="0"
                  />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      Current timestamp: {Math.floor(Date.now() / 1000)}
                    </p>
                    {parseInt(timestampAdjustment) > 0 && (
                      <p>
                        Adjusted timestamp: {Math.floor(Date.now() / 1000) - (parseInt(timestampAdjustment) * 60)}
                        {Math.floor(Date.now() / 1000) - (parseInt(timestampAdjustment) * 60) < 1279324800 && 
                          " (will be capped at 1279324800)"}
                      </p>
                    )}
                    <p>
                      Earliest valid timestamp: 1279324800 (July 17, 2010)
                    </p>
                  </div>
                  
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="collectFullDay" 
                        checked={collectFullDay}
                        onCheckedChange={(checked) => setCollectFullDay(checked === true)}
                      />
                      <Label htmlFor="collectFullDay" className="text-sm font-normal">
                        Collect full 24 hours of data
                      </Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="text-muted-foreground text-sm">ⓘ</div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              When checked, the API will run repeatedly until a full 24 hours of data is collected.
                              Each run will use the earliest timestamp from the previous batch as the starting point
                              for the next batch.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    
                    {collectFullDay && (
                      <div className="flex items-center space-x-2 ml-6">
                        <Label htmlFor="maxBatchCount" className="text-sm font-normal whitespace-nowrap">
                          Max Batches:
                        </Label>
                        <Input
                          id="maxBatchCount"
                          type="number"
                          value={maxBatchCount}
                          onChange={(e) => setMaxBatchCount(e.target.value)}
                          min="1"
                          className="w-20 h-8"
                        />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-muted-foreground text-sm">ⓘ</div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">
                                Maximum number of batches to process when collecting data. 
                                The process will stop after reaching this number of batches, 
                                even if 24 hours of data hasn't been collected yet.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="selectAll" 
                    checked={selectedCryptos.length === cryptos.length && cryptos.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <Label htmlFor="selectAll">Select All</Label>
                </div>
                
                <div className="grid grid-cols-2 gap-4 py-2 max-h-[200px] overflow-y-auto">
                  {cryptos.map((crypto) => (
                    <div key={crypto.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`crypto-${crypto.id}`} 
                        checked={selectedCryptos.includes(crypto.symbol)}
                        onCheckedChange={() => handleCheckboxChange(crypto.symbol)}
                      />
                      <Label htmlFor={`crypto-${crypto.id}`} className="flex items-center">
                        {crypto.symbol}
                        {processingStatus[crypto.symbol] === 'processing' && (
                          <div className="ml-2 flex items-center">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {collectFullDay && processingDetails[crypto.symbol] && processingDetails[crypto.symbol].batchCount && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (Batch {processingDetails[crypto.symbol].batchCount}/{maxBatchCount})
                              </span>
                            )}
                          </div>
                        )}
                        {processingStatus[crypto.symbol] === 'success' && (
                          <div className="ml-2 flex items-center">
                            <span className="text-green-500">✓</span>
                            {processingDetails[crypto.symbol] && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({processingDetails[crypto.symbol].saved}/{processingDetails[crypto.symbol].total}
                                {collectFullDay && processingDetails[crypto.symbol].batchCount && 
                                  `, ${processingDetails[crypto.symbol].batchCount} batches`})
                              </span>
                            )}
                          </div>
                        )}
                        {processingStatus[crypto.symbol] === 'error' && (
                          <span className="ml-2 text-red-500">✗</span>
                        )}
                        {processingStatus[crypto.symbol] === 'cancelled' && (
                          <span className="ml-2 text-amber-500">⊘</span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
                
                <div className="w-full flex space-x-2">
                  <Button 
                    className="flex-1"
                    onClick={handleGetData}
                    disabled={selectedCryptos.length === 0 || isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Get Data from API'
                    )}
                  </Button>
                  
                  {isProcessing && (
                    <Button 
                      variant="destructive"
                      onClick={handleKillRequest}
                      className="whitespace-nowrap"
                    >
                      Cancel Request
                    </Button>
                  )}
                </div>
              </TabsContent>
              
              {/* Manual Text Input Tab */}
              <TabsContent value="manual-input" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="symbolSelect">Select Cryptocurrency</Label>
                  <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a cryptocurrency" />
                    </SelectTrigger>
                    <SelectContent>
                      {cryptos.map((crypto) => (
                        <SelectItem key={crypto.id} value={crypto.symbol}>
                          {crypto.symbol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="jsonInput">JSON Data</Label>
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setJsonInput(getSampleJsonData())}
                      >
                        Load Sample
                      </Button>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="text-muted-foreground text-sm cursor-help">Format Help ⓘ</div>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-sm">
                            <p className="text-sm">
                              Paste JSON data in the following format:
                            </p>
                            <pre className="text-xs mt-2 bg-secondary p-2 rounded">
{`{
  "Data": [
    {
      "TIMESTAMP": 1627776000,
      "OPEN": 42000.5,
      "HIGH": 42100.3,
      "LOW": 41900.8,
      "CLOSE": 42050.2,
      "VOLUME": 100.5
    },
    ...
  ]
}`}
                            </pre>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  <Textarea 
                    id="jsonInput"
                    placeholder="Paste JSON data here or click 'Load Sample' to see an example..."
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the JSON response from the CoinDesk API or other compatible data source. Make sure the TIMESTAMP field contains Unix timestamps (seconds since epoch).
                  </p>
                </div>
                
                <Button 
                  className="w-full"
                  onClick={handleProcessJsonData}
                  disabled={!selectedSymbol || !jsonInput.trim() || jsonParsingStatus === 'parsing'}
                >
                  {jsonParsingStatus === 'parsing' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : jsonParsingStatus === 'success' ? (
                    <>
                      <span className="text-green-500 mr-2">✓</span>
                      Processed Successfully
                    </>
                  ) : jsonParsingStatus === 'error' ? (
                    <>
                      <span className="text-red-500 mr-2">✗</span>
                      Error Processing
                    </>
                  ) : (
                    'Process JSON Data'
                  )}
                </Button>
              </TabsContent>
            </Tabs>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                disabled={isProcessing || jsonParsingStatus === 'parsing'}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default DataUploads;