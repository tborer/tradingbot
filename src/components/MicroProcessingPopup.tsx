import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";

export interface MicroProcessingSettings {
  enabled: boolean;
  sellPercentage: number;
  tradeByShares: number;
  tradeByValue: boolean;
  totalValue: number;
  websocketProvider: 'kraken' | 'coinbase';
  tradingPlatform: 'kraken' | 'coinbase';
}

interface MicroProcessingPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: MicroProcessingSettings) => Promise<void>;
  cryptoId: string;
  symbol: string;
  initialSettings?: Partial<MicroProcessingSettings>;
}

export default function MicroProcessingPopup({
  isOpen,
  onClose,
  onSave,
  cryptoId,
  symbol,
  initialSettings = {}
}: MicroProcessingPopupProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Default settings
  const defaultSettings: MicroProcessingSettings = {
    enabled: false,
    sellPercentage: 0.5, // Default to 0.5%
    tradeByShares: 0,
    tradeByValue: false,
    totalValue: 0,
    websocketProvider: 'kraken',
    tradingPlatform: 'kraken'
  };
  
  // Merge initial settings with defaults, ensuring all values are of the correct type
  const [settings, setSettings] = useState<MicroProcessingSettings>(() => ({
    ...defaultSettings,
    enabled: initialSettings?.enabled ?? defaultSettings.enabled,
    sellPercentage: Number(initialSettings?.sellPercentage) || defaultSettings.sellPercentage,
    tradeByShares: Number(initialSettings?.tradeByShares) || defaultSettings.tradeByShares,
    tradeByValue: initialSettings?.tradeByValue ?? defaultSettings.tradeByValue,
    totalValue: Number(initialSettings?.totalValue) || defaultSettings.totalValue,
    websocketProvider: initialSettings?.websocketProvider || defaultSettings.websocketProvider,
    tradingPlatform: initialSettings?.tradingPlatform || defaultSettings.tradingPlatform
  }));
  
  // Update settings when initialSettings change
  useEffect(() => {
    setSettings({
      ...defaultSettings,
      enabled: initialSettings?.enabled ?? defaultSettings.enabled,
      sellPercentage: Number(initialSettings?.sellPercentage) || defaultSettings.sellPercentage,
      tradeByShares: Number(initialSettings?.tradeByShares) || defaultSettings.tradeByShares,
      tradeByValue: initialSettings?.tradeByValue ?? defaultSettings.tradeByValue,
      totalValue: Number(initialSettings?.totalValue) || defaultSettings.totalValue,
      websocketProvider: initialSettings?.websocketProvider || defaultSettings.websocketProvider,
      tradingPlatform: initialSettings?.tradingPlatform || defaultSettings.tradingPlatform
    });
  }, [initialSettings]);
  
  const handleSave = async () => {
    // Validate settings based on trade type
    if (!settings.tradeByValue && settings.tradeByShares <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Input",
        description: "Please enter a valid number of shares greater than 0.",
      });
      return;
    }
    
    if (settings.tradeByValue && settings.totalValue <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Input",
        description: "Please enter a valid total value greater than 0.",
      });
      return;
    }
    
    // Ensure all values are of the correct type
    const validatedSettings: MicroProcessingSettings = {
      enabled: Boolean(settings.enabled),
      sellPercentage: Number(settings.sellPercentage) || 0.5,
      tradeByShares: Number(settings.tradeByShares) || 0,
      tradeByValue: Boolean(settings.tradeByValue),
      totalValue: Number(settings.totalValue) || 0,
      websocketProvider: settings.websocketProvider || 'kraken',
      tradingPlatform: settings.tradingPlatform || 'kraken'
    };
    
    setIsSubmitting(true);
    try {
      await onSave(validatedSettings);
      onClose();
      toast({
        title: "Settings Saved",
        description: `Micro processing settings for ${symbol} have been updated.`,
      });
    } catch (error) {
      console.error("Error saving micro processing settings:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save micro processing settings. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Micro Processing Settings - {symbol}</DialogTitle>
          <DialogDescription>
            Configure micro processing settings for automated small-scale trading.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Enable Micro Processing */}
          <div className="flex items-center justify-between">
            <Label htmlFor="enable-micro-processing" className="text-sm font-medium">
              Enable Micro Processing
            </Label>
            <Switch
              id="enable-micro-processing"
              checked={settings.enabled}
              onCheckedChange={(checked) => setSettings({...settings, enabled: checked})}
            />
          </div>
          
          {/* Sell Percentage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="sell-percentage" className="text-sm font-medium">
                Sell Percentage
              </Label>
              <span className="text-sm font-medium">{settings.sellPercentage.toFixed(3)}%</span>
            </div>
            <Slider
              id="sell-percentage"
              min={0.005}
              max={5}
              step={0.005}
              value={[settings.sellPercentage]}
              onValueChange={(value) => setSettings({...settings, sellPercentage: value[0]})}
            />
            <p className="text-xs text-muted-foreground">
              The percentage increase at which to sell after buying.
            </p>
          </div>
          
          {/* Trade Method Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Trade Method</Label>
            <RadioGroup
              value={settings.tradeByValue ? "value" : "shares"}
              onValueChange={(value) => 
                setSettings({...settings, tradeByValue: value === "value"})
              }
              className="flex space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="shares" id="trade-by-shares-option" />
                <Label htmlFor="trade-by-shares-option">Trade by Shares</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="value" id="trade-by-value-option" />
                <Label htmlFor="trade-by-value-option">Trade by Value</Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              Choose whether to trade a fixed number of shares or a fixed USD value.
            </p>
          </div>
          
          {/* Trade By Shares (shown when tradeByValue is false) */}
          {!settings.tradeByValue && (
            <div className="space-y-2">
              <Label htmlFor="trade-by-shares" className="text-sm font-medium">
                Number of Shares
              </Label>
              <Input
                id="trade-by-shares"
                type="number"
                min="0.00000001"
                step="0.00000001"
                value={settings.tradeByShares}
                onChange={(e) => setSettings({...settings, tradeByShares: Number(e.target.value)})}
                placeholder="Enter number of shares"
              />
              <p className="text-xs text-muted-foreground">
                Number of shares to trade in each micro processing cycle.
              </p>
            </div>
          )}
          
          {/* Trade By Value (shown when tradeByValue is true) */}
          {settings.tradeByValue && (
            <div className="space-y-2">
              <Label htmlFor="total-value" className="text-sm font-medium">
                Total Value (USD)
              </Label>
              <Input
                id="total-value"
                type="number"
                min="0.01"
                step="0.01"
                value={settings.totalValue}
                onChange={(e) => setSettings({...settings, totalValue: Number(e.target.value)})}
                placeholder="Enter total value in USD"
              />
              <p className="text-xs text-muted-foreground">
                Total USD value to trade in each micro processing cycle. The number of shares will be calculated based on the current price.
              </p>
            </div>
          )}
          
          {/* WebSocket Provider */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">WebSocket Provider</Label>
            <RadioGroup
              value={settings.websocketProvider}
              onValueChange={(value: 'kraken' | 'coinbase') => 
                setSettings({...settings, websocketProvider: value})
              }
              className="flex space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="kraken" id="websocket-kraken" />
                <Label htmlFor="websocket-kraken">Kraken</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="coinbase" id="websocket-coinbase" />
                <Label htmlFor="websocket-coinbase">Coinbase</Label>
              </div>
            </RadioGroup>
          </div>
          
          {/* Trading Platform */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Trading Platform</Label>
            <RadioGroup
              value={settings.tradingPlatform}
              onValueChange={(value: 'kraken' | 'coinbase') => 
                setSettings({...settings, tradingPlatform: value})
              }
              className="flex space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="kraken" id="platform-kraken" />
                <Label htmlFor="platform-kraken">Kraken</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="coinbase" id="platform-coinbase" />
                <Label htmlFor="platform-coinbase">Coinbase</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}