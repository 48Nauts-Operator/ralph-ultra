import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Simple HTTP server to serve the remote viewer client
 */
export class RalphHttpServer {
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly clientPath: string;

  constructor(port: number = 7891) {
    this.port = port;
    // Client HTML is in src/remote/client/index.html
    // Use import.meta.url for ES modules
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.clientPath = path.join(__dirname, 'client', 'index.html');
  }

  /**
   * Start the HTTP server
   */
  public start(): void {
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`[RalphHttpServer] Serving remote client on http://127.0.0.1:${this.port}`);
    });

    this.server.on('error', (error: Error) => {
      console.error('[RalphHttpServer] Server error:', error);
    });
  }

  /**
   * Stop the HTTP server
   */
  public stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Handle HTTP request
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Only serve GET requests to /remote or /
    if (
      req.method !== 'GET' ||
      (req.url !== '/remote' && req.url !== '/' && !req.url?.startsWith('/remote?'))
    ) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Check if client file exists
    if (!fs.existsSync(this.clientPath)) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Remote client not found');
      return;
    }

    try {
      // Read and serve the HTML file
      const content = fs.readFileSync(this.clientPath, 'utf-8');

      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });

      res.end(content);
    } catch (error) {
      console.error('[RalphHttpServer] Failed to read client file:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }

  /**
   * Get the server URL
   */
  public getUrl(): string {
    return `http://127.0.0.1:${this.port}/remote`;
  }
}
