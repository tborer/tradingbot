import prisma from '@/lib/prisma';

export type LogLevel = 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG';
export type LogCategory = 'SCHEDULING' | 'API_CALL' | 'DATA_PROCESSING' | 'ANALYSIS';

/**
 * Scheduling logger object for consistent logging interface
 */
export const schedulingLogger = {
  log: async (params: LogEntryParams): Promise<void> => {
    await logSchedulingProcess(params);
  }
};

interface LogEntryParams {
  processId: string;
  userId: string;
  level: LogLevel;
  category: LogCategory;
  operation: string;
  symbol?: string;
  message: string;
  details?: any;
  duration?: number;
}

/**
 * Creates a log entry for the scheduling process
 */
export async function logSchedulingProcess({
  processId,
  userId,
  level,
  category,
  operation,
  symbol,
  message,
  details,
  duration
}: LogEntryParams): Promise<void> {
  try {
    // Ensure ProcessingStatus exists before creating the log entry
    const existingProcess = await prisma.processingStatus.findUnique({
      where: { processId }
    });

    if (!existingProcess) {
      // Create a minimal ProcessingStatus record to link logs
      try {
        await prisma.processingStatus.create({
          data: {
            processId,
            userId,
            status: 'RUNNING',
            type: category === 'SCHEDULING' ? 'DATA_SCHEDULING' : 'CRON',
            totalItems: 1,
            processedItems: 0,
            startedAt: new Date(),
            details: {
              initialOperation: operation,
              initialMessage: message,
              createdForLogging: true
            }
          }
        });
      } catch (processError) {
        // If we can't create the ProcessingStatus, log and continue
        console.warn(`Could not create ProcessingStatus for ${processId}:`, processError);
      }
    }

    // Now create the log entry
    await prisma.schedulingProcessLog.create({
      data: {
        processId,
        userId,
        level,
        category,
        operation,
        symbol,
        message,
        details: details ? details : undefined,
        duration,
        timestamp: new Date() // Ensure timestamp is set
      }
    });

    // Log to console as well for visibility
    console.log(`[LOG][${level}][${category}][${operation}] ${message} (processId: ${processId})`);
  } catch (error) {
    // Don't let logging errors disrupt the main process
    console.error('Error creating scheduling process log:', error);
  }
}

/**
 * Creates a timer that logs the duration of an operation
 */
export function createOperationTimer(
  params: Omit<LogEntryParams, 'duration'>
): { end: (additionalDetails?: any) => Promise<void> } {
  const startTime = Date.now();
  
  return {
    end: async (additionalDetails?: any) => {
      const duration = Date.now() - startTime;
      const details = additionalDetails 
        ? { ...params.details, ...additionalDetails }
        : params.details;
      
      await logSchedulingProcess({
        ...params,
        duration,
        details
      });
    }
  };
}

/**
 * Helper function to log API calls with request and response details
 */
export async function logApiCall({
  processId,
  userId,
  symbol,
  url,
  method,
  headers,
  requestBody,
  responseStatus,
  responseBody,
  error
}: {
  processId: string;
  userId: string;
  symbol: string;
  url: string;
  method: string;
  headers?: any;
  requestBody?: any;
  responseStatus?: number;
  responseBody?: any;
  error?: any;
}): Promise<void> {
  const level: LogLevel = error ? 'ERROR' : responseStatus && responseStatus >= 400 ? 'WARNING' : 'INFO';
  const operation = error ? 'API_ERROR' : responseStatus ? 'API_RESPONSE' : 'API_REQUEST';
  
  // Sanitize headers to remove sensitive information
  const sanitizedHeaders = headers ? { ...headers } : {};
  if (sanitizedHeaders.Authorization) {
    sanitizedHeaders.Authorization = 'Bearer [REDACTED]';
  }
  
  await logSchedulingProcess({
    processId,
    userId,
    level,
    category: 'API_CALL',
    operation,
    symbol,
    message: error 
      ? `API call failed: ${error.message || 'Unknown error'}`
      : responseStatus 
        ? `API response: ${responseStatus}` 
        : `API request: ${method} ${url}`,
    details: {
      url,
      method,
      headers: sanitizedHeaders,
      requestBody,
      responseStatus,
      responseBody: responseBody ? (typeof responseBody === 'string' ? responseBody.substring(0, 1000) : responseBody) : undefined,
      error: error ? { message: error.message, stack: error.stack } : undefined
    }
  });
}

/**
 * Helper function to log data processing events
 */
export async function logDataProcessing({
  processId,
  userId,
  symbol,
  operation,
  count,
  error,
  details
}: {
  processId: string;
  userId: string;
  symbol: string;
  operation: string;
  count?: number;
  error?: any;
  details?: any;
}): Promise<void> {
  const level: LogLevel = error ? 'ERROR' : 'INFO';
  
  await logSchedulingProcess({
    processId,
    userId,
    level,
    category: 'DATA_PROCESSING',
    operation,
    symbol,
    message: error 
      ? `Data processing error: ${error.message || 'Unknown error'}`
      : `${operation}: ${count !== undefined ? `${count} records` : ''}`,
    details: {
      count,
      details,
      error: error ? { message: error.message, stack: error.stack } : undefined
    }
  });
}

/**
 * Helper function to log analysis events
 */
export async function logAnalysis({
  processId,
  userId,
  symbol,
  operation,
  analysisType,
  success,
  error,
  details
}: {
  processId: string;
  userId: string;
  symbol: string;
  operation: string;
  analysisType: string;
  success?: boolean;
  error?: any;
  details?: any;
}): Promise<void> {
  const level: LogLevel = error ? 'ERROR' : success === false ? 'WARNING' : 'INFO';
  
  await logSchedulingProcess({
    processId,
    userId,
    level,
    category: 'ANALYSIS',
    operation,
    symbol,
    message: error 
      ? `Analysis error (${analysisType}): ${error.message || 'Unknown error'}`
      : `${operation} (${analysisType}): ${success === false ? 'Failed' : 'Successful'}`,
    details: {
      analysisType,
      success,
      details,
      error: error ? { message: error.message, stack: error.stack } : undefined
    }
  });
}

/**
 * Helper function to log scheduling events
 */
export async function logScheduling({
  processId,
  userId,
  operation,
  message,
  details,
  error
}: {
  processId: string;
  userId: string;
  operation: string;
  message: string;
  details?: any;
  error?: any;
}): Promise<void> {
  const level: LogLevel = error ? 'ERROR' : 'INFO';
  
  await logSchedulingProcess({
    processId,
    userId,
    level,
    category: 'SCHEDULING',
    operation,
    message,
    details: {
      details,
      error: error ? { message: error.message, stack: error.stack } : undefined
    }
  });
}