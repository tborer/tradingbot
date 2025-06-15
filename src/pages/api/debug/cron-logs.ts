import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

/**
 * Debug endpoint to check recent cron logs and processing status
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Get recent SchedulingProcessLog entries
    const recentLogs = await prisma.schedulingProcessLog.findMany({
      where: {
        timestamp: {
          gte: twoDaysAgo
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 50
    });

    // Get recent ProcessingStatus entries
    const recentStatus = await prisma.processingStatus.findMany({
      where: {
        startedAt: {
          gte: twoDaysAgo
        }
      },
      orderBy: {
        startedAt: 'desc'
      },
      take: 20
    });

    // Get data scheduling settings
    const schedulingSettings = await prisma.dataScheduling.findMany({
      select: {
        userId: true,
        dailyRunTime: true,
        timeZone: true,
        cleanupEnabled: true,
        runTechnicalAnalysis: true,
        apiUrl: true,
        apiToken: true
      }
    });

    // Get user crypto portfolios
    const userCryptos = await prisma.crypto.groupBy({
      by: ['userId'],
      _count: {
        symbol: true
      }
    });

    // Check for cron-related logs specifically
    const cronLogs = recentLogs.filter(log => 
      log.category === 'CRON_DEBUG' || 
      log.operation?.includes('CRON') ||
      log.processId?.includes('cron')
    );

    // Check for recent data fetching activity
    const dataFetchLogs = recentLogs.filter(log =>
      log.operation?.includes('FETCH') ||
      log.operation?.includes('DATA_SCHEDULING')
    );

    return res.status(200).json({
      timestamp: now.toISOString(),
      summary: {
        totalRecentLogs: recentLogs.length,
        cronSpecificLogs: cronLogs.length,
        dataFetchLogs: dataFetchLogs.length,
        recentProcessingStatus: recentStatus.length,
        usersWithScheduling: schedulingSettings.length,
        usersWithCryptos: userCryptos.length
      },
      schedulingSettings: schedulingSettings.map(s => ({
        userId: s.userId,
        dailyRunTime: s.dailyRunTime,
        timeZone: s.timeZone,
        cleanupEnabled: s.cleanupEnabled,
        runTechnicalAnalysis: s.runTechnicalAnalysis,
        hasApiCredentials: !!(s.apiUrl && s.apiToken)
      })),
      userCryptos,
      recentCronLogs: cronLogs.slice(0, 10),
      recentDataFetchLogs: dataFetchLogs.slice(0, 10),
      recentProcessingStatus: recentStatus.slice(0, 10),
      allRecentLogs: recentLogs.slice(0, 20)
    });
  } catch (error) {
    console.error('Error fetching cron debug logs:', error);
    return res.status(500).json({
      error: 'Failed to fetch debug logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}