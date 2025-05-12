export type SignalDirection = 'LONG' | 'SHORT';
export type SignalType = 'ENTRY' | 'EXIT';
export type ExitReason = 'TAKE_PROFIT' | 'STOP_LOSS' | 'TREND_REVERSAL' | 'TARGET_REACHED' | 'RISK_MANAGEMENT';

export interface BaseSignal {
  id?: string;
  userId: string;
  symbol: string;
  timestamp: Date;
  price: number;
  timeframe: string;
}

export interface EntrySignal extends BaseSignal {
  type: 'ENTRY';
  direction: SignalDirection;
  confidence: number;
  reason: string;
  targetPrice?: number;
  stopLossPrice?: number;
}

export interface ExitSignal extends BaseSignal {
  type: 'EXIT';
  reason: ExitReason;
  relatedEntrySignalId?: string;
  profitLoss?: number;
  profitLossPercentage?: number;
}

export type TradingSignal = EntrySignal | ExitSignal;

export interface SignalGenerationParams {
  symbol: string;
  timeframe: string;
  currentPrice: number;
  userId: string;
}

export interface TechnicalContext {
  rsi?: number;
  ema12?: number;
  ema26?: number;
  ema50?: number;
  sma20?: number;
  sma50?: number;
  bollingerUpper?: number;
  bollingerLower?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  volume?: number;
  averageVolume?: number;
}

export interface PredictionContext {
  direction?: {
    prediction: 'UP' | 'DOWN';
    confidence: number;
  };
  volatility?: {
    prediction: 'HIGH' | 'MEDIUM' | 'LOW';
    confidence: number;
  };
  keyLevels?: {
    support: number[];
    resistance: number[];
    confidence: number;
  };
}

export interface PositionContext {
  hasOpenPosition: boolean;
  openPositions: {
    direction: SignalDirection;
    entryPrice: number;
    entryTimestamp: Date;
    entrySignalId: string;
    size: number;
  }[];
}

export interface SignalGenerationContext {
  technical: TechnicalContext;
  predictions: PredictionContext;
  position: PositionContext;
}