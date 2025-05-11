import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { generateComprehensiveFeatureSet, prepareFeatureVectorForModel, saveComprehensiveFeatureSet } from '@/lib/comprehensiveFeatureUtils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Handle different HTTP methods
  switch (req.method) {
    case 'GET':
      return getComprehensiveFeatures(req, res);
    case 'POST':
      return generateFeatures(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * GET handler to retrieve comprehensive features
 */
async function getComprehensiveFeatures(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { symbol, limit = '10', page = '1', modelReady = 'false' } = req.query;
    
    // Parse pagination parameters
    const limitNum = parseInt(limit as string, 10);
    const pageNum = parseInt(page as string, 10);
    const skip = (pageNum - 1) * limitNum;
    
    // Build query
    const whereClause: any = {};
    if (symbol) {
      whereClause.symbol = symbol;
    }
    
    // Fetch features
    const features = await prisma.cryptoComprehensiveFeatures.findMany({
      where: whereClause,
      orderBy: {
        timestamp: 'desc',
      },
      take: limitNum,
      skip,
    });
    
    // Get total count for pagination
    const totalCount = await prisma.cryptoComprehensiveFeatures.count({
      where: whereClause,
    });
    
    // Transform response based on modelReady parameter
    const transformedFeatures = features.map(feature => {
      if (modelReady === 'true') {
        return {
          id: feature.id,
          symbol: feature.symbol,
          timestamp: feature.timestamp,
          features: feature.modelReadyFeatures,
        };
      } else {
        return {
          id: feature.id,
          symbol: feature.symbol,
          timestamp: feature.timestamp,
          features: feature.featureSet,
        };
      }
    });
    
    return res.status(200).json({
      data: transformedFeatures,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching comprehensive features:', error);
    return res.status(500).json({ error: 'Failed to fetch comprehensive features' });
  }
}

/**
 * POST handler to generate comprehensive features
 */
async function generateFeatures(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { symbol, timeframe = 'hourly' } = req.body;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    
    // Generate comprehensive feature set
    const featureSet = await generateComprehensiveFeatureSet(symbol, timeframe);
    
    // Prepare features for model consumption
    const modelReadyFeatures = prepareFeatureVectorForModel(featureSet);
    
    // Save to database
    const savedFeatures = await saveComprehensiveFeatureSet(symbol, featureSet);
    
    return res.status(200).json({
      message: `Successfully generated comprehensive features for ${symbol}`,
      data: {
        id: savedFeatures.id,
        symbol: savedFeatures.symbol,
        timestamp: savedFeatures.timestamp,
        features: savedFeatures.featureSet,
        modelReadyFeatures: savedFeatures.modelReadyFeatures,
      },
    });
  } catch (error) {
    console.error('Error generating comprehensive features:', error);
    return res.status(500).json({ 
      error: 'Failed to generate comprehensive features',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}