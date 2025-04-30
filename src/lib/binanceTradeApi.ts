import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { autoTradeLogger } from '@/lib/autoTradeLogger';

interface BinanceOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET';  // Only supporting MARKET orders now
  quantity: number;
}

interface BinanceCredentials {
  apiKey: string;
  secretKey: string;
}

/**
 * Get Binance API credentials for a user
 */
export async function getBinanceCredentials(userId: string): Promise<BinanceCredentials | null> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { userId }
    });

    if (!settings) {
      autoTradeLogger.log(`No settings found for user ${userId}`);
      return null;
    }

    if (!settings.binanceApiKey || !settings.binanceApiSecret) {
      autoTradeLogger.log(`Binance API credentials not configured for user ${userId}`);
      return null;
    }

    return {
      apiKey: settings.binanceApiKey,
      secretKey: settings.binanceApiSecret
    };
  } catch (error) {
    autoTradeLogger.log(`Error retrieving Binance credentials: ${error.message}`);
    console.error('Error retrieving Binance credentials:', error);
    return null;
  }
}

/**
 * Generate HMAC SHA256 signature for Binance API
 * 
 * This function creates a signature by hashing the query string with the secret key
 * according to Binance API specifications:
 * 1. Take the query string (e.g., "symbol=BTCUSDT&side=BUY&type=MARKET&quantity=0.01&timestamp=1678886400000")
 * 2. Create an HMAC SHA256 hash using the secret key as the key and the query string as the message
 * 3. Return the hex-encoded hash as the signature
 * 
 * The signature is then appended to the query string as &signature=<hash>
 */
function generateSignature(queryString: string, secretKey: string): string {
  autoTradeLogger.log('Generating signature for Binance API', {
    queryStringLength: queryString.length,
    secretKeyLength: secretKey ? secretKey.length : 0,
    timestamp: new Date().toISOString()
  });
  
  // Log the exact query string being signed (for debugging)
  autoTradeLogger.log('Query string for signature generation', {
    queryString: queryString,
    secretKeyProvided: !!secretKey,
    secretKeyLength: secretKey ? secretKey.length : 0,
    signatureMethod: 'HMAC SHA256 with secret key as key and query string as message',
    timestamp: new Date().toISOString()
  });
  
  return crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('hex');
}

/**
 * Create a new order on Binance
 * 
 * This function formats the request according to Binance API specifications:
 * - Required parameters: symbol, side, type, quantity, timestamp
 * - Signature is generated using HMAC SHA256 on the query string
 * - API key is sent in the X-MBX-APIKEY header
 * - The request URL format is: https://api.binance.us/api/v3/order?symbol=BTCUSDT&side=BUY&type=MARKET&quantity=0.01&timestamp=1678886400000&signature=<signature>
 */
