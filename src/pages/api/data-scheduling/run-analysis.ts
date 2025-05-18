import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { schedulingLogger } from '@/lib/schedulingLogger';
import { cleanupStaleProcessingStatuses } from '@/lib/dataSchedulingService';
import { runAnalysisProcess } from '@/lib/analysisUtils';

// Function to log API events
async function logApiEvent(level: string, message: string, details?: any) {
  console.log(`[RUN-ANALYSIS][${level}] ${message}`, details || '');
  try {
    await schedulingLogger.log({
      processId: `api-run-analysis-${Date.now()}`,
      userId: details?.userId || 'system',
      level: level as any,
      category: 'API',
      operation: 'RUN_ANALYSIS_API',
      message: message,
      details: details
    });
  } catch (error) {
    console.error('Failed to log API event:', error);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await logApiEvent('INFO', 'Run Analysis API endpoint called', { 
    method: req.method,
    headers: {
      'user-agent': req.headers['user-agent']
    }
  });
  
  if (req.method !== 'POST') {
    await logApiEvent('WARNING', 'Method not allowed', { method: req.method });
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await logApiEvent('INFO', 'Starting analysis process via API endpoint');
    
    // Get user from session
    await logApiEvent('INFO', 'Authenticating user');
    const supabase = createClient(req, res);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      await logApiEvent('ERROR', 'Authentication failed - no user found');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    await logApiEvent('INFO', 'User authenticated successfully', { userId: user.id });

    // Clean up stale processing statuses
    await logApiEvent('INFO', 'Cleaning up stale processing statuses');
    await cleanupStaleProcessingStatuses();
    await logApiEvent('INFO', 'Stale processing statuses cleaned up');

    // Get user's cryptos to determine total items
    await logApiEvent('INFO', 'Fetching user cryptocurrencies', { userId: user.id });
    const userCryptos = await prisma.crypto.findMany({
      where: {
        userId: user.id
      },
      select: {
        symbol: true
      }
    });
    await logApiEvent('INFO', 'User cryptocurrencies fetched', { 
      userId: user.id,
      count: userCryptos.length,
      symbols: userCryptos.map(c => c.symbol)
    });

    const totalItems = userCryptos.length * 5; // 5 steps per crypto
    
    // Create a new processing status entry
    const processId = `analysis-${Date.now()}`;
    await logApiEvent('INFO', 'Creating processing status entry', { processId, userId: user.id });
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

    await logApiEvent('INFO', 'Created processing status for analysis process', { 
      processId,
      userId: user.id,
      totalItems: totalItems > 0 ? totalItems : 100
    });

    // Log the start of the analysis process
    await logApiEvent('INFO', 'Logging analysis process start to scheduling logger', { processId, userId: user.id });
    await schedulingLogger.log({
      processId,
      userId: user.id,
      level: 'INFO',
      category: 'SCHEDULING',
      operation: 'ANALYSIS_START',
      message: 'Starting analysis process via API endpoint'
    });
    await logApiEvent('INFO', 'Analysis process logged to scheduling logger');

    // Start the analysis process in the background
    await logApiEvent('INFO', 'Starting analysis process in background', { processId, userId: user.id });
    runAnalysisProcess(processId, user.id)
      .then(() => {
        logApiEvent('INFO', `Analysis process completed successfully`, { processId, userId: user.id });
      })
      .catch(error => {
        logApiEvent('ERROR', `Error in analysis process`, { 
          processId, 
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        
        // Update processing status to failed if there's an error
        logApiEvent('INFO', 'Updating processing status to FAILED', { processId, userId: user.id });
        prisma.processingStatus.update({
          where: { processId },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message : String(error),
            completedAt: new Date()
          }
        }).then(() => {
          logApiEvent('INFO', 'Processing status updated to FAILED', { processId, userId: user.id });
        }).catch(statusError => {
          logApiEvent('ERROR', `Error updating processing status`, {
            processId,
            userId: user.id,
            error: statusError instanceof Error ? statusError.message : String(statusError)
          });
        });
      });

    // Return accepted status with process ID
    await logApiEvent('INFO', 'Returning success response to client', { processId, userId: user.id });
    return res.status(202).json({
      success: true,
      message: 'Analysis process started',
      processId
    });
  } catch (error) {
    await logApiEvent('ERROR', 'Error starting analysis process', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return res.status(500).json({
      error: 'Failed to start analysis process',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}