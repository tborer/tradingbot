import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { logScheduling, logAnalysis } from '@/lib/schedulingLogger';
import { 
  calculateDerivedIndicators 
} from '@/lib/derivedIndicatorsUtils';
import { 
  generateTemporalFeatures, 
  saveTemporalFeatures 
} from '@/lib/temporalFeaturesUtils';
import { 
  generatePatternEncodings, 
  savePatternEncodings 
} from '@/lib/patternEncodingsUtils';
import { 
  generateComprehensiveFeatureSet, 
  saveComprehensiveFeatureSet 
} from '@/lib/comprehensiveFeatureUtils';

// Set a timeout for API requests to prevent function timeout errors
const API_TIMEOUT = 50000; // 50 seconds

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the user from the session
  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Clean up any stale processing statuses before starting a new operation
    const { cleanupStaleProcessingStatuses } = require('@/lib/dataSchedulingService');
    await cleanupStaleProcessingStatuses(user.id);
    
    // Get user's cryptos to use for analysis
    const userCryptos = await prisma.crypto.findMany({
      where: { userId: user.id },
      select: { symbol: true },
    });

    if (userCryptos.length === 0) {
      return res.status(400).json({ 
        error: 'No cryptocurrencies found in your portfolio. Please add some on the dashboard first.' 
      });
    }

    // Create a processing status record
    const processId = `analysis-run-${Date.now()}`;
    await prisma.processingStatus.create({
      data: {
        processId,
        userId: user.id,
        status: 'RUNNING',
        type: 'ANALYSIS',
        totalItems: userCryptos.length,
        processedItems: 0,
        details: {},
        startedAt: new Date()
      }
    });

    // Start the background processing without awaiting it
    (async () => {
      try {
        await logScheduling({
          processId,
          userId: user.id,
          operation: 'ANALYSIS_BACKGROUND_START',
          message: 'Starting background processing of analysis operation'
        });
        
        // Process all cryptos in batches
        const cryptoSymbols = userCryptos.map(c => c.symbol);
        const batchSize = 5;
        
        await logScheduling({
          processId,
          userId: user.id,
          operation: 'ANALYSIS_BATCH_CONFIGURATION',
          message: `Configured batch processing with batch size ${batchSize}`,
          details: { 
            totalCryptos: cryptoSymbols.length,
            batchSize,
            totalBatches: Math.ceil(cryptoSymbols.length / batchSize)
          }
        });
        
        for (let i = 0; i < cryptoSymbols.length; i += batchSize) {
          const batchSymbols = cryptoSymbols.slice(i, i + batchSize);
          const batchNumber = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(cryptoSymbols.length / batchSize);
          
          await logScheduling({
            processId,
            userId: user.id,
            operation: 'ANALYSIS_BATCH_START',
            message: `Starting batch ${batchNumber} of ${totalBatches}`,
            details: { 
              batchNumber,
              totalBatches,
              symbols: batchSymbols,
              progress: `${Math.round((i / cryptoSymbols.length) * 100)}%`
            }
          });
          
          // Update processing status
          await prisma.processingStatus.update({
            where: { processId },
            data: {
              processedItems: i,
              updatedAt: new Date()
            }
          });
          
          // Process each symbol in the batch
          await Promise.all(batchSymbols.map(async (symbol) => {
            try {
              await runAnalysisForSymbol(symbol, processId, user.id);
              
              // Update the details in the processing status
              await prisma.processingStatus.update({
                where: { processId },
                data: {
                  details: {
                    update: {
                      [symbol]: {
                        success: true,
                        completedAt: new Date()
                      }
                    }
                  }
                }
              });
            } catch (error) {
              console.error(`Error processing analysis for ${symbol}:`, error);
              
              await logAnalysis({
                processId,
                userId: user.id,
                symbol,
                operation: 'ANALYSIS_ERROR',
                analysisType: 'ALL',
                success: false,
                error
              });
              
              // Update the details in the processing status
              await prisma.processingStatus.update({
                where: { processId },
                data: {
                  details: {
                    update: {
                      [symbol]: {
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                        completedAt: new Date()
                      }
                    }
                  }
                }
              });
            }
          }));
          
          // Update processing status again after batch is complete
          await prisma.processingStatus.update({
            where: { processId },
            data: {
              processedItems: i + batchSymbols.length,
              updatedAt: new Date()
            }
          });
          
          await logScheduling({
            processId,
            userId: user.id,
            operation: 'ANALYSIS_BATCH_COMPLETE',
            message: `Completed batch ${batchNumber} of ${totalBatches}`,
            details: { 
              batchNumber,
              totalBatches,
              progress: `${Math.round(((i + batchSize) / cryptoSymbols.length) * 100)}%`
            }
          });
          
          // Add a small delay between batches
          if (i + batchSize < cryptoSymbols.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        // Update process status to completed
        await prisma.processingStatus.update({
          where: { processId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            processedItems: cryptoSymbols.length
          }
        });
        
        await logScheduling({
          processId,
          userId: user.id,
          operation: 'ANALYSIS_BACKGROUND_COMPLETE',
          message: 'Background analysis processing completed successfully',
          details: { 
            totalProcessed: cryptoSymbols.length,
            duration: `${Math.round((Date.now() - new Date(processId.split('-')[2]).getTime()) / 1000)} seconds`
          }
        });
      } catch (error) {
        console.error('Background analysis processing error:', error);
        
        await logScheduling({
          processId,
          userId: user.id,
          operation: 'ANALYSIS_BACKGROUND_ERROR',
          message: 'Error in background analysis processing',
          error
        });
        
        // Update process status to failed
        await prisma.processingStatus.update({
          where: { processId },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message : String(error),
            completedAt: new Date()
          }
        });
      }
    })();

    // Return immediately with a 202 Accepted status
    return res.status(202).json({ 
      success: true,
      message: 'Analysis operation started in the background. This may take several minutes to complete.',
      inProgress: true,
      processId
    });
  } catch (error) {
    console.error('Error starting analysis operation:', error);
    return res.status(500).json({ 
      error: 'Failed to start analysis operation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Run all analysis steps for a single symbol
 */
async function runAnalysisForSymbol(
  symbol: string,
  processId: string,
  userId: string
): Promise<void> {
  // Get the most recent technical analysis for this symbol
  const technicalAnalysis = await prisma.technicalAnalysisOutput.findFirst({
    where: { symbol },
    orderBy: { id: 'desc' }
  });

  if (!technicalAnalysis) {
    throw new Error(`No technical analysis data found for ${symbol}`);
  }

  // Track which steps completed successfully
  const completedSteps = {
    derivedIndicators: false,
    temporalFeatures: false,
    patternEncodings: false,
    comprehensiveFeatures: false
  };

  // Calculate and store derived indicators
  try {
    await logAnalysis({
      processId,
      userId,
      symbol,
      operation: 'DERIVED_INDICATORS_START',
      analysisType: 'DERIVED',
      details: { technicalAnalysisId: technicalAnalysis.id }
    });
    
    const technicalAnalysisWithPrevious = {
      ...technicalAnalysis,
      rawData: {
        ...technicalAnalysis.rawData,
        previousEma12: technicalAnalysis.rawData.previousEma12,
        previousEma26: technicalAnalysis.rawData.previousEma26
      }
    };
    
    const derivedIndicators = calculateDerivedIndicators(technicalAnalysisWithPrevious);
    
    await prisma.cryptoDerivedIndicators.create({
      data: {
        technicalAnalysisId: technicalAnalysis.id,
        symbol,
        timestamp: new Date(),
        trendStrength: derivedIndicators.trendStrength,
        volatilityRatio: derivedIndicators.volatilityRatio,
        rsiWithTrendContext: derivedIndicators.rsiWithTrendContext,
        maConvergence: derivedIndicators.maConvergence,
        nearestSupportDistance: derivedIndicators.nearestSupportDistance,
        nearestResistanceDistance: derivedIndicators.nearestResistanceDistance,
        fibConfluenceStrength: derivedIndicators.fibConfluenceStrength,
        bbPosition: derivedIndicators.bbPosition
      }
    });
    
    await logAnalysis({
      processId,
      userId,
      symbol,
      operation: 'DERIVED_INDICATORS_COMPLETE',
      analysisType: 'DERIVED',
      success: true
    });
    
    completedSteps.derivedIndicators = true;
  } catch (error) {
    console.error(`Error calculating derived indicators for ${symbol}:`, error);
    
    await logAnalysis({
      processId,
      userId,
      symbol,
      operation: 'DERIVED_INDICATORS_ERROR',
      analysisType: 'DERIVED',
      success: false,
      error
    });
    // Continue with other steps even if this one fails
  }
  
  // Generate and store temporal features
  try {
    await logAnalysis({
      processId,
      userId,
      symbol,
      operation: 'TEMPORAL_FEATURES_START',
      analysisType: 'TEMPORAL'
    });
    
    const now = new Date();
    const temporalFeatures = await generateTemporalFeatures(symbol, now);
    await saveTemporalFeatures(symbol, temporalFeatures);
    
    await logAnalysis({
      processId,
      userId,
      symbol,
      operation: 'TEMPORAL_FEATURES_COMPLETE',
      analysisType: 'TEMPORAL',
      success: true
    });
    
    completedSteps.temporalFeatures = true;
  } catch (error) {
    console.error(`Error generating temporal features for ${symbol}:`, error);
    
    await logAnalysis({
      processId,
      userId,
      symbol,
      operation: 'TEMPORAL_FEATURES_ERROR',
      analysisType: 'TEMPORAL',
      success: false,
      error
    });
    // Continue with other steps even if this one fails
  }
  
  // Generate and store pattern encodings
  try {
    await logAnalysis({
      processId,
      userId,
      symbol,
      operation: 'PATTERN_ENCODINGS_START',
      analysisType: 'PATTERN'
    });
    
    const now = new Date();
    const patternEncodings = await generatePatternEncodings(symbol, now);
    await savePatternEncodings(symbol, patternEncodings);
    
    await logAnalysis({
      processId,
      userId,
      symbol,
      operation: 'PATTERN_ENCODINGS_COMPLETE',
      analysisType: 'PATTERN',
      success: true
    });
    
    completedSteps.patternEncodings = true;
  } catch (error) {
    console.error(`Error generating pattern encodings for ${symbol}:`, error);
    
    await logAnalysis({
      processId,
      userId,
      symbol,
      operation: 'PATTERN_ENCODINGS_ERROR',
      analysisType: 'PATTERN',
      success: false,
      error
    });
    // Continue with other steps even if this one fails
  }
  
  // Generate and store comprehensive feature set
  try {
    await logAnalysis({
      processId,
      userId,
      symbol,
      operation: 'COMPREHENSIVE_FEATURES_START',
      analysisType: 'COMPREHENSIVE'
    });
    
    const now = new Date();
    const comprehensiveFeatures = await generateComprehensiveFeatureSet(symbol, 'hourly', now);
    await saveComprehensiveFeatureSet(symbol, comprehensiveFeatures);
    
    await logAnalysis({
      processId,
      userId,
      symbol,
      operation: 'COMPREHENSIVE_FEATURES_COMPLETE',
      analysisType: 'COMPREHENSIVE',
      success: true
    });
    
    completedSteps.comprehensiveFeatures = true;
  } catch (error) {
    console.error(`Error generating comprehensive features for ${symbol}:`, error);
    
    await logAnalysis({
      processId,
      userId,
      symbol,
      operation: 'COMPREHENSIVE_FEATURES_ERROR',
      analysisType: 'COMPREHENSIVE',
      success: false,
      error
    });
  }
  
  // Determine overall success based on completed steps
  const allStepsCompleted = Object.values(completedSteps).every(step => step);
  const someStepsCompleted = Object.values(completedSteps).some(step => step);
  
  if (!someStepsCompleted) {
    throw new Error(`Failed to complete any analysis steps for ${symbol}`);
  }
}

// Configure the API route
export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
  },
};