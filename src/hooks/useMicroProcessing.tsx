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
  const { user, token, initializing } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabledCryptos, setEnabledCryptos] = useState<MicroProcessingCrypto[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);

  // Standard request configuration for all API calls
  const standardRequestConfig = useCallback(() => {
    // Log token status for debugging
    console.log('[REQUEST-CONFIG] Preparing request config:', { 
      hasToken: !!token,
      tokenLength: token ? token.length : 0
    });
    
    return {
      method: 'GET',
      credentials: 'include' as RequestCredentials,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Client-Info': 'useMicroProcessing-hook',
        // Always include Authorization header with token if available
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };
  }, [token]);

  // Enhanced retry mechanism for API requests with better error handling
  const fetchWithRetry = useCallback(async (url: string, config = {}, maxRetries = 3, retryDelay = 1000) => {
    // Get the latest config with current auth token
    const currentConfig = standardRequestConfig();
    const mergedConfig = { ...currentConfig, ...config };
    let lastError;
    
    // Add request ID for tracking in logs
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Ensure headers object exists
    if (!mergedConfig.headers) {
      mergedConfig.headers = {};
    }
    
    // Add request ID to headers
    mergedConfig.headers = {
      ...mergedConfig.headers,
      'X-Request-ID': requestId
    };
    
    // Double-check that Authorization header is set if token is available
    if (token && !mergedConfig.headers.Authorization && !mergedConfig.headers.authorization) {
      console.log(`[${requestId}] Adding missing Authorization header with token`);
      mergedConfig.headers.Authorization = `Bearer ${token}`;
    }
    
    // Log the headers being sent (without showing the full token)
    console.log(`[${requestId}] Request headers:`, {
      ...mergedConfig.headers,
      Authorization: mergedConfig.headers.Authorization ? 
        `Bearer ${mergedConfig.headers.Authorization.split(' ')[1]?.substring(0, 5)}...` : 
        (mergedConfig.headers.authorization ? 
          `Bearer ${mergedConfig.headers.authorization.split(' ')[1]?.substring(0, 5)}...` : 
          'Not set')
    });
    
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
    console.log(`[AUTH-CHECK] checkAuthAndFetch called for URL: ${url}`);
    console.log(`[AUTH-CHECK] Authentication state:`, { 
      initializing, 
      hasUser: !!user, 
      userId: user?.id,
      userIdType: user ? typeof user.id : 'N/A',
      hasToken: !!token
    });
    
    if (initializing) {
      console.log('[AUTH-CHECK] Authentication is still initializing, skipping fetch');
      throw new Error('Authentication is initializing');
    }
    
    // More thorough validation of user object
    if (!user) {
      console.log('[AUTH-CHECK] No user object found, skipping fetch');
      router.push('/login'); // Redirect to login if needed
      throw new Error('User not authenticated - no user object');
    }
    
    if (!user.id) {
      console.log('[AUTH-CHECK] User object exists but has no ID, skipping fetch');
      router.push('/login');
      throw new Error('User not authenticated - missing user ID');
    }
    
    if (typeof user.id !== 'string') {
      console.log(`[AUTH-CHECK] User ID is not a string (type: ${typeof user.id}), skipping fetch`);
      router.push('/login');
      throw new Error(`User not authenticated - invalid user ID type: ${typeof user.id}`);
    }
    
    console.log('[AUTH-CHECK] User authenticated, proceeding with fetch', { 
      userId: user.id,
      url: url
    });
    
    // Add timestamp to prevent caching
    const urlWithTimestamp = url.includes('?') 
      ? `${url}&_t=${Date.now()}` 
      : `${url}?_t=${Date.now()}`;
    
    try {
      console.log(`[AUTH-CHECK] Calling fetchWithRetry for ${urlWithTimestamp}`);
      const response = await fetchWithRetry(urlWithTimestamp, config);
      console.log(`[AUTH-CHECK] fetchWithRetry succeeded for ${url}`);
      return response;
    } catch (error) {
      console.error(`[AUTH-CHECK] fetchWithRetry failed for ${url}:`, error);
      
      // Check for 401 Unauthorized errors
      if (error && typeof error === 'object' && 'status' in error && (error as any).status === 401) {
        console.error('[AUTH-CHECK] 401 Unauthorized error detected, redirecting to login');
        router.push('/login');
      }
      
      throw error;
    }
  }, [user, initializing, fetchWithRetry, router]);

  // Fetch cryptos with micro processing settings - consolidated into a single API call
  const fetchMicroProcessingCryptos = useCallback(async () => {
    console.log('[FETCH-CRYPTOS] Starting fetchMicroProcessingCryptos');
    console.log('[FETCH-CRYPTOS] Current auth state:', { 
      initializing, 
      hasUser: !!user, 
      userId: user?.id 
    });
    
    try {
      setLoading(true);
      setError(null); // Clear any previous errors
      
      // Use a single consolidated API endpoint to get cryptos with their enabled settings
      console.log('[FETCH-CRYPTOS] Fetching micro processing settings with includeEnabledCryptos=true');
      
      // Ensure the parameter is explicitly set to a string value
      const url = '/api/cryptos/micro-processing-settings?includeEnabledCryptos=true';
      console.log(`[FETCH-CRYPTOS] Making request to: ${url}`);
      
      // Verify authentication before making the request
      if (!user || !user.id) {
        console.error('[FETCH-CRYPTOS] Cannot fetch cryptos: User not authenticated');
        setError('User not authenticated. Please log in.');
        setLoading(false);
        return;
      }
      
      // Use the checkAuthAndFetch function to ensure we only make the request if authenticated
      console.log('[FETCH-CRYPTOS] Calling checkAuthAndFetch');
      const response = await checkAuthAndFetch(url);
      console.log('[FETCH-CRYPTOS] checkAuthAndFetch returned a response');
      
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
    console.log('[PROCESS-TRADES] processMicroTrades called');
    console.log('[PROCESS-TRADES] Current state:', { 
      isProcessing, 
      isInitialized: isInitializedRef.current,
      hasUser: !!user,
      initializing
    });
    
    if (isProcessing || !isInitializedRef.current) {
      console.log('[PROCESS-TRADES] Skipping micro trades processing', { 
        isProcessing, 
        isInitialized: isInitializedRef.current 
      });
      return;
    }
    
    // Verify user authentication before proceeding
    if (!user || !user.id) {
      console.error('[PROCESS-TRADES] Cannot process trades: User not authenticated');
      return;
    }
    
    setIsProcessing(true);
    console.log('[PROCESS-TRADES] Set isProcessing to true');
    
    try {
      // Check authentication before processing
      console.log('[PROCESS-TRADES] Verifying authentication before processing');
      try {
        // Make a simple auth check request to verify authentication
        console.log('[PROCESS-TRADES] Making auth check request');
        await checkAuthAndFetch('/api/cryptos/micro-processing-settings?checkAuth=true');
        console.log('[PROCESS-TRADES] Auth check request successful');
      } catch (authError) {
        console.error('[PROCESS-TRADES] Authentication check failed:', authError);
        console.log('[PROCESS-TRADES] Skipping micro trades processing due to authentication issue');
        setIsProcessing(false);
        return;
      }
      
      console.log('[PROCESS-TRADES] Calling processAllMicroProcessingCryptos');
      const result = await processAllMicroProcessingCryptos();
      console.log('[PROCESS-TRADES] processAllMicroProcessingCryptos result:', result);
      
      if (result.processed > 0) {
        console.log(`[PROCESS-TRADES] Successfully processed ${result.processed} trades`);
        toast({
          title: "Micro Processing",
          description: `Processed ${result.processed} trades successfully.`,
        });
        
        // Refresh the list of enabled cryptos
        console.log('[PROCESS-TRADES] Refreshing crypto list after successful processing');
        fetchMicroProcessingCryptos();
      } else {
        console.log('[PROCESS-TRADES] No trades were processed');
      }
      
      if (result.errors > 0) {
        console.error(`[PROCESS-TRADES] Encountered ${result.errors} errors during processing`);
        toast({
          variant: "destructive",
          title: "Micro Processing Errors",
          description: `Encountered ${result.errors} errors during processing.`,
        });
      }
    } catch (err) {
      console.error('[PROCESS-TRADES] Error processing micro trades:', err);
      
      // Check for authentication errors
      if (err instanceof Error && (
        err.message.includes('auth') || 
        err.message.includes('unauthorized') || 
        err.message.includes('unauthenticated')
      )) {
        console.error('[PROCESS-TRADES] Authentication error detected:', err.message);
        router.push('/login');
      }
      
      setError('Failed to process micro trades');
      
      toast({
        variant: "destructive",
        title: "Micro Processing Error",
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      console.log('[PROCESS-TRADES] Setting isProcessing back to false');
      setIsProcessing(false);
    }
  }, [user, initializing, isProcessing, fetchMicroProcessingCryptos, toast, checkAuthAndFetch, router]);

  // Initialize data on component mount with improved authentication state handling
  useEffect(() => {
    console.log('[INIT-EFFECT] Initialization useEffect triggered');
    console.log('[INIT-EFFECT] Current auth state:', { 
      initializing, 
      hasUser: !!user, 
      userId: user?.id,
      userIdType: user ? typeof user.id : 'N/A'
    });
    
    let authCheckTimer: NodeJS.Timeout | null = null;
    let retryCount = 0;
    const maxRetries = 5;
    
    // Function to check auth state and fetch data when ready
    const checkAuthAndFetch = () => {
      console.log('[INIT-EFFECT] Running checkAuthAndFetch');
      console.log('[INIT-EFFECT] Current auth state:', { 
        initializing, 
        hasUser: !!user, 
        userId: user?.id,
        retryCount
      });
      
      if (initializing) {
        console.log('[INIT-EFFECT] Authentication is still initializing, waiting...');
        // Set a timer to check again
        authCheckTimer = setTimeout(checkAuthAndFetch, 500);
        return;
      }
      
      if (!user) {
        console.log('[INIT-EFFECT] No authenticated user found after initialization');
        
        // If we've tried several times and still no user, we might need to redirect to login
        if (retryCount >= maxRetries) {
          console.log(`[INIT-EFFECT] Max retries (${maxRetries}) reached without finding user, stopping retries`);
          setError('Authentication failed. Please try logging in again.');
          console.log('[INIT-EFFECT] Redirecting to login page');
          router.push('/login');
          return;
        }
        
        // Try again after a delay with exponential backoff
        retryCount++;
        const delay = Math.min(1000 * Math.pow(1.5, retryCount), 10000); // Max 10 seconds
        console.log(`[INIT-EFFECT] Retry ${retryCount}/${maxRetries} for auth check in ${delay}ms`);
        authCheckTimer = setTimeout(checkAuthAndFetch, delay);
        return;
      }
      
      // Validate user object
      if (!user.id) {
        console.log('[INIT-EFFECT] User object exists but has no ID');
        setError('Invalid user data. Please try logging in again.');
        router.push('/login');
        return;
      }
      
      // Reset retry count if we have a user
      retryCount = 0;
      
      console.log('[INIT-EFFECT] Authentication initialized and user available, fetching data', { 
        userId: user.id,
        userEmail: user.email || 'no email'
      });
      
      // Add a longer delay to ensure supabase client is fully ready
      console.log('[INIT-EFFECT] Adding delay before initial fetch to ensure supabase client is ready');
      setTimeout(() => {
        console.log('[INIT-EFFECT] Delay completed, proceeding with data fetch');
        // Wrap in try/catch to prevent unhandled promise rejections
        try {
          console.log('[INIT-EFFECT] Calling fetchMicroProcessingCryptos');
          fetchMicroProcessingCryptos();
        } catch (error) {
          console.error('[INIT-EFFECT] Error during initial data fetch:', error);
          setError('Failed to load initial data');
        }
      }, 2000); // 2 second delay to ensure supabase client is ready
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