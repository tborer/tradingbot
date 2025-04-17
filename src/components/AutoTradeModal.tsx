import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

export interface AutoTradeSettings {
  buyThresholdPercent: number;
  sellThresholdPercent: number;
  enableContinuousTrading: boolean;
  oneTimeBuy: boolean;
  oneTimeSell: boolean;
  tradeByShares: boolean;
  tradeByValue: boolean;
  nextAction: 'buy' | 'sell';
  sharesAmount: number;
  totalValue: number;
  orderType: string;
}

interface AutoTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: AutoTradeSettings) => Promise<void>;
  itemName: string;
  itemType: 'stock' | 'crypto';
  initialSettings?: Partial<AutoTradeSettings>;
}

export default function AutoTradeModal({
  isOpen,
  onClose,
  onSave,
  itemName,
  itemType,
  initialSettings = {}
}: AutoTradeModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Set default values or use provided initial settings
  const [settings, setSettings] = useState<AutoTradeSettings>({
    buyThresholdPercent: initialSettings.buyThresholdPercent || 5,
    sellThresholdPercent: initialSettings.sellThresholdPercent || 5,
    enableContinuousTrading: initialSettings.enableContinuousTrading || false,
    oneTimeBuy: initialSettings.oneTimeBuy || false,
    oneTimeSell: initialSettings.oneTimeSell || false,
    tradeByShares: initialSettings.tradeByValue === true ? false : true, // Default to shares unless value is explicitly set
    tradeByValue: initialSettings.tradeByValue || false,
    nextAction: initialSettings.nextAction || 'buy',
    sharesAmount: initialSettings.sharesAmount || 0,
    totalValue: initialSettings.totalValue || 0,
    orderType: initialSettings.orderType || 'market',
  });
  
  // Update settings when initialSettings change (when a different crypto is selected)
  React.useEffect(() => {
    setSettings({
      buyThresholdPercent: initialSettings.buyThresholdPercent || 5,
      sellThresholdPercent: initialSettings.sellThresholdPercent || 5,
      enableContinuousTrading: initialSettings.enableContinuousTrading || false,
      oneTimeBuy: initialSettings.oneTimeBuy || false,
      oneTimeSell: initialSettings.oneTimeSell || false,
      tradeByShares: initialSettings.tradeByValue === true ? false : true, // Default to shares unless value is explicitly set
      tradeByValue: initialSettings.tradeByValue || false,
      nextAction: initialSettings.nextAction || 'buy',
      sharesAmount: initialSettings.sharesAmount || 0,
      totalValue: initialSettings.totalValue || 0,
      orderType: initialSettings.orderType || 'market',
    });
  }, [initialSettings, itemName]);

  const handleSave = async () => {
    // Validate that either shares amount or total value is set
    const hasValidTradeAmount = (settings.tradeByShares && settings.sharesAmount > 0) || 
                               (settings.tradeByValue && settings.totalValue > 0);
    
    if (!hasValidTradeAmount) {
      toast({
        variant: "destructive",
        title: "Invalid Settings",
        description: "Either shares amount or total value must be greater than zero.",
      });
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onSave(settings);
      toast({
        title: "Success",
        description: `Auto trade settings for ${itemName} have been saved.`,
      });
      onClose();
    } catch (error) {
      console.error("Error saving auto trade settings:", error);
      
      // Check if the error has a specific message from the API
      let errorMessage = "Failed to save auto trade settings. Please try again.";
      if (error.response && error.response.data && error.response.data.error) {
        errorMessage = error.response.data.error;
      }
      
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Auto Trade Settings for {itemName}</DialogTitle>
          <DialogDescription>
            Configure how this {itemType} should be automatically traded.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Buy Threshold: {settings.buyThresholdPercent}%</Label>
            <Slider
              min={0.1}
              max={10}
              step={0.1}
              value={[settings.buyThresholdPercent]}
              onValueChange={(value) => 
                setSettings({ ...settings, buyThresholdPercent: value[0] })
              }
            />
            <p className="text-sm text-muted-foreground">
              Auto buy when price drops by this percentage.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>Sell Threshold: {settings.sellThresholdPercent}%</Label>
            <Slider
              min={0.1}
              max={10}
              step={0.1}
              value={[settings.sellThresholdPercent]}
              onValueChange={(value) => 
                setSettings({ ...settings, sellThresholdPercent: value[0] })
              }
            />
            <p className="text-sm text-muted-foreground">
              Auto sell when price increases by this percentage.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>Next Action</Label>
            <div className="flex space-x-2">
              <Button 
                variant={settings.nextAction === 'buy' ? 'default' : 'outline'} 
                className="flex-1"
                onClick={() => setSettings({ ...settings, nextAction: 'buy' })}
              >
                Buy
              </Button>
              <Button 
                variant={settings.nextAction === 'sell' ? 'default' : 'outline'} 
                className="flex-1"
                onClick={() => setSettings({ ...settings, nextAction: 'sell' })}
              >
                Sell
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              The next action to take when threshold is reached. Will flip to the other action after successful completion.
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="continuous-trading"
              checked={settings.enableContinuousTrading}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, enableContinuousTrading: checked as boolean })
              }
            />
            <Label htmlFor="continuous-trading">Enable continuous trading</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="one-time-buy"
              checked={settings.oneTimeBuy}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, oneTimeBuy: checked as boolean })
              }
            />
            <Label htmlFor="one-time-buy">1 time buy</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="one-time-sell"
              checked={settings.oneTimeSell}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, oneTimeSell: checked as boolean })
              }
            />
            <Label htmlFor="one-time-sell">1 time sell</Label>
          </div>
          
          <div className="space-y-3">
            <Label>Trade by: <span className="text-red-500">*</span></Label>
            <RadioGroup 
              value={settings.tradeByValue ? "value" : "shares"}
              onValueChange={(value) => 
                setSettings({ 
                  ...settings, 
                  tradeByShares: value === "shares",
                  tradeByValue: value === "value"
                })
              }
            >
              <div className="flex items-center space-x-2 mb-2">
                <RadioGroupItem value="shares" id="trade-shares" />
                <Label htmlFor="trade-shares" className="w-24">Shares</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.sharesAmount}
                  onChange={(e) => setSettings({ 
                    ...settings, 
                    sharesAmount: parseFloat(e.target.value) || 0 
                  })}
                  placeholder="Enter amount"
                  className={`w-40 ${settings.tradeByShares && settings.sharesAmount <= 0 ? 'border-red-500' : ''}`}
                />
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="value" id="trade-value" />
                <Label htmlFor="trade-value" className="w-24">Total value</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.totalValue}
                  onChange={(e) => setSettings({ 
                    ...settings, 
                    totalValue: parseFloat(e.target.value) || 0 
                  })}
                  placeholder="Enter value"
                  className={`w-40 ${settings.tradeByValue && settings.totalValue <= 0 ? 'border-red-500' : ''}`}
                />
              </div>
            </RadioGroup>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-red-500">Required:</span> Specify how much to trade when the threshold is reached.
              {((settings.tradeByShares && settings.sharesAmount <= 0) || 
                (settings.tradeByValue && settings.totalValue <= 0)) && (
                <span className="block mt-1 text-red-500">
                  Please enter a value greater than zero.
                </span>
              )}
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="order-type">Order Type</Label>
            <Select
              value={settings.orderType}
              onValueChange={(value) => setSettings({ ...settings, orderType: value })}
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
            <p className="text-sm text-muted-foreground">
              Specify the type of order to execute when trading.
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}