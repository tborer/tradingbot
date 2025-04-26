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
  try {
    // Get credentials
    const credentials = await getBinanceCredentials(userId);
    if (!credentials) {
      throw new Error('Binance API credentials not configured');
    }

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

    // Prepare request parameters
    const timestamp = Date.now();

    // Build data object
    let data: Record<string, string> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      timestamp: timestamp.toString()
    };

    // Add quantity
    if (params.quantity) {
      data.quantity = params.quantity.toString();
    }

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

    // Generate signature
    const postdata = Object.entries(data)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    
    const signature = generateSignature(postdata, credentials.secretKey);

    // Log the request details (without sensitive information)
    autoTradeLogger.log(`Sending Binance order request: ${params.side} ${params.quantity} ${params.symbol} at ${params.price || 'market price'}`);

    // Create payload with signature
    const payload = {
      ...data,
      signature
    };

    // Make the request
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': credentials.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: Object.entries(payload)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&')
    });

    // Parse response
    const responseData = await response.json();

    // Check for errors
    if (!response.ok) {
      const errorMessage = responseData.msg || 'Unknown error';
      const errorCode = responseData.code || 'UNKNOWN';
      throw new Error(`Binance API error (${errorCode}): ${errorMessage}`);
    }

    // Log success
    autoTradeLogger.log(`Binance order created successfully: ${JSON.stringify(responseData)}`);

    return responseData;
  } catch (error) {
    autoTradeLogger.log(`Error creating Binance order: ${error.message}`);
    console.error('Error creating Binance order:', error);
    throw error;
  }
}

/**
 * Format crypto symbol for Binance API
 * Removes any special characters and ensures proper format (e.g., BTC/USD -> BTCUSD)
 */
export function formatBinanceSymbol(symbol: string): string {
  // Remove any special characters and convert to uppercase
  return symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
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