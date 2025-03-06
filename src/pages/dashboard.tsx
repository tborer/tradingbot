import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import { parseFinnhubMessage, shouldSellStock, StockPrice } from "@/lib/finnhub";
import { Trash2 } from "lucide-react";

// Types
interface Stock {
  id: string;
  ticker: string;
  purchasePrice: number;
  createdAt: string;
}

interface Settings {
  id: string;
  sellThresholdPercent: number;
  checkFrequencySeconds: number;
}

interface StockWithCurrentPrice extends Stock {
  currentPrice?: number;
  percentChange?: number;
  shouldSell?: boolean;
}

export default function Dashboard() {
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const [stocks, setStocks] = useState<StockWithCurrentPrice[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [newStock, setNewStock] = useState({ ticker: "", purchasePrice: "" });
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch stocks and settings
  const fetchStocks = useCallback(async () => {
    try {
      const response = await fetch("/api/stocks");
      if (response.ok) {
        const data = await response.json();
        setStocks(data);
      } else {
        throw new Error("Failed to fetch stocks");
      }
    } catch (error) {
      console.error("Error fetching stocks:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load your stocks. Please try again.",
      });
    }
  }, [toast]);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      } else {
        throw new Error("Failed to fetch settings");
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load your settings. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Initialize data
  useEffect(() => {
    if (user) {
      fetchStocks();
      fetchSettings();
    }
  }, [user, fetchStocks, fetchSettings]);

  // Connect to Finnhub websocket
  const connectWebSocket = useCallback(() => {
    if (!process.env.NEXT_PUBLIC_FINNHUB_API_KEY) {
      toast({
        variant: "destructive",
        title: "Configuration Error",
        description: "Finnhub API key is not configured.",
      });
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(`wss://ws.finnhub.io?token=${process.env.NEXT_PUBLIC_FINNHUB_API_KEY}`);
      
      ws.onopen = () => {
        setConnected(true);
        toast({
          title: "Connected",
          description: "Connected to Finnhub websocket",
        });
        
        // Subscribe to all stocks
        stocks.forEach(stock => {
          ws.send(JSON.stringify({ type: "subscribe", symbol: stock.ticker }));
        });
      };
      
      ws.onmessage = (event) => {
        const stockPrices = parseFinnhubMessage(event.data);
        
        if (stockPrices.length > 0) {
          updateStockPrices(stockPrices);
          setLastUpdated(new Date());
        }
      };
      
      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setConnected(false);
        toast({
          variant: "destructive",
          title: "Connection Error",
          description: "Failed to connect to Finnhub. Will retry shortly.",
        });
      };
      
      ws.onclose = () => {
        setConnected(false);
        // Attempt to reconnect after a delay
        setTimeout(connectWebSocket, 5000);
      };
      
      wsRef.current = ws;
      
      // Clean up on unmount
      return () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          stocks.forEach(stock => {
            wsRef.current?.send(JSON.stringify({ type: "unsubscribe", symbol: stock.ticker }));
          });
          wsRef.current.close();
        }
      };
    } catch (error) {
      console.error("WebSocket connection error:", error);
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: "Failed to connect to Finnhub. Will retry shortly.",
      });
      setTimeout(connectWebSocket, 5000);
    }
  }, [stocks, toast]);

  // Update stock prices from websocket data
  const updateStockPrices = (stockPrices: StockPrice[]) => {
    setStocks(prevStocks => {
      return prevStocks.map(stock => {
        const priceData = stockPrices.find(sp => sp.ticker === stock.ticker);
        
        if (priceData) {
          const percentChange = stock.purchasePrice > 0 
            ? ((priceData.price - stock.purchasePrice) / stock.purchasePrice) * 100 
            : 0;
            
          const shouldSell = settings 
            ? shouldSellStock(priceData.price, stock.purchasePrice, settings.sellThresholdPercent) 
            : false;
            
          return {
            ...stock,
            currentPrice: priceData.price,
            percentChange,
            shouldSell,
          };
        }
        
        return stock;
      });
    });
  };

  // Set up periodic connection check
  useEffect(() => {
    if (!loading && stocks.length > 0 && settings) {
      // Clear any existing timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      // Connect initially
      connectWebSocket();
      
      // Set up periodic reconnection
      timerRef.current = setInterval(() => {
        if (!connected) {
          connectWebSocket();
        }
      }, settings.checkFrequencySeconds * 1000);
      
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [loading, stocks, settings, connected, connectWebSocket]);

  // Add a new stock
  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newStock.ticker || !newStock.purchasePrice) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter both ticker symbol and purchase price.",
      });
      return;
    }
    
    try {
      const response = await fetch("/api/stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: newStock.ticker.toUpperCase(),
          purchasePrice: parseFloat(newStock.purchasePrice),
        }),
      });
      
      if (response.ok) {
        const newStockData = await response.json();
        setStocks(prev => [...prev, newStockData]);
        setNewStock({ ticker: "", purchasePrice: "" });
        
        // Subscribe to the new stock in the websocket
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ 
            type: "subscribe", 
            symbol: newStockData.ticker 
          }));
        }
        
        toast({
          title: "Success",
          description: `Added ${newStockData.ticker} to your portfolio.`,
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to add stock");
      }
    } catch (error: any) {
      console.error("Error adding stock:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to add stock. Please try again.",
      });
    }
  };

  // Delete a stock
  const handleDeleteStock = async (id: string, ticker: string) => {
    try {
      const response = await fetch(`/api/stocks/${id}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        // Unsubscribe from the stock in the websocket
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "unsubscribe", symbol: ticker }));
        }
        
        setStocks(prev => prev.filter(stock => stock.id !== id));
        
        toast({
          title: "Success",
          description: `Removed ${ticker} from your portfolio.`,
        });
      } else {
        throw new Error("Failed to delete stock");
      }
    } catch (error) {
      console.error("Error deleting stock:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete stock. Please try again.",
      });
    }
  };

  // Update settings
  const handleUpdateSettings = async () => {
    if (!settings) return;
    
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellThresholdPercent: settings.sellThresholdPercent,
          checkFrequencySeconds: settings.checkFrequencySeconds,
        }),
      });
      
      if (response.ok) {
        const updatedSettings = await response.json();
        setSettings(updatedSettings);
        
        // Reset the timer with new frequency
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            if (!connected) {
              connectWebSocket();
            }
          }, updatedSettings.checkFrequencySeconds * 1000);
        }
        
        toast({
          title: "Success",
          description: "Settings updated successfully.",
        });
      } else {
        throw new Error("Failed to update settings");
      }
    } catch (error) {
      console.error("Error updating settings:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update settings. Please try again.",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-lg">Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">StockTracker Dashboard</h1>
          <Button
            onClick={() => {
              signOut();
            }}
            variant="outline"
          >
            Log Out
          </Button>
        </div>
      </header>
      
      <main className="flex-1 p-6">
        <Tabs defaultValue="portfolio" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="portfolio" className="space-y-6">
            {/* Connection Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-muted-foreground">
                  {connected ? 'Connected to Finnhub' : 'Disconnected'}
                </span>
              </div>
              {lastUpdated && (
                <span className="text-sm text-muted-foreground">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
            
            {/* Add New Stock Form */}
            <Card>
              <CardHeader>
                <CardTitle>Add Stock to Portfolio</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddStock} className="flex flex-col gap-4 md:flex-row md:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="ticker">Ticker Symbol</Label>
                    <Input
                      id="ticker"
                      placeholder="e.g. AAPL"
                      value={newStock.ticker}
                      onChange={(e) => setNewStock({ ...newStock, ticker: e.target.value })}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="purchasePrice">Purchase Price ($)</Label>
                    <Input
                      id="purchasePrice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 150.00"
                      value={newStock.purchasePrice}
                      onChange={(e) => setNewStock({ ...newStock, purchasePrice: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="md:ml-2">Add Stock</Button>
                </form>
              </CardContent>
            </Card>
            
            {/* Stocks Table */}
            <Card>
              <CardHeader>
                <CardTitle>Your Portfolio</CardTitle>
              </CardHeader>
              <CardContent>
                {stocks.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    You haven't added any stocks yet. Add your first stock above.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticker</TableHead>
                          <TableHead>Purchase Price</TableHead>
                          <TableHead>Current Price</TableHead>
                          <TableHead>Change</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stocks.map((stock) => (
                          <TableRow key={stock.id}>
                            <TableCell className="font-medium">{stock.ticker}</TableCell>
                            <TableCell>${stock.purchasePrice.toFixed(2)}</TableCell>
                            <TableCell>
                              {stock.currentPrice 
                                ? `$${stock.currentPrice.toFixed(2)}` 
                                : "Waiting..."}
                            </TableCell>
                            <TableCell>
                              {stock.percentChange !== undefined ? (
                                <span className={stock.percentChange >= 0 ? "text-green-500" : "text-red-500"}>
                                  {stock.percentChange >= 0 ? "+" : ""}
                                  {stock.percentChange.toFixed(2)}%
                                </span>
                              ) : (
                                "Waiting..."
                              )}
                            </TableCell>
                            <TableCell>
                              {stock.shouldSell && (
                                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-300">
                                  SELL
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteStock(stock.id, stock.ticker)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Sell Recommendations */}
            {stocks.some(stock => stock.shouldSell) && (
              <Alert className="bg-green-50 dark:bg-green-900/20 border-green-500">
                <AlertTitle className="text-green-700 dark:text-green-300">Sell Recommendations</AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-300">
                  The following stocks have reached your sell threshold of {settings?.sellThresholdPercent}%:
                  <ul className="mt-2 list-disc pl-5">
                    {stocks
                      .filter(stock => stock.shouldSell)
                      .map(stock => (
                        <li key={stock.id}>
                          {stock.ticker} - Current price: ${stock.currentPrice?.toFixed(2)}, 
                          Up {stock.percentChange?.toFixed(2)}% from purchase
                        </li>
                      ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
          
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Portfolio Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {settings && (
                  <>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="sellThreshold">
                          Sell Threshold: {settings.sellThresholdPercent}%
                        </Label>
                        <Slider
                          id="sellThreshold"
                          min={1}
                          max={50}
                          step={0.5}
                          value={[settings.sellThresholdPercent]}
                          onValueChange={(value) => 
                            setSettings({ ...settings, sellThresholdPercent: value[0] })
                          }
                          className="mt-2"
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                          You'll be alerted when a stock's price increases by this percentage.
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="checkFrequency">
                          Check Frequency: {settings.checkFrequencySeconds} seconds
                        </Label>
                        <Slider
                          id="checkFrequency"
                          min={10}
                          max={300}
                          step={10}
                          value={[settings.checkFrequencySeconds]}
                          onValueChange={(value) => 
                            setSettings({ ...settings, checkFrequencySeconds: value[0] })
                          }
                          className="mt-2"
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                          How often the app should reconnect if the connection is lost.
                        </p>
                      </div>
                    </div>
                    
                    <Button onClick={handleUpdateSettings}>Save Settings</Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}