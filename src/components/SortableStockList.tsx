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
import { useToast } from "@/components/ui/use-toast";
import { StockWithPrice } from "@/types/stock";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SortableStockItemProps {
  stock: StockWithPrice;
  onDelete: (id: string, ticker: string) => void;
  onToggleAutoSell: (id: string, value: boolean) => void;
  onToggleAutoBuy: (id: string, value: boolean) => void;
  onBuy: (id: string, ticker: string) => void;
  onSell: (id: string, ticker: string) => void;
}

function SortableStockItem({ 
  stock, 
  onDelete, 
  onToggleAutoSell, 
  onToggleAutoBuy, 
  onBuy, 
  onSell 
}: SortableStockItemProps) {
  const { 
    attributes, 
    listeners, 
    setNodeRef, 
    transform, 
    transition 
  } = useSortable({ id: stock.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow 
      ref={setNodeRef} 
      style={style} 
      className="group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
      onClick={() => {
        // Open trade dialog when clicking anywhere on the row
        // We'll use a custom data attribute to prevent opening when clicking on buttons
        if (!(event.target as HTMLElement).closest('[data-no-row-click]')) {
          onBuy(stock.id, stock.ticker);
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
      <TableCell className="font-medium">{stock.ticker}</TableCell>
      <TableCell>${stock.purchasePrice.toFixed(2)}</TableCell>
      <TableCell>{stock.shares.toFixed(2)}</TableCell>
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
        <div className="flex items-center space-x-2" data-no-row-click>
          <div className="flex items-center space-x-2">
            <Label htmlFor={`auto-action-${stock.id}`} className="text-xs mr-2">Action:</Label>
            <div className="flex border rounded-md overflow-hidden">
              <Button
                type="button"
                variant={stock.autoBuy ? "default" : "outline"}
                size="sm"
                className="rounded-none h-7 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleAutoBuy(stock.id, true);
                  onToggleAutoSell(stock.id, false);
                }}
              >
                Buy
              </Button>
              <Button
                type="button"
                variant={stock.autoSell ? "default" : "outline"}
                size="sm"
                className="rounded-none h-7 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleAutoBuy(stock.id, false);
                  onToggleAutoSell(stock.id, true);
                }}
              >
                Sell
              </Button>
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full"
          data-no-row-click
          onClick={(e) => {
            e.stopPropagation();
            onBuy(stock.id, stock.ticker);
          }}
        >
          <ShoppingCart className="h-3 w-3 mr-1" />
          Buy
        </Button>
      </TableCell>
      <TableCell>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full"
          data-no-row-click
          onClick={(e) => {
            e.stopPropagation();
            onSell(stock.id, stock.ticker);
          }}
        >
          <DollarSign className="h-3 w-3 mr-1" />
          Sell
        </Button>
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          data-no-row-click
          onClick={(e) => {
            e.stopPropagation();
            onDelete(stock.id, stock.ticker);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

interface SortableStockListProps {
  stocks: StockWithPrice[];
  onDelete: (id: string, ticker: string) => void;
  onReorder: (stocks: StockWithPrice[]) => void;
  onToggleAutoSell?: (id: string, value: boolean) => Promise<void>;
  onToggleAutoBuy?: (id: string, value: boolean) => Promise<void>;
  onTrade?: (id: string, ticker: string, action: 'buy' | 'sell', shares: number) => Promise<void>;
}

export default function SortableStockList({ 
  stocks, 
  onDelete, 
  onReorder,
  onToggleAutoSell,
  onToggleAutoBuy,
  onTrade
}: SortableStockListProps) {
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [tradeAction, setTradeAction] = useState<'buy' | 'sell'>('buy');
  const [selectedStock, setSelectedStock] = useState<{ id: string; ticker: string } | null>(null);
  const [shares, setShares] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = stocks.findIndex(stock => stock.id === active.id);
      const newIndex = stocks.findIndex(stock => stock.id === over.id);
      
      const newStocks = arrayMove(stocks, oldIndex, newIndex);
      onReorder(newStocks);
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

  const handleBuy = (id: string, ticker: string) => {
    setSelectedStock({ id, ticker });
    setTradeAction('buy');
    setShares('');
    setTradeDialogOpen(true);
  };

  const handleSell = (id: string, ticker: string) => {
    setSelectedStock({ id, ticker });
    setTradeAction('sell');
    setShares('');
    setTradeDialogOpen(true);
  };

  const handleTrade = async () => {
    if (!selectedStock || !shares || isNaN(Number(shares)) || Number(shares) <= 0) {
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
        await onTrade(selectedStock.id, selectedStock.ticker, tradeAction, Number(shares));
        setTradeDialogOpen(false);
        toast({
          title: "Success",
          description: `Successfully ${tradeAction === 'buy' ? 'bought' : 'sold'} ${shares} shares of ${selectedStock.ticker}.`,
        });
      } catch (error) {
        console.error(`Error ${tradeAction}ing stock:`, error);
        toast({
          variant: "destructive",
          title: "Error",
          description: `Failed to ${tradeAction} stock. Please try again.`,
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (stocks.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-4">
        You haven't added any stocks yet. Add your first stock above.
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
                <TableHead>Ticker</TableHead>
                <TableHead>Purchase Price</TableHead>
                <TableHead>Shares</TableHead>
                <TableHead>Current Price</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Buy</TableHead>
                <TableHead>Sell</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext 
                items={stocks.map(stock => stock.id)} 
                strategy={verticalListSortingStrategy}
              >
                {stocks.map((stock) => (
                  <SortableStockItem 
                    key={stock.id} 
                    stock={stock} 
                    onDelete={onDelete}
                    onToggleAutoSell={handleToggleAutoSell}
                    onToggleAutoBuy={handleToggleAutoBuy}
                    onBuy={handleBuy}
                    onSell={handleSell}
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
              {tradeAction === 'buy' ? 'Buy' : 'Sell'} {selectedStock?.ticker}
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
                min="1"
                step="1"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="Enter number of shares"
              />
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
    </>
  );
}