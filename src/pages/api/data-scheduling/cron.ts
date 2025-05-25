import { NextApiRequest, NextApiResponse } from 'next';
import { runScheduledTasks } from '@/lib/schedulerCron';
import { logCronEvent, createCronTimer, logCronError } from '@/lib/cronLogger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // This endpoint should only be called by a cron job or authorized system
  const requestId = Date.now().toString();
  const requestTimer = createCronTimer(
    'CRON_DIRECT',
    'Direct cron endpoint called',
    { 
      requestId,
      method: req.method,
      headers: {
        'user-agent': req.headers['user-agent']
      },
      body: req.body,
      query: req.query
    }
  );
  
  // Basic authentication check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await logCronError(
      'CRON_AUTH',
      'Missing or invalid authorization header',
      new Error('Invalid or missing authorization'),
      { requestId }
    );
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const tasksTimer = createCronTimer(
      'DIRECT_SCHEDULED_TASKS',
      'Running scheduled tasks from direct endpoint',
      { requestId }
    );
    
    try {
      // Run the scheduled tasks
      await runScheduledTasks();
      await tasksTimer.end({ success: true });
    } catch (tasksError) {
      await logCronError(
        'DIRECT_SCHEDULED_TASKS',
        'Error running scheduled tasks from direct endpoint',
        tasksError,
        { requestId }
      );
      throw tasksError; // Re-throw to be caught by the outer catch
    }
    
    // Return success
    await requestTimer.end({ success: true });
    return res.status(200).json({
      success: true,
      message: 'Scheduled tasks check completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    await logCronError(
      'CRON_DIRECT',
      'Error in direct cron handler',
      error,
      { requestId }
    );
    
    return res.status(500).json({
      success: false,
      message: 'Error running scheduled tasks',
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