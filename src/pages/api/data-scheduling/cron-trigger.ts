import { NextApiRequest, NextApiResponse } from 'next';
import { runScheduledTasks } from '@/lib/schedulerCron';

/**
 * This endpoint is designed to be called by a cron job every minute
 * to check if any scheduled tasks need to be run.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // For Vercel cron jobs, we don't need to verify authorization as they're triggered internally
  // But we'll keep a simple check for when the endpoint is called from elsewhere
  const authHeader = req.headers.authorization;
  const isVercelCron = req.headers['x-vercel-cron'] === 'true';
  
  // Skip auth check if it's a Vercel cron job
  if (!isVercelCron && (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`)) {
    console.log('Unauthorized cron trigger attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    console.log('Cron trigger received, checking for scheduled tasks...');
    
    // Run the scheduled tasks check
    await runScheduledTasks();
    
    // Return success
    return res.status(200).json({
      success: true,
      message: 'Scheduled tasks check completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error running scheduled tasks check:', error);
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