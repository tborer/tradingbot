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

// Parse Kraken websocket message with optimized logic
export const parseKrakenMessage = (message: string): KrakenPrice[] => {
  // Minimal logging to reduce processing overhead
  try {
    // Quick check for empty message
    if (!message || message === '{}') {
      return [];
    }
    
    const parsed = JSON.parse(message);
    
    // Use a Map to define message type handlers for better lookup performance
    const messageTypeHandlers = new Map<string, () => KrakenPrice[]>([
      // Non-price messages that should be ignored
      ['subscription', () => {
        return [];
      }],
      ['heartbeat', () => {
        return [];
      }],
      ['error', () => {
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
      }],
      ['pong', () => {
        return [];
      }],
      ['status', () => {
        return [];
      }],
      
      // V2 format with channel and data array
      ['v2-ticker', () => {
        if (!Array.isArray(parsed.data)) return [];
        
        const prices: KrakenPrice[] = [];
        const timestamp = parsed.timestamp || Date.now();
        
        // Use a Map for XBT to BTC conversion to avoid repeated string comparisons
        const symbolMap = new Map<string, string>([['XBT', 'BTC']]);
        
        for (const item of parsed.data) {
          if (!item.symbol) continue;
          
          // Extract symbol more efficiently
          const rawSymbol = item.symbol.split('/')[0];
          const symbol = symbolMap.get(rawSymbol) || rawSymbol;
          
          // Simplified price extraction logic
          let price: number | null = null;
          
          if (item.last !== undefined) {
            price = typeof item.last === 'string' ? parseFloat(item.last) : item.last;
          } else if (item.ask !== undefined && item.bid !== undefined) {
            const ask = typeof item.ask === 'string' ? parseFloat(item.ask) : item.ask;
            const bid = typeof item.bid === 'string' ? parseFloat(item.bid) : item.bid;
            price = (ask + bid) / 2;
          }
          
          if (price !== null) {
            prices.push({ symbol, price, timestamp });
          }
        }
        
        return prices;
      }],
      
      // Nested JSON string format
      ['nested-json', () => {
        if (typeof parsed.data !== 'string') return [];
        
        try {
          const innerData = JSON.parse(parsed.data);
          
          if (innerData.channel !== 'ticker' || !Array.isArray(innerData.data)) {
            return [];
          }
          
          const prices: KrakenPrice[] = [];
          const timestamp = parsed.timestamp || Date.now();
          const symbolMap = new Map<string, string>([['XBT', 'BTC']]);
          
          for (const item of innerData.data) {
            if (!item.symbol || item.last === undefined) continue;
            
            const rawSymbol = item.symbol.split('/')[0];
            const symbol = symbolMap.get(rawSymbol) || rawSymbol;
            const price = typeof item.last === 'string' ? parseFloat(item.last) : item.last;
            
            prices.push({ symbol, price, timestamp });
          }
          
          return prices;
        } catch {
          return [];
        }
      }],
      
      // Array format v2: [channelID, data, channelName, pair]
      ['array-v2', () => {
        if (!Array.isArray(parsed) || parsed.length < 4 || parsed[2] !== 'ticker') {
          return [];
        }
        
        const data = parsed[1];
        const pair = parsed[3];
        
        if (!data?.c?.[0]) return [];
        
        const price = parseFloat(data.c[0]);
        const symbol = formatKrakenSymbol(pair);
        
        return [{
          symbol,
          price,
          timestamp: Date.now(),
        }];
      }],
      
      // Array format v1: [channelName, data, pair]
      ['array-v1', () => {
        if (!Array.isArray(parsed) || parsed.length < 3 || parsed[0] !== 'ticker') {
          return [];
        }
        
        const data = parsed[1];
        const pair = parsed[2];
        
        if (!data?.c?.[0]) return [];
        
        const price = parseFloat(data.c[0]);
        const symbol = formatKrakenSymbol(pair);
        
        return [{
          symbol,
          price,
          timestamp: Date.now(),
        }];
      }],
      
      // V1 ticker update format
      ['v1-ticker', () => {
        if (!parsed.data?.c?.[0]) return [];
        
        const price = parseFloat(parsed.data.c[0]);
        const symbol = formatKrakenSymbol(parsed.symbol);
        
        return [{
          symbol,
          price,
          timestamp: parsed.timestamp || Date.now(),
        }];
      }],
      
      // V2 ticker direct format
      ['v2-ticker-direct', () => {
        if (!parsed.symbol) return [];
        
        const rawSymbol = parsed.symbol.split('/')[0];
        const symbol = rawSymbol === 'XBT' ? 'BTC' : rawSymbol;
        let price: number | null = null;
        
        // Simplified price extraction with early returns
        if (parsed.price !== undefined) {
          price = typeof parsed.price === 'string' ? parseFloat(parsed.price) : parsed.price;
        } else if (parsed.last !== undefined) {
          price = typeof parsed.last === 'string' ? parseFloat(parsed.last) : parsed.last;
        } else if (parsed.c?.[0]) {
          price = parseFloat(parsed.c[0]);
        } else if (parsed.data?.c?.[0]) {
          price = parseFloat(parsed.data.c[0]);
        }
        
        if (price === null) return [];
        
        return [{
          symbol,
          price,
          timestamp: parsed.timestamp || Date.now(),
        }];
      }]
    ]);
    
    // Determine message type and call appropriate handler
    let handlerKey: string | null = null;
    
    // Check for event-based messages
    if (parsed.event === 'subscribed' || parsed.event === 'heartbeat') {
      handlerKey = 'subscription';
    } else if (parsed.event === 'error') {
      handlerKey = 'error';
    } else if (parsed.name === 'pong' || parsed.method === 'pong') {
      handlerKey = 'pong';
    } else if (parsed.channel === 'status' && parsed.type === 'update' && Array.isArray(parsed.data)) {
      handlerKey = 'status';
    } else if (parsed.channel === 'ticker' && (parsed.type === 'snapshot' || parsed.type === 'update') && Array.isArray(parsed.data)) {
      handlerKey = 'v2-ticker';
    } else if (parsed.data && typeof parsed.data === 'string') {
      handlerKey = 'nested-json';
    } else if (Array.isArray(parsed)) {
      // Check array format v2 first (more specific)
      if (parsed.length >= 4 && parsed[2] === 'ticker') {
        handlerKey = 'array-v2';
      } else if (parsed.length >= 3 && parsed[0] === 'ticker') {
        handlerKey = 'array-v1';
      }
    } else if (parsed.type === 'update' && parsed.channel === 'ticker') {
      handlerKey = 'v1-ticker';
    } else if (parsed.type === 'ticker' && parsed.symbol) {
      handlerKey = 'v2-ticker-direct';
    }
    
    // Call the appropriate handler or return empty array if no handler found
    return handlerKey && messageTypeHandlers.has(handlerKey) 
      ? messageTypeHandlers.get(handlerKey)!() 
      : [];
      
  } catch (error) {
    console.error('Error parsing Kraken message:', error);
    return [];
  }
};

