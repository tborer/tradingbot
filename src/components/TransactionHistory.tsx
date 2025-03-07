import { useEffect, useState } from 'react';
import { Transaction } from '@/types/stock';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { format } from 'date-fns';

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const response = await fetch('/api/transactions');
        if (response.ok) {
          const data = await response.json();
          setTransactions(data);
        } else {
          throw new Error('Failed to fetch transactions');
        }
      } catch (error) {
        console.error('Error fetching transactions:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load transaction history. Please try again.',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [toast]);

  if (loading) {
    return <p className="text-center py-4">Loading transaction history...</p>;
  }

  if (transactions.length === 0) {
    return <p className="text-center py-4">No transactions found. Start trading to see your history here.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Ticker</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Shares</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Total Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell>{format(new Date(transaction.createdAt), 'MMM d, yyyy h:mm a')}</TableCell>
              <TableCell className="font-medium">{transaction.ticker}</TableCell>
              <TableCell>
                <span className={transaction.action === 'buy' ? 'text-green-600' : 'text-red-600'}>
                  {transaction.action === 'buy' ? 'Buy' : 'Sell'}
                </span>
              </TableCell>
              <TableCell>{transaction.shares.toFixed(2)}</TableCell>
              <TableCell>${transaction.price.toFixed(2)}</TableCell>
              <TableCell>${transaction.totalAmount.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}