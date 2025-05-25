import prisma from '@/lib/prisma';
import { schedulingLogger } from '@/lib/schedulingLogger';

/**
 * Specialized logger for cron-related events that ensures logs are written to the SchedulingProcessLog table
 * even when there's no existing ProcessingStatus record
 */
export async function logCronEvent(
  level: 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG',
  operation: string,
  message: string,
  details?: any,
  userId: string = 'system'
): Promise<void> {
  // Generate a consistent processId for cron events
  const timestamp = Date.now();
  const processId = `cron-${timestamp}`;
  
  console.log(`[CRON][${level}][${operation}] ${message}`, details || '');
  
  try {
    // First, ensure there's a ProcessingStatus record for this cron event
    // This is important because schedulingLogger.log requires a valid processId
    const existingStatus = await prisma.processingStatus.findUnique({
      where: { processId }
    });
    
    if (!existingStatus) {
      // Create a new ProcessingStatus record if one doesn't exist
      await prisma.processingStatus.create({
        data: {
          processId,
          userId,
          status: 'RUNNING',
          type: 'CRON',
          totalItems: 1,
          processedItems: 0,
          startedAt: new Date(timestamp),
          details: {
            cronOperation: operation,
            initialMessage: message,
            timestamp: new Date(timestamp).toISOString()
          }
        }
      });
    }
    
    // Now log the event to the SchedulingProcessLog table
    await prisma.schedulingProcessLog.create({
      data: {
        processId,
        userId,
        level,
        category: 'SCHEDULING',
        operation,
        message,
        details: details ? details : undefined,
        timestamp: new Date(timestamp)
      }
    });
    
    // If this is an error or the operation is complete, update the ProcessingStatus
    if (level === 'ERROR' || operation.includes('COMPLETE') || operation.includes('FAILED')) {
      await prisma.processingStatus.update({
        where: { processId },
        data: {
          status: level === 'ERROR' || operation.includes('FAILED') ? 'FAILED' : 'COMPLETED',
          completedAt: new Date(),
          error: level === 'ERROR' ? message : undefined,
          details: {
            update: {
              finalMessage: message,
              finalTimestamp: new Date().toISOString(),
              ...(details ? { finalDetails: details } : {})
            }
          }
        }
      });
    }
  } catch (loggingError) {
    // If logging to the database fails, at least log to the console
    console.error('Failed to log cron event to database:', loggingError);
    console.error('Original event:', { level, operation, message, details });
  }
}

/**
 * Creates a timer that logs the duration of a cron operation
 */
export function createCronTimer(
  operation: string,
  message: string,
  details?: any,
  userId: string = 'system'
): { end: (additionalDetails?: any) => Promise<void> } {
  const startTime = Date.now();
  
  // Log the start of the operation
  logCronEvent('INFO', operation, `${message} - Started`, details, userId);
  
  return {
    end: async (additionalDetails?: any) => {
      const duration = Date.now() - startTime;
      const combinedDetails = additionalDetails 
        ? { ...details, ...additionalDetails, durationMs: duration }
        : { ...details, durationMs: duration };
      
      // Log the end of the operation
      await logCronEvent(
        'INFO',
        `${operation}_COMPLETE`,
        `${message} - Completed in ${duration}ms`,
        combinedDetails,
        userId
      );
    }
  };
}

/**
 * Logs an error that occurred during a cron operation
 */
export async function logCronError(
  operation: string,
  message: string,
  error: any,
  details?: any,
  userId: string = 'system'
): Promise<void> {
  const errorDetails = {
    ...details,
    error: error instanceof Error 
      ? { message: error.message, stack: error.stack } 
      : { message: String(error) }
  };
  
  await logCronEvent(
    'ERROR',
    `${operation}_FAILED`,
    message,
    errorDetails,
    userId
  );
}