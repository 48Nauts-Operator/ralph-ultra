import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getConfigDir, ensureConfigDir } from '@utils/config';

/**
 * Remote connection state
 */
export interface RemoteConnection {
  id: string;
  authenticated: boolean;
  connectedAt: Date;
  lastActivity: Date;
}

/**
 * Server state broadcast
 */
export interface StateUpdate {
  type: 'state';
  data: {
    processState: 'idle' | 'running' | 'stopping';
    selectedStory?: string;
    progress: number;
    elapsedSeconds: number;
  };
}

/**
 * Log line broadcast
 */
export interface LogUpdate {
  type: 'log';
  data: {
    line: string;
    timestamp: Date;
  };
}

/**
 * Progress update broadcast
 */
export interface ProgressUpdate {
  type: 'progress';
  data: {
    completed: number;
    total: number;
    percentage: number;
  };
}

/**
 * Command from remote client
 */
export interface RemoteCommand {
  type: 'command';
  action: 'run' | 'stop' | 'focus' | 'navigate';
  data?: unknown;
}

/**
 * Authentication message
 */
export interface AuthMessage {
  type: 'auth';
  token: string;
}

/**
 * Message types
 */
export type ServerMessage = StateUpdate | LogUpdate | ProgressUpdate;
export type ClientMessage = RemoteCommand | AuthMessage;

/**
 * Ralph Ultra WebSocket server for remote control
 */
export class RalphRemoteServer {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, { ws: WebSocket; info: RemoteConnection }> = new Map();
  private token: string = '';
  private readonly maxConnections = 3;
  private readonly authTimeout = 5000; // 5 seconds
  private readonly port: number;

  constructor(port: number = 7890) {
    this.port = port;
  }

  /**
   * Start the WebSocket server
   */
  public start(): void {
    // Load or generate token
    this.token = this.getOrCreateToken();

    // Create WebSocket server on localhost only (Tailscale handles exposure)
    this.wss = new WebSocketServer({
      host: '127.0.0.1',
      port: this.port,
    });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    this.wss.on('error', (error: Error) => {
      console.error('[RalphRemoteServer] Server error:', error);
    });
  }

  /**
   * Stop the WebSocket server
   */
  public stop(): void {
    if (this.wss) {
      // Close all connections
      this.connections.forEach(({ ws }) => {
        ws.close(1000, 'Server shutting down');
      });
      this.connections.clear();

      // Close server
      this.wss.close();
      this.wss = null;
    }
  }

  /**
   * Get the authentication token
   */
  public getToken(): string {
    return this.token;
  }

  /**
   * Get current connection count
   */
  public getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connection details
   */
  public getConnections(): RemoteConnection[] {
    return Array.from(this.connections.values()).map(({ info }) => info);
  }

  /**
   * Broadcast state update to all authenticated clients
   */
  public broadcastState(state: StateUpdate['data']): void {
    const message: StateUpdate = { type: 'state', data: state };
    this.broadcast(message);
  }

  /**
   * Broadcast log line to all authenticated clients
   */
  public broadcastLog(line: string): void {
    const message: LogUpdate = {
      type: 'log',
      data: { line, timestamp: new Date() },
    };
    this.broadcast(message);
  }

  /**
   * Broadcast progress update to all authenticated clients
   */
  public broadcastProgress(completed: number, total: number): void {
    const message: ProgressUpdate = {
      type: 'progress',
      data: {
        completed,
        total,
        percentage: Math.round((completed / total) * 100),
      },
    };
    this.broadcast(message);
  }

  /**
   * Set command handler
   */
  public onCommand(handler: (command: RemoteCommand) => void): void {
    this.commandHandler = handler;
  }

  private commandHandler?: (command: RemoteCommand) => void;

  /**
   * Broadcast message to all authenticated clients
   */
  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    this.connections.forEach(({ ws, info }) => {
      if (info.authenticated && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket): void {
    const connectionId = crypto.randomBytes(16).toString('hex');

    // Check connection limit
    if (this.connections.size >= this.maxConnections) {
      ws.close(1008, 'Maximum connections reached');
      return;
    }

    // Create connection info
    const info: RemoteConnection = {
      id: connectionId,
      authenticated: false,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };

    this.connections.set(connectionId, { ws, info });

    // Set authentication timeout
    const authTimer = setTimeout(() => {
      if (!info.authenticated) {
        ws.close(1008, 'Authentication timeout');
        this.connections.delete(connectionId);
      }
    }, this.authTimeout);

    // Handle messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        this.handleMessage(connectionId, message);
      } catch (error) {
        console.error('[RalphRemoteServer] Invalid message:', error);
      }
    });

    // Handle close
    ws.on('close', () => {
      clearTimeout(authTimer);
      this.connections.delete(connectionId);
    });

    // Handle errors
    ws.on('error', (error: Error) => {
      console.error('[RalphRemoteServer] Connection error:', error);
      clearTimeout(authTimer);
      this.connections.delete(connectionId);
    });
  }

  /**
   * Handle message from client
   */
  private handleMessage(connectionId: string, message: ClientMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { ws, info } = connection;
    info.lastActivity = new Date();

    // Handle authentication
    if (message.type === 'auth') {
      if (message.token === this.token) {
        info.authenticated = true;
        ws.send(JSON.stringify({ type: 'auth', status: 'success' }));
      } else {
        ws.close(1008, 'Invalid token');
        this.connections.delete(connectionId);
      }
      return;
    }

    // Require authentication for all other messages
    if (!info.authenticated) {
      ws.close(1008, 'Not authenticated');
      this.connections.delete(connectionId);
      return;
    }

    // Handle commands
    if (message.type === 'command') {
      if (this.commandHandler) {
        this.commandHandler(message);
      }
    }
  }

  /**
   * Get or create authentication token
   */
  private getOrCreateToken(): string {
    ensureConfigDir();
    const tokenPath = path.join(getConfigDir(), '.remote-token');

    try {
      // Try to read existing token
      if (fs.existsSync(tokenPath)) {
        return fs.readFileSync(tokenPath, 'utf-8').trim();
      }
    } catch (error) {
      console.error('[RalphRemoteServer] Failed to read token:', error);
    }

    // Generate new token
    const newToken = crypto.randomBytes(32).toString('hex');

    try {
      fs.writeFileSync(tokenPath, newToken, { mode: 0o600 });
    } catch (error) {
      console.error('[RalphRemoteServer] Failed to save token:', error);
    }

    return newToken;
  }
}
