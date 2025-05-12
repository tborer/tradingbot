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
    // Get the process ID from the query parameters
    const { processId } = req.query;

    if (!processId || typeof processId !== 'string') {
      return res.status(400).json({ error: 'Process ID is required' });
    }

    // Get the processing status with retry logic for database connectivity issues
    let processingStatus = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        processingStatus = await prisma.processingStatus.findUnique({
          where: {
            processId,
          },
        });
        break; // Success, exit the retry loop
      } catch (dbError) {
        // Check if it's a database connectivity error
        if (dbError instanceof Error && 
            dbError.message.includes("Can't reach database server")) {
          retryCount++;
          if (retryCount < maxRetries) {
            // Exponential backoff: 500ms, 1s, 2s
            const delay = 500 * Math.pow(2, retryCount - 1);
            console.log(`Database connectivity error, retrying (attempt ${retryCount + 1}) after ${delay}ms delay...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        // If it's not a connectivity error or we've exhausted retries, rethrow
        throw dbError;
      }
    }

    if (!processingStatus) {
      return res.status(404).json({ error: 'Processing status not found' });
    }

    // Check if the processing status belongs to the user
    if (processingStatus.userId !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Return the processing status
    return res.status(200).json({
      success: true,
      data: {
        processId: processingStatus.processId,
        status: processingStatus.status,
        type: processingStatus.type,
        startedAt: processingStatus.startedAt,
        completedAt: processingStatus.completedAt,
        totalItems: processingStatus.totalItems,
        processedItems: processingStatus.processedItems,
        progress: processingStatus.totalItems > 0 
          ? Math.round((processingStatus.processedItems / processingStatus.totalItems) * 100) 
          : 0,
        error: processingStatus.error,
        details: processingStatus.details
      }
    });
  } catch (error) {
    console.error('Error getting processing status:', error);
    return res.status(500).json({ 
      error: 'Failed to get processing status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}