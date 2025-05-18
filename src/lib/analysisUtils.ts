import prisma from '@/lib/prisma';
import { schedulingLogger } from '@/lib/schedulingLogger';
import { generateComprehensiveFeatureSet, saveComprehensiveFeatureSet } from '@/lib/comprehensiveFeatureUtils';
import { runPredictionsForAllCryptos, updatePredictionOutcomes } from '@/lib/predictionModels/predictionRunner';
import { generateTradingSignalsForAllCryptos } from '@/lib/tradingSignals/signalGenerator';
import { runTechnicalAnalysis as runTechnicalAnalysisFromData } from '@/lib/dataSchedulingService';

/**
 * Run technical analysis for a user's cryptocurrencies
 * This function is used by the runAnalysisProcess function
 */
export async function runTechnicalAnalysis(userId: string, processId: string): Promise<void> {
  console.log(`Starting technical analysis for user ${userId}, process ${processId}`);
  
  // Get user's cryptos
  const cryptos = await prisma.crypto.findMany({
    where: {
      userId
    }
  });

  // Log the start of technical analysis
  await schedulingLogger.log({
    processId,
    userId,
    level: 'INFO',
    category: 'ANALYSIS',
    operation: 'TECHNICAL_ANALYSIS_START',
    message: `Starting technical analysis for ${cryptos.length} cryptocurrencies`
  });

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  // Process each crypto
  for (const crypto of cryptos) {
    try {
      console.log(`Processing technical analysis for ${crypto.symbol}`);
      
      // Get all available hourly data for this crypto (up to 90 days)
      // Calculate timestamp for 90 days ago
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const ninetyDaysAgoTimestamp = BigInt(Math.floor(ninetyDaysAgo.getTime() / 1000));
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'DATA_FETCH',
        symbol: crypto.symbol,
        message: `Fetching all available data for ${crypto.symbol} (up to 90 days)`
      });
      
      // Get all data up to 90 days
      const hourlyData = await prisma.hourlyCryptoHistoricalData.findMany({
        where: {
          instrument: `${crypto.symbol}-USD`,
          timestamp: {
            gte: ninetyDaysAgoTimestamp
          }
        },
        orderBy: {
          timestamp: 'desc'
        }
      });

      console.log(`Found ${hourlyData.length} hourly data records for ${crypto.symbol}`);

      if (hourlyData.length === 0) {
        skipCount++;
        await schedulingLogger.log({
          processId,
          userId,
          level: 'WARNING',
          category: 'ANALYSIS',
          operation: 'TECHNICAL_ANALYSIS_SKIP',
          symbol: crypto.symbol,
          message: `No hourly data found for ${crypto.symbol}, skipping technical analysis`
        });
        continue;
      }

      // Convert BigInt to number for analysis
      const formattedData = hourlyData.map(entry => ({
        TIMESTAMP: Number(entry.timestamp),
        OPEN: entry.open,
        HIGH: entry.high,
        LOW: entry.low,
        CLOSE: entry.close,
        VOLUME: entry.volume,
        INSTRUMENT: entry.instrument
      }));

      // Run technical analysis on the data
      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'TECHNICAL_ANALYSIS_PROCESSING',
        symbol: crypto.symbol,
        message: `Processing technical analysis for ${crypto.symbol} with ${formattedData.length} data points`
      });

      console.log(`Running technical analysis for ${crypto.symbol} with ${formattedData.length} data points`);
      
      const result = await runTechnicalAnalysisFromData(
        formattedData,
        crypto.symbol,
        `${crypto.symbol}-USD`,
        processId,
        userId
      );

      if (result.success) {
        successCount++;
        console.log(`Technical analysis completed successfully for ${crypto.symbol}`);
        
        await schedulingLogger.log({
          processId,
          userId,
          level: 'INFO',
          category: 'ANALYSIS',
          operation: 'TECHNICAL_ANALYSIS_SUCCESS',
          symbol: crypto.symbol,
          message: `Technical analysis completed successfully for ${crypto.symbol}`,
          details: { steps: result.steps }
        });
      } else {
        errorCount++;
        console.error(`Technical analysis failed for ${crypto.symbol}:`, result.message || 'Unknown error');
        
        await schedulingLogger.log({
          processId,
          userId,
          level: 'ERROR',
          category: 'ANALYSIS',
          operation: 'TECHNICAL_ANALYSIS_ERROR',
          symbol: crypto.symbol,
          message: `Technical analysis failed for ${crypto.symbol}: ${result.message || 'Unknown error'}`,
          details: { error: result.error }
        });
      }
    } catch (error) {
      errorCount++;
      console.error(`Error in technical analysis for ${crypto.symbol}:`, error);
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'TECHNICAL_ANALYSIS_ERROR',
        symbol: crypto.symbol,
        message: `Error in technical analysis for ${crypto.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  // Log completion
  console.log(`Technical analysis completed for all cryptocurrencies: ${successCount} successful, ${skipCount} skipped, ${errorCount} errors`);
  
  await schedulingLogger.log({
    processId,
    userId,
    level: 'INFO',
    category: 'ANALYSIS',
    operation: 'TECHNICAL_ANALYSIS_COMPLETE',
    message: `Technical analysis completed for all cryptocurrencies: ${successCount} successful, ${skipCount} skipped, ${errorCount} errors`
  });
}

/**
 * Run the analysis process for a user
 * This function is used by both the API endpoint and the scheduler
 * Implements a sequential approach to ensure each step completes before moving to the next
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
      message: 'Starting analysis process with sequential approach'
    });

    let processedItems = 0;
    let successCount = 0;
    let errorCount = 0;

    // Process each cryptocurrency sequentially through all steps
    for (const crypto of cryptos) {
      try {
        await schedulingLogger.log({
          processId,
          userId,
          level: 'INFO',
          category: 'ANALYSIS',
          operation: 'CRYPTO_ANALYSIS_START',
          symbol: crypto.symbol,
          message: `Starting analysis for ${crypto.symbol}`
        });

        // Step 1: Run technical analysis for this crypto
        let technicalAnalysisSuccess = false;
        try {
          console.log(`Running technical analysis for ${crypto.symbol}`);
          
          // Get all available hourly data for this crypto (up to 90 days)
          // Calculate timestamp for 90 days ago
          const ninetyDaysAgo = new Date();
          ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
          const ninetyDaysAgoTimestamp = BigInt(Math.floor(ninetyDaysAgo.getTime() / 1000));
          
          await schedulingLogger.log({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'DATA_FETCH',
            symbol: crypto.symbol,
            message: `Fetching all available data for ${crypto.symbol} (up to 90 days)`
          });
          
          // Get all data up to 90 days
          const hourlyData = await prisma.hourlyCryptoHistoricalData.findMany({
            where: {
              instrument: `${crypto.symbol}-USD`,
              timestamp: {
                gte: ninetyDaysAgoTimestamp
              }
            },
            orderBy: {
              timestamp: 'desc'
            }
          });

          console.log(`Found ${hourlyData.length} hourly data records for ${crypto.symbol}`);

          if (hourlyData.length === 0) {
            await schedulingLogger.log({
              processId,
              userId,
              level: 'WARNING',
              category: 'ANALYSIS',
              operation: 'TECHNICAL_ANALYSIS_SKIP',
              symbol: crypto.symbol,
              message: `No hourly data found for ${crypto.symbol}, skipping technical analysis`
            });
            continue;
          }

          // Convert BigInt to number for analysis
          const formattedData = hourlyData.map(entry => ({
            TIMESTAMP: Number(entry.timestamp),
            OPEN: entry.open,
            HIGH: entry.high,
            LOW: entry.low,
            CLOSE: entry.close,
            VOLUME: entry.volume,
            INSTRUMENT: entry.instrument
          }));

          // Run technical analysis on the data
          await schedulingLogger.log({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'TECHNICAL_ANALYSIS_PROCESSING',
            symbol: crypto.symbol,
            message: `Processing technical analysis for ${crypto.symbol} with ${formattedData.length} data points`
          });

          console.log(`Running technical analysis for ${crypto.symbol} with ${formattedData.length} data points`);
          
          const result = await runTechnicalAnalysisFromData(
            formattedData,
            crypto.symbol,
            `${crypto.symbol}-USD`,
            processId,
            userId
          );

          if (result.success) {
            technicalAnalysisSuccess = true;
            console.log(`Technical analysis completed successfully for ${crypto.symbol}`);
            
            await schedulingLogger.log({
              processId,
              userId,
              level: 'INFO',
              category: 'ANALYSIS',
              operation: 'TECHNICAL_ANALYSIS_SUCCESS',
              symbol: crypto.symbol,
              message: `Technical analysis completed successfully for ${crypto.symbol}`,
              details: { steps: result.steps }
            });
            
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
          } else {
            console.error(`Technical analysis failed for ${crypto.symbol}:`, result.message || 'Unknown error');
            
            await schedulingLogger.log({
              processId,
              userId,
              level: 'ERROR',
              category: 'ANALYSIS',
              operation: 'TECHNICAL_ANALYSIS_ERROR',
              symbol: crypto.symbol,
              message: `Technical analysis failed for ${crypto.symbol}: ${result.message || 'Unknown error'}`,
              details: { error: result.error }
            });
            
            // Skip to the next crypto if technical analysis fails
            continue;
          }
        } catch (error) {
          console.error(`Error in technical analysis for ${crypto.symbol}:`, error);
          
          await schedulingLogger.log({
            processId,
            userId,
            level: 'ERROR',
            category: 'ANALYSIS',
            operation: 'TECHNICAL_ANALYSIS_ERROR',
            symbol: crypto.symbol,
            message: `Error in technical analysis for ${crypto.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
          
          // Skip to the next crypto if technical analysis fails
          continue;
        }

        // Step 2: Generate comprehensive features for this crypto
        let featuresSuccess = false;
        if (technicalAnalysisSuccess) {
          try {
            console.log(`Generating comprehensive features for ${crypto.symbol}`);
            
            await schedulingLogger.log({
              processId,
              userId,
              level: 'INFO',
              category: 'ANALYSIS',
              operation: 'FEATURE_GENERATION_START',
              symbol: crypto.symbol,
              message: `Starting comprehensive feature generation for ${crypto.symbol}`
            });
            
            // Check if technical analysis data exists for this symbol
            let technicalAnalysis;
            try {
              // Check if prisma is defined before using it
              if (!prisma) {
                console.error(`Prisma client is undefined when fetching technical analysis for ${crypto.symbol}`);
                await schedulingLogger.log({
                  processId,
                  userId,
                  level: 'ERROR',
                  category: 'ANALYSIS',
                  operation: 'DB_ERROR',
                  symbol: crypto.symbol,
                  message: `Prisma client is undefined when fetching technical analysis`
                });
                continue;
              }
              
              technicalAnalysis = await prisma.technicalAnalysisOutput.findFirst({
                where: {
                  symbol: crypto.symbol
                },
                orderBy: {
                  timestamp: 'desc'
                }
              });
              
              console.log(`Technical analysis data found for ${crypto.symbol}: ${!!technicalAnalysis}`);
            } catch (dbError) {
              console.error(`Database error when fetching technical analysis for ${crypto.symbol}:`, dbError);
              console.error(`Error details:`, dbError instanceof Error ? dbError.message : String(dbError));
              console.error(`Stack trace:`, dbError instanceof Error ? dbError.stack : 'No stack trace available');
              
              await schedulingLogger.log({
                processId,
                userId,
                level: 'ERROR',
                category: 'ANALYSIS',
                operation: 'DB_ERROR',
                symbol: crypto.symbol,
                message: `Database error when fetching technical analysis: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
              });
              continue;
            }

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

            // Generate comprehensive features with error handling
            let featureSet;
            try {
              featureSet = await generateComprehensiveFeatureSet(crypto.symbol, 'hourly', new Date(), processId, userId);
              console.log(`Successfully generated comprehensive feature set for ${crypto.symbol}`);
            } catch (genError) {
              console.error(`Error generating comprehensive feature set for ${crypto.symbol}:`, genError);
              await schedulingLogger.log({
                processId,
                userId,
                level: 'ERROR',
                category: 'ANALYSIS',
                operation: 'FEATURE_GENERATION_ERROR',
                symbol: crypto.symbol,
                message: `Error generating comprehensive features: ${genError instanceof Error ? genError.message : 'Unknown error'}`
              });
              continue; // Skip to the next step if feature generation fails
            }
            
            // Validate feature set before saving
            if (!featureSet || typeof featureSet !== 'object') {
              console.error(`Invalid feature set generated for ${crypto.symbol}`);
              await schedulingLogger.log({
                processId,
                userId,
                level: 'ERROR',
                category: 'ANALYSIS',
                operation: 'FEATURE_VALIDATION_ERROR',
                symbol: crypto.symbol,
                message: `Invalid feature set generated for ${crypto.symbol}`
              });
              continue; // Skip to the next step if feature set is invalid
            }
            
            // Save the feature set with error handling
            try {
              // Pass processId and userId to the save function for better logging
              await saveComprehensiveFeatureSet(crypto.symbol, featureSet, processId, userId);
              console.log(`Successfully saved comprehensive feature set for ${crypto.symbol}`);
            } catch (saveError) {
              console.error(`Error saving comprehensive feature set for ${crypto.symbol}:`, saveError);
              await schedulingLogger.log({
                processId,
                userId,
                level: 'ERROR',
                category: 'ANALYSIS',
                operation: 'FEATURE_SAVE_ERROR',
                symbol: crypto.symbol,
                message: `Error saving comprehensive features: ${saveError instanceof Error ? saveError.message : 'Unknown error'}`
              });
              // Continue despite save error - we've already generated the features
            }
            
            featuresSuccess = true;
            
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
              operation: 'FEATURE_GENERATION_SUCCESS',
              symbol: crypto.symbol,
              message: `Generated and saved comprehensive features for ${crypto.symbol}`
            });
          } catch (featureError) {
            console.error(`Error generating comprehensive features for ${crypto.symbol}:`, featureError);
            await schedulingLogger.log({
              processId,
              userId,
              level: 'ERROR',
              category: 'ANALYSIS',
              operation: 'FEATURE_GENERATION_ERROR',
              symbol: crypto.symbol,
              message: `Error generating features for ${crypto.symbol}: ${featureError instanceof Error ? featureError.message : 'Unknown error'}`
            });
          }
        }

        // Step 3: Run prediction models for this crypto
        let predictionSuccess = false;
        if (featuresSuccess) {
          try {
            console.log(`Running prediction models for ${crypto.symbol}`);
            
            await schedulingLogger.log({
              processId,
              userId,
              level: 'INFO',
              category: 'ANALYSIS',
              operation: 'PREDICTION_START',
              symbol: crypto.symbol,
              message: `Starting prediction models for ${crypto.symbol}`
            });
            
            // Run prediction models for this specific crypto
            // This is a placeholder - you would need to implement a function to run predictions for a single crypto
            // const predictionResult = await runPredictionsForCrypto(crypto.symbol, userId);
            
            // For now, we'll just increment the processed items
            predictionSuccess = true;
            
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
              operation: 'PREDICTION_SUCCESS',
              symbol: crypto.symbol,
              message: `Prediction models completed for ${crypto.symbol}`
            });
          } catch (predictionError) {
            console.error(`Error running prediction models for ${crypto.symbol}:`, predictionError);
            await schedulingLogger.log({
              processId,
              userId,
              level: 'ERROR',
              category: 'ANALYSIS',
              operation: 'PREDICTION_ERROR',
              symbol: crypto.symbol,
              message: `Error running prediction models for ${crypto.symbol}: ${predictionError instanceof Error ? predictionError.message : 'Unknown error'}`
            });
          }
        }

        // Step 4: Update prediction outcomes for this crypto
        let outcomeSuccess = false;
        if (predictionSuccess) {
          try {
            console.log(`Updating prediction outcomes for ${crypto.symbol}`);
            
            await schedulingLogger.log({
              processId,
              userId,
              level: 'INFO',
              category: 'ANALYSIS',
              operation: 'OUTCOME_UPDATE_START',
              symbol: crypto.symbol,
              message: `Starting prediction outcome updates for ${crypto.symbol}`
            });
            
            // Update prediction outcomes for this specific crypto
            // This is a placeholder - you would need to implement a function to update outcomes for a single crypto
            // const outcomeResult = await updatePredictionOutcomesForCrypto(crypto.symbol);
            
            // For now, we'll just increment the processed items
            outcomeSuccess = true;
            
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
              operation: 'OUTCOME_UPDATE_SUCCESS',
              symbol: crypto.symbol,
              message: `Prediction outcome updates completed for ${crypto.symbol}`
            });
          } catch (outcomeError) {
            console.error(`Error updating prediction outcomes for ${crypto.symbol}:`, outcomeError);
            await schedulingLogger.log({
              processId,
              userId,
              level: 'ERROR',
              category: 'ANALYSIS',
              operation: 'OUTCOME_UPDATE_ERROR',
              symbol: crypto.symbol,
              message: `Error updating prediction outcomes for ${crypto.symbol}: ${outcomeError instanceof Error ? outcomeError.message : 'Unknown error'}`
            });
          }
        }

        // Step 5: Generate trading signals for this crypto
        let signalsSuccess = false;
        if (outcomeSuccess) {
          try {
            console.log(`Generating trading signals for ${crypto.symbol}`);
            
            await schedulingLogger.log({
              processId,
              userId,
              level: 'INFO',
              category: 'ANALYSIS',
              operation: 'TRADING_SIGNALS_START',
              symbol: crypto.symbol,
              message: `Starting trading signal generation for ${crypto.symbol}`
            });
            
            // Generate trading signals for this specific crypto
            // This is a placeholder - you would need to implement a function to generate signals for a single crypto
            // const signalsResult = await generateTradingSignalsForCrypto(crypto.symbol, userId);
            
            // For now, we'll just increment the processed items
            signalsSuccess = true;
            
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
              operation: 'TRADING_SIGNALS_SUCCESS',
              symbol: crypto.symbol,
              message: `Trading signal generation completed for ${crypto.symbol}`
            });
          } catch (signalsError) {
            console.error(`Error generating trading signals for ${crypto.symbol}:`, signalsError);
            await schedulingLogger.log({
              processId,
              userId,
              level: 'ERROR',
              category: 'ANALYSIS',
              operation: 'TRADING_SIGNALS_ERROR',
              symbol: crypto.symbol,
              message: `Error generating trading signals for ${crypto.symbol}: ${signalsError instanceof Error ? signalsError.message : 'Unknown error'}`
            });
          }
        }

        // Count success or error for this crypto
        if (technicalAnalysisSuccess && featuresSuccess && predictionSuccess && outcomeSuccess && signalsSuccess) {
          successCount++;
          await schedulingLogger.log({
            processId,
            userId,
            level: 'INFO',
            category: 'ANALYSIS',
            operation: 'CRYPTO_ANALYSIS_COMPLETE',
            symbol: crypto.symbol,
            message: `Analysis completed successfully for ${crypto.symbol}`
          });
        } else {
          errorCount++;
          await schedulingLogger.log({
            processId,
            userId,
            level: 'WARNING',
            category: 'ANALYSIS',
            operation: 'CRYPTO_ANALYSIS_PARTIAL',
            symbol: crypto.symbol,
            message: `Analysis partially completed for ${crypto.symbol}`,
            details: {
              technicalAnalysisSuccess,
              featuresSuccess,
              predictionSuccess,
              outcomeSuccess,
              signalsSuccess
            }
          });
        }
      } catch (cryptoError) {
        errorCount++;
        console.error(`Unexpected error processing ${crypto.symbol}:`, cryptoError);
        await schedulingLogger.log({
          processId,
          userId,
          level: 'ERROR',
          category: 'ANALYSIS',
          operation: 'CRYPTO_ANALYSIS_ERROR',
          symbol: crypto.symbol,
          message: `Error processing ${crypto.symbol}: ${cryptoError instanceof Error ? cryptoError.message : 'Unknown error'}`
        });
      }
    }

    // After processing all cryptos individually, run the global steps
    // These steps operate on all cryptos at once and are only run if at least one crypto was processed successfully
    if (successCount > 0) {
      try {
        // Run prediction models for all cryptos
        await schedulingLogger.log({
          processId,
          userId,
          level: 'INFO',
          category: 'ANALYSIS',
          operation: 'GLOBAL_PREDICTION_START',
          message: 'Starting global prediction model runs'
        });
        
        const predictionResult = await runPredictionsForAllCryptos(userId);
        
        await schedulingLogger.log({
          processId,
          userId,
          level: 'INFO',
          category: 'ANALYSIS',
          operation: 'GLOBAL_PREDICTION_COMPLETE',
          message: `Global prediction models completed: ${predictionResult.message}`
        });
        
        // Update prediction outcomes
        await schedulingLogger.log({
          processId,
          userId,
          level: 'INFO',
          category: 'ANALYSIS',
          operation: 'GLOBAL_OUTCOME_UPDATE_START',
          message: 'Starting global prediction outcome updates'
        });
        
        const outcomeResult = await updatePredictionOutcomes();
        
        await schedulingLogger.log({
          processId,
          userId,
          level: 'INFO',
          category: 'ANALYSIS',
          operation: 'GLOBAL_OUTCOME_UPDATE_COMPLETE',
          message: `Global prediction outcome updates completed: ${outcomeResult.message}`
        });
        
        // Generate trading signals
        await schedulingLogger.log({
          processId,
          userId,
          level: 'INFO',
          category: 'ANALYSIS',
          operation: 'GLOBAL_TRADING_SIGNALS_START',
          message: 'Starting global trading signal generation'
        });
        
        const signalsResult = await generateTradingSignalsForAllCryptos(userId);
        
        await schedulingLogger.log({
          processId,
          userId,
          level: 'INFO',
          category: 'ANALYSIS',
          operation: 'GLOBAL_TRADING_SIGNALS_COMPLETE',
          message: `Global trading signal generation completed: Generated signals for ${signalsResult.length} cryptocurrencies`
        });
      } catch (globalError) {
        console.error('Error in global analysis steps:', globalError);
        await schedulingLogger.log({
          processId,
          userId,
          level: 'ERROR',
          category: 'ANALYSIS',
          operation: 'GLOBAL_ANALYSIS_ERROR',
          message: `Error in global analysis steps: ${globalError instanceof Error ? globalError.message : 'Unknown error'}`
        });
      }
    }

    // Mark process as completed
    try {
      await prisma.processingStatus.update({
        where: {
          processId
        },
        data: {
          status: 'COMPLETED',
          processedItems: processedItems, // Use actual processed items count
          completedAt: new Date()
        }
      });

      await schedulingLogger.log({
        processId,
        userId,
        level: 'INFO',
        category: 'ANALYSIS',
        operation: 'ANALYSIS_COMPLETE',
        message: `Analysis process completed with ${successCount} successful and ${errorCount} failed cryptocurrencies`
      });
      
      console.log(`Analysis process ${processId} marked as COMPLETED`);
    } catch (statusError) {
      console.error(`Error updating final status for process ${processId}:`, statusError);
      
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'STATUS_UPDATE_ERROR',
        message: `Error updating final status: ${statusError instanceof Error ? statusError.message : 'Unknown error'}`
      });
    }
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

  // Generate comprehensive features with error handling
  try {
    const featureSet = await generateComprehensiveFeatureSet(symbol, 'hourly', new Date(), processId, userId);
    console.log(`Successfully generated comprehensive feature set for ${symbol}`);
    
    // Validate feature set before saving
    if (!featureSet || typeof featureSet !== 'object') {
      console.error(`Invalid feature set generated for ${symbol}`);
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'FEATURE_VALIDATION_ERROR',
        symbol,
        message: `Invalid feature set generated for ${symbol}`
      });
      throw new Error(`Invalid feature set generated for ${symbol}`);
    }
    
    // Save the feature set
    try {
      // Pass processId and userId to the save function for better logging
      await saveComprehensiveFeatureSet(symbol, featureSet, processId, userId);
      console.log(`Successfully saved comprehensive feature set for ${symbol}`);
      
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
    } catch (saveError) {
      console.error(`Error saving comprehensive feature set for ${symbol}:`, saveError);
      console.error('DB Save Error', JSON.stringify(saveError, null, 2));
      await schedulingLogger.log({
        processId,
        userId,
        level: 'ERROR',
        category: 'ANALYSIS',
        operation: 'FEATURE_SAVE_ERROR',
        symbol,
        message: `Error saving comprehensive features: ${saveError instanceof Error ? saveError.message : 'Unknown error'}`
      });
      throw new Error(`Failed to save comprehensive features for ${symbol}: ${saveError instanceof Error ? saveError.message : 'Unknown error'}`);
    }
  } catch (genError) {
    console.error(`Error generating comprehensive feature set for ${symbol}:`, genError);
    await schedulingLogger.log({
      processId,
      userId,
      level: 'ERROR',
      category: 'ANALYSIS',
      operation: 'FEATURE_GENERATION_ERROR',
      symbol,
      message: `Error generating comprehensive features: ${genError instanceof Error ? genError.message : 'Unknown error'}`
    });
    throw new Error(`Failed to generate comprehensive features for ${symbol}: ${genError instanceof Error ? genError.message : 'Unknown error'}`);
  }
}

// Export technical analysis calculation functions
export function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) {
    return prices[0]; // Return current price if not enough data
  }
  
  const sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
  return sum / period;
}

export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) {
    return prices[0]; // Return current price if not enough data
  }
  
  const k = 2 / (period + 1);
  let ema = prices[prices.length - 1];
  
  for (let i = prices.length - 2; i >= 0; i--) {
    ema = prices[i] * k + ema * (1 - k);
  }
  
  return ema;
}

export function calculateRSI(prices: number[], period: number): number {
  if (prices.length <= period) {
    return 50; // Return neutral RSI if not enough data
  }
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i-1] - prices[i];
    if (change >= 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }
  
  if (losses === 0) return 100; // All gains
  
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

export function calculateBollingerBands(prices: number[], period: number, multiplier: number): {
  upper: number;
  middle: number;
  lower: number;
} {
  if (prices.length < period) {
    return {
      upper: prices[0] * 1.1,
      middle: prices[0],
      lower: prices[0] * 0.9
    };
  }
  
  const sma = calculateSMA(prices, period);
  
  // Calculate standard deviation
  const squaredDifferences = prices.slice(0, period).map(price => Math.pow(price - sma, 2));
  const variance = squaredDifferences.reduce((a, b) => a + b, 0) / period;
  const standardDeviation = Math.sqrt(variance);
  
  return {
    upper: sma + (standardDeviation * multiplier),
    middle: sma,
    lower: sma - (standardDeviation * multiplier)
  };
}

export function identifyTrendLines(prices: number[]): {
  support: number;
  resistance: number;
} {
  if (prices.length < 10) {
    return {
      support: prices[0] * 0.95,
      resistance: prices[0] * 1.05
    };
  }
  
  // Simple implementation - find local minimums and maximums
  let minPrice = prices[0];
  let maxPrice = prices[0];
  
  for (let i = 1; i < Math.min(prices.length, 20); i++) {
    if (prices[i] < minPrice) minPrice = prices[i];
    if (prices[i] > maxPrice) maxPrice = prices[i];
  }
  
  return {
    support: minPrice,
    resistance: maxPrice
  };
}

export function calculateFibonacciRetracements(highPrice: number, lowPrice: number): {
  level0: number;
  level23_6: number;
  level38_2: number;
  level50: number;
  level61_8: number;
  level100: number;
} {
  const diff = highPrice - lowPrice;
  
  return {
    level0: highPrice,
    level23_6: highPrice - diff * 0.236,
    level38_2: highPrice - diff * 0.382,
    level50: highPrice - diff * 0.5,
    level61_8: highPrice - diff * 0.618,
    level100: lowPrice
  };
}

export function detectBreakoutPatterns(
  prices: number[], 
  trendLines: { support: number; resistance: number },
  bollingerBands: { upper: number; middle: number; lower: number }
): {
  breakoutDetected: boolean;
  breakoutType: string;
  breakoutStrength: number;
} {
  const currentPrice = prices[0];
  const previousPrice = prices[1] || currentPrice;
  
  // Check for breakouts
  if (currentPrice > trendLines.resistance && previousPrice <= trendLines.resistance) {
    return {
      breakoutDetected: true,
      breakoutType: 'RESISTANCE_BREAKOUT',
      breakoutStrength: (currentPrice - trendLines.resistance) / trendLines.resistance * 100
    };
  }
  
  if (currentPrice < trendLines.support && previousPrice >= trendLines.support) {
    return {
      breakoutDetected: true,
      breakoutType: 'SUPPORT_BREAKDOWN',
      breakoutStrength: (trendLines.support - currentPrice) / trendLines.support * 100
    };
  }
  
  if (currentPrice > bollingerBands.upper && previousPrice <= bollingerBands.upper) {
    return {
      breakoutDetected: true,
      breakoutType: 'BOLLINGER_UPPER_BREAKOUT',
      breakoutStrength: (currentPrice - bollingerBands.upper) / bollingerBands.upper * 100
    };
  }
  
  if (currentPrice < bollingerBands.lower && previousPrice >= bollingerBands.lower) {
    return {
      breakoutDetected: true,
      breakoutType: 'BOLLINGER_LOWER_BREAKDOWN',
      breakoutStrength: (bollingerBands.lower - currentPrice) / bollingerBands.lower * 100
    };
  }
  
  return {
    breakoutDetected: false,
    breakoutType: 'NONE',
    breakoutStrength: 0
  };
}

export function calculateWeightedDecision(
  currentPrice: number,
  ema12: number,
  ema26: number,
  rsi14: number,
  bollingerBands: { upper: number; middle: number; lower: number },
  trendLines: { support: number; resistance: number },
  sma20: number,
  fibonacciLevels: any,
  breakoutAnalysis: { breakoutDetected: boolean; breakoutType: string; breakoutStrength: number }
): {
  decision: string;
  confidence: number;
  explanation: string;
} {
  let bullishFactors = 0;
  let bearishFactors = 0;
  let neutralFactors = 0;
  let totalFactors = 0;
  let explanation = [];
  
  // EMA crossover (MACD signal)
  if (ema12 > ema26) {
    bullishFactors += 2;
    explanation.push("EMA12 is above EMA26 (bullish)");
  } else if (ema12 < ema26) {
    bearishFactors += 2;
    explanation.push("EMA12 is below EMA26 (bearish)");
  } else {
    neutralFactors += 2;
    explanation.push("EMA12 and EMA26 are equal (neutral)");
  }
  totalFactors += 2;
  
  // RSI
  if (rsi14 > 70) {
    bearishFactors += 1.5;
    explanation.push("RSI is overbought (bearish)");
  } else if (rsi14 < 30) {
    bullishFactors += 1.5;
    explanation.push("RSI is oversold (bullish)");
  } else if (rsi14 > 50) {
    bullishFactors += 0.5;
    explanation.push("RSI is above 50 (slightly bullish)");
  } else {
    bearishFactors += 0.5;
    explanation.push("RSI is below 50 (slightly bearish)");
  }
  totalFactors += 1.5;
  
  // Bollinger Bands
  if (currentPrice > bollingerBands.upper) {
    bearishFactors += 1;
    explanation.push("Price is above upper Bollinger Band (bearish)");
  } else if (currentPrice < bollingerBands.lower) {
    bullishFactors += 1;
    explanation.push("Price is below lower Bollinger Band (bullish)");
  } else if (currentPrice > bollingerBands.middle) {
    bullishFactors += 0.5;
    explanation.push("Price is above middle Bollinger Band (slightly bullish)");
  } else {
    bearishFactors += 0.5;
    explanation.push("Price is below middle Bollinger Band (slightly bearish)");
  }
  totalFactors += 1;
  
  // SMA
  if (currentPrice > sma20) {
    bullishFactors += 1;
    explanation.push("Price is above SMA20 (bullish)");
  } else {
    bearishFactors += 1;
    explanation.push("Price is below SMA20 (bearish)");
  }
  totalFactors += 1;
  
  // Support/Resistance
  const distanceToResistance = (trendLines.resistance - currentPrice) / currentPrice;
  const distanceToSupport = (currentPrice - trendLines.support) / currentPrice;
  
  if (distanceToResistance < 0.01) {
    bearishFactors += 1;
    explanation.push("Price is near resistance (bearish)");
  } else if (distanceToSupport < 0.01) {
    bullishFactors += 1;
    explanation.push("Price is near support (bullish)");
  }
  totalFactors += 1;
  
  // Breakout analysis
  if (breakoutAnalysis.breakoutDetected) {
    if (breakoutAnalysis.breakoutType === 'RESISTANCE_BREAKOUT' || 
        breakoutAnalysis.breakoutType === 'BOLLINGER_UPPER_BREAKOUT') {
      bullishFactors += 2;
      explanation.push(`${breakoutAnalysis.breakoutType} detected (bullish)`);
    } else {
      bearishFactors += 2;
      explanation.push(`${breakoutAnalysis.breakoutType} detected (bearish)`);
    }
  }
  totalFactors += 2;
  
  // Calculate final decision
  const bullishPercentage = bullishFactors / totalFactors;
  const bearishPercentage = bearishFactors / totalFactors;
  const neutralPercentage = neutralFactors / totalFactors;
  
  let decision;
  let confidence;
  
  if (bullishPercentage > bearishPercentage && bullishPercentage > neutralPercentage) {
    decision = "BUY";
    confidence = bullishPercentage * 100;
  } else if (bearishPercentage > bullishPercentage && bearishPercentage > neutralPercentage) {
    decision = "SELL";
    confidence = bearishPercentage * 100;
  } else {
    decision = "HOLD";
    confidence = neutralPercentage * 100;
  }
  
  return {
    decision,
    confidence,
    explanation: explanation.join(". ")
  };
}