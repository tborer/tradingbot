// CoinDesk API utility functions

/**
 * Interface for CoinDesk API response
 */
export interface CoinDeskHistoricalResponse {
  // Original format with nested data.entries
  data?: {
    entries?: Array<{
      date: string;
      value: number;
    }>;
    market?: string;
    instrument?: string;
  };
  
  // New format with Data array at the top level
  Data?: Array<{
    UNIT: string;
    TIMESTAMP: number;
    TYPE: string;
    MARKET: string;
    INSTRUMENT: string;
    OPEN: number;
    HIGH: number;
    LOW: number;
    CLOSE: number;
    FIRST_MESSAGE_TIMESTAMP: number;
    LAST_MESSAGE_TIMESTAMP: number;
    FIRST_MESSAGE_VALUE: number;
    HIGH_MESSAGE_VALUE: number;
    HIGH_MESSAGE_TIMESTAMP: number;
    LOW_MESSAGE_VALUE: number;
    LOW_MESSAGE_TIMESTAMP: number;
    LAST_MESSAGE_VALUE: number;
    TOTAL_INDEX_UPDATES: number;
    VOLUME: number;
    QUOTE_VOLUME: number;
    VOLUME_TOP_TIER: number;
    QUOTE_VOLUME_TOP_TIER: number;
    VOLUME_DIRECT: number;
    QUOTE_VOLUME_DIRECT: number;
    VOLUME_TOP_TIER_DIRECT: number;
    QUOTE_VOLUME_TOP_TIER_DIRECT: number;
  }>;
}

/**
 * Fetch historical data from CoinDesk API
 * @param symbol Cryptocurrency symbol (e.g., BTC)
 * @param apiKey CoinDesk API key
 * @param days Number of days of historical data to fetch (default: 30)
 * @param logFunction Optional function to log API requests and responses
 * @returns Promise with historical data
 */