// Format Kraken symbol to match our application's format
// Kraken may use XBT/USD or BTC/USD, we want BTC
export const formatKrakenSymbol = (krakenSymbol: string): string => {
  // Remove the quote currency (e.g., /USD)
  const baseCurrency = krakenSymbol.split('/')[0];
  
  // Kraken may use XBT for Bitcoin, we want to use BTC
  if (baseCurrency === 'XBT') {
    console.log('Converting XBT to BTC for consistency');
    return 'BTC';
  }
  
  return baseCurrency;
};

// Format our symbol to Kraken's format
// We use BTC, Kraken now accepts BTC/USD
export const formatToKrakenSymbol = (symbol: string): string => {
  // Use BTC/USD directly as requested
  if (symbol === 'BTC') {
    console.log('Using BTC/USD for Kraken API subscription');
    return 'BTC/USD';
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
  // Handle edge cases with more detailed logging
  if (purchasePrice <= 0) {
    console.log(`SELL CHECK SKIPPED: Invalid purchase price (${purchasePrice}). Using fallback comparison.`);
    // For sell, if purchase price is invalid, we can still check if the current price is above a minimum threshold
    // This allows selling even if purchase price data is missing
    return currentPrice > 0;
  }
  
  if (currentPrice <= 0) {
    console.log(`SELL CHECK FAILED: Invalid current price (${currentPrice})`);
    return false;
  }
  
  const percentGain = ((currentPrice - purchasePrice) / purchasePrice) * 100;
  console.log(`SELL CHECK: Current: $${currentPrice}, Purchase: $${purchasePrice}, Gain: ${percentGain.toFixed(2)}%, Threshold: ${thresholdPercent}%`);
  
  // Ensure the price change meets or exceeds the threshold percentage
  // For selling, we want the price to have increased by at least the threshold percentage
  const shouldSell = percentGain >= thresholdPercent;
  console.log(`Should sell? ${shouldSell ? 'YES' : 'NO'} (Gain: ${percentGain.toFixed(2)}% >= Threshold: ${thresholdPercent}%: ${percentGain >= thresholdPercent})`);
  
  // Add additional logging for debugging
  if (shouldSell) {
    console.log(`SELL CONDITION MET: Price increased by ${percentGain.toFixed(2)}%, which is >= threshold of ${thresholdPercent}%`);
  } else {
    console.log(`SELL CONDITION NOT MET: ${percentGain.toFixed(2)}% gain is less than threshold of ${thresholdPercent}%`);
  }
  
  return shouldSell;
};

// Check if a crypto should be bought based on current price and threshold
export const shouldBuyCrypto = (
  currentPrice: number, 
  purchasePrice: number, 
  thresholdPercent: number
): boolean => {
  // Handle edge cases with more detailed logging
  if (purchasePrice <= 0) {
    console.log(`BUY CHECK SKIPPED: Invalid purchase price (${purchasePrice}). Using current price as reference.`);
    // For buy, if purchase price is invalid, we can use the current price as a reference point
    // This allows buying even if purchase price data is missing
    return currentPrice > 0;
  }
  
  if (currentPrice <= 0) {
    console.log(`BUY CHECK FAILED: Invalid current price (${currentPrice})`);
    return false;
  }
  
  const percentDrop = ((purchasePrice - currentPrice) / purchasePrice) * 100;
  console.log(`BUY CHECK: Current: $${currentPrice}, Purchase: $${purchasePrice}, Drop: ${percentDrop.toFixed(2)}%, Threshold: ${thresholdPercent}%`);
  
  // Ensure the price change meets or exceeds the threshold percentage
  // For buying, we want the price to have dropped by at least the threshold percentage
  const shouldBuy = percentDrop >= thresholdPercent;
  console.log(`Should buy? ${shouldBuy ? 'YES' : 'NO'} (Drop: ${percentDrop.toFixed(2)}% >= Threshold: ${thresholdPercent}%: ${percentDrop >= thresholdPercent})`);
  
  // Add additional logging for debugging
  if (shouldBuy) {
    console.log(`BUY CONDITION MET: Price dropped by ${percentDrop.toFixed(2)}%, which is >= threshold of ${thresholdPercent}%`);
  } else {
    console.log(`BUY CONDITION NOT MET: ${percentDrop.toFixed(2)}% drop is less than threshold of ${thresholdPercent}%`);
  }
  
  return shouldBuy;
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
  // Use BTC directly for Bitcoin
  if (symbol === 'BTC') {
    return 'BTCUSD';
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