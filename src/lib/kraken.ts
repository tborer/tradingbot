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

// Parse Kraken websocket message
export const parseKrakenMessage = (message: string): KrakenPrice[] => {
  try {
    const parsed = JSON.parse(message);
    
    // Handle subscription confirmation messages
    if (parsed.event === 'subscribed' || parsed.event === 'heartbeat') {
      console.log('Received subscription confirmation or heartbeat from Kraken');
      return [];
    }
    
    // Handle error messages
    if (parsed.event === 'error') {
      console.error('Kraken WebSocket error:', parsed);
      return [];
    }
    
    // Check if it's an array (Kraken sends arrays for ticker updates)
    if (Array.isArray(parsed)) {
      // Kraken v2 WebSocket format: [channelID, data, channelName, pair]
      // Example: [0,{"a":[["41772.10000",0.00100000,1.00000000]],"b":[["41772.00000",0.77920533,1.00000000]],"c":["41772.10000","0.00006949"],"v":["1903.41357664","2167.75553954"],"p":["41984.40905156","42020.94016593"],"t":[14218,16453],"l":["41600.00000","41600.00000"],"h":["42399.90000","42399.90000"],"o":["42208.80000","42208.80000"]},"ticker","XBT/USD"]
      
      if (parsed.length >= 4 && parsed[2] === 'ticker') {
        const data = parsed[1];
        const pair = parsed[3];
        
        // Extract the price from the close price (c) field
        // The first element in the array is the price
        const price = parseFloat(data.c[0]);
        
        // Extract the symbol from the pair
        const symbol = formatKrakenSymbol(pair);
        
        return [{
          symbol,
          price,
          timestamp: Date.now(),
        }];
      }
    }
    
    // Handle ticker updates in v1 format (fallback)
    if (parsed.type === 'update' && parsed.channel === 'ticker') {
      // Extract the price from the close price (c) field
      const price = parseFloat(parsed.data.c[0]);
      
      // Extract the symbol from the message
      const symbol = formatKrakenSymbol(parsed.symbol);
      
      return [{
        symbol,
        price,
        timestamp: parsed.timestamp || Date.now(),
      }];
    }
    
    return [];
  } catch (error) {
    console.error('Error parsing Kraken message:', error);
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
  
  return {
    name: 'subscribe',
    reqid: 123,
    pair: krakenSymbols,
    subscription: {
      name: 'ticker'
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
  ordertype: 'limit';
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

// Generate a unique order ID
export const generateOrderId = (): string => {
  return crypto.randomUUID();
};

// Generate a nonce (timestamp in milliseconds)
export const generateNonce = (): number => {
  return Date.now();
};