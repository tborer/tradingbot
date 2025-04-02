import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { fetchCoinDeskHistoricalData } from '@/lib/coinDesk';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  
  // Check if user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error('Authentication error:', authError);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const { symbol } = req.query;
      
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ error: 'Symbol parameter is required' });
      }
      
      // Get user settings to retrieve API keys
      const settings = await prisma.settings.findUnique({
        where: { userId: user.id },
      });
      
      if (!settings) {
        return res.status(404).json({ error: 'User settings not found' });
      }
      
      // Try to fetch data from AlphaVantage first
      let historicalData = null;
      let dataSource = 'alphavantage';
      
      if (settings.alphaVantageApiKey) {
        console.log(`Fetching AlphaVantage historical data for ${symbol}...`);
        
        try {
          // Construct the AlphaVantage API URL
          const url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${symbol}&market=USD&apikey=${settings.alphaVantageApiKey}`;
          
          const response = await fetch(url);
          
          if (response.ok) {
            const data = await response.json();
            
            // Check if we got valid data
            if (data && data['Time Series (Digital Currency Daily)']) {
              historicalData = data;
              console.log(`Successfully fetched AlphaVantage data for ${symbol}`);
            } else if (data && data.Note && data.Note.includes('API call frequency')) {
              console.log('AlphaVantage API call frequency exceeded');
            } else {
              console.log(`No data available from AlphaVantage for ${symbol}`);
            }
          } else {
            console.error(`AlphaVantage API error: ${response.status}`);
          }
        } catch (error) {
          console.error('Error fetching AlphaVantage data:', error);
        }
      }
      
      // If AlphaVantage failed or returned no data, try CoinDesk as fallback
      if (!historicalData && settings.coinDeskApiKey) {
        console.log(`Falling back to CoinDesk API for ${symbol}...`);
        
        try {
          const coinDeskData = await fetchCoinDeskHistoricalData(symbol, settings.coinDeskApiKey);
          
          if (coinDeskData) {
            historicalData = coinDeskData;
            dataSource = 'coindesk';
            console.log(`Successfully fetched CoinDesk data for ${symbol}`);
          } else {
            console.log(`No data available from CoinDesk for ${symbol}`);
          }
        } catch (error) {
          console.error('Error fetching CoinDesk data:', error);
        }
      }
      
      if (!historicalData) {
        return res.status(404).json({ 
          error: 'No historical data available',
          message: 'Could not retrieve historical data from any source. Please check your API keys.'
        });
      }
      
      return res.status(200).json({ 
        data: historicalData,
        source: dataSource
      });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}