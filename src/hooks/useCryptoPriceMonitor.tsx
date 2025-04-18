import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { batchUpdatePriceCache, getAllCachedPrices, evaluateTradingConditions, PriceCacheEntry } from '@/lib/priceCache';

interface CryptoWithPrice {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  purchasePrice: number;
  lastPrice: number;
  autoBuy: boolean;
  autoSell: boolean;
  autoTradeSettings?: any;
  tradingConditions?: {
    shouldTrade: boolean;
    action?: 'buy' | 'sell';
    reason?: string;
    currentPrice?: number;
  };
}

interface UserSettings {
  enableAutoCryptoTrading: boolean;
  buyThresholdPercent: number;
  sellThresholdPercent: number;
}

export function useCryptoPriceMonitor() {
  const { user } = useAuth();
  const [cryptos, setCryptos] = useState<CryptoWithPrice[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pendingTrades, setPendingTrades] = useState<CryptoWithPrice[]>([]);
  
  // Use a ref to track if we're currently executing trades
  const executingTradesRef = useRef(false);
  
  // Fetch user's cryptos
  const fetchCryptos = useCallback(async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const response = await fetch('/api/cryptos');
      
      if (!response.ok) {
        throw new Error('Failed to fetch cryptos');
      }
      
      const data = await response.json();
      setCryptos(data);
    } catch (err) {
      console.error('Error fetching cryptos:', err);
      setError('Failed to load cryptocurrencies');
    } finally {
      setLoading(false);
    }
  }, [user]);
  
  // Fetch user settings
  const fetchSettings = useCallback(async () => {
    if (!user) return;
    
    try {
      const response = await fetch('/api/settings');
      
      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }
      
      const data = await response.json();
      setSettings(data);
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError('Failed to load user settings');
    }
  }, [user]);
  
  // Update prices in the database (less frequently)
  const persistPricesToDatabase = useCallback(async (prices: PriceCacheEntry[]) => {
    if (!user || prices.length === 0) return;
    
    try {
      // Format the updates for the API
      const updates = prices.map(price => ({
        symbol: price.symbol,
        lastPrice: price.price
      }));
      
      // Send the updates to the API
      const response = await fetch('/api/cryptos/batch-update-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update prices in database');
      }
      
      console.log('Successfully persisted prices to database');
    } catch (err) {
      console.error('Error persisting prices to database:', err);
    }
  }, [user]);
  
  // Handle WebSocket price updates
  const handlePriceUpdate = useCallback((priceData: any) => {
    if (!Array.isArray(priceData)) {
      priceData = [priceData];
    }
    
    // Update the price cache
    batchUpdatePriceCache(priceData);
    
    // Update the last updated timestamp
    setLastUpdated(new Date());
    
    // Update the cryptos state with new prices
    setCryptos(prevCryptos => {
      const updatedCryptos = [...prevCryptos];
      
      for (const price of priceData) {
        const cryptoIndex = updatedCryptos.findIndex(c => c.symbol === price.symbol);
        
        if (cryptoIndex !== -1) {
          updatedCryptos[cryptoIndex] = {
            ...updatedCryptos[cryptoIndex],
            lastPrice: price.price
          };
        }
      }
      
      return updatedCryptos;
    });
  }, []);
  
  // Evaluate trading conditions for all cryptos
  const evaluateAllTradingConditions = useCallback(() => {
    if (!settings || !cryptos.length) return;
    
    const updatedCryptos = cryptos.map(crypto => {
      // Skip evaluation if auto trading is not enabled for this crypto
      if (!crypto.autoBuy && !crypto.autoSell) {
        return crypto;
      }
      
      const conditions = evaluateTradingConditions(crypto, settings);
      
      return {
        ...crypto,
        tradingConditions: conditions
      };
    });
    
    setCryptos(updatedCryptos);
    
    // Find cryptos that should be traded
    const tradableCryptos = updatedCryptos.filter(
      crypto => crypto.tradingConditions?.shouldTrade
    );
    
    if (tradableCryptos.length > 0) {
      console.log('Found cryptos that meet trading conditions:', 
        tradableCryptos.map(c => `${c.symbol} (${c.tradingConditions?.action})`))
      setPendingTrades(tradableCryptos);
    }
  }, [cryptos, settings]);
  
  // Execute pending trades
  const executePendingTrades = useCallback(async () => {
    if (executingTradesRef.current || !pendingTrades.length || !settings?.enableAutoCryptoTrading) {
      return;
    }
    
    executingTradesRef.current = true;
    
    try {
      console.log(`Executing ${pendingTrades.length} pending trades`);
      
      // Convert pending trades to price format expected by the API
      const priceUpdates = pendingTrades.map(crypto => ({
        symbol: crypto.symbol,
        price: crypto.tradingConditions?.currentPrice || crypto.lastPrice,
        timestamp: Date.now()
      }));
      
      // Call the process-auto-trades API
      const response = await fetch('/api/cryptos/process-auto-trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prices: priceUpdates }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to process auto trades');
      }
      
      const result = await response.json();
      console.log('Auto trade execution results:', result);
      
      // Clear pending trades
      setPendingTrades([]);
      
      // Refresh cryptos after trades are executed
      fetchCryptos();
    } catch (err) {
      console.error('Error executing pending trades:', err);
      setError('Failed to execute trades');
    } finally {
      executingTradesRef.current = false;
    }
  }, [pendingTrades, settings, fetchCryptos]);
  
  // Initialize data on component mount
  useEffect(() => {
    if (user) {
      fetchCryptos();
      fetchSettings();
    }
  }, [user, fetchCryptos, fetchSettings]);
  
  // Set up interval to persist prices to database (every 30 seconds)
  useEffect(() => {
    if (!user) return;
    
    const persistInterval = setInterval(() => {
      const cachedPrices = getAllCachedPrices();
      if (cachedPrices.length > 0) {
        persistPricesToDatabase(cachedPrices);
      }
    }, 30000);
    
    return () => clearInterval(persistInterval);
  }, [user, persistPricesToDatabase]);
  
  // Set up interval to evaluate trading conditions (every 5 seconds)
  useEffect(() => {
    if (!user || !settings?.enableAutoCryptoTrading) return;
    
    const evaluationInterval = setInterval(() => {
      evaluateAllTradingConditions();
    }, 5000);
    
    return () => clearInterval(evaluationInterval);
  }, [user, settings, evaluateAllTradingConditions]);
  
  // Execute pending trades when they're available
  useEffect(() => {
    if (pendingTrades.length > 0 && !executingTradesRef.current) {
      executePendingTrades();
    }
  }, [pendingTrades, executePendingTrades]);
  
  return {
    cryptos,
    loading,
    error,
    lastUpdated,
    pendingTrades,
    refreshCryptos: fetchCryptos,
    handlePriceUpdate,
    evaluateAllTradingConditions
  };
}