import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { schedulingLogger } from '@/lib/schedulingLogger';
import { cleanupStaleProcessingStatuses } from '@/lib/dataSchedulingService';
import { runAnalysisProcess } from '@/lib/analysisUtils';

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

    // Clean up stale processing statuses
    await cleanupStaleProcessingStatuses();

    // Create a new processing status entry
    const processId = `analysis-${Date.now()}`;
    await prisma.processingStatus.create({
      data: {
        processId,
        userId: user.id,
        status: 'RUNNING',
        type: 'ANALYSIS',
        totalItems: 100, // Placeholder, will be updated
        processedItems: 0
      }
    });

    // Log the start of the analysis process
    await schedulingLogger.log({
      processId,
      userId: user.id,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'ANALYSIS_START',
      message: 'Starting analysis process'
    });

    // Start the analysis process in the background
    runAnalysisProcess(processId, user.id)
      .then(() => {
        console.log(`Analysis process ${processId} completed`);
      })
      .catch(error => {
        console.error(`Error in analysis process ${processId}:`, error);
      });

    // Return accepted status with process ID
    return res.status(202).json({
      success: true,
      message: 'Analysis process started',
      processId
    });
  } catch (error) {
    console.error('Error starting analysis process:', error);
    return res.status(500).json({
      error: 'Failed to start analysis process',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

