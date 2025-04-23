import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMicroProcessing } from "@/hooks/useMicroProcessing";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import ErrorLogger from "@/components/ErrorLogger";
import { useToast } from "@/components/ui/use-toast";
import { parseFinnhubMessage, shouldSellStock, shouldBuyStock, StockPrice } from "@/lib/finnhub";
import { parseKrakenMessage, createKrakenSubscription, shouldSellCrypto, shouldBuyCrypto, KrakenPrice } from "@/lib/kraken";
import KrakenPriceMonitor from "@/components/KrakenPriceMonitor";
import KrakenBalance from "@/components/KrakenBalance";
import USDBalance from "@/components/USDBalance";
import MicroProcessingStatus from "@/components/MicroProcessingStatus";
import SortableStockList from "@/components/SortableStockList";
import SortableCryptoList from "@/components/SortableCryptoList";
import TransactionHistory from "@/components/TransactionHistory";
import CryptoTransactionHistory from "@/components/CryptoTransactionHistory";
import KrakenWebSocketSettings from "@/components/KrakenWebSocketSettings";
import FinnHubWebSocketSettings from "@/components/FinnHubWebSocketSettings";
import AlphaVantageSettings from "@/components/AlphaVantageSettings";
import CoinDeskSettings from "@/components/CoinDeskSettings";
import OpenAISettings from "@/components/OpenAISettings";
import GoogleAISettings from "@/components/GoogleAISettings";
import WebSocketLogger from "@/components/WebSocketLogger";
import Research from "@/components/Research";
import UserManagement from "@/components/UserManagement";
import DataUploads from "@/components/DataUploads";
import FixAutoTradeFlags from "@/components/FixAutoTradeFlags";
import AutoTradeLogs from "@/components/AutoTradeLogs";
import AIAgent from "@/components/AIAgent";
import { Stock, StockWithPrice as StockWithCurrentPrice, Settings, Crypto, CryptoWithPrice } from "@/types/stock";
import { useKrakenWebSocket } from "@/contexts/KrakenWebSocketContext";
import { useAnalysis } from "@/contexts/AnalysisContext";

