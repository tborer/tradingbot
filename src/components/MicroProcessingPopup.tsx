import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export interface MicroProcessingSettings {
  enabled: boolean;
  sellPercentage: number;
  tradeByShares: number;
  tradeByValue: boolean;
  totalValue: number;
  websocketProvider: 'kraken' | 'coinbase' | 'binance';
  tradingPlatform: 'kraken' | 'coinbase' | 'binance';
  purchasePrice?: number;
  testMode?: boolean;
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
  const [isLoading, setIsLoading] = useState(true);
  
  // Default settings
  const defaultSettings: MicroProcessingSettings = {
    enabled: false,
    sellPercentage: 0.5, // Default to 0.5%
    tradeByShares: 0,
    tradeByValue: false,
    totalValue: 0,
    websocketProvider: 'binance',
    tradingPlatform: 'binance',
    purchasePrice: undefined,
    testMode: false
  };
  
  // Merge initial settings with defaults, ensuring all values are of the correct type
  const [settings, setSettings] = useState<MicroProcessingSettings>(() => {
    // Safely extract values from initialSettings with proper type checking
    const enabled = initialSettings?.enabled === true;
    
    // For numeric values, ensure they are valid numbers or use defaults
    const sellPercentage = typeof initialSettings?.sellPercentage === 'number' && !isNaN(initialSettings.sellPercentage) 
      ? initialSettings.sellPercentage 
      : defaultSettings.sellPercentage;
    
    const tradeByShares = typeof initialSettings?.tradeByShares === 'number' && !isNaN(initialSettings.tradeByShares) 
      ? initialSettings.tradeByShares 
      : defaultSettings.tradeByShares;
    
    const tradeByValue = initialSettings?.tradeByValue === true;
    
    const totalValue = typeof initialSettings?.totalValue === 'number' && !isNaN(initialSettings.totalValue) 
      ? initialSettings.totalValue 
      : defaultSettings.totalValue;
    
    // For string values, check if they exist and are valid
    const websocketProvider = initialSettings?.websocketProvider && 
      ['kraken', 'coinbase', 'binance'].includes(initialSettings.websocketProvider)
      ? initialSettings.websocketProvider as 'kraken' | 'coinbase' | 'binance'
      : defaultSettings.websocketProvider;
    
    const tradingPlatform = initialSettings?.tradingPlatform && 
      ['kraken', 'coinbase', 'binance'].includes(initialSettings.tradingPlatform)
      ? initialSettings.tradingPlatform as 'kraken' | 'coinbase' | 'binance'
      : defaultSettings.tradingPlatform;
    
    // For optional numeric values, they can be undefined but not NaN
    const purchasePrice = typeof initialSettings?.purchasePrice === 'number' && !isNaN(initialSettings.purchasePrice)
      ? initialSettings.purchasePrice 
      : undefined;
    
    const testMode = initialSettings?.testMode === true;
    
    return {
      enabled,
      sellPercentage,
      tradeByShares,
      tradeByValue,
      totalValue,
      websocketProvider,
      tradingPlatform,
      purchasePrice,
      testMode
    };
  });
  
  // Set loading state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      // Set a short timeout to allow the dialog to render before showing content
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Update settings when initialSettings change
  useEffect(() => {
    // Same safe extraction logic as in the initial state
    const enabled = initialSettings?.enabled === true;
    
    const sellPercentage = typeof initialSettings?.sellPercentage === 'number' && !isNaN(initialSettings.sellPercentage) 
      ? initialSettings.sellPercentage 
      : defaultSettings.sellPercentage;
    
    const tradeByShares = typeof initialSettings?.tradeByShares === 'number' && !isNaN(initialSettings.tradeByShares) 
      ? initialSettings.tradeByShares 
      : defaultSettings.tradeByShares;
    
    const tradeByValue = initialSettings?.tradeByValue === true;
    
    const totalValue = typeof initialSettings?.totalValue === 'number' && !isNaN(initialSettings.totalValue) 
      ? initialSettings.totalValue 
      : defaultSettings.totalValue;
    
    const websocketProvider = initialSettings?.websocketProvider && 
      ['kraken', 'coinbase', 'binance'].includes(initialSettings.websocketProvider)
      ? initialSettings.websocketProvider as 'kraken' | 'coinbase' | 'binance'
      : defaultSettings.websocketProvider;
    
    const tradingPlatform = initialSettings?.tradingPlatform && 
      ['kraken', 'coinbase', 'binance'].includes(initialSettings.tradingPlatform)
      ? initialSettings.tradingPlatform as 'kraken' | 'coinbase' | 'binance'
      : defaultSettings.tradingPlatform;
    
    const purchasePrice = typeof initialSettings?.purchasePrice === 'number' && !isNaN(initialSettings.purchasePrice)
      ? initialSettings.purchasePrice 
      : undefined;
    
    // Explicitly check for testMode being true or false, preserving the exact value
    const testMode = initialSettings?.testMode !== undefined ? initialSettings.testMode : false;
    
    console.log('MicroProcessingPopup: Updating settings from initialSettings', { 
      initialTestMode: initialSettings?.testMode,
      testMode 
    });
    
    setSettings({
      enabled,
      sellPercentage,
      tradeByShares,
      tradeByValue,
      totalValue,
      websocketProvider,
      tradingPlatform,
      purchasePrice,
      testMode
    });
  }, [initialSettings]);
  
  const handleSave = async () => {
    // Validate settings based on trade type
    if (!settings.tradeByValue && (typeof settings.tradeByShares !== 'number' || isNaN(settings.tradeByShares) || settings.tradeByShares <= 0)) {
      toast({
        variant: "destructive",
        title: "Invalid Input",
        description: "Please enter a valid number of shares greater than 0.",
      });
      return;
    }
    
    // Log the cryptoId and testMode to ensure they're being passed correctly
    console.log("Saving settings for cryptoId:", cryptoId, "with testMode:", settings.testMode);
    
    if (settings.tradeByValue && (typeof settings.totalValue !== 'number' || isNaN(settings.totalValue) || settings.totalValue <= 0)) {
      toast({
        variant: "destructive",
        title: "Invalid Input",
        description: "Please enter a valid total value greater than 0.",
      });
      return;
    }
    
    // Validate sell percentage
    if (typeof settings.sellPercentage !== 'number' || isNaN(settings.sellPercentage) || settings.sellPercentage < 0.005) {
      toast({
        variant: "destructive",
        title: "Invalid Sell Percentage",
        description: "Please enter a valid sell percentage (minimum 0.005%).",
      });
      return;
    }
    
    // Ensure all values are of the correct type with explicit validation
    const validatedSettings: MicroProcessingSettings = {
      enabled: settings.enabled === true,
      sellPercentage: typeof settings.sellPercentage === 'number' && !isNaN(settings.sellPercentage) 
        ? settings.sellPercentage 
        : 0.5,
      tradeByShares: typeof settings.tradeByShares === 'number' && !isNaN(settings.tradeByShares) 
        ? settings.tradeByShares 
        : 0,
      tradeByValue: settings.tradeByValue === true,
      totalValue: typeof settings.totalValue === 'number' && !isNaN(settings.totalValue) 
        ? settings.totalValue 
        : 0,
      websocketProvider: settings.websocketProvider && ['kraken', 'coinbase', 'binance'].includes(settings.websocketProvider)
        ? settings.websocketProvider 
        : 'binance',
      tradingPlatform: settings.tradingPlatform && ['kraken', 'coinbase', 'binance'].includes(settings.tradingPlatform)
        ? settings.tradingPlatform 
        : 'binance',
      purchasePrice: typeof settings.purchasePrice === 'number' && !isNaN(settings.purchasePrice) 
        ? settings.purchasePrice 
        : undefined,
      testMode: settings.testMode === true
    };
    
    console.log('Saving validated settings:', validatedSettings);
    
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
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Micro Processing Settings - {symbol}</DialogTitle>
          <DialogDescription>
            Configure micro processing settings for automated small-scale trading.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
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
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      setSettings({...settings, tradeByShares: isNaN(value) ? 0 : value});
                    }}
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
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      setSettings({...settings, totalValue: isNaN(value) ? 0 : value});
                    }}
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
                <Select
                  value={settings.websocketProvider}
                  onValueChange={(value: 'kraken' | 'coinbase' | 'binance') => 
                    setSettings({...settings, websocketProvider: value})
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select WebSocket Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kraken">Kraken</SelectItem>
                    <SelectItem value="coinbase">Coinbase</SelectItem>
                    <SelectItem value="binance">Binance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Trading Platform */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Trading Platform</Label>
                <Select
                  value={settings.tradingPlatform}
                  onValueChange={(value: 'kraken' | 'coinbase' | 'binance') => 
                    setSettings({...settings, tradingPlatform: value})
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Trading Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kraken">Kraken</SelectItem>
                    <SelectItem value="coinbase">Coinbase</SelectItem>
                    <SelectItem value="binance">Binance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Purchase Price */}
              <div className="space-y-2">
                <Label htmlFor="purchase-price" className="text-sm font-medium">
                  Purchase Price (USD)
                </Label>
                <Input
                  id="purchase-price"
                  type="number"
                  min="0.00000001"
                  step="0.00000001"
                  value={settings.purchasePrice || ''}
                  onChange={(e) => {
                    const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                    setSettings({...settings, purchasePrice: value !== undefined && isNaN(value) ? undefined : value});
                  }}
                  placeholder="Enter purchase price (optional)"
                />
                <p className="text-xs text-muted-foreground">
                  The purchase price to use for sell calculations. If not set, the last buy price will be used.
                </p>
              </div>
              
              {/* Test Mode */}
              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <Label htmlFor="test-mode" className="text-sm font-medium">
                    Test Mode
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, simulates trades without executing actual orders. Shows API request details for testing.
                  </p>
                </div>
                <Switch
                  id="test-mode"
                  checked={settings.testMode}
                  onCheckedChange={(checked) => setSettings({...settings, testMode: checked})}
                />
              </div>
            </>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting || isLoading}>
            {isSubmitting ? 'Saving...' : 'Save Settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}