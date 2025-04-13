import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Get settings but don't block trading if enableManualCryptoTrading is not explicitly set
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id },
    });
    
    // Only block if settings exist AND enableManualCryptoTrading is explicitly set to false
    if (settings && settings.enableManualCryptoTrading === false) {
      return res.status(403).json({ error: 'Manual crypto trading is not enabled. Please enable it in settings.' });
    }
    
    const { cryptoId, action, shares, orderType } = req.body;
    
    if (!cryptoId || !action || !shares) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Default to 'market' if orderType is not provided
    const effectiveOrderType = orderType || 'market';
    
    if (action !== 'buy' && action !== 'sell') {
      return res.status(400).json({ error: 'Invalid action. Must be "buy" or "sell"' });
    }
    
    if (isNaN(Number(shares)) || Number(shares) <= 0) {
      return res.status(400).json({ error: 'Shares must be a positive number' });
    }
    
    // Get the crypto
    const crypto = await prisma.crypto.findFirst({
      where: {
        id: cryptoId,
        userId: user.id,
      },
    });
    
    if (!crypto) {
      return res.status(404).json({ error: 'Crypto not found' });
    }
    
    // For sell actions, check if user has enough shares
    if (action === 'sell' && crypto.shares < Number(shares)) {
      return res.status(400).json({ error: 'Not enough shares to sell' });
    }
    
    // Get the latest price from the Kraken WebSocket data
    // If we have a lastPrice stored, use that, otherwise fall back to purchasePrice
    const currentPrice = crypto.lastPrice || crypto.purchasePrice;
    const totalAmount = currentPrice * Number(shares);
    
    // Execute the order using the Kraken API
    try {
      // Call the execute-order API endpoint to use the Kraken API
      const executeOrderResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/api/cryptos/execute-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cryptoId: crypto.id,
          action,
          shares: Number(shares),
          price: currentPrice,
          orderType: effectiveOrderType,
          isAutoOrder: req.body.isAutoOrder || false
        })
      });

      const executeOrderResult = await executeOrderResponse.json();

      if (!executeOrderResponse.ok) {
        return res.status(400).json({ error: executeOrderResult.error || 'Failed to execute order via Kraken API' });
      }

      // Return the transaction from the execute-order API
      return res.status(200).json({
        transaction: executeOrderResult.transaction,
        newShares: executeOrderResult.transaction.shares,
        message: executeOrderResult.message,
        krakenOrderId: executeOrderResult.krakenOrderId
      });
    } catch (error) {
      console.error('Error executing order via Kraken API:', error);
      
      // Fallback to direct database update if Kraken API fails
      console.log('Falling back to direct database update...');
      
      // Create the transaction with logging information
      const transaction = await prisma.cryptoTransaction.create({
        data: {
          cryptoId: crypto.id,
          action,
          shares: Number(shares),
          price: currentPrice,
          totalAmount,
          userId: user.id,
          logInfo: JSON.stringify({
            timestamp: new Date().toISOString(),
            method: 'manual_trade',
            action,
            shares: Number(shares),
            price: currentPrice,
            totalAmount,
            status: 'success',
            message: `Successfully executed manual ${action} for ${shares} shares of ${crypto.symbol} at $${currentPrice} (Kraken API fallback)`
          }, null, 2)
        },
      });
      
      // Update the crypto shares
      const newShares = action === 'buy' 
        ? crypto.shares + Number(shares) 
        : crypto.shares - Number(shares);
      
      // If this is an auto order, flip the nextAction in the settings
      if (req.body.isAutoOrder) {
        // Get the current auto trade settings for this crypto
        const autoTradeSettings = await prisma.cryptoAutoTradeSettings.findFirst({
          where: { cryptoId: crypto.id }
        });
        
        if (autoTradeSettings) {
          // Flip the next action from buy to sell or vice versa
          const nextAction = autoTradeSettings.nextAction === 'buy' ? 'sell' : 'buy';
          
          // Update the settings
          await prisma.cryptoAutoTradeSettings.update({
            where: { id: autoTradeSettings.id },
            data: { nextAction }
          });
          
          console.log(`Auto trade completed successfully. Next action flipped to: ${nextAction}`);
        }
      }
      
      // Get current user's USD balance
      const userData = await prisma.user.findUnique({
        where: { id: user.id },
        select: { usdBalance: true }
      });
      
      // Calculate new USD balance based on the trade
      let newUsdBalance = userData?.usdBalance || 0;
      if (action === 'buy') {
        // Subtract the total amount when buying
        newUsdBalance -= totalAmount;
      } else {
        // Add the total amount when selling
        newUsdBalance += totalAmount;
      }
      
      // Ensure balance doesn't go below zero
      newUsdBalance = Math.max(0, newUsdBalance);
      
      // Update both the crypto shares and user's USD balance
      await prisma.$transaction([
        prisma.crypto.update({
          where: { id: crypto.id },
          data: { shares: newShares },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: { usdBalance: newUsdBalance },
        })
      ]);
      
      return res.status(200).json({
        transaction,
        newShares,
        message: `Successfully ${action === 'buy' ? 'bought' : 'sold'} ${shares} shares of ${crypto.symbol} (Kraken API fallback)`,
      });
    }
    

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}