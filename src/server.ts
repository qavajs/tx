/**
 * HTTP Server - Serves control panel HTML and test-runner API
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { generateControlPanelHTML } from './controlPanel';
import { TestRunner, parseTestFile, ParsedFile } from './testRunner';

export class TestServer {
  private server: http.Server | null = null;
  private port: number;
  private testFileMap: Map<string, string>;   // basename → absolute path (from config)
  private bundledCodeMap = new Map<string, string>();  // basename → bundled browser JS
  private parsedCache = new Map<string, ParsedFile>(); // basename → parsed test structure
  private _version = 0;

  constructor(port: number = 3000, testFiles?: string[]) {
    this.port = port;
    this.testFileMap = new Map();
    if (testFiles) {
      for (const f of testFiles) {
        this.testFileMap.set(path.basename(f), f);
      }
    }
  }

  updateFile(basename: string, bundledCode: string, parsed: ParsedFile): void {
    this.bundledCodeMap.set(basename, bundledCode);
    this.parsedCache.set(basename, parsed);
    this._version++;
  }

  start(proxyUrl: string, viewport?: { width: number; height: number }): Promise<void> {
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
          const html = generateControlPanelHTML(proxyUrl, this.port, viewport);
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

        // GET /api/version — monotonic counter incremented on each file update
        if (req.url === '/api/version' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ version: this._version }));
          return;
        }

        // GET /api/tests — list and parse test files
        if (req.url === '/api/tests' && req.method === 'GET') {
          try {
            let parsedFiles: ParsedFile[];
            if (this.parsedCache.size > 0) {
              parsedFiles = Array.from(this.parsedCache.values());
            } else if (this.testFileMap.size > 0) {
              parsedFiles = Array.from(this.testFileMap.values()).map(parseTestFile);
            } else {
              const examplesDir = path.join(__dirname, 'examples');
              parsedFiles = fs.readdirSync(examplesDir)
                .filter(f => f.endsWith('.js'))
                .sort()
                .map(f => parseTestFile(path.join(examplesDir, f)));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(parsedFiles));
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
          if (!file || file.includes('/') || file.includes('\\') || !file.endsWith('.js')) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid filename');
            return;
          }
          // In-memory bundled code takes priority (set by watcher)
          const bundled = this.bundledCodeMap.get(file);
          if (bundled) {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(bundled);
            return;
          }
          // Fall back to file on disk (custom testFiles or examples dir)
          const filePath = this.testFileMap.get(file) ?? path.join(__dirname, 'examples', file);
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

        if (req.url === '/mock' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(generateMockHTML());
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

function generateMockHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Test Automation Server is ready</title>
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; background: #f5f5f7; color: #1c1c1e; }
  h1 { font-size: 22px; font-weight: 600; color: #1c1c1e; }
  p  { margin-top: 8px; font-size: 14px; color: #6e6e73; }
  .wrap { text-align: center; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #34c759;
         display: inline-block; margin-right: 8px; }
</style>
</head>
<body>
  <div class="wrap">
    <h1><span class="dot"></span>Test Automation Server is ready</h1>
    <p>Use <code>page.goto(url)</code> in your tests to navigate here.</p>
  </div>
</body>
</html>`;
}