export async function fetchCoinDeskHistoricalData(
  symbol: string,
  apiKey: string,
  days: number = 30,
  logFunction?: (url: string, method: string, requestBody: any, response?: any, status?: number, error?: string, duration?: number) => void
): Promise<CoinDeskHistoricalResponse | null> {
  try {
    // Format the symbol for CoinDesk API (e.g., BTC-USD)
    const formattedSymbol = `${symbol}-USD`;
    
    // Base URL for the CoinDesk API
    const baseUrl = 'https://data-api.coindesk.com/index/cc/v1/historical/days';
    
    // Construct parameters according to the documentation
    const params: Record<string, string> = {
      "market": "cadli",
      "instrument": formattedSymbol,
      "api_key": apiKey, // API key as query parameter instead of header
      "limit": days.toString(),
      "aggregate": "1",
      "fill": "true",
      "apply_mapping": "true",
      "response_format": "JSON"
    };
    
    // Create URL with parameters using URLSearchParams as shown in the documentation
    const url = new URL(baseUrl);
    url.search = new URLSearchParams(params).toString();
    
    console.log(`Fetching CoinDesk historical data for ${symbol}...`);
    
    const startTime = Date.now();
    
    // Make the API request with the correct headers as per documentation
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        "Content-type": "application/json; charset=UTF-8"
      }
    });
    
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `CoinDesk API error (${response.status}): ${errorText}`;
      console.error(errorMessage);
      
      // Log the error if a logging function is provided
      if (logFunction) {
        logFunction(
          url.toString(),
          'GET',
          params,
          null,
          response.status,
          errorMessage,
          duration
        );
      }
      
      return null;
    }
    
    const data = await response.json();
    console.log(`Successfully fetched CoinDesk data for ${symbol}`);
    
    // Log the successful response if a logging function is provided
    if (logFunction) {
      logFunction(
        url.toString(),
        'GET',
        params,
        data,
        response.status,
        undefined,
        duration
      );
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching CoinDesk historical data:', error);
    
    // Create a URL for logging purposes
    const baseUrl = 'https://data-api.coindesk.com/index/cc/v1/historical/days';
    const params = {
      "market": "cadli",
      "instrument": `${symbol}-USD`,
      "limit": days.toString()
    };
    
    // Log the error if a logging function is provided
    if (logFunction) {
      logFunction(
        `${baseUrl}?${new URLSearchParams(params).toString()}`,
        'GET',
        { ...params, api_key: "***" }, // Hide the actual API key in logs
        null,
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
    
    return null;
  }
}

/**
 * Convert CoinDesk API response to a format compatible with the existing analysis utilities
 * @param data CoinDesk API response
 * @returns Formatted data compatible with existing analysis utilities
 */
export function formatCoinDeskDataForAnalysis(data: CoinDeskHistoricalResponse | any): any {
  if (!data) {
    console.warn('No data provided to formatCoinDeskDataForAnalysis');
    return null;
  }
  
  // Log the data structure to help with debugging
  console.log('Formatting CoinDesk data with structure:', {
    hasData: !!data.data,
    hasDataEntries: data.data && !!data.data.entries,
    hasDataData: data.data && !!data.data.Data,
    hasTopLevelData: !!data.Data,
    hasTimeSeries: !!data['Time Series (Digital Currency Daily)'],
    hasMetaData: !!data['Meta Data']
  });
  
  // Create a structure similar to AlphaVantage API response
  const formattedData: any = {
    'Time Series (Digital Currency Daily)': {}
  };
  
  // If data is already in the expected format, return it as is
  if (data['Meta Data'] && data['Time Series (Digital Currency Daily)']) {
    console.log('Data is already in the expected format, returning as is');
    return data;
  }
  
  // Check which format we're dealing with
  if (data.data && data.data.entries && data.data.entries.length > 0) {
    // Original format with entries array in data.entries
    console.log('Processing original CoinDesk format with data.entries array');
    
    // Sort entries by date (newest first)
    const sortedEntries = [...data.data.entries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    // Add metadata to match AlphaVantage format but clearly mark as CoinDesk data
    formattedData['Meta Data'] = {
      '1. Information': 'CoinDesk Historical Data',
      '2. Digital Currency Code': data.data.instrument?.split('-')[0] || 'Unknown',
      '3. Digital Currency Name': data.data.instrument?.split('-')[0] || 'Unknown',
      '4. Market Code': data.data.instrument?.split('-')[1] || 'USD',
      '5. Last Refreshed': new Date().toISOString(),
      '6. Time Zone': 'UTC'
    };
    
    // Format each entry to match the expected structure
    sortedEntries.forEach(entry => {
      formattedData['Time Series (Digital Currency Daily)'][entry.date] = {
        '1. open': entry.value.toString(),
        '2. high': entry.value.toString(),
        '3. low': entry.value.toString(),
        '4. close': entry.value.toString(),
        '5. volume': '0', // CoinDesk might not provide volume data
      };
    });
    
    console.log('Formatted CoinDesk data with metadata (original format):', formattedData['Meta Data']);
    return formattedData;
  } 
  else if (data.Data && Array.isArray(data.Data) && data.Data.length > 0) {
    // New format with Data array at the top level
    console.log('Processing new CoinDesk format with top-level Data array');
    
    // Sort data by timestamp (newest first)
    const sortedData = [...data.Data].sort(
      (a, b) => b.TIMESTAMP - a.TIMESTAMP
    );
    
    // Add metadata to match AlphaVantage format
    formattedData['Meta Data'] = {
      '1. Information': 'CoinDesk Historical Data',
      '2. Digital Currency Code': sortedData[0]?.INSTRUMENT?.split('-')[0] || 'Unknown',
      '3. Digital Currency Name': sortedData[0]?.INSTRUMENT?.split('-')[0] || 'Unknown',
      '4. Market Code': sortedData[0]?.INSTRUMENT?.split('-')[1] || 'USD',
      '5. Last Refreshed': new Date().toISOString(),
      '6. Time Zone': 'UTC'
    };
    
    // Format each entry to match the expected structure
    sortedData.forEach(entry => {
      // Convert timestamp to date string (YYYY-MM-DD format)
      const date = new Date(entry.TIMESTAMP * 1000).toISOString().split('T')[0];
      
      formattedData['Time Series (Digital Currency Daily)'][date] = {
        '1. open': entry.OPEN.toString(),
        '2. high': entry.HIGH.toString(),
        '3. low': entry.LOW.toString(),
        '4. close': entry.CLOSE.toString(),
        '5. volume': entry.VOLUME.toString(),
      };
    });
    
    console.log('Formatted CoinDesk data with metadata (new format):', formattedData['Meta Data']);
    return formattedData;
  }
  else if (data.data && data.data.Data && Array.isArray(data.data.Data) && data.data.Data.length > 0) {
    // Alternative format with Data array nested in data property
    console.log('Processing alternative CoinDesk format with nested data.Data array');
    
    // Sort data by timestamp (newest first)
    const sortedData = [...data.data.Data].sort(
      (a, b) => b.TIMESTAMP - a.TIMESTAMP
    );
    
    // Add metadata to match AlphaVantage format
    formattedData['Meta Data'] = {
      '1. Information': 'CoinDesk Historical Data',
      '2. Digital Currency Code': sortedData[0]?.INSTRUMENT?.split('-')[0] || 'Unknown',
      '3. Digital Currency Name': sortedData[0]?.INSTRUMENT?.split('-')[0] || 'Unknown',
      '4. Market Code': sortedData[0]?.INSTRUMENT?.split('-')[1] || 'USD',
      '5. Last Refreshed': new Date().toISOString(),
      '6. Time Zone': 'UTC'
    };
    
    // Format each entry to match the expected structure
    sortedData.forEach(entry => {
      // Convert timestamp to date string (YYYY-MM-DD format)
      const date = new Date(entry.TIMESTAMP * 1000).toISOString().split('T')[0];
      
      formattedData['Time Series (Digital Currency Daily)'][date] = {
        '1. open': entry.OPEN.toString(),
        '2. high': entry.HIGH.toString(),
        '3. low': entry.LOW.toString(),
        '4. close': entry.CLOSE.toString(),
        '5. volume': entry.VOLUME.toString(),
      };
    });
    
    console.log('Formatted CoinDesk data with metadata (alternative format):', formattedData['Meta Data']);
    return formattedData;
  }
  
  // Handle array of price objects
  if (Array.isArray(data)) {
    console.log('Processing array of price objects');
    
    // Check if the array contains price objects
    const hasPriceObjects = data.some(item => 
      (item.close && !isNaN(item.close)) || 
      (item.CLOSE && !isNaN(item.CLOSE)) || 
      (item.value && !isNaN(item.value)) || 
      (item.price && !isNaN(item.price))
    );
    
    if (hasPriceObjects) {
      // Sort by date/timestamp if available
      const sortedData = [...data].sort((a, b) => {
        if (a.date && b.date) {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        } else if (a.timestamp && b.timestamp) {
          return b.timestamp - a.timestamp;
        } else if (a.TIMESTAMP && b.TIMESTAMP) {
          return b.TIMESTAMP - a.TIMESTAMP;
        }
        return 0; // Keep original order if no date/timestamp
      });
      
      // Add metadata
      formattedData['Meta Data'] = {
        '1. Information': 'CoinDesk Historical Data',
        '2. Digital Currency Code': 'Unknown',
        '3. Digital Currency Name': 'Unknown',
        '4. Market Code': 'USD',
        '5. Last Refreshed': new Date().toISOString(),
        '6. Time Zone': 'UTC'
      };
      
      // Format each entry
      sortedData.forEach((entry, index) => {
        // Generate a date string (use actual date if available, otherwise generate one)
        let dateStr;
        if (entry.date) {
          dateStr = new Date(entry.date).toISOString().split('T')[0];
        } else if (entry.timestamp) {
          dateStr = new Date(entry.timestamp * 1000).toISOString().split('T')[0];
        } else if (entry.TIMESTAMP) {
          dateStr = new Date(entry.TIMESTAMP * 1000).toISOString().split('T')[0];
        } else {
          // Generate a fake date for ordering (newest first)
          const date = new Date();
          date.setDate(date.getDate() - index);
          dateStr = date.toISOString().split('T')[0];
        }
        
        // Extract price values
        const close = entry.close || entry.CLOSE || entry.value || entry.price || 0;
        const open = entry.open || entry.OPEN || close;
        const high = entry.high || entry.HIGH || close;
        const low = entry.low || entry.LOW || close;
        const volume = entry.volume || entry.VOLUME || 0;
        
        formattedData['Time Series (Digital Currency Daily)'][dateStr] = {
          '1. open': open.toString(),
          '2. high': high.toString(),
          '3. low': low.toString(),
          '4. close': close.toString(),
          '5. volume': volume.toString(),
        };
      });
      
      console.log('Formatted array of price objects:', formattedData['Meta Data']);
      return formattedData;
    }
  }
  
  // Try to extract any price data from unknown format
  console.warn('Unknown data format, attempting to extract any price data');
  
  // Function to recursively search for price data in the object
  const extractPriceData = (obj: any) => {
    const priceEntries: Array<{date: string; price: number}> = [];
    
    const findPriceData = (obj: any, path: string = '') => {
      if (!obj || typeof obj !== 'object') return;
      
      // If this is an array of objects that might contain price data
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          if (typeof item === 'object' && item !== null) {
            // Check if this item has price-like properties
            const hasPrice = Object.keys(item).some(key => 
              /close|price|value/i.test(key) && 
              (typeof item[key] === 'number' || !isNaN(parseFloat(item[key])))
            );
            
            if (hasPrice) {
              // Extract date and price
              let date = null;
              let price = null;
              
              // Try to find date
              for (const key of Object.keys(item)) {
                if (/date|time|timestamp/i.test(key)) {
                  if (typeof item[key] === 'string') {
                    date = item[key];
                    break;
                  } else if (typeof item[key] === 'number') {
                    // Assume this is a timestamp
                    date = new Date(item[key] * 1000).toISOString().split('T')[0];
                    break;
                  }
                }
              }
              
              // If no date found, generate one
              if (!date) {
                const genDate = new Date();
                genDate.setDate(genDate.getDate() - index);
                date = genDate.toISOString().split('T')[0];
              }
              
              // Try to find price
              for (const key of Object.keys(item)) {
                if (/close|price|value/i.test(key)) {
                  if (typeof item[key] === 'number') {
                    price = item[key];
                    break;
                  } else if (typeof item[key] === 'string' && !isNaN(parseFloat(item[key]))) {
                    price = parseFloat(item[key]);
                    break;
                  }
                }
              }
              
              if (price !== null) {
                priceEntries.push({ date, price });
              }
            } else {
              // Recursively search this object
              findPriceData(item, `${path}[${index}]`);
            }
          }
        });
      } else {
        // Regular object, check each property
        Object.entries(obj).forEach(([key, value]) => {
          const currentPath = path ? `${path}.${key}` : key;
          
          if (typeof value === 'object' && value !== null) {
            findPriceData(value, currentPath);
          }
        });
      }
    };
    
    findPriceData(obj);
    return priceEntries;
  };
  
  const priceEntries = extractPriceData(data);
  
  if (priceEntries.length > 0) {
    console.log(`Extracted ${priceEntries.length} price entries from unknown format`);
    
    // Sort by date (newest first)
    priceEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // Add metadata
    formattedData['Meta Data'] = {
      '1. Information': 'Extracted Historical Data',
      '2. Digital Currency Code': 'Unknown',
      '3. Digital Currency Name': 'Unknown',
      '4. Market Code': 'USD',
      '5. Last Refreshed': new Date().toISOString(),
      '6. Time Zone': 'UTC'
    };
    
    // Format each entry
    priceEntries.forEach(entry => {
      formattedData['Time Series (Digital Currency Daily)'][entry.date] = {
        '1. open': entry.price.toString(),
        '2. high': entry.price.toString(),
        '3. low': entry.price.toString(),
        '4. close': entry.price.toString(),
        '5. volume': '0',
      };
    });
    
    console.log('Created formatted data from extracted price entries');
    return formattedData;
  }
  
  // If we couldn't process any of the known formats, log the data structure
  console.warn('Failed to format data:', JSON.stringify(data, null, 2));
  return null;
}