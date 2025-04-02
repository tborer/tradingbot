import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useBalanceApiLogs } from '@/contexts/BalanceApiLogContext';

interface KrakenBalanceProps {
  className?: string;
}

export default function KrakenBalance({ className }: KrakenBalanceProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { addLog } = useBalanceApiLogs();
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const startTime = Date.now();
      const response = await fetch('/api/cryptos/balance');
      const duration = Date.now() - startTime;
      
      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        responseData = { error: 'Failed to parse response' };
      }
      
      // Log the API call
      addLog({
        requestMethod: 'GET',
        requestPath: '/api/cryptos/balance',
        requestHeaders: {},
        requestBody: {},
        responseStatus: response.status,
        responseBody: responseData,
        error: !response.ok ? (responseData.error || `HTTP error ${response.status}`) : null
      });
      
      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to fetch Kraken balance');
      }

      // Extract USD balance (USD.M is the cash balance)
      const usdBalance = responseData['USD.M'] || responseData['ZUSD'] || '0';
      
      setBalance(usdBalance);
      
      toast({
        title: 'Balance Retrieved',
        description: 'Successfully retrieved your Kraken balance.',
      });
    } catch (err: any) {
      console.error('Error fetching Kraken balance:', err);
      setError(err.message || 'Failed to fetch Kraken balance');
      
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message || 'Failed to fetch Kraken balance',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Kraken USD Balance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center space-y-4">
          {balance !== null ? (
            <div className="text-2xl font-bold">${parseFloat(balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          ) : (
            <div className="text-muted-foreground">Click the button below to retrieve your balance</div>
          )}
          
          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}
          
          <Button 
            onClick={fetchBalance} 
            disabled={loading}
            className="w-full"
          >
            {loading ? 'Retrieving...' : 'Get Kraken Balance'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}