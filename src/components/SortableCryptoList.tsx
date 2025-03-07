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
import { Trash2, GripVertical } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { CryptoWithPrice } from "@/types/stock";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SortableCryptoItemProps {
  crypto: CryptoWithPrice;
  onDelete: (id: string, symbol: string) => void;
  onToggleAutoSell: (id: string, value: boolean) => void;
  onToggleAutoBuy: (id: string, value: boolean) => void;
  onRowClick: (id: string, symbol: string) => void;
}

function SortableCryptoItem({ 
  crypto, 
  onDelete, 
  onToggleAutoSell, 
  onToggleAutoBuy, 
  onRowClick
}: SortableCryptoItemProps) {
  const { 
    attributes, 
    listeners, 
    setNodeRef, 
    transform, 
    transition 
  } = useSortable({ id: crypto.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
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
      <TableCell>${crypto.purchasePrice.toFixed(2)}</TableCell>
      <TableCell>{crypto.shares.toFixed(2)}</TableCell>
      <TableCell>
        {crypto.currentPrice 
          ? `$${crypto.currentPrice.toFixed(2)}` 
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
            <Label htmlFor={`auto-action-${crypto.id}`} className="text-xs mr-2">Action:</Label>
            <div className="flex border rounded-md overflow-hidden">
              <Button
                type="button"
                variant={crypto.autoBuy ? "default" : "outline"}
                size="sm"
                className="rounded-none h-7 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleAutoBuy(crypto.id, true);
                  onToggleAutoSell(crypto.id, false);
                }}
              >
                Buy
              </Button>
              <Button
                type="button"
                variant={crypto.autoSell ? "default" : "outline"}
                size="sm"
                className="rounded-none h-7 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleAutoBuy(crypto.id, false);
                  onToggleAutoSell(crypto.id, true);
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
}

export default function SortableCryptoList({ 
  cryptos, 
  onDelete, 
  onReorder,
  onToggleAutoSell,
  onToggleAutoBuy,
  onTrade
}: SortableCryptoListProps) {
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [tradeAction, setTradeAction] = useState<'buy' | 'sell'>('buy');
  const [selectedCrypto, setSelectedCrypto] = useState<{ id: string; symbol: string } | null>(null);
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
    setTradeDialogOpen(true);
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
        await onTrade(selectedCrypto.id, selectedCrypto.symbol, tradeAction, Number(shares));
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
                <TableHead>Purchase Price</TableHead>
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
    </>
  );
}