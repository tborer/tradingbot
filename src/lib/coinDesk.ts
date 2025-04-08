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