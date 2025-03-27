import { WebSocketLog } from '@/contexts/WebSocketLogContext';

// Constants for WebSocket connection management
const PING_INTERVAL = 30000; // 30 seconds as requested
const RECONNECT_BASE_DELAY = 1000; // 1 second
const MAX_RECONNECT_ATTEMPTS = 5;
const CONNECTION_TIMEOUT = 10000; // 10 seconds
const KRAKEN_WEBSOCKET_URL = 'wss://ws.kraken.com/v2';

export interface KrakenWebSocketOptions {
  symbols: string[];
  onMessage: (data: any) => void;
  onError?: (error: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onOpen?: () => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  autoConnect?: boolean;
  addLog?: (level: 'info' | 'warning' | 'error' | 'success', message: string, details?: Record<string, any>, errorCode?: string) => void;
}

export interface ConnectionStatus {
  isConnected: boolean;
  error: Error | null;
  lastPingTime: Date | null;
  lastPongTime: Date | null;
}

export class KrakenWebSocket {
  private socket: WebSocket | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private status: ConnectionStatus = {
    isConnected: false,
    error: null,
    lastPingTime: null,
    lastPongTime: null
  };
  private pingCounter = 100; // Starting counter for req_id
  private options: KrakenWebSocketOptions;
  private symbols: string[];

  constructor(options: KrakenWebSocketOptions) {
    this.options = options;
    this.symbols = options.symbols || [];
    
    // Auto-connect if enabled
    if (options.autoConnect) {
      this.connect();
    }
  }

  public connect(): void {
    // Clear any existing connection
    this.disconnect();
    
    try {
      // Add timestamp to prevent caching
      const timestamp = Date.now();
      const wsUrl = `${KRAKEN_WEBSOCKET_URL}?t=${timestamp}`;
      
      this.log('info', 'Connecting to Kraken WebSocket', { url: wsUrl });
      
      this.socket = new WebSocket(wsUrl);
      
      this.socket.onopen = this.handleOpen.bind(this);
      this.socket.onmessage = this.handleMessage.bind(this);
      this.socket.onerror = this.handleError.bind(this);
      this.socket.onclose = this.handleClose.bind(this);
      
      // Set a connection timeout
      setTimeout(() => {
        if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
          this.log('error', 'WebSocket connection timeout', { url: KRAKEN_WEBSOCKET_URL });
          
          // Force close and try to reconnect
          try {
            this.socket.close();
          } catch (err) {
            this.log('error', 'Error closing socket after timeout', { 
              error: err instanceof Error ? err.message : String(err) 
            });
          }
        }
      }, CONNECTION_TIMEOUT);
    } catch (err) {
      this.log('error', 'Error creating WebSocket connection', {
        error: err instanceof Error ? err.message : String(err)
      });
      
      this.updateStatus({
        isConnected: false,
        error: err instanceof Error ? err : new Error('Unknown connection error')
      });
    }
  }

