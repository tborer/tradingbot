import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalysis } from "@/contexts/AnalysisContext";

interface TrendsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
}

const TrendsPopup: React.FC<TrendsPopupProps> = ({ isOpen, onClose, symbol }) => {
  const { getItem } = useAnalysis();
  const [loading, setLoading] = useState(true);
  const [analysisData, setAnalysisData] = useState<any>(null);

  useEffect(() => {
    if (isOpen && symbol) {
      setLoading(true);
      
      // Get the analysis data for this symbol
      const item = getItem(symbol);
      
      if (item && item.analysisData) {
        setAnalysisData(item.analysisData);
        setLoading(false);
      } else {
        // If no analysis data is available yet, keep loading state
        setAnalysisData(null);
      }
    }
  }, [isOpen, symbol, getItem]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Trend Analysis for {symbol}</DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : analysisData ? (
          <div className="space-y-4">
            {/* Moving Averages */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-2">Moving Averages</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">SMA 20</p>
                    <p className="text-lg font-medium">{analysisData.sma?.sma20 ? `$${analysisData.sma.sma20.toFixed(2)}` : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">SMA 50</p>
                    <p className="text-lg font-medium">{analysisData.sma?.sma50 ? `$${analysisData.sma.sma50.toFixed(2)}` : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">EMA 12</p>
                    <p className="text-lg font-medium">{analysisData.ema?.ema12 ? `$${analysisData.ema.ema12.toFixed(2)}` : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">EMA 26</p>
                    <p className="text-lg font-medium">{analysisData.ema?.ema26 ? `$${analysisData.ema.ema26.toFixed(2)}` : 'N/A'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* RSI */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-2">Relative Strength Index (RSI)</h3>
                <div>
                  <p className="text-lg font-medium">{analysisData.rsi ? `${analysisData.rsi.toFixed(2)}` : 'N/A'}</p>
                  {analysisData.rsi && (
                    <p className="text-sm text-muted-foreground">
                      {analysisData.rsi > 70 ? 'Overbought' : analysisData.rsi < 30 ? 'Oversold' : 'Neutral'}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
            
            {/* Support and Resistance */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-2">Support and Resistance</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Support</p>
                    <p className="text-lg font-medium">{analysisData.trendLines?.support ? `$${analysisData.trendLines.support.toFixed(2)}` : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Resistance</p>
                    <p className="text-lg font-medium">{analysisData.trendLines?.resistance ? `$${analysisData.trendLines.resistance.toFixed(2)}` : 'N/A'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Bollinger Bands */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-2">Bollinger Bands</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Upper</p>
                    <p className="text-lg font-medium">{analysisData.bollingerBands?.upper ? `$${analysisData.bollingerBands.upper.toFixed(2)}` : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Middle</p>
                    <p className="text-lg font-medium">{analysisData.bollingerBands?.middle ? `$${analysisData.bollingerBands.middle.toFixed(2)}` : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Lower</p>
                    <p className="text-lg font-medium">{analysisData.bollingerBands?.lower ? `$${analysisData.bollingerBands.lower.toFixed(2)}` : 'N/A'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-muted-foreground">No analysis data available for {symbol} yet.</p>
            <p className="text-sm mt-2">Analysis will be displayed here once it's complete.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TrendsPopup;