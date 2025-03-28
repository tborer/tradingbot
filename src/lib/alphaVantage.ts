interface AlphaVantageResponse {
  'Meta Data'?: {
    '1. Information': string;
    '2. Digital Currency Code'?: string;
    '3. Digital Currency Name'?: string;
    '4. Market Code'?: string;
    '5. Market Name'?: string;
    '6. Last Refreshed': string;
    '7. Time Zone': string;
  };
  'Time Series (Digital Currency Daily)'?: Record<string, {
    '1. open': string;
    '2. high': string;
    '3. low': string;
    '4. close': string;
    '5. volume': string;
  }>;
  Error?: string;
  Note?: string;
  Information?: string;
}

// This function is used to log API calls to the ResearchApiLogContext
// It will be imported and used in components that need to log API calls
export type LogApiCall = (
  url: string,
  method: string,
  requestBody?: any,
  response?: any,
  status?: number,
  error?: string,
  duration?: number
) => void;

export async function fetchHistoricalData(
  symbol: string,
  market: string = 'USD',
  apiKey: string,
  logApiCall?: LogApiCall
): Promise<AlphaVantageResponse> {
  const startTime = Date.now();
  const url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${symbol}&market=${market}&apikey=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    const duration = Date.now() - startTime;
    
    // Log the API call if the logApiCall function is provided
    if (logApiCall) {
      logApiCall(
        url,
        'GET',
        { symbol, market },
        data,
        response.status,
        undefined,
        duration
      );
    }
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('Error fetching data from Alpha Vantage:', error);
    
    // Log the error if the logApiCall function is provided
    if (logApiCall) {
      logApiCall(
        url,
        'GET',
        { symbol, market },
        undefined,
        undefined,
        errorMessage,
        duration
      );
    }
    
    return { Error: 'Failed to fetch data from Alpha Vantage' };
  }
}