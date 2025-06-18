import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { generateProcessId } from '@/lib/uuidGenerator';

/**
 * Simple test to verify database logging is working
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const testId = generateProcessId('simple-test');
  const timestamp = new Date();
  
  console.log(`[SIMPLE-LOG-TEST] Starting test with ID: ${testId}`);
  
  try {
    // Step 1: Create ProcessingStatus
    console.log(`[SIMPLE-LOG-TEST] Step 1: Creating ProcessingStatus`);
    await prisma.processingStatus.create({
      data: {
        processId: testId,
        userId: 'system',
        status: 'RUNNING',
        type: 'SIMPLE_TEST',
        totalItems: 1,
        processedItems: 0,
        startedAt: timestamp,
        details: {
          testType: 'simple-database-logging-test',
          prefix: 'simple-test',
          timestamp: timestamp.toISOString(),
        },
      },
    });
    console.log(`[SIMPLE-LOG-TEST] Step 1: ProcessingStatus created successfully`);
    
    // Step 2: Create SchedulingProcessLog
    console.log(`[SIMPLE-LOG-TEST] Step 2: Creating SchedulingProcessLog`);
    await prisma.schedulingProcessLog.create({
      data: {
        processId: testId,
        userId: 'system',
        level: 'INFO',
        category: 'SIMPLE_TEST',
        operation: 'SIMPLE_LOG_TEST',
        message: 'This is a simple test log entry that should appear in the database',
        details: { 
          testId,
          timestamp: timestamp.toISOString(),
          message: 'If you can see this in the database, logging is working'
        },
        timestamp: timestamp
      }
    });
    console.log(`[SIMPLE-LOG-TEST] Step 2: SchedulingProcessLog created successfully`);
    
    // Step 3: Update ProcessingStatus to completed
    console.log(`[SIMPLE-LOG-TEST] Step 3: Updating ProcessingStatus to completed`);
    await prisma.processingStatus.update({
      where: { processId: testId },
      data: {
        status: 'COMPLETED',
        processedItems: 1,
        completedAt: new Date(),
      }
    });
    console.log(`[SIMPLE-LOG-TEST] Step 3: ProcessingStatus updated successfully`);
    
    // Step 4: Query back to verify
    console.log(`[SIMPLE-LOG-TEST] Step 4: Querying back to verify records exist`);
    const statusRecord = await prisma.processingStatus.findUnique({
      where: { processId: testId }
    });
    const logRecords = await prisma.schedulingProcessLog.findMany({
      where: { processId: testId }
    });
    
    console.log(`[SIMPLE-LOG-TEST] Step 4: Found status record: ${!!statusRecord}`);
    console.log(`[SIMPLE-LOG-TEST] Step 4: Found ${logRecords.length} log records`);
    
    return res.status(200).json({
      success: true,
      testId,
      message: 'Simple logging test completed successfully',
      results: {
        statusRecordExists: !!statusRecord,
        logRecordsCount: logRecords.length,
        statusRecord: statusRecord ? {
          processId: statusRecord.processId,
          status: statusRecord.status,
          type: statusRecord.type,
          startedAt: statusRecord.startedAt,
          completedAt: statusRecord.completedAt
        } : null,
        logRecords: logRecords.map(log => ({
          level: log.level,
          category: log.category,
          operation: log.operation,
          message: log.message,
          timestamp: log.timestamp
        }))
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`[SIMPLE-LOG-TEST] Error:`, error);
    
    return res.status(500).json({
      success: false,
      testId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}