import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user from session
    const supabase = createClient(req, res);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get symbol from query parameters
    const { symbol } = req.query;

    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    console.log(`Checking technical analysis data for symbol ${symbol}`);

    // Check if technical analysis data exists for this symbol
    const technicalAnalysis = await prisma.technicalAnalysisOutput.findMany({
      where: {
        symbol
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 5 // Get the 5 most recent entries
    });

    // Check if comprehensive features exist for this symbol
    const comprehensiveFeatures = await prisma.cryptoComprehensiveFeatures.findMany({
      where: {
        symbol
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 5 // Get the 5 most recent entries
    });

    // Check if hourly data exists for this symbol
    const hourlyData = await prisma.hourlyCryptoHistoricalData.findMany({
      where: {
        instrument: `${symbol}-USD`
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 5 // Get the 5 most recent entries
    });

    return res.status(200).json({
      success: true,
      data: {
        technicalAnalysis: {
          count: technicalAnalysis.length,
          mostRecent: technicalAnalysis.length > 0 ? technicalAnalysis[0] : null,
          entries: technicalAnalysis.map(entry => ({
            id: entry.id,
            timestamp: entry.timestamp,
            sma20: entry.sma20,
            ema12: entry.ema12,
            rsi14: entry.rsi14,
            recommendation: entry.recommendation,
            confidenceScore: entry.confidenceScore
          }))
        },
        comprehensiveFeatures: {
          count: comprehensiveFeatures.length,
          mostRecent: comprehensiveFeatures.length > 0 ? {
            id: comprehensiveFeatures[0].id,
            timestamp: comprehensiveFeatures[0].timestamp,
            hasFeatureSet: !!comprehensiveFeatures[0].featureSet,
            hasModelReadyFeatures: !!comprehensiveFeatures[0].modelReadyFeatures
          } : null
        },
        hourlyData: {
          count: hourlyData.length,
          mostRecent: hourlyData.length > 0 ? {
            timestamp: hourlyData[0].timestamp,
            open: hourlyData[0].open,
            high: hourlyData[0].high,
            low: hourlyData[0].low,
            close: hourlyData[0].close
          } : null
        }
      }
    });
  } catch (error) {
    console.error('Error checking analysis data:', error);
    return res.status(500).json({
      error: 'Failed to check analysis data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}