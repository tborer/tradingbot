import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { generateProcessId } from '@/lib/uuidGenerator';

/**
 * Test endpoint to manually trigger the cron job and check logs
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const testId = generateProcessId('test-cron');
  
  try {
    console.log(`[TEST-CRON] ${testId} - Starting manual cron test`);
    
    // Create ProcessingStatus record first to avoid foreign key constraint violations
    await prisma.processingStatus.create({
      data: {
        processId: testId,
        userId: 'system',
        status: 'RUNNING',
        type: 'TEST_CRON',
        totalItems: 1,
        processedItems: 0,
        startedAt: new Date(),
        details: {
          testType: 'manual-cron-test',
          timestamp: new Date().toISOString(),
        },
      },
    });
    
    // Log the test start
    await prisma.schedulingProcessLog.create({
      data: {
        processId: testId,
        userId: 'system',
        level: 'INFO',
        category: 'CRON_DEBUG',
        operation: 'TEST_CRON_START',
        message: 'Manual cron test initiated',
        details: { testId, timestamp: new Date().toISOString() },
        timestamp: new Date()
      }
    });

    // Call the cron-trigger endpoint directly
    const baseUrl = req.headers.host?.includes('localhost') 
      ? `http://${req.headers.host}` 
      : `https://${req.headers.host}`;
    
    const cronUrl = `${baseUrl}/api/data-scheduling/cron-trigger`;
    
    console.log(`[TEST-CRON] ${testId} - Calling cron endpoint: ${cronUrl}`);
    
    const response = await fetch(cronUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        'x-test-cron': 'true'
      },
      body: JSON.stringify({
        source: "manual-test",
        timestamp: new Date().toISOString(),
        force: true // Force run for testing
      })
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { rawResponse: responseText };
    }

    console.log(`[TEST-CRON] ${testId} - Response:`, responseData);

    // Log the test result
    await prisma.schedulingProcessLog.create({
      data: {
        processId: testId,
        userId: 'system',
        level: response.ok ? 'INFO' : 'ERROR',
        category: 'CRON_DEBUG',
        operation: 'TEST_CRON_RESULT',
        message: `Manual cron test completed with status ${response.status}`,
        details: { 
          testId, 
          status: response.status,
          success: response.ok,
          response: responseData,
          cronUrl
        },
        timestamp: new Date()
      }
    });

    // Get recent logs to show what happened
    const recentLogs = await prisma.schedulingProcessLog.findMany({
      where: {
        timestamp: {
          gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 20
    });

    return res.status(200).json({
      testId,
      success: response.ok,
      cronResponse: {
        status: response.status,
        data: responseData
      },
      recentLogs: recentLogs.map(log => ({
        timestamp: log.timestamp,
        level: log.level,
        operation: log.operation,
        message: log.message,
        processId: log.processId,
        details: log.details
      }))
    });

  } catch (error) {
    console.error(`[TEST-CRON] ${testId} - Error:`, error);
    
    // Log the error
    try {
      await prisma.schedulingProcessLog.create({
        data: {
          processId: testId,
          userId: 'system',
          level: 'ERROR',
          category: 'CRON_DEBUG',
          operation: 'TEST_CRON_ERROR',
          message: `Manual cron test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          details: { 
            testId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          },
          timestamp: new Date()
        }
      });
    } catch (logError) {
      console.error(`[TEST-CRON] ${testId} - Failed to log error:`, logError);
    }

    return res.status(500).json({
      testId,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}