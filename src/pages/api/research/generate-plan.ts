import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(req, res);
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Authentication error:', authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get the user's OpenAI API key from settings
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id },
    });

    if (!settings?.openAIApiKey) {
      return res.status(400).json({ error: 'OpenAI API key not found. Please add it in the settings.' });
    }

    // Get the analysis data from the request body
    const { analysisData } = req.body;

    if (!analysisData || analysisData.length === 0) {
      return res.status(400).json({ error: 'No analysis data provided' });
    }

    // Prepare the prompt for OpenAI
    let prompt = "Here's the technical data for my cryptocurrency portfolio:\n\n";
    
    analysisData.forEach((item: any) => {
      prompt += `Symbol: ${item.symbol}\n`;
      prompt += `Current Price: $${item.currentPrice?.toFixed(2) || 'N/A'}\n`;
      prompt += `Purchase Price: $${item.purchasePrice?.toFixed(2) || 'N/A'}\n`;
      
      if (item.analysisData?.sma) {
        prompt += `SMA 20: ${item.analysisData.sma.sma20?.toFixed(2) || 'N/A'}\n`;
        prompt += `SMA 50: ${item.analysisData.sma.sma50?.toFixed(2) || 'N/A'}\n`;
      }
      
      if (item.analysisData?.ema) {
        prompt += `EMA 12: ${item.analysisData.ema.ema12?.toFixed(2) || 'N/A'}\n`;
        prompt += `EMA 26: ${item.analysisData.ema.ema26?.toFixed(2) || 'N/A'}\n`;
      }
      
      if (item.analysisData?.rsi) {
        prompt += `RSI: ${item.analysisData.rsi?.toFixed(2) || 'N/A'}\n`;
      }
      
      if (item.analysisData?.trendLines) {
        prompt += `Support Level: ${item.analysisData.trendLines.support?.toFixed(2) || 'N/A'}\n`;
        prompt += `Resistance Level: ${item.analysisData.trendLines.resistance?.toFixed(2) || 'N/A'}\n`;
      }
      
      if (item.analysisData?.bollingerBands) {
        prompt += `Bollinger Upper: ${item.analysisData.bollingerBands.upper?.toFixed(2) || 'N/A'}\n`;
        prompt += `Bollinger Middle: ${item.analysisData.bollingerBands.middle?.toFixed(2) || 'N/A'}\n`;
        prompt += `Bollinger Lower: ${item.analysisData.bollingerBands.lower?.toFixed(2) || 'N/A'}\n`;
      }
      
      prompt += '\n';
    });
    
    prompt += "What should I do in the next 1-5 days?";

    // Check if the prompt is too long
    if (prompt.length > 11000) {
      return res.status(400).json({ 
        error: 'The analysis data is too large. Please select fewer assets or reduce the amount of data.'
      });
    }

    // Make the OpenAI API request
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openAIApiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a crypto trading analyst." },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      console.error('OpenAI API error:', errorData);
      return res.status(openaiResponse.status).json({ 
        error: 'Error from OpenAI API', 
        details: errorData 
      });
    }

    const data = await openaiResponse.json();
    const planText = data.choices[0].message.content;

    return res.status(200).json({ plan: planText });
  } catch (error) {
    console.error('Error generating plan:', error);
    return res.status(500).json({ 
      error: 'Failed to generate plan', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}