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
    if (parsed.type === 'subscribed' || parsed.type === 'heartbeat') {
      return [];
    }
    
    // Handle ticker updates
    if (parsed.type === 'update' && parsed.channel === 'ticker') {
      // Extract the price from the close price (c) field
      // The first element in the array is the price
      const price = parseFloat(parsed.data.c[0]);
      
      // Extract the symbol from the message
      // The symbol format is like "XBT/USD", we need to convert it to our format
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
    method: 'subscribe',
    params: {
      channel: 'ticker',
      symbols: krakenSymbols,
    },
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