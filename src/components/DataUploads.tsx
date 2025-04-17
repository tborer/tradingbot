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
    const adjustment = parseInt(timestampAdjustment);
    
    if (isNaN(limit) || limit <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Limit',
        description: 'Please enter a valid number for the data limit.',
      });
      setIsProcessing(false);
      return;
    }
    
    if (isNaN(adjustment)) {
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
    if (adjustment > 0) {
      // Get current timestamp in seconds and subtract the adjustment
      toTimestamp = Math.floor(Date.now() / 1000) - adjustment;
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
          if (errorData && errorData.error) {
            errorMessage = errorData.error;
            if (errorData.details) {
              console.error(`Error details:`, errorData.details);
            }
          }
          
          throw new Error(errorMessage);
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
              <DialogTitle>Select Cryptocurrencies</DialogTitle>
              <DialogDescription>
                Choose which cryptocurrencies you want to fetch historical data for.
              </DialogDescription>
            </DialogHeader>
            
            {/* Data fetching options */}
            <div className="mb-4">
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
            </div>
            
            <div className="space-y-2 mb-4">
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
                      Enter a value to adjust the current timestamp. For example, enter 60 to go back 1 hour, 
                      1440 to go back 1 day, etc. This value is subtracted from the current timestamp.
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
              <p className="text-xs text-muted-foreground">
                Current timestamp: {Math.floor(Date.now() / 1000)}
                {parseInt(timestampAdjustment) > 0 && ` → Adjusted: ${Math.floor(Date.now() / 1000) - parseInt(timestampAdjustment)}`}
              </p>
            </div>
            
            <div className="flex items-center space-x-2 mb-4">
              <Checkbox 
                id="selectAll" 
                checked={selectedCryptos.length === cryptos.length && cryptos.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <Label htmlFor="selectAll">Select All</Label>
            </div>
            
            <div className="grid grid-cols-2 gap-4 py-4 max-h-[300px] overflow-y-auto">
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
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleGetData}
                disabled={selectedCryptos.length === 0 || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Get Data'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default DataUploads;