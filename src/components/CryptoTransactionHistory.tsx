import { useEffect, useState } from 'react';
import { CryptoTransaction } from '@/types/stock';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { format } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

export default function CryptoTransactionHistory() {
  const [transactions, setTransactions] = useState<CryptoTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [selectedTransaction, setSelectedTransaction] = useState<CryptoTransaction | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const response = await fetch('/api/crypto-transactions');
        if (response.ok) {
          const data = await response.json();
          setTransactions(data);
        } else {
          throw new Error('Failed to fetch crypto transactions');
        }
      } catch (error) {
        console.error('Error fetching crypto transactions:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load crypto transaction history. Please try again.',
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
            {transactions.map((transaction) => (
              <TableRow 
                key={transaction.id}
                className={transaction.logInfo?.includes('"status":"failed"') ? 'bg-red-50 dark:bg-red-900/10' : ''}
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
                    {(transaction.logInfo?.includes('"status":"failed"') || transaction.action === 'error') && (
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
                    variant="outline" 
                    size="sm"
                    onClick={() => handleViewDetails(transaction)}
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
        <DialogContent className="max-w-3xl">
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

              {selectedTransaction.logInfo && (
                <div>
                  <h3 className="text-sm font-medium mb-1">Log Information</h3>
                  <div className={`p-2 rounded text-xs ${
                    selectedTransaction.logInfo.includes('"status":"failed"') 
                      ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' 
                      : 'bg-gray-100 dark:bg-gray-800'
                  }`}>
                    <ScrollArea className="h-24">
                      {(() => {
                        try {
                          const logData = JSON.parse(selectedTransaction.logInfo);
                          if (logData.status === 'failed') {
                            return (
                              <div className="space-y-2">
                                <div className="text-red-600 dark:text-red-400 font-semibold">
                                  Error: {logData.error || 'Unknown error'}
                                </div>
                                <div>
                                  <strong>Status:</strong> {logData.status}
                                </div>
                                <div>
                                  <strong>Message:</strong> {logData.message}
                                </div>
                                <div>
                                  <strong>Timestamp:</strong> {logData.timestamp}
                                </div>
                                <pre>{JSON.stringify(logData, null, 2)}</pre>
                              </div>
                            );
                          }
                          return <pre>{JSON.stringify(logData, null, 2)}</pre>;
                        } catch (e) {
                          return <pre>{selectedTransaction.logInfo}</pre>;
                        }
                      })()}
                    </ScrollArea>
                  </div>
                </div>
              )}

              {selectedTransaction.apiRequest && (
                <div>
                  <h3 className="text-sm font-medium mb-1">API Request</h3>
                  <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs">
                    <ScrollArea className="h-32">
                      <pre>{selectedTransaction.apiRequest}</pre>
                    </ScrollArea>
                  </div>
                </div>
              )}

              {selectedTransaction.apiResponse && (
                <div>
                  <h3 className="text-sm font-medium mb-1">API Response</h3>
                  <div className={`p-2 rounded text-xs ${
                    selectedTransaction.apiResponse.includes('"error":') 
                      ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' 
                      : 'bg-gray-100 dark:bg-gray-800'
                  }`}>
                    <ScrollArea className="h-32">
                      {(() => {
                        try {
                          const responseData = JSON.parse(selectedTransaction.apiResponse);
                          if (responseData.error && responseData.error.length > 0) {
                            return (
                              <div className="space-y-2">
                                <div className="text-red-600 dark:text-red-400 font-semibold">
                                  API Errors:
                                </div>
                                <ul className="list-disc pl-5 space-y-1">
                                  {responseData.error.map((err: string, idx: number) => (
                                    <li key={idx} className="text-red-600 dark:text-red-400">{err}</li>
                                  ))}
                                </ul>
                                <pre>{JSON.stringify(responseData, null, 2)}</pre>
                              </div>
                            );
                          }
                          return <pre>{JSON.stringify(responseData, null, 2)}</pre>;
                        } catch (e) {
                          return <pre>{selectedTransaction.apiResponse}</pre>;
                        }
                      })()}
                    </ScrollArea>
                  </div>
                </div>
              )}
              
              {!selectedTransaction.apiRequest && !selectedTransaction.apiResponse && (
                <div className="text-sm text-muted-foreground italic">
                  {selectedTransaction.logInfo?.includes('manual_trade') 
                    ? "This was a manual transaction without Kraken API integration." 
                    : "No API request/response data available for this transaction."}
                </div>
              )}
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