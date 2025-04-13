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
import { Trash2, GripVertical, ShoppingCart, DollarSign } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { CryptoWithPrice } from "@/types/stock";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import AutoTradeModal, { AutoTradeSettings } from "@/components/AutoTradeModal";
import { Settings } from "@/icons/Settings";
import { formatDecimal } from "@/util/number";

interface SortableCryptoItemProps {
  crypto: CryptoWithPrice;
  onDelete: (id: string, symbol: string) => void;
  onToggleAutoSell: (id: string, value: boolean) => void;
  onToggleAutoBuy: (id: string, value: boolean) => void;
  onRowClick: (id: string, symbol: string) => void;
  onUpdateShares: (id: string, shares: number) => Promise<void>;
  onOpenAutoTradeModal: (id: string, symbol: string) => void;
}

function SortableCryptoItem({ 
  crypto, 
  onDelete, 
  onToggleAutoSell, 
  onToggleAutoBuy, 
  onRowClick,
  onUpdateShares,
  onOpenAutoTradeModal
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
      <TableCell>${formatDecimal(crypto.purchasePrice, 6)}</TableCell>
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
}

export default function SortableCryptoList({ 
  cryptos, 
  onDelete, 
  onReorder,
  onToggleAutoSell,
  onToggleAutoBuy,
  onTrade,
  onUpdateShares
}: SortableCryptoListProps) {
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [tradeAction, setTradeAction] = useState<'buy' | 'sell'>('buy');
  const [selectedCrypto, setSelectedCrypto] = useState<{ id: string; symbol: string } | null>(null);
  const [shares, setShares] = useState<string>('');
  const [orderType, setOrderType] = useState<string>('market');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoTradeModalOpen, setAutoTradeModalOpen] = useState(false);
  const [selectedAutoTradeStock, setSelectedAutoTradeStock] = useState<{ id: string; symbol: string } | null>(null);

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
        // Pass the orderType to the API through the URL query parameter
        const response = await fetch(`/api/cryptos/trade`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cryptoId: selectedCrypto.id,
            action: tradeAction,
            shares: Number(shares),
            orderType: orderType
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to execute trade');
        }
        
        setTradeDialogOpen(false);
        toast({
          title: "Success",
          description: `Successfully ${tradeAction === 'buy' ? 'bought' : 'sold'} ${shares} shares of ${selectedCrypto.symbol}.`,
        });
      } catch (error) {
        console.error(`Error ${tradeAction}ing crypto:`, error);
        toast({
          variant: "destructive",
          title: "Error",
          description: `Failed to ${tradeAction} crypto. Please try again.`,
        });
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
                    onOpenAutoTradeModal={handleOpenAutoTradeModal}
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
    </>
  );
}