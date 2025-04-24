import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';
import { useToast } from '@/components/ui/use-toast';
import { 
  initializeMicroProcessing, 
  updateMicroProcessingPrice, 
  processAllMicroProcessingCryptos,
  MicroProcessingCrypto
} from '@/lib/clientMicroProcessingService';

export function useMicroProcessing() {
  const { user, initializing } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabledCryptos, setEnabledCryptos] = useState<MicroProcessingCrypto[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);

  // Standard request configuration for all API calls
  const standardRequestConfig = {
    method: 'GET',
    credentials: 'include' as RequestCredentials,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  };

  // Retry mechanism for API requests during authentication transitions
  const fetchWithRetry = useCallback(async (url: string, config = {}, maxRetries = 3, retryDelay = 1000) => {
    const mergedConfig = { ...standardRequestConfig, ...config };
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`Retry attempt ${attempt + 1}/${maxRetries} for ${url}`);
        }
        
        const response = await fetch(url, mergedConfig);
        
        if (!response.ok) {
          // Try to get more detailed error information
          let errorMessage = `Request failed with status ${response.status}`;
          try {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errorData = await response.json();
              errorMessage = errorData.error || errorData.details || errorMessage;
              console.error("API error details:", errorData);
            }
          } catch (parseError) {
            console.error("Could not parse error response:", parseError);
          }
          
          throw new Error(errorMessage);
        }
        
        return response;
      } catch (error: any) {
        console.error(`Attempt ${attempt + 1} failed:`, error);
        lastError = error;
        
        // If this is an authentication error and we're still initializing, wait longer
        if (initializing && error.message && error.message.includes('Unauthorized')) {
          console.log('Authentication still initializing, waiting longer before retry...');
          await new Promise(resolve => setTimeout(resolve, retryDelay * 2));
        } else {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
        
        // If this is the last attempt, prepare a more detailed error
        if (attempt === maxRetries - 1) {
          const detailedError = new Error(`Failed to fetch after ${maxRetries} attempts: ${error.message || 'Unknown error'}`);
          detailedError.stack = error.stack;
          lastError = detailedError;
        }
      }
    }
    
    throw lastError;
  }, [initializing]);

  // Fetch cryptos with micro processing settings - consolidated into a single API call
  const fetchMicroProcessingCryptos = useCallback(async () => {
    if (initializing) {
      console.log('Authentication is still initializing, skipping fetch');
      return;
    }
    
    if (!user) {
      console.log('User not authenticated, skipping fetch');
      return;
    }
    
    console.log('User authenticated, proceeding with fetch', { userId: user.id });
    
    try {
      setLoading(true);
      setError(null); // Clear any previous errors
      
      // Use a single consolidated API endpoint to get cryptos with their enabled settings
      console.log('Fetching micro processing settings with includeEnabledCryptos=true');
      const response = await fetchWithRetry('/api/cryptos/micro-processing-settings?includeEnabledCryptos=true');
      
      // Validate response before parsing JSON
      if (!response) {
        throw new Error('No response received from server');
      }
      
      // Parse the JSON response with error handling
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Error parsing JSON response:', jsonError);
        throw new Error('Failed to parse server response');
      }
      
      // Validate the data structure
      if (!Array.isArray(data)) {
        console.error('Expected array but received:', typeof data, data);
        throw new Error('Invalid data format received from server');
      }
      
      console.log(`Received ${data.length} cryptos with micro processing settings`);
      
      // Process the data with additional validation
      const cryptosWithSettings = data.filter((item: any) => {
        if (!item || typeof item !== 'object') {
          console.warn('Invalid item in response:', item);
          return false;
        }
        return item.microProcessingSettings && item.microProcessingSettings.enabled;
      });
      
      console.log(`Found ${cryptosWithSettings.length} enabled cryptos for micro processing`);
      
      setEnabledCryptos(cryptosWithSettings);
      
      // Initialize micro processing for each enabled crypto
      cryptosWithSettings.forEach((crypto: MicroProcessingCrypto) => {
        try {
          initializeMicroProcessing(crypto);
        } catch (initError) {
          console.error(`Failed to initialize micro processing for ${crypto.symbol}:`, initError);
          // Continue with other cryptos even if one fails
        }
      });
      
      isInitializedRef.current = true;
      
    } catch (err: any) {
      console.error('Error fetching micro processing cryptos:', err);
      setError(`Failed to load micro processing cryptocurrencies: ${err.message || 'Unknown error'}`);
      
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to load micro processing settings: ${err.message || 'Unknown error'}`,
      });
    } finally {
      setLoading(false);
    }
  }, [user, initializing, toast, fetchWithRetry]);

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
    if (initializing || !user || isProcessing || !isInitializedRef.current) {
      console.log('Skipping micro trades processing', { 
        initializing, 
        userAuthenticated: !!user, 
        isProcessing, 
        isInitialized: isInitializedRef.current 
      });
      return;
    }
    
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
  }, [user, initializing, isProcessing, fetchMicroProcessingCryptos, toast]);

  // Initialize data on component mount with improved authentication state handling
  useEffect(() => {
    let authCheckTimer: NodeJS.Timeout | null = null;
    let retryCount = 0;
    const maxRetries = 5;
    
    // Function to check auth state and fetch data when ready
    const checkAuthAndFetch = () => {
      if (initializing) {
        console.log('Authentication is still initializing, waiting...');
        // Set a timer to check again
        authCheckTimer = setTimeout(checkAuthAndFetch, 500);
        return;
      }
      
      if (!user) {
        console.log('No authenticated user found after initialization');
        
        // If we've tried several times and still no user, we might need to redirect to login
        if (retryCount >= maxRetries) {
          console.log(`Max retries (${maxRetries}) reached without finding user, stopping retries`);
          setError('Authentication failed. Please try logging in again.');
          return;
        }
        
        // Try again after a delay with exponential backoff
        retryCount++;
        const delay = Math.min(1000 * Math.pow(1.5, retryCount), 10000); // Max 10 seconds
        console.log(`Retry ${retryCount}/${maxRetries} for auth check in ${delay}ms`);
        authCheckTimer = setTimeout(checkAuthAndFetch, delay);
        return;
      }
      
      // Reset retry count if we have a user
      retryCount = 0;
      
      console.log('Authentication initialized and user available, fetching data', { userId: user.id });
      
      // Wrap in try/catch to prevent unhandled promise rejections
      try {
        fetchMicroProcessingCryptos();
      } catch (error) {
        console.error('Error during initial data fetch:', error);
        setError('Failed to load initial data');
      }
    };
    
    // Start the auth check process
    checkAuthAndFetch();
    
    return () => {
      // Clean up timers and intervals on unmount
      if (authCheckTimer) {
        clearTimeout(authCheckTimer);
      }
      
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
    };
  }, [user, initializing, fetchMicroProcessingCryptos]);

  // Set up interval to process micro trades
  useEffect(() => {
    if (initializing || !user || !isInitializedRef.current) return;
    
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