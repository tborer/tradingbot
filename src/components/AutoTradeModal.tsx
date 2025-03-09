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
  additionalBuy: boolean;
  additionalSell: boolean;
  tradeByShares: boolean;
  tradeByValue: boolean;
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
    additionalBuy: initialSettings.additionalBuy || false,
    additionalSell: initialSettings.additionalSell || false,
    tradeByShares: initialSettings.tradeByShares || true,
    tradeByValue: initialSettings.tradeByValue || false,
  });

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
              min={1}
              max={50}
              step={0.5}
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
              min={1}
              max={50}
              step={0.5}
              value={[settings.sellThresholdPercent]}
              onValueChange={(value) => 
                setSettings({ ...settings, sellThresholdPercent: value[0] })
              }
            />
            <p className="text-sm text-muted-foreground">
              Auto sell when price increases by this percentage.
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
              id="additional-buy"
              checked={settings.additionalBuy}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, additionalBuy: checked as boolean })
              }
            />
            <Label htmlFor="additional-buy">1 time buy</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="additional-sell"
              checked={settings.additionalSell}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, additionalSell: checked as boolean })
              }
            />
            <Label htmlFor="additional-sell">1 time sell</Label>
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
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="shares" id="trade-shares" />
                <Label htmlFor="trade-shares">Shares</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="value" id="trade-value" />
                <Label htmlFor="trade-value">Total value</Label>
              </div>
            </RadioGroup>
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