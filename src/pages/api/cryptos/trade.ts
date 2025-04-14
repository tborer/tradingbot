import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('Trade API called with method:', req.method);
    console.log('Request body:', JSON.stringify(req.body));
    
    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('Trade API: Unauthorized access attempt');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Only allow POST requests
    if (req.method !== 'POST') {
      console.error('Trade API: Method not allowed:', req.method);
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
      // Fix: Use absolute URL with origin for API calls
      const origin = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const executeOrderResponse = await fetch(`${origin}/api/cryptos/execute-order`, {
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
        // The execute-order endpoint already logs the failed transaction
        return res.status(400).json({ 
          error: executeOrderResult.error || 'Failed to execute order via Kraken API',
          details: executeOrderResult
        });
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
      
      // Log the failed transaction with error details
      const transaction = await prisma.cryptoTransaction.create({
        data: {
          cryptoId: crypto.id,
          action: 'error', // Change action to 'error' for failed transactions
          shares: Number(shares),
          price: currentPrice,
          totalAmount,
          userId: user.id,
          logInfo: JSON.stringify({
            timestamp: new Date().toISOString(),
            method: 'trade_api_error',
            requestedAction: action, // Store the originally requested action
            shares: Number(shares),
            price: currentPrice,
            totalAmount,
            status: 'failed',
            error: error.message || 'Unknown error',
            message: `Failed to execute ${action} order for ${shares} shares of ${crypto.symbol} at $${currentPrice}`
          }, null, 2)
        },
      });
      
      // Return error to client
      return res.status(500).json({ 
        error: 'Failed to execute order via Kraken API', 
        details: error.message,
        transaction // Return the transaction record for the client
      });
      
    }
    

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}