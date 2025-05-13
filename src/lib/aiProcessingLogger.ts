import prisma from '@/lib/prisma';

export interface AIProcessingLogData {
  userId: string;
  requestType: string;
  inputData: any;
  fullPrompt: string;
  aiResponse: string;
  modelUsed: string;
  processingTimeMs?: number;
  status: 'SUCCESS' | 'ERROR';
  errorMessage?: string;
}

/**
 * Logs AI processing details to the database
 */
export async function logAIProcessing(data: AIProcessingLogData): Promise<void> {
  try {
    await prisma.aIProcessingLog.create({
      data: {
        userId: data.userId,
        requestType: data.requestType,
        inputData: data.inputData,
        fullPrompt: data.fullPrompt,
        aiResponse: data.aiResponse,
        modelUsed: data.modelUsed,
        processingTimeMs: data.processingTimeMs,
        status: data.status,
        errorMessage: data.errorMessage
      }
    });
    console.log(`AI processing log created for user ${data.userId}, type: ${data.requestType}`);
  } catch (error) {
    console.error('Error creating AI processing log:', error);
    // Don't throw the error - we don't want logging failures to break the main functionality
  }
}