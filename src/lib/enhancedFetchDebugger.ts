import prisma from '@/lib/prisma';
import { logCronDebug } from '@/lib/cronDebugger';
import { fetchAndStoreHourlyCryptoData as originalFetchAndStore } from '@/lib/dataSchedulingService';

/**
 * Enhanced version of fetchAndStoreHourlyCryptoData with additional debugging
 * This wrapper adds detailed logging before and after the original function call
 */
export async function enhancedFetchAndStoreHourlyCryptoData(userId: string): Promise<{
  success: boolean;
  message: string;
  data?: any;
  error?: any;
  processId?: string;
}> {
  const debugProcessId = `debug-fetch-${Date.now()}`;
  
  try {
    // Log start of enhanced fetch
    await logCronDebug(
      'ENHANCED_FETCH_START',
      `Starting enhanced fetch and store for user ${userId}`,
      { userId, debugProcessId },
      userId
    );
    
    // Check for data scheduling settings
    const settings = await prisma.dataScheduling.findUnique({
      where: { userId }
    });
    
    await logCronDebug(
      'ENHANCED_FETCH_SETTINGS',
      settings ? 'Found data scheduling settings' : 'No data scheduling settings found',
      { 
        userId, 
        debugProcessId,
        hasSettings: !!settings,
        apiUrl: settings?.apiUrl ? `${settings.apiUrl.substring(0, 30)}...` : null,
        hasApiToken: !!settings?.apiToken,
        dailyRunTime: settings?.dailyRunTime,
        timeZone: settings?.timeZone,
        limit: settings?.limit,
        runTechnicalAnalysis: settings?.runTechnicalAnalysis
      },
      userId
    );
    
    // Check for user's cryptos
    const userCryptos = await prisma.crypto.findMany({
      where: { userId },
      select: { symbol: true }
    });
    
    await logCronDebug(
      'ENHANCED_FETCH_CRYPTOS',
      `Found ${userCryptos.length} cryptocurrencies for user ${userId}`,
      { 
        userId, 
        debugProcessId,
        count: userCryptos.length,
        symbols: userCryptos.map(c => c.symbol)
      },
      userId
    );
    
    // Call the original function
    const result = await originalFetchAndStore(userId);

    // If there are partial failures, log them specifically
    if (
      result &&
      typeof result === 'object' &&
      Array.isArray(result.failedSymbols) &&
      result.failedSymbols.length > 0
    ) {
      await logCronDebug(
        'ENHANCED_FETCH_PARTIAL',
        `Fetch and store completed with partial failures: ${result.message}`,
        {
          userId,
          debugProcessId,
          success: false,
          message: result.message,
          failedSymbols: result.failedSymbols,
          failedDetails: result.failedDetails,
          error: result.error,
          processId: result.processId
        },
        userId
      );
    }

    // Log the result (success, error, or partial)
    await logCronDebug(
      result.success
        ? 'ENHANCED_FETCH_SUCCESS'
        : (Array.isArray(result.failedSymbols) && result.failedSymbols.length > 0)
          ? 'ENHANCED_FETCH_PARTIAL'
          : 'ENHANCED_FETCH_ERROR',
      `Fetch and store ${result.success ? 'completed successfully' : (Array.isArray(result.failedSymbols) && result.failedSymbols.length > 0) ? 'partially failed' : 'failed'}: ${result.message}`,
      {
        userId,
        debugProcessId,
        success: result.success,
        message: result.message,
        error: result.error,
        failedSymbols: result.failedSymbols,
        failedDetails: result.failedDetails,
        processId: result.processId
      },
      userId
    );
    
    // Check for data in HourlyCryptoHistoricalData
    const recentData = await prisma.hourlyCryptoHistoricalData.findMany({
      orderBy: { id: 'desc' },
      take: 5
    });
    
    await logCronDebug(
      'ENHANCED_FETCH_DATA_CHECK',
      `Found ${recentData.length} recent historical data entries`,
      {
        userId,
        debugProcessId,
        count: recentData.length,
        hasData: recentData.length > 0,
        samples: recentData.map(d => ({
          id: d.id,
          instrument: d.instrument,
          timestamp: d.timestamp.toString()
        }))
      },
      userId
    );
    
    // Check for data in TechnicalAnalysisOutput
    const recentAnalysis = await prisma.technicalAnalysisOutput.findMany({
      orderBy: { id: 'desc' },
      take: 5
    });
    
    await logCronDebug(
      'ENHANCED_FETCH_ANALYSIS_CHECK',
      `Found ${recentAnalysis.length} recent technical analysis entries`,
      {
        userId,
        debugProcessId,
        count: recentAnalysis.length,
        hasData: recentAnalysis.length > 0,
        samples: recentAnalysis.map(a => ({
          id: a.id,
          symbol: a.symbol,
          timestamp: a.timestamp
        }))
      },
      userId
    );
    
    return result;
  } catch (error) {
    // Log any errors
    await logCronDebug(
      'ENHANCED_FETCH_UNEXPECTED_ERROR',
      `Unexpected error in enhanced fetch and store: ${error instanceof Error ? error.message : String(error)}`,
      {
        userId,
        debugProcessId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      userId
    );
    
    throw error;
  }
}