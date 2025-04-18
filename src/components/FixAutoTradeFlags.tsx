import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface FixResult {
  symbol: string;
  status: 'fixed' | 'skipped';
  message: string;
  previousState?: {
    autoBuy: boolean;
    autoSell: boolean;
  };
  newState?: {
    autoBuy: boolean;
    autoSell: boolean;
  };
}

export default function FixAutoTradeFlags() {
  const [isFixing, setIsFixing] = useState(false);
  const [results, setResults] = useState<FixResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFixAutoTradeFlags = async () => {
    try {
      setIsFixing(true);
      setError(null);
      setSuccess(null);
      setResults([]);

      // Define the symbols to fix (XMR and AVAX)
      const symbols = ['XMR', 'AVAX'];

      // Call the API to fix auto trade flags
      const response = await fetch('/api/cryptos/fix-auto-trade-flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbols }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to fix auto trade flags');
      }

      // Set the results
      setResults(data.results || []);
      setSuccess(data.message || 'Successfully fixed auto trade flags');

      // Show a toast notification
      toast({
        title: "Auto Trade Flags Fixed",
        description: `Successfully processed ${data.results?.length || 0} cryptocurrencies`,
        variant: "default",
      });
    } catch (err) {
      console.error('Error fixing auto trade flags:', err);
      setError(err.message || 'An error occurred while fixing auto trade flags');
      
      // Show error toast
      toast({
        title: "Error",
        description: err.message || 'Failed to fix auto trade flags',
        variant: "destructive",
      });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Fix Auto Trade Flags</CardTitle>
        <CardDescription>
          Disable auto-trading for XMR and AVAX cryptocurrencies that might have been incorrectly enabled
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {success && (
          <Alert className="mb-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {results.length > 0 && (
          <div className="mt-4 space-y-4">
            <h3 className="text-sm font-medium">Results:</h3>
            <div className="space-y-2">
              {results.map((result, index) => (
                <div 
                  key={index} 
                  className={`p-3 rounded-md border ${
                    result.status === 'fixed' 
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                      : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {result.status === 'fixed' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {result.symbol} - {result.status === 'fixed' ? 'Fixed' : 'Skipped'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {result.message}
                      </p>
                      {result.previousState && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Previous state: Buy: {result.previousState.autoBuy ? 'Enabled' : 'Disabled'}, 
                          Sell: {result.previousState.autoSell ? 'Enabled' : 'Disabled'}
                        </p>
                      )}
                      {result.newState && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          New state: Buy: {result.newState.autoBuy ? 'Enabled' : 'Disabled'}, 
                          Sell: {result.newState.autoSell ? 'Enabled' : 'Disabled'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button 
          onClick={handleFixAutoTradeFlags} 
          disabled={isFixing}
          className="w-full"
        >
          {isFixing ? 'Fixing...' : 'Fix Auto Trade Flags for XMR and AVAX'}
        </Button>
      </CardFooter>
    </Card>
  );
}