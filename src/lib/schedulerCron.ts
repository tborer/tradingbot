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
    
    // Check if the current time matches the configured time
    return currentHours === configHours && currentMinutes === configMinutes;
  } catch (error) {
    console.error('Error checking scheduled task time:', error);
    return false;
  }
}

/**
 * Runs scheduled tasks for all users who have configured data scheduling
 */
export async function runScheduledTasks(): Promise<void> {
  try {
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
    
    // Process each user's scheduled tasks
    for (const settings of schedulingSettings) {
      try {
        // Check if it's time to run the scheduled task
        if (shouldRunScheduledTask(settings.dailyRunTime, settings.timeZone)) {
          console.log(`Running scheduled task for user ${settings.userId} at ${settings.dailyRunTime} ${settings.timeZone}`);
          
          // Create a process ID for this scheduled run
          const processId = `scheduled-${Date.now()}`;
          
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
          
          await logScheduling({
            processId,
            userId: settings.userId,
            operation: 'SCHEDULED_TASK_COMPLETE',
            message: 'Scheduled task completed'
          });
        }
      } catch (userError) {
        console.error(`Error processing scheduled task for user ${settings.userId}:`, userError);
      }
    }
  } catch (error) {
    console.error('Error running scheduled tasks:', error);
  }
}