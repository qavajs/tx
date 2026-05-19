/**
 * HTTP Server - Serves control panel HTML
 */

import * as http from 'http';
import { generateControlPanelHTML } from './controlPanel';

export class TestServer {
  private server: http.Server | null = null;
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
  }

  start(proxyUrl: string, targetUrl: string): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        if (req.url === '/' && req.method === 'GET') {
          const html = generateControlPanelHTML(proxyUrl, targetUrl);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      this.server.listen(this.port, 'localhost', () => {
        console.log(`\n🧪 Test Control Panel: http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  getPort(): number {
    return this.port;
  }
}
