import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';
import { useToast } from '@/components/ui/use-toast';
import { useErrorLog } from '@/contexts/ErrorLogContext';
import { ErrorCategory } from '@/lib/errorLogger';
import { 
  initializeMicroProcessing, 
  updateMicroProcessingPrice, 
  processAllMicroProcessingCryptos,
  MicroProcessingCrypto
} from '@/lib/clientMicroProcessingService';

export function useMicroProcessing() {
  const { user, token, initializing } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { captureError, isEnabled: errorLoggingEnabled } = useErrorLog();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabledCryptos, setEnabledCryptos] = useState<MicroProcessingCrypto[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);

  // Simplified fetch function with authentication
  const fetchWithAuth = useCallback(async (url: string, options = {}) => {
    // Add timestamp to prevent caching
    const urlWithTimestamp = url.includes('?') 
      ? `${url}&_t=${Date.now()}` 
      : `${url}?_t=${Date.now()}`;
    
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const defaultOptions = {
      method: 'GET',
      credentials: 'include' as RequestCredentials,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Request-ID': requestId,
        'X-Client-Info': 'useMicroProcessing-hook',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    console.log(`[${requestId}] Fetching ${urlWithTimestamp}`);
    
    try {
      const response = await fetch(urlWithTimestamp, mergedOptions);
      
      if (!response.ok) {
        // Handle 401 Unauthorized
        if (response.status === 401) {
          console.error(`[${requestId}] Authentication failed (401)`);
          router.push('/login');
          throw new Error('Authentication failed');
        }
        
        // Try to get error details from response
        let errorMessage = `Request failed with status ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.details || errorMessage;
          throw new Error(errorMessage);
        } catch (parseError) {
          throw new Error(errorMessage);
        }
      }
      
      return response;
    } catch (error) {
      console.error(`[${requestId}] Fetch error:`, error);
      throw error;
    }
  }, [token, router]);

  // Fetch cryptos with micro processing settings
  const fetchMicroProcessingCryptos = useCallback(async () => {
    console.log('[FETCH-CRYPTOS] Starting fetchMicroProcessingCryptos');
    
    if (!user || initializing) {
      console.log('[FETCH-CRYPTOS] User not authenticated or auth initializing, skipping fetch');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const url = '/api/cryptos/micro-processing-settings?includeEnabledCryptos=true';
      console.log(`[FETCH-CRYPTOS] Making request to: ${url}`);
      
      const response = await fetchWithAuth(url);
      const data = await response.json();
      
      // Validate the data structure
      if (!Array.isArray(data)) {
        console.error('[FETCH-CRYPTOS] Expected array but received:', typeof data);
        setEnabledCryptos([]);
        return;
      }
      
      console.log(`[FETCH-CRYPTOS] Received ${data.length} cryptos with settings`);
      
      // Filter enabled cryptos
      const enabledCryptosData = data.filter((item: any) => 
        item && 
        item.microProcessingSettings && 
        item.microProcessingSettings.enabled === true
      );
      
      console.log(`[FETCH-CRYPTOS] Found ${enabledCryptosData.length} enabled cryptos`);
      
      setEnabledCryptos(enabledCryptosData);
      
      // Initialize micro processing for each enabled crypto
      enabledCryptosData.forEach((crypto: MicroProcessingCrypto) => {
        try {
          initializeMicroProcessing(crypto);
        } catch (initError) {
          console.error(`[FETCH-CRYPTOS] Failed to initialize for ${crypto?.symbol}:`, initError);
        }
      });
      
      isInitializedRef.current = true;
      
    } catch (err: any) {
      console.error('[FETCH-CRYPTOS] Error:', err);
      setError(`Failed to load micro processing cryptocurrencies: ${err.message || 'Unknown error'}`);
      
      if (errorLoggingEnabled) {
        captureError(err, ErrorCategory.API, {
          action: 'fetchMicroProcessingCryptos',
          userId: user?.id
        });
      }
      
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to load micro processing settings: ${err.message || 'Unknown error'}`,
      });
    } finally {
      setLoading(false);
    }
  }, [user, initializing, toast, fetchWithAuth, errorLoggingEnabled, captureError]);

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
    console.log('[PROCESS-TRADES] processMicroTrades called');
    
    if (isProcessing || !isInitializedRef.current || !user || initializing) {
      console.log('[PROCESS-TRADES] Skipping processing', { 
        isProcessing, 
        isInitialized: isInitializedRef.current,
        hasUser: !!user,
        initializing
      });
      return;
    }
    
    setIsProcessing(true);
    
    try {
      console.log('[PROCESS-TRADES] Calling processAllMicroProcessingCryptos');
      const result = await processAllMicroProcessingCryptos();
      
      if (!result) {
        throw new Error('Micro processing returned null result');
      }
      
      if (result.processed > 0) {
        console.log(`[PROCESS-TRADES] Successfully processed ${result.processed} trades`);
        toast({
          title: "Micro Processing",
          description: `Processed ${result.processed} trades successfully.`,
        });
        
        // Refresh the list of enabled cryptos
        fetchMicroProcessingCryptos();
      }
      
      if (result.errors > 0) {
        console.error(`[PROCESS-TRADES] Encountered ${result.errors} errors`);
        toast({
          variant: "destructive",
          title: "Micro Processing Errors",
          description: `Encountered ${result.errors} errors during processing.`,
        });
      }
    } catch (err) {
      console.error('[PROCESS-TRADES] Error:', err);
      
      if (errorLoggingEnabled) {
        captureError(err, ErrorCategory.API, {
          action: 'processMicroTrades',
          userId: user?.id
        });
      }
      
      setError('Failed to process micro trades');
      
      toast({
        variant: "destructive",
        title: "Micro Processing Error",
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [user, initializing, isProcessing, fetchMicroProcessingCryptos, toast, errorLoggingEnabled, captureError]);

  // Initialize data on component mount
  useEffect(() => {
    console.log('[INIT-EFFECT] Initialization effect triggered');
    
    if (initializing) {
      console.log('[INIT-EFFECT] Authentication is initializing, waiting...');
      return;
    }
    
    if (!user) {
      console.log('[INIT-EFFECT] No authenticated user, redirecting to login');
      router.push('/login');
      return;
    }
    
    console.log('[INIT-EFFECT] User authenticated, fetching data');
    fetchMicroProcessingCryptos();
    
    return () => {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
    };
  }, [user, initializing, fetchMicroProcessingCryptos, router]);

  // Set up interval to process micro trades
  useEffect(() => {
    if (initializing || !user || !isInitializedRef.current) return;
    
    // Clear any existing interval
    if (processingIntervalRef.current) {
      clearInterval(processingIntervalRef.current);
    }
    
    // Set up a new interval to process trades every 5 seconds
    processingIntervalRef.current = setInterval(processMicroTrades, 5000);
    
    return () => {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
    };
  }, [user, initializing, processMicroTrades]);

  return {
    enabledCryptos,
    loading,
    error,
    isProcessing,
    refreshCryptos: fetchMicroProcessingCryptos,
    handlePriceUpdate
  };
}