/**
 * HTTP Server - Serves control panel HTML; WebSocket for all API communication
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { generateControlPanelHTML } from '../panel/controlPanel';
import { parseTestFile, bundleTestFile, ParsedFile } from '../runner/runner';
import { ReporterEmitter, type Reporter, type Suite, type TestResult as ReporterTestResult } from '../runner/reporter';
import type { TaskHandler } from '../types';
import type { BrowserMessage, Msg } from '../ws-protocol';

export interface TestServerConfig {
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
  private testFileMap: Map<string, string>; // relPath (or basename) → absolute path
  private bundledCodeMap = new Map<string, string>(); // relPath (or basename) → bundled browser JS
  private parsedCache = new Map<string, ParsedFile>(); // relPath (or basename) → parsed test structure
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
  private _proxyUrl: string = '';
  private _wsUrl: string = '';
  private _apiBase: string = '';
  private _viewport: { width: number; height: number } | undefined;

  constructor(config: TestServerConfig = {}) {
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
    this.sendToClients({ type: 'version', version: this._version });
  }

  removeFile(basename: string): void {
    this.bundledCodeMap.delete(basename);
    this.parsedCache.delete(basename);
    this.testFileMap.delete(basename);
    this._version++;
    this.sendToClients({ type: 'version', version: this._version });
  }

  startOnProxy(
    proxyUrl: string,
    viewport: { width: number; height: number } | undefined,
    wsUrl: string,
    apiBase: string,
  ): void {
    this._proxyUrl = proxyUrl;
    this._viewport = viewport;
    this._wsUrl = wsUrl;
    this._apiBase = apiBase;

    this._wss = new WebSocketServer({ noServer: true });
    this._wss.on('connection', (ws: WebSocket) => {
      this._wsClients.add(ws);
      this._send(ws, { type: 'version', version: this._version });
      ws.on('close', () => this._wsClients.delete(ws));
      ws.on('error', () => this._wsClients.delete(ws));
      ws.on('message', (rawData: Buffer) => {
        let msg: BrowserMessage;
        try { msg = JSON.parse(rawData.toString()) as BrowserMessage; } catch { return; }
        this._handleWsMessage(ws, msg);
      });
    });
  }

  handleWsUpgrade(req: http.IncomingMessage, socket: any): void {
    this._wss?.handleUpgrade(req, socket, Buffer.alloc(0), (ws) => {
      this._wss!.emit('connection', ws, req);
    });
  }

  handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const pathname = (req.url ?? '').split('?')[0];

    if (pathname === '/tx' && req.method === 'GET') {
      const html = generateControlPanelHTML({
        proxyUrl: this._proxyUrl,
        wsUrl: this._wsUrl,
        apiBase: this._apiBase,
        viewport: this._viewport,
        testMode: this.testMode,
        snapshot: this.snapshot,
        grep: this.grep,
        actionTimeout: this.actionTimeout,
        expectTimeout: this.expectTimeout,
        testTimeout: this.testTimeout,
        retries: this.retries,
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return true;
    }

    if (pathname === '/controller.js' && req.method === 'GET') {
      const candidates = [
        path.join(__dirname, 'controller.js'),
        path.join(__dirname, 'dist', 'controller.js'),
      ];
      const panelPath = candidates.find(p => fs.existsSync(p));
      if (!panelPath) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('controller.js not found — run: npm run build');
        return true;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(fs.readFileSync(panelPath));
      return true;
    }

    if (pathname === '/tx/about-blank' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(generateMockHTML());
      return true;
    }

    return false;
  }

  private _handleWsMessage(ws: WebSocket, msg: BrowserMessage): void {
    const m = msg as any;
    const handlers: Partial<Record<BrowserMessage['type'], () => void | Promise<void>>> = {
      'run-begin':          () => this._onRunBegin(m),
      'run-end':            () => this._onRunEnd(m),
      'report':             () => this._onReport(m),
      'task':               () => this._onTask(ws, m),
      'done':               () => this._onDone(m),
      'artifact':           () => this._onArtifact(m),
      'save-download':      () => this._onSaveDownload(ws, m),
      'get-tests':          () => this._onGetTests(ws, m),
      'get-test-source':    () => this._onGetTestSource(ws, m),
      'get-cookie-jar':     () => this._onGetCookieJar(ws, m),
      'set-cookie-jar':     () => this._onSetCookieJar(ws, m),
      'save-storage-state': () => this._onSaveStorageState(ws, m),
      'load-storage-state': () => this._onLoadStorageState(ws, m),
    };
    const handler = handlers[msg.type];
    if (handler) Promise.resolve(handler()).catch(() => {});
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
    } catch (e) { console.error('[tx] run-begin error:', e); }
  }

  private _onRunEnd(msg: Msg<'run-end'>): void {
    const { passed, failed, total, duration } = msg;
    this.emitter.emitEnd({ status: failed > 0 ? 'failed' : 'passed', passed, failed, total, duration });
  }

  private _onReport(msg: Msg<'report'>): void {
    try {
      for (const t of msg.tests) {
        const testCase = { title: t.name, fullTitle: t.name, file: msg.filename };
        const result: ReporterTestResult = { status: t.passed ? 'passed' : 'failed', duration: t.duration, error: t.error, logs: t.logs, retry: t.retry };
        this.emitter.emitTestBegin(testCase, result);
        this.emitter.emitTestEnd(testCase, result);
      }
    } catch (e) { console.error('[tx] report error:', e); }
  }

  private _onTask(ws: WebSocket, msg: Msg<'task'>): void | Promise<void> {
    const { id, name, payload } = msg;
    const handler = this.tasks[name];
    if (!handler) {
      this._send(ws, { type: 'task-result', id, error: `Task not found: "${name}"` });
      return;
    }
    return Promise.resolve(handler(payload)).then(result => {
      this._send(ws, { type: 'task-result', id, result: result ?? null });
    }).catch((err: any) => {
      this._send(ws, { type: 'task-result', id, error: err.message ?? String(err) });
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
    } catch (e) { console.error('[tx] artifact error:', e); }
  }

  private _onSaveDownload(ws: WebSocket, msg: Msg<'save-download'>): void {
    const { id, path: filePath, data } = msg;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
      this._send(ws, { id });
    } catch (err: any) {
      this._send(ws, { id, error: err.message ?? String(err) });
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
      this._send(ws, { type: 'tests', id, data: parsedFiles });
    } catch (err: any) {
      this._send(ws, { type: 'tests', id, error: (err as any).message });
    }
  }

  private _onGetTestSource(ws: WebSocket, msg: Msg<'get-test-source'>): void | Promise<void> {
    const { id, file } = msg;
    const isAbsolutePath = (f: string) => f.startsWith('/') || f.startsWith('\\') || /^[A-Za-z]:/.test(f);
    if (!file || file.includes('..') || file.includes('\\') || isAbsolutePath(file)) {
      this._send(ws, { type: 'test-source', id, error: 'Invalid filename' });
      return;
    }
    const bundled = this.bundledCodeMap.get(file);
    if (bundled) {
      this._send(ws, { type: 'test-source', id, data: bundled });
      return;
    }
    const filePath = this.testFileMap.get(file) ?? path.join(__dirname, 'examples', path.basename(file));
    if (!fs.existsSync(filePath)) {
      this._send(ws, { type: 'test-source', id, error: 'Not found' });
      return;
    }
    return bundleTestFile(filePath).then(code => {
      this.bundledCodeMap.set(file, code);
      this._send(ws, { type: 'test-source', id, data: code });
    }).catch((err: any) => {
      this._send(ws, { type: 'test-source', id, error: `Bundle error: ${err.message}` });
    });
  }

  private _onGetCookieJar(ws: WebSocket, msg: Msg<'get-cookie-jar'>): void {
    const { id } = msg;
    try {
      const jar = this._getCookieJarCb ? JSON.parse(this._getCookieJarCb()) : {};
      this._send(ws, { type: 'cookie-jar', id, jar });
    } catch (err: any) {
      this._send(ws, { type: 'cookie-jar', id, error: err.message ?? String(err) });
    }
  }

  private _onSetCookieJar(ws: WebSocket, msg: Msg<'set-cookie-jar'>): void {
    const { id, jar } = msg;
    try {
      const serialized = jar && Array.isArray((jar as any).cookies) ? JSON.stringify(jar) : null;
      this._setCookieJarCb?.(serialized);
      this._send(ws, { type: 'cookie-jar-set', id });
    } catch (err: any) {
      this._send(ws, { type: 'cookie-jar-set', id, error: err.message ?? String(err) });
    }
  }

  private _onSaveStorageState(ws: WebSocket, msg: Msg<'save-storage-state'>): void {
    const { id, filePath: ssPath, data } = msg;
    try {
      const resolved = path.resolve(process.cwd(), ssPath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, data, 'utf8');
      this._send(ws, { type: 'storage-state-saved', id });
    } catch (err: any) {
      this._send(ws, { type: 'storage-state-saved', id, error: err.message ?? String(err) });
    }
  }

  private _onLoadStorageState(ws: WebSocket, msg: Msg<'load-storage-state'>): void {
    const { id, filePath: ssPath } = msg;
    try {
      const resolved = path.resolve(process.cwd(), ssPath);
      const data = fs.readFileSync(resolved, 'utf8');
      this._send(ws, { type: 'storage-state-loaded', id, data });
    } catch (err: any) {
      this._send(ws, { type: 'storage-state-loaded', id, error: err.message ?? String(err) });
    }
  }

  private _send(ws: WebSocket, msg: object): void {
    try { ws.send(JSON.stringify(msg)); } catch { /* ignore sends on closing sockets */ }
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
