import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { fetchAndAnalyzeTrends } from '@/lib/coinDesk';
import { 
  ErrorCategory, 
  ErrorSeverity, 
  createAndLogError, 
  ApiErrorCodes 
} from '@/lib/errorLogger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now();
  const requestId = `trend-analysis-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  
  // Log request details
  console.log(`[${requestId}] Trend analysis request started for symbol: ${req.body?.symbol || 'unknown'}`);
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    const errorDetails = createAndLogError(
      ErrorCategory.API,
      ErrorSeverity.WARNING,
      4000,
      `Method ${req.method} not allowed for trend analysis`,
      { requestId, method: req.method }
    );
    return res.status(405).json({ error: 'Method not allowed', code: errorDetails.code });
  }

  try {
    // Get the Supabase client
    const supabase = createClient(req);

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const errorDetails = createAndLogError(
        ErrorCategory.AUTH,
        ErrorSeverity.ERROR,
        4001,
        'Unauthorized access to trend analysis API',
        { requestId }
      );
      return res.status(401).json({ error: 'Unauthorized', code: errorDetails.code });
    }

    // Get the symbol from the request body
    const { symbol } = req.body;
    if (!symbol) {
      const errorDetails = createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.ERROR,
        4002,
        'Missing symbol in trend analysis request',
        { requestId, body: req.body }
      );
      return res.status(400).json({ error: 'Symbol is required', code: errorDetails.code });
    }

    console.log(`[${requestId}] Processing trend analysis for symbol: ${symbol}`);

    // Get the CoinDesk API key from environment variables
    const apiKey = process.env.NEXT_PUBLIC_COINDESK_API_KEY;
    if (!apiKey) {
      const errorDetails = createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.CRITICAL,
        4003,
        'CoinDesk API key not configured',
        { requestId, symbol }
      );
      return res.status(500).json({ error: 'CoinDesk API key not configured', code: errorDetails.code });
    }

    // Fetch and analyze trend data
    console.log(`[${requestId}] Fetching and analyzing trend data for ${symbol}`);
    const analysis = await fetchAndAnalyzeTrends(symbol, apiKey, 30);

    if (!analysis) {
      const errorDetails = createAndLogError(
        ErrorCategory.API,
        ErrorSeverity.ERROR,
        4004,
        `Failed to analyze trends for ${symbol}`,
        { requestId, symbol }
      );
      return res.status(500).json({ error: 'Failed to analyze trends', code: errorDetails.code });
    }

    // Log success
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Trend analysis completed successfully for ${symbol} in ${duration}ms`);

    // Return the analysis results
    return res.status(200).json({ 
      analysis,
      meta: {
        requestId,
        duration,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorDetails = createAndLogError(
      ErrorCategory.API,
      ErrorSeverity.ERROR,
      4005,
      `Error analyzing trends: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { 
        requestId, 
        symbol: req.body?.symbol,
        duration,
        stack: error instanceof Error ? error.stack : undefined
      },
      error instanceof Error ? error : undefined
    );
    
    console.error(`[${requestId}] Error in trend analysis:`, error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error instanceof Error ? error.message : 'Unknown error',
      code: errorDetails.code
    });
  }
}