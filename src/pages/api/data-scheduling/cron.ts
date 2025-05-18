import { NextApiRequest, NextApiResponse } from 'next';
import { runScheduledTasks } from '@/lib/schedulerCron';
import { schedulingLogger } from '@/lib/schedulingLogger';

// Function to log cron events
async function logCronEvent(level: string, message: string, details?: any) {
  console.log(`[CRON][${level}] ${message}`, details || '');
  try {
    await schedulingLogger.log({
      processId: `cron-direct-${Date.now()}`,
      userId: 'system',
      level: level as any,
      category: 'CRON',
      operation: 'CRON_DIRECT',
      message: message,
      details: details
    });
  } catch (error) {
    console.error('Failed to log cron event:', error);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // This endpoint should only be called by a cron job or authorized system
  // In a production environment, you would add authentication here
  const requestId = Date.now().toString();
  
  await logCronEvent('INFO', 'Direct cron endpoint called', { 
    requestId,
    method: req.method,
    headers: {
      'user-agent': req.headers['user-agent']
    }
  });
  
  // Basic authentication check - in a real environment, this should be more secure
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await logCronEvent('WARNING', 'Missing or invalid authorization header', { requestId });
    // We'll still proceed for now, but log the warning
  }
  
  try {
    await logCronEvent('INFO', 'Starting scheduled tasks execution', { requestId });
    const startTime = Date.now();
    
    // Run the scheduled tasks
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
    await logCronEvent('ERROR', 'Error running scheduled tasks', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return res.status(500).json({
      success: false,
      message: 'Error running scheduled tasks',
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