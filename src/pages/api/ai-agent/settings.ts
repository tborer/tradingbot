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
    
    // GET - Fetch AI Agent settings
    if (req.method === 'GET') {
      // Get or create AI Agent settings
      let aiAgentSettings = await prisma.aIAgentSettings.findUnique({
        where: { userId: user.id },
      });
      
      // If settings don't exist, create default settings
      if (!aiAgentSettings) {
        aiAgentSettings = await prisma.aIAgentSettings.create({
          data: {
            userId: user.id,
            maxTradeValue: 100.00,
            maxDailyTrades: 5,
            minRiskReward: 2.0,
            blacklistedAssets: "[]"
          },
        });
      }
      
      // Parse blacklisted assets
      let blacklistedAssets: string[] = [];
      try {
        blacklistedAssets = JSON.parse(aiAgentSettings.blacklistedAssets as string);
      } catch (error) {
        console.error('Error parsing blacklisted assets:', error);
        blacklistedAssets = [];
      }
      
      return res.status(200).json({
        ...aiAgentSettings,
        blacklistedAssets
      });
    }
    
    // PUT - Update AI Agent settings
    if (req.method === 'PUT') {
      const { maxTradeValue, maxDailyTrades, minRiskReward, blacklistedAssets } = req.body;
      
      // Validate required fields
      if (maxTradeValue === undefined || maxDailyTrades === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Validate numeric fields
      if (isNaN(parseFloat(maxTradeValue)) || isNaN(parseInt(maxDailyTrades))) {
        return res.status(400).json({ error: 'Invalid numeric values' });
      }
      
      // Prepare blacklisted assets for storage
      let blacklistedAssetsJson = "[]";
      if (Array.isArray(blacklistedAssets)) {
        blacklistedAssetsJson = JSON.stringify(blacklistedAssets);
      }
      
      // Update or create AI Agent settings
      const updatedSettings = await prisma.aIAgentSettings.upsert({
        where: { userId: user.id },
        update: {
          maxTradeValue: parseFloat(maxTradeValue),
          maxDailyTrades: parseInt(maxDailyTrades),
          minRiskReward: minRiskReward ? parseFloat(minRiskReward) : 2.0,
          blacklistedAssets: blacklistedAssetsJson,
          updatedAt: new Date()
        },
        create: {
          userId: user.id,
          maxTradeValue: parseFloat(maxTradeValue),
          maxDailyTrades: parseInt(maxDailyTrades),
          minRiskReward: minRiskReward ? parseFloat(minRiskReward) : 2.0,
          blacklistedAssets: blacklistedAssetsJson
        },
      });
      
      return res.status(200).json({
        ...updatedSettings,
        blacklistedAssets: blacklistedAssets || []
      });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error processing AI Agent settings request:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}