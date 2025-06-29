import prisma from '@/lib/prisma';
import { schedulingLogger } from '@/lib/schedulingLogger';

/**
 * Enhanced safe logging function that won't block the flow
 * and also updates the ProcessingStatus table with operation details
 */
export async function enhancedLog(params: any): Promise<void> {
  try {
    // First ensure ProcessingStatus exists and is updated with operation details
    if (params.processId && params.operation) {
      try {
        // Use upsert to handle cases where the record doesn't exist
        await prisma.processingStatus.upsert({
          where: { processId: params.processId },
          update: {
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
          },
          create: {
            processId: params.processId,
            userId: params.userId,
            status: 'RUNNING',
            type: params.category === 'SCHEDULING' ? 'DATA_SCHEDULING' : 'CRON',
            totalItems: 1,
            processedItems: 0,
            startedAt: new Date(),
            details: {
              lastOperation: params.operation,
              lastMessage: params.message,
              lastTimestamp: new Date().toISOString(),
              ...(params.symbol ? { lastSymbol: params.symbol } : {}),
              ...(params.details ? { lastDetails: params.details } : {}),
              createdByEnhancedLogger: true
            }
          }
        });
      } catch (updateError) {
        console.error('Failed to update ProcessingStatus with operation details:', updateError);
      }
    }

    // Now log to the SchedulingProcessLog table using the existing logger
    await schedulingLogger.log(params);
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
    // Use upsert instead of update to handle cases where the record doesn't exist
    await prisma.processingStatus.upsert({
      where: { processId },
      update: {
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
      },
      create: {
        processId,
        userId,
        status: 'RUNNING',
        type: 'DATA_SCHEDULING',
        totalItems: 1,
        processedItems: 0,
        startedAt: new Date(),
        details: {
          [`${symbol}_calculations`]: {
            [calculationType]: {
              result,
              timestamp: new Date().toISOString()
            }
          },
          lastOperation: 'CALCULATION_COMPLETED',
          lastSymbol: symbol,
          lastCalculation: calculationType,
          lastTimestamp: new Date().toISOString(),
          createdByCalculationLogger: true
        }
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

    await prisma.processingStatus.upsert({
      where: { processId },
      update: {
        processedItems,
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
      },
      create: {
        processId,
        userId,
        status: 'RUNNING',
        type: 'DATA_SCHEDULING',
        totalItems,
        processedItems,
        startedAt: new Date(),
        details: {
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
          lastTimestamp: new Date().toISOString(),
          createdByStepLogger: true
        }
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

    await prisma.processingStatus.upsert({
      where: { processId },
      update: {
        status: 'COMPLETED',
        processedItems,
        completedAt: new Date(),
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
      },
      create: {
        processId,
        userId,
        status: 'COMPLETED',
        type: 'DATA_SCHEDULING',
        totalItems: successCount + errorCount,
        processedItems,
        startedAt: new Date(),
        completedAt: new Date(),
        details: {
          finalStatus: {
            successCount,
            errorCount,
            totalProcessed: successCount + errorCount,
            completionTime: new Date().toISOString(),
            duration: `${duration} seconds`
          },
          lastOperation: 'ANALYSIS_COMPLETE',
          lastMessage: `Analysis process completed with ${successCount} successful and ${errorCount} failed cryptocurrencies`,
          lastTimestamp: new Date().toISOString(),
          createdByCompletionLogger: true
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
    await prisma.processingStatus.upsert({
      where: { processId },
      update: {
        status: 'FAILED',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
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
      },
      create: {
        processId,
        userId,
        status: 'FAILED',
        type: 'DATA_SCHEDULING',
        totalItems: 0,
        processedItems: 0,
        startedAt: new Date(),
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          errorDetails: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
          },
          lastOperation: 'ANALYSIS_FAILED',
          lastMessage: `Analysis process failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          lastTimestamp: new Date().toISOString(),
          createdByFailureLogger: true
        }
      }
    });
  } catch (updateError) {
    console.error('Failed to log process failure:', updateError);
  }
}