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

    if (!settings.binanceTradeApi || !settings.binanceApiToken) {
      autoTradeLogger.log(`Binance API credentials not configured for user ${userId}`);
      return null;
    }

    return {
      apiKey: settings.binanceTradeApi,
      secretKey: settings.binanceApiToken
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
  testMode: boolean = false
): Promise<any> {
  try {
    // Get credentials
    const credentials = await getBinanceCredentials(userId);
    if (!credentials) {
      throw new Error('Binance API credentials not configured');
    }

    // Prepare request parameters
    const timestamp = Date.now();
    const apiUrl = 'https://api.binance.us';
    const endpoint = testMode ? '/api/v3/order/test' : '/api/v3/order';

    // Build query string
    let queryParams: Record<string, string> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      timestamp: timestamp.toString()
    };

    // Add quantity
    if (params.quantity) {
      queryParams.quantity = params.quantity.toString();
    }

    // Add optional parameters if provided
    if (params.price) {
      queryParams.price = params.price.toString();
    }

    if (params.timeInForce) {
      queryParams.timeInForce = params.timeInForce;
    }

    if (params.newClientOrderId) {
      queryParams.newClientOrderId = params.newClientOrderId;
    }

    if (params.newOrderRespType) {
      queryParams.newOrderRespType = params.newOrderRespType;
    }

    // Convert query params to string
    const queryString = Object.entries(queryParams)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    // Generate signature
    const signature = generateSignature(queryString, credentials.secretKey);

    // Build full URL with signature
    const url = `${apiUrl}${endpoint}?${queryString}&signature=${signature}`;

    // Log the request details (without sensitive information)
    autoTradeLogger.log(`Sending Binance order request: ${params.side} ${params.quantity} ${params.symbol} at ${params.price || 'market price'}`);

    // Make the request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': credentials.apiKey,
        'Content-Type': 'application/json'
      }
    });

    // Parse response
    const data = await response.json();

    // Check for errors
    if (!response.ok) {
      const errorMessage = data.msg || 'Unknown error';
      const errorCode = data.code || 'UNKNOWN';
      throw new Error(`Binance API error (${errorCode}): ${errorMessage}`);
    }

    // Log success
    autoTradeLogger.log(`Binance order created successfully: ${JSON.stringify(data)}`);

    return data;
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
  testMode: boolean = false
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
    testMode
  );
}

/**
 * Execute a market sell order on Binance
 */
export async function executeBinanceMarketSell(
  userId: string,
  symbol: string,
  quantity: number,
  testMode: boolean = false
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
    testMode
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
  testMode: boolean = false
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
    testMode
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
  testMode: boolean = false
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
    testMode
  );
}