import prisma from '@/lib/prisma';
import { fetchAndStoreHourlyCryptoData, cleanupOldData } from '@/lib/dataSchedulingService';
import { logScheduling } from '@/lib/schedulingLogger';
import { runAnalysisProcess } from '@/lib/analysisUtils';

/**
 * Checks if a scheduled task should run based on the current time and configured run time
 * @param configuredTime - The configured time in HH:MM format (24-hour)
 * @param timeZone - The time zone for the configured time
 * @returns boolean - Whether the task should run
 */
export function shouldRunScheduledTask(configuredTime: string, timeZone: string): boolean {
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
    
    // Log this check to the scheduling logger for better diagnostics
    logScheduling({
      processId: `cron-check-${Date.now()}`,
      userId: 'system',
      operation: 'SCHEDULE_TIME_CHECK',
      message: `Checking scheduled task time: Configured ${configHours}:${configMinutes} vs Current ${currentHours}:${currentMinutes} (${timeZone})`,
      details: {
        configuredTime,
        currentTime: `${currentHours}:${currentMinutes}`,
        timeZone,
        currentDate: now.toISOString()
      }
    }).catch(err => console.error('Error logging schedule check:', err));
    
    // Check if the current time matches the configured time
    const shouldRun = currentHours === configHours && currentMinutes === configMinutes;
    
    if (shouldRun) {
      logScheduling({
        processId: `cron-trigger-${Date.now()}`,
        userId: 'system',
        operation: 'SCHEDULE_TIME_MATCH',
        message: `Time match found! Task should run now.`,
        details: {
          configuredTime,
          currentTime: `${currentHours}:${currentMinutes}`,
          timeZone
        }
      }).catch(err => console.error('Error logging schedule match:', err));
    }
    
    return shouldRun;
  } catch (error) {
    console.error('Error checking scheduled task time:', error);
    
    logScheduling({
      processId: `cron-error-${Date.now()}`,
      userId: 'system',
      operation: 'SCHEDULE_TIME_ERROR',
      message: `Error checking scheduled task time: ${error instanceof Error ? error.message : String(error)}`,
      error: error
    }).catch(err => console.error('Error logging schedule error:', err));
    
    return false;
  }
}

/**
 * Runs scheduled tasks for all users who have configured data scheduling
 */
