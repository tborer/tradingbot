import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';
import ReactMarkdown from 'react-markdown';

const AIAgent: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [instructions, setInstructions] = useState<string>(
    "Identify potential buy opportunities based on recent price surges and volume.\n" +
    "Find coins that have shown a consistent upward trend over the past week.\n" +
    "Highlight coins with significant percentage changes in the last 24 hours.\n" +
    "Identify coins that have a high likelihood of price increase in the next week.\n" +
    "Give percentage estimates of the likelihood of the above items."
  );
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

  const [analysisStage, setAnalysisStage] = useState<string>('');

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
    setAnalysisStage('Fetching your cryptocurrency portfolio...');

    try {
      // Fetch recent trading data
      const cryptosResponse = await fetch('/api/cryptos');
      const cryptos = await cryptosResponse.json();
      
      if (!cryptos || cryptos.length === 0) {
        toast({
          title: 'No Cryptocurrencies Found',
          description: 'Please add cryptocurrencies to your portfolio first',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }
      
      setAnalysisStage(`Found ${cryptos.length} cryptocurrencies. Preparing for analysis...`);
      
      // Format trading data
      const tradingData = cryptos.map((crypto: any) => ({
        symbol: crypto.symbol,
        currentPrice: crypto.currentPrice || 'N/A',
        percentChange: crypto.percentChange ? `${crypto.percentChange.toFixed(2)}%` : 'N/A',
        shares: crypto.shares,
      }));

      setAnalysisStage('Fetching historical data and analyzing trends...');
      
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

      setAnalysisStage('Generating AI recommendations...');
      
      const data = await response.json();
      setResult(data.recommendations);
      
      toast({
        title: 'Success',
        description: 'AI recommendations generated successfully',
      });
    } catch (error) {
      console.error('Error generating recommendations:', error);
      
      // Check for specific error types
      if (error instanceof Error) {
        if (error.message.includes('CoinDesk API key not configured')) {
          toast({
            title: 'API Key Missing',
            description: 'CoinDesk API key is not configured. Please contact the administrator.',
            variant: 'destructive',
          });
        } else if (error.message.includes('Google API key not configured')) {
          toast({
            title: 'API Key Required',
            description: 'Please configure your Google Gemini API key in the settings tab first',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Error',
            description: error.message || 'Failed to generate recommendations',
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Error',
          description: 'Failed to generate recommendations',
          variant: 'destructive',
        });
      }
      
      // Show a fallback result
      setResult(
        "# Error Generating Recommendations\n\n" +
        "We encountered an error while trying to analyze your cryptocurrency portfolio. This could be due to:\n\n" +
        "- API rate limits or temporary service disruption\n" +
        "- Missing or invalid data for some cryptocurrencies\n" +
        "- Network connectivity issues\n\n" +
        "Please try again later or contact support if the problem persists."
      );
    } finally {
      setLoading(false);
      setAnalysisStage('');
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
            
            {loading && analysisStage && (
              <div className="mt-2 text-sm text-muted-foreground flex items-center">
                <Spinner className="mr-2 h-3 w-3" />
                <span>{analysisStage}</span>
              </div>
            )}
            
            {!hasGoogleApiKey && (
              <div className="text-amber-600 dark:text-amber-400 text-sm mt-2">
                Please configure your Google Gemini API key in the settings tab to use this feature.
              </div>
            )}
            
            {result && (
              <div className="mt-4">
                <h3 className="text-lg font-medium mb-2">AI Recommendations</h3>
                <div className="bg-muted p-4 rounded-md prose dark:prose-invert max-w-none">
                  <ReactMarkdown>
                    {result}
                  </ReactMarkdown>
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