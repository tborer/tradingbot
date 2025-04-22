import prisma from '@/lib/prisma';
import { autoTradeLogger } from '@/lib/autoTradeLogger';
import { autoTradeLock } from '@/lib/autoTradeLock';

// Function to process a buy transaction for micro processing
export async function processMicroBuy(cryptoId: string, symbol: string, userId: string, currentPrice: number) {
  try {
    // Check if there's already a lock for this crypto
    const isLocked = await autoTradeLock.isLocked(cryptoId);
    if (isLocked) {
      autoTradeLogger.log(`Micro processing: ${symbol} is already locked for trading. Skipping.`);
      return;
    }

    // Get the micro processing settings
    const settings = await prisma.microProcessingSettings.findUnique({
      where: { cryptoId }
    });

    if (!settings || !settings.enabled) {
      return;
    }

    // Check if we're already in a buying or selling state
    if (settings.processingStatus === 'buying' || settings.processingStatus === 'selling') {
      autoTradeLogger.log(`Micro processing: ${symbol} is already in ${settings.processingStatus} state. Skipping.`);
      return;
    }

    // Acquire a lock for this crypto
    await autoTradeLock.acquireLock(cryptoId, symbol, userId, 'buy');

    try {
      // Update the status to buying
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'buying' }
      });

      // Calculate shares and total amount based on settings
      let shares: number;
      let totalAmount: number;
      
      if (settings.tradeByValue) {
        // If trading by value, calculate shares based on current price
        totalAmount = settings.totalValue;
        shares = totalAmount / currentPrice;
        autoTradeLogger.log(`Micro processing: Trading by value - $${totalAmount} worth of ${symbol} at $${currentPrice} per share = ${shares} shares`);
      } else {
        // If trading by shares, use the specified number of shares
        shares = settings.tradeByShares;
        totalAmount = shares * currentPrice;
      }

      // Check if user has enough USD balance
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user || user.usdBalance < totalAmount) {
        autoTradeLogger.log(`Micro processing: Not enough USD balance to buy ${shares} shares of ${symbol} at $${currentPrice}. Required: $${totalAmount}, Available: $${user?.usdBalance || 0}`);
        
        // Reset the processing status
        await prisma.microProcessingSettings.update({
          where: { cryptoId },
          data: { processingStatus: 'idle' }
        });
        
        return;
      }

      // Create the transaction
      const transaction = await prisma.cryptoTransaction.create({
        data: {
          cryptoId,
          action: 'buy',
          shares,
          price: currentPrice,
          totalAmount,
          userId,
          logInfo: `Micro processing buy: ${shares} shares at $${currentPrice}`
        }
      });

      // Update the crypto shares
      const crypto = await prisma.crypto.findUnique({
        where: { id: cryptoId }
      });

      if (crypto) {
        await prisma.crypto.update({
          where: { id: cryptoId },
          data: {
            shares: crypto.shares + shares
          }
        });
      }

      // Update the user's USD balance
      await prisma.user.update({
        where: { id: userId },
        data: {
          usdBalance: user.usdBalance - totalAmount
        }
      });

      // Update the micro processing settings with the buy information
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: {
          lastBuyPrice: currentPrice,
          lastBuyShares: shares,
          lastBuyTimestamp: new Date(),
          processingStatus: 'selling' // Move to selling state
        }
      });

      autoTradeLogger.log(`Micro processing: Successfully bought ${shares} shares of ${symbol} at $${currentPrice}. Total: $${totalAmount}. Transaction ID: ${transaction.id}`);
    } finally {
      // Release the lock
      await autoTradeLock.releaseLock(cryptoId);
    }
  } catch (error) {
    autoTradeLogger.log(`Error in processMicroBuy for ${symbol}: ${error.message}`);
    
    // Try to reset the processing status and release the lock
    try {
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
      await autoTradeLock.releaseLock(cryptoId);
    } catch (cleanupError) {
      autoTradeLogger.log(`Error cleaning up after failed micro buy for ${symbol}: ${cleanupError.message}`);
    }
  }
}

