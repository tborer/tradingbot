import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

// Create a unique request ID for logging
const generateRequestId = () => {
  return `ai-trading-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
};

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
      // This is where we would integrate with the Google Gemini API
      // For now, we'll simulate a response since the actual integration will be done later
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Parse the trading data to generate a more realistic response
      let parsedData;
      try {
        parsedData = JSON.parse(tradingData);
      } catch (parseError) {
        console.error(`[${requestId}] Error parsing trading data:`, parseError);
        parsedData = [];
      }
      
      // Generate a simulated response based on the actual data
      let recommendations = "Based on your portfolio data, here are my recommendations:\n\n";
      
      if (parsedData.length === 0) {
        recommendations += "No cryptocurrency data found in your portfolio. Please add some cryptocurrencies to receive recommendations.";
      } else {
        // Sort by percent change to highlight best performers
        const sortedData = [...parsedData].sort((a, b) => {
          const aChange = parseFloat(a.percentChange) || 0;
          const bChange = parseFloat(b.percentChange) || 0;
          return bChange - aChange;
        });
        
        // Add recommendations for top performers
        recommendations += "Top Performers:\n";
        for (let i = 0; i < Math.min(3, sortedData.length); i++) {
          const crypto = sortedData[i];
          const percentChange = parseFloat(crypto.percentChange) || 0;
          
          if (percentChange > 5) {
            recommendations += `${i+1}. ${crypto.symbol}: Strong upward trend with ${crypto.percentChange} increase. Consider taking some profits.\n`;
          } else if (percentChange > 0) {
            recommendations += `${i+1}. ${crypto.symbol}: Positive momentum with ${crypto.percentChange} increase. Hold position and monitor for further growth.\n`;
          } else {
            recommendations += `${i+1}. ${crypto.symbol}: Currently at ${crypto.percentChange}. Monitor for potential entry points if fundamentals remain strong.\n`;
          }
        }
        
        // Add some general advice based on the instructions
        recommendations += "\nBased on your specific instructions:\n";
        if (instructions.toLowerCase().includes("buy")) {
          recommendations += "- Look for cryptocurrencies with strong fundamentals but temporary price dips as potential buy opportunities.\n";
          recommendations += "- Consider dollar-cost averaging into your strongest positions rather than making large one-time purchases.\n";
        }
        if (instructions.toLowerCase().includes("sell")) {
          recommendations += "- Consider taking partial profits on positions that have seen significant gains to reduce risk.\n";
          recommendations += "- Implement trailing stop losses on volatile assets to protect gains while allowing for further upside.\n";
        }
        if (instructions.toLowerCase().includes("trend")) {
          recommendations += "- The overall market sentiment appears to be cautiously optimistic based on your portfolio performance.\n";
          recommendations += "- Focus on assets with consistent upward trends rather than those showing erratic price movements.\n";
        }
        
        recommendations += "\nDisclaimer: These recommendations are generated by an AI assistant and should not be considered financial advice. Always do your own research before making investment decisions.";
      }
      
      console.log(`[${requestId}] Successfully generated recommendations`);
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