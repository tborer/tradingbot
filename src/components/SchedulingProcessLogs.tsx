import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

interface SchedulingProcessLog {
  id: string;
  processId: string;
  userId: string;
  timestamp: string;
  level: string;
  category: string;
  operation: string;
  symbol?: string;
  message: string;
  details?: any;
  duration?: number;
}

const SchedulingProcessLogs: React.FC = () => {
  const [logs, setLogs] = useState<SchedulingProcessLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [processIds, setProcessIds] = useState<string[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  
  const pageSize = 50;
  
  useEffect(() => {
    if (user) {
      fetchProcessIds();
    }
  }, [user]);
  
  useEffect(() => {
    if (selectedProcessId) {
      fetchLogs();
    } else if (processIds.length > 0 && !selectedProcessId) {
      // Auto-select the first process ID if none is selected
      setSelectedProcessId(processIds[0]);
    }
  }, [selectedProcessId, selectedCategory, selectedLevel, selectedSymbol, searchQuery, page, processIds]);
  
  const fetchProcessIds = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/scheduling-logs/processes');
      
      if (response.ok) {
        const data = await response.json();
        setProcessIds(data.processIds || []);
        
        // Select the most recent process ID by default
        if (data.processIds && data.processIds.length > 0) {
          setSelectedProcessId(data.processIds[0]);
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch process IDs",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error fetching process IDs:', error);
      toast({
        title: "Error",
        description: "An error occurred while fetching process IDs",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  
  const fetchLogs = async () => {
    try {
      setLoading(true);
      
      const queryParams = new URLSearchParams({
        processId: selectedProcessId,
        page: page.toString(),
        pageSize: pageSize.toString()
      });
      
      if (selectedCategory) queryParams.append('category', selectedCategory);
      if (selectedLevel) queryParams.append('level', selectedLevel);
      if (selectedSymbol) queryParams.append('symbol', selectedSymbol);
      if (searchQuery) queryParams.append('search', searchQuery);
      
      const response = await fetch(`/api/scheduling-logs?${queryParams.toString()}`);
      
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
        setTotalPages(data.totalPages || 1);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch logs",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      toast({
        title: "Error",
        description: "An error occurred while fetching logs",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handleRefresh = () => {
    fetchLogs();
  };
  
  const handleClearFilters = () => {
    setSelectedCategory('');
    setSelectedLevel('');
    setSelectedSymbol('');
    setSearchQuery('');
    setPage(1);
  };
  
  const formatDuration = (duration?: number) => {
    if (!duration) return '';
    
    if (duration < 1000) {
      return `${duration}ms`;
    } else if (duration < 60000) {
      return `${(duration / 1000).toFixed(2)}s`;
    } else {
      return `${(duration / 60000).toFixed(2)}m`;
    }
  };
  
  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'bg-red-100 text-red-800';
      case 'WARNING': return 'bg-yellow-100 text-yellow-800';
      case 'INFO': return 'bg-blue-100 text-blue-800';
      case 'DEBUG': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'SCHEDULING': return 'bg-purple-100 text-purple-800';
      case 'API_CALL': return 'bg-green-100 text-green-800';
      case 'DATA_PROCESSING': return 'bg-blue-100 text-blue-800';
      case 'ANALYSIS': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  const toggleExpandLog = (id: string) => {
    if (expandedLogId === id) {
      setExpandedLogId(null);
    } else {
      setExpandedLogId(id);
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Scheduling Process Logs</CardTitle>
        <CardDescription>
          View detailed logs for data scheduling processes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-1/3">
              <Label htmlFor="processId">Process ID</Label>
              <Select
                value={selectedProcessId}
                onValueChange={setSelectedProcessId}
              >
                <SelectTrigger id="processId">
                  <SelectValue placeholder="Select a process" />
                </SelectTrigger>
                <SelectContent>
                  {processIds.map((id) => (
                    <SelectItem key={id} value={id || "unknown"}>
                      {id || "Unknown Process"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="w-full md:w-1/3">
              <Label htmlFor="category">Category</Label>
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All categories</SelectItem>
                  <SelectItem value="SCHEDULING">Scheduling</SelectItem>
                  <SelectItem value="API_CALL">API Call</SelectItem>
                  <SelectItem value="DATA_PROCESSING">Data Processing</SelectItem>
                  <SelectItem value="ANALYSIS">Analysis</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="w-full md:w-1/3">
              <Label htmlFor="level">Level</Label>
              <Select
                value={selectedLevel}
                onValueChange={setSelectedLevel}
              >
                <SelectTrigger id="level">
                  <SelectValue placeholder="All levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All levels</SelectItem>
                  <SelectItem value="INFO">Info</SelectItem>
                  <SelectItem value="WARNING">Warning</SelectItem>
                  <SelectItem value="ERROR">Error</SelectItem>
                  <SelectItem value="DEBUG">Debug</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-1/3">
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                placeholder="Filter by symbol (e.g., BTC)"
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
              />
            </div>
            
            <div className="w-full md:w-2/3">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search in messages and operations"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <Button onClick={handleRefresh} variant="outline" disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </Button>
              <Button onClick={handleClearFilters} variant="outline" disabled={loading}>
                Clear Filters
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                onClick={() => setPage(page - 1)} 
                disabled={page === 1 || loading}
                variant="outline"
                size="sm"
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {page} of {totalPages}
              </span>
              <Button 
                onClick={() => setPage(page + 1)} 
                disabled={page === totalPages || loading}
                variant="outline"
                size="sm"
              >
                Next
              </Button>
            </div>
          </div>
          
          {loading ? (
            <div className="text-center py-8">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8">No logs found for the selected filters</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <React.Fragment key={log.id}>
                      <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => toggleExpandLog(log.id)}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={getLevelColor(log.level)}>
                            {log.level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getCategoryColor(log.category)}>
                            {log.category}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.symbol || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap">{log.operation}</TableCell>
                        <TableCell className="max-w-xs truncate">{log.message}</TableCell>
                        <TableCell>{formatDuration(log.duration)}</TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpandLog(log.id);
                            }}
                          >
                            {expandedLogId === log.id ? 'Hide' : 'View'}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expandedLogId === log.id && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-gray-50 p-4">
                            <div className="space-y-2">
                              <h4 className="font-medium">Log Details</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <p><strong>Process ID:</strong> {log.processId}</p>
                                  <p><strong>Timestamp:</strong> {new Date(log.timestamp).toLocaleString()}</p>
                                  <p><strong>Level:</strong> {log.level}</p>
                                  <p><strong>Category:</strong> {log.category}</p>
                                </div>
                                <div>
                                  <p><strong>Operation:</strong> {log.operation}</p>
                                  <p><strong>Symbol:</strong> {log.symbol || '-'}</p>
                                  <p><strong>Duration:</strong> {formatDuration(log.duration)}</p>
                                </div>
                              </div>
                              <div>
                                <p><strong>Message:</strong> {log.message}</p>
                              </div>
                              {log.details && (
                                <div>
                                  <p><strong>Details:</strong></p>
                                  <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-60">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SchedulingProcessLogs;