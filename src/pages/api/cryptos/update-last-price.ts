import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { PrismaClientInitializationError, PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { shouldWritePriceUpdate } from '@/lib/selectivePriceUpdates';
import { updateUIPriceCache } from '@/lib/uiPriceCache';

// Add connection retry logic
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      console.log('Method not allowed in update-last-price:', req.method);
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('Unauthorized access attempt to update-last-price');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { symbol, lastPrice } = req.body;
    
    if (!symbol || lastPrice === undefined) {
      console.log('Missing required fields in update-last-price:', { symbol, lastPrice });
      return res.status(400).json({ error: 'Missing required fields: symbol, lastPrice' });
    }
    
    // Validate lastPrice is a number
    if (isNaN(Number(lastPrice))) {
      console.log('Invalid lastPrice in update-last-price:', lastPrice);
      return res.status(400).json({ error: 'lastPrice must be a valid number' });
    }
    
    console.log(`Processing update-last-price for ${symbol}: ${lastPrice}`);
    
    // Always update the UI price cache regardless of whether we write to the database
    updateUIPriceCache(symbol, Number(lastPrice));
    
    // Find the crypto by symbol for this user with retry logic
    let crypto = null;
    let retries = 0;
    
    while (retries < MAX_RETRIES) {
      try {
        crypto = await prisma.crypto.findFirst({
          where: {
            symbol: symbol,
            userId: user.id,
          },
          include: {
            autoTradeSettings: true
          }
        });
        
        // If successful, break out of the retry loop
        break;
      } catch (error) {
        retries++;
        console.error(`Database error in update-last-price (attempt ${retries}/${MAX_RETRIES}):`, error);
        
        // If we've reached max retries, throw the error to be caught by the outer try/catch
        if (retries >= MAX_RETRIES) {
          throw error;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries));
      }
    }
    
    if (!crypto) {
      // If the crypto doesn't exist for this user, we'll just ignore the update
      // This can happen if the WebSocket is receiving prices for symbols the user doesn't own
      console.log(`No crypto found with symbol ${symbol} for user ${user.id}`);
      return res.status(200).json({ message: `No crypto found with symbol ${symbol} for this user` });
    }
    
    // Check if we should write this price update to the database
    const shouldWrite = await shouldWritePriceUpdate(symbol, Number(lastPrice), crypto, user.id);
    
    if (!shouldWrite) {
      console.log(`Skipping database update for ${symbol}: Not within threshold range or too frequent`);
      return res.status(200).json({ 
        message: `Price update for ${symbol} cached but not written to database`,
        symbol,
        lastPrice: Number(lastPrice),
        cached: true,
        written: false
      });
    }
    
    // Update the lastPrice for the crypto with retry logic
    retries = 0;
    
    while (retries < MAX_RETRIES) {
      try {
        await prisma.crypto.update({
          where: { id: crypto.id },
          data: { lastPrice: Number(lastPrice) },
        });
        
        // If successful, break out of the retry loop
        break;
      } catch (error) {
        retries++;
        console.error(`Database error updating lastPrice (attempt ${retries}/${MAX_RETRIES}):`, error);
        
        // If we've reached max retries, throw the error to be caught by the outer try/catch
        if (retries >= MAX_RETRIES) {
          throw error;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries));
      }
    }
    
    console.log(`Successfully updated lastPrice for ${symbol} to ${lastPrice}`);
    
    // Check if auto trading is enabled for this user
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id }
    });
    
    // If auto trading is enabled, trigger auto trade evaluation
    if (settings?.enableAutoCryptoTrading) {
      try {
        console.log(`Triggering auto trade evaluation for ${symbol} at price ${lastPrice}`);
        
        // Check if this crypto has auto trading enabled
        const hasAutoTradeEnabled = crypto.autoBuy || crypto.autoSell;
        
        if (!hasAutoTradeEnabled) {
          console.log(`Auto trading not enabled for ${symbol}, skipping evaluation`);
          return res.status(200).json({ 
            message: `Successfully updated lastPrice for ${symbol}`,
            symbol,
            lastPrice: Number(lastPrice),
            autoTradeStatus: 'skipped',
            reason: 'Auto trading not enabled for this crypto'
          });
        }
        
        // Import the auto trade service function
        const { checkCryptoForAutoTrade } = require('@/lib/autoTradeService');
        
        // Process auto trade synchronously to ensure it completes
        // This is important to make sure trades are executed when conditions are met
        console.log(`Executing auto trade check for ${symbol} (ID: ${crypto.id}) at price ${lastPrice}`);
        console.log(`Auto trade enabled: Buy=${crypto.autoBuy}, Sell=${crypto.autoSell}`);
        
        // Add more detailed logging about the auto trade check
        console.log(`Starting auto trade evaluation for ${symbol} at price ${lastPrice}`);
        const result = await checkCryptoForAutoTrade(crypto.id, Number(lastPrice), user.id);
        console.log(`Auto trade evaluation result for ${symbol}:`, result);
        
        if (result.success && result.action) {
          console.log(`Successfully executed auto ${result.action} for ${symbol}:`, result);
          return res.status(200).json({ 
            message: `Successfully updated lastPrice and executed auto ${result.action} for ${symbol}`,
            symbol,
            lastPrice: Number(lastPrice),
            autoTradeStatus: 'executed',
            autoTradeAction: result.action,
            autoTradeShares: result.shares,
            autoTradePrice: result.price
          });
        } else {
          console.log(`No auto trade executed for ${symbol}:`, result.message);
          return res.status(200).json({ 
            message: `Successfully updated lastPrice for ${symbol}`,
            symbol,
            lastPrice: Number(lastPrice),
            autoTradeStatus: 'evaluated',
            autoTradeResult: result.message
          });
        }
      } catch (error) {
        console.error(`Error triggering auto trade for ${symbol}:`, error);
        return res.status(200).json({ 
          message: `Successfully updated lastPrice for ${symbol}, but auto trade evaluation failed`,
          symbol,
          lastPrice: Number(lastPrice),
          autoTradeStatus: 'error',
          autoTradeError: error.message
        });
      }
    }
    
    return res.status(200).json({ 
      message: `Successfully updated lastPrice for ${symbol}`,
      symbol,
      lastPrice: Number(lastPrice)
    });
  } catch (error) {
    console.error('API error in update-last-price:', error);
    
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