export default function Dashboard() {
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const [stocks, setStocks] = useState<StockWithCurrentPrice[]>([]);
  const [cryptos, setCryptos] = useState<CryptoWithPrice[]>([]);
  const { handlePriceUpdate } = useMicroProcessing();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [newStock, setNewStock] = useState({ ticker: "", purchasePrice: "", shares: "" });
  const [newCrypto, setNewCrypto] = useState({ symbol: "", purchasePrice: "", shares: "" });
  const [loading, setLoading] = useState(true);
  const [stocksConnected, setStocksConnected] = useState(false);
  const [cryptoConnected, setCryptoConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const krakenWsRef = useRef<WebSocket | null>(null);
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
  
  // Fetch cryptos
  const fetchCryptos = useCallback(async () => {
    try {
      const response = await fetch("/api/cryptos");
      if (response.ok) {
        const data = await response.json();
        setCryptos(data);
      } else {
        throw new Error("Failed to fetch cryptos");
      }
    } catch (error) {
      console.error("Error fetching cryptos:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load your cryptocurrencies. Please try again.",
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
      fetchCryptos();
      fetchSettings();
    }
  }, [user, fetchStocks, fetchCryptos, fetchSettings]);

  // Connect to WebSockets (Finnhub for stocks only - Kraken is handled by KrakenWebSocketContext)
  const connectWebSocket = useCallback(() => {
    // Check if FinnHub websocket is enabled in settings
    if (settings?.enableFinnHubWebSocket === false) {
      console.log("FinnHub WebSocket is disabled in settings, skipping connection");
      return;
    }
    
    // Check if we have a Finnhub API key from environment or settings
    const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || (settings?.finnhubApiKey || "");
    
    if (!apiKey) {
      console.error("Finnhub API key is missing");
      toast({
        variant: "destructive",
        title: "Configuration Error",
        description: "Finnhub API key is not configured. Please add it in the settings tab.",
      });
      return;
    }

    // Don't create a new connection if one is already open
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("Finnhub WebSocket already connected, skipping connection");
      return;
    }

    // Close any existing connection that might be in a different state
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (closeError) {
        console.error("Error closing existing Finnhub WebSocket:", closeError);
      }
      wsRef.current = null;
    }

    try {
      // Connect to Finnhub for stock data
      console.log("Attempting to connect to Finnhub WebSocket...");
      
      // Add a timestamp parameter to prevent caching issues
      const timestamp = Date.now();
      const ws = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}&t=${timestamp}`);
      
      // Set a connection timeout
      const connectionTimeout = setTimeout(() => {
        if (ws && ws.readyState !== WebSocket.OPEN) {
          console.error("Finnhub WebSocket connection timeout");
          try {
            ws.close();
          } catch (closeError) {
            console.error("Error closing timed out Finnhub WebSocket:", closeError);
          }
          setStocksConnected(false);
          toast({
            variant: "destructive",
            title: "Connection Timeout",
            description: "Finnhub WebSocket connection timed out. Will retry shortly.",
          });
        }
      }, 10000); // 10 second timeout
      
      // Set up a heartbeat to keep the connection alive
      let heartbeatInterval: NodeJS.Timeout | null = null;
      
      const startHeartbeat = () => {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
        
        heartbeatInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            try {
              console.log("Sending ping to Finnhub WebSocket");
              ws.send(JSON.stringify({ type: "ping" }));
            } catch (pingError) {
              console.error("Error sending ping to Finnhub:", pingError);
              // If ping fails, try to reconnect
              if (ws) {
                try {
                  ws.close();
                } catch (closeError) {
                  console.error("Error closing Finnhub WebSocket after ping failure:", closeError);
                }
              }
            }
          } else {
            // If connection is not open, clear the interval
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }
          }
        }, 30000); // Send ping every 30 seconds
      };
      
      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log("Finnhub WebSocket connection established successfully");
        setStocksConnected(true);
        toast({
          title: "Connected",
          description: "Connected to Finnhub websocket for stocks",
        });
        
        // Start the heartbeat
        startHeartbeat();
        
        // Subscribe to all stocks
        if (stocks.length > 0) {
          console.log(`Subscribing to ${stocks.length} stocks`);
          
          // Add a small delay between subscriptions to avoid rate limiting
          stocks.forEach((stock, index) => {
            setTimeout(() => {
              try {
                if (ws && ws.readyState === WebSocket.OPEN) {
                  const subscriptionMessage = JSON.stringify({ type: "subscribe", symbol: stock.ticker });
                  console.log(`Sending subscription for ${stock.ticker}`);
                  ws.send(subscriptionMessage);
                  console.log(`Subscribed to ${stock.ticker}`);
                }
              } catch (subError) {
                console.error(`Error subscribing to ${stock.ticker}:`, subError);
              }
            }, index * 100); // Stagger subscriptions by 100ms each
          });
          
          // Send a ping to verify the connection is working
          setTimeout(() => {
            try {
              if (ws && ws.readyState === WebSocket.OPEN) {
                console.log("Sending initial ping to Finnhub WebSocket");
                ws.send(JSON.stringify({ type: "ping" }));
              }
            } catch (pingError) {
              console.error("Error sending initial ping to Finnhub:", pingError);
            }
          }, 2000);
        } else {
          console.log("No stocks to subscribe to");
        }
      };
      
      ws.onmessage = (event) => {
        try {
          // Log the raw message for debugging
          if (typeof event.data === 'string') {
            // Only parse if it's a string (could be binary data)
            const truncatedMessage = event.data.length > 200 ? event.data.substring(0, 200) + "..." : event.data;
            console.log("Received Finnhub message:", truncatedMessage);
            
            // Check if it's a pong response
            if (event.data.includes('"type":"pong"')) {
              console.log("Received pong from Finnhub");
              return;
            }
            
            // Check for error messages
            if (event.data.includes('"type":"error"')) {
              console.error("Finnhub error message:", event.data);
              
              // Check for specific error types
              if (event.data.includes("Authentication failed") || event.data.includes("Invalid API key")) {
                toast({
                  variant: "destructive",
                  title: "Authentication Error",
                  description: "Finnhub API key is invalid or expired. Please check your settings.",
                });
                
                // Don't attempt to reconnect immediately with the same invalid key
                return;
              }
              
              return;
            }
            
            const stockPrices = parseFinnhubMessage(event.data);
            
            if (stockPrices.length > 0) {
              console.log("Parsed stock prices:", stockPrices);
              updateStockPrices(stockPrices);
              setLastUpdated(new Date());
            } else {
              console.log("No stock prices parsed from message");
            }
          } else {
            console.log("Received non-string message from Finnhub WebSocket");
          }
        } catch (parseError) {
          console.error("Error processing Finnhub WebSocket message:", parseError);
          console.log("Raw message that caused error:", typeof event.data === 'string' ? 
            (event.data.length > 200 ? event.data.substring(0, 200) + "..." : event.data) : 
            "Non-string data");
        }
      };
      
      ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        
        // Clean up heartbeat
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        
        // Log error properties
        console.error("Finnhub WebSocket error event:", error.type);
        
        // Extract more useful information from the error event
        const errorInfo = {
          type: error.type,
          isTrusted: error.isTrusted,
          timeStamp: error.timeStamp,
          target: {
            url: ws.url,
            readyState: ws.readyState,
            protocol: ws.protocol,
            extensions: ws.extensions,
            bufferedAmount: ws.bufferedAmount
          }
        };
        
        console.error("Finnhub WebSocket error details:", JSON.stringify(errorInfo));
        
        setStocksConnected(false);
        toast({
          variant: "destructive",
          title: "Connection Error",
          description: "Failed to connect to Finnhub. Will retry shortly.",
        });
      };
      
      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        
        // Clean up heartbeat
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        
        console.log(`Finnhub WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason || "No reason provided"}, Clean: ${event.wasClean}`);
        setStocksConnected(false);
        
        // Attempt to reconnect after a delay, with exponential backoff
        const baseDelay = 5000;
        const maxDelay = 60000; // 1 minute max
        
        // Calculate reconnect delay with some randomness to avoid thundering herd
        const reconnectAttempts = wsRef.current?.reconnectAttempts || 0;
        const exponentialDelay = Math.min(baseDelay * Math.pow(1.5, reconnectAttempts), maxDelay);
        const jitter = Math.random() * 1000; // Add up to 1 second of jitter
        const reconnectDelay = exponentialDelay + jitter;
        
        console.log(`Will attempt to reconnect in ${Math.round(reconnectDelay/1000)} seconds (attempt ${reconnectAttempts + 1})`);
        
        // Store the timeout so we can clear it if needed
        const reconnectTimeout = setTimeout(() => {
          console.log("Executing reconnection to Finnhub WebSocket");
          connectWebSocket();
        }, reconnectDelay);
        
        // Store the reconnect attempt count on the websocket ref
        if (wsRef.current) {
          wsRef.current.reconnectAttempts = reconnectAttempts + 1;
          wsRef.current.reconnectTimeout = reconnectTimeout;
        }
      };
      
      // Add custom properties to track reconnection attempts
      ws.reconnectAttempts = 0;
      ws.reconnectTimeout = null;
      
      wsRef.current = ws;
      
      // We're now using the KrakenWebSocketContext for crypto data
      // No need to create a separate WebSocket connection here
      // Set crypto connected status based on the shared context
      setCryptoConnected(krakenConnected);
      
      // Clean up on unmount
      return () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log("Cleaning up Finnhub WebSocket connection");
          stocks.forEach(stock => {
            try {
              wsRef.current?.send(JSON.stringify({ type: "unsubscribe", symbol: stock.ticker }));
              console.log(`Unsubscribed from ${stock.ticker}`);
            } catch (unsubError) {
              console.error(`Error unsubscribing from ${stock.ticker}:`, unsubError);
            }
          });
          wsRef.current.close();
        }
        
        // Kraken WebSocket is now managed by KrakenWebSocketContext
      };
    } catch (error) {
      console.error("WebSocket connection error:", error);
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: "Failed to connect to WebSockets. Will retry shortly.",
      });
      setTimeout(connectWebSocket, 5000);
    }
  }, [stocks, cryptos, toast, settings]);

  // Update stock prices from websocket data
  const updateStockPrices = (stockPrices: StockPrice[]) => {
    setStocks(prevStocks => {
      return prevStocks.map(stock => {
        const priceData = stockPrices.find(sp => sp.ticker === stock.ticker);
        
        if (priceData) {
          const percentChange = stock.purchasePrice > 0 
            ? ((priceData.price - stock.purchasePrice) / stock.purchasePrice) * 100 
            : 0;
            
          const shouldSell = settings && stock.autoSell
            ? shouldSellStock(priceData.price, stock.purchasePrice, settings.sellThresholdPercent) 
            : false;
            
          const shouldBuy = settings && stock.autoBuy
            ? shouldBuyStock(priceData.price, stock.purchasePrice, settings.buyThresholdPercent)
            : false;
            
          return {
            ...stock,
            currentPrice: priceData.price,
            percentChange,
            shouldSell,
            shouldBuy,
          };
        }
        
        return stock;
      });
    });
  };
  
  // Import the shared Kraken WebSocket context
  const { 
    isConnected: krakenConnected, 
    lastPrices: krakenPrices, 
    updateSymbols: updateKrakenSymbols,
    lastUpdated: krakenLastUpdated,
    reconnectDelay,
    setReconnectDelay,
    enableKrakenWebSocket,
    setEnableKrakenWebSocket
  } = useKrakenWebSocket();
  
  // Update crypto symbols in the shared context when they change
  useEffect(() => {
    // Extract symbols from cryptos array
    const symbols = cryptos.map(crypto => crypto.symbol);
    console.log('Checking Kraken WebSocket symbols from dashboard:', symbols);
    
    // Ensure we're sending a valid array
    if (Array.isArray(symbols)) {
      // The updateKrakenSymbols function will now check if symbols have changed
      // before attempting to update the WebSocket subscriptions
      updateKrakenSymbols(symbols);
    } else {
      console.error('Invalid symbols array in dashboard:', symbols);
      updateKrakenSymbols([]);
    }
  }, [cryptos, updateKrakenSymbols]);
  
  // Update crypto prices when new prices come from the shared WebSocket context
  useEffect(() => {
    if (krakenPrices.length > 0) {
      console.log('Updating crypto prices from shared WebSocket context:', krakenPrices);
      updateCryptoPrices(krakenPrices);
      
      // Update the last updated timestamp
      if (krakenLastUpdated) {
        setLastUpdated(krakenLastUpdated);
      }
    }
  }, [krakenPrices, krakenLastUpdated]);
  
  // Update crypto prices from Kraken websocket data - this will be called both from the shared context
  // and from the legacy WebSocket connection during transition
  const updateCryptoPrices = (cryptoPrices: KrakenPrice[]) => {
    if (cryptoPrices.length === 0) {
      console.log('No crypto prices to update');
      return;
    }
    
    console.log('Updating crypto prices with:', JSON.stringify(cryptoPrices));
    
    // Also update prices in the micro processing service
    handlePriceUpdate(cryptoPrices);
    
    setCryptos(prevCryptos => {
      const updatedCryptos = prevCryptos.map(crypto => {
        // Find matching crypto price data - use case-insensitive comparison
        const priceData = cryptoPrices.find(cp => 
          cp.symbol.toUpperCase() === crypto.symbol.toUpperCase()
        );
        
        if (priceData) {
          console.log(`Found price update for ${crypto.symbol}: $${priceData.price}`);
          
          const percentChange = crypto.purchasePrice > 0 
            ? ((priceData.price - crypto.purchasePrice) / crypto.purchasePrice) * 100 
            : 0;
            
          const shouldSell = settings && crypto.autoSell
            ? shouldSellCrypto(priceData.price, crypto.purchasePrice, settings.sellThresholdPercent) 
            : false;
            
          const shouldBuy = settings && crypto.autoBuy
            ? shouldBuyCrypto(priceData.price, crypto.purchasePrice, settings.buyThresholdPercent)
            : false;
            
          return {
            ...crypto,
            currentPrice: priceData.price,
            percentChange,
            shouldSell,
            shouldBuy,
          };
        } else {
          console.log(`No price update found for ${crypto.symbol} in received data`);
          return crypto;
        }
      });
      
      return updatedCryptos;
    });
  };

  // Set up periodic connection check
  useEffect(() => {
    if (!loading && stocks.length > 0 && settings) {
      // Clear any existing timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      // Connect initially if FinnHub websocket is enabled
      if (settings.enableFinnHubWebSocket !== false) {
        connectWebSocket();
        
        // Set up periodic reconnection
        timerRef.current = setInterval(() => {
          if (!stocksConnected || !cryptoConnected) {
            connectWebSocket();
          }
        }, settings.checkFrequencySeconds * 1000);
      } else {
        // If FinnHub websocket is disabled, close any existing connection
        if (wsRef.current) {
          try {
            wsRef.current.close();
          } catch (closeError) {
            console.error("Error closing existing Finnhub WebSocket:", closeError);
          }
          wsRef.current = null;
          setStocksConnected(false);
        }
      }
      
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [loading, stocks, settings, stocksConnected, cryptoConnected, connectWebSocket]);

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
          shares: parseFloat(newStock.shares) || 0,
        }),
      });
      
      if (response.ok) {
        const newStockData = await response.json();
        setStocks(prev => [...prev, newStockData]);
        setNewStock({ ticker: "", purchasePrice: "", shares: "" });
        
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
  
  // Reorder stocks (update priorities)
  const handleReorderStocks = async (reorderedStocks: StockWithCurrentPrice[]) => {
    try {
      // Update local state immediately for a responsive UI
      setStocks(reorderedStocks);
      
      // Send the updated order to the server
      const response = await fetch("/api/stocks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stocks: reorderedStocks.map(stock => ({
            id: stock.id,
            ticker: stock.ticker
          }))
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update stock order");
      }
      
      toast({
        title: "Success",
        description: "Stock order updated successfully.",
      });
    } catch (error) {
      console.error("Error reordering stocks:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update stock order. Please try again.",
      });
      
      // Refresh the stocks to get the original order
      fetchStocks();
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
          buyThresholdPercent: settings.buyThresholdPercent,
          checkFrequencySeconds: settings.checkFrequencySeconds,
          tradePlatformApiKey: settings.tradePlatformApiKey,
          tradePlatformApiSecret: settings.tradePlatformApiSecret,
          finnhubApiKey: settings.finnhubApiKey,
          alphaVantageApiKey: settings.alphaVantageApiKey,
          coinDeskApiKey: settings.coinDeskApiKey,
          openAIApiKey: settings.openAIApiKey,
          enableAutoStockTrading: settings.enableAutoStockTrading,
          enableAutoCryptoTrading: settings.enableAutoCryptoTrading,
          enableManualCryptoTrading: settings.enableManualCryptoTrading,
          enableFinnHubWebSocket: settings.enableFinnHubWebSocket,
          enableKrakenWebSocket: settings.enableKrakenWebSocket,
          krakenWebsocketUrl: settings.krakenWebsocketUrl,
          krakenApiKey: settings.krakenApiKey,
          krakenApiSign: settings.krakenApiSign,
          binanceTradeApi: settings.binanceTradeApi,
          binanceApiToken: settings.binanceApiToken,
        }),
      });
      
      if (response.ok) {
        const updatedSettings = await response.json();
        setSettings(updatedSettings);
        
        // Reset the timer with new frequency
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            if (!stocksConnected || !cryptoConnected) {
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
  
  // Toggle auto sell for a stock
  const handleToggleAutoSell = async (id: string, value: boolean) => {
    try {
      const stock = stocks.find(s => s.id === id);
      if (!stock) return;
      
      const response = await fetch(`/api/stocks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: stock.ticker,
          purchasePrice: stock.purchasePrice,
          autoSell: value,
        }),
      });
      
      if (response.ok) {
        const updatedStock = await response.json();
        setStocks(prev => prev.map(s => s.id === id ? { ...s, autoSell: updatedStock.autoSell } : s));
        
        toast({
          title: "Success",
          description: `Auto sell ${value ? 'enabled' : 'disabled'} for ${stock.ticker}.`,
        });
      } else {
        throw new Error("Failed to update stock");
      }
    } catch (error) {
      console.error("Error updating auto sell:", error);
      throw error;
    }
  };
  
  // Toggle auto buy for a stock
  const handleToggleAutoBuy = async (id: string, value: boolean) => {
    try {
      const stock = stocks.find(s => s.id === id);
      if (!stock) return;
      
      const response = await fetch(`/api/stocks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: stock.ticker,
          purchasePrice: stock.purchasePrice,
          autoBuy: value,
        }),
      });
      
      if (response.ok) {
        const updatedStock = await response.json();
        setStocks(prev => prev.map(s => s.id === id ? { ...s, autoBuy: updatedStock.autoBuy } : s));
        
        toast({
          title: "Success",
          description: `Auto buy ${value ? 'enabled' : 'disabled'} for ${stock.ticker}.`,
        });
      } else {
        throw new Error("Failed to update stock");
      }
    } catch (error) {
      console.error("Error updating auto buy:", error);
      throw error;
    }
  };
  
  // Execute a trade (buy or sell)
  const handleTrade = async (id: string, ticker: string, action: 'buy' | 'sell', shares: number) => {
    try {
      const response = await fetch("/api/stocks/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockId: id,
          action,
          shares,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} stock`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error ${action}ing stock:`, error);
      throw error;
    }
  };
  
  // Add a new crypto
  const handleAddCrypto = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newCrypto.symbol || !newCrypto.purchasePrice) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter both crypto symbol and purchase price.",
      });
      return;
    }
    
    try {
      const response = await fetch("/api/cryptos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: newCrypto.symbol.toUpperCase(),
          purchasePrice: parseFloat(newCrypto.purchasePrice),
          shares: parseFloat(newCrypto.shares) || 0,
        }),
      });
      
      if (response.ok) {
        const newCryptoData = await response.json();
        
        // Update the cryptos state which will trigger the useEffect that updates the WebSocket symbols
        setCryptos(prev => [...prev, newCryptoData]);
        setNewCrypto({ symbol: "", purchasePrice: "", shares: "" });
        
        console.log(`Added new crypto: ${newCryptoData.symbol} - the useEffect will handle WebSocket subscription`);
        
        toast({
          title: "Success",
          description: `Added ${newCryptoData.symbol} to your portfolio.`,
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to add crypto");
      }
    } catch (error: any) {
      console.error("Error adding crypto:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to add crypto. Please try again.",
      });
    }
  };

  // Delete a crypto
  const handleDeleteCrypto = async (id: string, symbol: string) => {
    try {
      const response = await fetch(`/api/cryptos/${id}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        // Update the cryptos state which will trigger the useEffect that updates the WebSocket symbols
        setCryptos(prev => prev.filter(crypto => crypto.id !== id));
        
        console.log(`Removed crypto: ${symbol} - the useEffect will handle WebSocket unsubscription`);
        
        toast({
          title: "Success",
          description: `Removed ${symbol} from your portfolio.`,
        });
      } else {
        throw new Error("Failed to delete crypto");
      }
    } catch (error) {
      console.error("Error deleting crypto:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete crypto. Please try again.",
      });
    }
  };
  
  // Reorder cryptos (update priorities)
  const handleReorderCryptos = async (reorderedCryptos: CryptoWithPrice[]) => {
    try {
      // Update local state immediately for a responsive UI
      setCryptos(reorderedCryptos);
      
      // Send the updated order to the server
      const response = await fetch("/api/cryptos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cryptos: reorderedCryptos.map(crypto => ({
            id: crypto.id,
            symbol: crypto.symbol
          }))
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update crypto order");
      }
      
      toast({
        title: "Success",
        description: "Crypto order updated successfully.",
      });
    } catch (error) {
      console.error("Error reordering cryptos:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update crypto order. Please try again.",
      });
      
      // Refresh the cryptos to get the original order
      fetchCryptos();
    }
  };
  
  // Toggle auto sell for a crypto
  const handleToggleCryptoAutoSell = async (id: string, value: boolean) => {
    try {
      const crypto = cryptos.find(c => c.id === id);
      if (!crypto) return;
      
      const response = await fetch(`/api/cryptos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: crypto.symbol,
          purchasePrice: crypto.purchasePrice,
          autoSell: value,
        }),
      });
      
      if (response.ok) {
        const updatedCrypto = await response.json();
        setCryptos(prev => prev.map(c => c.id === id ? { ...c, autoSell: updatedCrypto.autoSell } : c));
        
        toast({
          title: "Success",
          description: `Auto sell ${value ? 'enabled' : 'disabled'} for ${crypto.symbol}.`,
        });
      } else {
        throw new Error("Failed to update crypto");
      }
    } catch (error) {
      console.error("Error updating auto sell:", error);
      throw error;
    }
  };
  
  // Toggle auto buy for a crypto
  const handleToggleCryptoAutoBuy = async (id: string, value: boolean) => {
    try {
      const crypto = cryptos.find(c => c.id === id);
      if (!crypto) return;
      
      const response = await fetch(`/api/cryptos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: crypto.symbol,
          purchasePrice: crypto.purchasePrice,
          autoBuy: value,
        }),
      });
      
      if (response.ok) {
        const updatedCrypto = await response.json();
        setCryptos(prev => prev.map(c => c.id === id ? { ...c, autoBuy: updatedCrypto.autoBuy } : c));
        
        toast({
          title: "Success",
          description: `Auto buy ${value ? 'enabled' : 'disabled'} for ${crypto.symbol}.`,
        });
      } else {
        throw new Error("Failed to update crypto");
      }
    } catch (error) {
      console.error("Error updating auto buy:", error);
      throw error;
    }
  };
  
  // Execute a crypto trade (buy or sell)
  const handleCryptoTrade = async (id: string, symbol: string, action: 'buy' | 'sell', shares: number) => {
    try {
      // Get the current crypto to get its current price
      const crypto = cryptos.find(c => c.id === id);
      if (!crypto) {
        throw new Error("Crypto not found");
      }

      // Use current price if available, otherwise fall back to purchase price
      const price = crypto.currentPrice || crypto.purchasePrice;
      
      console.log(`Executing ${action} for ${symbol}, ${shares} shares at $${price}`);

      // For sell actions, verify that the user has enough shares in the local database
      if (action === 'sell') {
        // Check if we have enough shares in our local state
        if (crypto.shares < shares) {
          console.error(`Not enough shares to sell: have ${crypto.shares}, trying to sell ${shares}`);
          throw new Error(`Not enough shares to sell. You only have ${crypto.shares.toFixed(8)} shares available.`);
        }
      }

      // Check if Kraken API credentials are configured
      if (settings?.krakenApiKey && settings?.krakenApiSign) {
        console.log("Using Kraken API for trading");
        // Use the Kraken API for trading
        const response = await fetch("/api/cryptos/execute-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cryptoId: id,
            action,
            shares,
            price,
          }),
        });
        
        const responseData = await response.json();
        
        if (!response.ok) {
          console.error("Kraken API error:", responseData);
          throw new Error(responseData.error || `Failed to ${action} crypto using Kraken API`);
        }
        
        // Update the crypto shares after successful trade without page refresh
        fetchCryptos();
        
        // Dispatch a custom event to notify the transaction history component to refresh
        const event = new CustomEvent('crypto-transaction-completed', {
          detail: {
            action,
            symbol,
            shares,
            price,
            responseData
          }
        });
        window.dispatchEvent(event);
        
        return responseData;
      } else {
        console.log("Using internal trading system");
        // Fall back to the internal trading system if Kraken API is not configured
        const response = await fetch("/api/cryptos/trade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cryptoId: id,
            action,
            shares,
          }),
        });
        
        const responseData = await response.json();
        
        if (!response.ok) {
          console.error("Internal trading error:", responseData);
          throw new Error(responseData.error || `Failed to ${action} crypto`);
        }
        
        // Update the crypto shares after successful trade without page refresh
        fetchCryptos();
        
        // Dispatch a custom event to notify the transaction history component to refresh
        const event = new CustomEvent('crypto-transaction-completed', {
          detail: {
            action,
            symbol,
            shares,
            responseData
          }
        });
        window.dispatchEvent(event);
        
        return responseData;
      }
    } catch (error) {
      console.error(`Error ${action}ing crypto:`, error);
      throw error;
    }
  };
  
  // Update stock shares
  const handleUpdateStockShares = async (id: string, shares: number) => {
    try {
      const response = await fetch("/api/stocks/update-shares", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          shares,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update stock shares");
      }
      
      // Update the local state
      setStocks(prev => prev.map(stock => 
        stock.id === id ? { ...stock, shares } : stock
      ));
      
      toast({
        title: "Success",
        description: "Stock shares updated successfully.",
      });
      
      return await response.json();
    } catch (error) {
      console.error("Error updating stock shares:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update stock shares. Please try again.",
      });
      throw error;
    }
  };
  
  // Update crypto shares
  const handleUpdateCryptoShares = async (id: string, shares: number) => {
    try {
      const response = await fetch("/api/cryptos/update-shares", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          shares,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update crypto shares");
      }
      
      // Update the local state
      setCryptos(prev => prev.map(crypto => 
        crypto.id === id ? { ...crypto, shares } : crypto
      ));
      
      toast({
        title: "Success",
        description: "Crypto shares updated successfully.",
      });
      
      return await response.json();
    } catch (error) {
      console.error("Error updating crypto shares:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update crypto shares. Please try again.",
      });
      throw error;
    }
  };
  
  // Update crypto purchase price
  const handleUpdateCryptoPurchasePrice = async (id: string, price: number) => {
    try {
      const crypto = cryptos.find(c => c.id === id);
      if (!crypto) return;
      
      const response = await fetch(`/api/cryptos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: crypto.symbol,
          purchasePrice: price,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update purchase price");
      }
      
      // Update the local state
      setCryptos(prev => prev.map(crypto => 
        crypto.id === id ? { ...crypto, purchasePrice: price } : crypto
      ));
      
      toast({
        title: "Success",
        description: `Purchase price for ${crypto.symbol} updated to current market price.`,
      });
      
      return await response.json();
    } catch (error) {
      console.error("Error updating purchase price:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update purchase price. Please try again.",
      });
      throw error;
    }
  };

  // Add crypto to Research tab
  const { addItem } = useAnalysis();
  const handleAddCryptoToResearch = async (symbol: string) => {
    try {
      // Find the crypto in the list
      const crypto = cryptos.find(c => c.symbol.toUpperCase() === symbol.toUpperCase());
      
      if (!crypto) {
        throw new Error(`Crypto ${symbol} not found in your portfolio`);
      }
      
      // Fetch historical data first
      toast({
        title: "Fetching Data",
        description: `Fetching historical data for ${symbol}...`,
      });
      
      try {
        const response = await fetch(`/api/cryptos/historical?symbol=${symbol}`);
        if (response.ok) {
          const data = await response.json();
          
          // Add to analysis context with the historical data
          addItem({
            symbol: crypto.symbol,
            currentPrice: crypto.currentPrice,
            purchasePrice: crypto.purchasePrice,
            type: 'crypto',
            historicalData: data.data, // Include the fetched historical data
            dataSource: data.source || 'dashboard'
          });
          
          // Switch to the Research tab
          const researchTab = document.querySelector('[value="research"]') as HTMLElement;
          if (researchTab) {
            researchTab.click();
          }
          
          toast({
            title: "Added to Research",
            description: `${symbol} has been added to the Research tab.`,
          });
        } else {
          throw new Error(`Failed to fetch historical data for ${symbol}`);
        }
      } catch (fetchError) {
        console.error(`Error fetching historical data for ${symbol}:`, fetchError);
        
        // Fall back to adding without historical data
        addItem({
          symbol: crypto.symbol,
          currentPrice: crypto.currentPrice,
          purchasePrice: crypto.purchasePrice,
          type: 'crypto',
          historicalData: null, // This will be fetched by the Research component as fallback
          dataSource: 'dashboard'
        });
        
        // Switch to the Research tab
        const researchTab = document.querySelector('[value="research"]') as HTMLElement;
        if (researchTab) {
          researchTab.click();
        }
        
        toast({
          title: "Added to Research",
          description: `${symbol} has been added to the Research tab. Some analysis may be delayed.`,
        });
      }
    } catch (error) {
      console.error("Error adding crypto to research:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add crypto to research.",
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
            <TabsTrigger value="crypto">Crypto</TabsTrigger>
            <TabsTrigger value="reporting">Reporting</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="websocket-logs">API Logs</TabsTrigger>
            <TabsTrigger value="error-logs">Error Logs</TabsTrigger>
            <TabsTrigger value="research">Research</TabsTrigger>
            <TabsTrigger value="user-management">User Management</TabsTrigger>
            <TabsTrigger value="data-uploads">Data Uploads</TabsTrigger>
            <TabsTrigger value="auto-trade-logs">Auto Trade Logs</TabsTrigger>
            <TabsTrigger value="ai-agent">AI Agent</TabsTrigger>
          </TabsList>
          
          <TabsContent value="portfolio" className="space-y-6">
            {/* Connection Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${stocksConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-muted-foreground">
                  {stocksConnected ? 'Connected to Finnhub' : 'Disconnected'}
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
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="shares">Shares</Label>
                    <Input
                      id="shares"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 10"
                      value={newStock.shares}
                      onChange={(e) => setNewStock({ ...newStock, shares: e.target.value })}
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
                <p className="text-sm text-muted-foreground">
                  Drag stocks to reorder them by priority
                </p>
              </CardHeader>
              <CardContent>
                <SortableStockList 
                  stocks={stocks} 
                  onDelete={handleDeleteStock}
                  onReorder={handleReorderStocks}
                  onToggleAutoSell={handleToggleAutoSell}
                  onToggleAutoBuy={handleToggleAutoBuy}
                  onTrade={handleTrade}
                  onUpdateShares={handleUpdateStockShares}
                />
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
          
          <TabsContent value="crypto" className="space-y-6">
            
            {/* Kraken Balance */}
            <KrakenBalance />
            
            {/* USD Balance */}
            <USDBalance className="mt-4" />
            
            {/* Add New Crypto Form */}
            <Card>
              <CardHeader>
                <CardTitle>Add Crypto to Portfolio</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddCrypto} className="flex flex-col gap-4 md:flex-row md:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="cryptoSymbol">Crypto Symbol</Label>
                    <Input
                      id="cryptoSymbol"
                      placeholder="e.g. BTC"
                      value={newCrypto.symbol}
                      onChange={(e) => setNewCrypto({ ...newCrypto, symbol: e.target.value })}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="cryptoPurchasePrice">Purchase Price ($Per Share)</Label>
                    <Input
                      id="cryptoPurchasePrice"
                      type="number"
                      step="0.000001"
                      min="0"
                      placeholder="e.g. 50000.000000"
                      value={newCrypto.purchasePrice}
                      onChange={(e) => setNewCrypto({ ...newCrypto, purchasePrice: e.target.value })}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="cryptoShares">Shares</Label>
                    <Input
                      id="cryptoShares"
                      type="number"
                      step="0.00000001"
                      min="0"
                      placeholder="e.g. 0.5"
                      value={newCrypto.shares}
                      onChange={(e) => setNewCrypto({ ...newCrypto, shares: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="md:ml-2">Add Crypto</Button>
                </form>
              </CardContent>
            </Card>
            
            {/* Crypto Table */}
            <Card>
              <CardHeader>
                <CardTitle>Your Crypto Portfolio</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Drag cryptocurrencies to reorder them by priority
                </p>
              </CardHeader>
              <CardContent>
                <SortableCryptoList 
                  cryptos={cryptos} 
                  onDelete={handleDeleteCrypto}
                  onReorder={handleReorderCryptos}
                  onToggleAutoSell={handleToggleCryptoAutoSell}
                  onToggleAutoBuy={handleToggleCryptoAutoBuy}
                  onTrade={handleCryptoTrade}
                  onUpdateShares={handleUpdateCryptoShares}
                  onUpdatePurchasePrice={handleUpdateCryptoPurchasePrice}
                  onAddToResearch={handleAddCryptoToResearch}
                />
              </CardContent>
            </Card>
            
            {/* Kraken Price Monitor */}
            {cryptos.length > 0 && (
              <KrakenPriceMonitor 
                symbols={cryptos.map(crypto => crypto.symbol)}
                websocketUrl={settings?.krakenWebsocketUrl || "wss://ws.kraken.com/v2"}
                onPriceUpdate={updateCryptoPrices}
              />
            )}
            
            {/* Micro Processing Status */}
            <MicroProcessingStatus />
            
            {/* Fix Auto Trade Flags */}
            <FixAutoTradeFlags />
            
            {/* Crypto Transaction History */}
            <Card>
              <CardHeader>
                <CardTitle>Crypto Transaction History</CardTitle>
              </CardHeader>
              <CardContent>
                <CryptoTransactionHistory />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="reporting">
            <Card>
              <CardHeader>
                <CardTitle>Transaction History</CardTitle>
              </CardHeader>
              <CardContent>
                <TransactionHistory />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="websocket-logs">
            <WebSocketLogger />
          </TabsContent>
          
          <TabsContent value="error-logs">
            <ErrorLogger />
          </TabsContent>
          
          <TabsContent value="research">
            <Research />
          </TabsContent>
          
          <TabsContent value="user-management">
            <UserManagement />
          </TabsContent>
          
          <TabsContent value="data-uploads">
            <DataUploads />
          </TabsContent>
          
          <TabsContent value="auto-trade-logs">
            <Card>
              <CardHeader>
                <CardTitle>Auto Trade Logs</CardTitle>
                <p className="text-sm text-muted-foreground">
                  View logs of auto trading decisions and processes
                </p>
              </CardHeader>
              <CardContent>
                <AutoTradeLogs />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="ai-agent">
            <AIAgent />
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
                        <Label htmlFor="buyThreshold">
                          Buy Threshold: {settings.buyThresholdPercent}%
                        </Label>
                        <Slider
                          id="buyThreshold"
                          min={1}
                          max={50}
                          step={0.5}
                          value={[settings.buyThresholdPercent]}
                          onValueChange={(value) => 
                            setSettings({ ...settings, buyThresholdPercent: value[0] })
                          }
                          className="mt-2"
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                          You'll be alerted when a stock's price decreases by this percentage.
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
                      
                      <div className="border-t pt-4">
                        <h3 className="text-lg font-medium mb-2">Finnhub API Integration</h3>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="finnhubApiKey">Finnhub API Key</Label>
                            <Input
                              id="finnhubApiKey"
                              type="password"
                              placeholder="Enter your Finnhub API key"
                              value={settings.finnhubApiKey || ""}
                              onChange={(e) => 
                                setSettings({ ...settings, finnhubApiKey: e.target.value })
                              }
                            />
                          </div>
                          <FinnHubWebSocketSettings
                            enabled={settings.enableFinnHubWebSocket !== false}
                            onEnabledChange={(enabled) => 
                              setSettings({ ...settings, enableFinnHubWebSocket: enabled })
                            }
                          />
                          <p className="text-sm text-muted-foreground">
                            This API key is required for real-time stock price updates. You can get a free API key from <a href="https://finnhub.io/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Finnhub.io</a>.
                          </p>
                        </div>
                      </div>
                      
                      <div className="border-t pt-4 mt-4">
                        <h3 className="text-lg font-medium mb-2">Trading Platform Integration</h3>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="tradePlatformApiKey">API Key</Label>
                            <Input
                              id="tradePlatformApiKey"
                              type="password"
                              placeholder="Enter your trading platform API key"
                              value={settings.tradePlatformApiKey || ""}
                              onChange={(e) => 
                                setSettings({ ...settings, tradePlatformApiKey: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor="tradePlatformApiSecret">API Secret</Label>
                            <Input
                              id="tradePlatformApiSecret"
                              type="password"
                              placeholder="Enter your trading platform API secret"
                              value={settings.tradePlatformApiSecret || ""}
                              onChange={(e) => 
                                setSettings({ ...settings, tradePlatformApiSecret: e.target.value })
                              }
                            />
                          </div>
                          <div className="flex items-center space-x-2 mt-4">
                            <Checkbox
                              id="enableAutoStockTrading"
                              checked={settings.enableAutoStockTrading || false}
                              onCheckedChange={(checked) => 
                                setSettings({ ...settings, enableAutoStockTrading: checked as boolean })
                              }
                            />
                            <Label htmlFor="enableAutoStockTrading">Enable Auto Stock Trading</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="enableAutoCryptoTrading"
                              checked={settings.enableAutoCryptoTrading || false}
                              onCheckedChange={(checked) => 
                                setSettings({ ...settings, enableAutoCryptoTrading: checked as boolean })
                              }
                            />
                            <Label htmlFor="enableAutoCryptoTrading">Enable Auto Crypto Trading</Label>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            These credentials are required for automatic and manual trading functionality.
                          </p>
                        </div>
                      </div>
                      
                      <div className="border-t pt-4 mt-4">
                        <h3 className="text-lg font-medium mb-2">Kraken Order API Integration</h3>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="krakenApiKey">Kraken API Key</Label>
                            <Input
                              id="krakenApiKey"
                              type="password"
                              placeholder="Enter your Kraken API key"
                              value={settings.krakenApiKey || ""}
                              onChange={(e) => 
                                setSettings({ ...settings, krakenApiKey: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor="krakenApiSign">Kraken API Sign</Label>
                            <Input
                              id="krakenApiSign"
                              type="password"
                              placeholder="Enter your Kraken API Sign"
                              value={settings.krakenApiSign || ""}
                              onChange={(e) => 
                                setSettings({ ...settings, krakenApiSign: e.target.value })
                              }
                            />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            These credentials are required for manual crypto trading functionality. The API endpoint used is: https://api.kraken.com/0/private/AddOrder
                          </p>
                        </div>
                      </div>

                      <div className="border-t pt-4 mt-4">
                        <h3 className="text-lg font-medium mb-2">Binance API Integration</h3>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="binanceTradeApi">Binance Trade API</Label>
                            <Input
                              id="binanceTradeApi"
                              type="password"
                              placeholder="Enter your Binance Trade API"
                              value={settings.binanceTradeApi || ""}
                              onChange={(e) => 
                                setSettings({ ...settings, binanceTradeApi: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor="binanceApiToken">Binance API Token</Label>
                            <Input
                              id="binanceApiToken"
                              type="password"
                              placeholder="Enter your Binance API Token"
                              value={settings.binanceApiToken || ""}
                              onChange={(e) => 
                                setSettings({ ...settings, binanceApiToken: e.target.value })
                              }
                            />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            These credentials are required for trading with Binance. Make sure to enable the appropriate permissions in your Binance account.
                          </p>
                        </div>
                      </div>

                      <KrakenWebSocketSettings
                        websocketUrl={settings.krakenWebsocketUrl || "wss://ws.kraken.com/v2"}
                        enableManualCryptoTrading={settings.enableManualCryptoTrading === true}
                        autoConnectWebSocket={true}
                        enableKrakenWebSocket={settings.enableKrakenWebSocket !== false}
                        reconnectDelay={reconnectDelay}
                        maxDatabaseRetries={settings.maxDatabaseRetries || 5}
                        onEnableManualCryptoTradingChange={(enabled) => {
                          console.log("Setting enableManualCryptoTrading to:", enabled);
                          setSettings({ ...settings, enableManualCryptoTrading: enabled });
                        }}
                        onAutoConnectWebSocketChange={() => {}}
                        onEnableKrakenWebSocketChange={(enabled) => {
                          console.log("Setting enableKrakenWebSocket to:", enabled);
                          setSettings({ ...settings, enableKrakenWebSocket: enabled });
                        }}
                        onReconnectDelayChange={(delay) => {
                          console.log("Setting reconnectDelay to:", delay);
                          setReconnectDelay(delay);
                        }}
                        onMaxDatabaseRetriesChange={(retries) => {
                          console.log("Setting maxDatabaseRetries to:", retries);
                          setSettings({ ...settings, maxDatabaseRetries: retries });
                        }}
                      />
                      
                      {/* AlphaVantage API Settings */}
                      <AlphaVantageSettings
                        apiKey={settings.alphaVantageApiKey || ''}
                        onApiKeyChange={(apiKey) => 
                          setSettings({ ...settings, alphaVantageApiKey: apiKey })
                        }
                      />
                      
                      {/* CoinDesk API Settings */}
                      <CoinDeskSettings
                        apiKey={settings.coinDeskApiKey || ''}
                        onApiKeyChange={(apiKey) => 
                          setSettings({ ...settings, coinDeskApiKey: apiKey })
                        }
                      />
                      
                      {/* AI API Settings */}
                      <OpenAISettings
                        openAIApiKey={settings.openAIApiKey || ''}
                        anthropicApiKey={settings.anthropicApiKey || ''}
                        apiPreference={settings.researchApiPreference || 'openai'}
                        onOpenAIApiKeyChange={(apiKey) => 
                          setSettings({ ...settings, openAIApiKey: apiKey })
                        }
                        onAnthropicApiKeyChange={(apiKey) => 
                          setSettings({ ...settings, anthropicApiKey: apiKey })
                        }
                        onApiPreferenceChange={(preference) => 
                          setSettings({ ...settings, researchApiPreference: preference })
                        }
                      />
                      
                      {/* Google AI Settings */}
                      <GoogleAISettings />
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