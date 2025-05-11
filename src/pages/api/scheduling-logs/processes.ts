import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the user from the session
  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get unique process IDs for the user, ordered by most recent first
    const processes = await prisma.processingStatus.findMany({
      where: {
        userId: user.id,
        logs: {
          some: {} // Only include processes that have logs
        }
      },
      orderBy: {
        startedAt: 'desc'
      },
      select: {
        processId: true,
        type: true,
        status: true,
        startedAt: true
      },
      take: 50 // Limit to the 50 most recent processes
    });

    // Format the response
    const processIds = processes.map(process => process.processId);
    const processDetails = processes.map(process => ({
      processId: process.processId,
      type: process.type,
      status: process.status,
      startedAt: process.startedAt
    }));

    return res.status(200).json({
      success: true,
      processIds,
      processes: processDetails
    });
  } catch (error) {
    console.error('Error fetching process IDs:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch process IDs',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}