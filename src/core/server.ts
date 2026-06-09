/**
 * HTTP Server - Serves control panel HTML; WebSocket for all API communication
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { generateControlPanelHTML, type ControlPanelConfig } from '../panel/controlPanel';
import { parseTestFile, bundleTestFile, ParsedFile } from '../runner/runner';
import { DEFAULT_CONTROL_PANEL_PORT } from '../constants';
import { ReporterEmitter, type Reporter, type Suite, type TestResult as ReporterTestResult } from '../runner/reporter';
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
  agentProxyUrl?: string;
  onGetCookieJar?: () => string;
  onSetCookieJar?: (jar: string | null) => void;
  onRestartAgent?: () => void | Promise<void>;
  onRunEnd?: () => void;
  testIdAttribute?: string;
}

export class TestServer {
  private server: http.Server | null = null;
  private port: number;
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
  private agentProxyUrl: string | undefined;
  /** Computed in start() — the Hammerhead proxy prefix for the test session (e.g. http://proxy:1836/sessionId/) */
  private _testSessionProxyPrefix: string = '';
  private _doneResolve: ((r: { passed: number; failed: number }) => void) | null = null;
  private _donePromise: Promise<{ passed: number; failed: number }>;
  private _wss: WebSocketServer | null = null;
  /** Fully-identified panel clients (sent hello role=panel or old clients without hello) */
  private _panelClients = new Set<WebSocket>();
  /** The single connected test-browser agent */
  private _testBrowserClient: WebSocket | null = null;
  /** Pending tb-command correlation: id → originating panel WebSocket */
  private _pendingTbCommands = new Map<string, WebSocket>();
  private _getCookieJarCb: (() => string) | undefined;
  private _setCookieJarCb: ((jar: string | null) => void) | undefined;
  private _onRestartAgentCb: (() => void | Promise<void>) | undefined;
  private _onRunEndCb: (() => void) | undefined;
  private _testIdAttribute: string = 'data-testid';

  constructor(config: TestServerConfig = {}) {
    this.port = config.port ?? DEFAULT_CONTROL_PANEL_PORT;
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
    this.agentProxyUrl = config.agentProxyUrl;
    this._getCookieJarCb = config.onGetCookieJar;
    this._setCookieJarCb = config.onSetCookieJar;
    this._onRestartAgentCb = config.onRestartAgent;
    this._onRunEndCb = config.onRunEnd;
    if (config.testIdAttribute) this._testIdAttribute = config.testIdAttribute;
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

  start(proxyUrl: string, viewport?: { width: number; height: number }): Promise<void> {
    // Derive the session proxy prefix from the proxyUrl (which is session/about:blank).
    // e.g. 'http://localhost:1836/sessionId/about:blank' → 'http://localhost:1836/sessionId/'
    this._testSessionProxyPrefix = proxyUrl.replace(/[^/]+$/, '');
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        const url = req.url ?? '/';

        if (url === '/' && req.method === 'GET') {
          const html = generateControlPanelHTML({ proxyUrl, controlPanelPort: this.port, viewport, testMode: this.testMode, snapshot: this.snapshot, grep: this.grep, actionTimeout: this.actionTimeout, expectTimeout: this.expectTimeout, testTimeout: this.testTimeout, retries: this.retries } satisfies ControlPanelConfig);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        }

        if (url === '/controller.js' && req.method === 'GET') {
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

        if (url === '/agent' && req.method === 'GET') {
          const html = generateAgentHTML(this.port, this._testSessionProxyPrefix, this._testIdAttribute);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        }

        if (url === '/agent.js' && req.method === 'GET') {
          const candidates = [
            path.join(__dirname, 'agent.js'),
            path.join(__dirname, 'dist', 'agent.js'),
          ];
          const agentPath = candidates.find(p => fs.existsSync(p));
          if (!agentPath) {
            res.writeHead(503, { 'Content-Type': 'text/plain' });
            res.end('agent.js not found — run: npm run build');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
          res.end(fs.readFileSync(agentPath));
          return;
        }

        if (url === '/about-blank' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(generateMockHTML());
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });

      this._wss = new WebSocketServer({ server: this.server });
      this._wss.on('connection', (ws: WebSocket) => {
        // Hold in staging — wait for hello message to classify role
        let classified = false;
        const classifyTimeout = setTimeout(() => {
          // Treat unclassified client as panel (backward compat)
          if (!classified) {
            classified = true;
            this._addPanelClient(ws);
          }
        }, 3000);

        ws.on('close', () => {
          clearTimeout(classifyTimeout);
          this._panelClients.delete(ws);
          if (this._testBrowserClient === ws) {
            this._testBrowserClient = null;
            // Notify panels the agent disconnected
            this.sendToClients({ type: 'agent-disconnected' });
          }
          // Reject any pending commands from this panel
          for (const [id, originWs] of this._pendingTbCommands) {
            if (originWs === ws) {
              this._pendingTbCommands.delete(id);
            }
          }
        });
        ws.on('error', () => {
          this._panelClients.delete(ws);
          if (this._testBrowserClient === ws) this._testBrowserClient = null;
        });

        ws.on('message', (rawData: Buffer) => {
          let msg: any;
          try { msg = JSON.parse(rawData.toString()); } catch { return; }

          // Handle hello classification
          if (msg.type === 'hello') {
            clearTimeout(classifyTimeout);
            if (!classified) {
              classified = true;
              if (msg.role === 'test-browser') {
                this._testBrowserClient = ws;
                this.sendToClients({ type: 'agent-connected' });
                console.log('[tx] Test browser agent connected');
              } else {
                this._addPanelClient(ws);
              }
            }
            return;
          }

          // If not yet classified, treat as panel
          if (!classified) {
            clearTimeout(classifyTimeout);
            classified = true;
            this._addPanelClient(ws);
          }

          // Route messages based on who sent them
          if (ws === this._testBrowserClient) {
            this._handleAgentMessage(ws, msg);
          } else if (this._panelClients.has(ws)) {
            this._handlePanelMessage(ws, msg);
          }
        });
      });

      this.server.listen(this.port, 'localhost', () => {
        console.log(`\n🧪 Test Control Panel: http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  private _addPanelClient(ws: WebSocket): void {
    this._panelClients.add(ws);
    this._send(ws, { type: 'version', version: this._version });
    // If agent is already connected, notify this panel
    if (this._testBrowserClient) {
      this._send(ws, { type: 'agent-connected' });
    }
  }

  private _handlePanelMessage(ws: WebSocket, msg: any): void {
    // tb-command: forward to agent
    if (msg.type === 'tb-command') {
      const { id } = msg;
      if (!id) return;
      if (!this._testBrowserClient || this._testBrowserClient.readyState !== WebSocket.OPEN) {
        this._send(ws, { type: 'tb-result', id, error: 'Test browser agent not connected' });
        return;
      }
      this._pendingTbCommands.set(id, ws);
      this._send(this._testBrowserClient, msg);
      return;
    }
    // Restart agent browser: tell the agent to reload itself, then spawn a fresh process.
    if (msg.type === 'restart-agent') {
      const agentWs = this._testBrowserClient;
      // Null out immediately so no more agent messages are routed.
      this._testBrowserClient = null;
      this.sendToClients({ type: 'agent-disconnected' });
      if (agentWs) {
        // Tell the agent page to reload before we terminate the socket.
        // Give it ~100 ms to receive the message, then terminate + spawn fresh process.
        this._send(agentWs, { type: 'agent-reload' });
        setTimeout(() => {
          agentWs.terminate();
          if (this._onRestartAgentCb) {
            Promise.resolve(this._onRestartAgentCb()).catch(e => console.error('[tx] restart-agent error:', e));
          }
        }, 100);
      } else if (this._onRestartAgentCb) {
        Promise.resolve(this._onRestartAgentCb()).catch(e => console.error('[tx] restart-agent error:', e));
      }
      return;
    }
    // Regular browser → server messages
    const browserMsg = msg as BrowserMessage;
    this._handleWsMessage(ws, browserMsg);
  }

  private _handleAgentMessage(_ws: WebSocket, msg: any): void {
    if (msg.type === 'tb-result') {
      const { id } = msg;
      if (!id) return;
      const originWs = this._pendingTbCommands.get(id);
      this._pendingTbCommands.delete(id);
      if (originWs && originWs.readyState === WebSocket.OPEN) {
        // Forward result back to the originating panel
        this._send(originWs, msg);
      }
      return;
    }
    if (msg.type === 'tb-event') {
      // Fan-out to all panel clients
      const payload = JSON.stringify(msg);
      for (const client of this._panelClients) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
      }
      return;
    }
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
    const agentWs = this._testBrowserClient;
    if (agentWs) {
      this._testBrowserClient = null;
      this._send(agentWs, { type: 'agent-close' });
      setTimeout(() => {
        agentWs.terminate();
        this.sendToClients({ type: 'agent-disconnected' });
        this._onRunEndCb?.();
      }, 100);
    } else {
      // Agent already disconnected before run-end arrived — still run cleanup
      this._onRunEndCb?.();
    }
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

  /** Send to all panel clients only (not the test-browser agent) */
  sendToClients(msg: object): void {
    const payload = JSON.stringify(msg);
    for (const client of this._panelClients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this._panelClients) client.terminate();
      this._panelClients.clear();
      if (this._testBrowserClient) {
        this._testBrowserClient.terminate();
        this._testBrowserClient = null;
      }
      this._pendingTbCommands.clear();
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

function generateAgentHTML(port: number, proxyPrefix: string, testIdAttribute: string = 'data-testid'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>TX Agent</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #1a1a2e; }
  #tab-container { position: relative; width: 100%; height: 100%; }
  #tab-container iframe { width: 100%; height: 100%; border: none; display: none; position: absolute; top: 0; left: 0; }
</style>
<script>
  window.__AGENT_CONFIG__ = {
    port: ${port},
    proxyPrefix: ${JSON.stringify(proxyPrefix)},
    testIdAttribute: ${JSON.stringify(testIdAttribute)}
  };
</script>
</head>
<body>
<div id="tab-container"></div>
<script src="/agent.js"></script>
</body>
</html>`;
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
