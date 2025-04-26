import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CheckCircle, AlertCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useMicroProcessing } from '@/hooks/useMicroProcessing';
import { formatDecimal } from '@/util/number';
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function MicroProcessingStatus() {
  const { toast } = useToast();
  const { 
    enabledCryptos, 
    loading, 
    error, 
    isProcessing, 
    refreshCryptos 
  } = useMicroProcessing();
  
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [logs, setLogs] = useState<string[]>([]);
  const [manualTradingEnabled, setManualTradingEnabled] = useState<boolean | null>(null);
  
  // Fetch logs from local storage on mount
  useEffect(() => {
    const storedLogs = localStorage.getItem('microProcessingLogs');
    if (storedLogs) {
      try {
        setLogs(JSON.parse(storedLogs));
      } catch (e) {
        console.error('Error parsing stored logs:', e);
        setLogs([]);
      }
    }
    
    // Log component mount
    const timestamp = new Date().toLocaleTimeString();
    const mountLog = `[${timestamp}] 🟢 Micro processing status component mounted`;
    setLogs(prevLogs => [mountLog, ...prevLogs].slice(0, 100));
    
    return () => {
      // Log component unmount
      const unmountTimestamp = new Date().toLocaleTimeString();
      const unmountLog = `[${unmountTimestamp}] 🔵 Micro processing status component unmounted`;
      const currentLogs = JSON.parse(localStorage.getItem('microProcessingLogs') || '[]');
      localStorage.setItem('microProcessingLogs', JSON.stringify([unmountLog, ...currentLogs].slice(0, 100)));
    };
  }, []);
  
  // Check if manual trading is enabled
  useEffect(() => {
    const checkManualTradingEnabled = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const settings = await response.json();
          setManualTradingEnabled(settings.enableManualCryptoTrading === true);
          
          if (settings.enableManualCryptoTrading !== true) {
            addLog('Manual crypto trading is not enabled. Micro-processing trades will fail.', 'warning');
          } else {
            addLog('Manual crypto trading is enabled. Micro-processing can execute trades.', 'info');
          }
        }
      } catch (error) {
        console.error('Error checking manual trading settings:', error);
        addLog('Failed to check manual trading settings', 'error');
      }
    };
    
    checkManualTradingEnabled();
  }, []);
  
  // Add a log entry
  const addLog = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    let prefix = '';
    
    switch (level) {
      case 'warning':
        prefix = '⚠️ ';
        break;
      case 'error':
        prefix = '🔴 ';
        break;
      default:
        prefix = '📝 ';
    }
    
    const logEntry = `[${timestamp}] ${prefix}${message}`;
    
    // Also log to console for debugging
    if (level === 'error') {
      console.error(message);
    } else if (level === 'warning') {
      console.warn(message);
    } else {
      console.log(message);
    }
    
    setLogs(prevLogs => {
      // Keep only the last 100 logs
      const newLogs = [logEntry, ...prevLogs].slice(0, 100);
      
      // Store in local storage
      localStorage.setItem('microProcessingLogs', JSON.stringify(newLogs));
      
      return newLogs;
    });
  };
  
  // Handle manual refresh
  const handleRefresh = async () => {
    try {
      addLog('Starting manual refresh of micro processing cryptos');
      await refreshCryptos();
      setLastRefreshed(new Date());
      addLog('Successfully refreshed micro processing cryptos');
      
      toast({
        title: "Refreshed",
        description: "Micro processing data has been refreshed.",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error refreshing micro processing:', err);
      addLog(`Error refreshing micro processing: ${errorMessage}`, 'error');
      
      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: `Failed to refresh micro processing data: ${errorMessage}`,
      });
    }
  };
  
  // Format status for display
  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case 'idle':
        return <Badge variant="outline">Idle</Badge>;
      case 'buying':
        return <Badge variant="secondary">Buying</Badge>;
      case 'selling':
        return <Badge variant="default">Selling</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="animate-pulse">Processing</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Micro Processing Status</span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={loading || isProcessing}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </CardTitle>
        <CardDescription>
          Client-side micro processing for automated trading
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-md flex items-center">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        {manualTradingEnabled === false && (
          <Alert variant="warning" className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertDescription className="text-yellow-700 dark:text-yellow-300">
              Manual crypto trading is not enabled. Micro-processing trades will fail. 
              <Button 
                variant="link" 
                className="p-0 h-auto text-yellow-700 dark:text-yellow-300 underline font-medium"
                onClick={() => {
                  // Navigate to settings tab
                  const settingsTab = document.querySelector('[value="settings"]') as HTMLElement;
                  if (settingsTab) {
                    settingsTab.click();
                    // Add a small delay to ensure the tab has changed
                    setTimeout(() => {
                      // Try to scroll to the manual trading section
                      const manualTradingSection = document.getElementById('enableManualCryptoTrading');
                      if (manualTradingSection) {
                        manualTradingSection.scrollIntoView({ behavior: 'smooth' });
                        // Add a highlight effect
                        manualTradingSection.classList.add('ring-2', 'ring-yellow-500', 'ring-opacity-50');
                        setTimeout(() => {
                          manualTradingSection.classList.remove('ring-2', 'ring-yellow-500', 'ring-opacity-50');
                        }, 3000);
                      }
                    }, 300);
                  }
                }}
              >
                Enable it in settings
              </Button>
            </AlertDescription>
          </Alert>
        )}
        
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : enabledCryptos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No cryptocurrencies with enabled micro processing found.</p>
            <p className="text-sm mt-2">Enable micro processing in the crypto settings.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground mb-2">
              Last refreshed: {lastRefreshed.toLocaleTimeString()}
              {isProcessing && (
                <Badge variant="outline" className="ml-2 animate-pulse">
                  Processing...
                </Badge>
              )}
            </div>
            
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="py-2 px-4 text-left font-medium">Symbol</th>
                    <th className="py-2 px-4 text-left font-medium">Current Price</th>
                    <th className="py-2 px-4 text-left font-medium">Status</th>
                    <th className="py-2 px-4 text-left font-medium">Last Buy</th>
                    <th className="py-2 px-4 text-left font-medium">Sell %</th>
                  </tr>
                </thead>
                <tbody>
                  {enabledCryptos.map(crypto => (
                    <tr key={crypto.id} className="border-b">
                      <td className="py-2 px-4 font-medium">{crypto.symbol}</td>
                      <td className="py-2 px-4">
                        ${formatDecimal(crypto.currentPrice || 0, 2)}
                      </td>
                      <td className="py-2 px-4">
                        {getStatusBadge(crypto.microProcessingSettings?.processingStatus)}
                      </td>
                      <td className="py-2 px-4">
                        {crypto.microProcessingSettings?.lastBuyPrice ? (
                          <span>${formatDecimal(crypto.microProcessingSettings.lastBuyPrice, 2)}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2 px-4">
                        {crypto.microProcessingSettings?.sellPercentage}%
                        {crypto.microProcessingSettings?.testMode && (
                          <Badge variant="outline" className="ml-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                            Test Mode
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Activity Log</h4>
              <div className="bg-muted/50 rounded-md p-2 h-40 overflow-y-auto text-xs font-mono">
                {logs.length === 0 ? (
                  <div className="text-muted-foreground text-center py-4">
                    No activity logs yet
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="py-1 border-b border-muted last:border-0">
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-between">
        <div className="text-xs text-muted-foreground">
          {enabledCryptos.length} crypto{enabledCryptos.length !== 1 ? 's' : ''} with micro processing enabled
        </div>
        
        {enabledCryptos.length > 0 && (
          <div className="flex items-center text-xs text-muted-foreground">
            <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
            Client-side processing active
          </div>
        )}
      </CardFooter>
    </Card>
  );
}