import React, { useState } from 'react';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2, GripVertical, ShoppingCart, DollarSign, PlusCircle, TrendingUp, RefreshCw, Lightbulb, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { CryptoWithPrice } from "@/types/stock";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import AutoTradeModal, { AutoTradeSettings } from "@/components/AutoTradeModal";
import TrendsPopup from "@/components/TrendsPopup";
import SupportResistancePopup from "@/components/SupportResistancePopup";
import MicroProcessingPopup, { MicroProcessingSettings } from "@/components/MicroProcessingPopup";
import { Settings } from "@/icons/Settings";
import { formatDecimal } from "@/util/number";
import { useAnalysis } from "@/contexts/AnalysisContext";

interface SortableCryptoItemProps {
  crypto: CryptoWithPrice;
  onDelete: (id: string, symbol: string) => void;
  onToggleAutoSell: (id: string, value: boolean) => void;
  onToggleAutoBuy: (id: string, value: boolean) => void;
  onRowClick: (id: string, symbol: string) => void;
  onUpdateShares: (id: string, shares: number) => Promise<void>;
  onUpdatePurchasePrice: (id: string, price: number) => Promise<void>;
  onOpenAutoTradeModal: (id: string, symbol: string) => void;
  onOpenMicroProcessingModal: (id: string, symbol: string) => void;
  onAddToResearch: (symbol: string) => void;
  onOpenTrendsPopup: (symbol: string) => void;
  onOpenSupportResistancePopup: (symbol: string) => void;
  hasAnalysisData: (symbol: string) => boolean;
  hasSupportResistanceData: (symbol: string) => boolean;
}

