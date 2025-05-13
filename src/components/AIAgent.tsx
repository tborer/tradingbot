import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import { AIAgentData } from '@/lib/aiAgentUtils';

interface AIAgentSettings {
  id: string;
  userId: string;
  maxTradeValue: number;
  maxDailyTrades: number;
  minRiskReward: number;
  blacklistedAssets: string[];
  createdAt: string;
  updatedAt: string;
}

const AIAgent: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Trading tab state
  const [instructions, setInstructions] = useState<string>(
    "You are a cryptocurrency trading advisor. Analyze the following data and provide recommendations:\n\n" +
    "1. Identify potential buy opportunities based on recent price surges and volume.\n" +
    "2. Find coins that have shown a consistent upward trend over the past week.\n" +
    "3. Highlight coins with significant percentage changes in the last 24 hours.\n" +
    "4. Identify coins that have a high likelihood of price increase in the next week.\n" +
    "5. Give percentage estimates of the likelihood of the above items.\n" +
    "6. Consider the account balance and trading constraints when making recommendations.\n\n" +
    "Use this data for your analysis: {input_data}\n\n" +
    "Format your response in Markdown with clear sections and bullet points."
  );
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [savingInstructions, setSavingInstructions] = useState<boolean>(false);
  const [hasGoogleApiKey, setHasGoogleApiKey] = useState<boolean>(false);
  const [analysisStage, setAnalysisStage] = useState<string>('');
  
  // Settings tab state
  const [settings, setSettings] = useState<AIAgentSettings | null>(null);
  const [maxTradeValue, setMaxTradeValue] = useState<string>('100.00');
  const [maxDailyTrades, setMaxDailyTrades] = useState<string>('5');
  const [minRiskReward, setMinRiskReward] = useState<string>('2.0');
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  
  // AI Agent Data tab state
  const [aiAgentData, setAiAgentData] = useState<AIAgentData | null>(null);
  const [loadingData, setLoadingData] = useState<boolean>(false);

  // Check if Google API key is configured and load settings
  useEffect(() => {
    const initialize = async () => {
      if (!user) return;
      
      try {
        // Check for Google API key
        const settingsResponse = await fetch('/api/settings');
        const settingsData = await settingsResponse.json();
        setHasGoogleApiKey(!!settingsData.googleApiKey);
        
        // Load AI Agent settings
        const aiSettingsResponse = await fetch('/api/ai-agent/settings');
        const aiSettingsData = await aiSettingsResponse.json();
        setSettings(aiSettingsData);
        setMaxTradeValue(aiSettingsData.maxTradeValue.toString());
        setMaxDailyTrades(aiSettingsData.maxDailyTrades.toString());
        setMinRiskReward(aiSettingsData.minRiskReward.toString());
        
        // Load trading instructions if available
        try {
          const instructionsResponse = await fetch('/api/ai-agent/trading-instructions');
          if (instructionsResponse.ok) {
            const instructionsData = await instructionsResponse.json();
            if (instructionsData.instructions) {
              setInstructions(instructionsData.instructions);
            }
          }
        } catch (instructionsError) {
          console.error('Error loading trading instructions:', instructionsError);
        }
        
        // Load AI Agent data
        await fetchAIAgentData();
      } catch (error) {
        console.error('Error initializing AI Agent:', error);
        toast({
          title: 'Error',
          description: 'Failed to load AI Agent settings',
          variant: 'destructive',
        });
      }
    };

    initialize();
  }, [user]);
  
  // Fetch AI Agent data
  const fetchAIAgentData = async () => {
    if (!user) return;
    
    setLoadingData(true);
    try {
      const response = await fetch('/api/ai-agent/data');
      if (!response.ok) {
        throw new Error('Failed to fetch AI Agent data');
      }
      const data = await response.json();
      setAiAgentData(data);
    } catch (error) {
      console.error('Error fetching AI Agent data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch AI Agent data',
        variant: 'destructive',
      });
    } finally {
      setLoadingData(false);
    }
  };
  
  // Save AI Agent settings
  const saveSettings = async () => {
    if (!user) return;
    
    setSavingSettings(true);
    try {
      const response = await fetch('/api/ai-agent/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxTradeValue,
          maxDailyTrades,
          minRiskReward,
          blacklistedAssets: settings?.blacklistedAssets || []
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save AI Agent settings');
      }
      
      const updatedSettings = await response.json();
      setSettings(updatedSettings);
      
      toast({
        title: 'Success',
        description: 'AI Agent settings saved successfully',
      });
      
      // Refresh AI Agent data
      await fetchAIAgentData();
    } catch (error) {
      console.error('Error saving AI Agent settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save AI Agent settings',
        variant: 'destructive',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  // Save trading instructions
  const saveInstructions = async () => {
    if (!user) return;
    
    setSavingInstructions(true);
    try {
      const response = await fetch('/api/ai-agent/trading-instructions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instructions
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save trading instructions');
      }
      
      toast({
        title: 'Success',
        description: 'Trading instructions saved successfully',
      });
    } catch (error) {
      console.error('Error saving trading instructions:', error);
      toast({
        title: 'Error',
        description: 'Failed to save trading instructions',
        variant: 'destructive',
      });
    } finally {
      setSavingInstructions(false);
    }
  };

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

      setAnalysisStage('Fetching historical data and AI Agent data...');
      
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

      setAnalysisStage('Generating AI recommendations with Gemini API...');
      
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
            <TabsTrigger value="weekly-picks">Trading</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="agent-data">Agent Data</TabsTrigger>
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
                Use the <code className="bg-muted px-1 py-0.5 rounded">{"{"+"input_data"+"}"}</code> placeholder to include your portfolio and AI agent data in your instructions.
              </p>
            </div>
            
            <div className="flex space-x-2">
              <Button 
                onClick={saveInstructions} 
                disabled={loading || !instructions.trim() || savingInstructions}
                variant="outline"
              >
                {savingInstructions ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Saving...
                  </>
                ) : (
                  'Save Instructions'
                )}
              </Button>
              
              <Button 
                onClick={handleGenerateRecommendations} 
                disabled={loading || !instructions.trim()}
                className="flex-1"
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
            </div>
            
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
          
          <TabsContent value="settings" className="space-y-4">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">AI Agent Trading Constraints</h3>
              <p className="text-sm text-muted-foreground">
                Configure the trading constraints for the AI Agent. These settings will be used to limit the AI Agent's trading activity.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxTradeValue">Max Trade Value (USD)</Label>
                  <Input
                    id="maxTradeValue"
                    type="number"
                    step="0.01"
                    min="0"
                    value={maxTradeValue}
                    onChange={(e) => setMaxTradeValue(e.target.value)}
                    placeholder="100.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum value in USD for a single trade
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="maxDailyTrades">Max Daily Trades</Label>
                  <Input
                    id="maxDailyTrades"
                    type="number"
                    step="1"
                    min="0"
                    value={maxDailyTrades}
                    onChange={(e) => setMaxDailyTrades(e.target.value)}
                    placeholder="5"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum number of trades per day
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="minRiskReward">Min Risk/Reward Ratio</Label>
                  <Input
                    id="minRiskReward"
                    type="number"
                    step="0.1"
                    min="0"
                    value={minRiskReward}
                    onChange={(e) => setMinRiskReward(e.target.value)}
                    placeholder="2.0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum risk/reward ratio for trades (e.g., 2.0 means potential reward is twice the risk)
                  </p>
                </div>
              </div>
              
              <Button 
                onClick={saveSettings} 
                disabled={savingSettings}
                className="w-full mt-4"
              >
                {savingSettings ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Saving...
                  </>
                ) : (
                  'Save Settings'
                )}
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="agent-data" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">AI Agent Data</h3>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchAIAgentData}
                disabled={loadingData}
              >
                {loadingData ? (
                  <>
                    <Spinner className="mr-2 h-3 w-3" />
                    Refreshing...
                  </>
                ) : (
                  'Refresh Data'
                )}
              </Button>
            </div>
            
            {loadingData ? (
              <div className="flex justify-center items-center py-8">
                <Spinner className="h-8 w-8" />
              </div>
            ) : aiAgentData ? (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-md">
                  <h4 className="font-medium mb-2">Account Summary</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium">Available Cash:</p>
                      <p className="text-lg">${aiAgentData.account_summary.available_cash_usd.toFixed(2)}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium">Timestamp:</p>
                      <p className="text-sm">{new Date(aiAgentData.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-muted p-4 rounded-md">
                  <h4 className="font-medium mb-2">Trading Constraints</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm font-medium">Max Trade Value:</p>
                      <p className="text-lg">${aiAgentData.trading_constraints.max_trade_value.toFixed(2)}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium">Max Daily Trades:</p>
                      <p className="text-lg">{aiAgentData.trading_constraints.max_daily_trades}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium">Min Risk/Reward:</p>
                      <p className="text-lg">{aiAgentData.trading_constraints.min_risk_reward.toFixed(1)}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-muted p-4 rounded-md">
                  <h4 className="font-medium mb-2">Open Positions</h4>
                  {aiAgentData.open_positions.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Asset</th>
                            <th className="text-right py-2">Entry Price</th>
                            <th className="text-right py-2">Quantity</th>
                            <th className="text-right py-2">Current Value</th>
                            <th className="text-right py-2">P/L %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiAgentData.open_positions.map((position, index) => (
                            <tr key={index} className="border-b">
                              <td className="py-2">{position.asset}</td>
                              <td className="text-right py-2">${position.entry_price.toFixed(2)}</td>
                              <td className="text-right py-2">{position.quantity.toFixed(4)}</td>
                              <td className="text-right py-2">${position.current_value.toFixed(2)}</td>
                              <td className={`text-right py-2 ${position.profit_loss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {position.profit_loss.toFixed(2)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No open positions</p>
                  )}
                </div>
                
                <div className="bg-muted p-4 rounded-md">
                  <h4 className="font-medium mb-2">Portfolio Allocation</h4>
                  {Object.keys(aiAgentData.account_summary.allocation).length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Asset</th>
                            <th className="text-right py-2">Quantity</th>
                            <th className="text-right py-2">Value (USD)</th>
                            <th className="text-right py-2">Percentage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(aiAgentData.account_summary.allocation).map(([symbol, data], index) => (
                            <tr key={index} className="border-b">
                              <td className="py-2">{symbol}</td>
                              <td className="text-right py-2">{data.quantity.toFixed(4)}</td>
                              <td className="text-right py-2">${data.value_usd.toFixed(2)}</td>
                              <td className="text-right py-2">{data.percentage.toFixed(2)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No portfolio allocation data</p>
                  )}
                </div>
                
                <div className="mt-4">
                  <h4 className="font-medium mb-2">Raw JSON Data</h4>
                  <div className="bg-muted p-4 rounded-md overflow-auto max-h-[300px]">
                    <pre className="text-xs">{JSON.stringify(aiAgentData, null, 2)}</pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No AI Agent data available. Click "Refresh Data" to fetch the latest data.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AIAgent;