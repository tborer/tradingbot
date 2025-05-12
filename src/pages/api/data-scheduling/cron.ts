import { NextApiRequest, NextApiResponse } from 'next';
import { runScheduledTasks } from '@/lib/schedulerCron';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // This endpoint should only be called by a cron job or authorized system
  // In a production environment, you would add authentication here
  
  try {
    // Run the scheduled tasks
    await runScheduledTasks();
    
    // Return success
    return res.status(200).json({
      success: true,
      message: 'Scheduled tasks check completed'
    });
  } catch (error) {
    console.error('Error running scheduled tasks:', error);
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