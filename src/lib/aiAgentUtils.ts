import prisma from '@/lib/prisma';

/**
 * Interface for the AI Agent data structure
 */
export interface AIAgentData {
  timestamp: string;
  account_summary: {
    available_cash_usd: number;
    allocation: Record<string, {
      symbol: string;
      quantity: number;
      value_usd: number;
      percentage: number;
    }>;
  };
  trading_constraints: {
    max_trade_value: number;
    max_daily_trades: number;
    min_risk_reward: number;
    blacklisted_assets: string[];
  };
  performance_metrics: {
    daily_pnl: number | null;
    weekly_pnl: number | null;
    monthly_pnl: number | null;
    sharpe_ratio: number | null;
    max_drawdown: number | null;
  };
  open_positions: Array<{
    asset: string;
    entry_price: number;
    quantity: number;
    current_value: number;
    profit_loss: number;
    take_profit: number | null;
    stop_loss: number | null;
  }>;
}

/**
 * Generate AI Agent data structure
 * @param userId The user ID
 * @returns The AI Agent data structure
 */
export async function generateAIAgentData(userId: string): Promise<AIAgentData> {
  try {
    // Get user's USD balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { usdBalance: true }
    });

    // Get AI Agent settings
    const aiAgentSettings = await prisma.aIAgentSettings.findUnique({
      where: { userId },
    }) || {
      maxTradeValue: 100.00,
      maxDailyTrades: 5,
      minRiskReward: 2.0,
      blacklistedAssets: "[]"
    };

    // Get user's cryptocurrencies
    const cryptos = await prisma.crypto.findMany({
      where: { userId },
      include: {
        autoTradeSettings: true
      }
    });

    // Calculate total portfolio value
    const totalPortfolioValue = cryptos.reduce((total, crypto) => {
      const currentValue = (crypto.lastPrice || crypto.purchasePrice) * crypto.shares;
      return total + currentValue;
    }, 0);

    // Create allocation object
    const allocation: Record<string, {
      symbol: string;
      quantity: number;
      value_usd: number;
      percentage: number;
    }> = {};

    // Populate allocation with crypto data
    cryptos.forEach(crypto => {
      const currentPrice = crypto.lastPrice || crypto.purchasePrice;
      const currentValue = currentPrice * crypto.shares;
      const percentage = totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : 0;

      allocation[crypto.symbol] = {
        symbol: crypto.symbol,
        quantity: crypto.shares,
        value_usd: currentValue,
        percentage
      };
    });

    // Create open positions array
    const openPositions = cryptos.map(crypto => {
      const currentPrice = crypto.lastPrice || crypto.purchasePrice;
      const currentValue = currentPrice * crypto.shares;
      const profitLoss = ((currentPrice - crypto.purchasePrice) / crypto.purchasePrice) * 100;
      
      return {
        asset: crypto.symbol,
        entry_price: crypto.purchasePrice,
        quantity: crypto.shares,
        current_value: currentValue,
        profit_loss: profitLoss,
        take_profit: crypto.autoTradeSettings?.sellThresholdPercent 
          ? crypto.purchasePrice * (1 + crypto.autoTradeSettings.sellThresholdPercent / 100)
          : null,
        stop_loss: crypto.autoTradeSettings?.buyThresholdPercent 
          ? crypto.purchasePrice * (1 - crypto.autoTradeSettings.buyThresholdPercent / 100)
          : null
      };
    });

    // Parse blacklisted assets
    let blacklistedAssets: string[] = [];
    try {
      blacklistedAssets = JSON.parse(aiAgentSettings.blacklistedAssets as string);
    } catch (error) {
      console.error('Error parsing blacklisted assets:', error);
      blacklistedAssets = [];
    }

    // Create the AI Agent data structure
    const aiAgentData: AIAgentData = {
      timestamp: new Date().toISOString(),
      account_summary: {
        available_cash_usd: user?.usdBalance || 0,
        allocation
      },
      trading_constraints: {
        max_trade_value: aiAgentSettings.maxTradeValue,
        max_daily_trades: aiAgentSettings.maxDailyTrades,
        min_risk_reward: aiAgentSettings.minRiskReward,
        blacklisted_assets: blacklistedAssets
      },
      performance_metrics: {
        daily_pnl: null,  // To be implemented
        weekly_pnl: null, // To be implemented
        monthly_pnl: null, // To be implemented
        sharpe_ratio: null, // To be implemented
        max_drawdown: null // To be implemented
      },
      open_positions: openPositions
    };

    return aiAgentData;
  } catch (error) {
    console.error('Error generating AI Agent data:', error);
    
    // Return a default structure with empty/null values
    return {
      timestamp: new Date().toISOString(),
      account_summary: {
        available_cash_usd: 0,
        allocation: {}
      },
      trading_constraints: {
        max_trade_value: 100.00,
        max_daily_trades: 5,
        min_risk_reward: 2.0,
        blacklisted_assets: []
      },
      performance_metrics: {
        daily_pnl: null,
        weekly_pnl: null,
        monthly_pnl: null,
        sharpe_ratio: null,
        max_drawdown: null
      },
      open_positions: []
    };
  }
}