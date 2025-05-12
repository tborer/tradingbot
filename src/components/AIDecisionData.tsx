import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ConsolidatedAIDecisionData } from '@/lib/aiDecisionUtils';

export default function AIDecisionData() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cryptos, setCryptos] = useState<string[]>([]);
  const [selectedCrypto, setSelectedCrypto] = useState<string>('');
  const [decisionData, setDecisionData] = useState<ConsolidatedAIDecisionData | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch user's cryptocurrencies
  useEffect(() => {
    if (!user) return;

    const fetchCryptos = async () => {
      try {
        const response = await fetch('/api/cryptos');
        const data = await response.json();
        
        if (data && Array.isArray(data)) {
          const symbols = data.map(crypto => crypto.symbol);
          setCryptos(symbols);
          
          if (symbols.length > 0 && !selectedCrypto) {
            setSelectedCrypto(symbols[0]);
          }
        }
      } catch (err) {
        console.error('Error fetching cryptocurrencies:', err);
        setError('Failed to load cryptocurrencies');
      }
    };

    fetchCryptos();
  }, [user]);

  // Fetch decision data when selected crypto changes
  useEffect(() => {
    if (!selectedCrypto) return;

    const fetchDecisionData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/ai-decision-data/${selectedCrypto}`);
        
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        setDecisionData(data);
      } catch (err) {
        console.error('Error fetching AI decision data:', err);
        setError('Failed to load AI decision data');
      } finally {
        setLoading(false);
      }
    };

    fetchDecisionData();
  }, [selectedCrypto]);

  // Format price with 2 decimal places
  const formatPrice = (price: number | null) => {
    if (price === null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price);
  };

  // Format percentage with 2 decimal places
  const formatPercent = (percent: number | null) => {
    if (percent === null) return 'N/A';
    return `${percent.toFixed(2)}%`;
  };

  // Format confidence as percentage
  const formatConfidence = (confidence: number | null) => {
    if (confidence === null) return 'N/A';
    return `${(confidence * 100).toFixed(0)}%`;
  };

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Decision Data</CardTitle>
          <CardDescription>Please log in to view AI decision data</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>AI Decision Data</CardTitle>
        <CardDescription>
          Comprehensive data structure for AI-powered trading decisions
        </CardDescription>
        <div className="flex items-center space-x-4">
          <Select value={selectedCrypto} onValueChange={setSelectedCrypto}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select cryptocurrency" />
            </SelectTrigger>
            <SelectContent>
              {cryptos.map(crypto => (
                <SelectItem key={crypto} value={crypto}>{crypto}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            onClick={() => {
              if (selectedCrypto) {
                const fetchDecisionData = async () => {
                  setLoading(true);
                  setError(null);
                  
                  try {
                    const response = await fetch(`/api/ai-decision-data/${selectedCrypto}`);
                    
                    if (!response.ok) {
                      throw new Error(`Error ${response.status}: ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    setDecisionData(data);
                  } catch (err) {
                    console.error('Error fetching AI decision data:', err);
                    setError('Failed to load AI decision data');
                  } finally {
                    setLoading(false);
                  }
                };
                fetchDecisionData();
              }
            }}
          >
            Refresh Data
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Spinner />
          </div>
        ) : error ? (
          <div className="text-red-500 text-center">{error}</div>
        ) : !decisionData ? (
          <div className="text-center">No data available</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="technical">Technical Indicators</TabsTrigger>
              <TabsTrigger value="predictions">Predictions</TabsTrigger>
              <TabsTrigger value="signals">Trading Signals</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Asset Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="font-medium">Asset ID:</span>
                        <span>{decisionData.asset_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Current Price:</span>
                        <span>{formatPrice(decisionData.price_data.current)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">24h Change:</span>
                        <span className={decisionData.price_data.change_24h >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {formatPercent(decisionData.price_data.change_24h)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Last Updated:</span>
                        <span>{new Date(decisionData.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Current Recommendation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="font-medium">Action:</span>
                        <span className={
                          decisionData.trading_signals.entry.recommendation === 'buy' 
                            ? 'text-green-500 font-bold' 
                            : decisionData.trading_signals.entry.recommendation === 'sell'
                              ? 'text-red-500 font-bold'
                              : ''
                        }>
                          {decisionData.trading_signals.entry.recommendation || 'HOLD'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Confidence:</span>
                        <span>{formatConfidence(decisionData.trading_signals.entry.confidence)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Target Price:</span>
                        <span>{formatPrice(decisionData.trading_signals.entry.target_price)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Stop Loss:</span>
                        <span>{formatPrice(decisionData.trading_signals.exit.stop_loss)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Price Predictions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="border rounded p-3">
                      <div className="text-sm text-gray-500 mb-1">1 Hour</div>
                      <div className="text-xl font-bold">{formatPrice(decisionData.prediction_models.price_targets['1h'].prediction)}</div>
                      <div className="text-sm">
                        Confidence: {formatConfidence(decisionData.prediction_models.price_targets['1h'].confidence)}
                      </div>
                    </div>
                    
                    <div className="border rounded p-3">
                      <div className="text-sm text-gray-500 mb-1">24 Hours</div>
                      <div className="text-xl font-bold">{formatPrice(decisionData.prediction_models.price_targets['24h'].prediction)}</div>
                      <div className="text-sm">
                        Confidence: {formatConfidence(decisionData.prediction_models.price_targets['24h'].confidence)}
                      </div>
                    </div>
                    
                    <div className="border rounded p-3">
                      <div className="text-sm text-gray-500 mb-1">7 Days</div>
                      <div className="text-xl font-bold">{formatPrice(decisionData.prediction_models.price_targets['7d'].prediction)}</div>
                      <div className="text-sm">
                        Confidence: {formatConfidence(decisionData.prediction_models.price_targets['7d'].confidence)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="technical" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Moving Averages</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="font-medium">SMA 20:</span>
                        <span>{formatPrice(decisionData.technical_indicators.moving_averages.sma_20)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">SMA 50:</span>
                        <span>{formatPrice(decisionData.technical_indicators.moving_averages.sma_50)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">EMA 12:</span>
                        <span>{formatPrice(decisionData.technical_indicators.moving_averages.ema_12)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">EMA 26:</span>
                        <span>{formatPrice(decisionData.technical_indicators.moving_averages.ema_26)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Bollinger Bands</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="font-medium">Upper Band:</span>
                        <span>{formatPrice(decisionData.technical_indicators.bollinger_bands.upper)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Middle Band:</span>
                        <span>{formatPrice(decisionData.technical_indicators.bollinger_bands.middle)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Lower Band:</span>
                        <span>{formatPrice(decisionData.technical_indicators.bollinger_bands.lower)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Bandwidth:</span>
                        <span>{decisionData.technical_indicators.bollinger_bands.bandwidth?.toFixed(2) || 'N/A'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">RSI & Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="font-medium">RSI Value:</span>
                        <span className={
                          decisionData.technical_indicators.rsi.value && decisionData.technical_indicators.rsi.value > 70 
                            ? 'text-red-500' 
                            : decisionData.technical_indicators.rsi.value && decisionData.technical_indicators.rsi.value < 30
                              ? 'text-green-500'
                              : ''
                        }>
                          {decisionData.technical_indicators.rsi.value?.toFixed(2) || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">RSI Trend:</span>
                        <span>{decisionData.technical_indicators.rsi.trend || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Trend Direction:</span>
                        <span className={
                          decisionData.technical_indicators.trend_analysis.direction === 'bullish' || decisionData.technical_indicators.trend_analysis.direction === 'buy'
                            ? 'text-green-500' 
                            : decisionData.technical_indicators.trend_analysis.direction === 'bearish' || decisionData.technical_indicators.trend_analysis.direction === 'sell'
                              ? 'text-red-500'
                              : ''
                        }>
                          {decisionData.technical_indicators.trend_analysis.direction || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Trend Strength:</span>
                        <span>{decisionData.technical_indicators.trend_analysis.strength?.toFixed(2) || 'N/A'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Support & Resistance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="font-medium">Support Levels:</span>
                        <span>
                          {decisionData.technical_indicators.trend_analysis.support_levels.length > 0
                            ? decisionData.technical_indicators.trend_analysis.support_levels.map(level => formatPrice(level)).join(', ')
                            : 'None detected'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Resistance Levels:</span>
                        <span>
                          {decisionData.technical_indicators.trend_analysis.resistance_levels.length > 0
                            ? decisionData.technical_indicators.trend_analysis.resistance_levels.map(level => formatPrice(level)).join(', ')
                            : 'None detected'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Breakout Patterns:</span>
                        <span>
                          {decisionData.technical_indicators.breakout_patterns.detected.length > 0
                            ? decisionData.technical_indicators.breakout_patterns.detected.join(', ')
                            : 'None detected'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="predictions" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Price Target Predictions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border rounded p-4">
                      <div className="text-lg font-bold mb-2">1 Hour Prediction</div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-sm text-gray-500">Predicted Price</div>
                          <div className="text-lg font-medium">{formatPrice(decisionData.prediction_models.price_targets['1h'].prediction)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Confidence</div>
                          <div className="text-lg font-medium">{formatConfidence(decisionData.prediction_models.price_targets['1h'].confidence)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Range</div>
                          <div className="text-lg font-medium">
                            {formatPrice(decisionData.prediction_models.price_targets['1h'].range[0])} - {formatPrice(decisionData.prediction_models.price_targets['1h'].range[1])}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="border rounded p-4">
                      <div className="text-lg font-bold mb-2">24 Hour Prediction</div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-sm text-gray-500">Predicted Price</div>
                          <div className="text-lg font-medium">{formatPrice(decisionData.prediction_models.price_targets['24h'].prediction)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Confidence</div>
                          <div className="text-lg font-medium">{formatConfidence(decisionData.prediction_models.price_targets['24h'].confidence)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Range</div>
                          <div className="text-lg font-medium">
                            {formatPrice(decisionData.prediction_models.price_targets['24h'].range[0])} - {formatPrice(decisionData.prediction_models.price_targets['24h'].range[1])}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="border rounded p-4">
                      <div className="text-lg font-bold mb-2">7 Day Prediction</div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-sm text-gray-500">Predicted Price</div>
                          <div className="text-lg font-medium">{formatPrice(decisionData.prediction_models.price_targets['7d'].prediction)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Confidence</div>
                          <div className="text-lg font-medium">{formatConfidence(decisionData.prediction_models.price_targets['7d'].confidence)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">Range</div>
                          <div className="text-lg font-medium">
                            {formatPrice(decisionData.prediction_models.price_targets['7d'].range[0])} - {formatPrice(decisionData.prediction_models.price_targets['7d'].range[1])}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Trend Prediction</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-gray-500">Direction</div>
                      <div className="text-lg font-medium">{decisionData.prediction_models.trend_prediction.direction || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Strength</div>
                      <div className="text-lg font-medium">{formatConfidence(decisionData.prediction_models.trend_prediction.strength)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Key Levels</div>
                      <div className="text-lg font-medium">
                        {decisionData.prediction_models.trend_prediction.key_levels.length > 0
                          ? decisionData.prediction_models.trend_prediction.key_levels.map(level => formatPrice(level)).join(', ')
                          : 'None detected'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="signals" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Entry Signal</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Recommendation:</span>
                      <span className={
                        decisionData.trading_signals.entry.recommendation === 'buy' 
                          ? 'text-green-500 font-bold' 
                          : decisionData.trading_signals.entry.recommendation === 'sell'
                            ? 'text-red-500 font-bold'
                            : ''
                      }>
                        {decisionData.trading_signals.entry.recommendation || 'HOLD'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Confidence:</span>
                      <span>{formatConfidence(decisionData.trading_signals.entry.confidence)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Target Price:</span>
                      <span>{formatPrice(decisionData.trading_signals.entry.target_price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Trigger Conditions:</span>
                      <span>{decisionData.trading_signals.entry.trigger_conditions || 'N/A'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Exit Strategy</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Take Profit Targets:</span>
                      <span>
                        {decisionData.trading_signals.exit.take_profit.map((tp, index) => (
                          <div key={index}>
                            {formatPrice(tp.price)} ({tp.portion ? `${(tp.portion * 100).toFixed(0)}%` : 'N/A'})
                          </div>
                        ))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Stop Loss:</span>
                      <span>{formatPrice(decisionData.trading_signals.exit.stop_loss)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Risk/Reward Ratio:</span>
                      <span>{decisionData.trading_signals.risk_reward.ratio?.toFixed(2) || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Expected Value:</span>
                      <span>{formatConfidence(decisionData.trading_signals.risk_reward.expected_value)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}