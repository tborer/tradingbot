import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface WebSocketConnectionStatusProps {
  isConnected: boolean;
  url: string;
  error: Error | null;
  reconnect: () => void;
  lastMessageTime?: Date | null;
}

const WebSocketConnectionStatus: React.FC<WebSocketConnectionStatusProps> = ({
  isConnected,
  url,
  error,
  reconnect,
  lastMessageTime
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
            {!isConnected && (
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
          </div>
          
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Connection Error</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          
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
                  
                  <div className="mt-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={reconnect}
                    >
                      Manual Reconnect
                    </Button>
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