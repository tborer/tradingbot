import prisma from '@/lib/prisma';
import { cleanupOldData, cleanupStaleProcessingStatuses } from '@/lib/dataSchedulingService';
import { logScheduling } from '@/lib/schedulingLogger';
import { runAnalysisProcess } from '@/lib/analysisUtils';
import { logCronEvent, logCronError } from '@/lib/cronLogger';
import { enhancedFetchAndStoreHourlyCryptoData } from '@/lib/enhancedFetchDebugger';

/**
 * Checks if a scheduled task should run based on the current time and configured run time
 * @param configuredTime - The configured time in HH:MM format (24-hour)
 * @param timeZone - The time zone for the configured time
 * @returns boolean - Whether the task should run
 */
export function shouldRunScheduledTask(configuredTime: string, timeZone: string): boolean {
  const checkId = `time-check-${Date.now()}`;
  
  try {
    // Parse the configured time
    const [configHours, configMinutes] = configuredTime.split(':').map(Number);
    
    // Get the current time in the configured time zone
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      timeZone,
      hour: 'numeric', 
      minute: 'numeric',
      hour12: false
    };
    
    // Format the current time in the specified time zone
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const zonedTimeStr = formatter.format(now);
    
    // Parse the current time in the time zone
    const [currentHours, currentMinutes] = zonedTimeStr
      .replace(/\u202F/g, ' ') // Replace non-breaking space if present
      .split(':')
      .map(part => parseInt(part.trim(), 10));
    
    console.log(`Checking scheduled task: Configured time ${configHours}:${configMinutes} vs Current time ${currentHours}:${currentMinutes} (${timeZone})`);
    
    // Log this check to both logging systems for better diagnostics
    const timeCheckDetails = {
      configuredTime,
      currentTime: `${currentHours}:${currentMinutes}`,
      timeZone,
      currentDate: now.toISOString(),
      checkId
    };
    
    // Log to the scheduling logger
    logScheduling({
      processId: `cron-check-${Date.now()}`,
      userId: 'system',
      operation: 'SCHEDULE_TIME_CHECK',
      message: `Checking scheduled task time: Configured ${configHours}:${configMinutes} vs Current ${currentHours}:${currentMinutes} (${timeZone})`,
      details: timeCheckDetails
    }).catch(err => console.error('Error logging schedule check:', err));
    
    // Also log to the cron logger
    logCronEvent(
      'INFO',
      'SCHEDULE_TIME_CHECK',
      `Checking scheduled task time: Configured ${configHours}:${configMinutes} vs Current ${currentHours}:${currentMinutes} (${timeZone})`,
      timeCheckDetails
    ).catch(err => console.error('Error logging to cron logger:', err));
    
    // Check if the current time matches the configured time
    const shouldRun = currentHours === configHours && currentMinutes === configMinutes;
    
    if (shouldRun) {
      const matchDetails = {
        configuredTime,
        currentTime: `${currentHours}:${currentMinutes}`,
        timeZone,
        checkId
      };
      
      // Log to both systems that a match was found
      logScheduling({
        processId: `cron-trigger-${Date.now()}`,
        userId: 'system',
        operation: 'SCHEDULE_TIME_MATCH',
        message: `Time match found! Task should run now.`,
        details: matchDetails
      }).catch(err => console.error('Error logging schedule match:', err));
      
      logCronEvent(
        'INFO',
        'SCHEDULE_TIME_MATCH',
        `Time match found! Task should run now.`,
        matchDetails
      ).catch(err => console.error('Error logging to cron logger:', err));
    }
    
    return shouldRun;
  } catch (error) {
    console.error('Error checking scheduled task time:', error);
    
    // Log the error to both systems
    const errorDetails = {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      checkId
    };
    
    logScheduling({
      processId: `cron-error-${Date.now()}`,
      userId: 'system',
      operation: 'SCHEDULE_TIME_ERROR',
      message: `Error checking scheduled task time: ${error instanceof Error ? error.message : String(error)}`,
      error: error
    }).catch(err => console.error('Error logging schedule error:', err));
    
    logCronError(
      'SCHEDULE_TIME_CHECK',
      `Error checking scheduled task time`,
      error,
      { checkId }
    ).catch(err => console.error('Error logging to cron logger:', err));
    
    return false;
  }
}

