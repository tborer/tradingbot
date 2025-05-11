import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { createClient } from '@/util/supabase/api';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Create authenticated Supabase client
  const supabase = createClient(req, res);
  
  // Get user from session
  const {
    data: { session },
  } = await supabase.auth.getSession();
  
  // If no session or no user, return 401
  if (!session || !session.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'You must be logged in to access this resource',
    });
  }
  
  const userId = session.user.id;
  
  // Handle GET request
  if (req.method === 'GET') {
    try {
      // Get query parameters
      const { symbol, page = '1', limit = '10' } = req.query;
      
      // Parse pagination parameters
      const pageNumber = parseInt(page as string, 10);
      const limitNumber = parseInt(limit as string, 10);
      const skip = (pageNumber - 1) * limitNumber;
      
      // Build query
      const whereClause: any = {};
      
      // Filter by symbol if provided
      if (symbol) {
        whereClause.symbol = symbol as string;
      } else {
        // If no symbol provided, get user's cryptos to filter by
        const userCryptos = await prisma.crypto.findMany({
          where: { userId },
          select: { symbol: true },
        });
        
        if (userCryptos.length > 0) {
          whereClause.symbol = {
            in: userCryptos.map(crypto => crypto.symbol),
          };
        }
      }
      
      // Get total count for pagination
      const totalCount = await prisma.cryptoTechnicalPatternEncodings.count({
        where: whereClause,
      });
      
      // Get pattern encodings
      const patternEncodings = await prisma.cryptoTechnicalPatternEncodings.findMany({
        where: whereClause,
        orderBy: {
          timestamp: 'desc',
        },
        skip,
        take: limitNumber,
      });
      
      // Return data with pagination info
      return res.status(200).json({
        data: patternEncodings,
        pagination: {
          total: totalCount,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(totalCount / limitNumber),
        },
      });
    } catch (error) {
      console.error('Error fetching pattern encodings:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch pattern encodings',
      });
    }
  }
  
  // Handle POST request (manually trigger generation for a specific symbol)
  else if (req.method === 'POST') {
    try {
      const { symbol } = req.body;
      
      if (!symbol) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Symbol is required',
        });
      }
      
      // Check if the user has this crypto
      const crypto = await prisma.crypto.findFirst({
        where: {
          userId,
          symbol,
        },
      });
      
      if (!crypto) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Cryptocurrency ${symbol} not found in your portfolio`,
        });
      }
      
      // Import the necessary functions
      const { generatePatternEncodings, savePatternEncodings } = await import('@/lib/patternEncodingsUtils');
      
      // Generate and save pattern encodings
      const now = new Date();
      const patternEncodings = await generatePatternEncodings(symbol, now);
      const savedEncodings = await savePatternEncodings(symbol, patternEncodings);
      
      return res.status(201).json({
        message: `Pattern encodings generated for ${symbol}`,
        data: savedEncodings,
      });
    } catch (error) {
      console.error('Error generating pattern encodings:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to generate pattern encodings',
      });
    }
  }
  
  // Handle unsupported methods
  else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).json({
      error: 'Method Not Allowed',
      message: `Method ${req.method} is not allowed`,
    });
  }
}