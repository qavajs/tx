/**
 * HTTP Server - Serves control panel HTML; WebSocket for all API communication
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import { generateControlPanelHTML, type ControlPanelConfig } from './controlPanel';
import { parseTestFile, bundleTestFile, ParsedFile } from './testRunner';
import { ReporterEmitter, type Reporter, type Suite, type TestResult as ReporterTestResult, type LogEntry } from './reporter';
import type { TaskHandler } from './types';

export interface TestServerConfig {
  port?: number;
  testFiles?: string[];
  reporters?: Reporter[];
  testMode?: boolean;
  snapshot?: boolean;
  tasks?: Record<string, TaskHandler>;
  grep?: RegExp;
  actionTimeout?: number;
  expectTimeout?: number;
  testTimeout?: number;
  retries?: number;
}

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
  private _wss: WebSocketServer | null = null;
  private _wsClients = new Set<WebSocket>();

  constructor(config: TestServerConfig = {}) {
    this.port = config.port ?? 11339;
    this.reporters = config.reporters ?? [];
    this.emitter = new ReporterEmitter();
    for (const r of this.reporters) this.emitter.add(r);
    this.testFileMap = new Map();
    if (config.testFiles) {
      for (const f of config.testFiles) {
        this.testFileMap.set(path.basename(f), f);
      }
    }
    this.testMode = config.testMode ?? false;
    this.snapshot = config.snapshot ?? false;
    this.tasks = config.tasks ?? {};
    this.grep = config.grep;
    this.actionTimeout = config.actionTimeout;
    this.expectTimeout = config.expectTimeout;
    this.testTimeout = config.testTimeout;
    this.retries = config.retries;
    this._donePromise = new Promise(resolve => { this._doneResolve = resolve; });
  }

  waitForDone(): Promise<{ passed: number; failed: number }> {
    return this._donePromise;
  }

  updateFile(basename: string, bundledCode: string, parsed: ParsedFile): void {
    this.bundledCodeMap.set(basename, bundledCode);
    this.parsedCache.set(basename, parsed);
    this._version++;
    const msg = JSON.stringify({ type: 'version', version: this._version });
    for (const client of this._wsClients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }

  start(proxyUrl: string, viewport?: { width: number; height: number }): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        if (req.url === '/' && req.method === 'GET') {
          const html = generateControlPanelHTML({ proxyUrl, controlPanelPort: this.port, viewport, testMode: this.testMode, snapshot: this.snapshot, grep: this.grep, actionTimeout: this.actionTimeout, expectTimeout: this.expectTimeout, testTimeout: this.testTimeout, retries: this.retries } satisfies ControlPanelConfig);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        }

        if (req.url === '/controller.js' && req.method === 'GET') {
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

        if (req.url === '/mock' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(generateMockHTML());
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });

      this._wss = new WebSocketServer({ server: this.server });
      this._wss.on('connection', (ws: WebSocket) => {
        this._wsClients.add(ws);
        ws.send(JSON.stringify({ type: 'version', version: this._version }));

        ws.on('close', () => this._wsClients.delete(ws));

        ws.on('message', (rawData: Buffer) => {
          let msg: any;
          try { msg = JSON.parse(rawData.toString()); } catch { return; }
          this._handleWsMessage(ws, msg);
        });
      });

      this.server.listen(this.port, 'localhost', () => {
        console.log(`\n🧪 Test Control Panel: http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  private _handleWsMessage(ws: WebSocket, msg: any): void {
    switch (msg.type) {
      case 'run-begin': {
        try {
          const specs = msg.specs as Array<{ file: string; tests: string[] | null }>;
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
        } catch { /* ignore */ }
        break;
      }

      case 'run-end': {
        const { passed, failed, total, duration } = msg as { passed: number; failed: number; total: number; duration: number };
        this.emitter.emitEnd({ status: failed > 0 ? 'failed' : 'passed', passed, failed, total, duration });
        break;
      }

      case 'report': {
        try {
          const tests = msg.tests as Array<{ name: string; passed: boolean; error?: string; duration: number; logs?: LogEntry[] }>;
          for (const t of tests) {
            const testCase = { title: t.name, fullTitle: t.name };
            const result: ReporterTestResult = { status: t.passed ? 'passed' : 'failed', duration: t.duration, error: t.error, logs: t.logs };
            this.emitter.emitTestBegin(testCase, result);
            this.emitter.emitTestEnd(testCase, result);
          }
        } catch { /* ignore */ }
        break;
      }

      case 'task': {
        const { id, name, payload } = msg as { id: string; name: string; payload?: unknown };
        const handler = this.tasks[name];
        if (!handler) {
          ws.send(JSON.stringify({ type: 'task-result', id, error: `Task not found: "${name}"` }));
          break;
        }
        Promise.resolve(handler(payload)).then(result => {
          ws.send(JSON.stringify({ type: 'task-result', id, result: result ?? null }));
        }).catch((err: any) => {
          ws.send(JSON.stringify({ type: 'task-result', id, error: err.message ?? String(err) }));
        });
        break;
      }

      case 'done': {
        try {
          const { passed, failed } = msg as { passed: number; failed: number };
          this._doneResolve?.({ passed, failed });
        } catch { this._doneResolve?.({ passed: 0, failed: 1 }); }
        break;
      }

      case 'artifact': {
        try {
          const { name, ext, data } = msg as { name: string; ext: string; data: string };
          const dir = path.join(process.cwd(), 'test-artifacts');
          fs.mkdirSync(dir, { recursive: true });
          const filename = `${name}.${ext ?? 'png'}`;
          const filePath = path.join(dir, filename);
          fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
          console.log(`📸 Screenshot saved: ${filePath}`);
        } catch { /* ignore */ }
        break;
      }

      case 'get-tests': {
        const { id } = msg as { id: string };
        try {
          let parsedFiles: ParsedFile[];
          if (this.testFileMap.size > 0) {
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
          ws.send(JSON.stringify({ type: 'tests', id, data: parsedFiles }));
        } catch (err: any) {
          ws.send(JSON.stringify({ type: 'tests', id, error: err.message }));
        }
        break;
      }

      case 'get-test-source': {
        const { id, file } = msg as { id: string; file: string };
        if (!file || file.includes('/') || file.includes('\\') || (!file.endsWith('.js') && !file.endsWith('.ts'))) {
          ws.send(JSON.stringify({ type: 'test-source', id, error: 'Invalid filename' }));
          break;
        }
        const bundled = this.bundledCodeMap.get(file);
        if (bundled) {
          ws.send(JSON.stringify({ type: 'test-source', id, data: bundled }));
          break;
        }
        const filePath = this.testFileMap.get(file) ?? path.join(__dirname, 'examples', file);
        if (!fs.existsSync(filePath)) {
          ws.send(JSON.stringify({ type: 'test-source', id, error: 'Not found' }));
          break;
        }
        bundleTestFile(filePath).then(code => {
          this.bundledCodeMap.set(file, code);
          ws.send(JSON.stringify({ type: 'test-source', id, data: code }));
        }).catch((err: any) => {
          ws.send(JSON.stringify({ type: 'test-source', id, error: `Bundle error: ${err.message}` }));
        });
        break;
      }
    }
  }

  sendToClients(msg: object): void {
    const payload = JSON.stringify(msg);
    for (const client of this._wsClients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this._wsClients) {
        client.terminate();
      }
      this._wsClients.clear();
      if (this._wss) {
        this._wss.close();
        this._wss = null;
      }
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
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
