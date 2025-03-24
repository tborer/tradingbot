import React, { useState, useEffect } from 'react';
import { useWebSocketLogs, LogLevel } from '@/contexts/WebSocketLogContext';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

const LogLevelBadge = ({ level }: { level: LogLevel }) => {
  const colorMap: Record<LogLevel, string> = {
    info: 'bg-blue-500 hover:bg-blue-600',
    warning: 'bg-yellow-500 hover:bg-yellow-600',
    error: 'bg-red-500 hover:bg-red-600',
    success: 'bg-green-500 hover:bg-green-600',
  };

  return (
    <Badge className={colorMap[level]}>
      {level.toUpperCase()}
    </Badge>
  );
};

const WebSocketLogger: React.FC = () => {
  const { logs, clearLogs } = useWebSocketLogs();
  const [filter, setFilter] = useState('');
  const [activeTab, setActiveTab] = useState<LogLevel | 'all'>('all');
  
  const filteredLogs = logs.filter(log => {
    // Filter by search term
    const searchMatch = filter === '' || 
      log.message.toLowerCase().includes(filter.toLowerCase()) ||
      JSON.stringify(log.details || {}).toLowerCase().includes(filter.toLowerCase());
    
    // Filter by log level
    const levelMatch = activeTab === 'all' || log.level === activeTab;
    
    return searchMatch && levelMatch;
  });
  
  const logCounts = {
    all: logs.length,
    info: logs.filter(log => log.level === 'info').length,
    warning: logs.filter(log => log.level === 'warning').length,
    error: logs.filter(log => log.level === 'error').length,
    success: logs.filter(log => log.level === 'success').length,
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>WebSocket Logs</span>
          <Button variant="destructive" size="sm" onClick={clearLogs}>
            Clear Logs
          </Button>
        </CardTitle>
        <CardDescription>
          Monitor WebSocket connections, messages, and errors
        </CardDescription>
        <div className="flex gap-2 mt-2">
          <Input 
            placeholder="Filter logs..." 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" value={activeTab} onValueChange={(value) => setActiveTab(value as LogLevel | 'all')}>
          <TabsList className="mb-4">
            <TabsTrigger value="all">
              All ({logCounts.all})
            </TabsTrigger>
            <TabsTrigger value="info">
              Info ({logCounts.info})
            </TabsTrigger>
            <TabsTrigger value="success">
              Success ({logCounts.success})
            </TabsTrigger>
            <TabsTrigger value="warning">
              Warning ({logCounts.warning})
            </TabsTrigger>
            <TabsTrigger value="error">
              Error ({logCounts.error})
            </TabsTrigger>
          </TabsList>
          
          <ScrollArea className="h-[400px] w-full rounded-md border p-4">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No logs to display
              </div>
            ) : (
              <div className="space-y-4">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <LogLevelBadge level={log.level} />
                        <span className="font-medium">{log.message}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    {log.details && (
                      <div className="mt-2 text-sm">
                        <Separator className="my-2" />
                        <pre className="bg-secondary p-2 rounded-md overflow-x-auto text-xs">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Tabs>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        Showing {filteredLogs.length} of {logs.length} logs
      </CardFooter>
    </Card>
  );
};

export default WebSocketLogger;