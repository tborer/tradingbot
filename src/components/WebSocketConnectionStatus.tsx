import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface WebSocketConnectionStatusProps {
  isConnected: boolean;
  url: string;
  error: Error | null;
  reconnect?: () => void;
  connect?: () => void;
  disconnect?: () => void;
  lastMessageTime?: Date | null;
  lastPingTime?: Date | null;
  lastPongTime?: Date | null;
  autoConnect?: boolean;
  onAutoConnectChange?: (autoConnect: boolean) => void;
  compressionEnabled?: boolean;
  pingEnabled?: boolean;
  onPingEnabledChange?: (pingEnabled: boolean) => void;
}

const WebSocketConnectionStatus: React.FC<WebSocketConnectionStatusProps> = ({
  isConnected,
  url,
  error,
  reconnect,
  connect,
  disconnect,
  lastMessageTime,
  lastPingTime,
  lastPongTime,
  autoConnect,
  onAutoConnectChange,
  compressionEnabled,
  pingEnabled,
  onPingEnabledChange
}) => {
  const [connectionDuration, setConnectionDuration] = useState<string>('');
  const [connectionStartTime, setConnectionStartTime] = useState<Date | null>(null);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  // Track connection duration
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (isConnected) {
      // If we just connected, set the start time
      if (!connectionStartTime) {
        setConnectionStartTime(new Date());
      }
      
      // Update the duration every second
      intervalId = setInterval(() => {
        if (connectionStartTime) {
          const durationMs = Date.now() - connectionStartTime.getTime();
          const seconds = Math.floor(durationMs / 1000) % 60;
          const minutes = Math.floor(durationMs / (1000 * 60)) % 60;
          const hours = Math.floor(durationMs / (1000 * 60 * 60));
          
          setConnectionDuration(
            `${hours > 0 ? `${hours}h ` : ''}${minutes}m ${seconds}s`
          );
        }
      }, 1000);
    } else {
      // Reset when disconnected
      setConnectionStartTime(null);
      setConnectionDuration('');
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isConnected, connectionStartTime]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>WebSocket Connection</span>
          <div className="flex items-center gap-2">
            <Badge 
              variant={isConnected ? "default" : "destructive"}
              className={isConnected ? "bg-green-500" : "bg-red-500"}
            >
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
            {!isConnected && connect && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => {
                  console.log('Connect button clicked in WebSocketConnectionStatus');
                  // Add a visual indicator that the button was clicked
                  const button = document.activeElement as HTMLButtonElement;
                  if (button) {
                    button.classList.add('bg-primary/10');
                    setTimeout(() => {
                      button.classList.remove('bg-primary/10');
                    }, 300);
                  }
                  connect();
                }}
              >
                Connect
              </Button>
            )}
            {isConnected && disconnect && (
              <Button size="sm" variant="outline" onClick={disconnect}>
                Disconnect
              </Button>
            )}
            {reconnect && (
              <Button size="sm" variant="outline" onClick={reconnect}>
                Reconnect
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="font-medium">URL:</div>
            <div className="font-mono text-xs break-all">{url}</div>
            
            <div className="font-medium">Status:</div>
            <div className={isConnected ? "text-green-500" : "text-red-500"}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
            
            <div className="font-medium">Compression:</div>
            <div className="flex items-center">
              {compressionEnabled ? (
                <span className="text-green-500 flex items-center">
                  Enabled
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              ) : (
                <span className="text-gray-500">Disabled</span>
              )}
            </div>
            
            {isConnected && connectionDuration && (
              <>
                <div className="font-medium">Connected for:</div>
                <div>{connectionDuration}</div>
              </>
            )}
            
            {lastMessageTime && (
              <>
                <div className="font-medium">Last message:</div>
                <div>{lastMessageTime.toLocaleTimeString()}</div>
              </>
            )}
            
            {lastPingTime && (
              <>
                <div className="font-medium">Last ping:</div>
                <div>{lastPingTime.toLocaleTimeString()}</div>
              </>
            )}
            
            {lastPongTime && (
              <>
                <div className="font-medium">Last pong:</div>
                <div>{lastPongTime.toLocaleTimeString()}</div>
              </>
            )}
          </div>
          
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Connection Error</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-3 mt-4">
            {onAutoConnectChange && (
              <div className="flex items-center justify-between p-3 border rounded-md">
                <div>
                  <div className="font-medium">Auto-Connect</div>
                  <div className="text-sm text-muted-foreground">
                    Automatically connect on page load
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-sm">
                    {autoConnect ? 'On' : 'Off'}
                  </label>
                  <Switch
                    checked={autoConnect}
                    onCheckedChange={onAutoConnectChange}
                  />
                </div>
              </div>
            )}
            
            {onPingEnabledChange && (
              <div className="flex items-center justify-between p-3 border rounded-md">
                <div>
                  <div className="font-medium">Enable Ping</div>
                  <div className="text-sm text-muted-foreground">
                    Send periodic ping messages to keep connection alive
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-sm">
                    {pingEnabled ? 'On' : 'Off'}
                  </label>
                  <Switch
                    checked={pingEnabled}
                    onCheckedChange={onPingEnabledChange}
                  />
                </div>
              </div>
            )}
          </div>
          
          <Accordion type="single" collapsible>
            <AccordionItem value="troubleshooting">
              <AccordionTrigger>WebSocket Troubleshooting</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p>If you're experiencing WebSocket connection issues:</p>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Check your internet connection</li>
                    <li>Try refreshing the page</li>
                    <li>Ensure your firewall isn't blocking WebSocket connections</li>
                    <li>Try using a different browser</li>
                    <li>Error code 1006 typically indicates an abnormal closure - the connection was closed without a proper close frame</li>
                  </ol>
                  
                  <div className="mt-4 flex gap-2">
                    {connect && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={connect}
                      >
                        Connect
                      </Button>
                    )}
                    {disconnect && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={disconnect}
                      >
                        Disconnect
                      </Button>
                    )}
                    {reconnect && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={reconnect}
                      >
                        Reconnect
                      </Button>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </CardContent>
    </Card>
  );
};

export default WebSocketConnectionStatus;