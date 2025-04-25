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
  const standardRequestConfig = useCallback(() => ({
    method: 'GET',
    credentials: 'include' as RequestCredentials,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Client-Info': 'useMicroProcessing-hook',
      // Add auth token if it's not being included via credentials
      ...(user?.token ? { 'Authorization': `Bearer ${user.token}` } : {})
    }
  }), [user]);

  // Enhanced retry mechanism for API requests with better error handling
  const fetchWithRetry = useCallback(async (url: string, config = {}, maxRetries = 3, retryDelay = 1000) => {
    // Get the latest config with current auth token
    const currentConfig = standardRequestConfig();
    const mergedConfig = { ...currentConfig, ...config };
    let lastError;
    
    // Add request ID for tracking in logs
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    mergedConfig.headers = {
      ...mergedConfig.headers,
      'X-Request-ID': requestId
    };
    
    console.log(`[${requestId}] Starting request to ${url}`);
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Calculate backoff delay with jitter to prevent thundering herd
          const jitter = Math.random() * 0.3 * retryDelay;
          const backoffDelay = retryDelay * Math.pow(1.5, attempt - 1) + jitter;
          console.log(`[${requestId}] Retry attempt ${attempt + 1}/${maxRetries} for ${url} after ${backoffDelay.toFixed(0)}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
        
        // Add attempt number to headers for debugging
        const attemptConfig = {
          ...mergedConfig,
          headers: {
            ...mergedConfig.headers,
            'X-Attempt-Number': `${attempt + 1}`
          }
        };
        
        console.log(`[${requestId}] Sending request (attempt ${attempt + 1}/${maxRetries})`);
        const response = await fetch(url, attemptConfig);
        
        if (!response.ok) {
          // Try to get more detailed error information
          let errorMessage = `Request failed with status ${response.status}`;
          let errorDetails = {};
          
          try {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errorData = await response.json();
              errorMessage = errorData.error || errorData.details || errorMessage;
              errorDetails = errorData;
              console.error(`[${requestId}] API error details:`, errorData);
            } else {
              // Try to get text response for non-JSON errors
              const textResponse = await response.text();
              console.error(`[${requestId}] Non-JSON error response:`, textResponse.substring(0, 200));
            }
          } catch (parseError) {
            console.error(`[${requestId}] Could not parse error response:`, parseError);
          }
          
          // Create a detailed error object
          const responseError = new Error(errorMessage);
          (responseError as any).status = response.status;
          (responseError as any).details = errorDetails;
          (responseError as any).requestId = requestId;
          
          throw responseError;
        }
        
        console.log(`[${requestId}] Request successful`);
        return response;
      } catch (error: any) {
        console.error(`[${requestId}] Attempt ${attempt + 1} failed:`, error);
        lastError = error;
        
        // If this is the last attempt, prepare a more detailed error
        if (attempt === maxRetries - 1) {
          const detailedError = new Error(`Failed to fetch after ${maxRetries} attempts: ${error.message || 'Unknown error'}`);
          detailedError.stack = error.stack;
          (detailedError as any).originalError = error;
          (detailedError as any).requestId = requestId;
          lastError = detailedError;
        }
      }
    }
    
    console.error(`[${requestId}] All ${maxRetries} attempts failed`);
    throw lastError;
  }, [standardRequestConfig]);

  // Check authentication before making API calls
  const checkAuthAndFetch = useCallback(async (url: string, config = {}) => {
    if (initializing) {
      console.log('Authentication is still initializing, skipping fetch');
      throw new Error('Authentication is initializing');
    }
    
    // More thorough validation of user object
    if (!user || !user.id || typeof user.id !== 'string') {
      console.log('User not properly authenticated, skipping fetch');
      router.push('/login'); // Redirect to login if needed
      throw new Error('User not authenticated');
    }
    
    console.log('User authenticated, proceeding with fetch', { userId: user.id });
    
    // Add timestamp to prevent caching
    const urlWithTimestamp = url.includes('?') 
      ? `${url}&_t=${Date.now()}` 
      : `${url}?_t=${Date.now()}`;
    
    return fetchWithRetry(urlWithTimestamp, config);
  }, [user, initializing, fetchWithRetry, router]);

  // Fetch cryptos with micro processing settings - consolidated into a single API call
  const fetchMicroProcessingCryptos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null); // Clear any previous errors
      
      // Use a single consolidated API endpoint to get cryptos with their enabled settings
      console.log('Fetching micro processing settings with includeEnabledCryptos=true');
      
      // Ensure the parameter is explicitly set to a string value
      const url = '/api/cryptos/micro-processing-settings?includeEnabledCryptos=true';
      console.log(`Making request to: ${url}`);
      
      // Use the checkAuthAndFetch function to ensure we only make the request if authenticated
      const response = await checkAuthAndFetch(url);
      
      // Validate response before parsing JSON
      if (!response) {
        throw new Error('No response received from server');
      }
      
      // Parse the JSON response with error handling
      let data;
      try {
        const text = await response.text();
        console.log('Raw response text:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
        
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          console.error('Invalid JSON response:', text);
          throw new Error('Failed to parse server response: Invalid JSON');
        }
      } catch (jsonError) {
        console.error('Error processing response:', jsonError);
        throw new Error(`Failed to process server response: ${jsonError.message}`);
      }
      
      // Validate the data structure with fallback to empty array
      if (!data) {
        console.warn('Received null or undefined data from server, using empty array');
        data = [];
      }
      
      if (!Array.isArray(data)) {
        console.error('Expected array but received:', typeof data);
        console.error('Data content:', JSON.stringify(data).substring(0, 200));
        // Fallback to empty array instead of throwing
        console.warn('Using empty array as fallback');
        data = [];
      }
      
      console.log(`Received ${data.length} cryptos with micro processing settings`);
      
      // Process the data with additional validation
      const cryptosWithSettings = data.filter((item: any) => {
        if (!item || typeof item !== 'object') {
          console.warn('Invalid item in response:', item);
          return false;
        }
        
        // Check if item has required fields
        if (!item.id || !item.symbol) {
          console.warn('Item missing required fields:', item);
          return false;
        }
        
        // Check if microProcessingSettings exists and is an object
        if (!item.microProcessingSettings || typeof item.microProcessingSettings !== 'object') {
          console.warn(`Item ${item.symbol} (${item.id}) missing microProcessingSettings or invalid format`);
          return false;
        }
        
        // Check if enabled is true
        const isEnabled = item.microProcessingSettings.enabled === true;
        console.log(`Crypto ${item.symbol} (${item.id}) enabled status: ${isEnabled}`);
        return isEnabled;
      });
      
      console.log(`Found ${cryptosWithSettings.length} enabled cryptos for micro processing`);
      
      setEnabledCryptos(cryptosWithSettings);
      
      // Initialize micro processing for each enabled crypto
      cryptosWithSettings.forEach((crypto: MicroProcessingCrypto) => {
        try {
          // Validate crypto object before initialization
          if (!crypto || !crypto.id || !crypto.symbol) {
            console.warn('Skipping invalid crypto object:', crypto);
            return;
          }
          
          initializeMicroProcessing(crypto);
        } catch (initError) {
          console.error(`Failed to initialize micro processing for ${crypto?.symbol || 'unknown'}:`, initError);
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
  }, [user, initializing, toast, fetchWithRetry, checkAuthAndFetch]);

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
    if (isProcessing || !isInitializedRef.current) {
      console.log('Skipping micro trades processing', { 
        isProcessing, 
        isInitialized: isInitializedRef.current 
      });
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // Check authentication before processing
      try {
        // Make a simple auth check request to verify authentication
        await checkAuthAndFetch('/api/cryptos/micro-processing-settings?checkAuth=true');
      } catch (authError) {
        console.log('Skipping micro trades processing due to authentication issue:', authError.message);
        setIsProcessing(false);
        return;
      }
      
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
  }, [user, initializing, isProcessing, fetchMicroProcessingCryptos, toast, checkAuthAndFetch]);

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
          router.push('/login');
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
      
      // Add a small delay to ensure supabase client is fully ready
      console.log('Adding delay before initial fetch to ensure supabase client is ready');
      setTimeout(() => {
        // Wrap in try/catch to prevent unhandled promise rejections
        try {
          fetchMicroProcessingCryptos();
        } catch (error) {
          console.error('Error during initial data fetch:', error);
          setError('Failed to load initial data');
        }
      }, 1000); // 1 second delay to ensure supabase client is ready
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
      // Only process if we have a user and initialization is complete
      if (user && !initializing && isInitializedRef.current) {
        processMicroTrades();
      } else {
        console.log('Skipping scheduled micro processing due to auth state', {
          hasUser: !!user,
          initializing,
          isInitialized: isInitializedRef.current
        });
      }
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