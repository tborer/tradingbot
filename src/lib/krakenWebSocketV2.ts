import { WebSocketLog } from '@/contexts/WebSocketLogContext';

// Constants for WebSocket connection management
const PING_INTERVAL = 30000; // 30 seconds as specified in requirements
const DEFAULT_RECONNECT_BASE_DELAY = 1000; // 1 second default
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
  reconnectDelay?: number; // Base delay in ms for reconnection attempts
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
  private reconnectBaseDelay: number;
  private isConnecting: boolean = false; // Flag to track connection in progress
  private connectionTimeoutId: NodeJS.Timeout | null = null;
  private manualDisconnect: boolean = false; // Flag to track if disconnect was called manually

  constructor(options: KrakenWebSocketOptions) {
    this.options = options;
    
    // Ensure symbols is always an array and log it
    this.symbols = Array.isArray(options.symbols) ? options.symbols : [];
    
    // Log the symbols we're initializing with
    if (this.symbols.length > 0) {
      this.log('info', 'Initializing with symbols', { symbols: this.symbols });
    } else {
      this.log('warning', 'Initializing with empty symbols array', {});
    }
    
    this.reconnectBaseDelay = options.reconnectDelay || DEFAULT_RECONNECT_BASE_DELAY;
    
    // Auto-connect if enabled
    if (options.autoConnect) {
      this.connect();
    }
  }

  public connect(): void {
    // Reset the manual disconnect flag when connect is called explicitly
    this.manualDisconnect = false;
    this.log('info', 'Connect requested, resetting manualDisconnect flag', { manualDisconnect: false });
    
    // Check if already connected or connecting
    if (this.isConnecting) {
      this.log('info', 'Connection attempt already in progress, ignoring duplicate connect request', {});
      return;
    }
    
    if (this.socket) {
      // Check if already connected
      if (this.socket.readyState === WebSocket.OPEN) {
        this.log('info', 'WebSocket already connected, ignoring connect request', {
          readyState: this.socket.readyState
        });
        return;
      }
      
      // Check if connection is in progress
      if (this.socket.readyState === WebSocket.CONNECTING) {
        this.log('info', 'WebSocket connection already in progress, ignoring duplicate connect request', {
          readyState: this.socket.readyState
        });
        return;
      }
    }
    
    // Clear any existing connection without setting manualDisconnect flag
    // We'll call our internal _disconnect method instead of disconnect()
    this._disconnect();
    
    try {
      this.isConnecting = true;
      
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
      if (this.connectionTimeoutId) {
        clearTimeout(this.connectionTimeoutId);
      }
      
      this.connectionTimeoutId = setTimeout(() => {
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
          
          this.isConnecting = false;
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
      
      this.isConnecting = false;
    }
  }

  // Internal method to disconnect without setting the manual disconnect flag
  private _disconnect(): void {
    // Clear connection timeout if it exists
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
    
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
    
    // Reset connection state
    this.isConnecting = false;
    
    // Update status
    this.updateStatus({
      isConnected: false,
      error: null
    });
  }

  public disconnect(): void {
    // Set the manual disconnect flag to prevent auto-reconnect
    this.manualDisconnect = true;
    this.log('info', 'Manual disconnect requested', { manualDisconnect: true });
    
    // Use the internal disconnect method
    this._disconnect();
  }

  public updateSymbols(symbols: string[]): void {
    // Log the incoming symbols
    this.log('info', 'Checking for symbol updates', { 
      newSymbols: symbols,
      currentSymbols: this.symbols
    });
    
    // Ensure we have a valid array of symbols
    if (!Array.isArray(symbols)) {
      this.log('error', 'Invalid symbols array provided', { symbols });
      return;
    }
    
    // Filter out any empty strings or invalid symbols
    const validSymbols = symbols.filter(symbol => symbol && typeof symbol === 'string' && symbol.trim() !== '');
    
    if (validSymbols.length === 0) {
      this.log('warning', 'No valid symbols provided for update', { originalSymbols: symbols });
      // Add a default symbol if none are provided
      validSymbols.push('XBT/USD');
      this.log('info', 'Added default symbol XBT/USD', {});
    }
    
    // Check if symbols have actually changed before proceeding
    const currentSymbolsSet = new Set(this.symbols);
    const newSymbolsSet = new Set(validSymbols);
    
    // Quick check for different array lengths
    if (currentSymbolsSet.size !== newSymbolsSet.size) {
      this.log('info', 'Symbol count changed, updating subscriptions', {
        oldCount: currentSymbolsSet.size,
        newCount: newSymbolsSet.size
      });
    } else {
      // Check if all symbols in the new set are already in the current set
      let symbolsChanged = false;
      for (const symbol of newSymbolsSet) {
        if (!currentSymbolsSet.has(symbol)) {
          symbolsChanged = true;
          break;
        }
      }
      
      if (!symbolsChanged) {
        this.log('info', 'Symbols unchanged, skipping update', {});
        return;
      }
      
      this.log('info', 'Symbols changed, updating subscriptions', {});
    }
    
    // Update the stored symbols
    this.symbols = validSymbols;
    this.log('info', 'Updated symbols array', { symbols: this.symbols });
    
    // If not connected, just update the symbols
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.log('info', 'WebSocket not open, symbols updated but not subscribed', {
        readyState: this.socket ? this.socket.readyState : 'null'
      });
      return;
    }
    
    // Unsubscribe from current symbols
    if (currentSymbolsSet.size > 0) {
      const unsubscribeMessage = {
        method: 'unsubscribe',
        params: {
          channel: 'ticker',
          symbol: Array.from(currentSymbolsSet)
        }
      };
      
      try {
        this.socket.send(JSON.stringify(unsubscribeMessage));
        this.log('info', 'Sent unsubscribe message', { 
          message: JSON.stringify(unsubscribeMessage),
          symbols: Array.from(currentSymbolsSet) 
        });
      } catch (err) {
        this.log('error', 'Error sending unsubscribe message', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    
    // Subscribe to new symbols using the exact format specified in requirements
    if (validSymbols.length > 0) {
      const subscribeMessage = {
        method: 'subscribe',
        params: {
          channel: 'ticker',
          symbol: validSymbols
        }
      };
      
      try {
        this.socket.send(JSON.stringify(subscribeMessage));
        this.log('info', 'Sent subscribe message', { 
          message: JSON.stringify(subscribeMessage),
          symbols: validSymbols 
        });
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
    // Clear connection timeout if it exists
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
    
    this.log('success', 'WebSocket connected successfully', { url: KRAKEN_WEBSOCKET_URL });
    
    // Reset connection state
    this.isConnecting = false;
    
    this.updateStatus({
      isConnected: true,
      error: null
    });
    
    this.reconnectAttempts = 0;
    
    // Validate symbols array before subscription
    if (!Array.isArray(this.symbols)) {
      this.log('error', 'Invalid symbols array before subscription', { symbols: this.symbols });
      this.symbols = [];
    }
    
    // Filter out any empty strings or invalid symbols
    const validSymbols = this.symbols.filter(symbol => symbol && typeof symbol === 'string' && symbol.trim() !== '');
    
    if (validSymbols.length === 0) {
      this.log('warning', 'No valid symbols available for subscription', { originalSymbols: this.symbols });
      // Add a default symbol if none are provided
      validSymbols.push('XBT/USD');
      this.symbols = validSymbols;
      this.log('info', 'Added default symbol XBT/USD for subscription', {});
    }
    
    // Delay subscription slightly to ensure connection is fully established
    setTimeout(() => {
      // Subscribe to ticker data using the exact format specified in requirements
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
          this.log('info', 'Sent initial subscription message', { 
            message: JSON.stringify(subscribeMessage),
            symbols: this.symbols 
          });
        } catch (err) {
          this.log('error', 'Error sending initial subscription message', {
            error: err instanceof Error ? err.message : String(err)
          });
        }
      } else {
        // If no symbols are provided, send a ping to establish the connection
        const pingMessage = {
          method: 'ping',
          req_id: this.pingCounter++
        };
        
        try {
          this.socket?.send(JSON.stringify(pingMessage));
          this.log('info', 'No symbols provided, sent ping to establish connection', { 
            req_id: pingMessage.req_id
          });
        } catch (err) {
          this.log('error', 'Error sending ping', {
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
    }, 500);
    
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
      // Log the raw message for debugging (truncated for readability)
      const truncatedMessage = event.data.length > 200 
        ? event.data.substring(0, 200) + "..." 
        : event.data;
      this.log('info', 'Received raw message', { message: truncatedMessage });
      
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
      
      // Handle status updates (connection confirmation)
      if (data.channel === 'status' && data.type === 'update' && Array.isArray(data.data)) {
        this.log('success', 'Received status update from Kraken', { 
          status: data.data[0],
          connection_id: data.data[0]?.connection_id,
          api_version: data.data[0]?.api_version,
          system: data.data[0]?.system
        });
        
        // If we receive a status message with system: online, the connection is fully established
        if (data.data[0]?.system === 'online') {
          this.log('success', 'Kraken WebSocket connection fully established', {
            connection_id: data.data[0]?.connection_id,
            api_version: data.data[0]?.api_version
          });
        }
        
        return;
      }
      
      // Handle ticker data (snapshot or update)
      if (data.channel === 'ticker' && (data.type === 'snapshot' || data.type === 'update') && Array.isArray(data.data)) {
        this.log('info', `Received ticker ${data.type}`, { 
          symbols: data.data.map((item: any) => item.symbol).join(', '),
          timestamp: Date.now()
        });
      }
      
      // Handle subscription status messages
      if (data.method === 'subscribe' || data.method === 'unsubscribe') {
        this.log('info', `${data.method} status`, { result: data.result });
        
        // If subscription was successful, log it
        if (data.method === 'subscribe' && data.result === 'success') {
          this.log('success', 'Successfully subscribed to Kraken channels', {
            params: data.params
          });
        }
        
        return;
      }
      
      // Handle error messages
      if (data.error) {
        this.log('error', 'Received error from Kraken WebSocket', {
          error: data.error,
          message: data.message || 'No message provided'
        });
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
    
    // Reset connection state
    this.isConnecting = false;
    
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
    // Clear connection timeout if it exists
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
    
    this.log('warning', 'WebSocket closed', {
      code: event.code,
      reason: event.reason || 'No reason provided',
      wasClean: event.wasClean,
      manualDisconnect: this.manualDisconnect
    });
    
    // Reset connection state
    this.isConnecting = false;
    
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
    
    // Only attempt to reconnect if:
    // 1. The connection was not manually disconnected
    // 2. We haven't exceeded the maximum number of reconnect attempts
    if (!this.manualDisconnect && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts);
      
      this.log('info', 'Attempting to reconnect', {
        attempt: this.reconnectAttempts + 1,
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
        delay,
        baseDelay: this.reconnectBaseDelay,
        manualDisconnect: this.manualDisconnect
      });
      
      // Clear any existing reconnect timeout
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
      }
      
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    } else if (this.manualDisconnect) {
      this.log('info', 'Not attempting to reconnect because WebSocket was manually disconnected', {
        manualDisconnect: this.manualDisconnect
      });
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
          // Send ping in the exact format specified in the requirements
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
          
          // Set a timeout to check if we received a pong response
          const pongTimeoutId = setTimeout(() => {
            // If the last pong time is older than the last ping time, we didn't receive a pong
            if (!this.status.lastPongTime || 
                (this.status.lastPingTime && this.status.lastPongTime < this.status.lastPingTime)) {
              this.log('warning', 'No pong response received, reconnecting...', {
                lastPingTime: this.status.lastPingTime?.toISOString(),
                lastPongTime: this.status.lastPongTime?.toISOString()
              });
              this.reconnect();
            }
          }, 5000); // Wait 5 seconds for pong response
          
          // Store the timeout ID so it can be cleared when we receive a pong
          (this.socket as any)._pongTimeoutId = pongTimeoutId;
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
    
    // Clear the pong timeout if it exists
    if (this.socket && (this.socket as any)._pongTimeoutId) {
      clearTimeout((this.socket as any)._pongTimeoutId);
      (this.socket as any)._pongTimeoutId = null;
    }
  }

  private reconnect(): void {
    // Check if already connecting
    if (this.isConnecting) {
      this.log('info', 'Connection attempt already in progress, ignoring reconnect request', {});
      return;
    }
    
    // Check if already connected
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.log('info', 'WebSocket already connected, ignoring reconnect request', {
        readyState: this.socket.readyState
      });
      return;
    }
    
    // Don't reconnect if manually disconnected
    if (this.manualDisconnect) {
      this.log('info', 'Not reconnecting because WebSocket was manually disconnected', {
        manualDisconnect: this.manualDisconnect
      });
      return;
    }
    
    this.log('info', 'Manual reconnect initiated', { timestamp: Date.now() });
    
    // Reset reconnect attempts
    this.reconnectAttempts = 0;
    
    // Disconnect without setting manualDisconnect flag and connect again
    this._disconnect();
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
    // Enhanced logging with more context
    const timestamp = new Date().toISOString();
    const connectionState = this.socket ? 
      ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][this.socket.readyState] : 
      'NOT_INITIALIZED';
    
    // Add connection state and timestamp to all logs
    const enhancedDetails = {
      ...(details || {}),
      connectionState,
      timestamp,
      reconnectAttempts: this.reconnectAttempts,
      isConnecting: this.isConnecting,
      manualDisconnect: this.manualDisconnect,
      symbols: this.symbols
    };
    
    // Log to console only for errors or warnings to reduce console noise
    if (level === 'error' || level === 'warning') {
      const consoleMethod = level === 'error' ? console.error : console.warn;
      consoleMethod(`[Kraken WebSocket] ${message} [${connectionState}]`, enhancedDetails);
    }
    
    // Call addLog callback if provided
    // We don't need to check isLoggingEnabled here as the WebSocketLogContext's addLog function
    // already handles that check internally
    if (this.options.addLog) {
      // Only pass heartbeat messages if they're in the details and it's a string
      // This helps reduce the volume of messages being processed
      if (details?.data && 
          typeof details.data === 'string' && 
          details.data.includes('"channel":"heartbeat"')) {
        // Skip heartbeat messages to reduce log volume
        return;
      }
      
      this.options.addLog(level, message, enhancedDetails, errorCode);
    }
  }
}