// Function to process a sell transaction for micro processing
export async function processMicroSell(cryptoId: string, symbol: string, userId: string, currentPrice: number) {
  try {
    // Check if there's already a lock for this crypto
    const isLocked = await autoTradeLock.isLocked(cryptoId);
    if (isLocked) {
      autoTradeLogger.log(`Micro processing: ${symbol} is already locked for trading. Skipping.`);
      return;
    }

    // Get the micro processing settings
    const settings = await prisma.microProcessingSettings.findUnique({
      where: { cryptoId }
    });

    if (!settings || !settings.enabled || settings.processingStatus !== 'selling') {
      return;
    }

    // Check if we have a last buy price to compare against
    if (!settings.lastBuyPrice || !settings.lastBuyShares) {
      autoTradeLogger.log(`Micro processing: No last buy information for ${symbol}. Resetting to idle state.`);
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
      return;
    }

    // Calculate the current percentage change from the last buy
    const percentChange = ((currentPrice - settings.lastBuyPrice) / settings.lastBuyPrice) * 100;

    // Check if we've reached the sell percentage threshold
    if (percentChange < settings.sellPercentage) {
      // Not yet reached the sell threshold
      return;
    }

    // Acquire a lock for this crypto
    await autoTradeLock.acquireLock(cryptoId, symbol, userId, 'sell');

    try {
      // Get the crypto to check available shares
      const crypto = await prisma.crypto.findUnique({
        where: { id: cryptoId }
      });

      if (!crypto) {
        autoTradeLogger.log(`Micro processing: Crypto ${symbol} not found.`);
        return;
      }

      // Make sure we have enough shares to sell
      const sharesToSell = settings.lastBuyShares;
      if (crypto.shares < sharesToSell) {
        autoTradeLogger.log(`Micro processing: Not enough shares to sell ${sharesToSell} of ${symbol}. Available: ${crypto.shares}`);
        
        // Reset the processing status if we don't have enough shares
        await prisma.microProcessingSettings.update({
          where: { cryptoId },
          data: { processingStatus: 'idle' }
        });
        
        return;
      }

      // Calculate the total amount
      const totalAmount = sharesToSell * currentPrice;

      // Create the transaction
      const transaction = await prisma.cryptoTransaction.create({
        data: {
          cryptoId,
          action: 'sell',
          shares: sharesToSell,
          price: currentPrice,
          totalAmount,
          userId,
          logInfo: `Micro processing sell: ${sharesToSell} shares at $${currentPrice}. Profit: ${(currentPrice - settings.lastBuyPrice) * sharesToSell}`
        }
      });

      // Update the crypto shares
      await prisma.crypto.update({
        where: { id: cryptoId },
        data: {
          shares: crypto.shares - sharesToSell
        }
      });

      // Update the user's USD balance
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (user) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            usdBalance: user.usdBalance + totalAmount
          }
        });
      }

      // Reset the micro processing settings for the next cycle
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: {
          lastBuyPrice: null,
          lastBuyShares: null,
          lastBuyTimestamp: null,
          processingStatus: 'idle' // Reset to idle state for next cycle
        }
      });

      autoTradeLogger.log(`Micro processing: Successfully sold ${sharesToSell} shares of ${symbol} at $${currentPrice}. Total: $${totalAmount}. Profit: ${(currentPrice - settings.lastBuyPrice) * sharesToSell}. Transaction ID: ${transaction.id}`);
    } finally {
      // Release the lock
      await autoTradeLock.releaseLock(cryptoId);
    }
  } catch (error) {
    autoTradeLogger.log(`Error in processMicroSell for ${symbol}: ${error.message}`);
    
    // Try to reset the processing status and release the lock
    try {
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
      await autoTradeLock.releaseLock(cryptoId);
    } catch (cleanupError) {
      autoTradeLogger.log(`Error cleaning up after failed micro sell for ${symbol}: ${cleanupError.message}`);
    }
  }
}

// Main function to process micro processing for all enabled cryptos
export async function processMicroProcessing(userId: string) {
  try {
    // Get all cryptos with enabled micro processing
    const cryptosWithMicroProcessing = await prisma.crypto.findMany({
      where: {
        userId,
        microProcessingSettings: {
          enabled: true
        }
      },
      include: {
        microProcessingSettings: true
      }
    });

    if (cryptosWithMicroProcessing.length === 0) {
      return;
    }

    autoTradeLogger.log(`Processing micro trading for ${cryptosWithMicroProcessing.length} cryptos`);

    // Process each crypto
    for (const crypto of cryptosWithMicroProcessing) {
      if (!crypto.lastPrice) {
        autoTradeLogger.log(`Micro processing: No current price for ${crypto.symbol}. Skipping.`);
        continue;
      }

      const settings = crypto.microProcessingSettings;
      if (!settings) continue;

      if (settings.processingStatus === 'idle' || !settings.processingStatus) {
        // If idle, initiate a buy
        await processMicroBuy(crypto.id, crypto.symbol, userId, crypto.lastPrice);
      } else if (settings.processingStatus === 'selling') {
        // If in selling state, check if we should sell
        await processMicroSell(crypto.id, crypto.symbol, userId, crypto.lastPrice);
      }
    }
  } catch (error) {
    autoTradeLogger.log(`Error in processMicroProcessing: ${error.message}`);
  }
}