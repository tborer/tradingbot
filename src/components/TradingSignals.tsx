import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/use-toast';

interface TradingSignal {
  id: string;
  symbol: string;
  timestamp: string;
  signalType: 'ENTRY' | 'EXIT';
  direction?: 'LONG' | 'SHORT';
  price: number;
  confidence?: number;
  reason: string;
  timeframe: string;
  targetPrice?: number;
  stopLossPrice?: number;
  relatedSignalId?: string;
  profitLoss?: number;
  profitLossPercentage?: number;
  status: 'ACTIVE' | 'EXECUTED' | 'EXPIRED' | 'CANCELLED';
  executedAt?: string;
}

const TradingSignals: React.FC = () => {
  const { user } = useAuth();
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('');
  const [symbols, setSymbols] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  const fetchSignals = async () => {
    try {
      setLoading(true);
      setError(null);

      let url = '/api/trading-signals';
      const params = new URLSearchParams();
      
      if (activeTab !== 'all') {
        params.append('signalType', activeTab.toUpperCase());
      }
      
      if (selectedSymbol) {
        params.append('symbol', selectedSymbol);
      }
      
      if (selectedTimeframe) {
        params.append('timeframe', selectedTimeframe);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch trading signals');
      }
      
      const data = await response.json();
      setSignals(data.signals);
    } catch (err) {
      setError(err.message);
      toast({
        title: 'Error',
        description: `Failed to fetch trading signals: ${err.message}`,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSymbols = async () => {
    try {
      const response = await fetch('/api/cryptos');
      
      if (!response.ok) {
        throw new Error('Failed to fetch cryptocurrencies');
      }
      
      const data = await response.json();
      setSymbols(data.map(crypto => crypto.symbol));
    } catch (err) {
      console.error('Error fetching symbols:', err);
    }
  };

  const generateSignals = async () => {
    try {
      setGenerating(true);
      
      const response = await fetch('/api/trading-signals/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          generateForAll: true,
          timeframe: '1h'
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate trading signals');
      }
      
      const data = await response.json();
      
      toast({
        title: 'Success',
        description: `Generated ${data.reduce((total, item) => total + item.signals.length, 0)} trading signals`,
      });
      
      // Refresh signals
      fetchSignals();
    } catch (err) {
      toast({
        title: 'Error',
        description: `Failed to generate trading signals: ${err.message}`,
        variant: 'destructive'
      });
    } finally {
      setGenerating(false);
    }
  };

  const updateSignalStatus = async (signalId: string, status: string) => {
    try {
      const response = await fetch('/api/trading-signals/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          signalId,
          status,
          executedAt: status === 'EXECUTED' ? new Date().toISOString() : undefined
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update signal status');
      }
      
      // Refresh signals
      fetchSignals();
      
      toast({
        title: 'Success',
        description: `Signal status updated to ${status}`,
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: `Failed to update signal status: ${err.message}`,
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    if (user) {
      fetchSignals();
      fetchSymbols();
    }
  }, [user, activeTab, selectedSymbol, selectedTimeframe]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage.toFixed(2)}%`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-blue-500';
      case 'EXECUTED':
        return 'bg-green-500';
      case 'EXPIRED':
        return 'bg-yellow-500';
      case 'CANCELLED':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getDirectionColor = (direction: string) => {
    return direction === 'LONG' ? 'bg-green-500' : 'bg-red-500';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Trading Signals</h2>
        <Button onClick={generateSignals} disabled={generating}>
          {generating ? <Spinner className="mr-2" /> : null}
          Generate Signals
        </Button>
      </div>

      <div className="flex space-x-4 mb-4">
        <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select Symbol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Symbols</SelectItem>
            {symbols.map(symbol => (
              <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select Timeframe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Timeframes</SelectItem>
            <SelectItem value="1h">1 Hour</SelectItem>
            <SelectItem value="4h">4 Hours</SelectItem>
            <SelectItem value="1d">1 Day</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All Signals</TabsTrigger>
          <TabsTrigger value="entry">Entry Signals</TabsTrigger>
          <TabsTrigger value="exit">Exit Signals</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {renderSignals(signals)}
        </TabsContent>

        <TabsContent value="entry" className="space-y-4">
          {renderSignals(signals.filter(signal => signal.signalType === 'ENTRY'))}
        </TabsContent>

        <TabsContent value="exit" className="space-y-4">
          {renderSignals(signals.filter(signal => signal.signalType === 'EXIT'))}
        </TabsContent>
      </Tabs>
    </div>
  );

  function renderSignals(signalsToRender: TradingSignal[]) {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-40">
          <Spinner />
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center text-red-500">
          {error}
        </div>
      );
    }

    if (signalsToRender.length === 0) {
      return (
        <div className="text-center text-gray-500">
          No trading signals found
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {signalsToRender.map(signal => (
          <Card key={signal.id} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{signal.symbol}</CardTitle>
                  <CardDescription>{formatDate(signal.timestamp)}</CardDescription>
                </div>
                <div className="flex space-x-2">
                  <Badge className={getStatusColor(signal.status)}>{signal.status}</Badge>
                  {signal.direction && (
                    <Badge className={getDirectionColor(signal.direction)}>{signal.direction}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-2">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Signal Type:</span>
                  <span>{signal.signalType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Price:</span>
                  <span>{formatPrice(signal.price)}</span>
                </div>
                {signal.confidence && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Confidence:</span>
                    <Badge className={getConfidenceColor(signal.confidence)}>
                      {formatPercentage(signal.confidence * 100)}
                    </Badge>
                  </div>
                )}
                {signal.targetPrice && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Target Price:</span>
                    <span>{formatPrice(signal.targetPrice)}</span>
                  </div>
                )}
                {signal.stopLossPrice && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Stop Loss:</span>
                    <span>{formatPrice(signal.stopLossPrice)}</span>
                  </div>
                )}
                {signal.profitLoss && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Profit/Loss:</span>
                    <span className={signal.profitLoss > 0 ? 'text-green-500' : 'text-red-500'}>
                      {formatPrice(signal.profitLoss)} ({formatPercentage(signal.profitLossPercentage)})
                    </span>
                  </div>
                )}
                <div className="pt-2">
                  <p className="text-sm text-gray-700">{signal.reason}</p>
                </div>
              </div>
            </CardContent>
            {signal.status === 'ACTIVE' && (
              <CardFooter className="flex justify-between pt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => updateSignalStatus(signal.id, 'EXECUTED')}
                >
                  Mark as Executed
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => updateSignalStatus(signal.id, 'CANCELLED')}
                >
                  Cancel
                </Button>
              </CardFooter>
            )}
          </Card>
        ))}
      </div>
    );
  }
};

export default TradingSignals;