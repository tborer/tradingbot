import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  
  // Check if user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('Authentication error:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // POST - Execute a trade (buy or sell)
    if (req.method === 'POST') {
      const { stockId, action, shares } = req.body;
      
      if (!stockId || !action || !shares || isNaN(shares) || shares <= 0) {
        return res.status(400).json({ 
          error: 'Stock ID, action (buy/sell), and number of shares are required' 
        });
      }
      
      // Check if the stock belongs to the user
      const stock = await prisma.stock.findFirst({
        where: {
          id: stockId,
          userId: user.id,
        },
      });
      
      if (!stock) {
        return res.status(404).json({ error: 'Stock not found' });
      }
      
      // Check if trading platform API is configured
      const settings = await prisma.settings.findUnique({
        where: { userId: user.id },
      });
      
      if (!settings?.tradePlatformApiKey || !settings?.tradePlatformApiSecret) {
        return res.status(400).json({ 
          error: 'Trading platform API not configured. Please set up your API keys in settings.' 
        });
      }
      
      // In a real application, this is where you would call the trading platform API
      // For now, we'll just simulate a successful trade
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Return success response
      return res.status(200).json({ 
        success: true,
        message: `Successfully ${action === 'buy' ? 'bought' : 'sold'} ${shares} shares of ${stock.ticker}`,
        transaction: {
          stockId: stock.id,
          ticker: stock.ticker,
          action,
          shares: parseInt(shares),
          price: stock.purchasePrice, // In a real app, this would be the current market price
          timestamp: new Date().toISOString()
        }
      });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}