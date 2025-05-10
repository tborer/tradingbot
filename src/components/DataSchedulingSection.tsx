import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import prisma from '@/lib/prisma';

interface DataSchedulingProps {
  initialData?: {
    apiUrl: string;
    apiToken: string;
    dailyRunTime: string;
    cleanupEnabled: boolean;
    cleanupDays: number;
  };
}

const DataSchedulingSection: React.FC<DataSchedulingProps> = ({ initialData }) => {
  const [apiUrl, setApiUrl] = useState(initialData?.apiUrl || '');
  const [apiToken, setApiToken] = useState(initialData?.apiToken || '');
  const [dailyRunTime, setDailyRunTime] = useState(initialData?.dailyRunTime || '00:00');
  const [cleanupEnabled, setCleanupEnabled] = useState(initialData?.cleanupEnabled || false);
  const [cleanupDays, setCleanupDays] = useState(initialData?.cleanupDays?.toString() || '30');
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningFetch, setIsRunningFetch] = useState(false);
  const [isRunningCleanup, setIsRunningCleanup] = useState(false);
  const [operationResult, setOperationResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    const fetchSchedulingData = async () => {
      if (!user) return;
      
      try {
        const response = await fetch('/api/data-scheduling');
        if (response.ok) {
          const data = await response.json();
          if (data) {
            setApiUrl(data.apiUrl || '');
            setApiToken(data.apiToken || '');
            setDailyRunTime(data.dailyRunTime || '00:00');
            setCleanupEnabled(data.cleanupEnabled || false);
            setCleanupDays(data.cleanupDays?.toString() || '30');
          }
        }
      } catch (error) {
        console.error('Failed to fetch scheduling data:', error);
      }
    };

    fetchSchedulingData();
  }, [user]);

  const handleSave = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to save settings",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    
    try {
      const response = await fetch('/api/data-scheduling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiUrl,
          apiToken,
          dailyRunTime,
          cleanupEnabled,
          cleanupDays: parseInt(cleanupDays) || 30
        }),
      });

      if (response.ok) {
        toast({
          title: "Settings Saved",
          description: "Your data scheduling settings have been saved successfully",
        });
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving scheduling settings:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const runOperation = async (operation: 'fetch' | 'cleanup' | 'both') => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to run operations",
        variant: "destructive"
      });
      return;
    }

    // Set the appropriate loading state
    if (operation === 'fetch' || operation === 'both') {
      setIsRunningFetch(true);
    }
    if (operation === 'cleanup' || operation === 'both') {
      setIsRunningCleanup(true);
    }
    
    setOperationResult(null);
    
    try {
      const response = await fetch('/api/data-scheduling/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ operation }),
      });

      const result = await response.json();
      
      if (response.ok) {
        let message = '';
        
        if (operation === 'both') {
          message = `Fetch: ${result.fetch.message}. Cleanup: ${result.cleanup.message}`;
        } else {
          message = result.message;
        }
        
        setOperationResult({
          success: true,
          message
        });
        
        toast({
          title: "Operation Successful",
          description: message,
        });
      } else {
        setOperationResult({
          success: false,
          message: result.error || 'Operation failed'
        });
        
        toast({
          title: "Operation Failed",
          description: result.error || 'An unknown error occurred',
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error(`Error running ${operation} operation:`, error);
      
      setOperationResult({
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred'
      });
      
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: "destructive"
      });
    } finally {
      // Reset loading states
      setIsRunningFetch(false);
      setIsRunningCleanup(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Scheduling</CardTitle>
        <CardDescription>
          Configure data collection and cleanup settings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="apiUrl">API URL</Label>
              <Input
                id="apiUrl"
                placeholder="Enter API URL"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="apiToken">API Token</Label>
              <Input
                id="apiToken"
                type="password"
                placeholder="Enter API Token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="dailyRunTime">Daily Run Time</Label>
            <Input
              id="dailyRunTime"
              type="time"
              value={dailyRunTime}
              onChange={(e) => setDailyRunTime(e.target.value)}
            />
          </div>
          
          <div className="border-t pt-4 mt-4">
            <h3 className="text-lg font-medium mb-2">Data Cleanup</h3>
            
            <div className="flex items-center space-x-2 mb-4">
              <Switch
                id="cleanupEnabled"
                checked={cleanupEnabled}
                onCheckedChange={setCleanupEnabled}
              />
              <Label htmlFor="cleanupEnabled">Enable automatic data cleanup</Label>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="cleanupDays">Delete data older than (days)</Label>
              <Input
                id="cleanupDays"
                type="number"
                min="1"
                placeholder="30"
                value={cleanupDays}
                onChange={(e) => setCleanupDays(e.target.value)}
                disabled={!cleanupEnabled}
              />
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-2 mt-4">
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              className="w-full md:w-auto"
            >
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
            
            <Button 
              onClick={() => runOperation('fetch')} 
              disabled={isRunningFetch || !apiUrl || !apiToken}
              variant="outline"
              className="w-full md:w-auto"
            >
              {isRunningFetch ? "Fetching Data..." : "Fetch Data Now"}
            </Button>
            
            <Button 
              onClick={() => runOperation('cleanup')} 
              disabled={isRunningCleanup || !cleanupEnabled}
              variant="outline"
              className="w-full md:w-auto"
            >
              {isRunningCleanup ? "Cleaning Up..." : "Clean Up Old Data"}
            </Button>
          </div>
          
          {operationResult && (
            <div className={`p-3 mt-4 rounded-md ${operationResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {operationResult.message}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default DataSchedulingSection;