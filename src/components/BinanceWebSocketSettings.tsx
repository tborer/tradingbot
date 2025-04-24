import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useBinanceWebSocket } from '@/contexts/BinanceWebSocketContext';
import WebSocketConnectionStatus from './WebSocketConnectionStatus';
import { useMicroProcessing } from '@/hooks/useMicroProcessing';

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
  
  // Filter cryptos that use Binance as their WebSocket provider
  const binanceCryptos = enabledCryptos.filter(
    crypto => crypto.microProcessingSettings?.websocketProvider === 'binance'
  );
  
  // Get the WebSocket URL
  const getWebSocketUrl = () => {
    if (subscribedSymbols.length === 0) {
      return 'wss://stream.binance.us:9443/ws';
    }
    
    const streams = subscribedSymbols.flatMap(symbol => {
      const lowerSymbol = symbol.toLowerCase();
      return [`${lowerSymbol}@aggTrade`, `${lowerSymbol}@depth`];
    });
    
    return `wss://stream.binance.us:9443/stream?streams=${streams.join('/')}`;
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Binance WebSocket</CardTitle>
        <CardDescription>
          Connect to Binance WebSocket for real-time price updates
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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