import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { runTechnicalAnalysis } from '@/lib/dataSchedulingService';
import { generateComprehensiveFeatureSet } from '@/lib/comprehensiveFeatureUtils';
import { runPredictionsForAllCryptos, updatePredictionOutcomes } from '@/lib/predictionModels/predictionRunner';
import { schedulingLogger } from '@/lib/schedulingLogger';
import { cleanupStaleProcessingStatuses } from '@/lib/dataSchedulingService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user from session
    const supabase = createClient(req, res);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Clean up stale processing statuses
    await cleanupStaleProcessingStatuses();

    // Create a new processing status entry
    const processId = `analysis-${Date.now()}`;
    await prisma.processingStatus.create({
      data: {
        processId,
        userId: user.id,
        status: 'RUNNING',
        type: 'ANALYSIS',
        totalItems: 100, // Placeholder, will be updated
        processedItems: 0
      }
    });

    // Log the start of the analysis process
    await schedulingLogger.log({
      processId,
      userId: user.id,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'ANALYSIS_START',
      message: 'Starting analysis process'
    });

    // Start the analysis process in the background
    runAnalysisProcess(processId, user.id)
      .then(() => {
        console.log(`Analysis process ${processId} completed`);
      })
      .catch(error => {
        console.error(`Error in analysis process ${processId}:`, error);
      });

    // Return accepted status with process ID
    return res.status(202).json({
      success: true,
      message: 'Analysis process started',
      processId
    });
  } catch (error) {
    console.error('Error starting analysis process:', error);
    return res.status(500).json({
      error: 'Failed to start analysis process',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Run the analysis process in the background
 */
async function runAnalysisProcess(processId: string, userId: string): Promise<void> {
  try {
    // Get user's cryptos
    const cryptos = await prisma.crypto.findMany({
      where: {
        userId
      }
    });

    // Update total items
    await prisma.processingStatus.update({
      where: {
        processId
      },
      data: {
        totalItems: cryptos.length * 4 // 4 steps per crypto
      }
    });

    let processedItems = 0;

    // Step 1: Run technical analysis
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'TECHNICAL_ANALYSIS_START',
      message: 'Starting technical analysis'
    });

    try {
      await runTechnicalAnalysis(userId, processId);
      
      // Update processed items
      processedItems += cryptos.length;
      await prisma.processingStatus.update({
        where: {
          processId
        },
        data: {
          processedItems
        }
      });
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'TECHNICAL_ANALYSIS_COMPLETE',
        message: 'Technical analysis completed'
      });
    } catch (error) {
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'TECHNICAL_ANALYSIS_ERROR',
        message: `Technical analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }

    // Step 2: Generate comprehensive features
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'FEATURE_GENERATION_START',
      message: 'Starting comprehensive feature generation'
    });

    try {
      for (const crypto of cryptos) {
        try {
          await generateComprehensiveFeatureSet(crypto.symbol);
          
          // Update processed items
          processedItems++;
          await prisma.processingStatus.update({
            where: {
              processId
            },
            data: {
              processedItems
            }
          });
          
          await schedulingLogger.log({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'FEATURE_GENERATION_PROGRESS',
            symbol: crypto.symbol,
            message: `Generated comprehensive features for ${crypto.symbol}`
          });
        } catch (cryptoError) {
          await schedulingLogger.log({
            processId,
            userId,
            level: 'ERROR',
            category: 'ANALYSIS',
            operation: 'FEATURE_GENERATION_ERROR',
            symbol: crypto.symbol,
            message: `Error generating features for ${crypto.symbol}: ${cryptoError instanceof Error ? cryptoError.message : 'Unknown error'}`
          });
        }
      }
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'FEATURE_GENERATION_COMPLETE',
        message: 'Comprehensive feature generation completed'
      });
    } catch (error) {
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'FEATURE_GENERATION_ERROR',
        message: `Feature generation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }

    // Step 3: Run prediction models
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'PREDICTION_START',
      message: 'Starting prediction model runs'
    });

    try {
      const predictionResult = await runPredictionsForAllCryptos(userId);
      
      // Update processed items
      processedItems += cryptos.length;
      await prisma.processingStatus.update({
        where: {
          processId
        },
        data: {
          processedItems
        }
      });
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'PREDICTION_COMPLETE',
        message: `Prediction models completed: ${predictionResult.message}`
      });
    } catch (error) {
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'PREDICTION_ERROR',
        message: `Prediction model error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }

    // Step 4: Update prediction outcomes
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'OUTCOME_UPDATE_START',
      message: 'Starting prediction outcome updates'
    });

    try {
      const outcomeResult = await updatePredictionOutcomes();
      
      // Update processed items
      processedItems += cryptos.length;
      await prisma.processingStatus.update({
        where: {
          processId
        },
        data: {
          processedItems
        }
      });
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'OUTCOME_UPDATE_COMPLETE',
        message: `Prediction outcome updates completed: ${outcomeResult.message}`
      });
    } catch (error) {
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'OUTCOME_UPDATE_ERROR',
        message: `Prediction outcome update error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }

    // Mark process as completed
    await prisma.processingStatus.update({
      where: {
        processId
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });

    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'ANALYSIS_COMPLETE',
      message: 'Analysis process completed successfully'
    });
  } catch (error) {
    console.error(`Error in analysis process ${processId}:`, error);
    
    // Mark process as failed
    await prisma.processingStatus.update({
      where: {
        processId
      },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });

    await schedulingLogger.log({
      processId,
      userId,
      level: 'ERROR',
      category: 'ANALYSIS',
      operation: 'ANALYSIS_FAILED',
      message: `Analysis process failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
}