import prisma from '@/lib/prisma';
import { autoTradeLogger } from '@/lib/autoTradeLogger';
import { autoTradeLock } from '@/lib/autoTradeLock';

// Function to process a buy transaction for micro processing
export async function processMicroBuy(cryptoId: string, symbol: string, userId: string, currentPrice: number) {
  try {
    // Validate input parameters
    if (!cryptoId || !symbol || !userId) {
      autoTradeLogger.log(`Micro processing: Invalid parameters for buy. cryptoId: ${cryptoId}, symbol: ${symbol}, userId: ${userId}`);
      return;
    }

    if (!currentPrice || currentPrice <= 0) {
      autoTradeLogger.log(`Micro processing: Invalid current price for ${symbol}: ${currentPrice}`);
      return;
    }

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

    if (!settings) {
      autoTradeLogger.log(`Micro processing: No settings found for ${symbol} (${cryptoId})`);
      return;
    }

    if (!settings.enabled) {
      autoTradeLogger.log(`Micro processing: Settings disabled for ${symbol}`);
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
        totalAmount = settings.totalValue || 0;
        if (totalAmount <= 0) {
          throw new Error(`Invalid total value: ${totalAmount}`);
        }
        shares = totalAmount / currentPrice;
        autoTradeLogger.log(`Micro processing: Trading by value - $${totalAmount} worth of ${symbol} at $${currentPrice} per share = ${shares} shares`);
      } else {
        // If trading by shares, use the specified number of shares
        shares = settings.tradeByShares || 0;
        if (shares <= 0) {
          throw new Error(`Invalid shares value: ${shares}`);
        }
        totalAmount = shares * currentPrice;
      }

      // Check if user has enough USD balance
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      if (user.usdBalance < totalAmount) {
        autoTradeLogger.log(`Micro processing: Not enough USD balance to buy ${shares} shares of ${symbol} at $${currentPrice}. Required: $${totalAmount}, Available: $${user.usdBalance || 0}`);
        
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

      if (!crypto) {
        throw new Error(`Crypto not found: ${cryptoId}`);
      }

      await prisma.crypto.update({
        where: { id: cryptoId },
        data: {
          shares: (crypto.shares || 0) + shares
        }
      });

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
    console.error(`Error in processMicroBuy for ${symbol}:`, error);
    
    // Log additional details about the error
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    
    // Try to reset the processing status and release the lock
    try {
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
      await autoTradeLock.releaseLock(cryptoId);
    } catch (cleanupError) {
      autoTradeLogger.log(`Error cleaning up after failed micro buy for ${symbol}: ${cleanupError.message}`);
      console.error(`Error cleaning up after failed micro buy for ${symbol}:`, cleanupError);
    }
  }
}

// Function to process a sell transaction for micro processing
export async function processMicroSell(cryptoId: string, symbol: string, userId: string, currentPrice: number) {
  try {
    // Validate input parameters
    if (!cryptoId || !symbol || !userId) {
      autoTradeLogger.log(`Micro processing: Invalid parameters for sell. cryptoId: ${cryptoId}, symbol: ${symbol}, userId: ${userId}`);
      return;
    }

    if (!currentPrice || currentPrice <= 0) {
      autoTradeLogger.log(`Micro processing: Invalid current price for ${symbol}: ${currentPrice}`);
      return;
    }

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

    if (!settings) {
      autoTradeLogger.log(`Micro processing: No settings found for ${symbol} (${cryptoId})`);
      return;
    }

    if (!settings.enabled) {
      autoTradeLogger.log(`Micro processing: Settings disabled for ${symbol}`);
      return;
    }

    if (settings.processingStatus !== 'selling') {
      autoTradeLogger.log(`Micro processing: ${symbol} is not in selling state (current: ${settings.processingStatus || 'undefined'}). Skipping.`);
      return;
    }

    // Check if we have a price to compare against (either purchase price or last buy price)
    const referencePrice = settings.purchasePrice || settings.lastBuyPrice;
    
    if (!referencePrice) {
      autoTradeLogger.log(`Micro processing: No reference price for ${symbol}. Resetting to idle state.`);
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
      return;
    }

    if (!settings.lastBuyShares) {
      autoTradeLogger.log(`Micro processing: No buy shares information for ${symbol}. Resetting to idle state.`);
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
      return;
    }

    // Calculate the current percentage change from the reference price
    const percentChange = ((currentPrice - referencePrice) / referencePrice) * 100;
    autoTradeLogger.log(`Micro processing: ${symbol} current price change: ${percentChange.toFixed(2)}%, threshold: ${settings.sellPercentage}%`);

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
      if (!sharesToSell || sharesToSell <= 0) {
        autoTradeLogger.log(`Micro processing: Invalid shares to sell for ${symbol}: ${sharesToSell}`);
        
        // Reset the processing status
        await prisma.microProcessingSettings.update({
          where: { cryptoId },
          data: { processingStatus: 'idle' }
        });
        
        return;
      }

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

      // Calculate profit based on the reference price that was used
      const profit = (currentPrice - referencePrice) * sharesToSell;
      
      // Create the transaction
      const transaction = await prisma.cryptoTransaction.create({
        data: {
          cryptoId,
          action: 'sell',
          shares: sharesToSell,
          price: currentPrice,
          totalAmount,
          userId,
          logInfo: `Micro processing sell: ${sharesToSell} shares at $${currentPrice}. Reference price: $${referencePrice}. Profit: ${profit.toFixed(2)}`
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

      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          usdBalance: user.usdBalance + totalAmount
        }
      });

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
      
      autoTradeLogger.log(`Micro processing: Successfully sold ${sharesToSell} shares of ${symbol} at $${currentPrice}. Total: $${totalAmount}. Profit: ${profit.toFixed(2)}. Reference price: $${referencePrice}. Transaction ID: ${transaction.id}`);
    } finally {
      // Release the lock
      await autoTradeLock.releaseLock(cryptoId);
    }
  } catch (error) {
    autoTradeLogger.log(`Error in processMicroSell for ${symbol}: ${error.message}`);
    console.error(`Error in processMicroSell for ${symbol}:`, error);
    
    // Log additional details about the error
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    
    // Try to reset the processing status and release the lock
    try {
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
      await autoTradeLock.releaseLock(cryptoId);
    } catch (cleanupError) {
      autoTradeLogger.log(`Error cleaning up after failed micro sell for ${symbol}: ${cleanupError.message}`);
      console.error(`Error cleaning up after failed micro sell for ${symbol}:`, cleanupError);
    }
  }
}

