/**
 * HTTP Server - Serves control panel HTML and test-runner API
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { generateControlPanelHTML } from './controlPanel';
import { parseTestFile, bundleTestFile, ParsedFile } from './testRunner';
import { ReporterEmitter, type Reporter, type Suite, type TestResult as ReporterTestResult, type LogEntry } from './reporter';
import type { TaskHandler } from './types';

export class TestServer {
  private server: http.Server | null = null;
  private port: number;
  private testFileMap: Map<string, string>; // basename → absolute path (from config)
  private bundledCodeMap = new Map<string, string>(); // basename → bundled browser JS
  private parsedCache = new Map<string, ParsedFile>(); // basename → parsed test structure
  private _version = 0;
  private reporters: Reporter[];
  private emitter: ReporterEmitter;
  private testMode: boolean;
  private snapshot: boolean;
  private tasks: Record<string, TaskHandler>;
  private grep: RegExp | undefined;
  private actionTimeout: number | undefined;
  private expectTimeout: number | undefined;
  private testTimeout: number | undefined;
  private retries: number | undefined;
  private _doneResolve: ((r: { passed: number; failed: number }) => void) | null = null;
  private _donePromise: Promise<{ passed: number; failed: number }>;

  constructor(port: number = 3000, testFiles?: string[], reporters?: Reporter[], testMode?: boolean, snapshot?: boolean, tasks?: Record<string, TaskHandler>, grep?: RegExp, actionTimeout?: number, expectTimeout?: number, testTimeout?: number, retries?: number) {
    this.port = port;
    this.reporters = reporters ?? [];
    this.emitter = new ReporterEmitter();
    for (const r of this.reporters) this.emitter.add(r);
    this.testFileMap = new Map();
    if (testFiles) {
      for (const f of testFiles) {
        this.testFileMap.set(path.basename(f), f);
      }
    }
    this.testMode = testMode ?? false;
    this.snapshot = snapshot ?? false;
    this.tasks = tasks ?? {};
    this.grep = grep;
    this.actionTimeout = actionTimeout;
    this.expectTimeout = expectTimeout;
    this.testTimeout = testTimeout;
    this.retries = retries;
    this._donePromise = new Promise(resolve => { this._doneResolve = resolve; });
  }

  waitForDone(): Promise<{ passed: number; failed: number }> {
    return this._donePromise;
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
          const html = generateControlPanelHTML(proxyUrl, this.port, viewport, this.testMode, this.snapshot, this.grep, this.actionTimeout, this.expectTimeout, this.testTimeout, this.retries);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        }

        if (req.url === '/controller.js' && req.method === 'GET') {
          // When bundled (node dist/index.js) __dirname = dist/, controller.js is alongside.
          // When running via ts-node from root, look in dist/.
          const candidates = [
            path.join(__dirname, 'controller.js'),
            path.join(__dirname, 'dist', 'controller.js'),
          ];
          const panelPath = candidates.find(p => fs.existsSync(p));
          if (!panelPath) {
            res.writeHead(503, { 'Content-Type': 'text/plain' });
            res.end('controller.js not found — run: npm run build');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
          res.end(fs.readFileSync(panelPath));
          return;
        }

        // POST /api/run-begin — browser signals the start of a run (once per run, not per file)
        if (req.url === '/api/run-begin' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => (body += chunk));
          req.on('end', () => {
            try {
              const { specs } = JSON.parse(body) as {
                specs: Array<{ file: string; tests: string[] | null }>;
              };
              const allTestCases = specs.flatMap(({ file, tests }) => {
                const parsed = this.parsedCache.get(file);
                if (!parsed) return [];
                const cases = parsed.tests.map(t => ({
                  title: t.name,
                  fullTitle: t.suite ? `${t.suite} > ${t.name}` : t.name,
                }));
                return tests === null ? cases : cases.filter(c => tests.includes(c.fullTitle));
              });
              const suite: Suite = { title: '', tests: allTestCases, allTests() { return this.tests; } };
              this.emitter.emitBegin({ testFiles: specs.map(s => s.file) }, suite);
              res.writeHead(204);
              res.end();
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // POST /api/run-end — browser signals the end of a run with cumulative totals
        if (req.url === '/api/run-end' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => (body += chunk));
          req.on('end', () => {
            try {
              const { passed, failed, total, duration } = JSON.parse(body) as {
                passed: number; failed: number; total: number; duration: number;
              };
              this.emitter.emitEnd({ status: failed > 0 ? 'failed' : 'passed', passed, failed, total, duration });
              res.writeHead(204);
              res.end();
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // POST /api/report — receive browser-side test results; fires per-test reporter events
        if (req.url === '/api/report' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => (body += chunk));
          req.on('end', () => {
            try {
              const { tests } = JSON.parse(body) as {
                filename?: string;
                tests: Array<{ name: string; passed: boolean; error?: string; duration: number; logs?: LogEntry[] }>;
              };
              for (const t of tests) {
                const testCase = { title: t.name, fullTitle: t.name };
                const result: ReporterTestResult = { status: t.passed ? 'passed' : 'failed', duration: t.duration, error: t.error, logs: t.logs };
                this.emitter.emitTestBegin(testCase, result);
                this.emitter.emitTestEnd(testCase, result);
              }
              res.writeHead(204);
              res.end();
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // POST /api/task — execute a named Node.js task handler and return the result
        if (req.url === '/api/task' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => (body += chunk));
          req.on('end', async () => {
            try {
              const { name, payload } = JSON.parse(body) as { name: string; payload?: unknown };
              const handler = this.tasks[name];
              if (!handler) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Task not found: "${name}"` }));
                return;
              }
              const result = await Promise.resolve(handler(payload));
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ result: result ?? null }));
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message ?? String(err) }));
            }
          });
          return;
        }

        // POST /api/done — browser signals that autorun completed
        if (req.url === '/api/done' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => (body += chunk));
          req.on('end', () => {
            try {
              const { passed, failed } = JSON.parse(body) as { passed: number; failed: number };
              this._doneResolve?.({ passed, failed });
            } catch { this._doneResolve?.({ passed: 0, failed: 1 }); }
            res.writeHead(204);
            res.end();
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
            if (this.testFileMap.size > 0) {
              // Use cached parse result when available; fall back to on-demand parse
              // so files that failed to bundle still appear in the test list.
              parsedFiles = Array.from(this.testFileMap.values()).map(absPath => {
                const base = path.basename(absPath);
                return this.parsedCache.get(base) ?? parseTestFile(absPath);
              });
            } else if (this.parsedCache.size > 0) {
              parsedFiles = Array.from(this.parsedCache.values());
            } else {
              const examplesDir = path.join(__dirname, 'examples');
              parsedFiles = fs.readdirSync(examplesDir)
                .filter(f => f.endsWith('.js'))
                .sort()
                .map(f => parseTestFile(path.join(examplesDir, f)));
            }
            if (this.grep) {
              const grep = this.grep;
              parsedFiles = parsedFiles
                .map(f => ({ ...f, tests: f.tests.filter(t => {
                  const fullName = t.suite ? `${t.suite} > ${t.name}` : t.name;
                  return grep.test(fullName) || grep.test(t.name) || (t.tags ?? []).some(tag => grep.test(tag));
                }) }))
                .filter(f => f.tests.length > 0);
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
          if (!file || file.includes('/') || file.includes('\\') || (!file.endsWith('.js') && !file.endsWith('.ts'))) {
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
          // Bundle on demand — this path is hit when the watcher hasn't run yet
          // (e.g. no testFiles in config) or when a bundle failed during watch.
          const filePath = this.testFileMap.get(file) ?? path.join(__dirname, 'examples', file);
          if (!fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
          }
          bundleTestFile(filePath).then(code => {
            this.bundledCodeMap.set(file, code);
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(code);
          }).catch((err: any) => {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`Bundle error: ${err.message}`);
          });
          return;
        }

        if (req.url === '/mock' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(generateMockHTML());
          return;
        }

        // POST /api/artifact — receive screenshot (JSON+base64) or video (binary WebM) from browser
        if (req.url?.startsWith('/api/artifact') && req.method === 'POST') {
          const qs = new URL(req.url, 'http://localhost').searchParams;
          const qName = qs.get('name') ?? 'artifact';
          const qExt  = qs.get('ext')  ?? 'bin';
          const ct = req.headers['content-type'] ?? '';
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            try {
              const dir = path.join(process.cwd(), 'test-artifacts');
              fs.mkdirSync(dir, { recursive: true });
              let filename: string;
              let data: Buffer;
              if (ct.includes('application/json')) {
                const body = JSON.parse(Buffer.concat(chunks).toString()) as { name: string; data: string; ext: string };
                filename = `${body.name}.${body.ext ?? 'png'}`;
                data = Buffer.from(body.data, 'base64');
              } else {
                filename = `${qName}.${qExt}`;
                data = Buffer.concat(chunks);
              }
              const filePath = path.join(dir, filename);
              fs.writeFileSync(filePath, data);
              console.log(`${filename.endsWith('.webm') ? '🎥 Video' : '📸 Screenshot'} saved: ${filePath}`);
              res.writeHead(204);
              res.end();
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
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
