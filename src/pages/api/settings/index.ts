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
    // GET - Fetch user settings
    if (req.method === 'GET') {
      let settings = await prisma.settings.findUnique({
        where: { userId: user.id },
      });
      
      // Create default settings if none exist
      if (!settings) {
        settings = await prisma.settings.create({
          data: {
            userId: user.id,
            sellThresholdPercent: 5.0,
            checkFrequencySeconds: 60,
          },
        });
      }
      
      return res.status(200).json(settings);
    }
    
    // PUT - Update user settings
    if (req.method === 'PUT') {
      const { 
        sellThresholdPercent, 
        buyThresholdPercent, 
        checkFrequencySeconds,
        tradePlatformApiKey,
        tradePlatformApiSecret
      } = req.body;
      
      if (sellThresholdPercent === undefined || buyThresholdPercent === undefined || checkFrequencySeconds === undefined) {
        return res.status(400).json({ error: 'Sell threshold, buy threshold, and check frequency are required' });
      }
      
      // Validate input values
      if (sellThresholdPercent < 0 || buyThresholdPercent < 0 || checkFrequencySeconds < 10) {
        return res.status(400).json({ 
          error: 'Invalid settings values. Thresholds must be positive and check frequency must be at least 10 seconds.' 
        });
      }
      
      const settings = await prisma.settings.upsert({
        where: { userId: user.id },
        update: {
          sellThresholdPercent: parseFloat(sellThresholdPercent),
          buyThresholdPercent: parseFloat(buyThresholdPercent),
          checkFrequencySeconds: parseInt(checkFrequencySeconds),
          ...(tradePlatformApiKey !== undefined && { tradePlatformApiKey }),
          ...(tradePlatformApiSecret !== undefined && { tradePlatformApiSecret }),
        },
        create: {
          userId: user.id,
          sellThresholdPercent: parseFloat(sellThresholdPercent),
          buyThresholdPercent: parseFloat(buyThresholdPercent),
          checkFrequencySeconds: parseInt(checkFrequencySeconds),
          ...(tradePlatformApiKey !== undefined && { tradePlatformApiKey }),
          ...(tradePlatformApiSecret !== undefined && { tradePlatformApiSecret }),
        },
      });
      
      return res.status(200).json(settings);
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}