// Main function to process micro processing for all enabled cryptos
export async function processMicroProcessing(userId: string) {
  try {
    if (!userId) {
      autoTradeLogger.log(`Error in processMicroProcessing: userId is ${userId}`);
      return;
    }

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

    if (!cryptosWithMicroProcessing || cryptosWithMicroProcessing.length === 0) {
      autoTradeLogger.log(`No enabled micro processing cryptos found for user ${userId}`);
      return;
    }

    autoTradeLogger.log(`Processing micro trading for ${cryptosWithMicroProcessing.length} cryptos`);

    // Process each crypto
    for (const crypto of cryptosWithMicroProcessing) {
      try {
        if (!crypto) {
          autoTradeLogger.log(`Micro processing: Found null crypto in results. Skipping.`);
          continue;
        }

        if (!crypto.lastPrice) {
          autoTradeLogger.log(`Micro processing: No current price for ${crypto.symbol || 'unknown'}. Skipping.`);
          continue;
        }

        const settings = crypto.microProcessingSettings;
        if (!settings) {
          autoTradeLogger.log(`Micro processing: No settings for ${crypto.symbol}. Skipping.`);
          continue;
        }

        // Log the current state for debugging
        autoTradeLogger.log(`Micro processing: Processing ${crypto.symbol} with status ${settings.processingStatus || 'undefined'}`);

        if (settings.processingStatus === 'idle' || !settings.processingStatus) {
          // If idle, initiate a buy
          await processMicroBuy(crypto.id, crypto.symbol, userId, crypto.lastPrice);
        } else if (settings.processingStatus === 'selling') {
          // If in selling state, check if we should sell
          await processMicroSell(crypto.id, crypto.symbol, userId, crypto.lastPrice);
        } else {
          autoTradeLogger.log(`Micro processing: Unknown status ${settings.processingStatus} for ${crypto.symbol}. Skipping.`);
        }
      } catch (cryptoError) {
        // Log error but continue processing other cryptos
        autoTradeLogger.log(`Error processing crypto ${crypto?.symbol || 'unknown'}: ${cryptoError.message}`);
        console.error(`Error processing crypto ${crypto?.id}:`, cryptoError);
      }
    }
  } catch (error) {
    autoTradeLogger.log(`Error in processMicroProcessing: ${error.message}`);
    console.error('Error in processMicroProcessing:', error);
    
    // Log additional details about the error
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
  }
}