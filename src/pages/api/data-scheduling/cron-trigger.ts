import { NextApiRequest, NextApiResponse } from 'next';
import { runScheduledTasks } from '@/lib/schedulerCron';
import { logCronEvent, createCronTimer, logCronError } from '@/lib/cronLogger';
import { runComprehensiveDebug } from '@/lib/cronDebugger';
import { generateProcessId } from '@/lib/uuidGenerator';
import prisma from '@/lib/prisma';

/**
 * This endpoint is designed to be called by a cron job every minute
 * to check if any scheduled tasks need to be run.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = generateProcessId('cron-request');
  const startTime = new Date();
  
  // IMMEDIATE CONSOLE LOGGING - This should always appear
  console.log(`\n=== CRON TRIGGER ENDPOINT CALLED ===`);
  console.log(`[CRON-TRIGGER] ${startTime.toISOString()} - REQUEST RECEIVED`, {
    requestId,
    method: req.method,
    url: req.url,
    headers: {
      'x-vercel-cron': req.headers['x-vercel-cron'],
      'x-supabase-cron': req.headers['x-supabase-cron'],
      'user-agent': req.headers['user-agent'],
      'authorization': req.headers.authorization ? 'Bearer ***' : 'none'
    },
    body: req.body,
    query: req.query
  });
  console.log(`=== END CRON TRIGGER HEADER ===\n`);

  // IMMEDIATE DATABASE LOGGING - Create ProcessingStatus and Log records
  let processingStatusCreated = false;
  let initialLogCreated = false;
  
  try {
    console.log(`[CRON-TRIGGER] ${requestId} - STEP 1: Creating ProcessingStatus record`);
    
    // Create the ProcessingStatus record first to avoid foreign key constraint violations
    await prisma.processingStatus.create({
      data: {
        processId: requestId,
        userId: 'system',
        status: 'RUNNING',
        type: 'CRON_TRIGGER',
        totalItems: 1,
        processedItems: 0,
        startedAt: startTime,
        details: {
          source: 'cron-trigger-endpoint',
          prefix: 'cron-request',
          method: req.method,
          timestamp: startTime.toISOString(),
          step: 'initial-processing-status-creation'
        },
      },
    });
    processingStatusCreated = true;
    console.log(`[CRON-TRIGGER] ${requestId} - STEP 1: ProcessingStatus record created successfully`);

    console.log(`[CRON-TRIGGER] ${requestId} - STEP 2: Creating initial SchedulingProcessLog record`);
    await prisma.schedulingProcessLog.create({
      data: {
        processId: requestId,
        userId: 'system',
        level: 'INFO',
        category: 'CRON_DEBUG',
        operation: 'CRON_REQUEST_RECEIVED',
        message: `CRON TRIGGER ENDPOINT CALLED - ${req.method} request received at ${startTime.toISOString()}`,
        details: { 
          requestId,
          method: req.method,
          url: req.url,
          timestamp: startTime.toISOString(),
          headers: {
            'x-vercel-cron': req.headers['x-vercel-cron'],
            'x-supabase-cron': req.headers['x-supabase-cron'],
            'user-agent': req.headers['user-agent'],
            'authorization': req.headers.authorization ? 'Bearer ***' : 'none'
          },
          body: req.body,
          query: req.query,
          step: 'initial-log-creation'
        },
        timestamp: startTime
      }
    });
    initialLogCreated = true;
    console.log(`[CRON-TRIGGER] ${requestId} - STEP 2: Initial SchedulingProcessLog record created successfully`);
    
    // Verify the records were created by querying them back
    console.log(`[CRON-TRIGGER] ${requestId} - STEP 3: Verifying records were created`);
    const statusCheck = await prisma.processingStatus.findUnique({
      where: { processId: requestId }
    });
    const logCheck = await prisma.schedulingProcessLog.findMany({
      where: { processId: requestId }
    });
    console.log(`[CRON-TRIGGER] ${requestId} - STEP 3: Verification - ProcessingStatus exists: ${!!statusCheck}, Logs count: ${logCheck.length}`);
    
  } catch (logError) {
    console.error(`[CRON-TRIGGER] ${requestId} - CRITICAL ERROR: Failed to create initial database records:`, logError);
    console.error(`[CRON-TRIGGER] ${requestId} - ProcessingStatus created: ${processingStatusCreated}, Initial log created: ${initialLogCreated}`);
    
    // Try to create a minimal log entry if possible
    if (processingStatusCreated && !initialLogCreated) {
      try {
        await prisma.schedulingProcessLog.create({
          data: {
            processId: requestId,
            userId: 'system',
            level: 'ERROR',
            category: 'CRON_DEBUG',
            operation: 'CRON_INITIAL_LOG_ERROR',
            message: `Failed to create initial log: ${logError instanceof Error ? logError.message : 'Unknown error'}`,
            details: { 
              requestId,
              error: logError instanceof Error ? logError.message : String(logError),
              step: 'error-recovery-log'
            },
            timestamp: new Date()
          }
        });
        console.log(`[CRON-TRIGGER] ${requestId} - Error recovery log created`);
      } catch (recoveryError) {
        console.error(`[CRON-TRIGGER] ${requestId} - Failed to create error recovery log:`, recoveryError);
      }
    }
  }

  const requestTimer = createCronTimer(
    'CRON_TRIGGER',
    'Cron trigger endpoint processing',
    { 
      requestId,
      method: req.method,
      headers: {
        'x-vercel-cron': req.headers['x-vercel-cron'],
        'x-supabase-cron': req.headers['x-supabase-cron'],
        'user-agent': req.headers['user-agent']
      },
      body: req.body,
      query: req.query
    }
  );
  
  // For Vercel or Supabase cron jobs, we don't need to verify authorization as they're triggered internally
  // But we'll keep a simple check for when the endpoint is called from elsewhere
  const authHeader = req.headers.authorization;
  const isVercelCron = req.headers['x-vercel-cron'] === 'true';
  const isSupabaseCron = req.headers['x-supabase-cron'] === 'true';
  
  await logCronEvent('INFO', 'CRON_AUTH_CHECK', 'Validating cron trigger authorization', {
    requestId,
    isVercelCron,
    isSupabaseCron,
    hasAuthHeader: !!authHeader,
    authHeaderPrefix: authHeader ? authHeader.substring(0, 10) + '...' : null
  });
  
  // Skip auth check if it's a Vercel or Supabase cron job
  if (!isVercelCron && !isSupabaseCron && (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`)) {
    await logCronError(
      'CRON_AUTH',
      'Unauthorized cron trigger attempt',
      new Error('Invalid or missing authorization'),
      {
        requestId,
        isVercelCron,
        isSupabaseCron,
        hasAuthHeader: !!authHeader,
        authHeaderPrefix: authHeader ? authHeader.substring(0, 10) + '...' : null
      }
    );
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    // Log authorization success
    console.log(`[CRON-TRIGGER] ${requestId} - Authorization successful`, {
      source: isSupabaseCron ? 'supabase' : isVercelCron ? 'vercel' : 'direct',
      isVercelCron,
      isSupabaseCron,
      hasAuthHeader: !!authHeader
    });

    await prisma.schedulingProcessLog.create({
      data: {
        processId: requestId,
        userId: 'system',
        level: 'INFO',
        category: 'CRON_DEBUG',
        operation: 'CRON_AUTHORIZED',
        message: 'Cron trigger authorized, checking for scheduled tasks',
        details: { 
          requestId,
          source: isSupabaseCron ? 'supabase' : isVercelCron ? 'vercel' : 'direct',
          timestamp: new Date().toISOString(),
          isVercelCron,
          isSupabaseCron,
          hasAuthHeader: !!authHeader
        },
        timestamp: new Date()
      }
    });

    // Accept force param from body or query
    let force = false;
    if (typeof req.body === 'object' && req.body !== null && 'force' in req.body) {
      force = Boolean(req.body.force);
    } else if (typeof req.query.force !== 'undefined') {
      force = req.query.force === 'true' || req.query.force === '1';
    }

    console.log(`[CRON-TRIGGER] ${requestId} - Force parameter: ${force}`);

    if (force) {
      // Log force run directly to database
      await prisma.schedulingProcessLog.create({
        data: {
          processId: requestId,
          userId: 'system',
          level: 'INFO',
          category: 'CRON_DEBUG',
          operation: 'CRON_FORCE_RUN',
          message: 'Force run parameter detected, will run all scheduled tasks regardless of time',
          details: { requestId, force },
          timestamp: new Date()
        }
      });
    }
    
    // Run the scheduled tasks check with simplified error handling
    try {
      // Run comprehensive debug to gather system state information
      try {
        await runComprehensiveDebug();
        
        // Log debug completion directly to database
        await prisma.schedulingProcessLog.create({
          data: {
            processId: requestId,
            userId: 'system',
            level: 'INFO',
            category: 'CRON_DEBUG',
            operation: 'CRON_DEBUG_COMPLETE',
            message: 'Comprehensive debug completed, results in SchedulingProcessLog',
            details: { requestId },
            timestamp: new Date()
          }
        });
      } catch (debugError) {
        console.error('Error running comprehensive debug:', debugError);
        
        // Log debug error directly to database
        await prisma.schedulingProcessLog.create({
          data: {
            processId: requestId,
            userId: 'system',
            level: 'ERROR',
            category: 'CRON_DEBUG',
            operation: 'CRON_DEBUG_ERROR',
            message: `Error running comprehensive debug: ${debugError instanceof Error ? debugError.message : 'Unknown error'}`,
            details: { 
              requestId,
              error: debugError instanceof Error ? debugError.message : 'Unknown error',
              stack: debugError instanceof Error ? debugError.stack : undefined
            },
            timestamp: new Date()
          }
        });
        
        // Continue despite debug error
      }
      
      // Log tasks start directly to database
      await prisma.schedulingProcessLog.create({
        data: {
          processId: requestId,
          userId: 'system',
          level: 'INFO',
          category: 'CRON_DEBUG',
          operation: 'SCHEDULED_TASKS_START',
          message: 'Running scheduled tasks',
          details: { requestId, force },
          timestamp: new Date()
        }
      });
      
      // Run the scheduled tasks
      await runScheduledTasks(force);
      
      // Log tasks completion directly to database
      await prisma.schedulingProcessLog.create({
        data: {
          processId: requestId,
          userId: 'system',
          level: 'INFO',
          category: 'CRON_DEBUG',
          operation: 'SCHEDULED_TASKS_COMPLETE',
          message: 'Scheduled tasks completed successfully',
          details: { requestId, force, success: true },
          timestamp: new Date()
        }
      });
    } catch (tasksError) {
      console.error('Error running scheduled tasks:', tasksError);
      
      // Log tasks error directly to database
      await prisma.schedulingProcessLog.create({
        data: {
          processId: requestId,
          userId: 'system',
          level: 'ERROR',
          category: 'CRON_DEBUG',
          operation: 'SCHEDULED_TASKS_ERROR',
          message: `Error running scheduled tasks: ${tasksError instanceof Error ? tasksError.message : 'Unknown error'}`,
          details: { 
            requestId, 
            force,
            error: tasksError instanceof Error ? tasksError.message : 'Unknown error',
            stack: tasksError instanceof Error ? tasksError.stack : undefined
          },
          timestamp: new Date()
        }
      });
      
      throw tasksError; // Re-throw to be caught by the outer catch
    }
    
    // Return success
    await requestTimer.end({ success: true });
    return res.status(200).json({
      success: true,
      message: 'Scheduled tasks check completed',
      timestamp: new Date().toISOString(),
      source: isSupabaseCron ? 'supabase' : isVercelCron ? 'vercel' : 'direct',
      force
    });
  } catch (error) {
    await logCronError(
      'CRON_TRIGGER',
      'Error in cron trigger handler',
      error,
      { requestId }
    );
    
    return res.status(500).json({
      success: false,
      message: 'Error running scheduled tasks check',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

// Configure the API route
export const config = {
  api: {
    bodyParser: true,
  },
};