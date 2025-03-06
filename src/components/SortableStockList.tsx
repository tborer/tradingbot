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

interface Stock {
  id: string;
  ticker: string;
  purchasePrice: number;
  currentPrice?: number;
  percentChange?: number;
  shouldSell?: boolean;
  priority: number;
  createdAt?: string;
}

interface SortableStockItemProps {
  stock: Stock;
  onDelete: (id: string, ticker: string) => void;
}

function SortableStockItem({ stock, onDelete }: SortableStockItemProps) {
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
    <TableRow ref={setNodeRef} style={style} className="group">
      <TableCell className="w-10">
        <div 
          {...attributes} 
          {...listeners} 
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <GripVertical className="h-4 w-4 text-gray-400" />
        </div>
      </TableCell>
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
          onClick={() => onDelete(stock.id, stock.ticker)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

interface SortableStockListProps {
  stocks: Stock[];
  onDelete: (id: string, ticker: string) => void;
  onReorder: (stocks: Stock[]) => void;
}

export default function SortableStockList({ stocks, onDelete, onReorder }: SortableStockListProps) {
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);

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

  if (stocks.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-4">
        You haven't added any stocks yet. Add your first stock above.
      </p>
    );
  }

  return (
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
              <TableHead>Current Price</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Status</TableHead>
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
                />
              ))}
            </SortableContext>
          </TableBody>
        </Table>
      </DndContext>
    </div>
  );
}