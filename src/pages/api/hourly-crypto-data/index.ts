import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get the user from the session
  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Handle GET request to fetch hourly crypto data
  if (req.method === 'GET') {
    try {
      const { instrument, limit = '100', fromTimestamp, toTimestamp } = req.query;
      
      // Build the query
      let query: any = {
        orderBy: {
          timestamp: 'desc',
        },
        take: parseInt(limit as string) || 100,
      };
      
      // Add instrument filter if provided
      if (instrument) {
        query.where = {
          ...query.where,
          instrument: instrument as string,
        };
      }
      
      // Add timestamp range filters if provided
      if (fromTimestamp || toTimestamp) {
        query.where = {
          ...query.where,
          timestamp: {
            ...(fromTimestamp && { gte: BigInt(fromTimestamp as string) }),
            ...(toTimestamp && { lte: BigInt(toTimestamp as string) }),
          },
        };
      }
      
      const data = await prisma.hourlyCryptoHistoricalData.findMany(query);
      
      return res.status(200).json(data);
    } catch (error) {
      console.error('Error fetching hourly crypto data:', error);
      return res.status(500).json({ error: 'Failed to fetch hourly crypto data' });
    }
  }

  // Handle POST request to save hourly crypto data
  if (req.method === 'POST') {
    try {
      const { data } = req.body;
      
      if (!data || !Array.isArray(data)) {
        return res.status(400).json({ error: 'Invalid data format. Expected an array of hourly crypto data.' });
      }
      
      // Process and save each data entry
      const savedData = await Promise.all(
        data.map(async (entry) => {
          // Validate required fields
          if (!entry.TIMESTAMP || !entry.INSTRUMENT || !entry.MARKET) {
            return { error: 'Missing required fields', entry };
          }
          
          try {
            return await prisma.hourlyCryptoHistoricalData.create({
              data: {
                unit: entry.UNIT,
                timestamp: BigInt(entry.TIMESTAMP),
                type: entry.TYPE,
                market: entry.MARKET,
                instrument: entry.INSTRUMENT,
                open: entry.OPEN,
                high: entry.HIGH,
                low: entry.LOW,
                close: entry.CLOSE,
                firstMessageTimestamp: BigInt(entry.FIRST_MESSAGE_TIMESTAMP),
                lastMessageTimestamp: BigInt(entry.LAST_MESSAGE_TIMESTAMP),
                firstMessageValue: entry.FIRST_MESSAGE_VALUE,
                highMessageValue: entry.HIGH_MESSAGE_VALUE,
                highMessageTimestamp: BigInt(entry.HIGH_MESSAGE_TIMESTAMP),
                lowMessageValue: entry.LOW_MESSAGE_VALUE,
                lowMessageTimestamp: BigInt(entry.LOW_MESSAGE_TIMESTAMP),
                lastMessageValue: entry.LAST_MESSAGE_VALUE,
                totalIndexUpdates: entry.TOTAL_INDEX_UPDATES,
                volume: entry.VOLUME,
                quoteVolume: entry.QUOTE_VOLUME,
                volumeTopTier: entry.VOLUME_TOP_TIER,
                quoteVolumeTopTier: entry.QUOTE_VOLUME_TOP_TIER,
                volumeDirect: entry.VOLUME_DIRECT,
                quoteVolumeDirect: entry.QUOTE_VOLUME_DIRECT,
                volumeTopTierDirect: entry.VOLUME_TOP_TIER_DIRECT,
                quoteVolumeTopTierDirect: entry.QUOTE_VOLUME_TOP_TIER_DIRECT,
              },
            });
          } catch (error) {
            console.error('Error saving hourly crypto data entry:', error);
            return { error: 'Failed to save entry', entry };
          }
        })
      );
      
      return res.status(200).json({ success: true, data: savedData });
    } catch (error) {
      console.error('Error saving hourly crypto data:', error);
      return res.status(500).json({ error: 'Failed to save hourly crypto data' });
    }
  }

  // Handle DELETE request to clean up old data
  if (req.method === 'DELETE') {
    try {
      const { days } = req.query;
      
      if (!days || isNaN(Number(days))) {
        return res.status(400).json({ error: 'Invalid days parameter. Expected a number.' });
      }
      
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - Number(days));
      
      // Convert date to timestamp (seconds since epoch)
      const timestamp = BigInt(Math.floor(daysAgo.getTime() / 1000));
      
      // Delete records older than the specified number of days
      const result = await prisma.hourlyCryptoHistoricalData.deleteMany({
        where: {
          timestamp: {
            lt: timestamp,
          },
        },
      });
      
      return res.status(200).json({ 
        success: true, 
        message: `Deleted ${result.count} records older than ${days} days` 
      });
    } catch (error) {
      console.error('Error cleaning up hourly crypto data:', error);
      return res.status(500).json({ error: 'Failed to clean up hourly crypto data' });
    }
  }

  // Return 405 Method Not Allowed for other HTTP methods
  return res.status(405).json({ error: 'Method not allowed' });
}