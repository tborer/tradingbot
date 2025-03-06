// Types for Finnhub data
export interface StockPrice {
  ticker: string;
  price: number;
  timestamp: number;
}

export interface FinnhubMessage {
  type: string;
  data?: {
    s: string; // Symbol
    p: number; // Last price
    t: number; // UNIX milliseconds timestamp
    v: number; // Volume
    c: string[]; // Trade conditions
  }[];
}

// Parse Finnhub websocket message
export const parseFinnhubMessage = (message: string): StockPrice[] => {
  try {
    const parsed: FinnhubMessage = JSON.parse(message);
    
    if (parsed.type === 'trade' && parsed.data) {
      return parsed.data.map(item => ({
        ticker: item.s,
        price: item.p,
        timestamp: item.t,
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error parsing Finnhub message:', error);
    return [];
  }
};

// Check if a stock should be sold based on current price and threshold
export const shouldSellStock = (
  currentPrice: number, 
  purchasePrice: number, 
  thresholdPercent: number
): boolean => {
  const percentGain = ((currentPrice - purchasePrice) / purchasePrice) * 100;
  return percentGain >= thresholdPercent;
};

// Check if a stock should be bought based on current price and threshold
export const shouldBuyStock = (
  currentPrice: number, 
  purchasePrice: number, 
  thresholdPercent: number
): boolean => {
  const percentDrop = ((purchasePrice - currentPrice) / purchasePrice) * 100;
  return percentDrop >= thresholdPercent;
};