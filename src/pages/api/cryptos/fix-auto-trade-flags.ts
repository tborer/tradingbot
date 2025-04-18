import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logAutoTradeEvent, AutoTradeLogType } from '@/lib/autoTradeLogger';

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
    
    // Get the symbols to fix from the request body
    const { symbols } = req.body;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ 
        error: 'Missing or invalid symbols array',
        message: 'Please provide an array of crypto symbols to fix'
      });
    }
    
    console.log(`Fixing auto trade flags for user ${user.id} and symbols:`, symbols);
    
    // Log the start of the fix operation
    await logAutoTradeEvent(
      user.id,
      AutoTradeLogType.INFO,
      `Starting to fix auto trade flags for ${symbols.length} cryptos`,
      { 
        symbols,
        userId: user.id
      }
    );
    
    // Find all cryptos matching the provided symbols for this user
    const cryptos = await prisma.crypto.findMany({
      where: {
        userId: user.id,
        symbol: {
          in: symbols
        }
      },
      include: {
        autoTradeSettings: true
      }
    });
    
    if (cryptos.length === 0) {
      return res.status(404).json({ 
        error: 'No matching cryptos found',
        message: 'Could not find any cryptos matching the provided symbols for your account'
      });
    }
    
    console.log(`Found ${cryptos.length} cryptos to fix`);
    
    // Track results for each crypto
    const results = [];
    
    // Process each crypto
    for (const crypto of cryptos) {
      console.log(`Processing ${crypto.symbol}...`);
      
      // Check if this crypto has auto trading enabled
      const hasAutoTrading = crypto.autoBuy || crypto.autoSell;
      
      if (!hasAutoTrading) {
        console.log(`${crypto.symbol} already has auto trading disabled`);
        results.push({
          symbol: crypto.symbol,
          status: 'skipped',
          message: 'Auto trading already disabled',
          previousState: {
            autoBuy: crypto.autoBuy,
            autoSell: crypto.autoSell
          }
        });
        continue;
      }
      
      // Disable auto trading for this crypto
      const updatedCrypto = await prisma.crypto.update({
        where: { id: crypto.id },
        data: {
          autoBuy: false,
          autoSell: false,
          updatedAt: new Date()
        }
      });
      
      console.log(`Disabled auto trading for ${crypto.symbol}`);
      
      // Log the change
      await logAutoTradeEvent(
        user.id,
        AutoTradeLogType.INFO,
        `Disabled auto trading for ${crypto.symbol}`,
        {
          cryptoId: crypto.id,
          symbol: crypto.symbol,
          previousState: {
            autoBuy: crypto.autoBuy,
            autoSell: crypto.autoSell
          },
          newState: {
            autoBuy: updatedCrypto.autoBuy,
            autoSell: updatedCrypto.autoSell
          }
        }
      );
      
      // If there are auto trade settings, update them too
      if (crypto.autoTradeSettings) {
        await prisma.cryptoAutoTradeSettings.update({
          where: { id: crypto.autoTradeSettings.id },
          data: {
            enableContinuousTrading: false,
            oneTimeBuy: false,
            oneTimeSell: false,
            updatedAt: new Date()
          }
        });
        
        console.log(`Updated auto trade settings for ${crypto.symbol}`);
      }
      
      // Add to results
      results.push({
        symbol: crypto.symbol,
        status: 'fixed',
        message: 'Auto trading disabled successfully',
        previousState: {
          autoBuy: crypto.autoBuy,
          autoSell: crypto.autoSell
        },
        newState: {
          autoBuy: updatedCrypto.autoBuy,
          autoSell: updatedCrypto.autoSell
        }
      });
    }
    
    // Log the completion of the fix operation
    await logAutoTradeEvent(
      user.id,
      AutoTradeLogType.SUCCESS,
      `Completed fixing auto trade flags for ${symbols.length} cryptos`,
      { 
        symbols,
        results,
        userId: user.id
      }
    );
    
    return res.status(200).json({
      success: true,
      message: `Successfully processed ${cryptos.length} cryptos`,
      results
    });
  } catch (error) {
    console.error('API error in fix-auto-trade-flags:', error);
    
    // Log the error
    try {
      await logAutoTradeEvent(
        user?.id || 'system',
        AutoTradeLogType.ERROR,
        `Error in fix-auto-trade-flags API: ${error.message}`,
        {
          error: error.message,
          stack: error.stack
        }
      );
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message
    });
  }
}