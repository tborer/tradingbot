import prisma from '@/lib/prisma';
import { KrakenPrice } from '@/lib/kraken';
import { shouldBuyCrypto, shouldSellCrypto } from '@/lib/kraken';
import { logAutoTradeEvaluation, logAutoTradeExecution, AutoTradeLogType, logAutoTradeEvent } from './autoTradeLogger';

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
      await logAutoTradeEvent(userId, AutoTradeLogType.ERROR, 'User settings not found', {});
      return [{ success: false, message: 'User settings not found' }];
    }

    // Check if auto crypto trading is enabled globally
    if (!settings.enableAutoCryptoTrading) {
      await logAutoTradeEvent(userId, AutoTradeLogType.INFO, 'Auto crypto trading is disabled in settings', {});
      return [{ success: false, message: 'Auto crypto trading is disabled in settings' }];
    }
    
    // Log the start of auto trade processing
    await logAutoTradeEvent(
      userId, 
      AutoTradeLogType.INFO, 
      `Processing auto trades for ${prices.length} price updates`, 
      { priceUpdates: prices.map(p => `${p.symbol}: $${p.price}`).join(', ') }
    );

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
      const oneTimeBuy = crypto.autoTradeSettings?.oneTimeBuy || false;
      const oneTimeSell = crypto.autoTradeSettings?.oneTimeSell || false;
      const nextAction = crypto.autoTradeSettings?.nextAction || 'buy';
      const tradeByShares = crypto.autoTradeSettings?.tradeByShares || true;
      const tradeByValue = crypto.autoTradeSettings?.tradeByValue || false;
      const sharesAmount = crypto.autoTradeSettings?.sharesAmount || 0;
      const totalValue = crypto.autoTradeSettings?.totalValue || 0;
      const orderType = crypto.autoTradeSettings?.orderType || 'market';
      
      // Validate that either shares amount or total value is properly set
      const hasValidTradeAmount = (tradeByShares && sharesAmount > 0) || (tradeByValue && totalValue > 0);
      
      if (!hasValidTradeAmount) {
        console.log(`Auto trade skipped for ${crypto.symbol}: No valid trade amount configured. sharesAmount=${sharesAmount}, totalValue=${totalValue}`);
        await logAutoTradeEvent(
          userId,
          AutoTradeLogType.WARNING,
          `Auto trade skipped for ${crypto.symbol}: No valid trade amount configured`,
          {
            cryptoId: crypto.id,
            symbol: crypto.symbol,
            tradeByShares,
            sharesAmount,
            tradeByValue,
            totalValue,
            message: "Either shares amount or total value must be greater than zero"
          }
        );
        
        results.push({
          success: false,
          message: `Auto trade skipped for ${crypto.symbol}: No valid trade amount configured`,
          cryptoId: crypto.id,
          symbol: crypto.symbol
        });
        continue;
      }

      // Determine if we should buy or sell
      let shouldTrade = false;
      let action: 'buy' | 'sell' | null = null;

      // Check for auto buy conditions
      if (crypto.autoBuy) {
        console.log(`Checking buy conditions for ${crypto.symbol}: nextAction=${nextAction}, oneTimeBuy=${oneTimeBuy}`);
        
        // Log detailed information about the crypto and its auto trade settings
        const autoTradeSettings = {
          autoBuy: crypto.autoBuy,
          autoSell: crypto.autoSell,
          nextAction,
          oneTimeBuy,
          oneTimeSell,
          enableContinuous,
          buyThreshold,
          sellThreshold,
          tradeByShares,
          sharesAmount,
          tradeByValue,
          totalValue
        };
        
        console.log(`Auto trade settings for ${crypto.symbol}:`, autoTradeSettings);
        
        // Log auto trade settings to database
        await logAutoTradeEvent(
          userId,
          AutoTradeLogType.INFO,
          `Auto trade settings for ${crypto.symbol}`,
          {
            cryptoId: crypto.id,
            symbol: crypto.symbol,
            ...autoTradeSettings
          }
        );
        
        // Check if we should buy based on either nextAction or oneTimeBuy flag
        if ((nextAction === 'buy' || oneTimeBuy)) {
          console.log(`Buy condition check for ${crypto.symbol}: currentPrice=${priceData.price}, purchasePrice=${crypto.purchasePrice}, buyThreshold=${buyThreshold}`);
          
          // Log detailed information about the price comparison
          const priceDifference = crypto.purchasePrice - priceData.price;
          const percentDifference = crypto.purchasePrice > 0 ? (priceDifference / crypto.purchasePrice) * 100 : 0;
          console.log(`Price difference for ${crypto.symbol}: $${priceDifference.toFixed(2)} (${percentDifference.toFixed(2)}%)`);
          console.log(`Buy threshold: ${buyThreshold}%`);
          
          const shouldBuy = shouldBuyCrypto(priceData.price, crypto.purchasePrice, buyThreshold);
          
          // Log the evaluation to the database
          await logAutoTradeEvaluation(
            userId,
            crypto.id,
            crypto.symbol,
            'buy',
            priceData.price,
            crypto.purchasePrice,
            buyThreshold,
            shouldBuy
          );
          
          if (shouldBuy) {
            console.log(`Buy condition met for ${crypto.symbol}!`);
            shouldTrade = true;
            action = 'buy';
          } else {
            console.log(`Buy condition NOT met for ${crypto.symbol}`);
          }
        } else {
          console.log(`Buy action not configured for ${crypto.symbol} (nextAction=${nextAction}, oneTimeBuy=${oneTimeBuy})`);
          await logAutoTradeEvent(
            userId,
            AutoTradeLogType.INFO,
            `Buy action not configured for ${crypto.symbol}`,
            {
              cryptoId: crypto.id,
              symbol: crypto.symbol,
              nextAction,
              oneTimeBuy
            }
          );
        }
      } else {
        console.log(`Auto buy not enabled for ${crypto.symbol}`);
      }

      // Check for auto sell conditions
      if (crypto.autoSell) {
        console.log(`Checking sell conditions for ${crypto.symbol}: nextAction=${nextAction}, oneTimeSell=${oneTimeSell}`);
        
        // Check if we should sell based on either nextAction or oneTimeSell flag
        if ((nextAction === 'sell' || oneTimeSell)) {
          console.log(`Sell condition check for ${crypto.symbol}: currentPrice=${priceData.price}, purchasePrice=${crypto.purchasePrice}, sellThreshold=${sellThreshold}`);
          
          // Calculate and log detailed gain information
          const priceGain = priceData.price - crypto.purchasePrice;
          const percentGain = crypto.purchasePrice > 0 ? ((priceData.price - crypto.purchasePrice) / crypto.purchasePrice) * 100 : 0;
          console.log(`Current gain for ${crypto.symbol}: $${priceGain.toFixed(2)} (${percentGain.toFixed(2)}%)`);
          console.log(`Sell threshold: ${sellThreshold}%`);
          console.log(`Comparison: ${percentGain.toFixed(2)}% >= ${sellThreshold}%: ${percentGain >= sellThreshold}`);
          
          const shouldSell = shouldSellCrypto(priceData.price, crypto.purchasePrice, sellThreshold);
          
          // Log the evaluation to the database
          await logAutoTradeEvaluation(
            userId,
            crypto.id,
            crypto.symbol,
            'sell',
            priceData.price,
            crypto.purchasePrice,
            sellThreshold,
            shouldSell
          );
          
          if (shouldSell) {
            console.log(`Sell condition met for ${crypto.symbol}!`);
            shouldTrade = true;
            action = 'sell';
          } else {
            console.log(`Sell condition NOT met for ${crypto.symbol}`);
          }
        } else {
          console.log(`Sell action not configured for ${crypto.symbol} (nextAction=${nextAction}, oneTimeSell=${oneTimeSell})`);
          await logAutoTradeEvent(
            userId,
            AutoTradeLogType.INFO,
            `Sell action not configured for ${crypto.symbol}`,
            {
              cryptoId: crypto.id,
              symbol: crypto.symbol,
              nextAction,
              oneTimeSell
            }
          );
        }
      } else {
        console.log(`Auto sell not enabled for ${crypto.symbol}`);
      }

      if (shouldTrade && action) {
        // Execute the trade
        try {
          // Determine shares to trade based on settings
          let sharesToTrade = 0;
          let purchaseMethod = 'shares';
          let calculatedTotalValue = 0;
          
          if (tradeByShares && sharesAmount > 0) {
            // Use configured shares amount
            sharesToTrade = sharesAmount;
            purchaseMethod = 'shares';
            // For sell, make sure we don't try to sell more than we have
            if (action === 'sell') {
              sharesToTrade = Math.min(sharesToTrade, crypto.shares);
            }
          } else if (tradeByValue && totalValue > 0) {
            // For buy orders, we'll pass the total value and let the API calculate shares
            if (action === 'buy') {
              calculatedTotalValue = totalValue;
              purchaseMethod = 'totalValue';
              // Still calculate shares for logging purposes
              sharesToTrade = totalValue / priceData.price;
              console.log(`Auto trade by total value: $${totalValue} at price $${priceData.price} = ${sharesToTrade} shares`);
            } else {
              // For sell orders, calculate shares based on total value and current price
              sharesToTrade = totalValue / priceData.price;
              purchaseMethod = 'shares';
              // For sell, make sure we don't try to sell more than we have
              sharesToTrade = Math.min(sharesToTrade, crypto.shares);
            }
          } else {
            // Default to trading 100% of available shares for sell, or a reasonable default for buy
            if (action === 'sell') {
              sharesToTrade = crypto.shares;
              console.log(`Using default sell amount: ${sharesToTrade} shares (100% of holdings)`);
            } else {
              // For buy, use a reasonable default amount (e.g., $100 worth)
              const defaultBuyValue = 100; // $100 worth of crypto
              sharesToTrade = priceData.price > 0 ? defaultBuyValue / priceData.price : 0;
              console.log(`Using default buy amount: ${sharesToTrade} shares ($${defaultBuyValue} worth at $${priceData.price})`);
            }
            purchaseMethod = 'shares';
          }

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

          // Execute the order using the Kraken API
          // Call the execute-order API endpoint to use the Kraken API
          const executeOrderResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/api/cryptos/execute-order`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              cryptoId: crypto.id,
              action,
              shares: purchaseMethod === 'shares' ? sharesToTrade : undefined,
              price: priceData.price,
              orderType: orderType,
              isAutoOrder: true,
              totalValue: purchaseMethod === 'totalValue' ? calculatedTotalValue : undefined,
              purchaseMethod
            })
          });

          const executeOrderResult = await executeOrderResponse.json();

          if (!executeOrderResponse.ok) {
            const errorMessage = executeOrderResult.error || 'Failed to execute order via Kraken API';
            
            // Log the failed execution
            await logAutoTradeExecution(
              userId,
              crypto.id,
              crypto.symbol,
              action,
              priceData.price,
              sharesToTrade,
              false,
              undefined,
              undefined,
              errorMessage
            );
            
            throw new Error(errorMessage);
          }

          // If this is a one-time trade, disable the auto flag
          if (!enableContinuous) {
            await prisma.crypto.update({
              where: { id: crypto.id },
              data: {
                autoBuy: action === 'sell' ? crypto.autoBuy : false,
                autoSell: action === 'buy' ? crypto.autoSell : false
              }
            });
            
            // Log the disabling of auto trade
            await logAutoTradeEvent(
              userId,
              AutoTradeLogType.INFO,
              `Disabled auto ${action === 'buy' ? 'buy' : 'sell'} for ${crypto.symbol} after one-time trade`,
              {
                cryptoId: crypto.id,
                symbol: crypto.symbol,
                action
              }
            );
          } else {
            // For continuous trading, flip the next action after successful transaction
            const newNextAction = action === 'buy' ? 'sell' : 'buy';
            
            console.log(`Flipping next action for ${crypto.symbol} from ${action} to ${newNextAction} after successful transaction`);
            
            if (crypto.autoTradeSettings) {
              await prisma.cryptoAutoTradeSettings.update({
                where: { id: crypto.autoTradeSettings.id },
                data: { nextAction: newNextAction }
              });
              
              // Log the action flip
              await logAutoTradeEvent(
                userId,
                AutoTradeLogType.INFO,
                `Flipped next action for ${crypto.symbol} from ${action} to ${newNextAction}`,
                {
                  cryptoId: crypto.id,
                  symbol: crypto.symbol,
                  previousAction: action,
                  newAction: newNextAction
                }
              );
            }
          }
          
          // Log the successful execution
          await logAutoTradeExecution(
            userId,
            crypto.id,
            crypto.symbol,
            action,
            priceData.price,
            sharesToTrade,
            true,
            executeOrderResult.krakenOrderId,
            executeOrderResult.transaction?.id
          );

          results.push({
            success: true,
            message: `Successfully executed auto ${action} for ${crypto.symbol} via Kraken API`,
            cryptoId: crypto.id,
            symbol: crypto.symbol,
            action,
            shares: sharesToTrade,
            price: priceData.price,
            krakenOrderId: executeOrderResult.krakenOrderId
          });
        } catch (error) {
          console.error(`Error executing auto ${action} for ${crypto.symbol}:`, error);
          
          // Log the execution error
          await logAutoTradeExecution(
            userId,
            crypto.id,
            crypto.symbol,
            action,
            priceData.price,
            sharesToTrade,
            false,
            undefined,
            undefined,
            error.message
          );
          
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

    // Log the summary of results
    await logAutoTradeEvent(
      userId,
      AutoTradeLogType.INFO,
      `Auto trade processing completed with ${results.length} results`,
      {
        resultsCount: results.length,
        successCount: results.filter(r => r.success).length,
        failureCount: results.filter(r => !r.success).length,
        summary: results.map(r => 
          `${r.symbol || 'unknown'}: ${r.success ? 'SUCCESS' : 'FAILED'} - ${r.message} ${r.action ? `(${r.action})` : ''}`
        ).join('\n')
      }
    );
    
    return results;
  } catch (error) {
    console.error('Error in processAutoCryptoTrades:', error);
    
    // Log the error
    await logAutoTradeEvent(
      userId,
      AutoTradeLogType.ERROR,
      `Error processing auto trades: ${error.message}`,
      {
        error: error.message,
        stack: error.stack
      }
    ).catch(logError => {
      console.error('Failed to log auto trade error:', logError);
    });
    
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
      await logAutoTradeEvent(userId, AutoTradeLogType.ERROR, 'User settings not found', { cryptoId });
      return { success: false, message: 'User settings not found' };
    }

    // Check if auto crypto trading is enabled globally
    if (!settings.enableAutoCryptoTrading) {
      await logAutoTradeEvent(userId, AutoTradeLogType.INFO, 'Auto crypto trading is disabled in settings', { cryptoId });
      return { success: false, message: 'Auto crypto trading is disabled in settings' };
    }
    
    // Log the start of auto trade check
    await logAutoTradeEvent(
      userId, 
      AutoTradeLogType.INFO, 
      `Checking auto trade for crypto ID ${cryptoId} at price $${price}`, 
      { cryptoId, price }
    );

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
    const oneTimeBuy = crypto.autoTradeSettings?.oneTimeBuy || false;
    const oneTimeSell = crypto.autoTradeSettings?.oneTimeSell || false;
    const nextAction = crypto.autoTradeSettings?.nextAction || 'buy';
    const tradeByShares = crypto.autoTradeSettings?.tradeByShares || true;
    const tradeByValue = crypto.autoTradeSettings?.tradeByValue || false;
    const sharesAmount = crypto.autoTradeSettings?.sharesAmount || 0;
    const totalValue = crypto.autoTradeSettings?.totalValue || 0;
    const orderType = crypto.autoTradeSettings?.orderType || 'market';
    
    // Validate that either shares amount or total value is properly set
    const hasValidTradeAmount = (tradeByShares && sharesAmount > 0) || (tradeByValue && totalValue > 0);
    
    if (!hasValidTradeAmount) {
      console.log(`Auto trade skipped for ${crypto.symbol}: No valid trade amount configured. sharesAmount=${sharesAmount}, totalValue=${totalValue}`);
      await logAutoTradeEvent(
        userId,
        AutoTradeLogType.WARNING,
        `Auto trade skipped for ${crypto.symbol}: No valid trade amount configured`,
        {
          cryptoId: crypto.id,
          symbol: crypto.symbol,
          tradeByShares,
          sharesAmount,
          tradeByValue,
          totalValue,
          message: "Either shares amount or total value must be greater than zero"
        }
      );
      
      return {
        success: false,
        message: `Auto trade skipped for ${crypto.symbol}: No valid trade amount configured`,
        cryptoId: crypto.id,
        symbol: crypto.symbol
      };
    }

    // Determine if we should buy or sell
    let shouldTrade = false;
    let action: 'buy' | 'sell' | null = null;

    // Check for auto buy conditions
    if (crypto.autoBuy) {
      console.log(`Checking buy conditions for ${crypto.symbol}: nextAction=${nextAction}, oneTimeBuy=${oneTimeBuy}`);
      
      // Log detailed information about the crypto and its auto trade settings
      console.log(`Auto trade settings for ${crypto.symbol} (single check):`, {
        autoBuy: crypto.autoBuy,
        autoSell: crypto.autoSell,
        nextAction,
        oneTimeBuy,
        oneTimeSell,
        enableContinuous,
        buyThreshold,
        sellThreshold,
        tradeByShares,
        sharesAmount,
        tradeByValue,
        totalValue
      });
      
      // Check if we should buy based on either nextAction or oneTimeBuy flag
      if ((nextAction === 'buy' || oneTimeBuy)) {
        console.log(`Buy condition check for ${crypto.symbol}: currentPrice=${price}, purchasePrice=${crypto.purchasePrice}, buyThreshold=${buyThreshold}`);
        
        // Log detailed information about the price comparison
        const priceDifference = crypto.purchasePrice - price;
        const percentDifference = crypto.purchasePrice > 0 ? (priceDifference / crypto.purchasePrice) * 100 : 0;
        console.log(`Price difference for ${crypto.symbol}: $${priceDifference.toFixed(2)} (${percentDifference.toFixed(2)}%)`);
        console.log(`Buy threshold: ${buyThreshold}%`);
        console.log(`Comparison: ${percentDifference.toFixed(2)}% >= ${buyThreshold}%: ${percentDifference >= buyThreshold}`);
        
        if (shouldBuyCrypto(price, crypto.purchasePrice, buyThreshold)) {
          console.log(`Buy condition met for ${crypto.symbol}!`);
          shouldTrade = true;
          action = 'buy';
        } else {
          console.log(`Buy condition NOT met for ${crypto.symbol}`);
        }
      } else {
        console.log(`Buy action not configured for ${crypto.symbol} (nextAction=${nextAction}, oneTimeBuy=${oneTimeBuy})`);
      }
    } else {
      console.log(`Auto buy not enabled for ${crypto.symbol}`);
    }

    // Check for auto sell conditions
    if (crypto.autoSell) {
      console.log(`Checking sell conditions for ${crypto.symbol}: nextAction=${nextAction}, oneTimeSell=${oneTimeSell}`);
      // Check if we should sell based on either nextAction or oneTimeSell flag
      if ((nextAction === 'sell' || oneTimeSell)) {
        console.log(`Sell condition check for ${crypto.symbol}: currentPrice=${price}, purchasePrice=${crypto.purchasePrice}, sellThreshold=${sellThreshold}`);
        
        // Calculate and log detailed gain information
        const priceGain = price - crypto.purchasePrice;
        const percentGain = crypto.purchasePrice > 0 ? ((price - crypto.purchasePrice) / crypto.purchasePrice) * 100 : 0;
        console.log(`Current gain for ${crypto.symbol}: $${priceGain.toFixed(2)} (${percentGain.toFixed(2)}%)`);
        console.log(`Sell threshold: ${sellThreshold}%`);
        console.log(`Comparison: ${percentGain.toFixed(2)}% >= ${sellThreshold}%: ${percentGain >= sellThreshold}`);
        
        if (shouldSellCrypto(price, crypto.purchasePrice, sellThreshold)) {
          console.log(`Sell condition met for ${crypto.symbol}!`);
          shouldTrade = true;
          action = 'sell';
        } else {
          console.log(`Sell condition NOT met for ${crypto.symbol}`);
        }
      } else {
        console.log(`Sell action not configured for ${crypto.symbol} (nextAction=${nextAction}, oneTimeSell=${oneTimeSell})`);
      }
    } else {
      console.log(`Auto sell not enabled for ${crypto.symbol}`);
    }

    if (shouldTrade && action) {
      // Execute the trade
      try {
        // Determine shares to trade based on settings
        let sharesToTrade = 0;
        let purchaseMethod = 'shares';
        let calculatedTotalValue = 0;
        
        if (tradeByShares && sharesAmount > 0) {
          // Use configured shares amount
          sharesToTrade = sharesAmount;
          purchaseMethod = 'shares';
          // For sell, make sure we don't try to sell more than we have
          if (action === 'sell') {
            sharesToTrade = Math.min(sharesToTrade, crypto.shares);
          }
        } else if (tradeByValue && totalValue > 0) {
          // For buy orders, we'll pass the total value and let the API calculate shares
          if (action === 'buy') {
            calculatedTotalValue = totalValue;
            purchaseMethod = 'totalValue';
            // Still calculate shares for logging purposes
            sharesToTrade = totalValue / price;
            console.log(`Auto trade by total value: $${totalValue} at price $${price} = ${sharesToTrade} shares`);
          } else {
            // For sell orders, calculate shares based on total value and current price
            sharesToTrade = totalValue / price;
            purchaseMethod = 'shares';
            // For sell, make sure we don't try to sell more than we have
            sharesToTrade = Math.min(sharesToTrade, crypto.shares);
          }
        } else {
          // Default to trading 100% of available shares for sell, or a reasonable default for buy
          if (action === 'sell') {
            sharesToTrade = crypto.shares;
            console.log(`Using default sell amount: ${sharesToTrade} shares (100% of holdings)`);
          } else {
            // For buy, use a reasonable default amount (e.g., $100 worth)
            const defaultBuyValue = 100; // $100 worth of crypto
            sharesToTrade = price > 0 ? defaultBuyValue / price : 0;
            console.log(`Using default buy amount: ${sharesToTrade} shares ($${defaultBuyValue} worth at $${price})`);
          }
          purchaseMethod = 'shares';
        }

        if (sharesToTrade <= 0) {
          return {
            success: false,
            message: `Invalid shares amount for ${crypto.symbol}`,
            cryptoId: crypto.id,
            symbol: crypto.symbol,
            action
          };
        }

        // Execute the order using the Kraken API
        // Call the execute-order API endpoint to use the Kraken API
        const executeOrderResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/api/cryptos/execute-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cryptoId: crypto.id,
            action,
            shares: purchaseMethod === 'shares' ? sharesToTrade : undefined,
            price,
            orderType: orderType,
            isAutoOrder: true,
            totalValue: purchaseMethod === 'totalValue' ? calculatedTotalValue : undefined,
            purchaseMethod
          })
        });

        const executeOrderResult = await executeOrderResponse.json();

        if (!executeOrderResponse.ok) {
          throw new Error(executeOrderResult.error || 'Failed to execute order via Kraken API');
        }

        // If this is a one-time trade, disable the auto flag
        if (!enableContinuous) {
          await prisma.crypto.update({
            where: { id: crypto.id },
            data: {
              autoBuy: action === 'sell' ? crypto.autoBuy : false,
              autoSell: action === 'buy' ? crypto.autoSell : false
            }
          });
          
          console.log(`Disabled auto ${action === 'buy' ? 'buy' : 'sell'} for ${crypto.symbol} after one-time trade`);
        } else {
          // Flip the next action for continuous trading
          const newNextAction = action === 'buy' ? 'sell' : 'buy';
          
          console.log(`Flipping next action for ${crypto.symbol} from ${action} to ${newNextAction} after successful transaction`);
          
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
          
          console.log(`Updated next action for ${crypto.symbol} to ${newNextAction}`);
        }

        return {
          success: true,
          message: `Successfully executed auto ${action} for ${crypto.symbol} via Kraken API`,
          cryptoId: crypto.id,
          symbol: crypto.symbol,
          action,
          shares: sharesToTrade,
          price,
          krakenOrderId: executeOrderResult.krakenOrderId
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