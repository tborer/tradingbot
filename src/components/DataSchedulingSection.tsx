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
    timeZone: string;
    limit: number;
    runTechnicalAnalysis: boolean;
    cleanupEnabled: boolean;
    cleanupDays: number;
  };
}

const DataSchedulingSection: React.FC<DataSchedulingProps> = ({ initialData }) => {
  const [apiUrl, setApiUrl] = useState(initialData?.apiUrl || '');
  const [apiToken, setApiToken] = useState(initialData?.apiToken || '');
  const [dailyRunTime, setDailyRunTime] = useState(initialData?.dailyRunTime || '00:00'); // Ensure default value is in HH:MM format
  const [timeZone] = useState(initialData?.timeZone || 'America/Chicago'); // Central Time
  const [limit, setLimit] = useState(initialData?.limit?.toString() || '24');
  const [runTechnicalAnalysis, setRunTechnicalAnalysis] = useState(initialData?.runTechnicalAnalysis || false);
  const [cleanupEnabled, setCleanupEnabled] = useState(initialData?.cleanupEnabled || false);
  const [cleanupDays, setCleanupDays] = useState(initialData?.cleanupDays?.toString() || '30');
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningFetch, setIsRunningFetch] = useState(false);
  const [isRunningCleanup, setIsRunningCleanup] = useState(false);
  const [operationResult, setOperationResult] = useState<{
    success: boolean;
    message: string;
    processId?: string;
  } | null>(null);
  const [processingStatus, setProcessingStatus] = useState<{
    status: string;
    progress: number;
    error?: string;
  } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    const fetchSchedulingData = async () => {
      if (!user) return;
      
      try {
        console.log("Fetching data scheduling settings...");
        const response = await fetch('/api/data-scheduling');
        if (response.ok) {
          const data = await response.json();
          console.log("Received data scheduling settings:", {
            hasData: !!data,
            hasApiUrl: !!data?.apiUrl,
            hasApiToken: !!data?.apiToken,
            hasDailyRunTime: !!data?.dailyRunTime,
            hasLimit: !!data?.limit,
            hasRunTechnicalAnalysis: !!data?.runTechnicalAnalysis,
          });
          
          if (data) {
            setApiUrl(data.apiUrl || '');
            setApiToken(data.apiToken || '');
            // Ensure dailyRunTime is in valid format, default to '00:00' if not
            setDailyRunTime(data.dailyRunTime && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(data.dailyRunTime) 
              ? data.dailyRunTime 
              : '00:00');
            setLimit(data.limit?.toString() || '24');
            setRunTechnicalAnalysis(data.runTechnicalAnalysis || false);
            setCleanupEnabled(data.cleanupEnabled || false);
            setCleanupDays(data.cleanupDays?.toString() || '30');
          }
        } else {
          console.error('Failed to fetch scheduling data, status:', response.status);
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

    // Validate required fields before submission
    if (!apiUrl.trim()) {
      toast({
        title: "API URL Required",
        description: "Please enter an API URL",
        variant: "destructive"
      });
      return;
    }

    if (!apiToken.trim()) {
      toast({
        title: "API Token Required",
        description: "Please enter an API Token",
        variant: "destructive"
      });
      return;
    }

    // Ensure dailyRunTime is in valid HH:MM format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(dailyRunTime)) {
      toast({
        title: "Invalid Time Format",
        description: "Please enter a valid time in HH:MM format",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    
    try {
      // Validate limit is a positive number
      const limitValue = parseInt(limit);
      if (isNaN(limitValue) || limitValue <= 0) {
        toast({
          title: "Invalid Limit",
          description: "Please enter a positive number for the data limit",
          variant: "destructive"
        });
        setIsSaving(false);
        return;
      }

      console.log("Submitting data scheduling settings:", {
        apiUrl,
        apiToken: "***", // Don't log the actual token
        dailyRunTime,
        timeZone,
        limit: limitValue,
        runTechnicalAnalysis,
        cleanupEnabled,
        cleanupDays: parseInt(cleanupDays) || 30
      });

      const response = await fetch('/api/data-scheduling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiUrl: apiUrl.trim(),
          apiToken: apiToken.trim(),
          dailyRunTime,
          timeZone,
          limit: limitValue,
          runTechnicalAnalysis,
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
        throw new Error(error.error || error.message || 'Failed to save settings');
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

  const [inProgress, setInProgress] = useState(false);
  const [statusPollingInterval, setStatusPollingInterval] = useState<NodeJS.Timeout | null>(null);
  
  // Function to start polling for status updates
  const startStatusPolling = (processId: string) => {
    // Clear any existing polling interval
    if (statusPollingInterval) {
      clearInterval(statusPollingInterval);
    }
    
    // Set up polling every 3 seconds
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/data-scheduling/status?processId=${processId}`);
        
        if (response.ok) {
          const result = await response.json();
          
          if (result.success && result.data) {
            const { status, processedItems, totalItems, error } = result.data;
            const progress = totalItems > 0 ? Math.round((processedItems / totalItems) * 100) : 0;
            
            setProcessingStatus({
              status,
              progress,
              error
            });
            
            // If the process is completed or failed, stop polling
            if (status === 'COMPLETED' || status === 'FAILED') {
              if (statusPollingInterval) {
                clearInterval(statusPollingInterval);
                setStatusPollingInterval(null);
              }
              
              // If completed, update the operation result
              if (status === 'COMPLETED') {
                setInProgress(false);
                toast({
                  title: "Processing Complete",
                  description: "The data processing operation has completed successfully.",
                });
              }
              
              // If failed, show an error
              if (status === 'FAILED') {
                setInProgress(false);
                toast({
                  title: "Processing Failed",
                  description: error || "The data processing operation failed.",
                  variant: "destructive"
                });
              }
            }
          }
        } else {
          console.error('Failed to fetch processing status:', response.status);
          
          // If we get a 404, the process might have been deleted or doesn't exist
          if (response.status === 404) {
            if (statusPollingInterval) {
              clearInterval(statusPollingInterval);
              setStatusPollingInterval(null);
            }
          }
        }
      } catch (error) {
        console.error('Error polling for status:', error);
      }
    }, 3000);
    
    setStatusPollingInterval(interval);
    
    // Clean up the interval when the component unmounts
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  };
  
  // Clean up the polling interval when the component unmounts
  useEffect(() => {
    return () => {
      if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
      }
    };
  }, [statusPollingInterval]);
  
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
    setInProgress(false);
    
    try {
      const response = await fetch('/api/data-scheduling/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ operation }),
      });

      // Check if the response is ok before trying to parse JSON
      if (!response.ok && response.status !== 202) {
        // For non-200 and non-202 responses, try to get text content first
        const errorText = await response.text();
        let errorMessage = 'Operation failed';
        
        try {
          // Try to parse as JSON if possible
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch (parseError) {
          // If not valid JSON, use the text content
          errorMessage = errorText || errorMessage;
        }
        
        setOperationResult({
          success: false,
          message: errorMessage
        });
        
        toast({
          title: "Operation Failed",
          description: errorMessage,
          variant: "destructive"
        });
        return;
      }
      
      // For successful responses, parse JSON
      let result;
      try {
        result = await response.json();
      } catch (jsonError) {
        // Handle case where response is not valid JSON
        console.error("Failed to parse response as JSON:", jsonError);
        
        // Get the text content instead
        const textContent = await response.text();
        
        setOperationResult({
          success: response.ok,
          message: textContent || 'Operation completed but returned an invalid response format'
        });
        
        toast({
          title: response.ok ? "Operation Completed" : "Response Error",
          description: "The server returned a non-JSON response. The operation may have completed but with unexpected output.",
          variant: response.ok ? "default" : "destructive"
        });
        return;
      }
      
      // Handle 202 Accepted status (operation in progress)
      if (response.status === 202) {
        setInProgress(true);
        let message = '';
        let processId = '';
        
        if (operation === 'both' && result.fetch && result.cleanup) {
          message = `Fetch: ${result.fetch.message} Cleanup: ${result.cleanup.message}`;
          processId = result.fetch.processId;
        } else {
          message = result.message || 'Operation is running in the background';
          processId = result.processId;
        }
        
        setOperationResult({
          success: true,
          message,
          processId
        });
        
        toast({
          title: "Operation In Progress",
          description: "The operation is running in the background. This may take several minutes for multiple cryptocurrencies.",
        });
        
        // Start polling for status updates if we have a process ID
        if (processId) {
          startStatusPolling(processId);
        }
        
        return;
      }
      
      // Handle successful response
      if (response.ok) {
        let message = '';
        
        if (operation === 'both' && result.fetch && result.cleanup) {
          message = `Fetch: ${result.fetch.message}. Cleanup: ${result.cleanup.message}`;
        } else {
          message = result.message || 'Operation completed successfully';
        }
        
        setOperationResult({
          success: true,
          message
        });
        
        toast({
          title: "Operation Successful",
          description: message,
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
                required
              />
              <p className="text-xs text-muted-foreground">The URL of the API to fetch data from</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="apiToken">API Token</Label>
              <Input
                id="apiToken"
                type="password"
                placeholder="Enter API Token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">Your authentication token for the API</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dailyRunTime">Daily Run Time</Label>
              <Input
                id="dailyRunTime"
                type="time"
                value={dailyRunTime}
                onChange={(e) => {
                  const newValue = e.target.value;
                  // Ensure the time value is in HH:MM format
                  if (newValue) {
                    setDailyRunTime(newValue);
                  } else {
                    // If the field is cleared, set a default value
                    setDailyRunTime('00:00');
                  }
                }}
                required
              />
              <p className="text-xs text-muted-foreground">Time in 24-hour format (HH:MM) - Central Time</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="limit">Data Limit</Label>
              <Input
                id="limit"
                type="number"
                min="1"
                placeholder="24"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">Number of hours of data to fetch</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 mb-4">
            <Switch
              id="runTechnicalAnalysis"
              checked={runTechnicalAnalysis}
              onCheckedChange={setRunTechnicalAnalysis}
            />
            <Label htmlFor="runTechnicalAnalysis">Run Technical Indicator Analysis</Label>
            <p className="text-xs text-muted-foreground ml-2">(SMA, EMA, RSI, Bollinger Bands, Support/Resistance, etc.)</p>
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
              {inProgress && (
                <div className="mt-2">
                  <p className="font-medium">Processing in background:</p>
                  <ul className="list-disc pl-5 mt-1 text-sm">
                    <li>Data is being fetched and processed in batches</li>
                    <li>Technical analysis is running for each cryptocurrency</li>
                    <li>This process may take several minutes to complete</li>
                    <li>You can navigate away from this page - processing will continue</li>
                  </ul>
                  
                  {processingStatus && (
                    <div className="mt-3">
                      <p className="font-medium">Status: {processingStatus.status}</p>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                        <div 
                          className="bg-blue-600 h-2.5 rounded-full" 
                          style={{ width: `${processingStatus.progress}%` }}
                        ></div>
                      </div>
                      <p className="text-xs mt-1">{processingStatus.progress}% complete</p>
                      
                      {processingStatus.error && (
                        <p className="text-red-600 mt-2">Error: {processingStatus.error}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default DataSchedulingSection;