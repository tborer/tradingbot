import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { checkCryptoForAutoTrade } from '@/lib/autoTradeService';

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
    
    const { cryptoId, price } = req.body;
    
    if (!cryptoId || typeof price !== 'number') {
      return res.status(400).json({ error: 'Missing required fields or invalid price' });
    }
    
    // Get user settings
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id }
    });
    
    if (!settings) {
      return res.status(404).json({ error: 'User settings not found' });
    }
    
    // Check if auto trading is enabled
    if (!settings.enableAutoCryptoTrading) {
      return res.status(400).json({ error: 'Auto trading is disabled in settings' });
    }
    
    // Check if the crypto belongs to the user
    const crypto = await prisma.crypto.findFirst({
      where: {
        id: cryptoId,
        userId: user.id
      }
    });
    
    if (!crypto) {
      return res.status(404).json({ error: 'Crypto not found' });
    }
    
    // Check if auto trading is enabled for this crypto
    if (!crypto.autoBuy && !crypto.autoSell) {
      return res.status(400).json({ error: 'Auto trading is not enabled for this crypto' });
    }
    
    // Check if we should auto trade based on current price
    const result = await checkCryptoForAutoTrade(cryptoId, price, user.id);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}