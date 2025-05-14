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
    console.log('Starting analysis process via API endpoint');
    
    // Get user from session
    const supabase = createClient(req, res);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Clean up stale processing statuses
    await cleanupStaleProcessingStatuses();

    // Get user's cryptos to determine total items
    const userCryptos = await prisma.crypto.findMany({
      where: {
        userId: user.id
      },
      select: {
        symbol: true
      }
    });

    const totalItems = userCryptos.length * 5; // 5 steps per crypto
    
    // Create a new processing status entry
    const processId = `analysis-${Date.now()}`;
    await prisma.processingStatus.create({
      data: {
        processId,
        userId: user.id,
        status: 'RUNNING',
        type: 'ANALYSIS',
        totalItems: totalItems > 0 ? totalItems : 100, // Use actual count or placeholder
        processedItems: 0,
        startedAt: new Date()
      }
    });

    console.log(`Created processing status for analysis process ${processId}`);

    // Log the start of the analysis process
    await schedulingLogger.log({
      processId,
      userId: user.id,
      level: 'INFO',
      category: 'SCHEDULING',
      operation: 'ANALYSIS_START',
      message: 'Starting analysis process via API endpoint'
    });

    // Start the analysis process in the background
    runAnalysisProcess(processId, user.id)
      .then(() => {
        console.log(`Analysis process ${processId} completed successfully`);
      })
      .catch(error => {
        console.error(`Error in analysis process ${processId}:`, error);
        
        // Update processing status to failed if there's an error
        prisma.processingStatus.update({
          where: { processId },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message : String(error),
            completedAt: new Date()
          }
        }).catch(statusError => {
          console.error(`Error updating processing status for ${processId}:`, statusError);
        });
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
