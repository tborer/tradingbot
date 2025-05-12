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
    // Get query parameters
    const { 
      processId, 
      category, 
      level, 
      symbol, 
      search,
      page = '1',
      pageSize = '50'
    } = req.query;

    // Validate processId
    if (!processId || typeof processId !== 'string') {
      return res.status(400).json({ error: 'Process ID is required' });
    }

    // Build the query
    const where: any = {
      processId,
      userId: user.id
    };

    // Add optional filters
    if (category && typeof category === 'string') {
      where.category = category;
    }

    if (level && typeof level === 'string') {
      where.level = level;
    }

    if (symbol && typeof symbol === 'string') {
      where.symbol = symbol;
    }

    // Add search filter
    if (search && typeof search === 'string') {
      where.OR = [
        { message: { contains: search, mode: 'insensitive' } },
        { operation: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Add symbol filter
    if (symbol && typeof symbol === 'string') {
      // Handle null symbols by using a more complex condition
      if (symbol.toLowerCase() === 'none' || symbol.toLowerCase() === 'null') {
        where.symbol = null;
      } else {
        where.symbol = { contains: symbol, mode: 'insensitive' };
      }
    }

    // Parse pagination parameters
    const pageNum = parseInt(page as string, 10);
    const pageSizeNum = parseInt(pageSize as string, 10);
    
    // Validate pagination parameters
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ error: 'Invalid page number' });
    }
    
    if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 100) {
      return res.status(400).json({ error: 'Invalid page size' });
    }

    // Calculate skip value for pagination
    const skip = (pageNum - 1) * pageSizeNum;

    // Get total count for pagination
    const totalCount = await prisma.schedulingProcessLog.count({ where });
    const totalPages = Math.ceil(totalCount / pageSizeNum);

    // Get logs with pagination
    const logs = await prisma.schedulingProcessLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip,
      take: pageSizeNum
    });

    return res.status(200).json({
      success: true,
      logs,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        totalCount,
        totalPages
      },
      totalPages
    });
  } catch (error) {
    console.error('Error fetching scheduling logs:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch scheduling logs',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}