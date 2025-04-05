import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { Slider } from "@/components/ui/slider";

interface KrakenWebSocketSettingsProps {
  websocketUrl?: string;
  enableManualCryptoTrading: boolean;
  autoConnectWebSocket: boolean;
  enableKrakenWebSocket?: boolean;
  reconnectDelay?: number;
  onEnableManualCryptoTradingChange: (enabled: boolean) => void;
  onAutoConnectWebSocketChange: (enabled: boolean) => void;
  onEnableKrakenWebSocketChange?: (enabled: boolean) => void;
  onReconnectDelayChange?: (delay: number) => void;
}

const KrakenWebSocketSettings: React.FC<KrakenWebSocketSettingsProps> = ({
  websocketUrl = 'wss://ws.kraken.com/v2',
  enableManualCryptoTrading,
  autoConnectWebSocket,
  enableKrakenWebSocket = true,
  reconnectDelay = 1000,
  onEnableManualCryptoTradingChange,
  onAutoConnectWebSocketChange,
  onEnableKrakenWebSocketChange,
  onReconnectDelayChange
}) => {
  return (
    <div className="border-t pt-4 mt-4">
      <h3 className="text-lg font-medium mb-2">Kraken WebSocket Settings</h3>
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="krakenWebsocketUrl">Kraken WebSocket URL</Label>
              <p className="text-sm text-muted-foreground">
                The primary WebSocket endpoint for Kraken price data
              </p>
            </div>
            <div className="text-sm font-medium text-muted-foreground">
              {websocketUrl}
            </div>
          </div>
        </div>
        
        <Separator />
        
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enableKrakenWebSocket">Enable Kraken WebSocket</Label>
            <p className="text-sm text-muted-foreground">
              Enable or disable the Kraken WebSocket connection completely
            </p>
          </div>
          <Switch
            id="enableKrakenWebSocket"
            checked={enableKrakenWebSocket}
            onCheckedChange={onEnableKrakenWebSocketChange}
          />
        </div>
        
        <div className="flex items-center justify-between opacity-50 cursor-not-allowed">
          <div className="space-y-0.5">
            <Label htmlFor="autoConnectWebSocket">Auto-Connect WebSocket</Label>
            <p className="text-sm text-muted-foreground">
              This setting is managed on the crypto dashboard
            </p>
          </div>
          <Switch
            id="autoConnectWebSocket"
            checked={autoConnectWebSocket}
            disabled={true}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enableManualCryptoTrading">Manual Crypto Trading</Label>
            <p className="text-sm text-muted-foreground">
              Enable manual trading for cryptocurrencies
            </p>
          </div>
          <Switch
            id="enableManualCryptoTrading"
            checked={enableManualCryptoTrading}
            onCheckedChange={onEnableManualCryptoTradingChange}
          />
        </div>
        
        <Separator />
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="reconnectDelay">Reconnection Frequency</Label>
            <span className="text-sm font-medium">{reconnectDelay}ms</span>
          </div>
          <Slider
            id="reconnectDelay"
            min={500}
            max={5000}
            step={100}
            value={[reconnectDelay]}
            onValueChange={(value) => onReconnectDelayChange?.(value[0])}
            disabled={!enableKrakenWebSocket}
          />
          <p className="text-xs text-muted-foreground">
            Base delay in milliseconds between reconnection attempts. Lower values will attempt to reconnect more quickly.
          </p>
        </div>
        
        <div className="bg-muted p-3 rounded-md flex items-start gap-2 text-sm">
          <InfoCircledIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-muted-foreground">
              The Kraken WebSocket connection sends a ping every 30 seconds to keep the connection alive. 
              The connection will close after 1 minute of inactivity.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KrakenWebSocketSettings;