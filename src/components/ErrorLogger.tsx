import React, { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useErrorLog } from '@/contexts/ErrorLogContext';
import { ErrorCategory, ErrorSeverity } from '@/lib/errorLogger';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const ErrorLogger: React.FC = () => {
  const { toast } = useToast();
  const {
    logs,
    filters,
    isEnabled,
    setFilters,
    clearLogs,
    markAsRead,
    markAllAsRead,
    archiveLog,
    deleteLog,
    captureLog,
    setIsEnabled,
    filteredLogs,
  } = useErrorLog();

  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [testErrorMessage, setTestErrorMessage] = useState('');
  const [testErrorSeverity, setTestErrorSeverity] = useState<ErrorSeverity>(ErrorSeverity.INFO);
  const [testErrorCategory, setTestErrorCategory] = useState<ErrorCategory>(ErrorCategory.UNKNOWN);

  // Count unread logs
  const unreadCount = logs.filter(log => !log.read).length;

  // Get the selected log details
  const selectedLogDetails = selectedLog ? logs.find(log => log.id === selectedLog) : null;

  // Generate test error
  const handleGenerateTestError = () => {
    if (!testErrorMessage) return;
    
    captureLog(
      testErrorMessage,
      testErrorSeverity,
      testErrorCategory,
      { source: 'test-error-generator' }
    );
    
    setTestErrorMessage('');
  };

  // Trigger a real error for testing
  const handleTriggerRealError = () => {
    try {
      // @ts-ignore - Intentionally causing an error
      const obj = null;
      obj.nonExistentMethod();
    } catch (error) {
      throw error; // This will be caught by the global error handler
    }
  };

  // Get severity badge color
  const getSeverityColor = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.INFO:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case ErrorSeverity.WARNING:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case ErrorSeverity.ERROR:
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case ErrorSeverity.CRITICAL:
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  // Format date for display
  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleString();
  };

  // Function to copy logs to clipboard
  const copyLogsToClipboard = () => {
    if (filteredLogs.length === 0) {
      toast({
        title: "No logs to copy",
        description: "There are no logs available to copy.",
        variant: "destructive"
      });
      return;
    }
    
    let clipboardText = "ERROR LOGS\n\n";
    
    filteredLogs.forEach((log) => {
      // Format the log entry with headers and content
      clipboardText += `${log.severity}\n`;
      clipboardText += `${log.message}\n`;
      clipboardText += `${formatDate(log.timestamp)}\n`;
      
      if (log.code) {
        clipboardText += `Code: ${log.code}\n`;
      }
      
      if (log.category) {
        clipboardText += `Category: ${log.category}\n`;
      }
      
      if (log.context && Object.keys(log.context).length > 0) {
        clipboardText += `Context:\n${JSON.stringify(log.context, null, 2)}\n`;
      }
      
      if (log.stack) {
        clipboardText += `Stack Trace:\n${log.stack}\n`;
      }
      
      clipboardText += "\n---\n\n";
    });
    
    navigator.clipboard.writeText(clipboardText)
      .then(() => {
        toast({
          title: "Copied to clipboard",
          description: `${filteredLogs.length} error log entries copied to clipboard.`,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold">Error Logs</h2>
          {unreadCount > 0 && (
            <Badge variant="destructive">{unreadCount} unread</Badge>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Label htmlFor="enable-logging">Enable Logging</Label>
          <Switch
            id="enable-logging"
            checked={isEnabled}
            onCheckedChange={setIsEnabled}
          />
        </div>
      </div>

      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="filters">Filters</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Search logs..."
                value={filters.searchTerm}
                onChange={(e) => setFilters({ searchTerm: e.target.value })}
                className="w-64"
              />
              <Select
                value={filters.timeRange}
                onValueChange={(value) => setFilters({ timeRange: value as any })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Time Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={markAllAsRead} disabled={unreadCount === 0}>
                Mark All as Read
              </Button>
              <Button 
                variant="outline" 
                onClick={copyLogsToClipboard}
                disabled={filteredLogs.length === 0}
              >
                Copy All Logs
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => setConfirmClear(true)}
                disabled={logs.length === 0}
              >
                Clear All
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Log List */}
            <div className="md:col-span-1 border rounded-lg">
              <ScrollArea className="h-[600px]">
                {filteredLogs.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No logs found
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`p-3 cursor-pointer hover:bg-muted ${selectedLog === log.id ? 'bg-muted' : ''} ${
                          !log.read ? 'border-l-4 border-blue-500 dark:border-blue-400' : ''
                        }`}
                        onClick={() => {
                          setSelectedLog(log.id);
                          if (!log.read) markAsRead(log.id);
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium truncate w-56">{log.message}</div>
                            <div className="text-xs text-muted-foreground">{formatDate(log.timestamp)}</div>
                          </div>
                          <Badge className={getSeverityColor(log.severity)}>
                            {log.severity}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Log Details */}
            <div className="md:col-span-2 border rounded-lg p-4">
              {selectedLogDetails ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-medium">{selectedLogDetails.message}</h3>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(selectedLogDetails.timestamp)}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <Badge className={getSeverityColor(selectedLogDetails.severity)}>
                        {selectedLogDetails.severity}
                      </Badge>
                      <Badge variant="outline">{selectedLogDetails.code}</Badge>
                    </div>
                  </div>

                  <Separator />

                  {selectedLogDetails.context && Object.keys(selectedLogDetails.context).length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Context</h4>
                      <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-32">
                        {JSON.stringify(selectedLogDetails.context, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedLogDetails.stack && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Stack Trace</h4>
                      <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-64">
                        {selectedLogDetails.stack}
                      </pre>
                    </div>
                  )}

                  <div className="flex justify-end space-x-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={() => archiveLog(selectedLogDetails.id)}
                      disabled={selectedLogDetails.archived}
                    >
                      {selectedLogDetails.archived ? 'Archived' : 'Archive'}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        deleteLog(selectedLogDetails.id);
                        setSelectedLog(null);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Select a log to view details
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="filters" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Severity Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {Object.values(ErrorSeverity).map((severity) => (
                  <div key={severity} className="flex items-center space-x-2">
                    <Checkbox
                      id={`severity-${severity}`}
                      checked={filters.severity.includes(severity)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFilters({
                            severity: [...filters.severity, severity],
                          });
                        } else {
                          setFilters({
                            severity: filters.severity.filter((s) => s !== severity),
                          });
                        }
                      }}
                    />
                    <Label htmlFor={`severity-${severity}`} className="flex items-center space-x-2">
                      <Badge className={getSeverityColor(severity)}>{severity}</Badge>
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Category Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {Object.values(ErrorCategory).map((category) => (
                  <div key={category} className="flex items-center space-x-2">
                    <Checkbox
                      id={`category-${category}`}
                      checked={filters.category.includes(category)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFilters({
                            category: [...filters.category, category],
                          });
                        } else {
                          setFilters({
                            category: filters.category.filter((c) => c !== category),
                          });
                        }
                      }}
                    />
                    <Label htmlFor={`category-${category}`}>{category}</Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-read"
                  checked={filters.showRead}
                  onCheckedChange={(checked) => {
                    setFilters({ showRead: !!checked });
                  }}
                />
                <Label htmlFor="show-read">Show Read Logs</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-archived"
                  checked={filters.showArchived}
                  onCheckedChange={(checked) => {
                    setFilters({ showArchived: !!checked });
                  }}
                />
                <Label htmlFor="show-archived">Show Archived Logs</Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generate Test Log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="test-message">Message</Label>
                <Input
                  id="test-message"
                  placeholder="Enter test error message"
                  value={testErrorMessage}
                  onChange={(e) => setTestErrorMessage(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="test-severity">Severity</Label>
                  <Select
                    value={testErrorSeverity}
                    onValueChange={(value) => setTestErrorSeverity(value as ErrorSeverity)}
                  >
                    <SelectTrigger id="test-severity">
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(ErrorSeverity).map((severity) => (
                        <SelectItem key={severity} value={severity}>
                          {severity}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-category">Category</Label>
                  <Select
                    value={testErrorCategory}
                    onValueChange={(value) => setTestErrorCategory(value as ErrorCategory)}
                  >
                    <SelectTrigger id="test-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(ErrorCategory).map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleGenerateTestError} disabled={!testErrorMessage}>
                Generate Test Log
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trigger Real Error</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert className="mb-4">
                <AlertDescription>
                  This will trigger a real JavaScript error to test the error capturing system.
                </AlertDescription>
              </Alert>
              <Button variant="destructive" onClick={handleTriggerRealError}>
                Trigger Error
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialog for Clearing Logs */}
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear All Logs</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear all logs? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearLogs();
                setConfirmClear(false);
                setSelectedLog(null);
              }}
            >
              Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ErrorLogger;