import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { processAutoCryptoTrades } from '@/lib/autoTradeService';
import { PrismaClientInitializationError, PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { logAutoTradeEvent, AutoTradeLogType } from '@/lib/autoTradeLogger';
import { executeKrakenOrderAndCreateTransaction } from '@/lib/autoTradeTransaction';

// Add timeout for long-running operations
const PROCESS_TIMEOUT = 25000; // 25 seconds (Vercel functions timeout at 30s)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { prices, cryptoId, action, currentPrice } = req.body;
    
    // Check if this is a direct trade request from client-side evaluation
    if (cryptoId && action && currentPrice) {
      // Log the direct trade request
      await logAutoTradeEvent(
        user.id,
        AutoTradeLogType.INFO,
        `Direct auto trade request for ${cryptoId} (${action}) at $${currentPrice}`,
        { 
          requestMethod: req.method,
          cryptoId,
          action,
          currentPrice
        }
      );
      
      try {
        // Get the crypto details
        const crypto = await prisma.crypto.findFirst({
          where: {
            id: cryptoId,
            userId: user.id
          },
          include: {
            autoTradeSettings: true
          }
        });
        
        if (!crypto) {
          await logAutoTradeEvent(
            user.id,
            AutoTradeLogType.ERROR,
            `Crypto not found for direct trade: ${cryptoId}`,
            { cryptoId }
          );
          return res.status(404).json({ error: 'Crypto not found' });
        }
        
        // Get user settings
        const settings = await prisma.settings.findUnique({
          where: { userId: user.id }
        });
        
        if (!settings || !settings.krakenApiKey || !settings.krakenApiSign) {
          await logAutoTradeEvent(
            user.id,
            AutoTradeLogType.ERROR,
            `Kraken API credentials not found for direct trade`,
            { cryptoId }
          );
          return res.status(400).json({ error: 'Kraken API credentials not configured' });
        }
        
        // Determine shares to trade
        let sharesToTrade = 0;
        const tradeByShares = crypto.autoTradeSettings?.tradeByShares || true;
        const tradeByValue = crypto.autoTradeSettings?.tradeByValue || false;
        const sharesAmount = crypto.autoTradeSettings?.sharesAmount || 0;
        const totalValue = crypto.autoTradeSettings?.totalValue || 0;
        const orderType = crypto.autoTradeSettings?.orderType || 'market';
        
        if (tradeByShares && sharesAmount > 0) {
          sharesToTrade = sharesAmount;
          if (action === 'sell') {
            sharesToTrade = Math.min(sharesToTrade, crypto.shares);
          }
        } else if (tradeByValue && totalValue > 0) {
          if (action === 'buy') {
            sharesToTrade = totalValue / currentPrice;
          } else {
            sharesToTrade = totalValue / currentPrice;
            sharesToTrade = Math.min(sharesToTrade, crypto.shares);
          }
        } else {
          if (action === 'sell') {
            sharesToTrade = crypto.shares;
          } else {
            const defaultBuyValue = 100;
            sharesToTrade = currentPrice > 0 ? defaultBuyValue / currentPrice : 0;
          }
        }
        
        if (sharesToTrade <= 0) {
          await logAutoTradeEvent(
            user.id,
            AutoTradeLogType.ERROR,
            `Invalid shares amount for direct trade: ${sharesToTrade}`,
            { cryptoId, action, currentPrice, sharesToTrade }
          );
          return res.status(400).json({ error: 'Invalid shares amount' });
        }
        
        // Execute the order
        const executeOrderResult = await executeKrakenOrderAndCreateTransaction(
          user.id,
          cryptoId,
          crypto.symbol,
          action,
          sharesToTrade,
          currentPrice,
          orderType,
          settings.krakenApiKey,
          settings.krakenApiSign
        );
        
        if (!executeOrderResult.success) {
          await logAutoTradeEvent(
            user.id,
            AutoTradeLogType.ERROR,
            `Failed to execute direct trade: ${executeOrderResult.error}`,
            { cryptoId, action, currentPrice, sharesToTrade, error: executeOrderResult.error }
          );
          return res.status(500).json({ 
            error: 'Failed to execute order',
            details: executeOrderResult.error
          });
        }
        
        // Always update the next action after a successful transaction
        const newNextAction = action === 'buy' ? 'sell' : 'buy';
        
        if (crypto.autoTradeSettings) {
          await prisma.cryptoAutoTradeSettings.update({
            where: { id: crypto.autoTradeSettings.id },
            data: { nextAction: newNextAction }
          });
          
          await logAutoTradeEvent(
            user.id,
            AutoTradeLogType.INFO,
            `Flipped next action for ${crypto.symbol} from ${action} to ${newNextAction}`,
            {
              cryptoId,
              symbol: crypto.symbol,
              previousAction: action,
              newAction: newNextAction
            }
          );
        } else {
          // Create settings if they don't exist
          await prisma.cryptoAutoTradeSettings.create({
            data: {
              cryptoId: crypto.id,
              nextAction: newNextAction,
              enableContinuousTrading: true,
              buyThresholdPercent: settings.buyThresholdPercent,
              sellThresholdPercent: settings.sellThresholdPercent
            }
          });
          
          await logAutoTradeEvent(
            user.id,
            AutoTradeLogType.INFO,
            `Created auto trade settings for ${crypto.symbol} with next action ${newNextAction}`,
            {
              cryptoId,
              symbol: crypto.symbol,
              previousAction: action,
              newAction: newNextAction
            }
          );
        }
        
        // If this is not a continuous trading setup, disable the appropriate flag
        if (!crypto.autoTradeSettings?.enableContinuousTrading) {
          // For one-time trades, disable the auto flag
          await prisma.crypto.update({
            where: { id: cryptoId },
            data: {
              autoBuy: action === 'sell' ? crypto.autoBuy : false,
              autoSell: action === 'buy' ? crypto.autoSell : false
            }
          });
          
          await logAutoTradeEvent(
            user.id,
            AutoTradeLogType.INFO,
            `Disabled auto ${action === 'buy' ? 'buy' : 'sell'} for ${crypto.symbol} after one-time trade`,
            {
              cryptoId,
              symbol: crypto.symbol,
              action
            }
          );
        }
        
        return res.status(200).json({
          success: true,
          message: `Successfully executed ${action} for ${crypto.symbol}`,
          transaction: executeOrderResult.transaction,
          krakenOrderId: executeOrderResult.krakenOrderId
        });
      } catch (error) {
        console.error('Error executing direct trade:', error);
        
        await logAutoTradeEvent(
          user.id,
          AutoTradeLogType.ERROR,
          `Error executing direct trade: ${error.message}`,
          { 
            cryptoId,
            action,
            currentPrice,
            error: error.message,
            stack: error.stack
          }
        );
        
        return res.status(500).json({ 
          error: 'Internal server error',
          details: error.message
        });
      }
    }
    
    // Handle batch price updates for auto trading (legacy mode)
    if (prices) {
      // Log the API request
      await logAutoTradeEvent(
        user.id,
        AutoTradeLogType.INFO,
        `Process auto trades API called with ${prices?.length || 0} price updates`,
        { 
          requestMethod: req.method,
          pricesCount: prices?.length || 0
        }
      );
      
      if (!Array.isArray(prices)) {
        await logAutoTradeEvent(
          user.id,
          AutoTradeLogType.ERROR,
          `Invalid process auto trades request: Missing or invalid prices array`,
          { requestBody: req.body }
        );
        return res.status(400).json({ error: 'Missing or invalid prices array' });
      }
      
      console.log(`Processing auto trades for user ${user.id} with ${prices.length} price updates`);
      
      // Log the prices being processed
      console.log('Price updates received:', prices.map(p => `${p.symbol}: $${p.price}`).join(', '));
      
      // Log detailed price updates to the database
      await logAutoTradeEvent(
        user.id,
        AutoTradeLogType.INFO,
        `Processing ${prices.length} price updates for auto trades`,
        { 
          priceUpdates: prices.map(p => ({ symbol: p.symbol, price: p.price, timestamp: p.timestamp }))
        }
      );
    } else {
      await logAutoTradeEvent(
        user.id,
        AutoTradeLogType.ERROR,
        `Invalid process auto trades request: No prices or direct trade info provided`,
        { requestBody: req.body }
      );
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Get user settings to check if auto trading is enabled
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id }
    });
    
    if (!settings || !settings.enableAutoCryptoTrading) {
      console.log(`Auto trading is disabled for user ${user.id}`);
      return res.status(200).json({ 
        success: false,
        message: 'Auto trading is disabled in user settings',
        results: []
      });
    }
    
    console.log(`Auto trading is enabled for user ${user.id}`);
    
    // Get cryptos with auto trading enabled
    const cryptos = await prisma.crypto.findMany({
      where: {
        userId: user.id,
        OR: [
          { autoBuy: true },
          { autoSell: true }
        ]
      },
      include: {
        autoTradeSettings: true
      }
    });
    
    console.log(`Found ${cryptos.length} cryptos with auto trading enabled`);
    if (cryptos.length > 0) {
      console.log('Auto-tradable cryptos:', cryptos.map(c => 
        `${c.symbol} (buy: ${c.autoBuy}, sell: ${c.autoSell}, nextAction: ${c.autoTradeSettings?.nextAction || 'none'})`
      ).join(', '));
    }
    
    // Process auto trades using the server-side function with a timeout
    // Create a promise that resolves with the results or rejects after timeout
    const processWithTimeout = Promise.race([
      processAutoCryptoTrades(prices, user.id),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Operation timed out after ' + PROCESS_TIMEOUT + 'ms'));
        }, PROCESS_TIMEOUT);
      })
    ]);
    
    // Wait for either the process to complete or the timeout
    const results = await processWithTimeout as Awaited<ReturnType<typeof processAutoCryptoTrades>>;
    
    // Log detailed information about the results
    console.log('Auto trade processing detailed results:');
    for (const result of results) {
      if (result.success) {
        console.log(`SUCCESS: ${result.symbol} - ${result.action} - ${result.shares} shares at $${result.price}`);
        console.log(`Transaction details: ${JSON.stringify(result)}`);
      } else {
        console.log(`FAILED: ${result.symbol || 'unknown'} - ${result.message}`);
        if (result.action) {
          console.log(`Failed action: ${result.action}`);
        }
      }
    }
    
    // Count successful trades
    const successfulTrades = results.filter(r => r.success).length;
    console.log(`Auto trade processing completed with ${results.length} results, ${successfulTrades} successful trades`);
    
    // Log detailed results for debugging
    console.log('Auto trade processing results:');
    for (const result of results) {
      if (result.success) {
        console.log(`SUCCESS: ${result.symbol} - ${result.action} - ${result.shares} shares at $${result.price}`);
      } else {
        console.log(`FAILED: ${result.symbol} - ${result.message}`);
      }
    }
    
    console.log(`Auto trade processing completed with ${results.length} results`);
    console.log('Results:', results.map(r => 
      `${r.symbol || 'unknown'}: ${r.success ? 'SUCCESS' : 'FAILED'} - ${r.message} ${r.action ? `(${r.action})` : ''}`
    ).join('\n'));
    
    // Log the API response
    await logAutoTradeEvent(
      user.id,
      AutoTradeLogType.INFO,
      `Auto trade processing completed with ${results.length} results`,
      {
        resultsCount: results.length,
        successCount: results.filter(r => r.success).length,
        failureCount: results.filter(r => !r.success).length,
        apiResponse: true
      }
    );
    
    return res.status(200).json({ 
      success: true,
      results
    });
  } catch (error) {
    console.error('API error in process-auto-trades:', error);
    
    // Log the error
    try {
      await logAutoTradeEvent(
        user?.id || 'system',
        AutoTradeLogType.ERROR,
        `Error in process-auto-trades API: ${error.message}`,
        {
          error: error.message,
          stack: error.stack,
          code: error.code || 'UNKNOWN_ERROR'
        }
      );
    } catch (logError) {
      console.error('Failed to log auto trade API error:', logError);
    }
    
    // Handle timeout errors
    if (error.message && error.message.includes('Operation timed out')) {
      return res.status(504).json({ 
        error: 'Gateway Timeout', 
        details: 'The operation took too long to complete. Please try with fewer prices or at a less busy time.',
        code: 'TIMEOUT_ERROR'
      });
    }
    
    // Handle specific Prisma errors
    if (error instanceof PrismaClientInitializationError) {
      console.error('Prisma initialization error:', error.message);
      return res.status(503).json({ 
        error: 'Database service unavailable', 
        details: 'Unable to connect to the database. Please try again later.',
        code: 'DB_CONNECTION_ERROR'
      });
    }
    
    if (error instanceof PrismaClientKnownRequestError) {
      // Handle "Max client connections reached" error
      if (error.message.includes('Max client connections reached')) {
        console.error('Max database connections reached:', error.message);
        return res.status(503).json({ 
          error: 'Database connection limit reached', 
          details: 'The system is experiencing high load. Please try again later.',
          code: 'DB_CONNECTION_LIMIT'
        });
      }
    }
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}