import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add detailed logging for debugging
  const logRequest = (stage: string, details: any) => {
    console.log(`[Generate Plan API] ${stage}:`, details);
  };

  logRequest('Request received', { method: req.method, url: req.url });

  if (req.method !== 'POST') {
    logRequest('Method not allowed', { method: req.method });
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(req, res);
    
    // Check if user is authenticated
    logRequest('Authenticating user', {});
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      logRequest('Authentication error', { error: authError });
      console.error('Authentication error:', authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logRequest('User authenticated', { userId: user.id });

    // Get the user's OpenAI API key from settings
    logRequest('Fetching settings', { userId: user.id });
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id },
    });

    if (!settings) {
      logRequest('Settings not found', { userId: user.id });
      return res.status(400).json({ error: 'Settings not found. Please configure your settings first.' });
    }

    if (!settings.openAIApiKey) {
      logRequest('OpenAI API key missing', { userId: user.id });
      return res.status(400).json({ error: 'OpenAI API key not found. Please add it in the settings.' });
    }

    logRequest('Settings retrieved', { hasOpenAIKey: !!settings.openAIApiKey });

    // Get the analysis data from the request body
    const { analysisData } = req.body;

    logRequest('Request body parsed', { 
      hasAnalysisData: !!analysisData,
      itemCount: analysisData?.length || 0 
    });

    if (!analysisData || analysisData.length === 0) {
      logRequest('No analysis data', {});
      return res.status(400).json({ error: 'No analysis data provided' });
    }

    // Log the structure of the analysis data (without sensitive details)
    logRequest('Analysis data structure', {
      itemCount: analysisData.length,
      symbols: analysisData.map((item: any) => item.symbol),
      hasHistoricalData: analysisData.map((item: any) => !!item.historicalData),
      hasAnalysisData: analysisData.map((item: any) => !!item.analysisData)
    });

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

    logRequest('Prompt prepared', { 
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 100) + '...' 
    });

    // Check if the prompt is too long
    if (prompt.length > 11000) {
      logRequest('Prompt too long', { promptLength: prompt.length });
      return res.status(400).json({ 
        error: 'The analysis data is too large. Please select fewer assets or reduce the amount of data.'
      });
    }

    // Make the OpenAI API request
    logRequest('Sending request to OpenAI', { 
      model: "gpt-3.5-turbo",
      messageCount: 2
    });

    try {
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

      logRequest('OpenAI response received', { 
        status: openaiResponse.status,
        statusText: openaiResponse.statusText,
        ok: openaiResponse.ok
      });

      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.json();
        logRequest('OpenAI API error', { 
          status: openaiResponse.status,
          error: errorData
        });
        console.error('OpenAI API error:', errorData);
        return res.status(openaiResponse.status).json({ 
          error: 'Error from OpenAI API', 
          details: errorData 
        });
      }

      const data = await openaiResponse.json();
      
      logRequest('OpenAI response parsed', { 
        hasChoices: !!data.choices,
        choicesLength: data.choices?.length || 0,
        hasContent: !!data.choices?.[0]?.message?.content
      });

      if (!data.choices || !data.choices.length || !data.choices[0].message) {
        logRequest('Invalid OpenAI response format', { data });
        return res.status(500).json({ 
          error: 'Invalid response format from OpenAI API',
          details: data
        });
      }

      const planText = data.choices[0].message.content;

      logRequest('Plan generated successfully', { 
        planLength: planText.length,
        planPreview: planText.substring(0, 100) + '...'
      });

      return res.status(200).json({ plan: planText });
    } catch (openaiError) {
      logRequest('OpenAI API request failed', { 
        error: openaiError instanceof Error ? openaiError.message : 'Unknown OpenAI error'
      });
      console.error('OpenAI API request failed:', openaiError);
      return res.status(500).json({ 
        error: 'Failed to communicate with OpenAI API', 
        details: openaiError instanceof Error ? openaiError.message : 'Unknown OpenAI error' 
      });
    }
  } catch (error) {
    logRequest('Unhandled error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    console.error('Error generating plan:', error);
    return res.status(500).json({ 
      error: 'Failed to generate plan', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}