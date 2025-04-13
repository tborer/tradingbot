// Types for Kraken WebSocket API
export interface KrakenPrice {
  symbol: string;
  price: number;
  timestamp: number;
}

export interface KrakenTickerMessage {
  channel: string;
  data: {
    a: string[]; // Ask array [price, wholeLotVolume, lotVolume]
    b: string[]; // Bid array [price, wholeLotVolume, lotVolume]
    c: string[]; // Close array [price, lot volume]
    v: string[]; // Volume array [today, last 24 hours]
    p: string[]; // Volume weighted average price array [today, last 24 hours]
    t: number[]; // Number of trades array [today, last 24 hours]
    l: string[]; // Low array [today, last 24 hours]
    h: string[]; // High array [today, last 24 hours]
    o: string[]; // Open array [today, last 24 hours]
  };
  symbol: string;
  timestamp: number;
  type: string;
}

import { createAndLogError, ErrorCategory, ErrorSeverity, WebSocketErrorCodes } from './errorLogger';

// Parse Kraken websocket message
export const parseKrakenMessage = (message: string): KrakenPrice[] => {
  // Add detailed logging to help diagnose parsing issues
  console.log('Starting to parse Kraken message:', message.substring(0, 200));
  try {
    // Check for empty message
    if (!message || message === '{}') {
      console.log('Received empty Kraken message, ignoring');
      return [];
    }
    
    console.log('Parsing Kraken message:', message.substring(0, 200));
    const parsed = JSON.parse(message);
    
    // Handle subscription confirmation messages
    if (parsed.event === 'subscribed' || parsed.event === 'heartbeat') {
      console.log('Received subscription confirmation or heartbeat from Kraken');
      return [];
    }
    
    // Handle error messages
    if (parsed.event === 'error') {
      // Log the error with our enhanced error logging
      createAndLogError(
        ErrorCategory.WEBSOCKET,
        ErrorSeverity.ERROR,
        1003,
        `Kraken WebSocket API error: ${parsed.message || 'Unknown error'}`,
        {
          krakenError: parsed,
          timestamp: Date.now(),
          errorCode: parsed.code || 'UNKNOWN'
        }
      );
      return [];
    }
    
    // Handle pong responses
    if (parsed.name === 'pong' || parsed.method === 'pong') {
      console.log('Received pong from Kraken');
      return [];
    }
    
    // Handle status updates (connection confirmation)
    if (parsed.channel === 'status' && parsed.type === 'update' && Array.isArray(parsed.data)) {
      console.log('Received status update from Kraken:', JSON.stringify(parsed).substring(0, 200));
      return [];
    }
    
    // Handle the v2 format with channel and data array (exactly as specified in requirements)
    if (parsed.channel === 'ticker' && (parsed.type === 'snapshot' || parsed.type === 'update') && Array.isArray(parsed.data)) {
      console.log('Found ticker data in v2 format with channel and data array');
      
      // Extract prices from each ticker item in the data array
      const prices: KrakenPrice[] = [];
      
      for (const item of parsed.data) {
        if (item.symbol) {
          // Extract the symbol (remove the /USD part)
          const rawSymbol = item.symbol.split('/')[0];
          const symbol = rawSymbol === 'XBT' ? 'BTC' : rawSymbol;
          
          // According to the specified format, we have direct access to these fields
          let price: number | null = null;
          
          if (item.last !== undefined) {
            price = typeof item.last === 'string' ? parseFloat(item.last) : item.last;
          } else if (item.ask !== undefined && item.bid !== undefined) {
            // If last is not available, use the midpoint of bid and ask
            const ask = typeof item.ask === 'string' ? parseFloat(item.ask) : item.ask;
            const bid = typeof item.bid === 'string' ? parseFloat(item.bid) : item.bid;
            price = (ask + bid) / 2;
          }
          
          if (price !== null) {
            console.log(`Extracted price ${price} for symbol ${symbol} from ${parsed.type} message`);
            
            prices.push({
              symbol,
              price,
              timestamp: parsed.timestamp || Date.now(),
            });
          }
        }
      }
      
      if (prices.length > 0) {
        return prices;
      }
    }
    
    // Handle the new message format with data field containing a JSON string
    if (parsed.data && typeof parsed.data === 'string') {
      console.log('Detected new message format with data as string');
      try {
        // Parse the nested JSON string in the data field
        const innerData = JSON.parse(parsed.data);
        console.log('Parsed inner data:', JSON.stringify(innerData).substring(0, 200));
        
        // Check if it's a ticker message with type update or snapshot
        if (innerData.channel === 'ticker' && (innerData.type === 'update' || innerData.type === 'snapshot') && Array.isArray(innerData.data)) {
          console.log('Found ticker update/snapshot data in new format');
          
          // Extract prices from each ticker item
          const prices: KrakenPrice[] = [];
          
          for (const item of innerData.data) {
            if (item.symbol && item.last !== undefined) {
              // Extract the symbol (remove the /USD part)
              const rawSymbol = item.symbol.split('/')[0];
              const symbol = rawSymbol === 'XBT' ? 'BTC' : rawSymbol;
              
              // Use the 'last' field as the current price
              const price = typeof item.last === 'string' ? parseFloat(item.last) : item.last;
              
              console.log(`Extracted price ${price} for symbol ${symbol} from new format ticker`);
              
              prices.push({
                symbol,
                price,
                timestamp: parsed.timestamp || Date.now(),
              });
            }
          }
          
          if (prices.length > 0) {
            return prices;
          }
        }
      } catch (innerError) {
        console.error('Error parsing inner data JSON:', innerError);
      }
    }
    
    // Check if it's an array (Kraken sends arrays for ticker updates)
    if (Array.isArray(parsed)) {
      console.log('Received array-format message from Kraken:', JSON.stringify(parsed).substring(0, 200));
      
      // Kraken v2 WebSocket format: [channelID, data, channelName, pair]
      // Example: [0,{"a":[["41772.10000",0.00100000,1.00000000]],"b":[["41772.00000",0.77920533,1.00000000]],"c":["41772.10000","0.00006949"],"v":["1903.41357664","2167.75553954"],"p":["41984.40905156","42020.94016593"],"t":[14218,16453],"l":["41600.00000","41600.00000"],"h":["42399.90000","42399.90000"],"o":["42208.80000","42208.80000"]},"ticker","XBT/USD"]
      
      if (parsed.length >= 4 && parsed[2] === 'ticker') {
        const data = parsed[1];
        const pair = parsed[3];
        
        console.log(`Extracted ticker data for pair ${pair}:`, JSON.stringify(data).substring(0, 200));
        
        // Make sure data and c field exist
        if (!data || !data.c || !Array.isArray(data.c) || data.c.length === 0) {
          console.log('Invalid Kraken ticker data format:', data);
          return [];
        }
        
        // Extract the price from the close price (c) field
        // The first element in the array is the price
        const price = parseFloat(data.c[0]);
        
        // Extract the symbol from the pair
        const symbol = formatKrakenSymbol(pair);
        
        console.log(`Extracted price ${price} for symbol ${symbol} from pair ${pair}`);
        
        return [{
          symbol,
          price,
          timestamp: Date.now(),
        }];
      }
      
      // Handle v1 format array response: [channelName, data, pair]
      // Example: ["ticker", {"a": ["58661.00000", 0, "0.00000000"], ...}, "XBT/USD"]
      if (parsed.length >= 3 && parsed[0] === 'ticker') {
        const data = parsed[1];
        const pair = parsed[2];
        
        console.log(`Extracted v1 ticker data for pair ${pair}:`, JSON.stringify(data).substring(0, 200));
        
        // Make sure data and c field exist
        if (!data || !data.c || !Array.isArray(data.c) || data.c.length === 0) {
          console.log('Invalid Kraken v1 ticker data format:', data);
          return [];
        }
        
        // Extract the price from the close price (c) field
        const price = parseFloat(data.c[0]);
        
        // Extract the symbol from the pair
        const symbol = formatKrakenSymbol(pair);
        
        console.log(`Extracted price ${price} for symbol ${symbol} from pair ${pair} (v1 format)`);
        
        return [{
          symbol,
          price,
          timestamp: Date.now(),
        }];
      }
    }
    
    // Handle ticker updates in v1 format (fallback)
    if (parsed.type === 'update' && parsed.channel === 'ticker') {
      console.log('Received update-type message from Kraken:', JSON.stringify(parsed).substring(0, 200));
      
      // Make sure data and c field exist
      if (!parsed.data || !parsed.data.c || !Array.isArray(parsed.data.c) || parsed.data.c.length === 0) {
        console.log('Invalid Kraken ticker data format (v1):', parsed.data);
        return [];
      }
      
      // Extract the price from the close price (c) field
      const price = parseFloat(parsed.data.c[0]);
      
      // Extract the symbol from the message
      const symbol = formatKrakenSymbol(parsed.symbol);
      
      console.log(`Extracted price ${price} for symbol ${symbol} from update message`);
      
      return [{
        symbol,
        price,
        timestamp: parsed.timestamp || Date.now(),
      }];
    }
    
    // Handle Kraken v2 API format with ticker updates
    if (parsed.type === 'ticker' && parsed.symbol) {
      console.log('Detected Kraken v2 ticker update format:', JSON.stringify(parsed).substring(0, 200));
      
      // Extract the symbol (remove the /USD part)
      const rawSymbol = parsed.symbol.split('/')[0];
      const symbol = rawSymbol === 'XBT' ? 'BTC' : rawSymbol;
      
      // Try to extract price from different possible fields
      let price: number | null = null;
      
      // Check for price in different possible locations
      if (parsed.price !== undefined) {
        price = typeof parsed.price === 'string' ? parseFloat(parsed.price) : parsed.price;
      } else if (parsed.last !== undefined) {
        price = typeof parsed.last === 'string' ? parseFloat(parsed.last) : parsed.last;
      } else if (parsed.c && Array.isArray(parsed.c) && parsed.c.length > 0) {
        price = parseFloat(parsed.c[0]);
      } else if (parsed.data && parsed.data.c && Array.isArray(parsed.data.c) && parsed.data.c.length > 0) {
        price = parseFloat(parsed.data.c[0]);
      }
      
      if (price !== null) {
        console.log(`Extracted price ${price} for symbol ${symbol} from v2 ticker update`);
        
        return [{
          symbol,
          price,
          timestamp: parsed.timestamp || Date.now(),
        }];
      }
    }
    
    // If we get here, we received a message we don't understand
    console.log('Unrecognized Kraken message format:', JSON.stringify(parsed).substring(0, 200));
    return [];
  } catch (error) {
    console.error('Error parsing Kraken message:', error, 'Message:', message.substring(0, 200));
    return [];
  }
};

