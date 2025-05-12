import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { fetchAndStoreHourlyCryptoData, cleanupOldData, processCryptoBatch } from '@/lib/dataSchedulingService';
import { logScheduling } from '@/lib/schedulingLogger';

// Set a timeout for API requests to prevent function timeout errors
const API_TIMEOUT = 50000; // 50 seconds - increased from 30 seconds

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
    
    // Determine which operation to run
    const { operation } = req.body;

    if (operation === 'fetch') {
      // Start the data collection process in the background
      try {
        // Get user's cryptos to use for data collection
        const userCryptos = await prisma.crypto.findMany({
          where: { userId: user.id },
          select: { symbol: true },
        });

        if (userCryptos.length === 0) {
          return res.status(400).json({ 
            error: 'No cryptocurrencies found in your portfolio. Please add some on the dashboard first.' 
          });
        }

        // Get the user's data scheduling settings
        const settings = await prisma.dataScheduling.findUnique({
          where: { userId: user.id },
        });

        if (!settings) {
          return res.status(404).json({ error: 'Data scheduling settings not found' });
        }

        // Create a processing status record
        const processId = `data-fetch-${Date.now()}`;
        await prisma.processingStatus.create({
          data: {
            processId,
            userId: user.id,
            status: 'RUNNING',
            type: 'DATA_SCHEDULING',
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
              operation: 'BACKGROUND_PROCESSING_START',
              message: 'Starting background processing of data fetch operation'
            });
            
            // Process all cryptos in batches
            const cryptoSymbols = userCryptos.map(c => c.symbol);
            const batchSize = 5;
            
            await logScheduling({
              processId,
              userId: user.id,
              operation: 'BATCH_CONFIGURATION',
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
                operation: 'BATCH_START',
                message: `Starting batch ${batchNumber} of ${totalBatches}`,
                details: { 
                  batchNumber,
                  totalBatches,
                  symbols: batchSymbols,
                  progress: `${Math.round((i / cryptoSymbols.length) * 100)}%`
                }
              });
              
              // Update processing status with the current progress
              await prisma.processingStatus.update({
                where: { processId },
                data: {
                  processedItems: i,
                  updatedAt: new Date()
                }
              });
              
              // Process batch and get results - only fetch data, don't run analysis
              const batchResults = await processCryptoBatch(
                user.id,
                batchSymbols,
                settings.apiUrl,
                settings.apiToken,
                settings.limit,
                false, // Don't run analysis here, it will be done separately
                processId
              );
              
              // Update processing status again after batch is complete
              // This ensures the progress bar updates correctly
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
                operation: 'BATCH_COMPLETE',
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
              operation: 'BACKGROUND_PROCESSING_COMPLETE',
              message: 'Background processing completed successfully',
              details: { 
                totalProcessed: cryptoSymbols.length,
                duration: `${Math.round((Date.now() - new Date(processId.split('-')[1]).getTime()) / 1000)} seconds`
              }
            });
          } catch (error) {
            console.error('Background processing error:', error);
            
            await logScheduling({
              processId,
              userId: user.id,
              operation: 'BACKGROUND_PROCESSING_ERROR',
              message: 'Error in background processing',
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
          message: 'Data fetch operation started in the background. This may take several minutes to complete.',
          inProgress: true,
          processId
        });
      } catch (error) {
        console.error('Error starting data fetch operation:', error);
        throw error;
      }
    } else if (operation === 'cleanup') {
      // Run the data cleanup process
      const result = await cleanupOldData(user.id);
      return res.status(result.success ? 200 : 500).json(result);
    } else if (operation === 'both') {
      // Start the data collection process in the background
      try {
        // Get user's cryptos to use for data collection
        const userCryptos = await prisma.crypto.findMany({
          where: { userId: user.id },
          select: { symbol: true },
        });

        if (userCryptos.length === 0) {
          return res.status(400).json({ 
            error: 'No cryptocurrencies found in your portfolio. Please add some on the dashboard first.' 
          });
        }

        // Get the user's data scheduling settings
        const settings = await prisma.dataScheduling.findUnique({
          where: { userId: user.id },
        });

        if (!settings) {
          return res.status(404).json({ error: 'Data scheduling settings not found' });
        }

        // Create a processing status record
        const processId = `data-fetch-${Date.now()}`;
        await prisma.processingStatus.create({
          data: {
            processId,
            userId: user.id,
            status: 'RUNNING',
            type: 'DATA_SCHEDULING',
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
              operation: 'BACKGROUND_PROCESSING_START',
              message: 'Starting background processing of data fetch operation (with cleanup)'
            });
            
            // Process all cryptos in batches
            const cryptoSymbols = userCryptos.map(c => c.symbol);
            const batchSize = 5;
            
            await logScheduling({
              processId,
              userId: user.id,
              operation: 'BATCH_CONFIGURATION',
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
                operation: 'BATCH_START',
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
              
              // Process batch - only fetch data, don't run analysis
              const batchResults = await processCryptoBatch(
                user.id,
                batchSymbols,
                settings.apiUrl,
                settings.apiToken,
                settings.limit,
                false, // Don't run analysis here, it will be done separately
                processId
              );
              
              // Update processing status again after batch is complete
              // This ensures the progress bar updates correctly
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
                operation: 'BATCH_COMPLETE',
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
              operation: 'BACKGROUND_PROCESSING_COMPLETE',
              message: 'Background processing completed successfully',
              details: { 
                totalProcessed: cryptoSymbols.length,
                duration: `${Math.round((Date.now() - new Date(processId.split('-')[1]).getTime()) / 1000)} seconds`
              }
            });
          } catch (error) {
            console.error('Background processing error:', error);
            
            await logScheduling({
              processId,
              userId: user.id,
              operation: 'BACKGROUND_PROCESSING_ERROR',
              message: 'Error in background processing',
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

        // Run the cleanup process immediately
        const cleanupResult = await cleanupOldData(user.id);

        // Return immediately with a 202 Accepted status for the fetch operation
        // and the result of the cleanup operation
        return res.status(202).json({
          fetch: {
            success: true,
            message: 'Data fetch operation started in the background. This may take several minutes to complete.',
            inProgress: true,
            processId
          },
          cleanup: cleanupResult,
          success: cleanupResult.success,
          partialResults: true
        });
      } catch (error) {
        console.error('Error starting data fetch operation:', error);
        throw error;
      }
    } else {
      return res.status(400).json({ error: 'Invalid operation. Expected "fetch", "cleanup", or "both".' });
    }
  } catch (error) {
    console.error('Error running data scheduling operation:', error);
    return res.status(500).json({ 
      error: 'Failed to run data scheduling operation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Configure the API route
export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
  },
};