import React, { useEffect, useState, useCallback } from 'react';
import { useKrakenWebSocket } from '@/hooks/useKrakenWebSocket';
import { KrakenPrice } from '@/lib/kraken';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { processAutoCryptoTrades } from '@/lib/autoTradeService';

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
  const { user } = useAuth();
  const { toast } = useToast();
  const [prices, setPrices] = useState<KrakenPrice[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoTradeEnabled, setAutoTradeEnabled] = useState<boolean>(false);
  const [lastAutoTradeCheck, setLastAutoTradeCheck] = useState<Date | null>(null);
  const [autoTradeResults, setAutoTradeResults] = useState<any[]>([]);
  
  // Fetch settings to check if auto trading is enabled
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const settings = await response.json();
          setAutoTradeEnabled(settings.enableAutoCryptoTrading || false);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };
    
    if (user) {
      fetchSettings();
    }
  }, [user]);
  
  // Process auto trades when prices update
  const processAutoTrades = useCallback(async (prices: KrakenPrice[]) => {
    if (!user || !autoTradeEnabled || prices.length === 0) return;
    
    try {
      const results = await processAutoCryptoTrades(prices, user.id);
      
      // Filter for successful trades
      const successfulTrades = results.filter(result => result.success && result.action);
      
      if (successfulTrades.length > 0) {
        // Show toast for successful trades
        successfulTrades.forEach(trade => {
          toast({
            title: `Auto ${trade.action} Executed`,
            description: `${trade.action === 'buy' ? 'Bought' : 'Sold'} ${trade.shares?.toFixed(6)} shares of ${trade.symbol} at $${trade.price?.toFixed(2)}`,
            variant: 'default',
          });
        });
        
        // Update auto trade results
        setAutoTradeResults(prev => [...successfulTrades, ...prev].slice(0, 5));
      }
      
      setLastAutoTradeCheck(new Date());
    } catch (error) {
      console.error('Error processing auto trades:', error);
    }
  }, [user, autoTradeEnabled, toast]);
  
  const handlePriceUpdate = useCallback((newPrices: KrakenPrice[]) => {
    if (newPrices.length === 0) {
      console.log('No new prices to update in KrakenPriceMonitor');
      return;
    }
    
    console.log('KrakenPriceMonitor received price updates:', newPrices);
    
    setPrices(prevPrices => {
      // Merge new prices with existing ones
      const updatedPrices = [...prevPrices];
      
      newPrices.forEach(newPrice => {
        const existingIndex = updatedPrices.findIndex(p => 
          p.symbol.toUpperCase() === newPrice.symbol.toUpperCase()
        );
        
        if (existingIndex >= 0) {
          console.log(`Updating existing price for ${newPrice.symbol}: $${newPrice.price}`);
          updatedPrices[existingIndex] = newPrice;
        } else {
          console.log(`Adding new price for ${newPrice.symbol}: $${newPrice.price}`);
          updatedPrices.push(newPrice);
        }
      });
      
      return updatedPrices;
    });
    
    setLastUpdated(new Date());
    
    if (onPriceUpdate) {
      console.log('Forwarding price updates to parent component');
      onPriceUpdate(newPrices);
    }
    
    // Process auto trades with the new prices
    processAutoTrades(newPrices);
  }, [onPriceUpdate, processAutoTrades]);
  
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
        
        {autoTradeEnabled && (
          <Alert variant="default" className="mb-4 bg-blue-50 dark:bg-blue-900/20 border-blue-500">
            <AlertTitle className="text-blue-700 dark:text-blue-300">Auto Trading Enabled</AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-300">
              Automatic trading is enabled for cryptocurrencies.
              {lastAutoTradeCheck && (
                <div className="text-xs mt-1">Last check: {lastAutoTradeCheck.toLocaleTimeString()}</div>
              )}
            </AlertDescription>
          </Alert>
        )}
        
        {autoTradeResults.length > 0 && (
          <Alert variant="default" className="mb-4 bg-green-50 dark:bg-green-900/20 border-green-500">
            <AlertTitle className="text-green-700 dark:text-green-300">Recent Auto Trades</AlertTitle>
            <AlertDescription className="text-green-700 dark:text-green-300">
              <ul className="text-xs mt-1 space-y-1">
                {autoTradeResults.map((result, index) => (
                  <li key={index}>
                    {result.action === 'buy' ? 'Bought' : 'Sold'} {result.shares?.toFixed(6)} {result.symbol} at ${result.price?.toFixed(2)}
                  </li>
                ))}
              </ul>
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