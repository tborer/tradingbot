import prisma from '@/lib/prisma';
import { autoTradeLogger } from '@/lib/autoTradeLogger';
import { autoTradeLock } from '@/lib/autoTradeLock';
import { 
  executeBinanceMarketBuy, 
  executeBinanceMarketSell 
} from '@/lib/binanceTradeApi';

// Ensure autoTradeLogger is initialized with a fallback
const logger = autoTradeLogger || {
  log: (message: string) => {
    console.log(`[AutoTradeLogger Fallback] ${message}`);
  }
};

// Function to process a buy transaction for micro processing
export async function processMicroBuy(cryptoId: string, symbol: string, userId: string, currentPrice: number) {
  // Validate input parameters
  try {
    if (!cryptoId || !symbol || !userId) {
      logger.log(`Micro processing: Invalid parameters for buy. cryptoId: ${cryptoId}, symbol: ${symbol}, userId: ${userId}`);
      return;
    }
  } catch (error) {
    logger.log(`Micro processing: Error validating input parameters: ${error.message}`);
    console.error('Error validating input parameters:', error);
    return;
  }

  try {
    if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
      autoTradeLogger.log(`Micro processing: Invalid current price for ${symbol}: ${currentPrice}`);
      return;
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error validating current price: ${error.message}`);
    console.error('Error validating current price:', error);
    return;
  }

  try {
    // Check if there's already a lock for this crypto
    const isLocked = await autoTradeLock.isLocked(cryptoId);
    if (isLocked) {
      autoTradeLogger.log(`Micro processing: ${symbol} is already locked for trading. Skipping.`);
      return;
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error checking lock status: ${error.message}`);
    console.error('Error checking lock status:', error);
    return;
  }

  let settings;
  try {
    // Get the micro processing settings
    settings = await prisma.microProcessingSettings.findUnique({
      where: { cryptoId }
    });

    console.log(`Retrieved settings for ${symbol}:`, settings);

    if (!settings) {
      autoTradeLogger.log(`Micro processing: No settings found for ${symbol} (${cryptoId})`);
      return;
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error retrieving settings: ${error.message}`);
    console.error('Error retrieving settings:', error);
    return;
  }

  try {
    // Check if settings are enabled
    if (!settings || settings.enabled !== true) {
      autoTradeLogger.log(`Micro processing: Settings disabled for ${symbol}`);
      return;
    }

    // Check if we're already in a buying or selling state
    const processingStatus = settings.processingStatus || 'idle';
    if (processingStatus === 'buying' || processingStatus === 'selling') {
      autoTradeLogger.log(`Micro processing: ${symbol} is already in ${processingStatus} state. Skipping.`);
      return;
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error checking settings status: ${error.message}`);
    console.error('Error checking settings status:', error);
    return;
  }

  let lockAcquired = false;
  try {
    // Acquire a lock for this crypto
    await autoTradeLock.acquireLock(cryptoId, symbol, userId, 'buy');
    lockAcquired = true;
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error acquiring lock: ${error.message}`);
    console.error('Error acquiring lock:', error);
    return;
  }

  try {
    // Update the status to buying
    await prisma.microProcessingSettings.update({
      where: { cryptoId },
      data: { processingStatus: 'buying' }
    });
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error updating processing status: ${error.message}`);
    console.error('Error updating processing status:', error);
    if (lockAcquired) {
      await autoTradeLock.releaseLock(cryptoId);
    }
    return;
  }

  let shares: number = 0;
  let totalAmount: number = 0;
  
  try {
    // Calculate shares and total amount based on settings
    if (settings.tradeByValue === true) {
      // If trading by value, calculate shares based on current price
      totalAmount = typeof settings.totalValue === 'number' ? settings.totalValue : 0;
      
      console.log(`Trading by value - totalAmount: ${totalAmount}, currentPrice: ${currentPrice}`);
      
      if (totalAmount <= 0) {
        throw new Error(`Invalid total value: ${totalAmount}`);
      }
      
      shares = totalAmount / currentPrice;
      autoTradeLogger.log(`Micro processing: Trading by value - $${totalAmount} worth of ${symbol} at $${currentPrice} per share = ${shares} shares`);
    } else {
      // If trading by shares, use the specified number of shares
      shares = typeof settings.tradeByShares === 'number' ? settings.tradeByShares : 0;
      
      console.log(`Trading by shares - shares: ${shares}, currentPrice: ${currentPrice}`);
      
      if (shares <= 0) {
        throw new Error(`Invalid shares value: ${shares}`);
      }
      
      totalAmount = shares * currentPrice;
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error calculating trade amounts: ${error.message}`);
    console.error('Error calculating trade amounts:', error);
    
    // Reset the processing status
    try {
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
    } catch (resetError) {
      console.error('Error resetting processing status:', resetError);
    }
    
    if (lockAcquired) {
      await autoTradeLock.releaseLock(cryptoId);
    }
    return;
  }

  let user;
  try {
    // Check if user has enough USD balance
    user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const userBalance = typeof user.usdBalance === 'number' ? user.usdBalance : 0;
    
    if (userBalance < totalAmount) {
      autoTradeLogger.log(`Micro processing: Not enough USD balance to buy ${shares} shares of ${symbol} at $${currentPrice}. Required: $${totalAmount}, Available: $${userBalance}`);
      
      // Reset the processing status
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
      
      if (lockAcquired) {
        await autoTradeLock.releaseLock(cryptoId);
      }
      return;
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error checking user balance: ${error.message}`);
    console.error('Error checking user balance:', error);
    
    // Reset the processing status
    try {
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
    } catch (resetError) {
      console.error('Error resetting processing status:', resetError);
    }
    
    if (lockAcquired) {
      await autoTradeLock.releaseLock(cryptoId);
    }
    return;
  }

  let transaction;
  try {
    // Check if test mode is enabled
    const testMode = settings.testMode === true;
    const tradingPlatform = settings.tradingPlatform || 'kraken';
    
    // Handle Binance trading platform
    if (tradingPlatform === 'binance') {
      try {
        autoTradeLogger.log(`Micro processing: Using Binance trading platform for ${symbol}`);
        
        // Execute Binance market buy
        const binanceResult = await executeBinanceMarketBuy(userId, symbol, shares, testMode);
        
        // Create transaction record
        const transactionData = {
          cryptoId,
          action: testMode ? 'test_buy' : 'buy',
          shares,
          price: currentPrice,
          totalAmount,
          userId,
          apiRequest: JSON.stringify({
            action: 'buy',
            shares,
            price: currentPrice,
            totalAmount,
            cryptoId,
            symbol,
            testMode,
            platform: 'binance'
          }, null, 2),
          apiResponse: JSON.stringify(binanceResult, null, 2),
          logInfo: `Micro processing buy via Binance: ${shares} shares at $${currentPrice}. Total: $${totalAmount}.`
        };
        
        transaction = await prisma.cryptoTransaction.create({ data: transactionData });
        
        // If not in test mode, update crypto shares and user balance
        if (!testMode) {
          // Update the crypto shares
          const crypto = await prisma.crypto.findUnique({
            where: { id: cryptoId }
          });

          if (!crypto) {
            throw new Error(`Crypto not found: ${cryptoId}`);
          }

          const currentShares = typeof crypto.shares === 'number' ? crypto.shares : 0;
          
          await prisma.crypto.update({
            where: { id: cryptoId },
            data: {
              shares: currentShares + shares
            }
          });

          // Update the user's USD balance
          const userBalance = typeof user.usdBalance === 'number' ? user.usdBalance : 0;
          
          await prisma.user.update({
            where: { id: userId },
            data: {
              usdBalance: userBalance - totalAmount
            }
          });
        }
        
        autoTradeLogger.log(`Micro processing: Binance buy executed successfully. Transaction ID: ${transaction.id}`);
      } catch (error) {
        autoTradeLogger.log(`Micro processing: Error executing Binance buy: ${error.message}`);
        throw error;
      }
    } else {
      // Default platform (kraken or other)
      if (testMode) {
        // In test mode, just log the transaction details without executing it
        autoTradeLogger.log(`TEST MODE - Micro processing buy: Would buy ${shares} shares of ${symbol} at $${currentPrice}. Total: $${totalAmount}`);
        
        // Create a test transaction record with the API request details
        const testTransaction = await prisma.cryptoTransaction.create({
          data: {
            cryptoId,
            action: 'test_buy',
            shares,
            price: currentPrice,
            totalAmount,
            userId,
            apiRequest: JSON.stringify({
              action: 'buy',
              shares,
              price: currentPrice,
              totalAmount,
              cryptoId,
              symbol,
              testMode: true
            }, null, 2),
            logInfo: `TEST MODE - Micro processing buy: ${shares} shares at $${currentPrice}. Total: $${totalAmount}. No actual trade executed.`
          }
        });
        
        transaction = testTransaction;
        autoTradeLogger.log(`TEST MODE - Created test transaction record: ${testTransaction.id}`);
      } else {
        // Create the real transaction
        const realTransaction = await prisma.cryptoTransaction.create({
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
        
        transaction = realTransaction;

        // Update the crypto shares
        const crypto = await prisma.crypto.findUnique({
          where: { id: cryptoId }
        });

        if (!crypto) {
          throw new Error(`Crypto not found: ${cryptoId}`);
        }

        const currentShares = typeof crypto.shares === 'number' ? crypto.shares : 0;
        
        await prisma.crypto.update({
          where: { id: cryptoId },
          data: {
            shares: currentShares + shares
          }
        });

        // Update the user's USD balance
        const userBalance = typeof user.usdBalance === 'number' ? user.usdBalance : 0;
        
        await prisma.user.update({
          where: { id: userId },
          data: {
            usdBalance: userBalance - totalAmount
          }
        });
      }
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error executing buy transaction: ${error.message}`);
    console.error('Error executing buy transaction:', error);
    
    // Reset the processing status
    try {
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
    } catch (resetError) {
      console.error('Error resetting processing status:', resetError);
    }
    
    if (lockAcquired) {
      await autoTradeLock.releaseLock(cryptoId);
    }
    return;
  }

  try {
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
    
    autoTradeLogger.log(`Micro processing: Successfully bought ${shares} shares of ${symbol} at $${currentPrice}. Total: $${totalAmount}. Transaction ID: ${transaction?.id}`);
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error updating settings after buy: ${error.message}`);
    console.error('Error updating settings after buy:', error);
    // We don't return here as the transaction was already completed
  } finally {
    if (lockAcquired) {
      try {
        // Release the lock
        await autoTradeLock.releaseLock(cryptoId);
      } catch (error) {
        autoTradeLogger.log(`Micro processing: Error releasing lock: ${error.message}`);
        console.error('Error releasing lock:', error);
      }
    }
  }
}

// Function to process a sell transaction for micro processing
export async function processMicroSell(cryptoId: string, symbol: string, userId: string, currentPrice: number) {
  // Validate input parameters
  try {
    if (!cryptoId || !symbol || !userId) {
      autoTradeLogger.log(`Micro processing: Invalid parameters for sell. cryptoId: ${cryptoId}, symbol: ${symbol}, userId: ${userId}`);
      return;
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error validating input parameters: ${error.message}`);
    console.error('Error validating input parameters:', error);
    return;
  }

  try {
    if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
      autoTradeLogger.log(`Micro processing: Invalid current price for ${symbol}: ${currentPrice}`);
      return;
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error validating current price: ${error.message}`);
    console.error('Error validating current price:', error);
    return;
  }

  try {
    // Check if there's already a lock for this crypto
    const isLocked = await autoTradeLock.isLocked(cryptoId);
    if (isLocked) {
      autoTradeLogger.log(`Micro processing: ${symbol} is already locked for trading. Skipping.`);
      return;
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error checking lock status: ${error.message}`);
    console.error('Error checking lock status:', error);
    return;
  }

  let settings;
  try {
    // Get the micro processing settings
    settings = await prisma.microProcessingSettings.findUnique({
      where: { cryptoId }
    });

    console.log(`Retrieved settings for ${symbol}:`, settings);

    if (!settings) {
      autoTradeLogger.log(`Micro processing: No settings found for ${symbol} (${cryptoId})`);
      return;
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error retrieving settings: ${error.message}`);
    console.error('Error retrieving settings:', error);
    return;
  }

  try {
    // Check if settings are enabled
    if (!settings || settings.enabled !== true) {
      autoTradeLogger.log(`Micro processing: Settings disabled for ${symbol}`);
      return;
    }

    // Check if we're in the selling state
    const processingStatus = settings.processingStatus || 'idle';
    if (processingStatus !== 'selling') {
      autoTradeLogger.log(`Micro processing: ${symbol} is not in selling state (current: ${processingStatus}). Skipping.`);
      return;
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error checking settings status: ${error.message}`);
    console.error('Error checking settings status:', error);
    return;
  }

  // Check if we have a price to compare against (either purchase price or last buy price)
  let referencePrice;
  try {
    referencePrice = settings.purchasePrice !== null && settings.purchasePrice !== undefined ? 
      settings.purchasePrice : 
      (settings.lastBuyPrice !== null && settings.lastBuyPrice !== undefined ? 
        settings.lastBuyPrice : null);
    
    if (referencePrice === null || referencePrice === undefined || isNaN(referencePrice)) {
      autoTradeLogger.log(`Micro processing: No valid reference price for ${symbol}. Resetting to idle state.`);
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
      return;
    }
    
    console.log(`Reference price for ${symbol}: ${referencePrice}`);
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error checking reference price: ${error.message}`);
    console.error('Error checking reference price:', error);
    
    try {
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
    } catch (resetError) {
      console.error('Error resetting processing status:', resetError);
    }
    
    return;
  }

  // Check if we have shares to sell
  let sharesToSell;
  try {
    sharesToSell = settings.lastBuyShares !== null && settings.lastBuyShares !== undefined ? 
      settings.lastBuyShares : null;
    
    if (sharesToSell === null || sharesToSell === undefined || isNaN(sharesToSell) || sharesToSell <= 0) {
      autoTradeLogger.log(`Micro processing: No valid buy shares information for ${symbol}. Resetting to idle state.`);
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
      return;
    }
    
    console.log(`Shares to sell for ${symbol}: ${sharesToSell}`);
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error checking shares to sell: ${error.message}`);
    console.error('Error checking shares to sell:', error);
    
    try {
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
    } catch (resetError) {
      console.error('Error resetting processing status:', resetError);
    }
    
    return;
  }

  // Calculate the current percentage change from the reference price
  let percentChange;
  try {
    percentChange = ((currentPrice - referencePrice) / referencePrice) * 100;
    autoTradeLogger.log(`Micro processing: ${symbol} current price change: ${percentChange.toFixed(2)}%, threshold: ${settings.sellPercentage}%`);

    // Check if we've reached the sell percentage threshold
    const sellPercentage = typeof settings.sellPercentage === 'number' ? settings.sellPercentage : 0.5;
    if (percentChange < sellPercentage) {
      // Not yet reached the sell threshold
      return;
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error calculating percentage change: ${error.message}`);
    console.error('Error calculating percentage change:', error);
    return;
  }

  let lockAcquired = false;
  try {
    // Acquire a lock for this crypto
    await autoTradeLock.acquireLock(cryptoId, symbol, userId, 'sell');
    lockAcquired = true;
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error acquiring lock: ${error.message}`);
    console.error('Error acquiring lock:', error);
    return;
  }

  let crypto;
  try {
    // Get the crypto to check available shares
    crypto = await prisma.crypto.findUnique({
      where: { id: cryptoId }
    });

    if (!crypto) {
      autoTradeLogger.log(`Micro processing: Crypto ${symbol} not found.`);
      if (lockAcquired) {
        await autoTradeLock.releaseLock(cryptoId);
      }
      return;
    }

    // Make sure we have enough shares to sell
    const availableShares = typeof crypto.shares === 'number' ? crypto.shares : 0;
    if (availableShares < sharesToSell) {
      autoTradeLogger.log(`Micro processing: Not enough shares to sell ${sharesToSell} of ${symbol}. Available: ${availableShares}`);
      
      // Reset the processing status if we don't have enough shares
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
      
      if (lockAcquired) {
        await autoTradeLock.releaseLock(cryptoId);
      }
      return;
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error checking available shares: ${error.message}`);
    console.error('Error checking available shares:', error);
    
    try {
      await prisma.microProcessingSettings.update({
        where: { cryptoId },
        data: { processingStatus: 'idle' }
      });
    } catch (resetError) {
      console.error('Error resetting processing status:', resetError);
    }
    
    if (lockAcquired) {
      await autoTradeLock.releaseLock(cryptoId);
    }
    return;
  }

  // Calculate the total amount and profit
  let totalAmount, profit;
  try {
    totalAmount = sharesToSell * currentPrice;
    profit = (currentPrice - referencePrice) * sharesToSell;
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error calculating sell amounts: ${error.message}`);
    console.error('Error calculating sell amounts:', error);
    
    if (lockAcquired) {
      await autoTradeLock.releaseLock(cryptoId);
    }
    return;
  }

  let transaction;
  try {
    // Check if test mode is enabled
    const testMode = settings.testMode === true;
    const tradingPlatform = settings.tradingPlatform || 'kraken';
    
    // Handle Binance trading platform
    if (tradingPlatform === 'binance') {
      try {
        autoTradeLogger.log(`Micro processing: Using Binance trading platform for ${symbol}`);
        
        // Execute Binance market sell
        const binanceResult = await executeBinanceMarketSell(userId, symbol, sharesToSell, testMode);
        
        // Create transaction record
        const transactionData = {
          cryptoId,
          action: testMode ? 'test_sell' : 'sell',
          shares: sharesToSell,
          price: currentPrice,
          totalAmount,
          userId,
          apiRequest: JSON.stringify({
            action: 'sell',
            shares: sharesToSell,
            price: currentPrice,
            totalAmount,
            cryptoId,
            symbol,
            referencePrice,
            profit: profit.toFixed(2),
            testMode,
            platform: 'binance'
          }, null, 2),
          apiResponse: JSON.stringify(binanceResult, null, 2),
          logInfo: `Micro processing sell via Binance: ${sharesToSell} shares at $${currentPrice}. Reference price: $${referencePrice}. Profit: ${profit.toFixed(2)}.`
        };
        
        transaction = await prisma.cryptoTransaction.create({ data: transactionData });
        
        // If not in test mode, update crypto shares and user balance
        if (!testMode) {
          // Update the crypto shares
          const currentShares = typeof crypto.shares === 'number' ? crypto.shares : 0;
          await prisma.crypto.update({
            where: { id: cryptoId },
            data: {
              shares: currentShares - sharesToSell
            }
          });

          // Update the user's USD balance
          const user = await prisma.user.findUnique({
            where: { id: userId }
          });

          if (!user) {
            throw new Error(`User not found: ${userId}`);
          }

          const userBalance = typeof user.usdBalance === 'number' ? user.usdBalance : 0;
          await prisma.user.update({
            where: { id: userId },
            data: {
              usdBalance: userBalance + totalAmount
            }
          });
        }
        
        autoTradeLogger.log(`Micro processing: Binance sell executed successfully. Transaction ID: ${transaction.id}`);
      } catch (error) {
        autoTradeLogger.log(`Micro processing: Error executing Binance sell: ${error.message}`);
        throw error;
      }
    } else {
      // Default platform (kraken or other)
      if (testMode) {
        // In test mode, just log the transaction details without executing it
        autoTradeLogger.log(`TEST MODE - Micro processing sell: Would sell ${sharesToSell} shares of ${symbol} at $${currentPrice}. Total: $${totalAmount}. Profit: ${profit.toFixed(2)}`);
        
        // Create a test transaction record with the API request details
        const testTransaction = await prisma.cryptoTransaction.create({
          data: {
            cryptoId,
            action: 'test_sell',
            shares: sharesToSell,
            price: currentPrice,
            totalAmount,
            userId,
            apiRequest: JSON.stringify({
              action: 'sell',
              shares: sharesToSell,
              price: currentPrice,
              totalAmount,
              cryptoId,
              symbol,
              referencePrice,
              profit: profit.toFixed(2),
              testMode: true
            }, null, 2),
            logInfo: `TEST MODE - Micro processing sell: ${sharesToSell} shares at $${currentPrice}. Reference price: $${referencePrice}. Profit: ${profit.toFixed(2)}. No actual trade executed.`
          }
        });
        
        transaction = testTransaction;
        autoTradeLogger.log(`TEST MODE - Created test transaction record: ${testTransaction.id}`);
      } else {
        // Create the real transaction
        const realTransaction = await prisma.cryptoTransaction.create({
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
        
        transaction = realTransaction;

        // Update the crypto shares
        const currentShares = typeof crypto.shares === 'number' ? crypto.shares : 0;
        await prisma.crypto.update({
          where: { id: cryptoId },
          data: {
            shares: currentShares - sharesToSell
          }
        });

        // Update the user's USD balance
        const user = await prisma.user.findUnique({
          where: { id: userId }
        });

        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }

        const userBalance = typeof user.usdBalance === 'number' ? user.usdBalance : 0;
        await prisma.user.update({
          where: { id: userId },
          data: {
            usdBalance: userBalance + totalAmount
          }
        });
      }
    }
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error executing sell transaction: ${error.message}`);
    console.error('Error executing sell transaction:', error);
    
    if (lockAcquired) {
      await autoTradeLock.releaseLock(cryptoId);
    }
    return;
  }

  try {
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
    
    autoTradeLogger.log(`Micro processing: Successfully sold ${sharesToSell} shares of ${symbol} at $${currentPrice}. Total: $${totalAmount}. Profit: ${profit.toFixed(2)}. Reference price: $${referencePrice}. Transaction ID: ${transaction?.id}`);
  } catch (error) {
    autoTradeLogger.log(`Micro processing: Error updating settings after sell: ${error.message}`);
    console.error('Error updating settings after sell:', error);
  } finally {
    if (lockAcquired) {
      try {
        // Release the lock
        await autoTradeLock.releaseLock(cryptoId);
      } catch (error) {
        autoTradeLogger.log(`Micro processing: Error releasing lock: ${error.message}`);
        console.error('Error releasing lock:', error);
      }
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

        const symbol = crypto.symbol || 'unknown';
        const lastPrice = crypto.lastPrice;
        
        if (lastPrice === null || lastPrice === undefined || isNaN(lastPrice)) {
          autoTradeLogger.log(`Micro processing: No current price for ${symbol}. Skipping.`);
          continue;
        }

        const settings = crypto.microProcessingSettings;
        if (!settings) {
          autoTradeLogger.log(`Micro processing: No settings for ${symbol}. Skipping.`);
          continue;
        }

        // Log the current state for debugging
        const processingStatus = settings.processingStatus || 'idle';
        autoTradeLogger.log(`Micro processing: Processing ${symbol} with status ${processingStatus}`);

        if (processingStatus === 'idle' || !processingStatus) {
          // If idle, initiate a buy
          await processMicroBuy(crypto.id, symbol, userId, lastPrice);
        } else if (processingStatus === 'selling') {
          // If in selling state, check if we should sell
          await processMicroSell(crypto.id, symbol, userId, lastPrice);
        } else {
          autoTradeLogger.log(`Micro processing: Unknown status ${processingStatus} for ${symbol}. Skipping.`);
        }
      } catch (cryptoError) {
        // Log error but continue processing other cryptos
        const symbol = crypto?.symbol || 'unknown';
        autoTradeLogger.log(`Error processing crypto ${symbol}: ${cryptoError.message}`);
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