import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { fetchCoinDeskHistoricalData, formatCoinDeskDataForAnalysis, extractPriceDataFromCoinDesk } from '@/lib/coinDesk';
import { calculateDrawdownDrawup, DrawdownDrawupAnalysis } from '@/lib/trendAnalysis';

// Create a unique request ID for logging
const generateRequestId = () => {
  return `ai-trading-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
};

interface CryptoAnalysis {
  symbol: string;
  currentPrice: number | null;
  percentChange: number | null;
  shares: number;
  analysis: DrawdownDrawupAnalysis | null;
  hourlyData: any[];
  recommendation: string;
  buyProbability: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = generateRequestId();
  console.log(`[${requestId}] AI Trading Recommendations API request received: ${req.method}`);
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const supabase = createClient(req, res);
    console.log(`[${requestId}] Supabase client created`);
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error(`[${requestId}] Authentication error:`, authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log(`[${requestId}] User authenticated: ${user.id}`);
    
    // Get the Google API key from settings
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id },
    });
    
    if (!settings?.googleApiKey) {
      console.error(`[${requestId}] Google API key not found for user`);
      return res.status(400).json({ error: 'Google API key not configured' });
    }
    
    // Extract request data
    const { tradingData, instructions } = req.body;
    
    if (!tradingData || !instructions) {
      console.error(`[${requestId}] Missing required fields`);
      return res.status(400).json({ error: 'Trading data and instructions are required' });
    }
    
    console.log(`[${requestId}] Processing trading recommendations request`);
    
    try {
      // Get the CoinDesk API key from environment variables
      const coinDeskApiKey = process.env.NEXT_PUBLIC_COINDESK_API_KEY;
      
      if (!coinDeskApiKey) {
        console.error(`[${requestId}] CoinDesk API key not found in environment variables`);
        return res.status(500).json({ error: 'CoinDesk API key not configured' });
      }
      
      // Parse the trading data
      let parsedData;
      try {
        parsedData = JSON.parse(tradingData);
      } catch (parseError) {
        console.error(`[${requestId}] Error parsing trading data:`, parseError);
        parsedData = [];
      }
      
      if (parsedData.length === 0) {
        return res.status(200).json({ 
          recommendations: "No cryptocurrency data found in your portfolio. Please add some cryptocurrencies to receive recommendations."
        });
      }
      
      // Analyze each crypto in the portfolio
      const cryptoAnalyses: CryptoAnalysis[] = [];
      
      // Process each crypto in parallel
      await Promise.all(parsedData.map(async (crypto: any) => {
        try {
          console.log(`[${requestId}] Analyzing ${crypto.symbol}...`);
          
          // Fetch hourly historical data for the past 7 days
          const historicalData = await fetchCoinDeskHistoricalData(
            crypto.symbol,
            coinDeskApiKey,
            7 // 7 days of hourly data
          );
          
          if (!historicalData) {
            console.error(`[${requestId}] Failed to fetch historical data for ${crypto.symbol}`);
            cryptoAnalyses.push({
              symbol: crypto.symbol,
              currentPrice: parseFloat(crypto.currentPrice) || null,
              percentChange: parseFloat(crypto.percentChange) || null,
              shares: crypto.shares,
              analysis: null,
              hourlyData: [],
              recommendation: `Could not analyze ${crypto.symbol} due to missing historical data.`,
              buyProbability: 0
            });
            return;
          }
          
          // Format the data for analysis
          const formattedData = formatCoinDeskDataForAnalysis(historicalData);
          
          if (!formattedData) {
            console.error(`[${requestId}] Failed to format historical data for ${crypto.symbol}`);
            cryptoAnalyses.push({
              symbol: crypto.symbol,
              currentPrice: parseFloat(crypto.currentPrice) || null,
              percentChange: parseFloat(crypto.percentChange) || null,
              shares: crypto.shares,
              analysis: null,
              hourlyData: [],
              recommendation: `Could not analyze ${crypto.symbol} due to data formatting issues.`,
              buyProbability: 0
            });
            return;
          }
          
          // Extract price data
          const priceData = extractPriceDataFromCoinDesk(formattedData);
          
          if (priceData.length === 0) {
            console.error(`[${requestId}] No price data found for ${crypto.symbol}`);
            cryptoAnalyses.push({
              symbol: crypto.symbol,
              currentPrice: parseFloat(crypto.currentPrice) || null,
              percentChange: parseFloat(crypto.percentChange) || null,
              shares: crypto.shares,
              analysis: null,
              hourlyData: [],
              recommendation: `Could not analyze ${crypto.symbol} due to missing price data.`,
              buyProbability: 0
            });
            return;
          }
          
          // Calculate trend analysis
          const analysis = calculateDrawdownDrawup(priceData);
          
          // Generate a recommendation based on the analysis
          let recommendation = '';
          let buyProbability = 0;
          
          const percentChange = parseFloat(crypto.percentChange) || 0;
          
          if (analysis) {
            // Calculate buy probability based on various factors
            // Higher drawup and lower drawdown are generally positive indicators
            const drawupFactor = Math.min(analysis.avgDrawup / 5, 1) * 0.3; // 30% weight
            const drawdownFactor = Math.min(1 - (analysis.avgDrawdown / 10), 1) * 0.2; // 20% weight
            
            // Recent performance factor
            const recentPerformanceFactor = percentChange > 0 
              ? Math.min(percentChange / 10, 1) * 0.3 // 30% weight for positive change
              : 0; // 0 for negative change
            
            // Consistency factor based on standard deviation
            const consistencyFactor = analysis.stdDevDrawup 
              ? Math.min(1 - (analysis.stdDevDrawup / 10), 1) * 0.2 // 20% weight
              : 0.1; // Default if not available
            
            // Calculate overall probability
            buyProbability = drawupFactor + drawdownFactor + recentPerformanceFactor + consistencyFactor;
            buyProbability = Math.min(Math.max(buyProbability, 0), 1); // Ensure between 0 and 1
            
            // Generate recommendation text
            if (buyProbability > 0.7) {
              recommendation = `Strong Buy: ${crypto.symbol} shows excellent upward momentum with consistent gains and manageable volatility.`;
            } else if (buyProbability > 0.5) {
              recommendation = `Moderate Buy: ${crypto.symbol} shows positive indicators but with some volatility to be aware of.`;
            } else if (buyProbability > 0.3) {
              recommendation = `Hold: ${crypto.symbol} shows mixed signals. Consider holding current position and monitoring for clearer trends.`;
            } else {
              recommendation = `Caution: ${crypto.symbol} shows high volatility and uncertain direction. Consider reducing exposure or waiting for more favorable conditions.`;
            }
          } else {
            recommendation = `Could not generate detailed analysis for ${crypto.symbol}.`;
            buyProbability = 0;
          }
          
          // Add to the analyses array
          cryptoAnalyses.push({
            symbol: crypto.symbol,
            currentPrice: parseFloat(crypto.currentPrice) || null,
            percentChange: parseFloat(crypto.percentChange) || null,
            shares: crypto.shares,
            analysis,
            hourlyData: priceData,
            recommendation,
            buyProbability
          });
          
          console.log(`[${requestId}] Completed analysis for ${crypto.symbol}`);
        } catch (error) {
          console.error(`[${requestId}] Error analyzing ${crypto.symbol}:`, error);
          cryptoAnalyses.push({
            symbol: crypto.symbol,
            currentPrice: parseFloat(crypto.currentPrice) || null,
            percentChange: parseFloat(crypto.percentChange) || null,
            shares: crypto.shares,
            analysis: null,
            hourlyData: [],
            recommendation: `Error analyzing ${crypto.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            buyProbability: 0
          });
        }
      }));
      
      // Sort analyses by buy probability (highest first)
      cryptoAnalyses.sort((a, b) => b.buyProbability - a.buyProbability);
      
      // Generate the final recommendations
      let recommendations = "# Weekly Cryptocurrency Analysis and Recommendations\n\n";
      
      // Add summary section
      recommendations += "## Summary\n\n";
      
      if (cryptoAnalyses.length > 0) {
        // Top opportunities
        const topOpportunities = cryptoAnalyses
          .filter(crypto => crypto.buyProbability > 0.5)
          .slice(0, 3);
        
        if (topOpportunities.length > 0) {
          recommendations += "### Top Opportunities\n";
          topOpportunities.forEach((crypto, index) => {
            recommendations += `${index + 1}. **${crypto.symbol}** - Buy Probability: ${(crypto.buyProbability * 100).toFixed(1)}%\n`;
            recommendations += `   ${crypto.recommendation}\n\n`;
          });
        } else {
          recommendations += "No strong buy opportunities identified in your current portfolio.\n\n";
        }
        
        // Market overview
        recommendations += "### Market Overview\n";
        const positiveCount = cryptoAnalyses.filter(c => (c.percentChange || 0) > 0).length;
        const totalCount = cryptoAnalyses.length;
        const marketSentiment = positiveCount > totalCount * 0.7 
          ? "Bullish" 
          : positiveCount > totalCount * 0.4 
            ? "Neutral" 
            : "Bearish";
        
        recommendations += `Overall market sentiment: **${marketSentiment}** (${positiveCount} of ${totalCount} coins showing positive movement)\n\n`;
      }
      
      // Add detailed analysis for each crypto
      recommendations += "## Detailed Analysis\n\n";
      
      cryptoAnalyses.forEach(crypto => {
        recommendations += `### ${crypto.symbol}\n\n`;
        
        // Current stats
        recommendations += "**Current Stats:**\n";
        recommendations += `- Current Price: ${crypto.currentPrice ? `$${crypto.currentPrice}` : 'N/A'}\n`;
        recommendations += `- 24h Change: ${crypto.percentChange ? `${crypto.percentChange}` : 'N/A'}\n`;
        recommendations += `- Holdings: ${crypto.shares} shares\n\n`;
        
        // Analysis results
        if (crypto.analysis) {
          recommendations += "**Technical Analysis:**\n";
          recommendations += `- Average Upward Movement: ${crypto.analysis.avgDrawup.toFixed(2)}%\n`;
          recommendations += `- Average Downward Movement: ${crypto.analysis.avgDrawdown.toFixed(2)}%\n`;
          recommendations += `- Volatility: ${crypto.analysis.stdDevDrawup ? crypto.analysis.stdDevDrawup.toFixed(2) : 'N/A'}%\n\n`;
        }
        
        // Recommendation
        recommendations += "**Recommendation:**\n";
        recommendations += `${crypto.recommendation}\n`;
        recommendations += `Buy Probability: ${(crypto.buyProbability * 100).toFixed(1)}%\n\n`;
      });
      
      // Add disclaimer
      recommendations += "---\n\n";
      recommendations += "**Disclaimer:** These recommendations are generated by an AI assistant based on historical price data and technical analysis. They should not be considered financial advice. Always do your own research before making investment decisions.\n";
      
      console.log(`[${requestId}] Successfully generated recommendations for ${cryptoAnalyses.length} cryptocurrencies`);
      return res.status(200).json({ recommendations });
      
    } catch (aiError) {
      console.error(`[${requestId}] Error generating recommendations:`, aiError);
      return res.status(500).json({ 
        error: 'Failed to generate recommendations',
        details: aiError instanceof Error ? aiError.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error(`[${requestId}] Unhandled API error:`, error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}