export async function runScheduledTasks(): Promise<void> {
  const cronRunId = `cron-run-${Date.now()}`;
  
  try {
    // Log the start of the scheduled tasks check
    await logScheduling({
      processId: cronRunId,
      userId: 'system',
      operation: 'SCHEDULED_TASKS_CHECK_START',
      message: 'Starting scheduled tasks check',
      details: {
        timestamp: new Date().toISOString()
      }
    });
    
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
    
    await logScheduling({
      processId: cronRunId,
      userId: 'system',
      operation: 'SCHEDULED_TASKS_SETTINGS_LOADED',
      message: `Found ${schedulingSettings.length} users with data scheduling configured`,
      details: {
        userCount: schedulingSettings.length
      }
    });
    
    // Check if there are any settings to process
    if (schedulingSettings.length === 0) {
      await logScheduling({
        processId: cronRunId,
        userId: 'system',
        operation: 'SCHEDULED_TASKS_NO_SETTINGS',
        message: 'No data scheduling settings found, nothing to process'
      });
      return;
    }
    
    // Process each user's scheduled tasks
    for (const settings of schedulingSettings) {
      try {
        await logScheduling({
          processId: cronRunId,
          userId: settings.userId,
          operation: 'SCHEDULED_TASK_CHECK',
          message: `Checking if it's time to run scheduled task for user ${settings.userId}`,
          details: {
            dailyRunTime: settings.dailyRunTime,
            timeZone: settings.timeZone
          }
        });
        
        // Check if it's time to run the scheduled task
        if (shouldRunScheduledTask(settings.dailyRunTime, settings.timeZone)) {
          console.log(`Running scheduled task for user ${settings.userId} at ${settings.dailyRunTime} ${settings.timeZone}`);
          
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
            await logScheduling({
              processId: cronRunId,
              userId: settings.userId,
              operation: 'SCHEDULED_TASK_SKIP',
              message: `Skipping scheduled task for user ${settings.userId} as it was run recently`,
              details: {
                recentRunId: recentRun.processId,
                recentRunTime: recentRun.startedAt.toISOString()
              }
            });
            continue;
          }
          
          // Create a process ID for this scheduled run
          const processId = `scheduled-${Date.now()}`;
          
          // Create a processing status record
          await prisma.processingStatus.create({
            data: {
              processId,
              userId: settings.userId,
              status: 'RUNNING',
              type: 'DATA_SCHEDULING',
              totalItems: 100, // Will be updated later
              processedItems: 0,
              startedAt: new Date()
            }
          });
          
          await logScheduling({
            processId,
            userId: settings.userId,
            operation: 'SCHEDULED_TASK_START',
            message: `Starting scheduled task at ${settings.dailyRunTime} ${settings.timeZone}`
          });
          
          // Run data fetch operation
          const fetchResult = await fetchAndStoreHourlyCryptoData(settings.userId);
          
          await logScheduling({
            processId,
            userId: settings.userId,
            operation: 'SCHEDULED_FETCH_COMPLETE',
            message: fetchResult.message,
            success: fetchResult.success,
            error: fetchResult.error
          });
          
          // Run analysis after fetching data
          if (settings.runTechnicalAnalysis) {
            try {
              await logScheduling({
                processId,
                userId: settings.userId,
                operation: 'SCHEDULED_ANALYSIS_START',
                message: 'Starting scheduled analysis'
              });
              
              // Create a new analysis process ID
              const analysisProcessId = `analysis-${Date.now()}`;
              
              // Start the analysis process
              await runAnalysisProcess(analysisProcessId, settings.userId);
              
              await logScheduling({
                processId,
                userId: settings.userId,
                operation: 'SCHEDULED_ANALYSIS_COMPLETE',
                message: 'Scheduled analysis completed'
              });
            } catch (analysisError) {
              await logScheduling({
                processId,
                userId: settings.userId,
                operation: 'SCHEDULED_ANALYSIS_ERROR',
                message: `Scheduled analysis error: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}`,
                error: analysisError
              });
            }
          }
          
          // Run cleanup if enabled
          if (settings.cleanupEnabled) {
            const cleanupResult = await cleanupOldData(settings.userId);
            
            await logScheduling({
              processId,
              userId: settings.userId,
              operation: 'SCHEDULED_CLEANUP_COMPLETE',
              message: cleanupResult.message,
              success: cleanupResult.success,
              error: cleanupResult.error
            });
          }
          
          // Update processing status to completed
          await prisma.processingStatus.update({
            where: { processId },
            data: {
              status: 'COMPLETED',
              completedAt: new Date()
            }
          });
          
          await logScheduling({
            processId,
            userId: settings.userId,
            operation: 'SCHEDULED_TASK_COMPLETE',
            message: 'Scheduled task completed'
          });
        } else {
          await logScheduling({
            processId: cronRunId,
            userId: settings.userId,
            operation: 'SCHEDULED_TASK_NOT_DUE',
            message: `Not time to run scheduled task for user ${settings.userId}`,
            details: {
              dailyRunTime: settings.dailyRunTime,
              timeZone: settings.timeZone
            }
          });
        }
      } catch (userError) {
        console.error(`Error processing scheduled task for user ${settings.userId}:`, userError);
        
        await logScheduling({
          processId: cronRunId,
          userId: settings.userId,
          operation: 'SCHEDULED_TASK_ERROR',
          message: `Error processing scheduled task for user ${settings.userId}: ${userError instanceof Error ? userError.message : 'Unknown error'}`,
          error: userError
        });
      }
    }
    
    await logScheduling({
      processId: cronRunId,
      userId: 'system',
      operation: 'SCHEDULED_TASKS_CHECK_COMPLETE',
      message: 'Scheduled tasks check completed',
      details: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error running scheduled tasks:', error);
    
    await logScheduling({
      processId: cronRunId,
      userId: 'system',
      operation: 'SCHEDULED_TASKS_CHECK_ERROR',
      message: `Error running scheduled tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error
    });
  }
}