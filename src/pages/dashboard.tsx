import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { parseFinnhubMessage, shouldSellStock, shouldBuyStock, StockPrice } from "@/lib/finnhub";
import { parseKrakenMessage, createKrakenSubscription, shouldSellCrypto, shouldBuyCrypto, KrakenPrice } from "@/lib/kraken";
import SortableStockList from "@/components/SortableStockList";
import SortableCryptoList from "@/components/SortableCryptoList";
import TransactionHistory from "@/components/TransactionHistory";
import CryptoTransactionHistory from "@/components/CryptoTransactionHistory";
import { Stock, StockWithPrice as StockWithCurrentPrice, Settings, Crypto, CryptoWithPrice } from "@/types/stock";

export default function Dashboard() {
  const { signOut, user } = useAuth();
  const { toast } = useToast();
  const [stocks, setStocks] = useState<StockWithCurrentPrice[]>([]);
  const [cryptos, setCryptos] = useState<CryptoWithPrice[]>([]);
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

  // Connect to WebSockets (Finnhub for stocks, Kraken for crypto)
  const connectWebSocket = useCallback(() => {
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
      return;
    }

    try {
      // Connect to Finnhub for stock data
      console.log("Attempting to connect to Finnhub WebSocket...");
      const ws = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);
      
      ws.onopen = () => {
        console.log("Finnhub WebSocket connection established successfully");
        setStocksConnected(true);
        toast({
          title: "Connected",
          description: "Connected to Finnhub websocket for stocks",
        });
        
        // Subscribe to all stocks
        if (stocks.length > 0) {
          console.log(`Subscribing to ${stocks.length} stocks`);
          stocks.forEach(stock => {
            try {
              ws.send(JSON.stringify({ type: "subscribe", symbol: stock.ticker }));
              console.log(`Subscribed to ${stock.ticker}`);
            } catch (subError) {
              console.error(`Error subscribing to ${stock.ticker}:`, subError);
            }
          });
        } else {
          console.log("No stocks to subscribe to");
        }
      };
      
      ws.onmessage = (event) => {
        try {
          // Log the raw message for debugging
          if (typeof event.data === 'string') {
            // Only parse if it's a string (could be binary data)
            const stockPrices = parseFinnhubMessage(event.data);
            
            if (stockPrices.length > 0) {
              updateStockPrices(stockPrices);
              setLastUpdated(new Date());
            }
          } else {
            console.log("Received non-string message from Finnhub WebSocket");
          }
        } catch (parseError) {
          console.error("Error processing Finnhub WebSocket message:", parseError, "Raw message:", event.data);
        }
      };
      
      ws.onerror = (error) => {
        // Log detailed error information
        console.error("Finnhub WebSocket error:", error);
        
        // Try to extract more information from the error object
        let errorDetails = "Unknown error";
        try {
          errorDetails = JSON.stringify(error);
        } catch (e) {
          errorDetails = "Error details could not be stringified";
        }
        
        console.error("Finnhub WebSocket error details:", errorDetails);
        setStocksConnected(false);
        toast({
          variant: "destructive",
          title: "Connection Error",
          description: "Failed to connect to Finnhub. Will retry shortly.",
        });
      };
      
      ws.onclose = (event) => {
        console.log(`Finnhub WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason || "No reason provided"}, Clean: ${event.wasClean}`);
        setStocksConnected(false);
        
        // Attempt to reconnect after a delay
        const reconnectDelay = 5000;
        console.log(`Will attempt to reconnect in ${reconnectDelay/1000} seconds`);
        setTimeout(connectWebSocket, reconnectDelay);
      };
      
      wsRef.current = ws;
      
      // Connect to Kraken for crypto data
      if (cryptos.length > 0) {
        console.log("Attempting to connect to Kraken WebSocket...");
        const krakenWs = new WebSocket('wss://ws.kraken.com/v2');
        
        krakenWs.onopen = () => {
          console.log("Kraken WebSocket connection established successfully");
          setCryptoConnected(true);
          toast({
            title: "Connected",
            description: "Connected to Kraken websocket for crypto",
          });
          
          // Subscribe to all cryptos
          if (cryptos.length > 0) {
            console.log(`Subscribing to ${cryptos.length} cryptos on Kraken`);
            const symbols = cryptos.map(crypto => crypto.symbol);
            const subscriptionMessage = createKrakenSubscription(symbols);
            
            // Log the subscription message for debugging
            console.log("Sending Kraken subscription:", JSON.stringify(subscriptionMessage));
            
            krakenWs.send(JSON.stringify(subscriptionMessage));
            console.log(`Sent subscription for ${symbols.join(', ')}`);
          }
        };
        
        krakenWs.onmessage = (event) => {
          try {
            if (typeof event.data === 'string') {
              // Log the raw message for debugging (truncated for readability)
              console.log("Received Kraken message:", 
                event.data.length > 200 ? event.data.substring(0, 200) + "..." : event.data);
              
              const cryptoPrices = parseKrakenMessage(event.data);
              
              if (cryptoPrices.length > 0) {
                console.log("Parsed crypto prices:", cryptoPrices);
                updateCryptoPrices(cryptoPrices);
                setLastUpdated(new Date());
              }
            } else {
              console.log("Received non-string message from Kraken WebSocket");
            }
          } catch (parseError) {
            console.error("Error processing Kraken WebSocket message:", parseError, "Raw message:", event.data);
          }
        };
        
        krakenWs.onerror = (error) => {
          // Log detailed error information
          console.error("Kraken WebSocket error:", error);
          
          // Try to extract more information from the error object
          let errorDetails = "Unknown error";
          try {
            errorDetails = JSON.stringify(error);
          } catch (e) {
            errorDetails = "Error details could not be stringified";
          }
          
          console.error("Kraken WebSocket error details:", errorDetails);
          setCryptoConnected(false);
          
          toast({
            variant: "destructive",
            title: "Crypto Connection Error",
            description: "Failed to connect to Kraken for crypto data. Will retry shortly.",
          });
        };
        
        krakenWs.onclose = (event) => {
          console.log(`Kraken WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason || "No reason provided"}, Clean: ${event.wasClean}`);
          setCryptoConnected(false);
          
          // Attempt to reconnect after a delay
          const reconnectDelay = 5000;
          console.log(`Will attempt to reconnect to Kraken in ${reconnectDelay/1000} seconds`);
          
          setTimeout(() => {
            if (cryptos.length > 0) {
              try {
                console.log("Attempting to reconnect to Kraken WebSocket...");
                const newKrakenWs = new WebSocket('wss://ws.kraken.com/v2');
                krakenWsRef.current = newKrakenWs;
                
                // Set up event handlers for the new connection
                newKrakenWs.onopen = () => {
                  console.log("Kraken WebSocket reconnection successful");
                  setCryptoConnected(true);
                  
                  // Resubscribe to all cryptos
                  const symbols = cryptos.map(crypto => crypto.symbol);
                  const subscriptionMessage = createKrakenSubscription(symbols);
                  newKrakenWs.send(JSON.stringify(subscriptionMessage));
                  console.log(`Resubscribed to ${symbols.join(', ')}`);
                };
                
                newKrakenWs.onmessage = krakenWs.onmessage;
                newKrakenWs.onerror = krakenWs.onerror;
                newKrakenWs.onclose = krakenWs.onclose;
              } catch (error) {
                console.error("Error reconnecting to Kraken:", error);
              }
            }
          }, reconnectDelay);
        };
        
        krakenWsRef.current = krakenWs;
      }
      
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
        
        if (krakenWsRef.current?.readyState === WebSocket.OPEN) {
          console.log("Cleaning up Kraken WebSocket connection");
          krakenWsRef.current.close();
        }
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
  
  // Update crypto prices from Kraken websocket data
  const updateCryptoPrices = (cryptoPrices: KrakenPrice[]) => {
    setCryptos(prevCryptos => {
      return prevCryptos.map(crypto => {
        // Find matching crypto price data
        const priceData = cryptoPrices.find(cp => cp.symbol === crypto.symbol);
        
        if (priceData) {
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
        }
        
        return crypto;
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
        if (!stocksConnected || !cryptoConnected) {
          connectWebSocket();
        }
      }, settings.checkFrequencySeconds * 1000);
      
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
        setCryptos(prev => [...prev, newCryptoData]);
        setNewCrypto({ symbol: "", purchasePrice: "", shares: "" });
        
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
        setCryptos(prev => prev.filter(crypto => crypto.id !== id));
        
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
      const response = await fetch("/api/cryptos/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cryptoId: id,
          action,
          shares,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} crypto`);
      }
      
      // Update the crypto shares after successful trade
      fetchCryptos();
      
      return await response.json();
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
            {/* Connection Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${cryptoConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-muted-foreground">
                  {cryptoConnected ? 'Connected to Crypto Data' : 'Disconnected'}
                </span>
              </div>
              {lastUpdated && (
                <span className="text-sm text-muted-foreground">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
            
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
                    <Label htmlFor="cryptoPurchasePrice">Purchase Price ($)</Label>
                    <Input
                      id="cryptoPurchasePrice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 50000.00"
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
                />
              </CardContent>
            </Card>
            
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