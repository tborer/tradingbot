// Types for stock data
export interface Stock {
  id: string;
  ticker: string;
  purchasePrice: number;
  priority: number;
  createdAt: string;
}

export interface StockWithPrice extends Stock {
  currentPrice?: number;
  percentChange?: number;
  shouldSell?: boolean;
}

// Types for settings
export interface Settings {
  id: string;
  sellThresholdPercent: number;
  checkFrequencySeconds: number;
}