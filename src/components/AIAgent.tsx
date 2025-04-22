import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';

const AIAgent: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [instructions, setInstructions] = useState<string>('');
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [hasGoogleApiKey, setHasGoogleApiKey] = useState<boolean>(false);

  // Check if Google API key is configured
  useEffect(() => {
    const checkApiKey = async () => {
      if (!user) return;
      
      try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        
        setHasGoogleApiKey(!!data.googleApiKey);
      } catch (error) {
        console.error('Error checking Google API key:', error);
      }
    };

    checkApiKey();
  }, [user]);

  const handleGenerateRecommendations = async () => {
    if (!instructions.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter instructions for the AI agent',
        variant: 'destructive',
      });
      return;
    }

    if (!hasGoogleApiKey) {
      toast({
        title: 'API Key Required',
        description: 'Please configure your Google Gemini API key in the settings tab first',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setResult('');

    try {
      // Fetch recent trading data
      const cryptosResponse = await fetch('/api/cryptos');
      const cryptos = await cryptosResponse.json();
      
      // Format trading data
      const tradingData = cryptos.map((crypto: any) => ({
        symbol: crypto.symbol,
        currentPrice: crypto.currentPrice || 'N/A',
        percentChange: crypto.percentChange ? `${crypto.percentChange.toFixed(2)}%` : 'N/A',
        shares: crypto.shares,
      }));

      // Call the AI agent API
      const response = await fetch('/api/ai/trading-recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tradingData: JSON.stringify(tradingData, null, 2),
          instructions,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate recommendations');
      }

      const data = await response.json();
      setResult(data.recommendations);
      
      toast({
        title: 'Success',
        description: 'AI recommendations generated successfully',
      });
    } catch (error) {
      console.error('Error generating recommendations:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate recommendations',
        variant: 'destructive',
      });
      
      // Show a placeholder result for now since the API endpoint doesn't exist yet
      setResult(
        "Note: This is a placeholder response until the API endpoint is implemented.\n\n" +
        "Based on the trading data provided, here are my recommendations:\n\n" +
        "1. BTC shows a strong upward trend with a 5.2% increase. Consider increasing your position.\n" +
        "2. ETH has stabilized after recent volatility. Hold your current position.\n" +
        "3. SOL has shown significant growth. Consider taking partial profits.\n\n" +
        "These recommendations are based on recent price movements and volume patterns."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>AI Agent</CardTitle>
        <CardDescription>
          AI-powered assistant for cryptocurrency analysis and trading
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="weekly-picks" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="weekly-picks">Weekly Picks</TabsTrigger>
            {/* Additional tabs can be added here in the future */}
          </TabsList>
          
          <TabsContent value="weekly-picks" className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Instructions for AI</h3>
              <Textarea
                placeholder="Enter instructions for the AI agent, e.g., 'Identify potential buy opportunities based on recent price surges and volume.'"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="min-h-[100px]"
              />
              <p className="text-sm text-muted-foreground">
                Be specific about what you're looking for. The AI will analyze your portfolio data and provide recommendations.
              </p>
            </div>
            
            <Button 
              onClick={handleGenerateRecommendations} 
              disabled={loading || !instructions.trim()}
              className="w-full"
            >
              {loading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Generating...
                </>
              ) : (
                'Generate Recommendations'
              )}
            </Button>
            
            {!hasGoogleApiKey && (
              <div className="text-amber-600 dark:text-amber-400 text-sm mt-2">
                Please configure your Google Gemini API key in the settings tab to use this feature.
              </div>
            )}
            
            {result && (
              <div className="mt-4">
                <h3 className="text-lg font-medium mb-2">AI Recommendations</h3>
                <div className="bg-muted p-4 rounded-md whitespace-pre-wrap">
                  {result}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AIAgent;