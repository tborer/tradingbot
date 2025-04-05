// CoinDesk API utility functions

/**
 * Interface for CoinDesk API response
 */
export interface CoinDeskHistoricalResponse {
  data: {
    entries: Array<{
      date: string;
      value: number;
    }>;
    market: string;
    instrument: string;
  };
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
    const market = 'cadli'; // CoinDesk requires 'cadli' as the market parameter
    
    // Construct the API URL with parameters
    const url = `https://data-api.coindesk.com/index/cc/v1/historical/days?market=${market}&instrument=${formattedSymbol}&limit=${days}&aggregate=1&fill=true&apply_mapping=true&response_format=JSON`;
    
    console.log(`Fetching CoinDesk historical data for ${symbol}...`);
    
    const startTime = Date.now();
    
    // Make the API request with the API key in the header
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
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
          url,
          'GET',
          { instrument: formattedSymbol, market },
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
        url,
        'GET',
        { instrument: formattedSymbol, market },
        data,
        response.status,
        undefined,
        duration
      );
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching CoinDesk historical data:', error);
    
    // Log the error if a logging function is provided
    if (logFunction) {
      logFunction(
        `https://data-api.coindesk.com/index/cc/v1/historical/days?market=cadli&instrument=${symbol}-USD`,
        'GET',
        { instrument: `${symbol}-USD`, market: 'cadli' },
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
export function formatCoinDeskDataForAnalysis(data: CoinDeskHistoricalResponse): any {
  if (!data || !data.data || !data.data.entries || data.data.entries.length === 0) {
    return null;
  }
  
  // Create a structure similar to AlphaVantage API response
  const formattedData: any = {
    'Time Series (Digital Currency Daily)': {}
  };
  
  // Sort entries by date (newest first)
  const sortedEntries = [...data.data.entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
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
  
  return formattedData;
}