// Format Kraken symbol to match our application's format
// Kraken uses XBT/USD, we want BTC
export const formatKrakenSymbol = (krakenSymbol: string): string => {
  // Remove the quote currency (e.g., /USD)
  const baseCurrency = krakenSymbol.split('/')[0];
  
  // Kraken uses XBT for Bitcoin, we want to use BTC
  if (baseCurrency === 'XBT') {
    return 'BTC';
  }
  
  return baseCurrency;
};

// Format our symbol to Kraken's format
// We use BTC, Kraken uses XBT/USD
export const formatToKrakenSymbol = (symbol: string): string => {
  // Kraken uses XBT for Bitcoin
  if (symbol === 'BTC') {
    return 'XBT/USD';
  }
  
  // For other symbols, add /USD
  return `${symbol}/USD`;
};

// Create subscription payload for Kraken WebSocket
export const createKrakenSubscription = (symbols: string[]): any => {
  const krakenSymbols = symbols.map(formatToKrakenSymbol);
  
  // Following the exact format specified in the requirements
  return {
    method: "subscribe",
    params: {
      channel: "ticker",
      symbol: krakenSymbols
    }
  };
};

// Check if a crypto should be sold based on current price and threshold
export const shouldSellCrypto = (
  currentPrice: number, 
  purchasePrice: number, 
  thresholdPercent: number
): boolean => {
  const percentGain = ((currentPrice - purchasePrice) / purchasePrice) * 100;
  return percentGain >= thresholdPercent;
};

