import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircledIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import { useToast } from '@/components/ui/use-toast';

const AnalysisDataCheck: React.FC = () => {
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const handleCheck = async () => {
    if (!symbol.trim()) {
      toast({
        title: "Symbol Required",
        description: "Please enter a cryptocurrency symbol",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(`/api/data-scheduling/check-analysis-data?symbol=${symbol.trim()}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to check analysis data');
      }

      const data = await response.json();
      setResult(data.data);
      
      toast({
        title: "Data Check Complete",
        description: `Analysis data check completed for ${symbol.trim()}`,
      });
    } catch (error) {
      console.error('Error checking analysis data:', error);
      
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Analysis Data Check</CardTitle>
        <CardDescription>
          Check if technical analysis data exists for a cryptocurrency
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label htmlFor="symbol" className="mb-2 block">Symbol</Label>
              <Input
                id="symbol"
                placeholder="Enter cryptocurrency symbol (e.g. BTC)"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              />
            </div>
            <Button onClick={handleCheck} disabled={loading}>
              {loading ? "Checking..." : "Check Data"}
            </Button>
          </div>

          {result && (
            <div className="space-y-4 mt-4">
              <div className="border p-4 rounded-md">
                <h3 className="font-medium text-lg mb-2">Technical Analysis Data</h3>
                {result.technicalAnalysis.count > 0 ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircledIcon className="h-5 w-5 text-green-500" />
                      <span>{result.technicalAnalysis.count} entries found</span>
                    </div>
                    <div className="text-sm space-y-1">
                      <p>Most recent: {new Date(result.technicalAnalysis.mostRecent.timestamp).toLocaleString()}</p>
                      <p>SMA20: {result.technicalAnalysis.mostRecent.sma20}</p>
                      <p>EMA12: {result.technicalAnalysis.mostRecent.ema12}</p>
                      <p>RSI14: {result.technicalAnalysis.mostRecent.rsi14}</p>
                      <p>Recommendation: {result.technicalAnalysis.mostRecent.recommendation} ({result.technicalAnalysis.mostRecent.confidenceScore.toFixed(2)}%)</p>
                    </div>
                    <div className="mt-2">
                      <h4 className="font-medium mb-1">Recent Entries:</h4>
                      <ul className="text-sm space-y-1">
                        {result.technicalAnalysis.entries.map((entry: any) => (
                          <li key={entry.id}>
                            {new Date(entry.timestamp).toLocaleString()} - {entry.recommendation} ({entry.confidenceScore.toFixed(2)}%)
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-500">
                    <CrossCircledIcon className="h-5 w-5" />
                    <span>No technical analysis data found</span>
                  </div>
                )}
              </div>

              <div className="border p-4 rounded-md">
                <h3 className="font-medium text-lg mb-2">Comprehensive Features</h3>
                {result.comprehensiveFeatures.count > 0 ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircledIcon className="h-5 w-5 text-green-500" />
                      <span>{result.comprehensiveFeatures.count} entries found</span>
                    </div>
                    <div className="text-sm">
                      <p>Most recent: {new Date(result.comprehensiveFeatures.mostRecent.timestamp).toLocaleString()}</p>
                      <p>Has feature set: {result.comprehensiveFeatures.mostRecent.hasFeatureSet ? 'Yes' : 'No'}</p>
                      <p>Has model-ready features: {result.comprehensiveFeatures.mostRecent.hasModelReadyFeatures ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-500">
                    <CrossCircledIcon className="h-5 w-5" />
                    <span>No comprehensive features found</span>
                  </div>
                )}
              </div>

              <div className="border p-4 rounded-md">
                <h3 className="font-medium text-lg mb-2">Hourly Historical Data</h3>
                {result.hourlyData.count > 0 ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircledIcon className="h-5 w-5 text-green-500" />
                      <span>{result.hourlyData.count} entries found</span>
                    </div>
                    <div className="text-sm">
                      <p>Most recent: {new Date(Number(result.hourlyData.mostRecent.timestamp) * 1000).toLocaleString()}</p>
                      <p>Open: {result.hourlyData.mostRecent.open}</p>
                      <p>High: {result.hourlyData.mostRecent.high}</p>
                      <p>Low: {result.hourlyData.mostRecent.low}</p>
                      <p>Close: {result.hourlyData.mostRecent.close}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-500">
                    <CrossCircledIcon className="h-5 w-5" />
                    <span>No hourly historical data found</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AnalysisDataCheck;