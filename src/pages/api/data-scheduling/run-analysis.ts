import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { schedulingLogger } from '@/lib/schedulingLogger';
import { enhancedLog } from '@/lib/enhancedSchedulingLogger';
import { cleanupStaleProcessingStatuses } from '@/lib/dataSchedulingService';
import { runAnalysisProcess } from '@/lib/analysisUtils';

// Function to log API events with enhanced logging to ProcessingStatus
async function logApiEvent(level: string, message: string, details?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[RUN-ANALYSIS][${timestamp}][${level}] ${message}`, details || '');
  
  // Only log to database if we have a valid userId
  if (details?.userId) {
    try {
      // Use the enhanced logger that also updates ProcessingStatus
      if (details.processId) {
        await enhancedLog({
          processId: details.processId,
          userId: details.userId,
          level: level as any,
          category: 'API',
          operation: 'RUN_ANALYSIS_API',
          message: message,
          details: details
        });
      } else {
        // Fall back to regular logging if no processId
        await schedulingLogger.log({
          processId: `api-run-analysis-${Date.now()}`,
          userId: details.userId,
          level: level as any,
          category: 'API',
          operation: 'RUN_ANALYSIS_API',
          message: message,
          details: details
        });
      }
    } catch (error) {
      console.error('Failed to log API event:', error);
    }
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
    
    // Create a new processing status entry with a UUID
    const processId = `analysis-${Date.now()}`;
    await logApiEvent('INFO', 'Creating processing status entry', { processId, userId: user.id });
    
    try {
      // Create the processing status first with more detailed information
      await prisma.processingStatus.create({
        data: {
          processId,
          userId: user.id,
          status: 'RUNNING',
          type: 'ANALYSIS',
          totalItems: totalItems > 0 ? totalItems : 100, // Use actual count or placeholder
          processedItems: 0,
          startedAt: new Date(),
          message: 'Initializing analysis process',
          details: {
            cryptoSymbols: userCryptos.map(c => c.symbol),
            cryptoCount: userCryptos.length,
            initTime: new Date().toISOString(),
            apiEndpoint: 'run-analysis',
            lastOperation: 'PROCESS_INITIALIZATION',
            lastMessage: 'Initializing analysis process',
            lastTimestamp: new Date().toISOString()
          }
        }
      });

      await logApiEvent('INFO', 'Created processing status for analysis process', { 
        processId,
        userId: user.id,
        totalItems: totalItems > 0 ? totalItems : 100
      });

      // Now that the process exists in the database, we can log to it
      await logApiEvent('INFO', 'Logging analysis process start to scheduling logger', { processId, userId: user.id });
      await enhancedLog({
        processId,
        userId: user.id,
        level: 'INFO',
        category: 'SCHEDULING',
        operation: 'ANALYSIS_START',
        message: 'Starting analysis process via API endpoint',
        details: {
          cryptoCount: userCryptos.length,
          symbols: userCryptos.map(c => c.symbol),
          startTime: new Date().toISOString()
        }
      });
      await logApiEvent('INFO', 'Analysis process logged to scheduling logger', { processId, userId: user.id });
    } catch (error) {
      console.error('Error creating processing status:', error);
      await logApiEvent('ERROR', 'Failed to create processing status', { 
        error: error instanceof Error ? error.message : String(error),
        userId: user.id
      });
      throw error;
    }

    // Start the analysis process in the background
    await logApiEvent('INFO', 'Starting analysis process in background', { processId, userId: user.id });
    
    // Update status to indicate process is starting
    await prisma.processingStatus.update({
      where: { processId },
      data: {
        message: 'Starting analysis process in background',
        details: {
          update: {
            lastOperation: 'BACKGROUND_PROCESS_START',
            lastMessage: 'Starting analysis process in background',
            lastTimestamp: new Date().toISOString(),
            processStartTime: new Date().toISOString()
          }
        }
      }
    });
    
    runAnalysisProcess(processId, user.id)
      .then(() => {
        const duration = (Date.now() - new Date(processId.split('-')[1]).getTime()) / 1000;
        logApiEvent('INFO', `Analysis process completed successfully`, { 
          processId, 
          userId: user.id,
          timestamp: new Date().toISOString(),
          duration: `${duration} seconds`
        });
        
        // Final update to ProcessingStatus is handled in the runAnalysisProcess function
      })
      .catch(error => {
        const duration = (Date.now() - new Date(processId.split('-')[1]).getTime()) / 1000;
        logApiEvent('ERROR', `Error in analysis process`, { 
          processId, 
          userId: user.id,
          timestamp: new Date().toISOString(),
          duration: `${duration} seconds`,
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
            completedAt: new Date(),
            message: `Analysis process failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: {
              update: {
                errorDetails: {
                  message: error instanceof Error ? error.message : 'Unknown error',
                  stack: error instanceof Error ? error.stack : undefined,
                  timestamp: new Date().toISOString()
                },
                lastOperation: 'ANALYSIS_FAILED',
                lastMessage: `Analysis process failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                lastTimestamp: new Date().toISOString(),
                duration: `${duration} seconds`
              }
            }
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