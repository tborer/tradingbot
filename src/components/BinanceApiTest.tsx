import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export default function BinanceApiTest() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  
  // Form fields
  const [apiUrl, setApiUrl] = useState('https://api.binance.us/api/v3/order/test');
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('');
  
  // Results
  const [requestDetails, setRequestDetails] = useState<string>('');
  const [responseDetails, setResponseDetails] = useState<string>('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        variant: "destructive",
        title: "Authentication required",
        description: "You must be logged in to execute API tests.",
      });
      return;
    }
    
    // Validate inputs
    if (!symbol) {
      toast({
        variant: "destructive",
        title: "Symbol required",
        description: "Please enter a trading symbol (e.g., BTC or BTCUSDT).",
      });
      return;
    }
    
    if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid quantity",
        description: "Please enter a valid quantity greater than 0.",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Format the symbol for Binance API (ensure it has USDT suffix)
      const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const formattedSymbol = cleanSymbol.endsWith('USDT') ? cleanSymbol : `${cleanSymbol}USDT`;
      
      // Generate timestamp
      const timestamp = Date.now();
      const parsedQuantity = parseFloat(quantity);
      
      // Prepare the request data
      const requestData = {
        symbol: formattedSymbol,
        side: side,
        type: 'MARKET',
        quantity: parsedQuantity,
        timestamp: timestamp,
        testMode: true,
        useTestEndpoint: true
      };
      
      // Create the query string that would be used for signature
      const queryParams = {
        symbol: formattedSymbol,
        side: side,
        type: 'MARKET',
        quantity: parsedQuantity.toString(),
        timestamp: timestamp.toString()
      };
      
      const queryString = Object.entries(queryParams)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      
      // Show the request details
      const requestInfo = {
        url: apiUrl,
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': '[Your API Key]',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        queryString: queryString,
        fullUrl: `${apiUrl}?${queryString}&signature=[signature]`,
        curlExample: `curl -X "POST" "${apiUrl}?${queryString}&signature=[signature]" \\
    -H "X-MBX-APIKEY: [Your API Key]"`,
        signatureGeneration: `HMAC SHA256 signature of: "${queryString}" using your Binance API secret key`
      };
      
      setRequestDetails(JSON.stringify(requestInfo, null, 2));
      
      // Make the actual API request through our backend
      const response = await fetch('/api/cryptos/binance-trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: side,
          quantity: parsedQuantity,
          orderType: 'MARKET',
          testMode: true,
          useTestEndpoint: true,
          // We need to pass a cryptoId for the API to work, but we'll use a special flag
          // to indicate this is a direct API test
          cryptoId: 'API_TEST',
          symbol: formattedSymbol,
          isApiTest: true
        }),
      });
      
      const data = await response.json();
      
      setResponseDetails(JSON.stringify(data, null, 2));
      
      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to execute API test');
      }
      
      toast({
        title: "API test executed",
        description: "The Binance API test was executed successfully.",
      });
      
    } catch (error) {
      console.error('Error executing API test:', error);
      
      toast({
        variant: "destructive",
        title: "API test failed",
        description: error.message || 'An unexpected error occurred',
      });
      
      setResponseDetails(`Error: ${error.message || 'An unexpected error occurred'}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Card className="w-full mt-6">
      <CardHeader>
        <CardTitle>Binance API Test</CardTitle>
        <CardDescription>
          Test Binance API directly without requiring crypto setup
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-url">API URL</Label>
            <Input
              id="api-url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://api.binance.us/api/v3/order/test"
            />
            <p className="text-xs text-muted-foreground">
              The Binance API endpoint for test orders
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="symbol">Symbol</Label>
            <Input
              id="symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="BTC or BTCUSDT"
            />
            <p className="text-xs text-muted-foreground">
              Trading pair symbol (e.g., BTC, ETH, SOL). USDT will be appended if not included.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="side">Side</Label>
            <Select
              value={side}
              onValueChange={(value: 'BUY' | 'SELL') => setSide(value)}
            >
              <SelectTrigger id="side">
                <SelectValue placeholder="Select side" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BUY">BUY</SelectItem>
                <SelectItem value="SELL">SELL</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Trading side (BUY or SELL)
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              step="0.00000001"
              min="0.00000001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0.001"
            />
            <p className="text-xs text-muted-foreground">
              Trading quantity (e.g., 0.001 BTC). Use small values for testing.
            </p>
          </div>
          
          <div className="p-3 bg-muted/50 rounded-md text-xs space-y-2">
            <h4 className="font-medium">Test Parameters</h4>
            <p>
              This test will use the following parameters:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-mono">symbol</span>: The trading pair symbol</li>
              <li><span className="font-mono">side</span>: BUY or SELL</li>
              <li><span className="font-mono">type</span>: MARKET (hardcoded)</li>
              <li><span className="font-mono">quantity</span>: The amount to trade</li>
              <li><span className="font-mono">timestamp</span>: Current timestamp in milliseconds</li>
              <li><span className="font-mono">recvWindow</span>: 5000 (standard parameter)</li>
            </ul>
            <h4 className="font-medium mt-3">Signature Generation</h4>
            <p>
              The signature is generated server-side using the following process:
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Create a query string with all parameters (e.g., <span className="font-mono">symbol=BTCUSDT&side=BUY&type=MARKET&quantity=0.001&timestamp=1619846400000&recvWindow=5000</span>)</li>
              <li>Generate an HMAC SHA256 hash of this query string using your Binance API secret key as the key</li>
              <li>Convert the hash to a hex string</li>
              <li>Append the signature to the query string as <span className="font-mono">&signature=HASH</span></li>
            </ol>
            <p className="mt-2">
              <strong>Note:</strong> Both the parameters AND your API secret key are essential for generating a valid signature. The API key is sent in the request header.
            </p>
          </div>
          
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Executing...' : 'Execute API Test'}
          </Button>
        </form>
        
        {(requestDetails || responseDetails) && (
          <div className="mt-6">
            <Tabs defaultValue="request" className="mt-2">
              <TabsList>
                <TabsTrigger value="request">Request Details</TabsTrigger>
                <TabsTrigger value="response">Response</TabsTrigger>
              </TabsList>
              <TabsContent value="request" className="space-y-2">
                <div className="rounded-md bg-muted p-4">
                  <h3 className="text-sm font-medium mb-2">API Request</h3>
                  <pre className="overflow-auto max-h-60 text-xs">
                    {requestDetails}
                  </pre>
                </div>
              </TabsContent>
              <TabsContent value="response" className="space-y-2">
                <div className="rounded-md bg-muted p-4">
                  <h3 className="text-sm font-medium mb-2">API Response</h3>
                  <pre className="overflow-auto max-h-60 text-xs">
                    {responseDetails}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        This test uses your Binance API credentials configured in Settings
      </CardFooter>
    </Card>
  );
}