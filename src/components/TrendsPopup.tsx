import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAnalysis } from "@/contexts/AnalysisContext";
import { useToast } from "@/components/ui/use-toast";
import { ErrorCategory, ErrorSeverity } from '@/lib/errorLogger';

interface TrendsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
}

const TrendsPopup: React.FC<TrendsPopupProps> = ({ isOpen, onClose, symbol }) => {
  const { toast } = useToast();
  const { getItem, updateItem } = useAnalysis();
  const [loading, setLoading] = useState(true);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Function to perform drawdown/drawup analysis
  const performDrawdownDrawupAnalysis = useCallback(async (symbol: string, itemId: string) => {
    setIsAnalyzing(true);
    setError(null);
    
    console.log(`Starting trend analysis for ${symbol} with item ID ${itemId}`);
    
    try {
      // Call the API endpoint for trend analysis
      const response = await fetch('/api/cryptos/trend-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.message || errorData.error || `API error: ${response.status}`;
        console.error(`Trend analysis API error: ${errorMessage}`);
        
        // Special handling for 404 (no historical data available)
        if (response.status === 404) {
          throw new Error('No historical data available for this cryptocurrency. Please upload historical data first.');
        }
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log(`Received trend analysis data:`, data);
      
      const analysis = data.analysis;
      
      if (analysis) {
        console.log(`Processing analysis data for ${symbol}:`, analysis);
        
        // Update the analysis data in context
        const item = getItem(symbol);
        
        if (item) {
          const updatedAnalysisData = {
            ...item.analysisData || {},
            drawdownDrawup: {
              maxDrawdown: analysis.maxDrawdown,
              maxDrawup: analysis.maxDrawup,
              avgDrawdown: analysis.avgDrawdown,
              avgDrawup: analysis.avgDrawup,
              frequentDrawdown: analysis.frequentDrawdown,
              frequentDrawup: analysis.frequentDrawup,
              stdDevDrawdown: analysis.stdDevDrawdown,
              stdDevDrawup: analysis.stdDevDrawup,
              medianDrawdown: analysis.medianDrawdown,
              medianDrawup: analysis.medianDrawup
            }
          };
          
          console.log(`Updating item ${itemId} with new analysis data:`, updatedAnalysisData);
          updateItem(itemId, { analysisData: updatedAnalysisData });
          
          // Update local state
          setAnalysisData(updatedAnalysisData);
          setLoading(false);
          
          // Show success toast
          toast({
            title: "Analysis Complete",
            description: `Trend analysis for ${symbol} completed successfully`,
          });
        } else {
          console.error(`Item for symbol ${symbol} not found after analysis`);
          throw new Error(`Item for symbol ${symbol} not found`);
        }
      } else {
        console.error(`No analysis data returned for ${symbol}`);
        throw new Error(`No analysis data returned for ${symbol}`);
      }
    } catch (error) {
      console.error("Error performing drawdown/drawup analysis:", error);
      
      // Set error state
      setError(error instanceof Error ? error.message : "Failed to analyze trends");
      
      // Show error in UI
      toast({
        title: "Analysis Error",
        description: error instanceof Error ? error.message : "Failed to analyze trends",
        variant: "destructive"
      });
      
      // Set loading to false to show error state
      setLoading(false);
    } finally {
      setIsAnalyzing(false);
    }
  }, [getItem, updateItem, toast]);

  useEffect(() => {
    if (isOpen && symbol) {
      console.log(`TrendsPopup opened for symbol: ${symbol}`);
      setLoading(true);
      setError(null);
      
      // Get the analysis data for this symbol
      const item = getItem(symbol);
      console.log(`Retrieved item for ${symbol}:`, item);
      
      if (item) {
        if (item.analysisData) {
          console.log(`Analysis data found for ${symbol}:`, item.analysisData);
          setAnalysisData(item.analysisData);
          
          // If we don't have drawdown/drawup analysis yet, fetch it
          if (!item.analysisData.drawdownDrawup && !isAnalyzing) {
            console.log(`No drawdown/drawup data found for ${symbol}, fetching...`);
            performDrawdownDrawupAnalysis(symbol, item.id);
          } else {
            console.log(`Using existing drawdown/drawup data for ${symbol}`);
            setLoading(false);
          }
        } else {
          console.log(`No analysis data found for ${symbol}, initiating analysis...`);
          // No analysis data available yet, initiate analysis
          performDrawdownDrawupAnalysis(symbol, item.id);
        }
      } else {
        console.error(`No item found for symbol ${symbol}`);
        setError(`No data found for ${symbol}`);
        setLoading(false);
      }
    }
  }, [isOpen, symbol, getItem, isAnalyzing, performDrawdownDrawupAnalysis]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Trend Analysis for {symbol}</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[calc(90vh-120px)]">
          {loading ? (
            <div className="space-y-4 p-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : error ? (
            <div className="text-center py-6 p-4">
              <p className="text-destructive font-medium">Error: {error}</p>
              <p className="text-sm mt-2 text-muted-foreground">
                There was a problem analyzing trends for {symbol}.
                Please try again later.
              </p>
              <button 
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                onClick={() => {
                  const item = getItem(symbol);
                  if (item) {
                    setLoading(true);
                    setError(null);
                    performDrawdownDrawupAnalysis(symbol, item.id);
                  }
                }}
              >
                Retry Analysis
              </button>
            </div>
          ) : analysisData ? (
            <div className="space-y-4 p-4">
              {/* Drawdown and Drawup Analysis - Keep only this section */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-lg font-medium mb-2">Drawdown & Drawup Analysis</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Max Drawdown</p>
                      <p className="text-lg font-medium">
                        {analysisData.drawdownDrawup?.maxDrawdown !== undefined
                          ? `${analysisData.drawdownDrawup.maxDrawdown.toFixed(2)}%` 
                          : isAnalyzing ? 'Analyzing...' : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Max Drawup</p>
                      <p className="text-lg font-medium">
                        {analysisData.drawdownDrawup?.maxDrawup !== undefined
                          ? `${analysisData.drawdownDrawup.maxDrawup.toFixed(2)}%` 
                          : isAnalyzing ? 'Analyzing...' : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Drawdown</p>
                      <p className="text-lg font-medium">
                        {analysisData.drawdownDrawup?.avgDrawdown !== undefined
                          ? `${analysisData.drawdownDrawup.avgDrawdown.toFixed(2)}%` 
                          : isAnalyzing ? 'Analyzing...' : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Drawup</p>
                      <p className="text-lg font-medium">
                        {analysisData.drawdownDrawup?.avgDrawup !== undefined
                          ? `${analysisData.drawdownDrawup.avgDrawup.toFixed(2)}%` 
                          : isAnalyzing ? 'Analyzing...' : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Median Drawdown</p>
                      <p className="text-lg font-medium">
                        {analysisData.drawdownDrawup?.medianDrawdown !== undefined
                          ? `${analysisData.drawdownDrawup.medianDrawdown.toFixed(2)}%` 
                          : isAnalyzing ? 'Analyzing...' : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Median Drawup</p>
                      <p className="text-lg font-medium">
                        {analysisData.drawdownDrawup?.medianDrawup !== undefined
                          ? `${analysisData.drawdownDrawup.medianDrawup.toFixed(2)}%` 
                          : isAnalyzing ? 'Analyzing...' : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">StdDev Drawdown</p>
                      <p className="text-lg font-medium">
                        {analysisData.drawdownDrawup?.stdDevDrawdown !== undefined
                          ? `${analysisData.drawdownDrawup.stdDevDrawdown.toFixed(2)}%` 
                          : isAnalyzing ? 'Analyzing...' : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">StdDev Drawup</p>
                      <p className="text-lg font-medium">
                        {analysisData.drawdownDrawup?.stdDevDrawup !== undefined
                          ? `${analysisData.drawdownDrawup.stdDevDrawup.toFixed(2)}%` 
                          : isAnalyzing ? 'Analyzing...' : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Frequent Drawdown</p>
                      <p className="text-lg font-medium">
                        {analysisData.drawdownDrawup?.frequentDrawdown !== undefined
                          ? `${analysisData.drawdownDrawup.frequentDrawdown.toFixed(2)}%` 
                          : isAnalyzing ? 'Analyzing...' : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Frequent Drawup</p>
                      <p className="text-lg font-medium">
                        {analysisData.drawdownDrawup?.frequentDrawup !== undefined
                          ? `${analysisData.drawdownDrawup.frequentDrawup.toFixed(2)}%` 
                          : isAnalyzing ? 'Analyzing...' : 'N/A'}
                      </p>
                    </div>
                  </div>
                  {isAnalyzing && (
                    <p className="text-sm text-muted-foreground mt-4 text-center">
                      Analyzing historical data for {symbol}...
                    </p>
                  )}
                  {!isAnalyzing && !analysisData.drawdownDrawup && (
                    <button 
                      className="mt-4 w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                      onClick={() => {
                        const item = getItem(symbol);
                        if (item) {
                          performDrawdownDrawupAnalysis(symbol, item.id);
                        }
                      }}
                    >
                      Analyze Trends
                    </button>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-6 p-4">
              <p className="text-muted-foreground">No analysis data available for {symbol} yet.</p>
              <p className="text-sm mt-2">Click the button below to start analysis.</p>
              <button 
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                onClick={() => {
                  const item = getItem(symbol);
                  if (item) {
                    setLoading(true);
                    performDrawdownDrawupAnalysis(symbol, item.id);
                  } else {
                    toast({
                      title: "Error",
                      description: `No data found for ${symbol}`,
                      variant: "destructive"
                    });
                  }
                }}
              >
                Start Analysis
              </button>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default TrendsPopup;