import { NextApiRequest, NextApiResponse } from 'next';
import { runScheduledTasks } from '@/lib/schedulerCron';
import { logCronEvent, createCronTimer, logCronError } from '@/lib/cronLogger';

/**
 * This endpoint is designed to be called by a cron job every minute
 * to check if any scheduled tasks need to be run.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = Date.now().toString();
  const requestTimer = createCronTimer(
    'CRON_TRIGGER',
    'Cron trigger endpoint called',
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
    await logCronEvent('INFO', 'CRON_AUTHORIZED', 'Cron trigger authorized, checking for scheduled tasks', { 
      requestId,
      source: isSupabaseCron ? 'supabase' : isVercelCron ? 'vercel' : 'direct',
      timestamp: new Date().toISOString()
    });
    
    // Run the scheduled tasks check
    const tasksTimer = createCronTimer(
      'SCHEDULED_TASKS',
      'Running scheduled tasks',
      { requestId }
    );
    
    try {
      await runScheduledTasks();
      await tasksTimer.end({ success: true });
    } catch (tasksError) {
      await logCronError(
        'SCHEDULED_TASKS',
        'Error running scheduled tasks',
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
      timestamp: new Date().toISOString(),
      source: isSupabaseCron ? 'supabase' : isVercelCron ? 'vercel' : 'direct'
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