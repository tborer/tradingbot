import prisma from '@/lib/prisma';

export enum AutoTradeLogType {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}

export interface AutoTradeLogData {
  cryptoId?: string;
  symbol?: string;
  action?: 'buy' | 'sell' | null;
  price?: number;
  shares?: number;
  totalValue?: number;
  purchasePrice?: number;
  thresholdPercent?: number;
  percentChange?: number;
  nextAction?: string;
  krakenOrderId?: string;
  transactionId?: string;
  [key: string]: any; // Allow additional properties
}

/**
 * Logs auto trade events to the database for tracking and debugging
 * Only creates transaction records for important events (SUCCESS, ERROR)
 * or events related to actual trade attempts
 */
export async function logAutoTradeEvent(
  userId: string,
  type: AutoTradeLogType,
  message: string,
  data: AutoTradeLogData
): Promise<void> {
  try {
    // Create a timestamp for the log
    const timestamp = new Date();
    
    // Format the log data
    const logData = {
      timestamp: timestamp.toISOString(),
      type,
      message,
      ...data
    };
    
    // Determine if this event should be recorded in the transaction history
    const shouldCreateTransactionRecord = 
      // Only create transaction records for actual trade executions with an order ID
      (message.includes('executed auto') && data.krakenOrderId) ||
      // Log events related to failed trade attempts after API call
      (message.includes('Failed to execute') && message.includes('API'));
    
    // Only create transaction records for completed trades with order IDs
    if (shouldCreateTransactionRecord) {
      await prisma.cryptoTransaction.create({
        data: {
          cryptoId: data.cryptoId || 'system',
          action: data.action || 'auto_trade_log',
          shares: data.shares || 0,
          price: data.price || 0,
          totalAmount: data.totalValue || (data.shares && data.price ? data.shares * data.price : 0),
          userId,
          logInfo: JSON.stringify(logData, null, 2)
        }
      });
    }
    
    // Always log to console for server-side visibility
    console.log(`[AUTO TRADE ${type}] ${message}`, logData);
  } catch (error) {
    // If logging fails, at least log to console
    console.error('Failed to log auto trade event:', error);
    console.error('Original log data:', { type, message, data });
  }
}

/**
 * Logs the evaluation of auto trade conditions
 */
export async function logAutoTradeEvaluation(
  userId: string,
  cryptoId: string,
  symbol: string,
  action: 'buy' | 'sell',
  currentPrice: number,
  purchasePrice: number,
  thresholdPercent: number,
  shouldTrade: boolean
): Promise<void> {
  // Calculate percentage change
  const percentChange = action === 'buy'
    ? ((purchasePrice - currentPrice) / purchasePrice) * 100  // For buy: price drop percentage
    : ((currentPrice - purchasePrice) / purchasePrice) * 100; // For sell: price gain percentage
  
  const message = shouldTrade
    ? `Auto trade condition MET for ${symbol}: ${action.toUpperCase()} at $${currentPrice.toFixed(2)} (${Math.abs(percentChange).toFixed(2)}% ${action === 'buy' ? 'drop' : 'gain'})`
    : `Auto trade condition NOT MET for ${symbol}: ${action.toUpperCase()} at $${currentPrice.toFixed(2)} (${Math.abs(percentChange).toFixed(2)}% ${action === 'buy' ? 'drop' : 'gain'})`;
  
  // Always log to console for debugging
  console.log(`[AUTO TRADE ${shouldTrade ? 'SUCCESS' : 'INFO'}] ${message}`, {
    cryptoId,
    symbol,
    action,
    price: currentPrice,
    purchasePrice,
    thresholdPercent,
    percentChange,
    conditionMet: shouldTrade
  });
  
  // Log to the console but DO NOT create transaction records for condition evaluations
  // We'll only create transaction records when the actual trade is executed
  if (shouldTrade) {
    // Use a custom function to log to console only, not to the database
    console.log(`[AUTO TRADE CONDITION MET] ${message}`, {
      timestamp: new Date().toISOString(),
      type: AutoTradeLogType.SUCCESS,
      message,
      cryptoId,
      symbol,
      action,
      price: currentPrice,
      purchasePrice,
      thresholdPercent,
      percentChange,
      conditionMet: shouldTrade
    });
  }
}

/**
 * Logs the execution of an auto trade
 * Only creates transaction records for successful trades with a Kraken order ID
 */
export async function logAutoTradeExecution(
  userId: string,
  cryptoId: string,
  symbol: string,
  action: 'buy' | 'sell',
  price: number,
  shares: number,
  success: boolean,
  krakenOrderId?: string,
  transactionId?: string,
  errorMessage?: string
): Promise<void> {
  const totalValue = price * shares;
  
  // Create different messages for successful and failed trades
  const message = success
    ? `Successfully executed auto ${action} order for ${shares} shares of ${symbol} at $${price}`
    : `Failed to execute auto ${action} for ${shares} shares of ${symbol} at $${price}: ${errorMessage || 'Unknown error'}`;
  
  // Only log successful trades with order IDs to the transaction history
  // For failed trades or trades without order IDs, just log to console
  await logAutoTradeEvent(
    userId,
    success ? AutoTradeLogType.SUCCESS : AutoTradeLogType.ERROR,
    message,
    {
      cryptoId,
      symbol,
      action,
      price,
      shares,
      totalValue,
      success,
      krakenOrderId,
      transactionId,
      errorMessage
    }
  );
}