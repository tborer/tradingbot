import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get the user from the session
  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Handle GET request to fetch derived indicators
  if (req.method === 'GET') {
    try {
      const { symbol, limit = '100', offset = '0' } = req.query;
      
      // Build the query
      const query: any = {};
      
      // Filter by symbol if provided
      if (symbol) {
        query.symbol = symbol as string;
      }
      
      // Get derived indicators with their associated technical analysis
      const derivedIndicators = await prisma.cryptoDerivedIndicators.findMany({
        where: query,
        include: {
          technicalAnalysis: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      });
      
      // Format the response
      const formattedIndicators = derivedIndicators.map(indicator => ({
        id: indicator.id,
        symbol: indicator.symbol,
        timestamp: indicator.timestamp,
        trendStrength: indicator.trendStrength,
        volatilityRatio: indicator.volatilityRatio,
        rsiWithTrendContext: indicator.rsiWithTrendContext,
        maConvergence: indicator.maConvergence,
        nearestSupportDistance: indicator.nearestSupportDistance,
        nearestResistanceDistance: indicator.nearestResistanceDistance,
        fibConfluenceStrength: indicator.fibConfluenceStrength,
        bbPosition: indicator.bbPosition,
        technicalAnalysis: {
          id: indicator.technicalAnalysis.id,
          symbol: indicator.technicalAnalysis.symbol,
          timestamp: indicator.technicalAnalysis.timestamp,
          currentPrice: indicator.technicalAnalysis.rawData?.currentPrice,
          recommendation: indicator.technicalAnalysis.recommendation,
          confidenceScore: indicator.technicalAnalysis.confidenceScore,
        }
      }));

      return res.status(200).json({
        success: true,
        data: formattedIndicators,
        count: formattedIndicators.length,
      });
    } catch (error) {
      console.error('Error fetching derived indicators:', error);
      return res.status(500).json({ error: 'Failed to fetch derived indicators' });
    }
  }

  // Return 405 Method Not Allowed for other HTTP methods
  return res.status(405).json({ error: 'Method not allowed' });
}