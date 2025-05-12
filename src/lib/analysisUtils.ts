import prisma from '@/lib/prisma';
import { schedulingLogger } from '@/lib/schedulingLogger';
import { generateComprehensiveFeatureSet } from '@/lib/comprehensiveFeatureUtils';
import { runPredictionsForAllCryptos, updatePredictionOutcomes } from '@/lib/predictionModels/predictionRunner';
import { generateTradingSignalsForAllCryptos } from '@/lib/tradingSignals/signalGenerator';
import { runTechnicalAnalysis } from '@/lib/dataSchedulingService';

/**
 * Run the analysis process for a user
 * This function is used by both the API endpoint and the scheduler
 */
export async function runAnalysisProcess(processId: string, userId: string): Promise<void> {
  try {
    // Get user's cryptos
    const cryptos = await prisma.crypto.findMany({
      where: {
        userId
      }
    });

    // Create or update processing status
    await prisma.processingStatus.upsert({
      where: {
        processId
      },
      update: {
        userId,
        status: 'RUNNING',
        type: 'ANALYSIS',
        totalItems: cryptos.length * 5, // 5 steps per crypto
        processedItems: 0,
        startedAt: new Date()
      },
      create: {
        processId,
        userId,
        status: 'RUNNING',
        type: 'ANALYSIS',
        totalItems: cryptos.length * 5, // 5 steps per crypto
        processedItems: 0,
        startedAt: new Date()
      }
    });

    // Log the start of the analysis process
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'ANALYSIS_START',
      message: 'Starting analysis process'
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
          // Check if technical analysis data exists for this symbol
          const technicalAnalysis = await prisma.technicalAnalysisOutput.findFirst({
            where: {
              symbol: crypto.symbol
            },
            orderBy: {
              timestamp: 'desc'
            }
          });

          if (!technicalAnalysis) {
            await schedulingLogger.log({
              processId,
              userId,
              level: 'WARNING',
              category: 'ANALYSIS',
              operation: 'FEATURE_GENERATION_SKIP',
              symbol: crypto.symbol,
              message: `No technical analysis data found for ${crypto.symbol}, skipping feature generation`
            });
            continue;
          }

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

    // Step 5: Generate trading signals
    await schedulingLogger.log({
      processId,
      userId,
      level: 'INFO',
      category: 'ANALYSIS',
      operation: 'TRADING_SIGNALS_START',
      message: 'Starting trading signal generation'
    });

    try {
      const signalsResult = await generateTradingSignalsForAllCryptos(userId);
      
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
        operation: 'TRADING_SIGNALS_COMPLETE',
        message: `Trading signal generation completed: Generated signals for ${signalsResult.length} cryptocurrencies`
      });
    } catch (error) {
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'TRADING_SIGNALS_ERROR',
        message: `Trading signal generation error: ${error instanceof Error ? error.message : 'Unknown error'}`
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

/**
 * Run analysis for a specific symbol
 * This function is used by the runAnalysisProcess function
 */
export async function runAnalysisForSymbol(symbol: string, userId: string, processId: string): Promise<void> {
  // Check if technical analysis data exists for this symbol
  const technicalAnalysis = await prisma.technicalAnalysisOutput.findFirst({
    where: {
      symbol
    },
    orderBy: {
      timestamp: 'desc'
    }
  });

  if (!technicalAnalysis) {
    throw new Error(`No technical analysis data found for ${symbol}`);
  }

  // Generate comprehensive features
  await generateComprehensiveFeatureSet(symbol);
  
  // Log success
  await schedulingLogger.log({
    processId,
    userId,
    level: 'INFO',
    category: 'ANALYSIS',
    operation: 'SYMBOL_ANALYSIS_COMPLETE',
    symbol,
    message: `Analysis completed for ${symbol}`
  });
}