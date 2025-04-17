import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

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

    // Process each selected crypto
    for (const symbol of selectedCryptos) {
      try {
        setProcessingStatus(prev => ({ ...prev, [symbol]: 'processing' }));
        
        const response = await fetch(`/api/cryptos/historical-minutes?symbol=${symbol}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch data for ${symbol}`);
        }
        
        const data = await response.json();
        
        setProcessingStatus(prev => ({ ...prev, [symbol]: 'success' }));
        
        toast({
          title: 'Data Fetched',
          description: `Successfully fetched and saved historical data for ${symbol}.`,
        });
      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error);
        setProcessingStatus(prev => ({ ...prev, [symbol]: 'error' }));
        
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `Failed to fetch data for ${symbol}. Please try again.`,
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
                      <span className="ml-2 text-green-500">✓</span>
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