/**
 * HTTP Server - Serves control panel HTML; WebSocket for all API communication
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { generateControlPanelHTML, type ControlPanelConfig } from '../panel/controlPanel';
import { parseTestFile, bundleTestFile, ParsedFile } from '../runner/runner';
import { ReporterEmitter, type Reporter, type Suite, type TestResult as ReporterTestResult, type LogEntry } from '../runner/reporter';
import type { TaskHandler } from '../types';
import type { BrowserMessage, Msg } from '../ws-protocol';

export interface TestServerConfig {
  port?: number;
  testFiles?: string[];
  watchBaseDir?: string;
  reporters?: Reporter[];
  testMode?: boolean;
  snapshot?: boolean;
  tasks?: Record<string, TaskHandler>;
  grep?: RegExp;
  actionTimeout?: number;
  expectTimeout?: number;
  testTimeout?: number;
  retries?: number;
  onGetCookieJar?: () => string;
  onSetCookieJar?: (jar: string | null) => void;
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
  private _getCookieJarCb: (() => string) | undefined;
  private _setCookieJarCb: ((jar: string | null) => void) | undefined;

  constructor(config: TestServerConfig = {}) {
    this.port = config.port ?? 11339;
    this.reporters = config.reporters ?? [];
    this.emitter = new ReporterEmitter();
    for (const r of this.reporters) this.emitter.add(r);
    this.testFileMap = new Map();
    if (config.testFiles) {
      for (const f of config.testFiles) {
        const fileKey = config.watchBaseDir
          ? path.relative(config.watchBaseDir, f).replace(/\\/g, '/')
          : path.basename(f);
        this.testFileMap.set(fileKey, f);
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
    this._getCookieJarCb = config.onGetCookieJar;
    this._setCookieJarCb = config.onSetCookieJar;
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

  removeFile(basename: string): void {
    this.bundledCodeMap.delete(basename);
    this.parsedCache.delete(basename);
    this.testFileMap.delete(basename);
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

        if (req.url === '/about-blank' && req.method === 'GET') {
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
          let msg: BrowserMessage;
          try { msg = JSON.parse(rawData.toString()) as BrowserMessage; } catch { return; }
          this._handleWsMessage(ws, msg);
        });
      });

      this.server.listen(this.port, 'localhost', () => {
        console.log(`\n🧪 Test Control Panel: http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  private _handleWsMessage(ws: WebSocket, msg: BrowserMessage): void {
    const run = (fn: () => void | Promise<void>) => Promise.resolve(fn()).catch(() => {});
    switch (msg.type) {
      case 'run-begin':          run(() => this._onRunBegin(msg)); break;
      case 'run-end':            run(() => this._onRunEnd(msg)); break;
      case 'report':             run(() => this._onReport(msg)); break;
      case 'task':               run(() => this._onTask(ws, msg)); break;
      case 'done':               run(() => this._onDone(msg)); break;
      case 'artifact':           run(() => this._onArtifact(msg)); break;
      case 'save-download':      run(() => this._onSaveDownload(ws, msg)); break;
      case 'get-tests':          run(() => this._onGetTests(ws, msg)); break;
      case 'get-test-source':    run(() => this._onGetTestSource(ws, msg)); break;
      case 'get-cookie-jar':     run(() => this._onGetCookieJar(ws, msg)); break;
      case 'set-cookie-jar':     run(() => this._onSetCookieJar(ws, msg)); break;
      case 'save-storage-state': run(() => this._onSaveStorageState(ws, msg)); break;
      case 'load-storage-state': run(() => this._onLoadStorageState(ws, msg)); break;
    }
  }

  private _onRunBegin(msg: Msg<'run-begin'>): void {
    try {
      const { specs } = msg;
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
  }

  private _onRunEnd(msg: Msg<'run-end'>): void {
    const { passed, failed, total, duration } = msg;
    this.emitter.emitEnd({ status: failed > 0 ? 'failed' : 'passed', passed, failed, total, duration });
  }

  private _onReport(msg: Msg<'report'>): void {
    try {
      for (const t of msg.tests) {
        const testCase = { title: t.name, fullTitle: t.name, file: msg.filename };
        const result: ReporterTestResult = { status: t.passed ? 'passed' : 'failed', duration: t.duration, error: t.error, logs: t.logs };
        this.emitter.emitTestBegin(testCase, result);
        this.emitter.emitTestEnd(testCase, result);
      }
    } catch { /* ignore */ }
  }

  private _onTask(ws: WebSocket, msg: Msg<'task'>): void | Promise<void> {
    const { id, name, payload } = msg;
    const handler = this.tasks[name];
    if (!handler) {
      ws.send(JSON.stringify({ type: 'task-result', id, error: `Task not found: "${name}"` }));
      return;
    }
    return Promise.resolve(handler(payload)).then(result => {
      ws.send(JSON.stringify({ type: 'task-result', id, result: result ?? null }));
    }).catch((err: any) => {
      ws.send(JSON.stringify({ type: 'task-result', id, error: err.message ?? String(err) }));
    });
  }

  private _onDone(msg: Msg<'done'>): void {
    try {
      const { passed, failed } = msg;
      this._doneResolve?.({ passed, failed });
    } catch { this._doneResolve?.({ passed: 0, failed: 1 }); }
  }

  private _onArtifact(msg: Msg<'artifact'>): void {
    try {
      const { name, ext, data } = msg;
      const filename = `${name}.${ext ?? 'png'}`;
      const filePath = path.resolve(process.cwd(), filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
      console.log(`💾 Artifact saved: ${filePath}`);
    } catch { /* ignore */ }
  }

  private _onSaveDownload(ws: WebSocket, msg: Msg<'save-download'>): void {
    const { id, path: filePath, data } = msg;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
      ws.send(JSON.stringify({ id }));
    } catch (err: any) {
      ws.send(JSON.stringify({ id, error: err.message ?? String(err) }));
    }
  }

  private _onGetTests(ws: WebSocket, msg: Msg<'get-tests'>): void {
    const { id } = msg;
    try {
      let parsedFiles: ParsedFile[];
      if (this.testFileMap.size > 0) {
        parsedFiles = Array.from(this.testFileMap.entries()).map(([fileKey, absPath]) => {
          const cached = this.parsedCache.get(fileKey);
          if (cached) return cached;
          const parsed = parseTestFile(absPath);
          parsed.filename = fileKey;
          return parsed;
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
  }

  private _onGetTestSource(ws: WebSocket, msg: Msg<'get-test-source'>): void | Promise<void> {
    const { id, file } = msg;
    const isAbsolutePath = (f: string) => f.startsWith('/') || f.startsWith('\\') || /^[A-Za-z]:/.test(f);
    if (!file || file.includes('..') || file.includes('\\') || isAbsolutePath(file) || (!file.endsWith('.js') && !file.endsWith('.ts'))) {
      ws.send(JSON.stringify({ type: 'test-source', id, error: 'Invalid filename' }));
      return;
    }
    const bundled = this.bundledCodeMap.get(file);
    if (bundled) {
      ws.send(JSON.stringify({ type: 'test-source', id, data: bundled }));
      return;
    }
    const filePath = this.testFileMap.get(file) ?? path.join(__dirname, 'examples', path.basename(file));
    if (!fs.existsSync(filePath)) {
      ws.send(JSON.stringify({ type: 'test-source', id, error: 'Not found' }));
      return;
    }
    return bundleTestFile(filePath).then(code => {
      this.bundledCodeMap.set(file, code);
      ws.send(JSON.stringify({ type: 'test-source', id, data: code }));
    }).catch((err: any) => {
      ws.send(JSON.stringify({ type: 'test-source', id, error: `Bundle error: ${err.message}` }));
    });
  }

  private _onGetCookieJar(ws: WebSocket, msg: Msg<'get-cookie-jar'>): void {
    const { id } = msg;
    try {
      const jar = this._getCookieJarCb ? JSON.parse(this._getCookieJarCb()) : {};
      ws.send(JSON.stringify({ type: 'cookie-jar', id, jar }));
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'cookie-jar', id, error: err.message ?? String(err) }));
    }
  }

  private _onSetCookieJar(ws: WebSocket, msg: Msg<'set-cookie-jar'>): void {
    const { id, jar } = msg;
    try {
      const serialized = jar && Array.isArray((jar as any).cookies) ? JSON.stringify(jar) : null;
      this._setCookieJarCb?.(serialized);
      ws.send(JSON.stringify({ type: 'cookie-jar-set', id }));
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'cookie-jar-set', id, error: err.message ?? String(err) }));
    }
  }

  private _onSaveStorageState(ws: WebSocket, msg: Msg<'save-storage-state'>): void {
    const { id, filePath: ssPath, data } = msg;
    try {
      const resolved = path.resolve(process.cwd(), ssPath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, data, 'utf8');
      ws.send(JSON.stringify({ type: 'storage-state-saved', id }));
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'storage-state-saved', id, error: err.message ?? String(err) }));
    }
  }

  private _onLoadStorageState(ws: WebSocket, msg: Msg<'load-storage-state'>): void {
    const { id, filePath: ssPath } = msg;
    try {
      const resolved = path.resolve(process.cwd(), ssPath);
      const data = fs.readFileSync(resolved, 'utf8');
      ws.send(JSON.stringify({ type: 'storage-state-loaded', id, data }));
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'storage-state-loaded', id, error: err.message ?? String(err) }));
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
