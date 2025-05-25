import prisma from '@/lib/prisma';
import { logCronEvent, logCronError } from '@/lib/cronLogger';

/**
 * Enhanced debugging function for cron jobs
 * This will log detailed information about the cron job execution
 * and save it to the database for later analysis
 */
export async function logCronDebug(
  operation: string,
  message: string,
  details?: any,
  userId: string = 'system'
): Promise<void> {
  // Generate a consistent processId for cron debug events
  const timestamp = Date.now();
  const processId = `cron-debug-${timestamp}`;
  
  console.log(`[CRON_DEBUG][${operation}] ${message}`, details || '');
  
  try {
    // Create a new SchedulingProcessLog entry
    await prisma.schedulingProcessLog.create({
      data: {
        processId,
        userId,
        level: 'DEBUG',
        category: 'CRON_DEBUG',
        operation,
        message,
        details: details ? details : undefined,
        timestamp: new Date(timestamp)
      }
    });
  } catch (loggingError) {
    // If logging to the database fails, at least log to the console
    console.error('Failed to log cron debug event to database:', loggingError);
    console.error('Original event:', { operation, message, details });
  }
}

/**
 * Checks if there are any users with data scheduling settings
 * and logs detailed information about them
 */
export async function debugDataSchedulingSettings(): Promise<void> {
  try {
    // Get all users with data scheduling configured
    const schedulingSettings = await prisma.dataScheduling.findMany();
    
    await logCronDebug(
      'DATA_SCHEDULING_SETTINGS',
      `Found ${schedulingSettings.length} users with data scheduling configured`,
      { 
        count: schedulingSettings.length,
        settings: schedulingSettings.map(s => ({
          userId: s.userId,
          hasApiUrl: !!s.apiUrl,
          hasApiToken: !!s.apiToken,
          dailyRunTime: s.dailyRunTime,
          timeZone: s.timeZone,
          runTechnicalAnalysis: s.runTechnicalAnalysis,
          cleanupEnabled: s.cleanupEnabled
        }))
      }
    );
    
    // Check each user's crypto portfolio
    for (const settings of schedulingSettings) {
      const userCryptos = await prisma.crypto.findMany({
        where: { userId: settings.userId },
        select: { symbol: true }
      });
      
      await logCronDebug(
        'USER_CRYPTO_PORTFOLIO',
        `User ${settings.userId} has ${userCryptos.length} cryptocurrencies in portfolio`,
        {
          userId: settings.userId,
          count: userCryptos.length,
          symbols: userCryptos.map(c => c.symbol)
        }
      );
    }
  } catch (error) {
    console.error('Error in debugDataSchedulingSettings:', error);
    await logCronError(
      'DEBUG_SETTINGS',
      'Error debugging data scheduling settings',
      error
    );
  }
}

/**
 * Checks the database for recent cron job runs and their status
 */
export async function debugRecentCronRuns(): Promise<void> {
  try {
    // Get recent processing statuses
    const recentRuns = await prisma.processingStatus.findMany({
      where: {
        type: 'DATA_SCHEDULING',
        startedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: {
        startedAt: 'desc'
      },
      take: 10
    });
    
    await logCronDebug(
      'RECENT_CRON_RUNS',
      `Found ${recentRuns.length} recent cron job runs`,
      {
        count: recentRuns.length,
        runs: recentRuns.map(r => ({
          processId: r.processId,
          userId: r.userId,
          status: r.status,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          error: r.error
        }))
      }
    );
    
    // Check for recent data in HourlyCryptoHistoricalData
    const recentData = await prisma.hourlyCryptoHistoricalData.findMany({
      orderBy: {
        id: 'desc'
      },
      take: 5
    });
    
    await logCronDebug(
      'RECENT_HISTORICAL_DATA',
      `Found ${recentData.length} recent historical data entries`,
      {
        count: recentData.length,
        hasData: recentData.length > 0,
        samples: recentData.map(d => ({
          id: d.id,
          instrument: d.instrument,
          timestamp: d.timestamp.toString()
        }))
      }
    );
    
    // Check for recent data in TechnicalAnalysisOutput
    const recentAnalysis = await prisma.technicalAnalysisOutput.findMany({
      orderBy: {
        id: 'desc'
      },
      take: 5
    });
    
    await logCronDebug(
      'RECENT_TECHNICAL_ANALYSIS',
      `Found ${recentAnalysis.length} recent technical analysis entries`,
      {
        count: recentAnalysis.length,
        hasData: recentAnalysis.length > 0,
        samples: recentAnalysis.map(a => ({
          id: a.id,
          symbol: a.symbol,
          timestamp: a.timestamp
        }))
      }
    );
  } catch (error) {
    console.error('Error in debugRecentCronRuns:', error);
    await logCronError(
      'DEBUG_RECENT_RUNS',
      'Error debugging recent cron runs',
      error
    );
  }
}

/**
 * Checks the database for recent logs related to cron jobs
 */
export async function debugRecentLogs(): Promise<void> {
  try {
    // Get recent logs
    const recentLogs = await prisma.schedulingProcessLog.findMany({
      where: {
        category: 'SCHEDULING',
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 20
    });
    
    await logCronDebug(
      'RECENT_LOGS',
      `Found ${recentLogs.length} recent scheduling logs`,
      {
        count: recentLogs.length,
        logs: recentLogs.map(l => ({
          processId: l.processId,
          userId: l.userId,
          level: l.level,
          operation: l.operation,
          message: l.message,
          timestamp: l.timestamp
        }))
      }
    );
    
    // Check for error logs specifically
    const errorLogs = await prisma.schedulingProcessLog.findMany({
      where: {
        level: 'ERROR',
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 10
    });
    
    await logCronDebug(
      'ERROR_LOGS',
      `Found ${errorLogs.length} recent error logs`,
      {
        count: errorLogs.length,
        logs: errorLogs.map(l => ({
          processId: l.processId,
          userId: l.userId,
          operation: l.operation,
          message: l.message,
          timestamp: l.timestamp
        }))
      }
    );
  } catch (error) {
    console.error('Error in debugRecentLogs:', error);
    await logCronError(
      'DEBUG_LOGS',
      'Error debugging recent logs',
      error
    );
  }
}

/**
 * Run all debug functions to gather comprehensive information
 */
export async function runComprehensiveDebug(): Promise<void> {
  try {
    await logCronDebug(
      'COMPREHENSIVE_DEBUG_START',
      'Starting comprehensive debug of cron job system'
    );
    
    await debugDataSchedulingSettings();
    await debugRecentCronRuns();
    await debugRecentLogs();
    
    await logCronDebug(
      'COMPREHENSIVE_DEBUG_COMPLETE',
      'Completed comprehensive debug of cron job system'
    );
  } catch (error) {
    console.error('Error in runComprehensiveDebug:', error);
    await logCronError(
      'COMPREHENSIVE_DEBUG',
      'Error running comprehensive debug',
      error
    );
  }
}