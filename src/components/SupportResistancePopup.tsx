import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAnalysis } from "@/contexts/AnalysisContext";
import { useToast } from "@/components/ui/use-toast";
import SupportResistanceLevelCard from './SupportResistanceLevelCard';

interface SupportResistancePopupProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
}

interface SupportResistanceLevel {
  price: number;
  strength: number;
  touches: number;
  isOptimal: boolean;
  scores?: {
    cleanTouches: number;
    touchPrecision: number;
    approachSpeed: number;
    candleBehavior: number;
    nearbyPriceHistory: number;
    potentialRR: number;
    marketContext: number;
    totalScore: number;
    probability: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

interface SupportResistanceData {
  supportLevels: SupportResistanceLevel[];
  resistanceLevels: SupportResistanceLevel[];
}

interface AnalysisData {
  supportResistance?: SupportResistanceData;
}

const SupportResistancePopup: React.FC<SupportResistancePopupProps> = ({ isOpen, onClose, symbol }) => {
  const { toast } = useToast();
  const { getItem, updateItem } = useAnalysis();
  const [loading, setLoading] = useState(true);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Function to perform support/resistance analysis
  const performSupportResistanceAnalysis = useCallback(async (symbol: string) => {
    setIsAnalyzing(true);
    setError(null);
    
    // Normalize the symbol to uppercase for consistency
    const normalizedSymbol = symbol.toUpperCase();
    console.log(`Starting support/resistance analysis for ${normalizedSymbol} (original: ${symbol})`);
    
    try {
      // Call the API endpoint for support/resistance analysis
      const response = await fetch('/api/cryptos/support-resistance-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol: normalizedSymbol }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`Support/resistance analysis API error:`, errorData);
        
        // Special handling for 404 (no historical data available)
        if (response.status === 404) {
          // Check if we have more detailed information
          if (errorData.totalRecords !== undefined) {
            if (errorData.totalRecords > 0) {
              throw new Error(`Historical data exists for ${normalizedSymbol} (${errorData.totalRecords} records), but none in the last 30 days. Please upload more recent data.`);
            } else {
              throw new Error(`No historical data available for ${normalizedSymbol}. Please upload historical data first.`);
            }
          } else {
            throw new Error(errorData.message || 'No historical data available for this cryptocurrency. Please upload historical data first.');
          }
        }
        
        throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`Received support/resistance analysis data:`, data);
      
      const analysis = data.analysis;
      
      if (analysis) {
        console.log(`Processing analysis data for ${symbol}:`, analysis);
        
        // Create analysis data object
        const newAnalysisData: AnalysisData = {
          supportResistance: {
            supportLevels: analysis.supportLevels || [],
            resistanceLevels: analysis.resistanceLevels || []
          }
        };
        
        // Update local state
        setAnalysisData(newAnalysisData);
        setLoading(false);
        
        // Also update the analysis context if the item exists there
        const item = getItem(symbol);
        if (item) {
          const updatedAnalysisData = {
            ...item.analysisData || {},
            supportResistance: newAnalysisData.supportResistance
          };
          
          console.log(`Updating item in analysis context with new data:`, updatedAnalysisData);
          updateItem(item.id, { analysisData: updatedAnalysisData });
        }
        
        // Show success toast
        toast({
          title: "Analysis Complete",
          description: `Support/resistance analysis for ${symbol} completed successfully`,
        });
      } else {
        console.error(`No analysis data returned for ${symbol}`);
        throw new Error(`No analysis data returned for ${symbol}`);
      }
    } catch (error) {
      console.error("Error performing support/resistance analysis:", error);
      
      // Set error state
      setError(error instanceof Error ? error.message : "Failed to analyze support/resistance levels");
      
      // Show error in UI
      toast({
        title: "Analysis Error",
        description: error instanceof Error ? error.message : "Failed to analyze support/resistance levels",
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
      console.log(`SupportResistancePopup opened for symbol: ${symbol}`);
      setLoading(true);
      setError(null);
      
      // First check if we have data in the analysis context
      const item = getItem(symbol);
      
      if (item && item.analysisData && item.analysisData.supportResistance) {
        console.log(`Analysis data found in context for ${symbol}:`, item.analysisData);
        setAnalysisData(item.analysisData);
        setLoading(false);
      } else {
        // No data in context, perform analysis directly from historical data
        console.log(`No analysis data found in context for ${symbol}, initiating analysis...`);
        performSupportResistanceAnalysis(symbol);
      }
    }
  }, [isOpen, symbol, getItem, performSupportResistanceAnalysis]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Support/Resistance Analysis for {symbol}</DialogTitle>
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
                There was a problem analyzing support/resistance levels for {symbol}.
                Please try again later.
              </p>
              <button 
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  performSupportResistanceAnalysis(symbol);
                }}
              >
                Retry Analysis
              </button>
            </div>
          ) : analysisData?.supportResistance ? (
            <div className="space-y-4 p-4">
              {/* Support Levels */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-lg font-medium mb-2">Support Levels</h3>
                  {analysisData.supportResistance.supportLevels.length > 0 ? (
                    <div className="space-y-3">
                      {analysisData.supportResistance.supportLevels.map((level, index) => (
                        <SupportResistanceLevelCard key={index} level={level} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-2">No support levels identified</p>
                  )}
                </CardContent>
              </Card>
              
              {/* Resistance Levels */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-lg font-medium mb-2">Resistance Levels</h3>
                  {analysisData.supportResistance.resistanceLevels.length > 0 ? (
                    <div className="space-y-3">
                      {analysisData.supportResistance.resistanceLevels.map((level, index) => (
                        <SupportResistanceLevelCard key={index} level={level} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-2">No resistance levels identified</p>
                  )}
                </CardContent>
              </Card>
              
              {isAnalyzing && (
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  Analyzing historical data for {symbol}...
                </p>
              )}
              {!isAnalyzing && !analysisData.supportResistance && (
                <button 
                  className="mt-4 w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                  onClick={() => {
                    performSupportResistanceAnalysis(symbol);
                  }}
                >
                  Analyze Support/Resistance
                </button>
              )}
            </div>
          ) : (
            <div className="text-center py-6 p-4">
              <p className="text-muted-foreground">No analysis data available for {symbol} yet.</p>
              <p className="text-sm mt-2">Click the button below to start analysis.</p>
              <button 
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                onClick={() => {
                  setLoading(true);
                  performSupportResistanceAnalysis(symbol);
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

export default SupportResistancePopup;