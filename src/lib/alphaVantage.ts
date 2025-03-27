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
  'Time Series (Digital Currency Monthly)'?: Record<string, {
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

export async function fetchHistoricalData(
  symbol: string,
  market: string = 'USD',
  apiKey: string
): Promise<AlphaVantageResponse> {
  try {
    const url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_MONTHLY&symbol=${symbol}&market=${market}&apikey=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    return data;
  } catch (error) {
    console.error('Error fetching data from Alpha Vantage:', error);
    return { Error: 'Failed to fetch data from Alpha Vantage' };
  }
}