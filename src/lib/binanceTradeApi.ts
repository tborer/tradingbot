import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { autoTradeLogger } from '@/lib/autoTradeLogger';

interface BinanceOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  newClientOrderId?: string;
  newOrderRespType?: 'ACK' | 'RESULT' | 'FULL';
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
 */
function generateSignature(queryString: string, secretKey: string): string {
  return crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('hex');
}

/**
 * Create a new order on Binance
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
    // DETAILED LOGGING: Function Parameters - Log all parameters received by the function
    autoTradeLogger.log(`[${requestId}] createBinanceOrder FUNCTION PARAMETERS`, {
      userId,
      params: JSON.stringify(params),
      paramsObject: params, // Log the actual object for better inspection
      testMode,
      useTestEndpoint,
      timestamp: new Date().toISOString()
    });
    
    // Log values to console for debugging
    console.log(`[${requestId}] createBinanceOrder debug values:`, {
      userId,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
      timestamp: new Date().toISOString()
    });

    // Comprehensive input validation
    if (!userId) {
      const error = new Error('Missing userId parameter');
      autoTradeLogger.log(`[${requestId}] Validation error in createBinanceOrder: Missing userId`, { 
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }

    if (!params) {
      const error = new Error('Missing params object');
      autoTradeLogger.log(`[${requestId}] Validation error in createBinanceOrder: Missing params`, { 
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }

    // Validate all required parameters
    const requiredParams = ['symbol', 'side', 'type'];
    for (const param of requiredParams) {
      if (!params[param]) {
        const error = new Error(`Missing required parameter: ${param}`);
        autoTradeLogger.log(`[${requestId}] Validation error in createBinanceOrder: Missing ${param}`, { 
          params: JSON.stringify(params),
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    }
    
    // Validate quantity
    if (!params.quantity || isNaN(params.quantity) || params.quantity <= 0) {
      const error = new Error(`Invalid quantity parameter: ${params.quantity}`);
      autoTradeLogger.log(`[${requestId}] Validation error in createBinanceOrder: Invalid quantity`, { 
        quantity: params.quantity,
        quantityType: typeof params.quantity,
        isNaN: isNaN(params.quantity),
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    // Validate price for LIMIT orders
    if (params.type === 'LIMIT' && (!params.price || isNaN(params.price) || params.price <= 0)) {
      const error = new Error(`Invalid price parameter for LIMIT order: ${params.price}`);
      autoTradeLogger.log(`[${requestId}] Validation error in createBinanceOrder: Invalid price for LIMIT order`, { 
        price: params.price,
        priceType: typeof params.price,
        isNaN: isNaN(params.price),
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }

    // Get credentials
    const credentials = await getBinanceCredentials(userId);
    if (!credentials) {
      const error = new Error('Binance API credentials not configured');
      autoTradeLogger.log('Credentials error in createBinanceOrder', { 
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
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
    const endpoint = useTestEndpoint 
      ? '/api/v3/order/test' 
      : (testMode ? uriPath.replace('/order', '/order/test') : uriPath);

    // Log API URL configuration
    autoTradeLogger.log('Binance API URL configuration', {
      configuredApiUrl: settings?.binanceTradeApi || 'Not configured, using default',
      baseUrl,
      uriPath,
      endpoint,
      finalEndpoint: endpoint,
      testMode,
      useTestEndpoint
    });

    // Prepare request parameters
    const timestamp = Date.now();

    // Build data object with detailed validation
    let data: Record<string, string> = {};
    
    // Log all parameters before building data object
    console.log(`[${requestId}] Building data object with parameters:`, {
      symbol: params.symbol,
      symbolType: typeof params.symbol,
      symbolIsNull: params.symbol === null,
      symbolIsUndefined: params.symbol === undefined,
      
      side: params.side,
      sideType: typeof params.side,
      sideIsNull: params.side === null,
      sideIsUndefined: params.side === undefined,
      
      type: params.type,
      typeType: typeof params.type,
      typeIsNull: params.type === null,
      typeIsUndefined: params.type === undefined,
      
      quantity: params.quantity,
      quantityType: typeof params.quantity,
      quantityIsNull: params.quantity === null,
      quantityIsUndefined: params.quantity === undefined,
      quantityIsNaN: isNaN(params.quantity),
      
      timestamp: timestamp,
      timestampType: typeof timestamp
    });
    
    // Add required fields with validation
    if (!params.symbol) {
      throw new Error('Symbol is required and cannot be null or undefined');
    }
    data.symbol = params.symbol;
    
    if (!params.side) {
      throw new Error('Side is required and cannot be null or undefined');
    }
    data.side = params.side;
    
    if (!params.type) {
      throw new Error('Type is required and cannot be null or undefined');
    }
    data.type = params.type;
    
    // Always add timestamp and recvWindow
    data.timestamp = timestamp.toString();
    data.recvWindow = '5000'; // Add a 5-second receive window to prevent timestamp issues
    
    // Add quantity with validation
    if (params.quantity === undefined || params.quantity === null) {
      throw new Error('Quantity is required and cannot be null or undefined');
    }
    
    if (isNaN(params.quantity) || params.quantity <= 0) {
      throw new Error(`Invalid quantity: ${params.quantity}. Must be a positive number.`);
    }
    
    // DETAILED LOGGING: quantity Details - Log the quantity variable's type and whether it's NaN
    autoTradeLogger.log(`[${requestId}] QUANTITY DETAILS before conversion`, {
      quantity: params.quantity,
      quantityType: typeof params.quantity,
      quantityIsNaN: isNaN(params.quantity),
      quantityToString: String(params.quantity),
      quantityParseFloat: parseFloat(String(params.quantity)),
      quantityParseFloatIsNaN: isNaN(parseFloat(String(params.quantity))),
      timestamp: new Date().toISOString()
    });
    
    data.quantity = params.quantity.toString();
    
    // Log the data object after building
    console.log(`[${requestId}] Built data object:`, {
      dataKeys: Object.keys(data),
      dataValues: Object.values(data),
      dataEntries: Object.entries(data)
    });

    // Add optional parameters if provided
    if (params.price) {
      data.price = params.price.toString();
    }

    if (params.timeInForce) {
      data.timeInForce = params.timeInForce;
    }

    if (params.newClientOrderId) {
      data.newClientOrderId = params.newClientOrderId;
    }

    if (params.newOrderRespType) {
      data.newOrderRespType = params.newOrderRespType;
    }

    // Log the constructed data object
    autoTradeLogger.log('Binance request data constructed', {
      data: JSON.stringify(data),
      hasSymbol: !!data.symbol,
      symbolValue: data.symbol,
      hasSide: !!data.side,
      sideValue: data.side,
      hasType: !!data.type,
      typeValue: data.type,
      hasQuantity: !!data.quantity,
      quantityValue: data.quantity,
      hasTimestamp: !!data.timestamp,
      timestampValue: data.timestamp
    });

    // Log detailed information about quantity right before using it
    console.log(`[${requestId}] Quantity variable details before generating query string:`, {
      quantity: params.quantity,
      quantityType: typeof params.quantity,
      quantityIsNaN: isNaN(params.quantity),
      quantityToString: params.quantity?.toString(),
      dataQuantity: data.quantity,
      dataQuantityType: typeof data.quantity,
      dataQuantityIsNaN: isNaN(Number(data.quantity)),
      timestamp: new Date().toISOString()
    });
    
    // DETAILED LOGGING: data Object - Log the entire data object just before it's used to construct the queryString
    autoTradeLogger.log(`[${requestId}] DATA OBJECT BEFORE QUERY STRING GENERATION`, {
      data: JSON.stringify(data),
      dataObject: data,
      dataKeys: Object.keys(data),
      dataValues: Object.values(data),
      dataEntries: Object.entries(data),
      symbol: data.symbol,
      side: data.side,
      type: data.type,
      quantity: data.quantity,
      timestamp: data.timestamp,
      recvWindow: data.recvWindow,
      price: data.price,
      timeInForce: data.timeInForce,
      newClientOrderId: data.newClientOrderId,
      newOrderRespType: data.newOrderRespType,
      hasSymbol: !!data.symbol,
      hasSide: !!data.side,
      hasType: !!data.type,
      hasQuantity: !!data.quantity,
      hasTimestamp: !!data.timestamp,
      hasRecvWindow: !!data.recvWindow,
      hasPrice: !!data.price,
      hasTimeInForce: !!data.timeInForce,
      hasNewClientOrderId: !!data.newClientOrderId,
      hasNewOrderRespType: !!data.newOrderRespType,
      timestamp: new Date().toISOString()
    });
    
    // Log the complete data object before generating query string
    console.log(`[${requestId}] Complete data object for Binance API:`, {
      data,
      dataKeys: Object.keys(data),
      dataValues: Object.values(data),
      dataEntries: Object.entries(data),
      timestamp: new Date().toISOString()
    });
    
    // Generate query string for signature - ensure all values are properly converted to strings
    const queryString = Object.entries(data)
      .map(([key, value]) => {
        // Ensure value is never undefined or null before encoding
        const safeValue = value === undefined || value === null ? '' : String(value);
        return `${key}=${encodeURIComponent(safeValue)}`;
      })
      .join('&');
    
    // DETAILED LOGGING: queryString - Log the generated queryString
    autoTradeLogger.log(`[${requestId}] QUERY STRING GENERATED`, {
      queryString,
      queryStringLength: queryString.length,
      queryStringParts: queryString.split('&'),
      queryStringEncoded: encodeURIComponent(queryString),
      queryStringEncodedLength: encodeURIComponent(queryString).length,
      timestamp: new Date().toISOString()
    });
    
    // Log the query string for debugging
    console.log(`[${requestId}] Generated query string for Binance API:`, {
      queryString,
      queryStringLength: queryString.length,
      queryStringParts: queryString.split('&'),
      timestamp: new Date().toISOString()
    });
    
    // Generate signature using HMAC SHA256
    const signature = generateSignature(queryString, credentials.secretKey);

    // Log signature generation (without exposing the actual signature)
    autoTradeLogger.log('Binance signature generated', {
      signatureLength: signature.length,
      signatureFirstChars: signature.substring(0, 5) + '...',
      signatureLastChars: '...' + signature.substring(signature.length - 5)
    });

    // Log the request details (without sensitive information)
    autoTradeLogger.log(`Sending Binance order request: ${params.side} ${params.quantity} ${params.symbol} at ${params.price || 'market price'}`);
    
    // Log the full request URL and data for debugging
    const requestUrl = `${baseUrl}${endpoint}`;
    console.log(`[${requestId}] Binance API request:`, {
      url: requestUrl,
      method: 'POST',
      data: data,
      endpoint: endpoint,
      isTestMode: testMode,
      isTestEndpoint: useTestEndpoint,
      queryString: queryString,
      apiKeyLength: credentials.apiKey ? credentials.apiKey.length : 0,
      secretKeyLength: credentials.secretKey ? credentials.secretKey.length : 0
    });
    
    autoTradeLogger.log(`[${requestId}] Binance API request details`, {
      url: requestUrl,
      data: JSON.stringify(data),
      endpoint: endpoint,
      isTestMode: testMode,
      isTestEndpoint: useTestEndpoint,
      queryString: queryString
    });

    // For Binance API, we can either:
    // 1. Send parameters as query string with signature appended
    // 2. Send parameters in request body with signature appended
    // We'll use the query string approach as it's more commonly used

    // Create the full URL with query string and signature
    const fullUrl = `${baseUrl}${endpoint}?${queryString}&signature=${signature}`;

    // DETAILED LOGGING: requestUrl - Log the final requestUrl that will be used to send the request
    autoTradeLogger.log(`[${requestId}] FINAL REQUEST URL`, {
      baseUrl,
      endpoint,
      fullUrl: fullUrl.replace(signature, signature.substring(0, 5) + '...' + signature.substring(signature.length - 5)),
      fullUrlLength: fullUrl.length,
      queryStringLength: queryString.length,
      signatureLength: signature.length,
      hasQueryString: fullUrl.includes('?'),
      hasSignature: fullUrl.includes('signature='),
      urlParts: {
        protocol: fullUrl.split('://')[0],
        host: fullUrl.split('://')[1]?.split('/')[0],
        path: '/' + (fullUrl.split('://')[1]?.split('/').slice(1).join('/').split('?')[0] || ''),
        query: fullUrl.includes('?') ? fullUrl.split('?')[1] : ''
      },
      timestamp: new Date().toISOString()
    });

    // Log the full URL (with signature partially masked)
    autoTradeLogger.log('Binance full request URL', {
      fullUrlLength: fullUrl.length,
      maskedUrl: fullUrl.replace(signature, signature.substring(0, 5) + '...' + signature.substring(signature.length - 5))
    });

    // Make the request
    autoTradeLogger.log('Initiating Binance API request', {
      method: 'POST',
      url: requestUrl,
      timestamp: new Date().toISOString()
    });

    let response;
    try {
      response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': credentials.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      // Log the raw response status
      autoTradeLogger.log('Binance API response received', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: JSON.stringify(Object.fromEntries([...response.headers.entries()])),
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
      autoTradeLogger.log('Binance API response text received', {
        responseTextLength: responseText.length,
        responseTextSample: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''),
        timestamp: new Date().toISOString()
      });
    } catch (textError) {
      autoTradeLogger.log('Error getting response text from Binance API', {
        error: textError.message,
        stack: textError.stack,
        timestamp: new Date().toISOString()
      });
      throw new Error(`Error reading Binance API response: ${textError.message}`);
    }
    
    let responseData;
    try {
      // Try to parse as JSON
      responseData = responseText ? JSON.parse(responseText) : null;
      
      // Add null check for responseData
      if (!responseData) {
        console.error('Null response data after parsing Binance API response');
        autoTradeLogger.log('Null response data from Binance API', {
          responseText: responseText ? responseText.substring(0, 200) : 'No response text',
          timestamp: new Date().toISOString()
        });
        throw new Error('Received null response from Binance API');
      }
      
      autoTradeLogger.log('Binance API response parsed successfully', {
        hasResponseData: !!responseData,
        responseDataType: responseData ? typeof responseData : 'null',
        isResponseDataArray: Array.isArray(responseData),
        responseDataKeys: responseData ? Object.keys(responseData) : [],
        timestamp: new Date().toISOString()
      });
    } catch (parseError) {
      console.error('Error parsing Binance API response:', parseError);
      autoTradeLogger.log(`Error parsing Binance API response: ${parseError.message}`, {
        responseText: responseText ? responseText.substring(0, 500) : 'No response text', // Log first 500 chars of response
        error: parseError.message,
        stack: parseError.stack,
        timestamp: new Date().toISOString()
      });
      throw new Error(`Failed to parse Binance API response: ${responseText ? (responseText.substring(0, 200) + (responseText.length > 200 ? '...' : '')) : 'Empty response'}`);
    }

    // Check for errors
    if (!response.ok) {
      const errorMessage = responseData?.msg || 'Unknown error';
      const errorCode = responseData?.code || 'UNKNOWN';
      
      // Log detailed error information
      console.error('Binance API error:', {
        status: response.status,
        statusText: response.statusText,
        errorCode,
        errorMessage,
        responseData
      });
      
      autoTradeLogger.log(`Binance API error (${errorCode}): ${errorMessage}`, {
        status: response.status,
        statusText: response.statusText,
        responseData: JSON.stringify(responseData),
        timestamp: new Date().toISOString()
      });
      
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
      requestUrl: baseUrl ? `${baseUrl}${endpoint}` : 'URL not available',
      data: data ? JSON.stringify(data) : 'Data not available',
      endpoint: endpoint || 'Endpoint not available',
      testMode,
      useTestEndpoint,
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
 * Execute a market buy order on Binance
 */
