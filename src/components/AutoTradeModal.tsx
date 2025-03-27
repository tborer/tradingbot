import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
    tradeByShares: initialSettings.tradeByShares || true,
    tradeByValue: initialSettings.tradeByValue || false,
    nextAction: initialSettings.nextAction || 'buy',
    sharesAmount: initialSettings.sharesAmount || 0,
    totalValue: initialSettings.totalValue || 0,
  });
  
  // Update settings when initialSettings change (when a different crypto is selected)
  React.useEffect(() => {
    setSettings({
      buyThresholdPercent: initialSettings.buyThresholdPercent || 5,
      sellThresholdPercent: initialSettings.sellThresholdPercent || 5,
      enableContinuousTrading: initialSettings.enableContinuousTrading || false,
      oneTimeBuy: initialSettings.oneTimeBuy || false,
      oneTimeSell: initialSettings.oneTimeSell || false,
      tradeByShares: initialSettings.tradeByShares || true,
      tradeByValue: initialSettings.tradeByValue || false,
      nextAction: initialSettings.nextAction || 'buy',
      sharesAmount: initialSettings.sharesAmount || 0,
      totalValue: initialSettings.totalValue || 0,
    });
  }, [initialSettings, itemName]);

  const handleSave = async () => {
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
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save auto trade settings. Please try again.",
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
              min={0.25}
              max={10}
              step={0.25}
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
              min={0.25}
              max={10}
              step={0.25}
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
            <Label>Trade by:</Label>
            <RadioGroup 
              defaultValue={settings.tradeByShares ? "shares" : "value"}
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
                  className="w-40"
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
                  className="w-40"
                />
              </div>
            </RadioGroup>
            <p className="text-sm text-muted-foreground">
              Specify how much to trade when the threshold is reached.
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