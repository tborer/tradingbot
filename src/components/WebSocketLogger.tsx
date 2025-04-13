import React, { useState, useEffect, useRef } from 'react';
import { useWebSocketLogs, LogLevel } from '@/contexts/WebSocketLogContext';
import { useResearchApiLogs } from '@/contexts/ResearchApiLogContext';
import { useBalanceApiLogs } from '@/contexts/BalanceApiLogContext';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { Slider } from '@/components/ui/slider';

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
  const { toast } = useToast();
  // WebSocket logs
  const { 
    logs, 
    clearLogs, 
    isLoggingEnabled, 
    setLoggingEnabled,
    isErrorLoggingEnabled,
    setErrorLoggingEnabled,
    errorSampleRate,
    setErrorSampleRate
  } = useWebSocketLogs();
  
  // Research API logs
  const {
    logs: researchLogs,
    clearLogs: clearResearchLogs,
    isLoggingEnabled: isResearchLoggingEnabled,
    setLoggingEnabled: setResearchLoggingEnabled
  } = useResearchApiLogs();
  
  // Balance API logs
  const {
    logs: balanceLogs,
    clearLogs: clearBalanceLogs,
    isLoggingEnabled: isBalanceLoggingEnabled,
    setLoggingEnabled: setBalanceLoggingEnabled
  } = useBalanceApiLogs();
  
  const [filter, setFilter] = useState('');
  const [activeTab, setActiveTab] = useState<LogLevel | 'all'>('all');
  const [ignoreHeartbeat, setIgnoreHeartbeat] = useState(false);
  const [activeSection, setActiveSection] = useState<'websocket' | 'research' | 'balance'>('websocket');
  
  // Function to copy WebSocket logs to clipboard
  const copyLogsToClipboard = (logsToExport: typeof logs) => {
    if (logsToExport.length === 0) {
      toast({
        title: "No logs to copy",
        description: "There are no logs available to copy.",
        variant: "destructive"
      });
      return;
    }
    
    let clipboardText = "WEBSOCKET LOGS\n\n";
    
    logsToExport.forEach((log) => {
      // Format the log entry with headers and content
      clipboardText += `${log.level.toUpperCase()}\n`;
      clipboardText += `${log.message}\n`;
      clipboardText += `${new Date(log.timestamp).toLocaleTimeString()}\n`;
      
      if (log.code) {
        clipboardText += `Code: ${log.code}\n`;
      }
      
      if (log.details) {
        clipboardText += `${JSON.stringify(log.details, null, 2)}\n`;
      }
      
      clipboardText += "\n---\n\n";
    });
    
    navigator.clipboard.writeText(clipboardText)
      .then(() => {
        toast({
          title: "Copied to clipboard",
          description: `${logsToExport.length} log entries copied to clipboard.`,
          variant: "default"
        });
      })
      .catch((err) => {
        console.error("Failed to copy logs:", err);
        toast({
          title: "Failed to copy",
          description: "An error occurred while copying logs to clipboard.",
          variant: "destructive"
        });
      });
  };
  
  // Function to copy Research API logs to clipboard
  const copyResearchLogsToClipboard = (logsToExport: typeof researchLogs) => {
    if (logsToExport.length === 0) {
      toast({
        title: "No logs to copy",
        description: "There are no research API logs available to copy.",
        variant: "destructive"
      });
      return;
    }
    
    let clipboardText = "RESEARCH API LOGS\n\n";
    
    logsToExport.forEach((log) => {
      // Format the log entry with headers and content
      clipboardText += `${log.method} ${log.url}\n`;
      clipboardText += `Timestamp: ${new Date(log.timestamp).toLocaleTimeString()}\n`;
      
      if (log.status) {
        clipboardText += `Status: ${log.status}\n`;
      }
      
      if (log.duration) {
        clipboardText += `Duration: ${log.duration}ms\n`;
      }
      
      if (log.error) {
        clipboardText += `Error: ${log.error}\n`;
      }
      
      if (log.requestBody) {
        clipboardText += `Request Body:\n${JSON.stringify(log.requestBody, null, 2)}\n`;
      }
      
      if (log.response) {
        clipboardText += `Response:\n${JSON.stringify(log.response, null, 2)}\n`;
      }
      
      clipboardText += "\n---\n\n";
    });
    
    navigator.clipboard.writeText(clipboardText)
      .then(() => {
        toast({
          title: "Copied to clipboard",
          description: `${logsToExport.length} research API log entries copied to clipboard.`,
          variant: "default"
        });
      })
      .catch((err) => {
        console.error("Failed to copy research logs:", err);
        toast({
          title: "Failed to copy",
          description: "An error occurred while copying research API logs to clipboard.",
          variant: "destructive"
        });
      });
  };
  
  // Function to copy Balance API logs to clipboard
  const copyBalanceLogsToClipboard = (logsToExport: typeof balanceLogs) => {
    if (logsToExport.length === 0) {
      toast({
        title: "No logs to copy",
        description: "There are no balance API logs available to copy.",
        variant: "destructive"
      });
      return;
    }
    
    let clipboardText = "BALANCE API LOGS\n\n";
    
    logsToExport.forEach((log) => {
      // Format the log entry with headers and content
      clipboardText += `${log.requestMethod} ${log.requestPath}\n`;
      clipboardText += `Timestamp: ${new Date(log.timestamp).toLocaleTimeString()}\n`;
      
      if (log.responseStatus > 0) {
        clipboardText += `Status: ${log.responseStatus}\n`;
      }
      
      if (log.error) {
        clipboardText += `Error: ${log.error}\n`;
      }
      
      clipboardText += `Request Headers:\n${JSON.stringify(log.requestHeaders, null, 2)}\n`;
      clipboardText += `Request Body:\n${JSON.stringify(log.requestBody, null, 2)}\n`;
      clipboardText += `Response Body:\n${JSON.stringify(log.responseBody, null, 2)}\n`;
      
      clipboardText += "\n---\n\n";
    });
    
    navigator.clipboard.writeText(clipboardText)
      .then(() => {
        toast({
          title: "Copied to clipboard",
          description: `${logsToExport.length} balance API log entries copied to clipboard.`,
          variant: "default"
        });
      })
      .catch((err) => {
        console.error("Failed to copy balance logs:", err);
        toast({
          title: "Failed to copy",
          description: "An error occurred while copying balance API logs to clipboard.",
          variant: "destructive"
        });
      });
  };
  
  const filteredLogs = logs.filter(log => {
    // Filter by search term
    const searchMatch = filter === '' || 
      log.message.toLowerCase().includes(filter.toLowerCase()) ||
      JSON.stringify(log.details || {}).toLowerCase().includes(filter.toLowerCase());
    
    // Filter by log level
    const levelMatch = activeTab === 'all' || log.level === activeTab;
    
    // Filter out heartbeat messages if ignoreHeartbeat is true
    const isHeartbeat = ignoreHeartbeat && 
      log.details?.data && 
      typeof log.details.data === 'string' && 
      log.details.data.includes('"channel":"heartbeat"');
    
    return searchMatch && levelMatch && !isHeartbeat;
  });
  
  // Filter research logs by search term
  const filteredResearchLogs = researchLogs.filter(log => {
    return filter === '' || 
      log.url.toLowerCase().includes(filter.toLowerCase()) ||
      JSON.stringify(log.requestBody || {}).toLowerCase().includes(filter.toLowerCase()) ||
      JSON.stringify(log.response || {}).toLowerCase().includes(filter.toLowerCase());
  });
  
  // Count heartbeat messages
  const heartbeatCount = logs.filter(log => 
    log.details?.data && 
    typeof log.details.data === 'string' && 
    log.details.data.includes('"channel":"heartbeat"')
  ).length;
  
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
          <span>API Logs</span>
          <div className="flex items-center gap-2">
            {activeSection === 'websocket' ? (
              <>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="logging-toggle"
                    checked={isLoggingEnabled}
                    onCheckedChange={setLoggingEnabled}
                  />
                  <Label htmlFor="logging-toggle" className="text-sm">
                    {isLoggingEnabled ? "Logging Enabled" : "Logging Disabled"}
                  </Label>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyLogsToClipboard(filteredLogs)}>
                  Copy All Logs
                </Button>
                <Button variant="destructive" size="sm" onClick={clearLogs}>
                  Clear Logs
                </Button>
              </>
            ) : activeSection === 'research' ? (
              <>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="research-logging-toggle"
                    checked={isResearchLoggingEnabled}
                    onCheckedChange={setResearchLoggingEnabled}
                  />
                  <Label htmlFor="research-logging-toggle" className="text-sm">
                    {isResearchLoggingEnabled ? "Logging Enabled" : "Logging Disabled"}
                  </Label>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyResearchLogsToClipboard(filteredResearchLogs)}>
                  Copy All Logs
                </Button>
                <Button variant="destructive" size="sm" onClick={clearResearchLogs}>
                  Clear Logs
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="balance-logging-toggle-header"
                    checked={isBalanceLoggingEnabled}
                    onCheckedChange={setBalanceLoggingEnabled}
                  />
                  <Label htmlFor="balance-logging-toggle-header" className="text-sm">
                    {isBalanceLoggingEnabled ? "Logging Enabled" : "Logging Disabled"}
                  </Label>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyBalanceLogsToClipboard(balanceLogs)}>
                  Copy All Logs
                </Button>
                <Button variant="destructive" size="sm" onClick={clearBalanceLogs}>
                  Clear Logs
                </Button>
              </>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Monitor API connections, messages, and errors
        </CardDescription>
        
        {/* Section Tabs */}
        <div className="mt-4">
          <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as 'websocket' | 'research' | 'balance')}>
            <TabsList className="mb-4">
              <TabsTrigger value="websocket">WebSocket Logs</TabsTrigger>
              <TabsTrigger value="research">Research/Historical API Logs</TabsTrigger>
              <TabsTrigger value="balance">Balance API Logs</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex gap-2">
            <Input 
              placeholder="Filter logs..." 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-sm"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-md">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="error-logging-toggle"
                    checked={isErrorLoggingEnabled}
                    onCheckedChange={setErrorLoggingEnabled}
                  />
                  <Label htmlFor="error-logging-toggle" className="text-sm font-medium">
                    {isErrorLoggingEnabled ? "Error Logging Enabled" : "Error Logging Disabled"}
                  </Label>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <span className="sr-only">Info</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 16v-4" />
                          <path d="M12 8h.01" />
                        </svg>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Toggle error logging to reduce performance impact from high-volume WebSocket errors</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="error-sample-rate" className="text-sm">Error Sample Rate: {errorSampleRate}%</Label>
                </div>
                <Slider
                  id="error-sample-rate"
                  min={1}
                  max={100}
                  step={1}
                  value={[errorSampleRate]}
                  onValueChange={(value) => setErrorSampleRate(value[0])}
                  disabled={!isErrorLoggingEnabled}
                />
                <p className="text-xs text-muted-foreground">
                  {errorSampleRate < 100 
                    ? `Logging ${errorSampleRate}% of errors (1 in ${Math.floor(100 / errorSampleRate)})`
                    : "Logging all errors"}
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="ignore-heartbeat" 
                  checked={ignoreHeartbeat} 
                  onCheckedChange={(checked) => setIgnoreHeartbeat(checked === true)}
                />
                <Label htmlFor="ignore-heartbeat">Ignore Heartbeat Messages</Label>
              </div>
              
              <div className="text-xs text-muted-foreground space-y-2">
                <p>
                  <strong>Performance Tips:</strong>
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Disable error logging when experiencing high-volume errors</li>
                  <li>Use sample rate to capture only a percentage of errors</li>
                  <li>Clear logs regularly to improve UI performance</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activeSection === 'websocket' ? (
          // WebSocket Logs Section
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
                          {log.code ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="cursor-help mr-2">
                                    {log.code}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Error Code: {log.code}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : null}
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
        ) : activeSection === 'research' ? (
          // Research/Historical API Logs Section
          <div>
            <ScrollArea className="h-[400px] w-full rounded-md border p-4">
              {filteredResearchLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No research API logs to display. Try making a request in the Research tab.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredResearchLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={log.error ? 'bg-red-500' : 'bg-green-500'}>
                            {log.method}
                          </Badge>
                          <span className="font-medium">{log.url}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {log.status && (
                            <Badge variant="outline" className={log.status >= 400 ? 'text-red-500' : 'text-green-500'}>
                              {log.status}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-2 text-sm">
                        {log.duration && (
                          <div className="text-xs text-muted-foreground mb-2">
                            Duration: {log.duration}ms
                          </div>
                        )}
                        
                        {log.error && (
                          <div className="mb-2">
                            <Badge variant="destructive">Error</Badge>
                            <div className="mt-1 text-red-500">{log.error}</div>
                          </div>
                        )}
                        
                        <Separator className="my-2" />
                        
                        {log.requestBody && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium mb-1">Request Body:</h4>
                            <pre className="bg-secondary p-2 rounded-md overflow-x-auto text-xs">
                              {JSON.stringify(log.requestBody, null, 2)}
                            </pre>
                          </div>
                        )}
                        
                        {log.response && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">Response:</h4>
                            <pre className="bg-secondary p-2 rounded-md overflow-x-auto text-xs">
                              {JSON.stringify(log.response, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          // Balance API Logs Section
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="balance-logging-toggle"
                  checked={isBalanceLoggingEnabled}
                  onCheckedChange={setBalanceLoggingEnabled}
                />
                <Label htmlFor="balance-logging-toggle" className="text-sm">
                  {isBalanceLoggingEnabled ? "Logging Enabled" : "Logging Disabled"}
                </Label>
              </div>
              <Button variant="destructive" size="sm" onClick={clearBalanceLogs}>
                Clear Logs
              </Button>
            </div>
            
            <ScrollArea className="h-[400px] w-full rounded-md border p-4">
              {balanceLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No balance API logs to display. Try retrieving your Kraken balance.
                </div>
              ) : (
                <div className="space-y-4">
                  {balanceLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={log.error ? 'bg-red-500' : 'bg-green-500'}>
                            {log.requestMethod}
                          </Badge>
                          <span className="font-medium">{log.requestPath}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {log.responseStatus > 0 && (
                            <Badge variant="outline" className={log.responseStatus >= 400 ? 'text-red-500' : 'text-green-500'}>
                              {log.responseStatus}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-2 text-sm">
                        {log.error && (
                          <div className="mb-2">
                            <Badge variant="destructive">Error</Badge>
                            <div className="mt-1 text-red-500">{log.error}</div>
                          </div>
                        )}
                        
                        <Separator className="my-2" />
                        
                        <div className="mb-4">
                          <h4 className="text-sm font-medium mb-1">Request Headers:</h4>
                          <pre className="bg-secondary p-2 rounded-md overflow-x-auto text-xs">
                            {JSON.stringify(log.requestHeaders, null, 2)}
                          </pre>
                        </div>
                        
                        <div className="mb-4">
                          <h4 className="text-sm font-medium mb-1">Request Body:</h4>
                          <pre className="bg-secondary p-2 rounded-md overflow-x-auto text-xs">
                            {JSON.stringify(log.requestBody, null, 2)}
                          </pre>
                        </div>
                        
                        <div>
                          <h4 className="text-sm font-medium mb-1">Response:</h4>
                          <pre className="bg-secondary p-2 rounded-md overflow-x-auto text-xs">
                            {JSON.stringify(log.responseBody, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        {activeSection === 'websocket' ? (
          !isLoggingEnabled ? (
            <div className="flex items-center text-amber-500">
              <span>WebSocket logging is disabled. No new logs will be captured.</span>
            </div>
          ) : !isErrorLoggingEnabled ? (
            <div className="flex items-center text-amber-500">
              <span>Error logging is disabled. WebSocket errors will not be captured.</span>
            </div>
          ) : (
            <div>
              Showing {filteredLogs.length} of {logs.length} logs
              {ignoreHeartbeat && heartbeatCount > 0 && (
                <span className="ml-2">({heartbeatCount} heartbeat messages hidden)</span>
              )}
              {errorSampleRate < 100 && (
                <span className="ml-2 text-amber-500">
                  (Sampling {errorSampleRate}% of errors)
                </span>
              )}
            </div>
          )
        ) : activeSection === 'research' ? (
          <div>
            {!isResearchLoggingEnabled ? (
              <div className="flex items-center text-amber-500">
                <span>Research API logging is disabled. No new logs will be captured.</span>
              </div>
            ) : (
              <div>Showing {filteredResearchLogs.length} of {researchLogs.length} research API logs</div>
            )}
          </div>
        ) : (
          <div>
            {!isBalanceLoggingEnabled ? (
              <div className="flex items-center text-amber-500">
                <span>Balance API logging is disabled. No new logs will be captured.</span>
              </div>
            ) : (
              <div>Showing {balanceLogs.length} balance API logs</div>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
};

export default WebSocketLogger;