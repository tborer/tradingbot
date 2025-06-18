import prisma from '@/lib/prisma';
import { generateCronProcessId, generateUUID } from '@/lib/uuidGenerator';

/**
 * Specialized logger for cron-related events that ensures logs are written to the SchedulingProcessLog table
 * even when there's no existing ProcessingStatus record
 */
export async function logCronEvent(
  level: 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG',
  operation: string,
  message: string,
  details?: any,
  userId: string = 'system',
  processId?: string
): Promise<string> {
  const timestamp = new Date();
  // Use provided processId or generate a new UUID-based one
  const finalProcessId = processId || generateCronProcessId(userId);

  console.log(`[CRON][${level}][${operation}] ${message}`, details || '');

  try {
    // First, ensure the ProcessingStatus record exists using an atomic upsert.
    // This prevents foreign key violations when creating the log entry.
    await prisma.processingStatus.upsert({
      where: { processId: finalProcessId },
      update: {}, // Don't update if it already exists at this stage
      create: {
        processId: finalProcessId,
        userId,
        status: 'RUNNING',
        type: 'CRON',
        totalItems: 1,
        processedItems: 0,
        startedAt: timestamp,
        details: {
          cronOperation: operation,
          initialMessage: message,
          timestamp: timestamp.toISOString(),
        },
      },
    });

    // Now that the parent record is guaranteed to exist, create the log entry.
    await prisma.schedulingProcessLog.create({
      data: {
        processId: finalProcessId,
        userId,
        level,
        category: 'CRON_DEBUG',
        operation,
        message,
        details: details ? details : undefined,
        timestamp,
      },
    });

    // If this is a terminal event (error, completion), update the ProcessingStatus.
    if (level === 'ERROR' || operation.includes('COMPLETE') || operation.includes('FAILED')) {
      const finalStatus = level === 'ERROR' || operation.includes('FAILED') ? 'FAILED' : 'COMPLETED';
      await prisma.processingStatus.update({
        where: { processId: finalProcessId },
        data: {
          status: finalStatus,
          completedAt: new Date(),
          details: {
            ...(details || {}),
            finalStatus,
            finalMessage: message,
            finalTimestamp: new Date().toISOString(),
          },
        },
      });
    }

    return finalProcessId;
  } catch (loggingError) {
    // If logging to the database fails, at least log to the console
    console.error('Failed to log cron event to database:', loggingError);
    console.error('Original event:', { level, operation, message, details });
    return finalProcessId;
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