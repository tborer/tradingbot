import { NextApiRequest, NextApiResponse } from 'next';
import { runScheduledTasks } from '@/lib/schedulerCron';
import { schedulingLogger } from '@/lib/schedulingLogger';

// Function to log cron events
async function logCronEvent(level: string, message: string, details?: any) {
  console.log(`[CRON][${level}] ${message}`, details || '');
  try {
    await schedulingLogger.log({
      processId: `cron-trigger-${Date.now()}`,
      userId: 'system',
      level: level as any,
      category: 'CRON',
      operation: 'CRON_TRIGGER',
      message: message,
      details: details
    });
  } catch (error) {
    console.error('Failed to log cron event:', error);
  }
}

/**
 * This endpoint is designed to be called by a cron job every minute
 * to check if any scheduled tasks need to be run.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = Date.now().toString();
  await logCronEvent('INFO', 'Cron trigger endpoint called', { 
    requestId,
    method: req.method,
    headers: {
      'x-vercel-cron': req.headers['x-vercel-cron'],
      'user-agent': req.headers['user-agent']
    }
  });
  
  // For Vercel cron jobs, we don't need to verify authorization as they're triggered internally
  // But we'll keep a simple check for when the endpoint is called from elsewhere
  const authHeader = req.headers.authorization;
  const isVercelCron = req.headers['x-vercel-cron'] === 'true';
  
  await logCronEvent('INFO', 'Validating cron trigger authorization', {
    requestId,
    isVercelCron,
    hasAuthHeader: !!authHeader
  });
  
  // Skip auth check if it's a Vercel cron job
  if (!isVercelCron && (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`)) {
    await logCronEvent('ERROR', 'Unauthorized cron trigger attempt', {
      requestId,
      isVercelCron,
      hasAuthHeader: !!authHeader
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    await logCronEvent('INFO', 'Cron trigger authorized, checking for scheduled tasks', { requestId });
    
    // Run the scheduled tasks check
    await logCronEvent('INFO', 'Starting scheduled tasks execution', { requestId });
    const startTime = Date.now();
    await runScheduledTasks();
    const duration = Date.now() - startTime;
    await logCronEvent('INFO', 'Scheduled tasks execution completed', { 
      requestId,
      durationMs: duration
    });
    
    // Return success
    await logCronEvent('INFO', 'Returning success response', { requestId });
    return res.status(200).json({
      success: true,
      message: 'Scheduled tasks check completed',
      timestamp: new Date().toISOString(),
      executionTimeMs: duration
    });
  } catch (error) {
    await logCronEvent('ERROR', 'Error running scheduled tasks check', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return res.status(500).json({
      success: false,
      message: 'Error running scheduled tasks check',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Configure the API route
export const config = {
  api: {
    bodyParser: true,
  },
};