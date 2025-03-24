import prisma from '@/lib/prisma';
import { KrakenPrice } from '@/lib/kraken';
import { shouldBuyCrypto, shouldSellCrypto } from '@/lib/kraken';

interface AutoTradeResult {
  success: boolean;
  message: string;
  action?: 'buy' | 'sell' | null;
  cryptoId?: string;
  symbol?: string;
  shares?: number;
  price?: number;
}

/**
 * Processes auto trading for all cryptos based on current prices
 * @param prices Current crypto prices from WebSocket
 * @param userId User ID
 */
export async function processAutoCryptoTrades(
  prices: KrakenPrice[],
  userId: string
): Promise<AutoTradeResult[]> {
  const results: AutoTradeResult[] = [];

  try {
    // Get user settings
    const settings = await prisma.settings.findUnique({
      where: { userId }
    });

    if (!settings) {
      return [{ success: false, message: 'User settings not found' }];
    }

    // Check if auto crypto trading is enabled globally
    if (!settings.enableAutoCryptoTrading) {
      return [{ success: false, message: 'Auto crypto trading is disabled in settings' }];
    }

    // Get all cryptos with auto trading enabled
    const cryptos = await prisma.crypto.findMany({
      where: {
        userId,
        OR: [
          { autoBuy: true },
          { autoSell: true }
        ]
      },
      include: {
        autoTradeSettings: true
      }
    });

    if (cryptos.length === 0) {
      return [{ success: false, message: 'No cryptos with auto trading enabled' }];
    }

    // Process each crypto
    for (const crypto of cryptos) {
      // Find current price for this crypto
      const priceData = prices.find(p => p.symbol === crypto.symbol);
      
      if (!priceData) {
        results.push({
          success: false,
          message: `No price data available for ${crypto.symbol}`,
          cryptoId: crypto.id,
          symbol: crypto.symbol
        });
        continue;
      }

      // Get auto trade settings (use crypto-specific settings if available, otherwise use global settings)
      const buyThreshold = crypto.autoTradeSettings?.buyThresholdPercent || settings.buyThresholdPercent;
      const sellThreshold = crypto.autoTradeSettings?.sellThresholdPercent || settings.sellThresholdPercent;
      const enableContinuous = crypto.autoTradeSettings?.enableContinuousTrading || false;
      const nextAction = crypto.autoTradeSettings?.nextAction || 'buy';

      // Determine if we should buy or sell
      let shouldTrade = false;
      let action: 'buy' | 'sell' | null = null;

      if (crypto.autoBuy && nextAction === 'buy') {
        if (shouldBuyCrypto(priceData.price, crypto.purchasePrice, buyThreshold)) {
          shouldTrade = true;
          action = 'buy';
        }
      }

      if (crypto.autoSell && nextAction === 'sell') {
        if (shouldSellCrypto(priceData.price, crypto.purchasePrice, sellThreshold)) {
          shouldTrade = true;
          action = 'sell';
        }
      }

      if (shouldTrade && action) {
        // Execute the trade
        try {
          // Default to trading 100% of available shares for sell, or use purchase price for buy
          const sharesToTrade = action === 'sell' ? crypto.shares : 
            (crypto.purchasePrice > 0 ? 1 / crypto.purchasePrice : 0);

          if (sharesToTrade <= 0) {
            results.push({
              success: false,
              message: `Invalid shares amount for ${crypto.symbol}`,
              cryptoId: crypto.id,
              symbol: crypto.symbol,
              action
            });
            continue;
          }

          // Create transaction record
          const transaction = await prisma.cryptoTransaction.create({
            data: {
              cryptoId: crypto.id,
              action,
              shares: sharesToTrade,
              price: priceData.price,
              totalAmount: sharesToTrade * priceData.price,
              userId,
              logInfo: `Auto ${action} triggered at ${new Date().toISOString()}`
            }
          });

          // Update crypto shares
          const newShares = action === 'buy' 
            ? crypto.shares + sharesToTrade 
            : Math.max(0, crypto.shares - sharesToTrade);

          await prisma.crypto.update({
            where: { id: crypto.id },
            data: { shares: newShares }
          });

          // If this is a one-time trade, disable the auto flag
          if (!enableContinuous) {
            await prisma.crypto.update({
              where: { id: crypto.id },
              data: {
                autoBuy: action === 'sell' ? crypto.autoBuy : false,
                autoSell: action === 'buy' ? crypto.autoSell : false
              }
            });
          } else {
            // Flip the next action for continuous trading
            const newNextAction = action === 'buy' ? 'sell' : 'buy';
            
            if (crypto.autoTradeSettings) {
              await prisma.cryptoAutoTradeSettings.update({
                where: { id: crypto.autoTradeSettings.id },
                data: { nextAction: newNextAction }
              });
            } else {
              // Create settings if they don't exist
              await prisma.cryptoAutoTradeSettings.create({
                data: {
                  cryptoId: crypto.id,
                  buyThresholdPercent: buyThreshold,
                  sellThresholdPercent: sellThreshold,
                  enableContinuousTrading: true,
                  nextAction: newNextAction
                }
              });
            }
            
            // Update the crypto's auto flags
            await prisma.crypto.update({
              where: { id: crypto.id },
              data: {
                autoBuy: newNextAction === 'buy',
                autoSell: newNextAction === 'sell'
              }
            });
          }

          results.push({
            success: true,
            message: `Successfully executed auto ${action} for ${crypto.symbol}`,
            cryptoId: crypto.id,
            symbol: crypto.symbol,
            action,
            shares: sharesToTrade,
            price: priceData.price
          });
        } catch (error) {
          console.error(`Error executing auto ${action} for ${crypto.symbol}:`, error);
          results.push({
            success: false,
            message: `Error executing auto ${action} for ${crypto.symbol}: ${error.message}`,
            cryptoId: crypto.id,
            symbol: crypto.symbol,
            action
          });
        }
      } else {
        results.push({
          success: false,
          message: `No trade conditions met for ${crypto.symbol}`,
          cryptoId: crypto.id,
          symbol: crypto.symbol
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error in processAutoCryptoTrades:', error);
    return [{ success: false, message: `Error processing auto trades: ${error.message}` }];
  }
}

/**
 * Checks if a specific crypto should be auto-traded based on current price
 * @param cryptoId Crypto ID
 * @param price Current price
 * @param userId User ID
 */
export async function checkCryptoForAutoTrade(
  cryptoId: string,
  price: number,
  userId: string
): Promise<AutoTradeResult> {
  try {
    // Get user settings
    const settings = await prisma.settings.findUnique({
      where: { userId }
    });

    if (!settings) {
      return { success: false, message: 'User settings not found' };
    }

    // Check if auto crypto trading is enabled globally
    if (!settings.enableAutoCryptoTrading) {
      return { success: false, message: 'Auto crypto trading is disabled in settings' };
    }

    // Get the crypto with its auto trade settings
    const crypto = await prisma.crypto.findFirst({
      where: {
        id: cryptoId,
        userId,
        OR: [
          { autoBuy: true },
          { autoSell: true }
        ]
      },
      include: {
        autoTradeSettings: true
      }
    });

    if (!crypto) {
      return { success: false, message: 'Crypto not found or auto trading not enabled' };
    }

    // Get auto trade settings
    const buyThreshold = crypto.autoTradeSettings?.buyThresholdPercent || settings.buyThresholdPercent;
    const sellThreshold = crypto.autoTradeSettings?.sellThresholdPercent || settings.sellThresholdPercent;
    const enableContinuous = crypto.autoTradeSettings?.enableContinuousTrading || false;
    const nextAction = crypto.autoTradeSettings?.nextAction || 'buy';

    // Determine if we should buy or sell
    let shouldTrade = false;
    let action: 'buy' | 'sell' | null = null;

    if (crypto.autoBuy && nextAction === 'buy') {
      if (shouldBuyCrypto(price, crypto.purchasePrice, buyThreshold)) {
        shouldTrade = true;
        action = 'buy';
      }
    }

    if (crypto.autoSell && nextAction === 'sell') {
      if (shouldSellCrypto(price, crypto.purchasePrice, sellThreshold)) {
        shouldTrade = true;
        action = 'sell';
      }
    }

    if (shouldTrade && action) {
      // Execute the trade
      try {
        // Default to trading 100% of available shares for sell, or use purchase price for buy
        const sharesToTrade = action === 'sell' ? crypto.shares : 
          (crypto.purchasePrice > 0 ? 1 / crypto.purchasePrice : 0);

        if (sharesToTrade <= 0) {
          return {
            success: false,
            message: `Invalid shares amount for ${crypto.symbol}`,
            cryptoId: crypto.id,
            symbol: crypto.symbol,
            action
          };
        }

        // Create transaction record
        const transaction = await prisma.cryptoTransaction.create({
          data: {
            cryptoId: crypto.id,
            action,
            shares: sharesToTrade,
            price,
            totalAmount: sharesToTrade * price,
            userId,
            logInfo: `Auto ${action} triggered at ${new Date().toISOString()}`
          }
        });

        // Update crypto shares
        const newShares = action === 'buy' 
          ? crypto.shares + sharesToTrade 
          : Math.max(0, crypto.shares - sharesToTrade);

        await prisma.crypto.update({
          where: { id: crypto.id },
          data: { shares: newShares }
        });

        // If this is a one-time trade, disable the auto flag
        if (!enableContinuous) {
          await prisma.crypto.update({
            where: { id: crypto.id },
            data: {
              autoBuy: action === 'sell' ? crypto.autoBuy : false,
              autoSell: action === 'buy' ? crypto.autoSell : false
            }
          });
        } else {
          // Flip the next action for continuous trading
          const newNextAction = action === 'buy' ? 'sell' : 'buy';
          
          if (crypto.autoTradeSettings) {
            await prisma.cryptoAutoTradeSettings.update({
              where: { id: crypto.autoTradeSettings.id },
              data: { nextAction: newNextAction }
            });
          } else {
            // Create settings if they don't exist
            await prisma.cryptoAutoTradeSettings.create({
              data: {
                cryptoId: crypto.id,
                buyThresholdPercent: buyThreshold,
                sellThresholdPercent: sellThreshold,
                enableContinuousTrading: true,
                nextAction: newNextAction
              }
            });
          }
          
          // Update the crypto's auto flags
          await prisma.crypto.update({
            where: { id: crypto.id },
            data: {
              autoBuy: newNextAction === 'buy',
              autoSell: newNextAction === 'sell'
            }
          });
        }

        return {
          success: true,
          message: `Successfully executed auto ${action} for ${crypto.symbol}`,
          cryptoId: crypto.id,
          symbol: crypto.symbol,
          action,
          shares: sharesToTrade,
          price
        };
      } catch (error) {
        console.error(`Error executing auto ${action} for ${crypto.symbol}:`, error);
        return {
          success: false,
          message: `Error executing auto ${action} for ${crypto.symbol}: ${error.message}`,
          cryptoId: crypto.id,
          symbol: crypto.symbol,
          action
        };
      }
    } else {
      return {
        success: false,
        message: `No trade conditions met for ${crypto.symbol}`,
        cryptoId: crypto.id,
        symbol: crypto.symbol
      };
    }
  } catch (error) {
    console.error('Error in checkCryptoForAutoTrade:', error);
    return { success: false, message: `Error checking for auto trade: ${error.message}` };
  }
}