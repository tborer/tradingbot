import prisma from '@/lib/prisma';
import { cleanupOldData, cleanupStaleProcessingStatuses } from '@/lib/dataSchedulingService';
import { logScheduling } from '@/lib/schedulingLogger';
import { runAnalysisProcess } from '@/lib/analysisUtils';
import { logCronEvent, logCronError } from '@/lib/cronLogger';
import { enhancedFetchAndStoreHourlyCryptoData } from '@/lib/enhancedFetchDebugger';
import { generateProcessId } from '@/lib/uuidGenerator';

/**
 * Checks if a user has already had a successful run today
 * @param userId - The user ID to check
 * @returns Promise with hasRun boolean and details
 */
async function hasSuccessfulRunToday(userId: string): Promise<{ hasRun: boolean; details: any }> {
    // Get start of today in UTC
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    
    const recentRun = await prisma.processingStatus.findFirst({
        where: {
            userId: userId,
            type: 'DATA_SCHEDULING',
            status: 'COMPLETED',
            createdAt: {
                gte: startOfToday
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
    
    return {
        hasRun: !!recentRun,
        details: {
            startOfToday: startOfToday.toISOString(),
            lastSuccessfulRun: recentRun?.createdAt?.toISOString() || null,
            processId: recentRun?.processId || null,
            reason: recentRun ? "Already completed today" : "No successful run today"
        }
    };
}

/**
 * Runs scheduled tasks for all users who have configured data scheduling
 */
export async function runScheduledTasks(force: boolean = false): Promise<void> {
  const cronRunId = generateProcessId('cron-run');
  
  try {
    // First, clean up any stale processing statuses
    try {
      await cleanupStaleProcessingStatuses();
      await logCronEvent(
        'INFO',
        'STALE_STATUS_CLEANUP',
        'Cleaned up stale processing statuses',
        { cronRunId }
      );
    } catch (cleanupError) {
      console.error('Error cleaning up stale processing statuses:', cleanupError);
      await logCronError(
        'STALE_STATUS_CLEANUP',
        'Error cleaning up stale processing statuses',
        cleanupError,
        { cronRunId }
      );
      // Continue with the main process despite this error
    }
    
    // Log the start of the scheduled tasks check to both logging systems
    await Promise.all([
      logScheduling({
        processId: cronRunId,
        userId: 'system',
        operation: 'SCHEDULED_TASKS_CHECK_START',
        message: 'Starting scheduled tasks check',
        details: {
          timestamp: new Date().toISOString(),
          cronRunId
        }
      }),
      logCronEvent(
        'INFO',
        'SCHEDULED_TASKS_CHECK_START',
        'Starting scheduled tasks check',
        {
          timestamp: new Date().toISOString(),
          cronRunId
        }
      )
    ]).catch(err => console.error('Error logging task start:', err));
    
    // Get all users with data scheduling configured
    const schedulingSettings = await prisma.dataScheduling.findMany({
      select: {
        userId: true,
        dailyRunTime: true,
        timeZone: true,
        cleanupEnabled: true,
        runTechnicalAnalysis: true
      }
    });
    
    const settingsDetails = {
      userCount: schedulingSettings.length,
      cronRunId
    };
    
    await Promise.all([
      logScheduling({
        processId: cronRunId,
        userId: 'system',
        operation: 'SCHEDULED_TASKS_SETTINGS_LOADED',
        message: `Found ${schedulingSettings.length} users with data scheduling configured`,
        details: settingsDetails
      }),
      logCronEvent(
        'INFO',
        'SCHEDULED_TASKS_SETTINGS_LOADED',
        `Found ${schedulingSettings.length} users with data scheduling configured`,
        settingsDetails
      )
    ]).catch(err => console.error('Error logging settings loaded:', err));
    
    // Check if there are any settings to process
    if (schedulingSettings.length === 0) {
      await Promise.all([
        logScheduling({
          processId: cronRunId,
          userId: 'system',
          operation: 'SCHEDULED_TASKS_NO_SETTINGS',
          message: 'No data scheduling settings found, nothing to process'
        }),
        logCronEvent(
          'INFO',
          'SCHEDULED_TASKS_NO_SETTINGS',
          'No data scheduling settings found, nothing to process',
          { cronRunId }
        )
      ]).catch(err => console.error('Error logging no settings:', err));
      return;
    }
    
    // Process each user's scheduled tasks sequentially to avoid overwhelming the database
    for (const settings of schedulingSettings) {
      const processId = generateProcessId(`scheduled-${settings.userId}`);
      
      try {
        const userCheckDetails = {
          userId: settings.userId,
          cronRunId,
          force,
        };

        await logCronEvent(
          'INFO',
          'SCHEDULED_TASK_CHECK',
          `Checking if user ${settings.userId} needs a scheduled task run${force ? ' (force run enabled)' : ''}`,
          userCheckDetails
        );

        // Check if user already had a successful run today (unless force is enabled)
        if (!force) {
            const { hasRun, details: runCheckDetails } = await hasSuccessfulRunToday(settings.userId);
            
            if (hasRun) {
                await logCronEvent(
                    'INFO',
                    'SCHEDULED_TASK_ALREADY_COMPLETED',
                    `User ${settings.userId} already has a successful run today`,
                    { ...userCheckDetails, ...runCheckDetails }
                );
                // Also log to scheduling log for easier debugging from the UI
                await logScheduling({
                    processId,
                    userId: settings.userId,
                    operation: 'SCHEDULED_TASK_SKIPPED',
                    message: `Skipped task for user ${settings.userId}: Already completed today.`,
                    details: runCheckDetails,
                });
                continue; // Skip to the next user
            }
            
            await logCronEvent(
                'INFO',
                'SCHEDULED_TASK_NEEDED',
                `User ${settings.userId} needs a scheduled task run`,
                { ...userCheckDetails, ...runCheckDetails }
            );
        } else {
            await logCronEvent(
                'INFO',
                'SCHEDULED_TASK_FORCE_RUN',
                `Force run enabled: running scheduled task for user ${settings.userId} regardless of previous runs`,
                { userId: settings.userId, cronRunId }
            );
        }
        
        console.log(`Running scheduled task for user ${settings.userId}${force ? ' (force run)' : ''}`);

        // Create the ProcessingStatus record first to prevent foreign key violations
        // This also helps in validating settings and portfolio before proceeding
        let userCryptos;
        try {
          const schedulingSettingsFull = await prisma.dataScheduling.findUnique({ where: { userId: settings.userId } });
          if (!schedulingSettingsFull || !schedulingSettingsFull.apiUrl || !schedulingSettingsFull.apiToken) {
            throw new Error(`API credentials or scheduling settings are missing for user ${settings.userId}`);
          }

          userCryptos = await prisma.crypto.findMany({ where: { userId: settings.userId }, select: { symbol: true } });
          if (!userCryptos || userCryptos.length === 0) {
            throw new Error(`No cryptocurrencies found in portfolio for user ${settings.userId}`);
          }

          await prisma.processingStatus.create({
            data: {
              processId,
              userId: settings.userId,
              status: 'RUNNING',
              type: 'DATA_SCHEDULING',
              totalItems: userCryptos.length,
              processedItems: 0,
              startedAt: new Date(),
              details: {
                initiatedBy: 'CRON',
                cronRunId,
                force,
                dailyRunTime: settings.dailyRunTime,
                timeZone: settings.timeZone,
                runTechnicalAnalysis: settings.runTechnicalAnalysis,
                cleanupEnabled: settings.cleanupEnabled,
              },
            },
          });
        } catch (validationError) {
          await logCronError(
            'SCHEDULED_TASK_VALIDATION_FAILED',
            `Validation failed for user ${settings.userId}: ${validationError instanceof Error ? validationError.message : 'Unknown error'}`,
            validationError,
            { userId: settings.userId, cronRunId }
          );
          continue; // Skip to the next user
        }

        await logScheduling({
          processId,
          userId: settings.userId,
          operation: 'SCHEDULED_TASK_START',
          message: `Starting scheduled task for user ${settings.userId}`,
          details: { cronRunId },
        });

        // Run data fetch operation
        try {
          await logScheduling({ processId, userId: settings.userId, operation: 'SCHEDULED_FETCH_START', message: 'Starting data fetch' });
          const fetchResult = await enhancedFetchAndStoreHourlyCryptoData(settings.userId);
          await logScheduling({
            processId,
            userId: settings.userId,
            operation: 'SCHEDULED_FETCH_COMPLETE',
            message: fetchResult.message,
            success: fetchResult.success,
            error: fetchResult.error,
            details: { failedSymbols: fetchResult.failedSymbols, failedDetails: fetchResult.failedDetails },
          });
        } catch (fetchError) {
          await logScheduling({
            processId,
            userId: settings.userId,
            operation: 'SCHEDULED_FETCH_ERROR',
            message: `Error fetching data: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
            error: fetchError,
          });
        }

        // Run analysis after fetching data
        if (settings.runTechnicalAnalysis) {
          try {
            await logScheduling({ processId, userId: settings.userId, operation: 'SCHEDULED_ANALYSIS_START', message: 'Starting scheduled analysis' });
            const analysisProcessId = `analysis-${processId}`;
            await runAnalysisProcess(analysisProcessId, settings.userId);
            await logScheduling({ processId, userId: settings.userId, operation: 'SCHEDULED_ANALYSIS_COMPLETE', message: 'Scheduled analysis completed', details: { analysisProcessId } });
          } catch (analysisError) {
            await logScheduling({
              processId,
              userId: settings.userId,
              operation: 'SCHEDULED_ANALYSIS_ERROR',
              message: `Scheduled analysis error: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}`,
              error: analysisError,
            });
          }
        }

        // Run cleanup if enabled
        if (settings.cleanupEnabled) {
          try {
            await logScheduling({ processId, userId: settings.userId, operation: 'SCHEDULED_CLEANUP_START', message: 'Starting data cleanup' });
            const cleanupResult = await cleanupOldData(settings.userId);
            await logScheduling({
              processId,
              userId: settings.userId,
              operation: 'SCHEDULED_CLEANUP_COMPLETE',
              message: cleanupResult.message,
              success: cleanupResult.success,
              error: cleanupResult.error,
              details: { count: cleanupResult.count },
            });
          } catch (cleanupError) {
            await logScheduling({
              processId,
              userId: settings.userId,
              operation: 'SCHEDULED_CLEANUP_ERROR',
              message: `Error cleaning up data: ${cleanupError instanceof Error ? cleanupError.message : 'Unknown error'}`,
              error: cleanupError,
            });
          }
        }

        // Update processing status to completed
        try {
          await prisma.processingStatus.update({
            where: { processId },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });
          await logScheduling({ processId, userId: settings.userId, operation: 'SCHEDULED_TASK_COMPLETE', message: 'Scheduled task completed' });
        } catch (statusUpdateError) {
          await logScheduling({
            processId,
            userId: settings.userId,
            operation: 'PROCESSING_STATUS_UPDATE_ERROR',
            message: `Error updating processing status to COMPLETED`,
            error: statusUpdateError,
          });
        }
      } catch (userError) {
        console.error(`Error processing scheduled task for user ${settings.userId}:`, userError);
        await logCronError(
          'SCHEDULED_TASK_USER_ERROR',
          `Unhandled error processing task for user ${settings.userId}`,
          userError,
          { userId: settings.userId, cronRunId, processId }
        );
        // Attempt to mark the process as failed if it was created
        try {
          await prisma.processingStatus.update({
            where: { processId },
            data: { status: 'FAILED', completedAt: new Date() },
          });
        } catch (finalStatusError) {
          // Ignore if this fails, we already logged the main error
        }
      }
    }
    
    const completeDetails = {
      timestamp: new Date().toISOString(),
      processedUsers: schedulingSettings.length,
      cronRunId
    };
    
    await Promise.all([
      logScheduling({
        processId: cronRunId,
        userId: 'system',
        operation: 'SCHEDULED_TASKS_CHECK_COMPLETE',
        message: 'Scheduled tasks check completed',
        details: completeDetails
      }),
      logCronEvent(
        'INFO',
        'SCHEDULED_TASKS_CHECK_COMPLETE',
        'Scheduled tasks check completed',
        completeDetails
      )
    ]).catch(err => console.error('Error logging tasks check complete:', err));
  } catch (error) {
    console.error('Error running scheduled tasks:', error);
    
    const errorDetails = {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      cronRunId
    };
    
    await Promise.all([
      logScheduling({
        processId: cronRunId,
        userId: 'system',
        operation: 'SCHEDULED_TASKS_CHECK_ERROR',
        message: `Error running scheduled tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error,
        details: errorDetails
      }),
      logCronError(
        'SCHEDULED_TASKS_CHECK',
        'Error running scheduled tasks',
        error,
        errorDetails
      )
    ]).catch(err => console.error('Error logging tasks check error:', err));
    
    // Re-throw the error to be caught by the caller
    throw error;
  }
}