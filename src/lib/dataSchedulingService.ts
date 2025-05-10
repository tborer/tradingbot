import prisma from '@/lib/prisma';

/**
 * Fetches data from the configured API and stores it in the database
 */
export async function fetchAndStoreHourlyCryptoData(userId: string): Promise<{
  success: boolean;
  message: string;
  data?: any;
  error?: any;
}> {
  try {
    // Get the user's data scheduling settings
    const settings = await prisma.dataScheduling.findUnique({
      where: {
        userId,
      },
    });

    if (!settings) {
      return {
        success: false,
        message: 'Data scheduling settings not found',
      };
    }

    // Fetch data from the configured API
    const response = await fetch(settings.apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${settings.apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        message: `API request failed with status ${response.status}`,
        error: await response.text(),
      };
    }

    const data = await response.json();

    // Check if the data has the expected format
    if (!data.Data || !Array.isArray(data.Data)) {
      return {
        success: false,
        message: 'Invalid data format received from API',
        data,
      };
    }

    // Store the data in the database
    const savedData = await Promise.all(
      data.Data.map(async (entry) => {
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

    return {
      success: true,
      message: `Successfully stored ${savedData.length} hourly crypto data entries`,
      data: savedData,
    };
  } catch (error) {
    console.error('Error in fetchAndStoreHourlyCryptoData:', error);
    return {
      success: false,
      message: 'Failed to fetch and store hourly crypto data',
      error,
    };
  }
}

/**
 * Cleans up old data based on the configured retention period
 */
export async function cleanupOldData(userId: string): Promise<{
  success: boolean;
  message: string;
  count?: number;
  error?: any;
}> {
  try {
    // Get the user's data scheduling settings
    const settings = await prisma.dataScheduling.findUnique({
      where: {
        userId,
      },
    });

    if (!settings) {
      return {
        success: false,
        message: 'Data scheduling settings not found',
      };
    }

    // Check if cleanup is enabled
    if (!settings.cleanupEnabled) {
      return {
        success: true,
        message: 'Data cleanup is disabled',
        count: 0,
      };
    }

    // Calculate the cutoff timestamp
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - settings.cleanupDays);
    const timestamp = BigInt(Math.floor(daysAgo.getTime() / 1000));

    // Delete records older than the specified number of days
    const result = await prisma.hourlyCryptoHistoricalData.deleteMany({
      where: {
        timestamp: {
          lt: timestamp,
        },
      },
    });

    return {
      success: true,
      message: `Deleted ${result.count} records older than ${settings.cleanupDays} days`,
      count: result.count,
    };
  } catch (error) {
    console.error('Error in cleanupOldData:', error);
    return {
      success: false,
      message: 'Failed to clean up old data',
      error,
    };
  }
}