  public disconnect(): void {
    // Clear intervals and timeouts
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Close the socket if it exists
    if (this.socket) {
      try {
        // Only try to send unsubscribe if the socket is open
        if (this.socket.readyState === WebSocket.OPEN && this.symbols.length > 0) {
          const unsubscribeMessage = {
            method: 'unsubscribe',
            params: {
              channel: 'ticker',
              symbol: this.symbols
            }
          };
          
          this.socket.send(JSON.stringify(unsubscribeMessage));
        }
        
        this.socket.close();
      } catch (err) {
        this.log('error', 'Error closing WebSocket', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
      
      this.socket = null;
    }
    
    // Update status
    this.updateStatus({
      isConnected: false,
      error: null
    });
  }

  public updateSymbols(symbols: string[]): void {
    // If symbols haven't changed, do nothing
    if (JSON.stringify(this.symbols) === JSON.stringify(symbols)) {
      return;
    }
    
    this.symbols = symbols;
    
    // If not connected, just update the symbols
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // Unsubscribe from current symbols
    if (this.symbols.length > 0) {
      const unsubscribeMessage = {
        method: 'unsubscribe',
        params: {
          channel: 'ticker',
          symbol: this.symbols
        }
      };
      
      try {
        this.socket.send(JSON.stringify(unsubscribeMessage));
      } catch (err) {
        this.log('error', 'Error sending unsubscribe message', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    
    // Subscribe to new symbols
    if (symbols.length > 0) {
      const subscribeMessage = {
        method: 'subscribe',
        params: {
          channel: 'ticker',
          symbol: symbols
        }
      };
      
      try {
        this.socket.send(JSON.stringify(subscribeMessage));
      } catch (err) {
        this.log('error', 'Error sending subscribe message', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  public getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  private handleOpen(event: Event): void {
    this.log('success', 'WebSocket connected successfully', { url: KRAKEN_WEBSOCKET_URL });
    
    this.updateStatus({
      isConnected: true,
      error: null
    });
    
    this.reconnectAttempts = 0;
    
    // Subscribe to ticker data
    if (this.symbols.length > 0) {
      const subscribeMessage = {
        method: 'subscribe',
        params: {
          channel: 'ticker',
          symbol: this.symbols
        }
      };
      
      try {
        this.socket?.send(JSON.stringify(subscribeMessage));
        this.log('info', 'Sent subscription message', { symbols: this.symbols });
      } catch (err) {
        this.log('error', 'Error sending subscription message', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    
    // Start ping interval
    this.startPingInterval();
    
    // Call onOpen callback if provided
    if (this.options.onOpen) {
      this.options.onOpen();
    }
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== 'string') {
      return;
    }
    
    try {
      const data = JSON.parse(event.data);
      
      // Handle pong responses
      if (data.method === 'pong') {
        this.handlePong(data);
        return;
      }
      
      // Handle heartbeat messages
      if (data.method === 'heartbeat') {
        this.log('info', 'Received heartbeat', { timestamp: Date.now() });
        return;
      }
      
      // Handle subscription status messages
      if (data.method === 'subscribe' || data.method === 'unsubscribe') {
        this.log('info', `${data.method} status`, { result: data.result });
        return;
      }
      
      // Pass the message to the callback
      if (this.options.onMessage) {
        this.options.onMessage(data);
      }
    } catch (err) {
      this.log('error', 'Error parsing WebSocket message', {
        error: err instanceof Error ? err.message : String(err),
        data: event.data.substring(0, 200)
      });
    }
  }

  private handleError(event: Event): void {
    this.log('error', 'WebSocket error', { event: 'error', timestamp: Date.now() });
    
    const error = new Error('WebSocket connection error');
    
    this.updateStatus({
      isConnected: false,
      error
    });
    
    // Call onError callback if provided
    if (this.options.onError) {
      this.options.onError(event);
    }
  }

  private handleClose(event: CloseEvent): void {
    this.log('warning', 'WebSocket closed', {
      code: event.code,
      reason: event.reason || 'No reason provided',
      wasClean: event.wasClean
    });
    
    this.updateStatus({
      isConnected: false,
      error: null
    });
    
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Call onClose callback if provided
    if (this.options.onClose) {
      this.options.onClose(event);
    }
    
    // Attempt to reconnect with exponential backoff
    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts);
      
      this.log('info', 'Attempting to reconnect', {
        attempt: this.reconnectAttempts + 1,
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
        delay
      });
      
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    } else {
      this.log('error', 'Max reconnection attempts reached', {
        attempts: this.reconnectAttempts
      });
      
      this.updateStatus({
        isConnected: false,
        error: new Error('Failed to connect after maximum attempts')
      });
    }
  }

  private startPingInterval(): void {
    // Clear any existing interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    // Set up a new interval
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          // Send ping in the format specified in the requirements
          const pingMessage = {
            method: 'ping',
            req_id: this.pingCounter++
          };
          
          this.socket.send(JSON.stringify(pingMessage));
          
          const now = new Date();
          this.updateStatus({
            lastPingTime: now
          });
          
          this.log('info', 'Sent ping', { 
            req_id: pingMessage.req_id,
            timestamp: now.toISOString()
          });
        } catch (err) {
          this.log('error', 'Error sending ping', {
            error: err instanceof Error ? err.message : String(err)
          });
          
          // If we can't send a ping, the connection might be dead
          if (this.socket.readyState !== WebSocket.OPEN) {
            this.reconnect();
          }
        }
      }
    }, PING_INTERVAL);
  }

  private handlePong(data: any): void {
    const now = new Date();
    
    this.log('info', 'Received pong', { 
      req_id: data.req_id,
      time_in: data.time_in,
      time_out: data.time_out,
      timestamp: now.toISOString()
    });
    
    this.updateStatus({
      lastPongTime: now
    });
  }

  private reconnect(): void {
    this.log('info', 'Manual reconnect initiated', { timestamp: Date.now() });
    
    // Reset reconnect attempts
    this.reconnectAttempts = 0;
    
    // Disconnect and connect again
    this.disconnect();
    this.connect();
  }

  private updateStatus(partialStatus: Partial<ConnectionStatus>): void {
    this.status = {
      ...this.status,
      ...partialStatus
    };
    
    // Call onStatusChange callback if provided
    if (this.options.onStatusChange) {
      this.options.onStatusChange(this.status);
    }
  }

  private log(level: 'info' | 'warning' | 'error' | 'success', message: string, details?: Record<string, any>, errorCode?: string): void {
    // Log to console
    const consoleMethod = 
      level === 'error' ? console.error :
      level === 'warning' ? console.warn :
      level === 'success' ? console.info :
      console.log;
    
    consoleMethod(`[Kraken WebSocket] ${message}`, details || '');
    
    // Call addLog callback if provided
    if (this.options.addLog) {
      this.options.addLog(level, message, details, errorCode);
    }
  }
}