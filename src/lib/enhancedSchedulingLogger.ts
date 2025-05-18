import prisma from '@/lib/prisma';
import { schedulingLogger } from '@/lib/schedulingLogger';

/**
 * Enhanced safe logging function that won't block the flow
 * and also updates the ProcessingStatus table with operation details
 */
export async function enhancedLog(params: any): Promise<void> {
  try {
    // First log to the SchedulingProcessLog table using the existing logger
    await schedulingLogger.log(params);
    
    // Then update the ProcessingStatus table with the current operation and message
    // This helps track progress in the UI
    if (params.processId && params.operation) {
      try {
        await prisma.processingStatus.update({
          where: { processId: params.processId },
          data: {
            message: params.message,
            details: {
              update: {
                lastOperation: params.operation,
                lastMessage: params.message,
                lastTimestamp: new Date().toISOString(),
                ...(params.symbol ? { lastSymbol: params.symbol } : {}),
                ...(params.details ? { lastDetails: params.details } : {})
              }
            },
            updatedAt: new Date()
          }
        });
      } catch (updateError) {
        console.error('Failed to update ProcessingStatus with operation details:', updateError);
      }
    }
  } catch (e) {
    console.error('Log operation failed:', e);
  }
}

/**
 * Updates the ProcessingStatus table with technical analysis calculation results
 */
export async function logCalculationResult(
  processId: string,
  userId: string,
  symbol: string,
  calculationType: string,
  result: any
): Promise<void> {
  try {
    await prisma.processingStatus.update({
      where: { processId },
      data: {
        details: {
          update: {
            [`${symbol}_calculations`]: {
              ...(await getExistingCalculations(processId, symbol)),
              [calculationType]: {
                result,
                timestamp: new Date().toISOString()
              }
            },
            lastOperation: 'CALCULATION_COMPLETED',
            lastSymbol: symbol,
            lastCalculation: calculationType,
            lastTimestamp: new Date().toISOString()
          }
        },
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error(`Failed to log calculation result for ${symbol} ${calculationType}:`, error);
  }
}

/**
 * Helper function to get existing calculations for a symbol
 */
async function getExistingCalculations(processId: string, symbol: string): Promise<any> {
  try {
    const status = await prisma.processingStatus.findUnique({
      where: { processId }
    });
    
    if (status?.details && typeof status.details === 'object') {
      const details = status.details as any;
      return details[`${symbol}_calculations`] || {};
    }
    
    return {};
  } catch (error) {
    console.error(`Failed to get existing calculations for ${symbol}:`, error);
    return {};
  }
}

/**
 * Updates the ProcessingStatus table with step completion
 */
export async function logStepCompletion(
  processId: string,
  userId: string,
  symbol: string,
  step: string,
  processedItems: number,
  totalItems: number
): Promise<void> {
  try {
    const percentComplete = Math.round((processedItems / totalItems) * 100);
    
    await prisma.processingStatus.update({
      where: { processId },
      data: {
        processedItems,
        message: `Completed ${step} for ${symbol} (${processedItems}/${totalItems}, ${percentComplete}%)`,
        details: {
          update: {
            [`${symbol}_${step}`]: {
              completed: true,
              timestamp: new Date().toISOString()
            },
            currentProgress: {
              processedItems,
              totalItems,
              percentComplete
            },
            lastOperation: `${step.toUpperCase()}_COMPLETED`,
            lastSymbol: symbol,
            lastMessage: `Completed ${step} for ${symbol}`,
            lastTimestamp: new Date().toISOString()
          }
        },
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error(`Failed to log step completion for ${symbol} ${step}:`, error);
  }
}

/**
 * Updates the ProcessingStatus table with process completion
 */
export async function logProcessCompletion(
  processId: string,
  userId: string,
  successCount: number,
  errorCount: number,
  processedItems: number
): Promise<void> {
  try {
    const startTime = new Date(parseInt(processId.split('-')[1]));
    const duration = Math.round((new Date().getTime() - startTime.getTime()) / 1000);
    
    await prisma.processingStatus.update({
      where: { processId },
      data: {
        status: 'COMPLETED',
        processedItems,
        completedAt: new Date(),
        message: `Analysis process completed with ${successCount} successful and ${errorCount} failed cryptocurrencies`,
        details: {
          update: {
            finalStatus: {
              successCount,
              errorCount,
              totalProcessed: successCount + errorCount,
              completionTime: new Date().toISOString(),
              duration: `${duration} seconds`
            },
            lastOperation: 'ANALYSIS_COMPLETE',
            lastMessage: `Analysis process completed with ${successCount} successful and ${errorCount} failed cryptocurrencies`,
            lastTimestamp: new Date().toISOString()
          }
        }
      }
    });
  } catch (error) {
    console.error('Failed to log process completion:', error);
  }
}

/**
 * Updates the ProcessingStatus table with process failure
 */
export async function logProcessFailure(
  processId: string,
  userId: string,
  error: any
): Promise<void> {
  try {
    await prisma.processingStatus.update({
      where: { processId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        message: `Analysis process failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {
          update: {
            errorDetails: {
              message: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
              timestamp: new Date().toISOString()
            },
            lastOperation: 'ANALYSIS_FAILED',
            lastMessage: `Analysis process failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            lastTimestamp: new Date().toISOString()
          }
        }
      }
    });
  } catch (updateError) {
    console.error('Failed to log process failure:', updateError);
  }
}