// Check if a crypto should be bought based on current price and threshold
export const shouldBuyCrypto = (
  currentPrice: number, 
  purchasePrice: number, 
  thresholdPercent: number
): boolean => {
  const percentDrop = ((purchasePrice - currentPrice) / purchasePrice) * 100;
  return percentDrop >= thresholdPercent;
};

// Kraken Order API Types
export interface KrakenOrderRequest {
  nonce: number;
  ordertype: string; // market, limit, iceberg, stop-loss, take-profit, etc.
  type: 'buy' | 'sell';
  volume: string;
  pair: string;
  price: string;
  cl_ord_id: string;
}

export interface KrakenOrderResponse {
  error: string[];
  result: {
    descr: {
      order: string;
    };
    txid: string[];
  };
}

// Convert our symbol to Kraken trading pair format
export const getKrakenTradingPair = (symbol: string): string => {
  // Kraken uses XBT for Bitcoin
  if (symbol === 'BTC') {
    return 'XBTUSD';
  }
  
  // For other symbols, add USD
  return `${symbol}USD`;
};

// Generate a unique order ID in UUID v4 format
export const generateOrderId = (): string => {
  // Generate a proper UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // where x is any hexadecimal digit and y is one of 8, 9, A, or B
  const hexDigits = '0123456789abcdef';
  let uuid = '';
  
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4'; // Version 4 UUID always has the 14th character as '4'
    } else if (i === 19) {
      // The 19th character is one of: 8, 9, a, b
      uuid += hexDigits.charAt(Math.floor(Math.random() * 4) + 8);
    } else {
      uuid += hexDigits.charAt(Math.floor(Math.random() * 16));
    }
  }
  
  return uuid;
};

// Generate a nonce (timestamp in milliseconds)
export const generateNonce = (): number => {
  return Date.now();
};