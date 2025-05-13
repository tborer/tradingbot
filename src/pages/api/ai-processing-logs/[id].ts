import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const supabase = createClient(req, res);
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Get the log ID from the URL
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Log ID is required' });
    }
    
    // Get the log with all details
    const log = await prisma.aIProcessingLog.findUnique({
      where: {
        id: id,
      }
    });
    
    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }
    
    // Ensure the log belongs to the authenticated user
    if (log.userId !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    return res.status(200).json(log);
  } catch (error) {
    console.error('Error fetching AI processing log details:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch AI processing log details',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}