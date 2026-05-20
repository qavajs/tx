/**
 * HTTP Server - Serves control panel HTML and test-runner API
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { generateControlPanelHTML } from './controlPanel';
import { TestRunner, parseTestFile } from './testRunner';

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

        if (req.url === '/panel.js' && req.method === 'GET') {
          // When bundled (node dist/index.js) __dirname = dist/, panel.js is alongside.
          // When running via ts-node from root, look in dist/.
          const candidates = [
            path.join(__dirname, 'panel.js'),
            path.join(__dirname, 'dist', 'panel.js'),
          ];
          const panelPath = candidates.find(p => fs.existsSync(p));
          if (!panelPath) {
            res.writeHead(503, { 'Content-Type': 'text/plain' });
            res.end('panel.js not found — run: npm run build');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
          res.end(fs.readFileSync(panelPath));
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

        // GET /api/tests — list and parse all .js files in examples/
        if (req.url === '/api/tests' && req.method === 'GET') {
          const examplesDir = path.join(__dirname, 'examples');
          try {
            const files = fs.readdirSync(examplesDir)
              .filter(f => f.endsWith('.js'))
              .sort()
              .map(f => parseTestFile(path.join(examplesDir, f)));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(files));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // GET /api/test-source?file=filename.js — serve raw source for browser execution
        if (req.url?.startsWith('/api/test-source') && req.method === 'GET') {
          const qs = new URL(req.url, `http://localhost`).searchParams;
          const file = qs.get('file') ?? '';
          // Reject any path traversal attempt
          if (!file || file.includes('/') || file.includes('\\') || !file.endsWith('.js')) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid filename');
            return;
          }
          const filePath = path.join(__dirname, 'examples', file);
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(content);
          } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
          }
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
