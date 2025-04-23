import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { 
  initializeMicroProcessing, 
  updateMicroProcessingPrice, 
  processAllMicroProcessingCryptos,
  MicroProcessingCrypto
} from '@/lib/clientMicroProcessingService';

export function useMicroProcessing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabledCryptos, setEnabledCryptos] = useState<MicroProcessingCrypto[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);

  // Fetch cryptos with micro processing settings
  const fetchMicroProcessingCryptos = useCallback(async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const response = await fetch('/api/cryptos');
      
      if (!response.ok) {
        throw new Error('Failed to fetch cryptos');
      }
      
      const cryptos = await response.json();
      
      // Fetch micro processing settings for each crypto
      const cryptosWithSettings = await Promise.all(
        cryptos.map(async (crypto: any) => {
          try {
            const settingsResponse = await fetch(`/api/cryptos/micro-processing-settings?cryptoId=${crypto.id}`);
            
            if (settingsResponse.ok) {
              const settings = await settingsResponse.json();
              
              // Only include enabled settings
              if (settings.enabled) {
                return {
                  ...crypto,
                  currentPrice: crypto.lastPrice || crypto.currentPrice,
                  microProcessingSettings: settings
                };
              }
            }
            return null;
          } catch (err) {
            console.error(`Error fetching settings for ${crypto.symbol}:`, err);
            return null;
          }
        })
      );
      
      // Filter out null values and cryptos without enabled settings
      const enabledCryptosWithSettings = cryptosWithSettings.filter(
        (crypto): crypto is MicroProcessingCrypto => 
          crypto !== null && crypto.microProcessingSettings?.enabled === true
      );
      
      setEnabledCryptos(enabledCryptosWithSettings);
      
      // Initialize micro processing for each enabled crypto
      enabledCryptosWithSettings.forEach(crypto => {
        initializeMicroProcessing(crypto);
      });
      
      isInitializedRef.current = true;
      
    } catch (err) {
      console.error('Error fetching micro processing cryptos:', err);
      setError('Failed to load micro processing cryptocurrencies');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Handle price updates from WebSocket
  const handlePriceUpdate = useCallback((priceData: any) => {
    if (!isInitializedRef.current) return;
    
    if (!Array.isArray(priceData)) {
      priceData = [priceData];
    }
    
    // Update prices in the micro processing service
    for (const price of priceData) {
      updateMicroProcessingPrice(price.symbol, price.price);
    }
    
    // Update the enabled cryptos state with new prices
    setEnabledCryptos(prevCryptos => {
      const updatedCryptos = [...prevCryptos];
      
      for (const price of priceData) {
        const cryptoIndex = updatedCryptos.findIndex(c => c.symbol === price.symbol);
        
        if (cryptoIndex !== -1) {
          updatedCryptos[cryptoIndex] = {
            ...updatedCryptos[cryptoIndex],
            currentPrice: price.price
          };
        }
      }
      
      return updatedCryptos;
    });
  }, []);

  // Process micro trades
  const processMicroTrades = useCallback(async () => {
    if (!user || isProcessing || !isInitializedRef.current) return;
    
    setIsProcessing(true);
    
    try {
      const result = await processAllMicroProcessingCryptos();
      
      if (result.processed > 0) {
        toast({
          title: "Micro Processing",
          description: `Processed ${result.processed} trades successfully.`,
        });
        
        // Refresh the list of enabled cryptos
        fetchMicroProcessingCryptos();
      }
      
      if (result.errors > 0) {
        toast({
          variant: "destructive",
          title: "Micro Processing Errors",
          description: `Encountered ${result.errors} errors during processing.`,
        });
      }
    } catch (err) {
      console.error('Error processing micro trades:', err);
      setError('Failed to process micro trades');
      
      toast({
        variant: "destructive",
        title: "Micro Processing Error",
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [user, isProcessing, fetchMicroProcessingCryptos, toast]);

  // Initialize data on component mount
  useEffect(() => {
    if (user) {
      fetchMicroProcessingCryptos();
    }
    
    return () => {
      // Clean up interval on unmount
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
    };
  }, [user, fetchMicroProcessingCryptos]);

  // Set up interval to process micro trades
  useEffect(() => {
    if (!user || !isInitializedRef.current) return;
    
    // Clear any existing interval
    if (processingIntervalRef.current) {
      clearInterval(processingIntervalRef.current);
    }
    
    // Set up a new interval to process trades every 5 seconds
    processingIntervalRef.current = setInterval(() => {
      processMicroTrades();
    }, 5000);
    
    return () => {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
    };
  }, [user, processMicroTrades]);

  return {
    enabledCryptos,
    loading,
    error,
    isProcessing,
    refreshCryptos: fetchMicroProcessingCryptos,
    handlePriceUpdate
  };
}