/**
 * HTTP Server - Serves control panel HTML and test-runner API
 */

import * as http from 'http';
import { generateControlPanelHTML } from './controlPanel';
import { TestRunner } from './testRunner';

export class TestServer {
  private server: http.Server | null = null;
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
  }

  start(proxyUrl: string, targetUrl: string): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        // CORS headers so the control panel can call the API even when loaded via proxy
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.url === '/' && req.method === 'GET') {
          const html = generateControlPanelHTML(proxyUrl, targetUrl, this.port);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        }

        if (req.url === '/api/run-test' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => (body += chunk));
          req.on('end', async () => {
            try {
              const { code } = JSON.parse(body) as { code: string };
              const runner = new TestRunner();
              const results = await runner.runCode(code);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(results));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
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
