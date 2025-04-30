import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface BinanceTradingTestProps {
  cryptoId: string;
  symbol: string;
}

export default function BinanceTradingTest({ cryptoId, symbol }: BinanceTradingTestProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [testMode, setTestMode] = useState<boolean>(true);
  const [useTestEndpoint, setUseTestEndpoint] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [requestDetails, setRequestDetails] = useState<string>('');
  
  // Listen for the custom event to use the test endpoint
  useEffect(() => {
    const handleUseTestEndpoint = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.cryptoId === cryptoId) {
        setUseTestEndpoint(true);
        setTestMode(true);
        toast({
          title: "Test Endpoint Activated",
          description: `Using test endpoint for ${symbol}. This will not execute real trades.`,
        });
      }
    };
    
    window.addEventListener('use-binance-test-endpoint', handleUseTestEndpoint);
    
    return () => {
      window.removeEventListener('use-binance-test-endpoint', handleUseTestEndpoint);
    };
  }, [cryptoId, symbol, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid quantity",
        description: "Please enter a valid quantity greater than 0.",
      });
      return;
    }
    
    if (orderType === 'LIMIT' && (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0)) {
      toast({
        variant: "destructive",
        title: "Invalid price",
        description: "Please enter a valid price greater than 0 for limit orders.",
      });
      return;
    }
    
    setIsLoading(true);
    
    // Prepare the request parameters
    const requestParams = {
      cryptoId,
      side, // Use 'side' instead of 'action' to match Binance API terminology
      type: orderType, // Use 'type' instead of 'orderType' to match Binance API terminology
      quantity: parseFloat(quantity),
      testMode,
      useTestEndpoint,
    };
    
    // Add price only for LIMIT orders
    if (orderType === 'LIMIT' && price) {
      requestParams['price'] = parseFloat(price);
    }
    
    // Store the request details for display
    setRequestDetails(JSON.stringify(requestParams, null, 2));
    
    try {
      // Only include the parameters that are needed for the API
      // Our API endpoint will handle forwarding only the required parameters to Binance
      const queryParams = new URLSearchParams();
      Object.entries(requestParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
      
      const response = await fetch(`/api/cryptos/binance-trade?${queryParams.toString()}`, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to execute trade');
      }
      
      setResult(data);
      
      toast({
        title: "Trade executed",
        description: `Successfully ${side === 'BUY' ? 'bought' : 'sold'} ${quantity} ${symbol} ${testMode ? '(Test Mode)' : ''} ${useTestEndpoint ? '(Test Endpoint)' : ''}`,
      });
    } catch (error) {
      console.error('Error executing trade:', error);
      toast({
        variant: "destructive",
        title: "Trade failed",
        description: error.message || 'An unexpected error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Binance Trading Test</CardTitle>
        <CardDescription>
          Test Binance trading API for {symbol}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
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
                <SelectItem value="BUY">Buy</SelectItem>
                <SelectItem value="SELL">Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="orderType">Order Type</Label>
            <Select
              value={orderType}
              onValueChange={(value: 'MARKET' | 'LIMIT') => setOrderType(value)}
            >
              <SelectTrigger id="orderType">
                <SelectValue placeholder="Select order type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKET">Market</SelectItem>
                <SelectItem value="LIMIT">Limit</SelectItem>
              </SelectContent>
            </Select>
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
              placeholder="Enter quantity"
            />
          </div>
          
          {orderType === 'LIMIT' && (
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Enter price"
              />
            </div>
          )}
          
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="testMode"
                checked={testMode}
                onCheckedChange={setTestMode}
              />
              <Label htmlFor="testMode">Test Mode (No actual trades)</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="useTestEndpoint"
                checked={useTestEndpoint}
                onCheckedChange={setUseTestEndpoint}
              />
              <Label htmlFor="useTestEndpoint">Use Test Endpoint (https://api.binance.us/api/v3/order/test)</Label>
            </div>
          </div>
          
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Executing...' : `Execute ${side} Order`}
          </Button>
        </form>
        
        {(requestDetails || result) && (
          <div className="mt-6">
            <h3 className="text-lg font-medium">API Information</h3>
            <Tabs defaultValue="summary" className="mt-2">
              <TabsList>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="request">Request</TabsTrigger>
                <TabsTrigger value="details">Response Details</TabsTrigger>
              </TabsList>
              <TabsContent value="summary" className="space-y-2">
                <div className="rounded-md bg-muted p-4">
                  {result ? (
                    <>
                      <p><strong>Status:</strong> {result.success ? 'Success' : 'Failed'}</p>
                      <p><strong>Transaction ID:</strong> {result.transaction?.id || 'N/A'}</p>
                      <p><strong>Action:</strong> {result.transaction?.action || 'N/A'}</p>
                      <p><strong>Shares:</strong> {result.transaction?.shares || 'N/A'}</p>
                      <p><strong>Price:</strong> ${result.transaction?.price?.toFixed(2) || 'N/A'}</p>
                      <p><strong>Total Amount:</strong> ${result.transaction?.totalAmount?.toFixed(2) || 'N/A'}</p>
                    </>
                  ) : (
                    <p>No response data yet. Submit a request to see results.</p>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="request" className="space-y-2">
                <div className="rounded-md bg-muted p-4">
                  <h3 className="text-sm font-medium mb-2">Request Parameters</h3>
                  <pre className="overflow-auto max-h-60 text-xs">
                    {requestDetails || 'No request sent yet'}
                  </pre>
                  <div className="mt-4 text-xs text-muted-foreground">
                    <p className="font-medium">Note about Binance API format:</p>
                    <p className="mt-1">
                      The request above is sent to our server, which then formats it according to Binance API requirements:
                    </p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                      <li>Parameters are sent as URL query parameters (not in request body)</li>
                      <li>A timestamp is added automatically</li>
                      <li>A signature is generated using HMAC SHA256 with your API secret key</li>
                      <li>Your API key is sent in the X-MBX-APIKEY header</li>
                    </ul>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="details">
                <pre className="rounded-md bg-muted p-4 overflow-auto max-h-60 text-xs">
                  {result ? JSON.stringify(result, null, 2) : 'No response data yet'}
                </pre>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
}