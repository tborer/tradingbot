import React from 'react';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface FinnHubWebSocketSettingsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

export default function FinnHubWebSocketSettings({
  enabled,
  onEnabledChange
}: FinnHubWebSocketSettingsProps) {
  return (
    <div className="border-t pt-4 mt-4">
      <h3 className="text-lg font-medium mb-2">FinnHub WebSocket Settings</h3>
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Switch
            id="finnhub-websocket-enabled"
            checked={enabled}
            onCheckedChange={onEnabledChange}
          />
          <Label htmlFor="finnhub-websocket-enabled">
            Enable FinnHub WebSocket Connection
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">
          When enabled, the application will connect to FinnHub's WebSocket API to receive real-time stock price updates.
          Disable this if you don't need real-time updates or want to reduce API usage.
        </p>
      </div>
    </div>
  );
}