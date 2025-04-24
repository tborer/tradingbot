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
      const response = await fetch('/api/cryptos', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch cryptos');
      }
      
      const cryptos = await response.json();
      
      // Only fetch enabled micro processing settings
      // This is a separate API call to avoid fetching settings for all cryptos
      let enabledSettings = [];
      try {
        console.log('Fetching enabled micro processing settings...');
        const enabledSettingsResponse = await fetch('/api/cryptos/process-micro-processing?fetchOnly=true', {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          // Add cache control to prevent caching issues
          cache: 'no-store',
          // Include credentials to send cookies for authentication
          credentials: 'include'
        });
        
        console.log(`Enabled settings response status: ${enabledSettingsResponse.status}`);
        
        if (!enabledSettingsResponse.ok) {
          // Try to get more detailed error information
          let errorMessage = 'Failed to fetch enabled micro processing settings';
          try {
            const contentType = enabledSettingsResponse.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errorData = await enabledSettingsResponse.json();
              errorMessage = errorData.error || errorData.details || errorMessage;
              console.error("API error details:", errorData);
            }
          } catch (parseError) {
            console.error("Could not parse error response:", parseError);
          }
          
          throw new Error(errorMessage);
        }
        
        // Parse the response as JSON
        const responseText = await enabledSettingsResponse.text();
        console.log('Raw response text:', responseText);
        
        try {
          enabledSettings = JSON.parse(responseText);
          console.log(`Received ${enabledSettings.length} enabled settings`);
        } catch (parseError) {
          console.error(`Error parsing JSON response: ${parseError}`);
          console.error(`Response was: ${responseText}`);
          throw new Error(`Invalid JSON response: ${parseError.message}`);
        }
      } catch (settingsError) {
        console.error('Error fetching enabled settings:', settingsError);
        // Continue with empty settings rather than failing completely
        toast({
          variant: "destructive",
          title: "Warning",
          description: `Could not fetch micro processing settings: ${settingsError.message}`,
        });
      }
      
      // Map the enabled settings to their respective cryptos
      const cryptosWithSettings = cryptos
        .map((crypto: any) => {
          const settings = enabledSettings.find((s: any) => s.cryptoId === crypto.id);
          
          // Only include cryptos with enabled settings
          if (settings && settings.enabled) {
            // Log the settings and crypto for debugging
            console.log("Mapping crypto to settings:", {
              cryptoId: crypto.id,
              symbol: crypto.symbol,
              settingsId: settings.id,
              settingsCryptoId: settings.cryptoId,
              settingsCrypto: settings.crypto // This should contain the crypto relationship
            });
            
            return {
              ...crypto,
              currentPrice: crypto.lastPrice || crypto.currentPrice,
              microProcessingSettings: {
                ...settings,
                crypto: settings.crypto || crypto // Ensure crypto is included in the settings
              }
            };
          }
          return null;
        })
        .filter(Boolean);
      
      setEnabledCryptos(cryptosWithSettings);
      
      // Initialize micro processing for each enabled crypto
      cryptosWithSettings.forEach((crypto: MicroProcessingCrypto) => {
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