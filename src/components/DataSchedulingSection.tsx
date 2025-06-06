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
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
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
      
      // Add retry logic for fetching data
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          console.log(`Fetching data scheduling settings... (attempt ${retryCount + 1})`);
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
            break; // Success, exit the retry loop
          } else {
            // If we get a 5xx error, retry
            if (response.status >= 500) {
              retryCount++;
              if (retryCount < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s
                const delay = 1000 * Math.pow(2, retryCount - 1);
                console.log(`Retrying fetch scheduling data (attempt ${retryCount + 1}) after ${delay}ms delay...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
            }
            
            console.error('Failed to fetch scheduling data, status:', response.status);
            break; // Non-retryable error, exit the loop
          }
        } catch (error) {
          // For network errors, retry
          if (error instanceof TypeError && error.message.includes('fetch')) {
            retryCount++;
            if (retryCount < maxRetries) {
              const delay = 1000 * Math.pow(2, retryCount - 1);
              console.log(`Network error, retrying fetch scheduling data (attempt ${retryCount + 1}) after ${delay}ms delay...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
          
          console.error('Failed to fetch scheduling data:', error);
          break; // Non-retryable error, exit the loop
        }
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

      // Add retry logic for the fetch request
      let retryCount = 0;
      const maxRetries = 3;
      let response;
      
      while (retryCount < maxRetries) {
        try {
          response = await fetch('/api/data-scheduling', {
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
          
          // If successful, break out of the retry loop
          if (response.ok) {
            toast({
              title: "Settings Saved",
              description: "Your data scheduling settings have been saved successfully",
            });
            break;
          } else {
            // If we get a 5xx error, retry
            if (response.status >= 500) {
              retryCount++;
              if (retryCount < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s
                const delay = 1000 * Math.pow(2, retryCount - 1);
                console.log(`Retrying save settings (attempt ${retryCount + 1}) after ${delay}ms delay...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
            }
            
            // For non-5xx errors or if we've exhausted retries, throw an error
            const errorData = await response.json();
            throw new Error(errorData.error || errorData.message || 'Failed to save settings');
          }
        } catch (fetchError) {
          // For network errors, retry
          if (fetchError instanceof TypeError && fetchError.message.includes('fetch')) {
            retryCount++;
            if (retryCount < maxRetries) {
              const delay = 1000 * Math.pow(2, retryCount - 1);
              console.log(`Network error, retrying save settings (attempt ${retryCount + 1}) after ${delay}ms delay...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
          
          // Re-throw the error if it's not a network error or we've exhausted retries
          throw fetchError;
        }
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
      setStatusPollingInterval(null);
    }
    
    console.log(`Starting status polling for process ${processId}`);
    
    // Set up polling every 2 seconds for more responsive updates
    const interval = setInterval(async () => {
      // Add retry logic for status polling
      let retryCount = 0;
      const maxRetries = 3;
      let success = false;
      
      while (retryCount < maxRetries && !success) {
        try {
          const response = await fetch(`/api/data-scheduling/status?processId=${processId}`);
          
          if (response.ok) {
            const result = await response.json();
            success = true;
            
            if (result.success && result.data) {
              const { status, processedItems, totalItems, error } = result.data;
              const progress = totalItems > 0 ? Math.round((processedItems / totalItems) * 100) : 0;
              
              console.log(`Status update for ${processId}: ${status}, progress: ${processedItems}/${totalItems} (${progress}%)`);
              
              setProcessingStatus({
                status,
                progress,
                error
              });
              
              // If the process is completed or failed, stop polling
              if (status === 'COMPLETED' || status === 'FAILED') {
                console.log(`Process ${processId} ${status.toLowerCase()}, stopping polling`);
                
                if (statusPollingInterval) {
                  clearInterval(statusPollingInterval);
                  setStatusPollingInterval(null);
                }
                
                // If completed, update the operation result
                if (status === 'COMPLETED') {
                  setInProgress(false);
                  setIsRunningAnalysis(false);
                  toast({
                    title: "Processing Complete",
                    description: "The data processing operation has completed successfully.",
                  });
                }
                
                // If failed, show an error
                if (status === 'FAILED') {
                  setInProgress(false);
                  setIsRunningAnalysis(false);
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
              console.log(`Process ${processId} not found (404), stopping polling`);
              
              if (statusPollingInterval) {
                clearInterval(statusPollingInterval);
                setStatusPollingInterval(null);
              }
              
              setInProgress(false);
              setIsRunningAnalysis(false);
              success = true; // Exit the retry loop
            } 
            // If we get a 5xx error, retry
            else if (response.status >= 500) {
              retryCount++;
              if (retryCount < maxRetries) {
                // Short delay for status polling retries (200ms)
                await new Promise(resolve => setTimeout(resolve, 200));
                continue;
              }
            }
          }
        } catch (error) {
          console.error('Error polling for status:', error);
          
          // For network errors, retry
          if (error instanceof TypeError && error.message.includes('fetch')) {
            retryCount++;
            if (retryCount < maxRetries) {
              // Short delay for status polling retries (200ms)
              await new Promise(resolve => setTimeout(resolve, 200));
              continue;
            }
          }
        }
        
        // If we get here and haven't continued the loop, exit
        break;
      }
    }, 2000); // Changed from 3000 to 2000 for more responsive updates
    
    setStatusPollingInterval(interval);
  };
  
  // Clean up the polling interval when the component unmounts
  useEffect(() => {
    return () => {
      if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
      }
    };
  }, [statusPollingInterval]);
  
  const runOperation = async (operation: 'fetch' | 'analysis' | 'cleanup' | 'both', e?: React.MouseEvent) => {
    // Prevent default behavior to avoid page navigation
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
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
    if (operation === 'analysis') {
      setIsRunningAnalysis(true);
    }
    if (operation === 'cleanup' || operation === 'both') {
      setIsRunningCleanup(true);
    }
    
    setOperationResult(null);
    setInProgress(false);
    setProcessingStatus(null); // Reset processing status
    
    // Add retry logic for the operation execution
    let retryCount = 0;
    const maxRetries = 3;
    let response;
    
    while (retryCount < maxRetries) {
      try {
        // Use the appropriate endpoint based on the operation
        const endpoint = operation === 'analysis' 
          ? '/api/data-scheduling/run-analysis' 
          : '/api/data-scheduling/run';
          
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ operation: operation === 'analysis' ? undefined : operation }),
        });
        
        // If we get a successful response or a 202 (Accepted), break out of the retry loop
        if (response.ok || response.status === 202) {
          break;
        }
        
        // If we get a 5xx error, retry
        if (response.status >= 500) {
          retryCount++;
          if (retryCount < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s
            const delay = 1000 * Math.pow(2, retryCount - 1);
            console.log(`Retrying operation execution (attempt ${retryCount + 1}) after ${delay}ms delay...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // For non-5xx errors or if we've exhausted retries, continue with error handling
        break;
      } catch (fetchError) {
        // For network errors, retry
        if (fetchError instanceof TypeError && fetchError.message.includes('fetch')) {
          retryCount++;
          if (retryCount < maxRetries) {
            const delay = 1000 * Math.pow(2, retryCount - 1);
            console.log(`Network error, retrying operation execution (attempt ${retryCount + 1}) after ${delay}ms delay...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // Re-throw the error if it's not a network error or we've exhausted retries
        throw fetchError;
      }
    }
    
    try {

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
      setIsRunningAnalysis(false);
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
        {/* Wrap the content in a form with onSubmit that prevents default */}
        <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
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
              <p className="text-xs text-muted-foreground">
                Time in 24-hour format (HH:MM) - Central Time
                <br />
                <span className="font-medium">The system will automatically run data collection daily at this time.</span>
              </p>
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
              onClick={(e) => runOperation('fetch', e)} 
              disabled={isRunningFetch || !apiUrl || !apiToken}
              variant="outline"
              className="w-full md:w-auto"
              title="Fetch data from API and store it in the database"
              type="button" // Explicitly set type to button to prevent form submission
            >
              {isRunningFetch ? "Fetching Data..." : "Fetch Data Now"}
            </Button>
            
            <Button 
              onClick={(e) => runOperation('analysis', e)} 
              disabled={isRunningAnalysis}
              variant="outline"
              className="w-full md:w-auto"
              title="Run technical analysis on the stored data"
              type="button" // Explicitly set type to button to prevent form submission
            >
              {isRunningAnalysis ? "Running Analysis..." : "Run Analysis"}
            </Button>
            
            <Button 
              onClick={(e) => runOperation('cleanup', e)} 
              disabled={isRunningCleanup || !cleanupEnabled}
              variant="outline"
              className="w-full md:w-auto"
              title="Clean up old data based on the configured retention period"
              type="button" // Explicitly set type to button to prevent form submission
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
        </form>
      </CardContent>
    </Card>
  );
};

export default DataSchedulingSection;