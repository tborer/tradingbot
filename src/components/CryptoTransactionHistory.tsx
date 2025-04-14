import { useEffect, useState } from 'react';
import { CryptoTransaction } from '@/types/stock';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { format } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Info, ExternalLink } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CryptoTransactionHistory() {
  const [transactions, setTransactions] = useState<CryptoTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [selectedTransaction, setSelectedTransaction] = useState<CryptoTransaction | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        console.log('Fetching crypto transactions...');
        const response = await fetch('/api/crypto-transactions');
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Error response from API:', errorData);
          
          if (response.status === 401) {
            toast({
              variant: 'destructive',
              title: 'Authentication Error',
              description: 'You must be logged in to view transaction history. Please log in again.',
            });
          } else {
            throw new Error(errorData.error || `Server error: ${response.status}`);
          }
        } else {
          const data = await response.json();
          console.log(`Loaded ${data.length} transactions`);
          setTransactions(data);
        }
      } catch (error) {
        console.error('Error fetching crypto transactions:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `Failed to load transaction history: ${error.message || 'Unknown error'}`,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [toast]);

  const handleViewDetails = (transaction: CryptoTransaction) => {
    setSelectedTransaction(transaction);
    setDetailsOpen(true);
  };

  if (loading) {
    return <p className="text-center py-4">Loading crypto transaction history...</p>;
  }

  if (transactions.length === 0) {
    return <p className="text-center py-4">No crypto transactions found. Start trading to see your history here.</p>;
  }

  return (
    <>
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
          <TableBody>
            {transactions.map((transaction) => {
              // Determine if this is an error transaction
              const isError = transaction.action === 'error' || transaction.logInfo?.includes('"status":"failed"');
              
              return (
                <TableRow 
                  key={transaction.id}
                  className={isError ? 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20' : ''}
                >
                  <TableCell>{format(new Date(transaction.createdAt), 'MMM d, yyyy h:mm a')}</TableCell>
                  <TableCell className="font-medium">{transaction.symbol}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {transaction.action === 'error' ? (
                        <span className="text-red-600 font-medium">ERROR</span>
                      ) : (
                        <span className={transaction.action === 'buy' ? 'text-green-600' : 'text-red-600'}>
                          {transaction.action === 'buy' ? 'Buy' : 'Sell'}
                        </span>
                      )}
                      {isError && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Failed
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{transaction.shares.toFixed(8)}</TableCell>
                  <TableCell>${transaction.price.toFixed(6)}</TableCell>
                  <TableCell>${transaction.totalAmount.toFixed(2)}</TableCell>
                  <TableCell>{transaction.expiresAt ? format(new Date(transaction.expiresAt), 'MMM d, yyyy') : 'N/A'}</TableCell>
                  <TableCell>
                    <Button 
                      variant={isError ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => handleViewDetails(transaction)}
                    >
                      {isError ? "View Error" : "View"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Transaction Details - {selectedTransaction?.symbol} {selectedTransaction?.action === 'error' ? 'ERROR' : selectedTransaction?.action.toUpperCase()}
              {(selectedTransaction?.logInfo?.includes('"status":"failed"') || selectedTransaction?.action === 'error') && (
                <Badge variant="destructive">Failed Transaction</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {selectedTransaction && (
            <div className="space-y-4">
              {/* Transaction Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium">Transaction ID</h3>
                  <p className="text-sm text-muted-foreground">{selectedTransaction.id}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Date</h3>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedTransaction.createdAt), 'MMM d, yyyy h:mm:ss a')}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Action</h3>
                  {selectedTransaction.action === 'error' ? (
                    <div>
                      <p className="text-sm text-red-600 font-medium">ERROR</p>
                      {(() => {
                        try {
                          const logData = JSON.parse(selectedTransaction.logInfo || '{}');
                          if (logData.requestedAction) {
                            return (
                              <p className="text-xs text-muted-foreground">
                                Attempted: {logData.requestedAction.toUpperCase()}
                              </p>
                            );
                          }
                          return null;
                        } catch (e) {
                          return null;
                        }
                      })()}
                    </div>
                  ) : (
                    <p className={`text-sm ${selectedTransaction.action === 'buy' ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedTransaction.action === 'buy' ? 'Buy' : 'Sell'}
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium">Symbol</h3>
                  <p className="text-sm text-muted-foreground">{selectedTransaction.symbol}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Shares</h3>
                  <p className="text-sm text-muted-foreground">{selectedTransaction.shares.toFixed(8)}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Price ($Per Share)</h3>
                  <p className="text-sm text-muted-foreground">${selectedTransaction.price.toFixed(6)}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Total Amount</h3>
                  <p className="text-sm text-muted-foreground">${selectedTransaction.totalAmount.toFixed(2)}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Available Until</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedTransaction.expiresAt ? format(new Date(selectedTransaction.expiresAt), 'MMM d, yyyy h:mm a') : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Error Summary - Only show for failed transactions */}
              {(selectedTransaction.action === 'error' || selectedTransaction.logInfo?.includes('"status":"failed"')) && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">Transaction Failed</h3>
                      {(() => {
                        try {
                          const logData = JSON.parse(selectedTransaction.logInfo || '{}');
                          return (
                            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                              {logData.error || 'An error occurred during the transaction'}
                            </p>
                          );
                        } catch (e) {
                          return (
                            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                              An error occurred during the transaction
                            </p>
                          );
                        }
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Detailed Information Tabs */}
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid grid-cols-3">
                  <TabsTrigger value="summary">
                    <Info className="h-4 w-4 mr-2" />
                    Log Information
                  </TabsTrigger>
                  <TabsTrigger value="request">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    API Request
                  </TabsTrigger>
                  <TabsTrigger value="response">
                    <ExternalLink className="h-4 w-4 mr-2 rotate-180" />
                    API Response
                  </TabsTrigger>
                </TabsList>
                
                {/* Log Information Tab */}
                <TabsContent value="summary" className="border rounded-md p-4">
                  {selectedTransaction.logInfo ? (
                    <div>
                      <h3 className="text-sm font-medium mb-2">Transaction Log</h3>
                      <div className={`p-3 rounded text-xs ${
                        selectedTransaction.logInfo.includes('"status":"failed"') 
                          ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' 
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        <ScrollArea className="h-[300px]">
                          {(() => {
                            try {
                              const logData = JSON.parse(selectedTransaction.logInfo);
                              if (logData.status === 'failed') {
                                return (
                                  <div className="space-y-3">
                                    <div className="text-red-600 dark:text-red-400 font-semibold text-sm">
                                      Error: {logData.error || 'Unknown error'}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                      <div>
                                        <strong>Status:</strong> {logData.status}
                                      </div>
                                      <div>
                                        <strong>Timestamp:</strong> {logData.timestamp}
                                      </div>
                                      <div>
                                        <strong>Requested Action:</strong> {logData.requestedAction || 'N/A'}
                                      </div>
                                      <div>
                                        <strong>Order ID:</strong> {logData.orderId || 'N/A'}
                                      </div>
                                    </div>
                                    <div className="text-sm">
                                      <strong>Message:</strong> {logData.message}
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                      <h4 className="text-sm font-medium mb-2">Full Log Data:</h4>
                                      <pre className="text-xs overflow-auto">{JSON.stringify(logData, null, 2)}</pre>
                                    </div>
                                  </div>
                                );
                              }
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
                              return <pre className="text-xs overflow-auto">{selectedTransaction.logInfo}</pre>;
                            }
                          })()}
                        </ScrollArea>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No log information available for this transaction.</p>
                  )}
                </TabsContent>
                
                {/* API Request Tab */}
                <TabsContent value="request" className="border rounded-md p-4">
                  {selectedTransaction.apiRequest ? (
                    <div>
                      <h3 className="text-sm font-medium mb-2">API Request Details</h3>
                      <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs">
                        <ScrollArea className="h-[300px]">
                          {(() => {
                            try {
                              const requestData = JSON.parse(selectedTransaction.apiRequest);
                              return (
                                <div>
                                  <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                                    <div>
                                      <strong>Endpoint:</strong> {requestData.endpoint || 'N/A'}
                                    </div>
                                    <div>
                                      <strong>Method:</strong> {requestData.method || 'N/A'}
                                    </div>
                                  </div>
                                  {requestData.body && (
                                    <div className="mb-4">
                                      <h4 className="text-sm font-medium mb-2">Request Body:</h4>
                                      <pre className="text-xs overflow-auto bg-gray-200 dark:bg-gray-700 p-2 rounded">{requestData.body}</pre>
                                    </div>
                                  )}
                                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                    <h4 className="text-sm font-medium mb-2">Full Request Data:</h4>
                                    <pre className="text-xs overflow-auto">{JSON.stringify(requestData, null, 2)}</pre>
                                  </div>
                                </div>
                              );
                            } catch (e) {
                              return <pre className="text-xs overflow-auto">{selectedTransaction.apiRequest}</pre>;
                            }
                          })()}
                        </ScrollArea>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      {selectedTransaction.logInfo?.includes('manual_trade') 
                        ? "This was a manual transaction without API integration." 
                        : "No API request data available for this transaction."}
                    </p>
                  )}
                </TabsContent>
                
                {/* API Response Tab */}
                <TabsContent value="response" className="border rounded-md p-4">
                  {selectedTransaction.apiResponse ? (
                    <div>
                      <h3 className="text-sm font-medium mb-2">API Response Details</h3>
                      <div className={`p-3 rounded text-xs ${
                        selectedTransaction.apiResponse.includes('"error":') 
                          ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' 
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        <ScrollArea className="h-[300px]">
                          {(() => {
                            try {
                              const responseData = JSON.parse(selectedTransaction.apiResponse);
                              if (responseData.error && responseData.error.length > 0) {
                                return (
                                  <div className="space-y-3">
                                    <div className="text-red-600 dark:text-red-400 font-semibold text-sm">
                                      API Errors:
                                    </div>
                                    <ul className="list-disc pl-5 space-y-1 text-sm">
                                      {Array.isArray(responseData.error) ? (
                                        responseData.error.map((err: string, idx: number) => (
                                          <li key={idx} className="text-red-600 dark:text-red-400">{err}</li>
                                        ))
                                      ) : (
                                        <li className="text-red-600 dark:text-red-400">{responseData.error.toString()}</li>
                                      )}
                                    </ul>
                                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                      <h4 className="text-sm font-medium mb-2">Full Response Data:</h4>
                                      <pre className="text-xs overflow-auto">{JSON.stringify(responseData, null, 2)}</pre>
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <div>
                                  {responseData.result && (
                                    <div className="mb-4">
                                      <h4 className="text-sm font-medium mb-2">Result:</h4>
                                      <pre className="text-xs overflow-auto bg-gray-200 dark:bg-gray-700 p-2 rounded">
                                        {JSON.stringify(responseData.result, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                  <div className="mt-4">
                                    <h4 className="text-sm font-medium mb-2">Full Response Data:</h4>
                                    <pre className="text-xs overflow-auto">{JSON.stringify(responseData, null, 2)}</pre>
                                  </div>
                                </div>
                              );
                            } catch (e) {
                              return <pre className="text-xs overflow-auto">{selectedTransaction.apiResponse}</pre>;
                            }
                          })()}
                        </ScrollArea>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      {selectedTransaction.logInfo?.includes('manual_trade') 
                        ? "This was a manual transaction without API integration." 
                        : "No API response data available for this transaction."}
                    </p>
                  )}
                </TabsContent>
              </Tabs>
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