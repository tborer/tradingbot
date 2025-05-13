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
    
    // Get query parameters
    const { page = '1', limit = '10', requestType, status } = req.query;
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;
    
    // Build the where clause
    const where: any = { userId: user.id };
    
    if (requestType) {
      where.requestType = requestType;
    }
    
    if (status) {
      where.status = status;
    }
    
    // Get total count for pagination
    const totalCount = await prisma.aIProcessingLog.count({
      where
    });
    
    // Get logs with pagination
    const logs = await prisma.aIProcessingLog.findMany({
      where,
      orderBy: {
        timestamp: 'desc'
      },
      skip,
      take: limitNumber,
      select: {
        id: true,
        timestamp: true,
        requestType: true,
        modelUsed: true,
        processingTimeMs: true,
        status: true,
        errorMessage: true,
        // Exclude full input data and response for the list view to reduce payload size
        inputData: false,
        fullPrompt: false,
        aiResponse: false
      }
    });
    
    return res.status(200).json({
      logs,
      pagination: {
        total: totalCount,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalCount / limitNumber)
      }
    });
  } catch (error) {
    console.error('Error fetching AI processing logs:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch AI processing logs',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}