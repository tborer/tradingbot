import React, { useState, useEffect } from 'react';
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
  const [processingDetails, setProcessingDetails] = useState<Record<string, { total: number; saved: number; errors: number }>>({});
  const [activeTab, setActiveTab] = useState<string>("coindesk-api");
  const [jsonInput, setJsonInput] = useState<string>("");
  const [jsonParsingStatus, setJsonParsingStatus] = useState<string>("idle"); // idle, parsing, success, error
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");

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

  const handleGetData = async () => {
    if (selectedCryptos.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Cryptos Selected',
        description: 'Please select at least one cryptocurrency to fetch data for.',
      });
      return;
    }

    setIsProcessing(true);
    setProcessingStatus({});
    setProcessingDetails({});

    // Validate inputs
    const limit = parseInt(dataLimit);
    const adjustmentMinutes = parseInt(timestampAdjustment);
    
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
        
        // Build URL with parameters
        const url = new URL(`/api/cryptos/historical-minutes`, window.location.origin);
        url.searchParams.append('symbol', symbol);
        url.searchParams.append('limit', limit.toString());
        
        // Add to_ts parameter if timestamp adjustment is provided
        if (toTimestamp) {
          url.searchParams.append('to_ts', toTimestamp.toString());
        }
        
        const response = await fetch(url.toString());
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          console.error(`API error for ${symbol}:`, { status: response.status, data: errorData });
          
          let errorMessage = `Failed to fetch data for ${symbol}`;
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
        
        const data = await response.json();
        
        // Update processing details
        setProcessingDetails(prev => ({ 
          ...prev, 
          [symbol]: { 
            total: data.message ? parseInt(data.message.match(/Processed (\d+) records/)?.[1] || '0') : 0,
            saved: data.savedCount || 0,
            errors: data.errorCount || 0
          } 
        }));
        
        setProcessingStatus(prev => ({ ...prev, [symbol]: 'success' }));
        
        // Show more detailed success message
        const processingTime = data.processingTimeMs ? `(${(data.processingTimeMs/1000).toFixed(1)}s)` : '';
        
        toast({
          title: 'Data Fetched',
          description: `Successfully fetched and saved ${data.savedCount || 0} records for ${symbol} ${processingTime}.`,
        });
      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error);
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
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        )}
                        {processingStatus[crypto.symbol] === 'success' && (
                          <div className="ml-2 flex items-center">
                            <span className="text-green-500">✓</span>
                            {processingDetails[crypto.symbol] && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({processingDetails[crypto.symbol].saved}/{processingDetails[crypto.symbol].total})
                              </span>
                            )}
                          </div>
                        )}
                        {processingStatus[crypto.symbol] === 'error' && (
                          <span className="ml-2 text-red-500">✗</span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
                
                <Button 
                  className="w-full"
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