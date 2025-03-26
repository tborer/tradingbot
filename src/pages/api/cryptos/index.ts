import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { 
  handleApiError, 
  ApiErrorCodes, 
  ErrorCategory, 
  ErrorSeverity, 
  createAndLogError, 
  formatErrorForResponse 
} from '@/lib/errorLogger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session || !session.user) {
      const errorDetails = createAndLogError(
        ErrorCategory.AUTH,
        ErrorSeverity.ERROR,
        4001,
        'Unauthorized access attempt to cryptos API',
        { 
          path: req.url,
          method: req.method,
          headers: req.headers,
          timestamp: Date.now()
        }
      );
      return res.status(401).json(formatErrorForResponse(errorDetails));
    }
    
    const user = session.user;
    
    // GET - Fetch all cryptos for the user
    if (req.method === 'GET') {
      const cryptos = await prisma.crypto.findMany({
        where: { userId: user.id },
        orderBy: { priority: 'asc' },
      });
      
      return res.status(200).json(cryptos);
    }
    
    // POST - Add a new crypto
    if (req.method === 'POST') {
      const { symbol, purchasePrice, shares } = req.body;
      
      if (!symbol || !purchasePrice) {
        const errorDetails = createAndLogError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.ERROR,
          2002,
          'Missing required fields for crypto creation',
          { 
            path: req.url,
            method: req.method,
            body: { symbol, purchasePrice },
            userId: user.id,
            timestamp: Date.now()
          }
        );
        return res.status(400).json(formatErrorForResponse(errorDetails));
      }
      
      // Check if crypto already exists for this user
      const existingCrypto = await prisma.crypto.findFirst({
        where: {
          userId: user.id,
          symbol: symbol.toUpperCase(),
        },
      });
      
      if (existingCrypto) {
        const errorDetails = createAndLogError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.ERROR,
          2003,
          'Duplicate crypto in portfolio',
          { 
            path: req.url,
            method: req.method,
            symbol: symbol.toUpperCase(),
            userId: user.id,
            timestamp: Date.now()
          }
        );
        return res.status(400).json(formatErrorForResponse(errorDetails));
      }
      
      // Get the highest priority to add the new crypto at the end
      const highestPriority = await prisma.crypto.findFirst({
        where: { userId: user.id },
        orderBy: { priority: 'desc' },
        select: { priority: true },
      });
      
      const newPriority = highestPriority ? highestPriority.priority + 1 : 0;
      
      // Create the new crypto
      const newCrypto = await prisma.crypto.create({
        data: {
          symbol: symbol.toUpperCase(),
          purchasePrice: parseFloat(purchasePrice),
          shares: parseFloat(shares) || 0,
          priority: newPriority,
          userId: user.id,
        },
      });
      
      console.log(`Added new crypto: ${symbol.toUpperCase()}. Kraken WebSocket subscription will be updated on next connection.`);
      
      return res.status(201).json(newCrypto);
    }
    
    // PUT - Update crypto priorities (reordering)
    if (req.method === 'PUT') {
      const { cryptos } = req.body;
      
      if (!cryptos || !Array.isArray(cryptos)) {
        const errorDetails = createAndLogError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.ERROR,
          2004,
          'Invalid request body for crypto priority update',
          { 
            path: req.url,
            method: req.method,
            body: req.body,
            userId: user.id,
            timestamp: Date.now()
          }
        );
        return res.status(400).json(formatErrorForResponse(errorDetails));
      }
      
      // Update each crypto's priority
      const updatePromises = cryptos.map((crypto, index) => 
        prisma.crypto.update({
          where: { id: crypto.id },
          data: { priority: index },
        })
      );
      
      await Promise.all(updatePromises);
      
      return res.status(200).json({ message: 'Crypto order updated successfully' });
    }
    
    const errorDetails = createAndLogError(
      ErrorCategory.API,
      ErrorSeverity.ERROR,
      2005,
      'Method not allowed',
      { 
        path: req.url,
        method: req.method,
        timestamp: Date.now()
      }
    );
    return res.status(405).json(formatErrorForResponse(errorDetails));
  } catch (error) {
    // Use the handleApiError utility for consistent error handling
    const errorDetails = handleApiError(error, ErrorCategory.API, 'Error processing crypto request');
    
    // Add request-specific context to the error
    errorDetails.context = {
      ...errorDetails.context,
      path: req.url,
      method: req.method,
      userId: session?.user?.id || 'unknown'
    };
    
    // Log the error with full details
    console.error(`[${errorDetails.code}] API Error:`, errorDetails.message, errorDetails.context);
    
    // Return a sanitized error response to the client
    return res.status(500).json(formatErrorForResponse(errorDetails));
  }
}