import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useBinanceWebSocket } from '@/contexts/BinanceWebSocketContext';
import { useWebSocketLogs } from '@/contexts/WebSocketLogContext';
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
    setAutoConnect,
    pingEnabled,
    setPingEnabled
  } = useBinanceWebSocket();
  
  const { addLog } = useWebSocketLogs();
  
  const { enabledCryptos } = useMicroProcessing();
  const [selectedCryptoId, setSelectedCryptoId] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  
  // Filter cryptos that use Binance as their WebSocket provider
  const binanceCryptos = enabledCryptos.filter(
    crypto => crypto.microProcessingSettings?.websocketProvider === 'binance'
  );
  
  // Get the WebSocket URL
  const getWebSocketUrl = () => {
    // Always use the bookTicker endpoint for BTC as the main connection
    return 'wss://stream.binance.us:9443/ws/btcusdt@bookTicker';
  };

  // Test connection functionality
  const [testUrl, setTestUrl] = useState('wss://stream.binance.us:9443/ws/btcusdt@bookTicker');
  const [testBody, setTestBody] = useState(`{
  "method": "SUBSCRIBE",
  "params": [
    "btcusdt@aggTrade",
    "btcusdt@depth"
  ],
  "id": 1
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
  
  // Enhanced connect function with logging
  const handleConnect = () => {
    addLog('info', 'Connect button clicked in BinanceWebSocketSettings');
    connect();
  };
  
  // Enhanced disconnect function with logging
  const handleDisconnect = () => {
    addLog('info', 'Disconnect button clicked in BinanceWebSocketSettings');
    disconnect();
  };
  
  // Enhanced reconnect function with logging
  const handleReconnect = () => {
    addLog('info', 'Reconnect button clicked in BinanceWebSocketSettings');
    reconnect();
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
              reconnect={handleReconnect}
              connect={handleConnect}
              disconnect={disconnect}
              lastMessageTime={lastMessageTime}
              lastPingTime={lastPingTime}
              lastPongTime={lastPongTime}
              autoConnect={autoConnect}
              onAutoConnectChange={setAutoConnect}
              pingEnabled={pingEnabled}
              onPingEnabledChange={setPingEnabled}
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
                    className="w-full p-2 border rounded-md font-mono text-sm bg-background text-foreground"
                    value={testUrl}
                    onChange={(e) => setTestUrl(e.target.value)}
                    placeholder="wss://stream.binance.us:9443/ws"
                  />
                  <p className="text-xs text-muted-foreground">
                    Example: wss://stream.binance.us:9443/ws/btc@aggTrade or wss://stream.binance.us:9443/ws
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="test-body">Test Body</Label>
                  <textarea
                    id="test-body"
                    className="w-full p-2 border rounded-md font-mono text-sm min-h-[100px] bg-background text-foreground"
                    value={testBody}
                    onChange={(e) => setTestBody(e.target.value)}
                    placeholder='{"id": "922bcc6e-9de8-440d-9e84-7c80933a8d0d", "method": "ping"}'
                  />
                  <p className="text-xs text-muted-foreground">
                    Example ping: {"{"}"id": "922bcc6e-9de8-440d-9e84-7c80933a8d0d", "method": "ping"{"}"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Example subscription: {"{"}"method": "SUBSCRIBE", "params": ["btcusdt@aggTrade", "btcusdt@depth"], "id": 1{"}"}
                  </p>
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
                  <div className="mt-2 p-3 bg-muted/50 rounded-md text-xs space-y-2">
                    <h4 className="font-medium">Ping Message Format</h4>
                    <p>
                      The WebSocket ping message must include a UUID to maintain the connection:
                    </p>
                    <pre className="p-2 bg-background rounded-md overflow-auto text-xs">
{`{
  "id": "922bcc6e-9de8-440d-9e84-7c80933a8d0d",
  "method": "ping"
}`}
                    </pre>
                    <p>
                      Without the ID field, Binance will close the connection with an error.
                    </p>
                    <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-md">
                      <p className="font-medium">Note: Ping is currently {pingEnabled ? 'enabled' : 'disabled'}</p>
                      <p>
                        {pingEnabled 
                          ? 'Ping messages will be sent every 2.5 minutes to keep the connection alive.' 
                          : 'No ping messages will be sent. This may help if you are experiencing connection issues.'}
                      </p>
                    </div>
                    
                    <h4 className="font-medium mt-3">About BookTicker Updates</h4>
                    <p>
                      The system now uses the bookTicker stream which provides the best bid and ask prices directly:
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><span className="font-mono">u</span>: Order book updateId</li>
                      <li><span className="font-mono">s</span>: Symbol (e.g., "BNBUSDT")</li>
                      <li><span className="font-mono">b</span>: Best bid price - Used for current price updates</li>
                      <li><span className="font-mono">B</span>: Best bid quantity</li>
                      <li><span className="font-mono">a</span>: Best ask price</li>
                      <li><span className="font-mono">A</span>: Best ask quantity</li>
                    </ul>
                    <p>
                      The system uses the best bid price (<span className="font-mono">b</span>) from bookTicker updates for the current price 
                      in the micro processing logic, as it represents the highest price buyers are willing to pay.
                    </p>
                    <h4 className="font-medium mt-3">About Depth Updates</h4>
                    <p>
                      Depth updates contain order book data with the following key fields:
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><span className="font-mono">e</span>: Event type (e.g., "depthUpdate")</li>
                      <li><span className="font-mono">s</span>: Symbol (e.g., "BTCUSDT")</li>
                      <li><span className="font-mono">b</span>: Bids array [[price, quantity], ...] - Best bid is first element</li>
                      <li><span className="font-mono">a</span>: Asks array [[price, quantity], ...] - Best ask is first element</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Subscription Status</CardTitle>
                <CardDescription>
                  Current subscription status and symbol information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-2">Subscribed Symbols</h3>
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
                
                <div className="p-3 bg-muted/50 rounded-md text-xs space-y-2">
                  <h4 className="font-medium">Subscription Message Format</h4>
                  <p>
                    The WebSocket sends this subscription message immediately after connection:
                  </p>
                  <pre className="p-2 bg-background rounded-md overflow-auto text-xs">
{`{
  "method": "SUBSCRIBE",
  "params": ${JSON.stringify(subscribedSymbols.flatMap(symbol => {
    const formattedSymbol = symbol.toLowerCase().endsWith('usdt') 
      ? symbol.toLowerCase() 
      : `${symbol.toLowerCase()}usdt`;
    return [`${formattedSymbol}@aggTrade`, `${formattedSymbol}@depth`];
  }), null, 2)},
  "id": 1
}`}
                  </pre>
                  <p>
                    This format follows the Binance WebSocket API requirements for subscription messages.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-medium">Connection Diagnostics</h4>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        if (isConnected && subscribedSymbols.length > 0) {
                          // Create a manual subscription message
                          const streams = subscribedSymbols.flatMap(symbol => {
                            const formattedSymbol = symbol.toLowerCase().endsWith('usdt') 
                              ? symbol.toLowerCase() 
                              : `${symbol.toLowerCase()}usdt`;
                            return [`${formattedSymbol}@aggTrade`, `${formattedSymbol}@depth`];
                          });
                          
                          const subscribeMessage = {
                            method: "SUBSCRIBE",
                            params: streams,
                            id: 1
                          };
                          
                          // Set up test connection with the correct WebSocket URL
                          setTestUrl('wss://stream.binance.us:9443/ws/btcusdt@bookTicker');
                          setTestBody(JSON.stringify(subscribeMessage, null, 2));
                          
                          // Log the action
                          addLog('info', 'Manual subscription test prepared', subscribeMessage);
                        } else {
                          addLog('warning', 'Cannot prepare subscription test - WebSocket not connected or no symbols available');
                        }
                      }}
                      disabled={!isConnected || subscribedSymbols.length === 0}
                    >
                      Prepare Manual Subscription Test
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-muted/30 rounded-md">
                      <span className="font-medium">Last Message:</span>{' '}
                      {lastMessageTime ? new Date(lastMessageTime).toLocaleTimeString() : 'None'}
                    </div>
                    <div className="p-2 bg-muted/30 rounded-md">
                      <span className="font-medium">Connection Status:</span>{' '}
                      <Badge variant={isConnected ? "success" : "destructive"} className="ml-1">
                        {isConnected ? 'Connected' : 'Disconnected'}
                      </Badge>
                    </div>
                    <div className="p-2 bg-muted/30 rounded-md">
                      <span className="font-medium">Last Ping:</span>{' '}
                      {lastPingTime ? new Date(lastPingTime).toLocaleTimeString() : 'None'}
                    </div>
                    <div className="p-2 bg-muted/30 rounded-md">
                      <span className="font-medium">Last Pong:</span>{' '}
                      {lastPongTime ? new Date(lastPongTime).toLocaleTimeString() : 'None'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
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
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Label htmlFor="ping-enabled" className="text-xs">Enable Ping</Label>
            <Switch
              id="ping-enabled"
              checked={pingEnabled}
              onCheckedChange={setPingEnabled}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Label htmlFor="auto-connect" className="text-xs">Auto-Connect</Label>
            <Switch
              id="auto-connect"
              checked={autoConnect}
              onCheckedChange={setAutoConnect}
            />
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}