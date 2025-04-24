import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Spinner } from "@/components/ui/spinner";

export default function FixMicroProcessingTable() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFixTable = async () => {
    if (!confirm("This will recreate the MicroProcessingSettings table. Any invalid records will be lost. Continue?")) {
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await fetch('/api/cryptos/fix-micro-processing-table', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: "Success",
          description: data.message,
        });
        setResult(data);
      } else {
        throw new Error(data.error || 'Failed to fix table');
      }
    } catch (error) {
      console.error('Error fixing table:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fix Micro Processing Table</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4">
          This will recreate the MicroProcessingSettings table to ensure proper crypto relationship.
          Any invalid records will be lost.
        </p>
        
        {result && (
          <div className="mt-4 p-4 bg-muted rounded-md">
            <h3 className="font-medium mb-2">Result:</h3>
            <pre className="text-xs overflow-auto max-h-40">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleFixTable} disabled={loading}>
          {loading ? <><Spinner className="mr-2" /> Processing...</> : 'Fix Table'}
        </Button>
      </CardFooter>
    </Card>
  );
}