import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useBinanceWebSocket } from '@/contexts/BinanceWebSocketContext';
import WebSocketConnectionStatus from './WebSocketConnectionStatus';
import { useMicroProcessing } from '@/hooks/useMicroProcessing';
import BinanceTradingTest from './BinanceTradingTest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function BinanceWebSocketSettings() {
  const { 
    isConnected, 
    connect, 
    disconnect, 
    reconnect, 
    lastMessageTime, 
    lastPingTime, 
    lastPongTime, 
    error, 
    subscribedSymbols,
    autoConnect,
    setAutoConnect
  } = useBinanceWebSocket();
  
  const { enabledCryptos } = useMicroProcessing();
  const [selectedCryptoId, setSelectedCryptoId] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  
  // Filter cryptos that use Binance as their WebSocket provider
  const binanceCryptos = enabledCryptos.filter(
    crypto => crypto.microProcessingSettings?.websocketProvider === 'binance'
  );
  
  // Get the WebSocket URL
  const getWebSocketUrl = () => {
    if (subscribedSymbols.length === 0) {
      return 'wss://stream.binance.us:9443/ws';
    }
    
    if (subscribedSymbols.length === 1) {
      // For a single symbol, use the direct /ws/<symbol>@aggTrade format
      const lowerSymbol = subscribedSymbols[0].toLowerCase();
      return `wss://stream.binance.us:9443/ws/${lowerSymbol}@aggTrade`;
    } else {
      // For multiple symbols, use the combined stream format
      const streams = subscribedSymbols.flatMap(symbol => {
        const lowerSymbol = symbol.toLowerCase();
        return [`${lowerSymbol}@aggTrade`, `${lowerSymbol}@depth`];
      });
      
      return `wss://stream.binance.us:9443/stream?streams=${streams.join('/')}`;
    }
  };

  // Test connection functionality
  const [testUrl, setTestUrl] = useState('wss://stream.binance.us:9443/ws');
  const [testBody, setTestBody] = useState(`{
  "id": "922bcc6e-9de8-440d-9e84-7c80933a8d0d",
  "method": "ping"
}`);
  const [testResponse, setTestResponse] = useState('');
  const [testWs, setTestWs] = useState<WebSocket | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleTestConnection = () => {
    setIsTesting(true);
    setTestResponse('Connecting...');
    
    try {
      // Close existing test connection if any
      if (testWs) {
        testWs.close();
      }
      
      // Create new WebSocket connection
      const ws = new WebSocket(testUrl);
      setTestWs(ws);
      
      ws.onopen = () => {
        setTestResponse('Connected. Sending test message...');
        try {
          const parsedBody = JSON.parse(testBody);
          ws.send(JSON.stringify(parsedBody));
        } catch (err) {
          setTestResponse(`Error parsing test body: ${err instanceof Error ? err.message : String(err)}`);
          ws.close();
          setIsTesting(false);
        }
      };
      
      ws.onmessage = (event) => {
        setTestResponse(`Received response:\n${event.data}`);
        // Close the connection after receiving a response
        setTimeout(() => {
          ws.close();
          setIsTesting(false);
        }, 1000);
      };
      
      ws.onerror = (event) => {
        setTestResponse(`WebSocket error occurred`);
        setIsTesting(false);
      };
      
      ws.onclose = () => {
        setTestWs(null);
        setIsTesting(false);
      };
    } catch (err) {
      setTestResponse(`Failed to establish WebSocket connection: ${err instanceof Error ? err.message : String(err)}`);
      setIsTesting(false);
    }
  };

  const handleSelectCrypto = (cryptoId: string, symbol: string) => {
    setSelectedCryptoId(cryptoId);
    setSelectedSymbol(symbol);
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Binance Integration</CardTitle>
        <CardDescription>
          Connect to Binance WebSocket for real-time price updates and execute trades
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="websocket">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="websocket">WebSocket</TabsTrigger>
            <TabsTrigger value="trading" disabled={!selectedCryptoId}>Trading API</TabsTrigger>
          </TabsList>
          
          <TabsContent value="websocket" className="space-y-4">
            <WebSocketConnectionStatus
              isConnected={isConnected}
              url={getWebSocketUrl()}
              error={error}
              reconnect={reconnect}
              connect={connect}
              disconnect={disconnect}
              lastMessageTime={lastMessageTime}
              lastPingTime={lastPingTime}
              lastPongTime={lastPongTime}
              autoConnect={autoConnect}
              onAutoConnectChange={setAutoConnect}
            />
            
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Test Connection</CardTitle>
                <CardDescription>
                  Test WebSocket connection with custom URL and message
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="test-url">Test URL</Label>
                  <input
                    id="test-url"
                    className="w-full p-2 border rounded-md font-mono text-sm"
                    value={testUrl}
                    onChange={(e) => setTestUrl(e.target.value)}
                    placeholder="wss://stream.binance.us:9443/ws"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="test-body">Test Body</Label>
                  <textarea
                    id="test-body"
                    className="w-full p-2 border rounded-md font-mono text-sm min-h-[100px]"
                    value={testBody}
                    onChange={(e) => setTestBody(e.target.value)}
                    placeholder='{"method": "ping"}'
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="test-response">Test Response</Label>
                    <Button 
                      size="sm" 
                      onClick={handleTestConnection}
                      disabled={isTesting}
                    >
                      {isTesting ? 'Testing...' : 'Test Connection'}
                    </Button>
                  </div>
                  <textarea
                    id="test-response"
                    className="w-full p-2 border rounded-md font-mono text-sm min-h-[100px] bg-muted"
                    value={testResponse}
                    readOnly
                    placeholder="Response will appear here"
                  />
                </div>
              </CardContent>
            </Card>
            
            <div className="mt-4">
              <h3 className="text-lg font-medium mb-2">Subscribed Symbols</h3>
              {subscribedSymbols.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No symbols subscribed. Enable Binance WebSocket provider in Micro Processing settings.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {subscribedSymbols.map(symbol => (
                    <Badge key={symbol} variant="outline">
                      {symbol}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            
            <div className="mt-4">
              <h3 className="text-lg font-medium mb-2">Enabled Cryptos with Binance WebSocket</h3>
              {binanceCryptos.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No cryptos configured to use Binance WebSocket. Update Micro Processing settings to use Binance.
                </div>
              ) : (
                <div className="border rounded-md">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="py-2 px-4 text-left font-medium">Symbol</th>
                        <th className="py-2 px-4 text-left font-medium">Current Price</th>
                        <th className="py-2 px-4 text-left font-medium">Status</th>
                        <th className="py-2 px-4 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {binanceCryptos.map(crypto => (
                        <tr key={crypto.id} className="border-b">
                          <td className="py-2 px-4 font-medium">{crypto.symbol}</td>
                          <td className="py-2 px-4">
                            ${crypto.currentPrice ? crypto.currentPrice.toFixed(2) : 'N/A'}
                          </td>
                          <td className="py-2 px-4">
                            <Badge variant={isConnected ? "success" : "destructive"}>
                              {isConnected ? 'Connected' : 'Disconnected'}
                            </Badge>
                          </td>
                          <td className="py-2 px-4">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleSelectCrypto(crypto.id, crypto.symbol)}
                            >
                              Test Trading
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="trading">
            {selectedCryptoId && selectedSymbol && (
              <BinanceTradingTest 
                cryptoId={selectedCryptoId} 
                symbol={selectedSymbol} 
              />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="text-xs text-muted-foreground">
          {isConnected ? 'Connected to Binance WebSocket' : 'Disconnected from Binance WebSocket'}
        </div>
        <div className="flex items-center space-x-2">
          <Label htmlFor="auto-connect" className="text-xs">Auto-Connect</Label>
          <Switch
            id="auto-connect"
            checked={autoConnect}
            onCheckedChange={setAutoConnect}
          />
        </div>
      </CardFooter>
    </Card>
  );
}