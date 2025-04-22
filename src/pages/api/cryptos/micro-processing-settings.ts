import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { createClient } from '@/util/supabase/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get the user from Supabase auth
  const supabase = createClient({ req, res });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Handle GET request to fetch settings
  if (req.method === 'GET') {
    const { cryptoId } = req.query;
    
    if (!cryptoId || typeof cryptoId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid cryptoId parameter' });
    }
    
    try {
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
      
      // Get the micro processing settings
      const microProcessingSettings = await prisma.microProcessingSettings.findFirst({
        where: {
          cryptoId: cryptoId
        }
      });
      
      return res.status(200).json({ microProcessingSettings });
    } catch (error) {
      console.error('Error fetching micro processing settings:', error);
      return res.status(500).json({ error: 'Failed to fetch micro processing settings' });
    }
  }
  
  // Handle POST request to save settings
  if (req.method === 'POST') {
    const { cryptoId, settings } = req.body;
    
    if (!cryptoId || !settings) {
      return res.status(400).json({ error: 'Missing cryptoId or settings in request body' });
    }
    
    try {
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
      
      // Upsert the micro processing settings
      const microProcessingSettings = await prisma.microProcessingSettings.upsert({
        where: {
          cryptoId: cryptoId
        },
        update: {
          enabled: settings.enabled,
          sellPercentage: settings.sellPercentage,
          tradeByShares: settings.tradeByShares,
          websocketProvider: settings.websocketProvider,
          tradingPlatform: settings.tradingPlatform,
          updatedAt: new Date()
        },
        create: {
          cryptoId: cryptoId,
          enabled: settings.enabled,
          sellPercentage: settings.sellPercentage,
          tradeByShares: settings.tradeByShares,
          websocketProvider: settings.websocketProvider,
          tradingPlatform: settings.tradingPlatform
        }
      });
      
      return res.status(200).json({ microProcessingSettings });
    } catch (error) {
      console.error('Error saving micro processing settings:', error);
      return res.status(500).json({ error: 'Failed to save micro processing settings' });
    }
  }
  
  // Handle unsupported methods
  return res.status(405).json({ error: 'Method not allowed' });
}