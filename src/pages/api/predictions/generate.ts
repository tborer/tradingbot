import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { predictionService } from '@/lib/predictionModels/predictionService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user from session
    const supabase = createClient(req, res);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get symbol from request body
    const { symbol } = req.body;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Initialize prediction service if not already initialized
    await predictionService.initialize();

    // Generate predictions
    const predictions = await predictionService.generatePredictions(symbol);

    return res.status(200).json({
      success: true,
      data: predictions
    });
  } catch (error) {
    console.error('Error generating predictions:', error);
    return res.status(500).json({
      error: 'Failed to generate predictions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}