/**
 * Runs scheduled tasks for all users who have configured data scheduling
 */
export async function runScheduledTasks(force: boolean = false): Promise<void> {
  const cronRunId = `cron-run-${Date.now()}`;
  
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
    
    // Process each user's scheduled tasks
    for (const settings of schedulingSettings) {
      try {
        const userCheckDetails = {
          dailyRunTime: settings.dailyRunTime,
          timeZone: settings.timeZone,
          userId: settings.userId,
          cronRunId,
          force
        };
        
        await Promise.all([
          logScheduling({
            processId: cronRunId,
            userId: settings.userId,
            operation: 'SCHEDULED_TASK_CHECK',
            message: `Checking if it's time to run scheduled task for user ${settings.userId}${force ? ' (force run enabled)' : ''}`,
            details: userCheckDetails
          }),
          logCronEvent(
            'INFO',
            'SCHEDULED_TASK_CHECK',
            `Checking if it's time to run scheduled task for user ${settings.userId}${force ? ' (force run enabled)' : ''}`,
            userCheckDetails
          )
        ]).catch(err => console.error('Error logging task check:', err));
        
        // Check if it's time to run the scheduled task, or force is enabled
        if (force || shouldRunScheduledTask(settings.dailyRunTime, settings.timeZone)) {
          if (force) {
            await logCronEvent(
              'INFO',
              'SCHEDULED_TASK_FORCE_RUN',
              `Force run enabled: running scheduled task for user ${settings.userId} regardless of time`,
              { userId: settings.userId, cronRunId }
            );
          }
          console.log(`Running scheduled task for user ${settings.userId} at ${settings.dailyRunTime} ${settings.timeZone}${force ? ' (force run)' : ''}`);
          
          // Check if there's already a recent run for this user (within the last 10 minutes)
          const recentRun = await prisma.processingStatus.findFirst({
            where: {
              userId: settings.userId,
              type: 'DATA_SCHEDULING',
              startedAt: {
                gte: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
              }
            },
            orderBy: {
              startedAt: 'desc'
            }
          });
          
          if (recentRun) {
            const skipDetails = {
              recentRunId: recentRun.processId,
              recentRunTime: recentRun.startedAt.toISOString(),
              userId: settings.userId,
              cronRunId
            };
            
            await Promise.all([
              logScheduling({
                processId: cronRunId,
                userId: settings.userId,
                operation: 'SCHEDULED_TASK_SKIP',
                message: `Skipping scheduled task for user ${settings.userId} as it was run recently`,
                details: skipDetails
              }),
              logCronEvent(
                'INFO',
                'SCHEDULED_TASK_SKIP',
                `Skipping scheduled task for user ${settings.userId} as it was run recently`,
                skipDetails
              )
            ]).catch(err => console.error('Error logging task skip:', err));
            continue;
          }
          
          // Enhanced: Validate data scheduling settings, crypto portfolio, and API credentials before processing
          const processId = `scheduled-${Date.now()}`;

          // Fetch full data scheduling settings for the user
          const schedulingSettingsFull = await prisma.dataScheduling.findUnique({
            where: { userId: settings.userId }
          });

          if (!schedulingSettingsFull) {
            const missingSettingsMsg = `Data scheduling settings not found for user ${settings.userId}`;
            await Promise.all([
              logScheduling({
                processId,
                userId: settings.userId,
                operation: 'SCHEDULED_TASK_SETTINGS_MISSING',
                message: missingSettingsMsg,
                error: new Error(missingSettingsMsg),
                details: { cronRunId }
              }),
              logCronError(
                'SCHEDULED_TASK_SETTINGS_MISSING',
                missingSettingsMsg,
                new Error(missingSettingsMsg),
                { cronRunId }
              )
            ]);
            continue;
          }

          // Check for required API credentials
          if (!schedulingSettingsFull.apiUrl || !schedulingSettingsFull.apiToken) {
            const missingApiMsg = `API credentials missing for user ${settings.userId}: apiUrl=${schedulingSettingsFull.apiUrl}, apiToken=${!!schedulingSettingsFull.apiToken}`;
            await Promise.all([
              logScheduling({
                processId,
                userId: settings.userId,
                operation: 'SCHEDULED_TASK_API_CREDENTIALS_MISSING',
                message: missingApiMsg,
                error: new Error(missingApiMsg),
                details: { cronRunId }
              }),
              logCronError(
                'SCHEDULED_TASK_API_CREDENTIALS_MISSING',
                missingApiMsg,
                new Error(missingApiMsg),
                { cronRunId }
              )
            ]);
            continue;
          }

          // Check for crypto portfolio
          const userCryptos = await prisma.crypto.findMany({
            where: { userId: settings.userId },
            select: { symbol: true }
          });
          if (!userCryptos || userCryptos.length === 0) {
            const missingCryptosMsg = `No cryptocurrencies found in portfolio for user ${settings.userId}`;
            await Promise.all([
              logScheduling({
                processId,
                userId: settings.userId,
                operation: 'SCHEDULED_TASK_CRYPTOS_MISSING',
                message: missingCryptosMsg,
                error: new Error(missingCryptosMsg),
                details: { cronRunId }
              }),
              logCronError(
                'SCHEDULED_TASK_CRYPTOS_MISSING',
                missingCryptosMsg,
                new Error(missingCryptosMsg),
                { cronRunId }
              )
            ]);
            continue;
          }

          // Create a processing status record
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
                dailyRunTime: settings.dailyRunTime,
                timeZone: settings.timeZone,
                runTechnicalAnalysis: settings.runTechnicalAnalysis,
                cleanupEnabled: settings.cleanupEnabled
              }
            }
          });

          const startDetails = {
            processId,
            dailyRunTime: settings.dailyRunTime,
            timeZone: settings.timeZone,
            cronRunId
          };

          await Promise.all([
            logScheduling({
              processId,
              userId: settings.userId,
              operation: 'SCHEDULED_TASK_START',
              message: `Starting scheduled task at ${settings.dailyRunTime} ${settings.timeZone}`,
              details: startDetails
            }),
            logCronEvent(
              'INFO',
              'SCHEDULED_TASK_START',
              `Starting scheduled task at ${settings.dailyRunTime} ${settings.timeZone}`,
              startDetails
            )
          ]).catch(err => console.error('Error logging task start:', err));

          // Run data fetch operation
          try {
            await logCronEvent(
              'INFO',
              'SCHEDULED_FETCH_START',
              `Starting data fetch for user ${settings.userId}`,
              { processId, cronRunId }
            );

            const fetchResult = await enhancedFetchAndStoreHourlyCryptoData(settings.userId);

            const fetchCompleteDetails = {
              success: fetchResult.success,
              message: fetchResult.message,
              error: fetchResult.error,
              processId,
              cronRunId
            };

            await Promise.all([
              logScheduling({
                processId,
                userId: settings.userId,
                operation: 'SCHEDULED_FETCH_COMPLETE',
                message: fetchResult.message,
                success: fetchResult.success,
                error: fetchResult.error,
                details: fetchCompleteDetails
              }),
              logCronEvent(
                fetchResult.success ? 'INFO' : 'ERROR',
                'SCHEDULED_FETCH_COMPLETE',
                fetchResult.message,
                fetchCompleteDetails
              )
            ]).catch(err => console.error('Error logging fetch complete:', err));
          } catch (fetchError) {
            const fetchErrorDetails = {
              error: fetchError instanceof Error ? fetchError.message : String(fetchError),
              stack: fetchError instanceof Error ? fetchError.stack : undefined,
              processId,
              cronRunId
            };

            await Promise.all([
              logScheduling({
                processId,
                userId: settings.userId,
                operation: 'SCHEDULED_FETCH_ERROR',
                message: `Error fetching data: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
                error: fetchError,
                details: fetchErrorDetails
              }),
              logCronError(
                'SCHEDULED_FETCH',
                `Error fetching data for user ${settings.userId}`,
                fetchError,
                fetchErrorDetails
              )
            ]).catch(err => console.error('Error logging fetch error:', err));
          }
          
          // Run analysis after fetching data
          if (settings.runTechnicalAnalysis) {
            try {
              const analysisStartDetails = {
                processId,
                cronRunId
              };
              
              await Promise.all([
                logScheduling({
                  processId,
                  userId: settings.userId,
                  operation: 'SCHEDULED_ANALYSIS_START',
                  message: 'Starting scheduled analysis',
                  details: analysisStartDetails
                }),
                logCronEvent(
                  'INFO',
                  'SCHEDULED_ANALYSIS_START',
                  `Starting scheduled analysis for user ${settings.userId}`,
                  analysisStartDetails
                )
              ]).catch(err => console.error('Error logging analysis start:', err));
              
              // Create a new analysis process ID
              const analysisProcessId = `analysis-${Date.now()}`;
              
              // Start the analysis process
              await runAnalysisProcess(analysisProcessId, settings.userId);
              
              const analysisCompleteDetails = {
                processId,
                analysisProcessId,
                cronRunId
              };
              
              await Promise.all([
                logScheduling({
                  processId,
                  userId: settings.userId,
                  operation: 'SCHEDULED_ANALYSIS_COMPLETE',
                  message: 'Scheduled analysis completed',
                  details: analysisCompleteDetails
                }),
                logCronEvent(
                  'INFO',
                  'SCHEDULED_ANALYSIS_COMPLETE',
                  `Scheduled analysis completed for user ${settings.userId}`,
                  analysisCompleteDetails
                )
              ]).catch(err => console.error('Error logging analysis complete:', err));
            } catch (analysisError) {
              const analysisErrorDetails = {
                error: analysisError instanceof Error ? analysisError.message : String(analysisError),
                stack: analysisError instanceof Error ? analysisError.stack : undefined,
                processId,
                cronRunId
              };
              
              await Promise.all([
                logScheduling({
                  processId,
                  userId: settings.userId,
                  operation: 'SCHEDULED_ANALYSIS_ERROR',
                  message: `Scheduled analysis error: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}`,
                  error: analysisError,
                  details: analysisErrorDetails
                }),
                logCronError(
                  'SCHEDULED_ANALYSIS',
                  `Error running analysis for user ${settings.userId}`,
                  analysisError,
                  analysisErrorDetails
                )
              ]).catch(err => console.error('Error logging analysis error:', err));
            }
          }
          
          // Run cleanup if enabled
          if (settings.cleanupEnabled) {
            try {
              await logCronEvent(
                'INFO',
                'SCHEDULED_CLEANUP_START',
                `Starting data cleanup for user ${settings.userId}`,
                { processId, cronRunId }
              );
              
              const cleanupResult = await cleanupOldData(settings.userId);
              
              const cleanupCompleteDetails = {
                success: cleanupResult.success,
                message: cleanupResult.message,
                error: cleanupResult.error,
                count: cleanupResult.count,
                processId,
                cronRunId
              };
              
              await Promise.all([
                logScheduling({
                  processId,
                  userId: settings.userId,
                  operation: 'SCHEDULED_CLEANUP_COMPLETE',
                  message: cleanupResult.message,
                  success: cleanupResult.success,
                  error: cleanupResult.error,
                  details: cleanupCompleteDetails
                }),
                logCronEvent(
                  cleanupResult.success ? 'INFO' : 'ERROR',
                  'SCHEDULED_CLEANUP_COMPLETE',
                  cleanupResult.message,
                  cleanupCompleteDetails
                )
              ]).catch(err => console.error('Error logging cleanup complete:', err));
            } catch (cleanupError) {
              const cleanupErrorDetails = {
                error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                stack: cleanupError instanceof Error ? cleanupError.stack : undefined,
                processId,
                cronRunId
              };
              
              await Promise.all([
                logScheduling({
                  processId,
                  userId: settings.userId,
                  operation: 'SCHEDULED_CLEANUP_ERROR',
                  message: `Error cleaning up data: ${cleanupError instanceof Error ? cleanupError.message : 'Unknown error'}`,
                  error: cleanupError,
                  details: cleanupErrorDetails
                }),
                logCronError(
                  'SCHEDULED_CLEANUP',
                  `Error cleaning up data for user ${settings.userId}`,
                  cleanupError,
                  cleanupErrorDetails
                )
              ]).catch(err => console.error('Error logging cleanup error:', err));
            }
          }
          
          // Update processing status to completed
          try {
            await prisma.processingStatus.update({
              where: { processId },
              data: {
                status: 'COMPLETED',
                completedAt: new Date(),
                details: {
                  update: {
                    finalStatus: 'COMPLETED',
                    completionTime: new Date().toISOString()
                  }
                }
              }
            });
            
            const taskCompleteDetails = {
              processId,
              cronRunId,
              completedAt: new Date().toISOString()
            };
            
            await Promise.all([
              logScheduling({
                processId,
                userId: settings.userId,
                operation: 'SCHEDULED_TASK_COMPLETE',
                message: 'Scheduled task completed',
                details: taskCompleteDetails
              }),
              logCronEvent(
                'INFO',
                'SCHEDULED_TASK_COMPLETE',
                `Scheduled task completed for user ${settings.userId}`,
                taskCompleteDetails
              )
            ]).catch(err => console.error('Error logging task complete:', err));
          } catch (statusUpdateError) {
            console.error(`Error updating processing status for user ${settings.userId}:`, statusUpdateError);
            
            await logCronError(
              'PROCESSING_STATUS_UPDATE',
              `Error updating processing status for user ${settings.userId}`,
              statusUpdateError,
              { processId, cronRunId }
            );
          }
        } else {
          const notDueDetails = {
            dailyRunTime: settings.dailyRunTime,
            timeZone: settings.timeZone,
            currentTime: new Date().toISOString(),
            cronRunId
          };
          
          await Promise.all([
            logScheduling({
              processId: cronRunId,
              userId: settings.userId,
              operation: 'SCHEDULED_TASK_NOT_DUE',
              message: `Not time to run scheduled task for user ${settings.userId}`,
              details: notDueDetails
            }),
            logCronEvent(
              'INFO',
              'SCHEDULED_TASK_NOT_DUE',
              `Not time to run scheduled task for user ${settings.userId}`,
              notDueDetails
            )
          ]).catch(err => console.error('Error logging task not due:', err));
        }
      } catch (userError) {
        console.error(`Error processing scheduled task for user ${settings.userId}:`, userError);
        
        const userErrorDetails = {
          error: userError instanceof Error ? userError.message : String(userError),
          stack: userError instanceof Error ? userError.stack : undefined,
          userId: settings.userId,
          cronRunId
        };
        
        await Promise.all([
          logScheduling({
            processId: cronRunId,
            userId: settings.userId,
            operation: 'SCHEDULED_TASK_ERROR',
            message: `Error processing scheduled task for user ${settings.userId}: ${userError instanceof Error ? userError.message : 'Unknown error'}`,
            error: userError,
            details: userErrorDetails
          }),
          logCronError(
            'SCHEDULED_TASK',
            `Error processing scheduled task for user ${settings.userId}`,
            userError,
            userErrorDetails
          )
        ]).catch(err => console.error('Error logging user error:', err));
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