import React, { useEffect, useState } from 'react';
import { useKrakenWebSocket } from '@/hooks/useKrakenWebSocket';
import { KrakenPrice } from '@/lib/kraken';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface KrakenPriceMonitorProps {
  symbols: string[];
  websocketUrl?: string;
  onPriceUpdate?: (prices: KrakenPrice[]) => void;
}

export default function KrakenPriceMonitor({ 
  symbols, 
  websocketUrl = 'wss://ws.kraken.com/v2',
  onPriceUpdate 
}: KrakenPriceMonitorProps) {
  const [prices, setPrices] = useState<KrakenPrice[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  const handlePriceUpdate = (newPrices: KrakenPrice[]) => {
    setPrices(prevPrices => {
      // Merge new prices with existing ones
      const updatedPrices = [...prevPrices];
      
      newPrices.forEach(newPrice => {
        const existingIndex = updatedPrices.findIndex(p => p.symbol === newPrice.symbol);
        if (existingIndex >= 0) {
          updatedPrices[existingIndex] = newPrice;
        } else {
          updatedPrices.push(newPrice);
        }
      });
      
      return updatedPrices;
    });
    
    setLastUpdated(new Date());
    
    if (onPriceUpdate) {
      onPriceUpdate(newPrices);
    }
  };
  
  const { isConnected, error, reconnect } = useKrakenWebSocket({
    symbols,
    url: websocketUrl,
    onPriceUpdate: handlePriceUpdate,
    enabled: symbols.length > 0
  });
  
  // Clear prices when symbols change
  useEffect(() => {
    setPrices([]);
  }, [JSON.stringify(symbols)]);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Kraken Price Monitor</span>
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm text-muted-foreground">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
            {!isConnected && (
              <Button size="sm" variant="outline" onClick={reconnect}>
                Reconnect
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              Error connecting to Kraken: {error.message}
            </AlertDescription>
          </Alert>
        )}
        
        {symbols.length === 0 ? (
          <p className="text-muted-foreground">No symbols to monitor</p>
        ) : (
          <>
            <div className="space-y-2">
              {prices.length > 0 ? (
                prices.map(price => (
                  <div key={price.symbol} className="flex justify-between items-center p-2 border rounded">
                    <span className="font-medium">{price.symbol}</span>
                    <span>${price.price.toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">Waiting for price data...</p>
              )}
            </div>
            
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-4">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}