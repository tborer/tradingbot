// Types for stock data
export interface Stock {
  id: string;
  ticker: string;
  purchasePrice: number;
  shares: number;
  priority: number;
  autoSell: boolean;
  autoBuy: boolean;
  createdAt: string;
}

export interface StockWithPrice extends Stock {
  currentPrice?: number;
  percentChange?: number;
  shouldSell?: boolean;
  shouldBuy?: boolean;
}

// Types for settings
export interface Settings {
  id: string;
  sellThresholdPercent: number;
  buyThresholdPercent: number;
  checkFrequencySeconds: number;
  tradePlatformApiKey?: string;
  tradePlatformApiSecret?: string;
  finnhubApiKey?: string;
}

// Types for transactions
export interface Transaction {
  id: string;
  stockId: string;
  ticker: string;
  action: 'buy' | 'sell';
  shares: number;
  price: number;
  totalAmount: number;
  createdAt: string;
}