export async function createBinanceOrder(
  userId: string,
  params: BinanceOrderParams,
  testMode: boolean = false,
  useTestEndpoint: boolean = false
): Promise<any> {
  // Generate a request ID for tracking
  const requestId = `binance_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  try {
    // Log function parameters
    autoTradeLogger.log(`[${requestId}] createBinanceOrder FUNCTION PARAMETERS`, {
      userId,
      params: JSON.stringify(params),
      testMode,
      useTestEndpoint,
      timestamp: new Date().toISOString()
    });
    
    // Simplified input validation
    if (!userId) {
      throw new Error('Missing userId parameter');
    }

    if (!params) {
      throw new Error('Missing params object');
    }

    if (!params.symbol) {
      throw new Error('Symbol is required');
    }
    
    if (!params.side || !['BUY', 'SELL'].includes(params.side)) {
      throw new Error('Side must be BUY or SELL');
    }
    
    if (!params.type || params.type !== 'MARKET') {
      throw new Error('Only MARKET orders are supported');
    }
    
    if (!params.quantity || isNaN(params.quantity) || params.quantity <= 0) {
      throw new Error(`Invalid quantity: ${params.quantity}. Must be a positive number.`);
    }

    // Get credentials
    const credentials = await getBinanceCredentials(userId);
    if (!credentials) {
      throw new Error('Binance API credentials not configured');
    }

    // Log credential status (without exposing actual keys)
    autoTradeLogger.log('Binance credentials retrieved', {
      userId,
      hasApiKey: !!credentials.apiKey,
      hasSecretKey: !!credentials.secretKey,
      apiKeyLength: credentials.apiKey ? credentials.apiKey.length : 0,
      secretKeyLength: credentials.secretKey ? credentials.secretKey.length : 0
    });

    // Get settings to retrieve the API URL
    const settings = await prisma.settings.findUnique({
      where: { userId }
    });

    // Use the configured API URL or default to Binance US
    const apiUrl = settings?.binanceTradeApi || 'https://api.binance.us/api/v3/order';
    const baseUrl = apiUrl.split('/api/')[0]; // Extract base URL (e.g., https://api.binance.us)
    const uriPath = apiUrl.substring(baseUrl.length); // Extract URI path (e.g., /api/v3/order)
    
    // Use test endpoint if explicitly requested or in test mode
    let endpoint;
    if (useTestEndpoint || testMode) {
      // Ensure the endpoint ends with '/test'
      endpoint = '/api/v3/order/test';
      console.log('Using test endpoint for Binance API:', endpoint);
    } else {
      endpoint = uriPath;
      console.log('Using production endpoint for Binance API:', endpoint);
    }

    // Prepare request parameters - use current timestamp in milliseconds
    const timestamp = Date.now();
    
    // Build the core parameters object with ONLY the fields required by Binance API
    const coreParams: Record<string, string> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity.toString(),
      timestamp: timestamp.toString()
    };
    
    // Generate the query string in the exact format required by Binance API
    const queryString = Object.entries(coreParams)
      .map(([key, value]) => {
        // Ensure value is never undefined or null before encoding
        const safeValue = value === undefined || value === null ? '' : String(value);
        return `${key}=${encodeURIComponent(safeValue)}`;
      })
      .join('&');
    
    // Generate signature using HMAC SHA256 with the exact query string
    const signature = generateSignature(queryString, credentials.secretKey);
    
    // Create the full URL with query string and signature
    const requestUrl = `${baseUrl}${endpoint}`;
    const fullUrl = `${requestUrl}?${queryString}&signature=${signature}`;
    
    // Log the final request URL (with signature partially masked for security)
    autoTradeLogger.log(`[${requestId}] FINAL BINANCE API REQUEST:`, {
      baseUrl,
      endpoint,
      fullUrl: fullUrl.replace(signature, signature.substring(0, 5) + '...' + signature.substring(signature.length - 5)),
      timestamp: new Date().toISOString()
    });

    let response;
    try {
      // Make the request with the API key in the header as required by Binance
      response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': credentials.apiKey
        }
      });
      
      // Log the response status
      autoTradeLogger.log(`[${requestId}] Binance API response received:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        timestamp: new Date().toISOString()
      });
    } catch (fetchError) {
      // Log network-level errors
      autoTradeLogger.log('Binance API network error', {
        error: fetchError.message,
        stack: fetchError.stack,
        timestamp: new Date().toISOString()
      });
      throw new Error(`Network error when calling Binance API: ${fetchError.message}`);
    }

    // Get response as text first to handle potential JSON parse errors
    let responseText;
    try {
      responseText = await response.text();
    } catch (textError) {
      throw new Error(`Error reading Binance API response: ${textError.message}`);
    }
    
    let responseData;
    try {
      // Try to parse as JSON
      responseData = responseText ? JSON.parse(responseText) : null;
      
      // Add null check for responseData
      if (!responseData) {
        throw new Error('Received null response from Binance API');
      }
    } catch (parseError) {
      throw new Error(`Failed to parse Binance API response: ${responseText ? (responseText.substring(0, 200) + (responseText.length > 200 ? '...' : '')) : 'Empty response'}`);
    }

    // Check for errors
    if (!response.ok) {
      const errorMessage = responseData?.msg || 'Unknown error';
      const errorCode = responseData?.code || 'UNKNOWN';
      
      throw new Error(`Binance API error (${errorCode}): ${errorMessage}`);
    }

    // Log success
    autoTradeLogger.log(`Binance order created successfully`, {
      responseData: JSON.stringify(responseData),
      timestamp: new Date().toISOString()
    });

    return responseData;
  } catch (error) {
    // Comprehensive error logging with request details
    autoTradeLogger.log(`[${requestId}] Error creating Binance order: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    console.error(`[${requestId}] Error creating Binance order:`, error);
    throw error;
  }
}

/**
 * Format crypto symbol for Binance API
 * Removes any special characters and ensures proper format (e.g., BTC/USD -> BTCUSDT)
 */
export function formatBinanceSymbol(symbol: string): string {
  // Remove any special characters and convert to uppercase
  const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  
  // If the symbol doesn't end with USDT, append it
  if (!cleanSymbol.endsWith('USDT')) {
    return `${cleanSymbol}USDT`;
  }
  
  return cleanSymbol;
}

/**
 * Execute a Binance market order
 * 
 * This function provides a simplified interface for executing Binance market orders.
 * It handles both buy and sell orders with consistent parameter handling.
 * 
 * @param userId - The user ID for retrieving API credentials
 * @param symbol - The trading symbol (e.g., "BTC", "ETH", "BTCUSDT")
 * @param side - The order side: "BUY" or "SELL"
 * @param quantity - The order quantity
 * @param testMode - Whether to use test mode (no actual trades)
 * @param useTestEndpoint - Whether to use the test endpoint (/api/v3/order/test)
 * @returns Promise with the API response
 */
export async function executeBinanceOrder(
  userId: string,
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  testMode: boolean = false,
  useTestEndpoint: boolean = false
): Promise<{ result: any, requestDetails: any }> {
  // Format the symbol for Binance API
  const formattedSymbol = formatBinanceSymbol(symbol);
  
  // Build the order parameters
  const orderParams: BinanceOrderParams = {
    symbol: formattedSymbol,
    side,
    type: 'MARKET',
    quantity
  };
  
  // Get settings to retrieve the API URL
  const settings = await prisma.settings.findUnique({
    where: { userId }
  });

  // Use the configured API URL or default to Binance US
  const apiUrl = settings?.binanceTradeApi || 'https://api.binance.us/api/v3/order';
  const baseUrl = apiUrl.split('/api/')[0]; // Extract base URL (e.g., https://api.binance.us)
  
  // Use test endpoint if explicitly requested or in test mode
  let endpoint;
  if (useTestEndpoint || testMode) {
    // Ensure the endpoint ends with '/test'
    endpoint = '/api/v3/order/test';
  } else {
    endpoint = '/api/v3/order';
  }
  
  // Prepare timestamp
  const timestamp = Date.now();
  
  // Build the core parameters object with ONLY the fields required by Binance API
  const coreParams: Record<string, string> = {
    symbol: formattedSymbol,
    side,
    type: 'MARKET',
    quantity: quantity.toString(),
    timestamp: timestamp.toString()
  };
  
  // Generate the query string in the exact format required by Binance API
  const queryString = Object.entries(coreParams)
    .map(([key, value]) => {
      const safeValue = value === undefined || value === null ? '' : String(value);
      return `${key}=${encodeURIComponent(safeValue)}`;
    })
    .join('&');
  
  // Create the full URL with query string (signature will be added by createBinanceOrder)
  const requestUrl = `${baseUrl}${endpoint}`;
  const fullUrl = `${requestUrl}?${queryString}&signature=[signature]`;
  
  // Create request details to return to client
  const requestDetails = {
    url: requestUrl,
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': '[Your API Key]'
    },
    queryString,
    fullUrl
  };
  
  // Execute the order using createBinanceOrder
  const result = await createBinanceOrder(
    userId,
    orderParams,
    testMode,
    useTestEndpoint
  );
  
  return {
    result,
    requestDetails
  };
}