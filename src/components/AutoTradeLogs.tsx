import { useEffect, useState, useCallback } from 'react';
import { CryptoTransaction } from '@/types/stock';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { format } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Info, ExternalLink, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AutoTradeLogs() {
  const [logs, setLogs] = useState<CryptoTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();
  const [selectedLog, setSelectedLog] = useState<CryptoTransaction | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Create a reusable function to fetch auto trade logs
  const fetchLogs = useCallback(async () => {
    try {
      console.log('Fetching auto trade logs...');
      setRefreshing(true);
      
      const response = await fetch('/api/crypto-transactions?type=auto-trade-log');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error response from API:', errorData);
        
        if (response.status === 401) {
          toast({
            variant: 'destructive',
            title: 'Authentication Error',
            description: 'You must be logged in to view auto trade logs. Please log in again.',
          });
        } else {
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }
      } else {
        const data = await response.json();
        console.log(`Loaded ${data.length} auto trade logs`);
        setLogs(data);
      }
    } catch (error) {
      console.error('Error fetching auto trade logs:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to load auto trade logs: ${error.message || 'Unknown error'}`,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  // Initial fetch on component mount
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);
  
  // Listen for the custom event that signals a transaction has been completed
  useEffect(() => {
    const handleTransactionCompleted = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('Transaction completed event received:', customEvent.detail);
      
      // Show a brief loading indicator
      setRefreshing(true);
      
      // Fetch the updated logs
      fetchLogs();
    };
    
    // Add event listener
    window.addEventListener('crypto-transaction-completed', handleTransactionCompleted);
    
    // Clean up
    return () => {
      window.removeEventListener('crypto-transaction-completed', handleTransactionCompleted);
    };
  }, [fetchLogs]);

  const handleViewDetails = (log: CryptoTransaction) => {
    setSelectedLog(log);
    setDetailsOpen(true);
  };

  if (loading) {
    return <p className="text-center py-4">Loading auto trade logs...</p>;
  }

  if (logs.length === 0) {
    return <p className="text-center py-4">No auto trade logs found. Auto trading activity will appear here.</p>;
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium">Auto Trade Logs</h3>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchLogs} 
          disabled={refreshing}
          className="flex items-center gap-1"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Shares</TableHead>
              <TableHead>Price ($Per Share)</TableHead>
              <TableHead>Total Amount</TableHead>
              <TableHead>Available Until</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={refreshing ? 'opacity-50' : ''}>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{format(new Date(log.createdAt), 'MMM d, yyyy h:mm a')}</TableCell>
                <TableCell className="font-medium">{log.symbol}</TableCell>
                <TableCell>
                  <span className={log.action === 'buy' ? 'text-green-600' : 'text-red-600'}>
                    {log.action === 'buy' ? 'Buy' : 'Sell'}
                  </span>
                </TableCell>
                <TableCell>{log.shares.toFixed(8)}</TableCell>
                <TableCell>${log.price.toFixed(6)}</TableCell>
                <TableCell>${log.totalAmount.toFixed(2)}</TableCell>
                <TableCell>{log.expiresAt ? format(new Date(log.expiresAt), 'MMM d, yyyy') : 'N/A'}</TableCell>
                <TableCell>
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDetails(log)}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Auto Trade Log - {selectedLog?.symbol} {selectedLog?.action.toUpperCase()}
            </DialogTitle>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4">
              {/* Log Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium">Transaction ID</h3>
                  <p className="text-sm text-muted-foreground">{selectedLog.id}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Date</h3>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedLog.createdAt), 'MMM d, yyyy h:mm:ss a')}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Action</h3>
                  <p className={`text-sm ${selectedLog.action === 'buy' ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedLog.action === 'buy' ? 'Buy' : 'Sell'}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Symbol</h3>
                  <p className="text-sm text-muted-foreground">{selectedLog.symbol}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Shares</h3>
                  <p className="text-sm text-muted-foreground">{selectedLog.shares.toFixed(8)}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Price ($Per Share)</h3>
                  <p className="text-sm text-muted-foreground">${selectedLog.price.toFixed(6)}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Total Amount</h3>
                  <p className="text-sm text-muted-foreground">${selectedLog.totalAmount.toFixed(2)}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Available Until</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedLog.expiresAt ? format(new Date(selectedLog.expiresAt), 'MMM d, yyyy h:mm a') : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Detailed Information */}
              <div className="border rounded-md p-4">
                {selectedLog.logInfo ? (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Log Information</h3>
                    <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs">
                      <ScrollArea className="h-[300px]">
                        {(() => {
                          try {
                            const logData = JSON.parse(selectedLog.logInfo);
                            return (
                              <div>
                                <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                                  <div>
                                    <strong>Status:</strong> {logData.status || 'success'}
                                  </div>
                                  <div>
                                    <strong>Timestamp:</strong> {logData.timestamp}
                                  </div>
                                  <div>
                                    <strong>Action:</strong> {logData.action || 'N/A'}
                                  </div>
                                  <div>
                                    <strong>Order ID:</strong> {logData.orderId || 'N/A'}
                                  </div>
                                </div>
                                <div className="text-sm mb-4">
                                  <strong>Message:</strong> {logData.message}
                                </div>
                                <pre className="text-xs overflow-auto">{JSON.stringify(logData, null, 2)}</pre>
                              </div>
                            );
                          } catch (e) {
                            return <pre className="text-xs overflow-auto">{selectedLog.logInfo}</pre>;
                          }
                        })()}
                      </ScrollArea>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No log information available for this entry.</p>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => setDetailsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}