export async function executeBinanceMarketBuy(
  userId: string,
  symbol: string,
  quantity: number,
  testMode: boolean = false,
  useTestEndpoint: boolean = false
): Promise<any> {
  const formattedSymbol = formatBinanceSymbol(symbol);
  
  return createBinanceOrder(
    userId,
    {
      symbol: formattedSymbol,
      side: 'BUY',
      type: 'MARKET',
      quantity,
      newOrderRespType: 'FULL' // Get full response with fill information
    },
    testMode,
    useTestEndpoint
  );
}

/**
 * Execute a market sell order on Binance
 */
export async function executeBinanceMarketSell(
  userId: string,
  symbol: string,
  quantity: number,
  testMode: boolean = false,
  useTestEndpoint: boolean = false
): Promise<any> {
  const formattedSymbol = formatBinanceSymbol(symbol);
  
  return createBinanceOrder(
    userId,
    {
      symbol: formattedSymbol,
      side: 'SELL',
      type: 'MARKET',
      quantity,
      newOrderRespType: 'FULL' // Get full response with fill information
    },
    testMode,
    useTestEndpoint
  );
}

/**
 * Execute a limit buy order on Binance
 */
export async function executeBinanceLimitBuy(
  userId: string,
  symbol: string,
  quantity: number,
  price: number,
  testMode: boolean = false,
  useTestEndpoint: boolean = false
): Promise<any> {
  const formattedSymbol = formatBinanceSymbol(symbol);
  
  return createBinanceOrder(
    userId,
    {
      symbol: formattedSymbol,
      side: 'BUY',
      type: 'LIMIT',
      quantity,
      price,
      timeInForce: 'GTC', // Good Till Canceled
      newOrderRespType: 'FULL' // Get full response with fill information
    },
    testMode,
    useTestEndpoint
  );
}

/**
 * Execute a limit sell order on Binance
 */
export async function executeBinanceLimitSell(
  userId: string,
  symbol: string,
  quantity: number,
  price: number,
  testMode: boolean = false,
  useTestEndpoint: boolean = false
): Promise<any> {
  const formattedSymbol = formatBinanceSymbol(symbol);
  
  return createBinanceOrder(
    userId,
    {
      symbol: formattedSymbol,
      side: 'SELL',
      type: 'LIMIT',
      quantity,
      price,
      timeInForce: 'GTC', // Good Till Canceled
      newOrderRespType: 'FULL' // Get full response with fill information
    },
    testMode,
    useTestEndpoint
  );
}