import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { generateProcessId } from '@/lib/uuidGenerator';
import { logCronEvent } from '@/lib/cronLogger';

/**
 * Test endpoint to verify logging is working correctly
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const testId = generateProcessId('test-logging');
  const startTime = new Date();
  
  try {
    console.log(`[TEST-LOGGING] ${testId} - Starting logging test at ${startTime.toISOString()}`);
    
    // Test 1: Direct database write to ProcessingStatus
    console.log(`[TEST-LOGGING] ${testId} - Test 1: Creating ProcessingStatus record`);
    await prisma.processingStatus.create({
      data: {
        processId: testId,
        userId: 'system',
        status: 'RUNNING',
        type: 'TEST_LOGGING',
        totalItems: 1,
        processedItems: 0,
        startedAt: startTime,
        details: {
          testType: 'direct-logging-test',
          timestamp: startTime.toISOString(),
        },
      },
    });
    console.log(`[TEST-LOGGING] ${testId} - Test 1: ProcessingStatus record created successfully`);
    
    // Test 2: Direct database write to SchedulingProcessLog
    console.log(`[TEST-LOGGING] ${testId} - Test 2: Creating SchedulingProcessLog record`);
    await prisma.schedulingProcessLog.create({
      data: {
        processId: testId,
        userId: 'system',
        level: 'INFO',
        category: 'TEST_DEBUG',
        operation: 'TEST_LOGGING_DIRECT',
        message: 'Direct logging test - this should appear in the database',
        details: { 
          testId, 
          timestamp: startTime.toISOString(),
          testStep: 'direct-database-write'
        },
        timestamp: startTime
      }
    });
    console.log(`[TEST-LOGGING] ${testId} - Test 2: SchedulingProcessLog record created successfully`);
    
    // Test 3: Using cronLogger
    console.log(`[TEST-LOGGING] ${testId} - Test 3: Using cronLogger.logCronEvent`);
    await logCronEvent(
      'INFO',
      'TEST_LOGGING_CRON',
      'Cron logger test - this should appear in the database',
      { 
        testId, 
        timestamp: new Date().toISOString(),
        testStep: 'cron-logger-function'
      },
      'system',
      testId
    );
    console.log(`[TEST-LOGGING] ${testId} - Test 3: cronLogger.logCronEvent completed`);
    
    // Test 4: Query recent logs to verify they were written
    console.log(`[TEST-LOGGING] ${testId} - Test 4: Querying recent logs`);
    const recentLogs = await prisma.schedulingProcessLog.findMany({
      where: {
        processId: testId
      },
      orderBy: {
        timestamp: 'desc'
      }
    });
    console.log(`[TEST-LOGGING] ${testId} - Test 4: Found ${recentLogs.length} logs for this test`);
    
    // Test 5: Query ProcessingStatus to verify it was written
    console.log(`[TEST-LOGGING] ${testId} - Test 5: Querying ProcessingStatus`);
    const processingStatus = await prisma.processingStatus.findUnique({
      where: {
        processId: testId
      }
    });
    console.log(`[TEST-LOGGING] ${testId} - Test 5: ProcessingStatus found:`, !!processingStatus);
    
    // Test 6: Query all recent logs to see what's in the database
    console.log(`[TEST-LOGGING] ${testId} - Test 6: Querying all recent logs`);
    const allRecentLogs = await prisma.schedulingProcessLog.findMany({
      where: {
        timestamp: {
          gte: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 20
    });
    console.log(`[TEST-LOGGING] ${testId} - Test 6: Found ${allRecentLogs.length} recent logs in database`);
    
    // Update ProcessingStatus to completed
    await prisma.processingStatus.update({
      where: { processId: testId },
      data: {
        status: 'COMPLETED',
        processedItems: 1,
        completedAt: new Date(),
        details: {
          testType: 'direct-logging-test',
          timestamp: startTime.toISOString(),
          completedAt: new Date().toISOString(),
          testsCompleted: 6
        }
      }
    });
    
    console.log(`[TEST-LOGGING] ${testId} - All tests completed successfully`);
    
    return res.status(200).json({
      testId,
      success: true,
      message: 'Logging test completed successfully',
      results: {
        processingStatusCreated: !!processingStatus,
        logsCreatedForThisTest: recentLogs.length,
        totalRecentLogs: allRecentLogs.length,
        testLogs: recentLogs.map(log => ({
          timestamp: log.timestamp,
          level: log.level,
          operation: log.operation,
          message: log.message,
          category: log.category
        })),
        recentLogsPreview: allRecentLogs.slice(0, 5).map(log => ({
          processId: log.processId,
          timestamp: log.timestamp,
          level: log.level,
          operation: log.operation,
          message: log.message,
          category: log.category
        }))
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[TEST-LOGGING] ${testId} - Error during logging test:`, error);
    
    return res.status(500).json({
      testId,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}