function SortableCryptoItem({ 
  crypto, 
  onDelete, 
  onToggleAutoSell, 
  onToggleAutoBuy, 
  onRowClick,
  onUpdateShares,
  onUpdatePurchasePrice,
  onOpenAutoTradeModal,
  onOpenMicroProcessingModal,
  onAddToResearch,
  onOpenTrendsPopup,
  onOpenSupportResistancePopup,
  hasAnalysisData,
  hasSupportResistanceData
}: SortableCryptoItemProps) {
  const { 
    attributes, 
    listeners, 
    setNodeRef, 
    transform, 
    transition 
  } = useSortable({ id: crypto.id });
  
  const [sharesValue, setSharesValue] = useState(crypto.shares.toString());
  const [isEditing, setIsEditing] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSharesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setSharesValue(e.target.value);
  };

  const handleSharesBlur = async () => {
    setIsEditing(false);
    
    const newShares = Number(sharesValue);
    if (!isNaN(newShares) && newShares >= 0) {
      try {
        await onUpdateShares(crypto.id, newShares);
      } catch (error) {
        console.error('Error updating shares:', error);
      }
    } else {
      // Reset to original value if invalid
      setSharesValue(crypto.shares.toString());
    }
  };

  const handleSharesKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <TableRow 
      ref={setNodeRef} 
      style={style} 
      className="group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
      onClick={(event) => {
        // Open trade dialog when clicking anywhere on the row
        // We'll use a custom data attribute to prevent opening when clicking on buttons
        if (!(event.target as HTMLElement).closest('[data-no-row-click]')) {
          onRowClick(crypto.id, crypto.symbol);
        }
      }}
    >
      <TableCell className="w-10">
        <div 
          {...attributes} 
          {...listeners} 
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          data-no-row-click
        >
          <GripVertical className="h-4 w-4 text-gray-400" />
        </div>
      </TableCell>
      <TableCell className="font-medium">{crypto.symbol}</TableCell>
      <TableCell>
        <div className="flex items-center">
          <span>${formatDecimal(crypto.purchasePrice, 6)}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-1"
            title="Update purchase price to current price"
            data-no-row-click
            onClick={(e) => {
              e.stopPropagation();
              if (crypto.currentPrice) {
                onUpdatePurchasePrice(crypto.id, crypto.currentPrice);
              }
            }}
            disabled={!crypto.currentPrice}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
      <TableCell>
        {isEditing ? (
          <Input
            type="number"
            value={sharesValue}
            onChange={handleSharesChange}
            onBlur={handleSharesBlur}
            onKeyDown={handleSharesKeyDown}
            min="0.000001"
            step="0.000001"
            className="w-24 h-8 text-sm"
            data-no-row-click
            autoFocus
          />
        ) : (
          <div 
            className="cursor-text hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            data-no-row-click
          >
            {formatDecimal(Number(crypto.shares), 6)}
          </div>
        )}
      </TableCell>
      <TableCell>
        {crypto.currentPrice !== undefined && crypto.currentPrice !== null
          ? `$${formatDecimal(crypto.currentPrice, 2)}` 
          : "Waiting..."}
      </TableCell>
      <TableCell>
        {crypto.percentChange !== undefined ? (
          <span className={crypto.percentChange >= 0 ? "text-green-500" : "text-red-500"}>
            {crypto.percentChange >= 0 ? "+" : ""}
            {crypto.percentChange.toFixed(2)}%
          </span>
        ) : (
          "Waiting..."
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center space-x-2" data-no-row-click>
          <div className="flex items-center space-x-2">
            <Label htmlFor={`auto-enable-${crypto.id}`} className="text-xs mr-2">Enable auto:</Label>
            <Checkbox
              id={`auto-enable-${crypto.id}`}
              checked={crypto.autoBuy || crypto.autoSell}
              onCheckedChange={(checked) => {
                if (checked) {
                  // Default to buy when enabling
                  onToggleAutoBuy(crypto.id, true);
                  onToggleAutoSell(crypto.id, false);
                } else {
                  // Disable both when unchecking
                  onToggleAutoBuy(crypto.id, false);
                  onToggleAutoSell(crypto.id, false);
                }
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 ml-1"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAutoTradeModal(crypto.id, crypto.symbol);
              }}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          data-no-row-click
          onClick={(e) => {
            e.stopPropagation();
            onAddToResearch(crypto.symbol);
          }}
        >
          <PlusCircle className="h-4 w-4" />
        </Button>
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          data-no-row-click
          onClick={(e) => {
            e.stopPropagation();
            onOpenTrendsPopup(crypto.symbol);
          }}
          className={hasAnalysisData(crypto.symbol) ? "text-blue-500 hover:text-blue-700" : "text-gray-400 hover:text-gray-600"}
          title="View trend analysis"
        >
          <TrendingUp className="h-4 w-4" />
        </Button>
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          data-no-row-click
          onClick={(e) => {
            e.stopPropagation();
            onOpenSupportResistancePopup(crypto.symbol);
          }}
          className={hasSupportResistanceData(crypto.symbol) ? "text-yellow-500 hover:text-yellow-700" : "text-gray-400 hover:text-gray-600"}
          title="View support/resistance analysis"
        >
          <Lightbulb className="h-4 w-4" />
        </Button>
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          data-no-row-click
          onClick={(e) => {
            e.stopPropagation();
            onOpenMicroProcessingModal(crypto.id, crypto.symbol);
          }}
          title="Micro Processing"
        >
          <Search className="h-4 w-4" />
        </Button>
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          data-no-row-click
          onClick={(e) => {
            e.stopPropagation();
            onDelete(crypto.id, crypto.symbol);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

interface SortableCryptoListProps {
  cryptos: CryptoWithPrice[];
  onDelete: (id: string, symbol: string) => void;
  onReorder: (cryptos: CryptoWithPrice[]) => void;
  onToggleAutoSell?: (id: string, value: boolean) => Promise<void>;
  onToggleAutoBuy?: (id: string, value: boolean) => Promise<void>;
  onTrade?: (id: string, symbol: string, action: 'buy' | 'sell', shares: number) => Promise<void>;
  onUpdateShares?: (id: string, shares: number) => Promise<void>;
  onUpdatePurchasePrice?: (id: string, price: number) => Promise<void>;
  onAddToResearch?: (symbol: string) => void;
}

export default function SortableCryptoList({ 
  cryptos, 
  onDelete, 
  onReorder,
  onToggleAutoSell,
  onToggleAutoBuy,
  onTrade,
  onUpdateShares,
  onUpdatePurchasePrice,
  onAddToResearch
}: SortableCryptoListProps) {
  const { toast } = useToast();
  const { items: analysisItems } = useAnalysis();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [tradeAction, setTradeAction] = useState<'buy' | 'sell'>('buy');
  const [selectedCrypto, setSelectedCrypto] = useState<{ id: string; symbol: string } | null>(null);
  const [shares, setShares] = useState<string>('');
  const [orderType, setOrderType] = useState<string>('market');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoTradeModalOpen, setAutoTradeModalOpen] = useState(false);
  const [selectedAutoTradeStock, setSelectedAutoTradeStock] = useState<{ id: string; symbol: string } | null>(null);
  const [trendsPopupOpen, setTrendsPopupOpen] = useState(false);
  const [selectedTrendsSymbol, setSelectedTrendsSymbol] = useState<string>('');
  const [supportResistancePopupOpen, setSupportResistancePopupOpen] = useState(false);
  const [selectedSupportResistanceSymbol, setSelectedSupportResistanceSymbol] = useState<string>('');
  const [microProcessingPopupOpen, setMicroProcessingPopupOpen] = useState(false);
  const [selectedMicroProcessingCrypto, setSelectedMicroProcessingCrypto] = useState<{ id: string; symbol: string } | null>(null);
  const [currentMicroProcessingSettings, setCurrentMicroProcessingSettings] = useState<Partial<MicroProcessingSettings>>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = cryptos.findIndex(crypto => crypto.id === active.id);
      const newIndex = cryptos.findIndex(crypto => crypto.id === over.id);
      
      const newCryptos = arrayMove(cryptos, oldIndex, newIndex);
      onReorder(newCryptos);
    }
    
    setActiveId(null);
  }

  const handleToggleAutoSell = async (id: string, value: boolean) => {
    if (onToggleAutoSell) {
      try {
        await onToggleAutoSell(id, value);
      } catch (error) {
        console.error('Error toggling auto sell:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update auto sell setting.",
        });
      }
    }
  };

  const handleToggleAutoBuy = async (id: string, value: boolean) => {
    if (onToggleAutoBuy) {
      try {
        await onToggleAutoBuy(id, value);
      } catch (error) {
        console.error('Error toggling auto buy:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to update auto buy setting.",
        });
      }
    }
  };

  const handleRowClick = (id: string, symbol: string) => {
    setSelectedCrypto({ id, symbol });
    setTradeAction('buy');
    setShares('');
    setOrderType('market');
    setTradeDialogOpen(true);
  };
  
  const [currentAutoTradeSettings, setCurrentAutoTradeSettings] = useState<Partial<AutoTradeSettings>>({});
  
  const handleOpenMicroProcessingModal = async (id: string, symbol: string) => {
    try {
      console.log(`Fetching micro processing settings for crypto: ${symbol} (${id})`);
      
      // Default settings to use if we can't fetch or if there are no existing settings
      const defaultSettings = {
        enabled: false,
        sellPercentage: 0.5,
        tradeByShares: 0,
        tradeByValue: false,
        totalValue: 0,
        websocketProvider: 'kraken',
        tradingPlatform: 'kraken'
      };
      
      // First, get the crypto details to ensure we have the correct data
      const cryptoResponse = await fetch(`/api/cryptos/${id}`, {
        method: "GET",
        headers: {
          'Accept': 'application/json'
        }
      });
      
      let cryptoData = null;
      if (cryptoResponse.ok) {
        cryptoData = await cryptoResponse.json();
        console.log("Fetched crypto data:", cryptoData);
      }
      
      // Fetch the current micro processing settings for this specific crypto
      const response = await fetch(`/api/cryptos/micro-processing-settings?cryptoId=${id}`, {
        method: "GET",
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        try {
          const settings = await response.json();
          console.log(`Received settings data:`, settings);
          
          // Use the fetched settings with proper type conversion
          setCurrentMicroProcessingSettings({
            enabled: Boolean(settings.enabled),
            sellPercentage: Number(settings.sellPercentage) || 0.5,
            tradeByShares: Number(settings.tradeByShares) || 0,
            tradeByValue: Boolean(settings.tradeByValue),
            totalValue: Number(settings.totalValue) || 0,
            websocketProvider: settings.websocketProvider || 'kraken',
            tradingPlatform: settings.tradingPlatform || 'kraken',
            purchasePrice: settings.purchasePrice !== null ? Number(settings.purchasePrice) : undefined
          });
          
          console.log(`Successfully loaded settings for ${symbol}`);
        } catch (jsonError) {
          console.error("Error parsing JSON response:", jsonError);
          setCurrentMicroProcessingSettings(defaultSettings);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to parse settings data. Default settings will be used.",
          });
        }
      } else {
        // Try to get more detailed error information
        let errorMessage = "Failed to load micro processing settings";
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.details || errorMessage;
            console.error("API error details:", errorData);
          } else {
            // If not JSON, log the status
            console.error(`API returned non-JSON response with status ${response.status}`);
            errorMessage = `Server error (${response.status})`;
          }
        } catch (parseError) {
          console.error("Could not parse error response:", parseError);
        }
        
        // Reset to default settings if there was an error
        setCurrentMicroProcessingSettings(defaultSettings);
        
        console.error(`Failed to fetch micro processing settings: ${errorMessage}`);
        toast({
          variant: "destructive",
          title: "Error",
          description: `Failed to load micro processing settings. Default settings will be used.`,
        });
      }
    } catch (error) {
      console.error("Error fetching micro processing settings:", error);
      // Reset to default settings if there was an error
      setCurrentMicroProcessingSettings({
        enabled: false,
        sellPercentage: 0.5,
        tradeByShares: 0,
        websocketProvider: 'kraken',
        tradingPlatform: 'kraken'
      });
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to load micro processing settings. Default settings will be used.`,
      });
    }
    
    setSelectedMicroProcessingCrypto({ id, symbol });
    setMicroProcessingPopupOpen(true);
  };
  
  const handleSaveMicroProcessingSettings = async (settings: MicroProcessingSettings) => {
    if (!selectedMicroProcessingCrypto) return;
    
    try {
      // Validate settings before sending to API
      const validatedSettings = {
        enabled: Boolean(settings.enabled),
        sellPercentage: Number(settings.sellPercentage) || 0.5,
        tradeByShares: Number(settings.tradeByShares) || 0,
        tradeByValue: Boolean(settings.tradeByValue),
        totalValue: Number(settings.totalValue) || 0,
        websocketProvider: settings.websocketProvider || 'kraken',
        tradingPlatform: settings.tradingPlatform || 'kraken',
        purchasePrice: settings.purchasePrice !== undefined ? Number(settings.purchasePrice) : null,
        processingStatus: 'idle' // Always reset to idle when saving
      };
      
      console.log("Sending settings to API:", JSON.stringify(validatedSettings, null, 2));
      
      // Save the micro processing settings to the backend
      const response = await fetch(`/api/cryptos/micro-processing-settings`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          cryptoId: selectedMicroProcessingCrypto.id,
          settings: validatedSettings
        }),
      });
      
      if (!response.ok) {
        let errorMessage = "Failed to save micro processing settings";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.details || errorMessage;
        } catch (parseError) {
          console.error("Could not parse error response:", parseError);
        }
        throw new Error(errorMessage);
      }
      
      toast({
        title: "Micro Processing Settings Saved",
        description: `Settings for ${selectedMicroProcessingCrypto.symbol} have been updated.`,
      });
      
      // Trigger micro processing if enabled
      if (settings.enabled) {
        try {
          const processResponse = await fetch('/api/cryptos/process-micro-processing', {
            method: 'POST'
          });
          
          if (processResponse.ok) {
            toast({
              title: "Micro Processing Started",
              description: "Micro processing has been initiated for enabled cryptocurrencies.",
            });
          }
        } catch (processError) {
          console.error("Error starting micro processing:", processError);
          toast({
            variant: "destructive",
            title: "Warning",
            description: "Micro processing settings were saved, but there was an error starting the process.",
          });
        }
      }
    } catch (error) {
      console.error("Error saving micro processing settings:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save micro processing settings. Please try again.",
      });
    }
  };
  
  const handleOpenAutoTradeModal = async (id: string, symbol: string) => {
    try {
      // Fetch the current auto trade settings for this specific crypto
      const response = await fetch(`/api/cryptos/auto-trade-settings?cryptoId=${id}`, {
        method: "GET",
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.autoTradeSettings) {
          // Use the fetched settings
          setCurrentAutoTradeSettings({
            buyThresholdPercent: data.autoTradeSettings.buyThresholdPercent,
            sellThresholdPercent: data.autoTradeSettings.sellThresholdPercent,
            enableContinuousTrading: data.autoTradeSettings.enableContinuousTrading,
            oneTimeBuy: data.autoTradeSettings.oneTimeBuy,
            oneTimeSell: data.autoTradeSettings.oneTimeSell,
            nextAction: data.autoTradeSettings.nextAction,
            tradeByShares: data.autoTradeSettings.tradeByShares,
            tradeByValue: data.autoTradeSettings.tradeByValue,
            sharesAmount: data.autoTradeSettings.sharesAmount,
            totalValue: data.autoTradeSettings.totalValue,
            orderType: data.autoTradeSettings.orderType || 'market',
          });
        } else {
          // Reset to default settings if none exist for this crypto
          setCurrentAutoTradeSettings({
            buyThresholdPercent: 5,
            sellThresholdPercent: 5,
            enableContinuousTrading: false,
            oneTimeBuy: false,
            oneTimeSell: false,
            tradeByShares: true,
            tradeByValue: false,
            sharesAmount: 0,
            totalValue: 0,
            orderType: 'market'
          });
        }
      } else {
        // Reset to default settings if there was an error
        setCurrentAutoTradeSettings({
          buyThresholdPercent: 5,
          sellThresholdPercent: 5,
          enableContinuousTrading: false,
          oneTimeBuy: false,
          oneTimeSell: false,
          tradeByShares: true,
          tradeByValue: false,
          sharesAmount: 0,
          totalValue: 0,
          orderType: 'market'
        });
        console.error("Failed to fetch auto trade settings");
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load auto trade settings for this cryptocurrency. Default settings will be used.",
        });
      }
    } catch (error) {
      console.error("Error fetching auto trade settings:", error);
      // Reset to default settings if there was an error
      setCurrentAutoTradeSettings({
        buyThresholdPercent: 5,
        sellThresholdPercent: 5,
        enableContinuousTrading: false,
        oneTimeBuy: false,
        oneTimeSell: false,
        tradeByShares: true,
        tradeByValue: false,
        sharesAmount: 0,
        totalValue: 0,
        orderType: 'market'
      });
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load auto trade settings for this cryptocurrency. Default settings will be used.",
      });
    }
    
    setSelectedAutoTradeStock({ id, symbol });
    setAutoTradeModalOpen(true);
  };
  
  // Function to check if a crypto has analysis data available
  const hasAnalysisData = (symbol: string) => {
    const item = analysisItems.find(item => 
      item.symbol.toLowerCase() === symbol.toLowerCase() && 
      item.type === 'crypto' &&
      item.analysisData
    );
    return !!item;
  };
  
  // Function to check if a crypto has support/resistance data available
  const hasSupportResistanceData = (symbol: string) => {
    const item = analysisItems.find(item => 
      item.symbol.toLowerCase() === symbol.toLowerCase() && 
      item.type === 'crypto' &&
      item.analysisData?.supportResistance
    );
    return !!item;
  };
  
  // Function to open the trends popup
  const handleOpenTrendsPopup = async (symbol: string) => {
    setSelectedTrendsSymbol(symbol);
    setTrendsPopupOpen(true);
    
    try {
      // Get the API key from environment variables
      const apiKey = process.env.NEXT_PUBLIC_COINDESK_API_KEY;
      
      if (!apiKey) {
        console.error("CoinDesk API key not found in environment variables");
        toast({
          variant: "destructive",
          title: "API Key Missing",
          description: "CoinDesk API key is not configured. Please contact the administrator.",
        });
        return;
      }
      
      // Fetch and analyze trend data
      const response = await fetch(`/api/cryptos/historical?symbol=${symbol}&days=30`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch historical data: ${response.statusText}`);
      }
      
      // Show loading toast
      toast({
        title: "Analyzing Trends",
        description: `Analyzing historical data for ${symbol}...`,
      });
    } catch (error) {
      console.error("Error fetching trend data:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch trend data. Please try again later.",
      });
    }
  };
  
  // Function to open the support/resistance popup
  const handleOpenSupportResistancePopup = async (symbol: string) => {
    setSelectedSupportResistanceSymbol(symbol);
    setSupportResistancePopupOpen(true);
    
    try {
      // Get the API key from environment variables
      const apiKey = process.env.NEXT_PUBLIC_COINDESK_API_KEY;
      
      if (!apiKey) {
        console.error("CoinDesk API key not found in environment variables");
        toast({
          variant: "destructive",
          title: "API Key Missing",
          description: "CoinDesk API key is not configured. Please contact the administrator.",
        });
        return;
      }
      
      // Fetch historical data (same as for trends analysis)
      const response = await fetch(`/api/cryptos/historical?symbol=${symbol}&days=30`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch historical data: ${response.statusText}`);
      }
      
      // Show loading toast
      toast({
        title: "Analyzing Support/Resistance",
        description: `Analyzing support and resistance levels for ${symbol}...`,
      });
    } catch (error) {
      console.error("Error fetching historical data for support/resistance:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch historical data. Please try again later.",
      });
    }
  };
  
  const handleSaveAutoTradeSettings = async (settings: AutoTradeSettings) => {
    if (!selectedAutoTradeStock) return;
    
    try {
      // Save the auto trade settings to the backend
      const response = await fetch(`/api/cryptos/auto-trade-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cryptoId: selectedAutoTradeStock.id,
          settings
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save auto trade settings");
      }
      
      toast({
        title: "Auto Trade Settings Saved",
        description: `Settings for ${selectedAutoTradeStock.symbol} have been updated.`,
      });
      
      // Enable auto buy or sell based on settings
      if (onToggleAutoBuy && onToggleAutoSell) {
        // Update the auto buy/sell flags based on settings
        if (settings.nextAction === 'buy' || settings.oneTimeBuy) {
          await onToggleAutoBuy(selectedAutoTradeStock.id, true);
        }
        if (settings.nextAction === 'sell' || settings.oneTimeSell) {
          await onToggleAutoSell(selectedAutoTradeStock.id, true);
        }
      }
    } catch (error) {
      console.error("Error saving auto trade settings:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save auto trade settings. Please try again.",
      });
    }
  };

  const handleTrade = async () => {
    if (!selectedCrypto || !shares || isNaN(Number(shares)) || Number(shares) <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Input",
        description: "Please enter a valid number of shares.",
      });
      return;
    }

    if (onTrade) {
      setIsSubmitting(true);
      try {
        // If this is a sell action, first check if we have enough shares in the local database
        if (tradeAction === 'sell') {
          // Find the crypto in our list to check shares
          const crypto = cryptos.find(c => c.id === selectedCrypto?.id);
          if (crypto && Number(shares) > crypto.shares) {
            toast({
              variant: "destructive",
              title: "Not Enough Shares",
              description: `You only have ${crypto.shares.toFixed(8)} shares of ${selectedCrypto?.symbol} available to sell.`,
            });
            setIsSubmitting(false);
            return;
          }
        }

        // Execute the trade using the onTrade callback
        await onTrade(selectedCrypto.id, selectedCrypto.symbol, tradeAction, Number(shares));
        
        setTradeDialogOpen(false);
        toast({
          title: "Success",
          description: `Successfully ${tradeAction === 'buy' ? 'bought' : 'sold'} ${shares} shares of ${selectedCrypto.symbol}.`,
        });
        
        // Dispatch a custom event to notify the transaction history component to refresh
        const event = new CustomEvent('crypto-transaction-completed', {
          detail: {
            action: tradeAction,
            symbol: selectedCrypto.symbol,
            shares: Number(shares)
          }
        });
        window.dispatchEvent(event);
        
        // No page refresh needed - the transaction history will update via the event
      } catch (error) {
        console.error(`Error ${tradeAction}ing crypto:`, error);
        
        // Check for specific error messages
        let errorTitle = `Failed to ${tradeAction} ${selectedCrypto?.symbol}`;
        let errorDescription = error.message || `An error occurred. Check transaction history for details.`;
        
        // Special handling for "Not enough shares to sell" error
        if (error.message && error.message.includes("Not enough shares to sell")) {
          errorTitle = "Insufficient Shares";
          errorDescription = error.message || `You don't have enough shares to complete this sale.`;
        }
        
        toast({
          variant: "destructive",
          title: errorTitle,
          description: errorDescription,
        });
        
        // Close the dialog after error
        setTradeDialogOpen(false);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (cryptos.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-4">
        You haven't added any cryptocurrencies yet. Add your first crypto above.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => setActiveId(event.active.id as string)}
          onDragEnd={handleDragEnd}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Purchase Price ($Per Share)</TableHead>
                <TableHead>Shares</TableHead>
                <TableHead>Current Price</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Trends</TableHead>
                <TableHead>Support/Resistance</TableHead>
                <TableHead>Micro Processing</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext 
                items={cryptos.map(crypto => crypto.id)} 
                strategy={verticalListSortingStrategy}
              >
                {cryptos.map((crypto) => (
                  <SortableCryptoItem 
                    key={crypto.id} 
                    crypto={crypto} 
                    onDelete={onDelete}
                    onToggleAutoSell={handleToggleAutoSell}
                    onToggleAutoBuy={handleToggleAutoBuy}
                    onRowClick={handleRowClick}
                    onUpdateShares={onUpdateShares || (async () => {})}
                    onUpdatePurchasePrice={onUpdatePurchasePrice || (async () => {})}
                    onOpenAutoTradeModal={handleOpenAutoTradeModal}
                    onAddToResearch={onAddToResearch || (() => {})}
                    onOpenMicroProcessingModal={handleOpenMicroProcessingModal}
                    onOpenTrendsPopup={handleOpenTrendsPopup}
                    onOpenSupportResistancePopup={handleOpenSupportResistancePopup}
                    hasAnalysisData={hasAnalysisData}
                    hasSupportResistanceData={hasSupportResistanceData}
                  />
                ))}
              </SortableContext>
            </TableBody>
          </Table>
        </DndContext>
      </div>

      <Dialog open={tradeDialogOpen} onOpenChange={setTradeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tradeAction === 'buy' ? 'Buy' : 'Sell'} {selectedCrypto?.symbol}
            </DialogTitle>
            <DialogDescription>
              Enter the number of shares you want to {tradeAction}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="shares">Number of Shares</Label>
              <Input
                id="shares"
                type="number"
                min="0.00000001"
                step="0.00000001"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="Enter number of shares"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-type">Order Type</Label>
              <Select
                value={orderType}
                onValueChange={setOrderType}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select order type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="market">Market</SelectItem>
                  <SelectItem value="limit">Limit</SelectItem>
                  <SelectItem value="iceberg">Iceberg</SelectItem>
                  <SelectItem value="stop-loss">Stop-Loss</SelectItem>
                  <SelectItem value="take-profit">Take-Profit</SelectItem>
                  <SelectItem value="stop-loss-limit">Stop-Loss-Limit</SelectItem>
                  <SelectItem value="take-profit-limit">Take-Profit-Limit</SelectItem>
                  <SelectItem value="trailing-stop">Trailing-Stop</SelectItem>
                  <SelectItem value="trailing-stop-limit">Trailing-Stop-Limit</SelectItem>
                  <SelectItem value="settle-position">Settle-Position</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex space-x-2">
              <Button 
                variant={tradeAction === 'buy' ? 'default' : 'outline'} 
                className="flex-1"
                onClick={() => setTradeAction('buy')}
              >
                Buy
              </Button>
              <Button 
                variant={tradeAction === 'sell' ? 'default' : 'outline'} 
                className="flex-1"
                onClick={() => setTradeAction('sell')}
              >
                Sell
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTradeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleTrade} disabled={isSubmitting}>
              {isSubmitting ? 'Processing...' : tradeAction === 'buy' ? 'Buy Shares' : 'Sell Shares'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AutoTradeModal
        isOpen={autoTradeModalOpen}
        onClose={() => setAutoTradeModalOpen(false)}
        onSave={handleSaveAutoTradeSettings}
        itemName={selectedAutoTradeStock?.symbol || ""}
        itemType="crypto"
        initialSettings={currentAutoTradeSettings}
      />
      
      <TrendsPopup
        isOpen={trendsPopupOpen}
        onClose={() => setTrendsPopupOpen(false)}
        symbol={selectedTrendsSymbol}
      />
      
      <SupportResistancePopup
        isOpen={supportResistancePopupOpen}
        onClose={() => setSupportResistancePopupOpen(false)}
        symbol={selectedSupportResistanceSymbol}
      />
      
      <MicroProcessingPopup
        isOpen={microProcessingPopupOpen}
        onClose={() => setMicroProcessingPopupOpen(false)}
        onSave={handleSaveMicroProcessingSettings}
        cryptoId={selectedMicroProcessingCrypto?.id || ""}
        symbol={selectedMicroProcessingCrypto?.symbol || ""}
        initialSettings={currentMicroProcessingSettings}
      />
    </>
  );
}