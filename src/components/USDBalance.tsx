import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface USDBalanceProps {
  className?: string;
}

export default function USDBalance({ className }: USDBalanceProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [balance, setBalance] = useState<number | null>(null);
  const [newBalance, setNewBalance] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/cryptos/usd-balance');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch USD balance');
      }

      const data = await response.json();
      setBalance(data.usdBalance);
      
      toast({
        title: 'Balance Retrieved',
        description: 'Successfully retrieved your USD balance.',
      });
    } catch (err: any) {
      console.error('Error fetching USD balance:', err);
      setError(err.message || 'Failed to fetch USD balance');
      
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message || 'Failed to fetch USD balance',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateBalance = async () => {
    if (!user || !newBalance) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/cryptos/usd-balance', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usdBalance: parseFloat(newBalance),
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update USD balance');
      }

      const data = await response.json();
      setBalance(data.usdBalance);
      setNewBalance('');
      
      toast({
        title: 'Balance Updated',
        description: 'Successfully updated your USD balance.',
      });
    } catch (err: any) {
      console.error('Error updating USD balance:', err);
      setError(err.message || 'Failed to update USD balance');
      
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message || 'Failed to update USD balance',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchBalance();
    }
  }, [user]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>USD Balance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center space-y-4">
          {balance !== null ? (
            <div className="text-2xl font-bold">${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          ) : (
            <div className="text-muted-foreground">Click the button below to retrieve your balance</div>
          )}
          
          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}
          
          <div className="w-full space-y-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="Enter new balance"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
              className="w-full"
            />
            <div className="flex space-x-2">
              <Button 
                onClick={updateBalance} 
                disabled={loading || !newBalance}
                className="flex-1"
              >
                {loading ? 'Updating...' : 'Update Balance'}
              </Button>
              <Button 
                onClick={fetchBalance} 
                disabled={loading}
                variant="outline"
                className="flex-1"
              >
                {loading ? 'Retrieving...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}