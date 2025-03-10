import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

interface KrakenWebSocketSettingsProps {
  websocketUrl: string;
  enableManualCryptoTrading: boolean;
  onWebsocketUrlChange: (url: string) => void;
  onEnableManualCryptoTradingChange: (enabled: boolean) => void;
}

const KrakenWebSocketSettings: React.FC<KrakenWebSocketSettingsProps> = ({
  websocketUrl,
  enableManualCryptoTrading,
  onWebsocketUrlChange,
  onEnableManualCryptoTradingChange
}) => {
  return (
    <div className="border-t pt-4 mt-4">
      <h3 className="text-lg font-medium mb-2">Kraken WebSocket Settings</h3>
      <div className="space-y-4">
        <div>
          <Label htmlFor="krakenWebsocketUrl">Kraken WebSocket URL</Label>
          <Input
            id="krakenWebsocketUrl"
            placeholder="Enter Kraken WebSocket URL"
            value={websocketUrl}
            onChange={(e) => onWebsocketUrlChange(e.target.value)}
          />
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="enableManualCryptoTrading"
            checked={enableManualCryptoTrading}
            onCheckedChange={(checked) => 
              onEnableManualCryptoTradingChange(checked as boolean)
            }
          />
          <Label htmlFor="enableManualCryptoTrading">Enable Manual Crypto Trading</Label>
        </div>
        <p className="text-sm text-muted-foreground">
          The WebSocket URL is used for real-time crypto price updates. The default URL is wss://ws.kraken.com/v2
        </p>
      </div>
    </div>
  );
};

export default KrakenWebSocketSettings;