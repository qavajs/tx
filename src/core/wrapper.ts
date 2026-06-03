/**
 * Tx Wrapper - Main orchestrator
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as net from 'node:net';
import { execSync, spawn, ChildProcess } from 'node:child_process';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const hammerhead = require('testcafe-hammerhead');

// Hammerhead passes X-Frame-Options: DENY/SAMEORIGIN through unchanged, which
// blocks the proxied page from loading in our iframe.  Strip those values so
// the browser does not enforce them.  ALLOW-FROM is still rewritten by the
// original transform below.
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const transforms = require('testcafe-hammerhead/lib/request-pipeline/header-transforms/transforms');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const headerNames = require('testcafe-hammerhead/lib/request-pipeline/builtin-header-names');
  const origXFrame = transforms.responseTransforms[headerNames.xFrameOptions];
  transforms.responseTransforms[headerNames.xFrameOptions] = (src: string, ctx: unknown) => {
    const upper = src.trim().toUpperCase();
    if (upper === 'DENY' || upper === 'SAMEORIGIN') return undefined;
    return origXFrame(src, ctx);
  };

  transforms.requestTransforms['accept-encoding'] = (src: string) => {
    return src.split(', ').filter(e => e !== 'zstd').join(', ')
  }
}

// ── Browser launch helpers ─────────────────────────────────────────────────────

type Platform = 'darwin' | 'linux' | 'win32';

const BROWSER_PATHS: Record<string, Record<Platform, string[]>> = {
  chrome: {
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    linux:  ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'],
    win32:  [
      '%PROGRAMFILES%\\Google\\Chrome\\Application\\chrome.exe',
      '%PROGRAMFILES(X86)%\\Google\\Chrome\\Application\\chrome.exe',
      '%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe',
    ],
  },
  chromium: {
    darwin: ['/Applications/Chromium.app/Contents/MacOS/Chromium'],
    linux:  ['chromium-browser', 'chromium', 'google-chrome'],
    win32:  ['%PROGRAMFILES%\\Chromium\\Application\\chrome.exe'],
  },
  firefox: {
    darwin: ['/Applications/Firefox.app/Contents/MacOS/firefox'],
    linux:  ['firefox', 'firefox-esr'],
    win32:  [
      '%PROGRAMFILES%\\Mozilla Firefox\\firefox.exe',
      '%PROGRAMFILES(X86)%\\Mozilla Firefox\\firefox.exe',
    ],
  },
  edge: {
    darwin: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    linux:  ['microsoft-edge', 'microsoft-edge-stable'],
    win32:  [
      '%PROGRAMFILES(X86)%\\Microsoft\\Edge\\Application\\msedge.exe',
      '%PROGRAMFILES%\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
  },
  safari: {
    darwin: ['/Applications/Safari.app/Contents/MacOS/Safari'],
    linux:  [],
    win32:  [],
  },
};

const DEFAULT_BROWSER_ORDER = ['chrome', 'chromium', 'firefox', 'edge', 'safari'];

function expandEnvVars(s: string): string {
  return s.replace(/%([^%]+)%/g, (_, k) => process.env[k] ?? '');
}

function resolveCandidate(candidate: string, platform: Platform): string | null {
  if (platform === 'linux') {
    try {
      const p = execSync(`which ${candidate} 2>/dev/null`).toString().trim();
      return p || null;
    } catch { return null; }
  }
  const resolved = expandEnvVars(candidate);
  return fs.existsSync(resolved) ? resolved : null;
}

function findBrowserExecutable(browser?: string): string | null {
  const platform = process.platform as Platform;

  if (browser && (browser.startsWith('/') || /^[A-Za-z]:\\/.test(browser))) {
    return fs.existsSync(browser) ? browser : null;
  }

  const tryKey = (key: string): string | null => {
    const entry = BROWSER_PATHS[key];
    if (!entry) return null;
    for (const candidate of (entry[platform] ?? [])) {
      const resolved = resolveCandidate(candidate, platform);
      if (resolved) return resolved;
    }
    return null;
  };

  if (browser) {
    const result = tryKey(browser.toLowerCase());
    if (result) return result;
    // Treat the value as a raw binary name on Linux
    if (platform === 'linux') {
      try {
        const p = execSync(`which ${browser} 2>/dev/null`).toString().trim();
        if (p) return p;
      } catch { /* not found */ }
    }
    return null;
  }

  for (const key of DEFAULT_BROWSER_ORDER) {
    const result = tryKey(key);
    if (result) return result;
  }
  return null;
}

function headlessArgs(exePath: string): string[] {
  const lower = exePath.toLowerCase();
  if (lower.includes('firefox')) return ['--headless', '--no-remote', '--new-instance'];
  if (lower.includes('safari')) return [];
  // Chrome, Chromium, Edge (Chromium-based)
  return ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage'];
}

import { TestServer } from './server';
import { startWatcher } from '../runner/watcher';
import { setPreprocessor } from '../runner/runner';
import { ProxyCollector } from '../proxy/collector';
import type { Reporter } from '../runner/reporter';
import type { TxConfig } from '../types';
import { DEFAULT_PROXY_PORT_1, DEFAULT_PROXY_PORT_2, DEFAULT_CONTROL_PANEL_PORT } from '../constants';

type TxWrapperConfig = Omit<TxConfig, 'reporters' | 'profiles' | 'shard' | 'grep' | 'testFiles'> & {
  reporters?: Reporter[];
  testFiles?: string[];
  testPatterns?: string[];
  watchBaseDir?: string;
  grep?: RegExp;
};

function checkPortAvailable(port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${port} is already in use on ${host}. ` +
          `Set a different port in your config (port1, port2, controlPanelPort).`
        ));
      } else {
        reject(err);
      }
    });
    srv.once('listening', () => { srv.close(); resolve(); });
    srv.listen(port, host);
  });
}

function waitForPort(port: number, host: string, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const sock = net.createConnection({ port, host });
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() < deadline) setTimeout(attempt, 100);
        else reject(new Error(`Proxy did not become ready on ${host}:${port} within ${timeoutMs}ms`));
      });
    };
    attempt();
  });
}

export class TxWrapper {
  private proxy: any;
  private session: any;
  private controlPanelSession: any;
  private _collector: ProxyCollector | null = null;
  private proxyUrl: string = '';
  private controlPanelProxyUrl: string = '';
  private server: TestServer | null = null;
  private _browserChild: ChildProcess | null = null;
  private _isSafariBrowser = false;
  private _tempUserDataDir: string | null = null;

  constructor(private config: TxWrapperConfig = {}) {
    config.proxyHost = config.proxyHost || 'localhost';
    config.port1 = config.port1 || DEFAULT_PROXY_PORT_1;
    config.port2 = config.port2 || DEFAULT_PROXY_PORT_2;
    config.controlPanelPort = config.controlPanelPort || DEFAULT_CONTROL_PANEL_PORT;
  }

  /**
   * Initialize the proxy and create sessions
   */
  private initializeProxy(): void {
    class ProxySession extends hammerhead.Session {
      getAuthCredentials() {
        return null;
      }
      handleFileDownload() {}
      handleAttachment() {}
      handlePageError(_ctx: unknown, err: string) {
        console.error('Page error:', err);
      }
      async getPayloadScript() {
        return '';
      }
      async getIframePayloadScript() {
        return '';
      }
    }

    this.proxy = new hammerhead.Proxy({});

    this.proxy.start({
      hostname: this.config.proxyHost || 'localhost',
      port1: this.config.port1 || DEFAULT_PROXY_PORT_1,
      port2: this.config.port2 || DEFAULT_PROXY_PORT_2,
    });

    // @ts-ignore
    this.session = new ProxySession([], {});
    this.proxyUrl = this.proxy.openSession('about:blank', this.session);

    // Create a second session for the control panel server (localhost:11339)
    // This bypasses CSP and allows the control panel to access the iframe
    // @ts-ignore
    this.controlPanelSession = new ProxySession([], {});
    const controlPanelLocalUrl = `http://localhost:${this.config.controlPanelPort}`;
    this.controlPanelProxyUrl = this.proxy.openSession(controlPanelLocalUrl, this.controlPanelSession);

    this._collector = new ProxyCollector([this.session, this.controlPanelSession], (msg) => this.server?.sendToClients(msg));
  }

  /**
   * Start the wrapper
   */
  async start(): Promise<void> {
    console.log('\n🚀 Starting Tx Wrapper...');

    try {
      // Check ports before starting proxy — fail fast with a clear message
      const host = this.config.proxyHost ?? 'localhost';
      await Promise.all([
        checkPortAvailable(this.config.port1!, host),
        checkPortAvailable(this.config.port2!, host),
        checkPortAvailable(this.config.controlPanelPort!, 'localhost'),
      ]);

      // Initialize proxy
      this.initializeProxy();
      console.log(`✅ Proxy initialized at ${this.proxyUrl}`);

      await waitForPort(this.config.port1!, this.config.proxyHost ?? 'localhost');

      // Start control panel server (on localhost:11339)
      const cpSession = this.controlPanelSession;
      this.server = new TestServer({
        port:          this.config.controlPanelPort,
        testFiles:     this.config.testFiles,
        watchBaseDir:  this.config.watchBaseDir,
        reporters:     this.config.reporters,
        testMode:      this.config.testMode,
        snapshot:      this.config.snapshot,
        tasks:         this.config.tasks,
        grep:          this.config.grep,
        actionTimeout: this.config.actionTimeout,
        expectTimeout: this.config.expectTimeout,
        testTimeout:   this.config.testTimeout,
        retries:         this.config.retries,
        onGetCookieJar:  () => cpSession.cookies.serializeJar(),
        onSetCookieJar:  (jar) => cpSession.cookies.setJar(jar),
      });
      await this.server.start(this.proxyUrl, this.config.viewport);
      this._collector?.attach();

      console.log(`✅ Control Panel server started at http://localhost:${this.config.controlPanelPort}`);
      console.log(`✅ Control Panel via proxy at ${this.controlPanelProxyUrl}`);
      console.log(`📦 Proxy URL: ${this.proxyUrl}`);

      setPreprocessor(this.config.preprocessor);

      if (this.config.testFiles?.length) {
        // In test mode, await initial bundling so all sources are ready before the browser opens
        await startWatcher(
          this.config.testFiles,
          this.config.testPatterns ?? [],
          this.config.watchBaseDir ?? process.cwd(),
          this.server,
        );
      }

      const exePath = findBrowserExecutable(this.config.browser);
      if (!exePath) {
        throw new Error(
          'Could not find a browser executable. ' +
          'Install Chrome, Firefox, or Edge, or set the "browser" config option to the path of a browser binary.'
        );
      }

      console.table({
        browser:       path.basename(exePath),
        headless:      this.config.headless ?? false,
        controlPanel:  `http://localhost:${this.config.controlPanelPort}`,
        proxy:         this.proxyUrl,
        testMode:      this.config.testMode ?? false,
        snapshot:      this.config.snapshot ?? false,
        testFiles:     this.config.testFiles?.length ?? 0,
        grep:          this.config.grep ? String(this.config.grep) : '-',
        viewport:      this.config.viewport ? `${this.config.viewport.width}×${this.config.viewport.height}` : '-',
        retries:       this.config.retries ?? '-',
        actionTimeout: this.config.actionTimeout ?? '-',
        expectTimeout: this.config.expectTimeout ?? '-',
        testTimeout:   this.config.testTimeout ?? '-',
      });

      this._isSafariBrowser = exePath.toLowerCase().includes('safari') && process.platform === 'darwin';
      let spawnCmd: string;
      let args: string[];

      if (this._isSafariBrowser) {
        // Safari must be launched via `open` — launching the binary directly triggers
        // WebKit's WebProcess sandbox and blocks all resource loads.
        spawnCmd = 'open';
        args = ['-a', 'Safari', this.controlPanelProxyUrl];
      } else {
        spawnCmd = exePath;
        const isFirefox = exePath.toLowerCase().includes('firefox');
        if (isFirefox) {
          // --no-remote / --new-instance prevent Firefox from reusing an existing window
          args = [
            '--no-remote',
            '--new-instance',
            '--disable-popup-blocking',
            ...(this.config.headless ? ['--headless'] : []),
            this.controlPanelProxyUrl,
          ];
        } else {
          // Chromium-based: isolated user data dir so we always spawn a fresh instance
          // (without this, Chrome reuses an existing window and the launcher exits immediately,
          // making _browserChild.kill() a no-op on the already-gone launcher process)
          this._tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-chrome-'));
          args = [
            `--user-data-dir=${this._tempUserDataDir}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--enable-automation',
            '--disable-popup-blocking',
            ...(this.config.headless ? headlessArgs(exePath) : []),
            this.controlPanelProxyUrl,
          ];
        }
      }

      console.log(`\n🌐 ${this.config.headless ? 'Launching headless browser' : 'Opening browser'}: ${exePath}`);
      // detached: true creates a new process group so we can kill the whole group (renderers etc.)
      this._browserChild = spawn(spawnCmd, args, { stdio: 'ignore', detached: process.platform !== 'win32' });
      this._browserChild.unref();
      this._browserChild.on('error', (err: Error) => {
        console.error('Browser error:', err.message);
      });
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log(`\n✨ Control Panel ready for use`);
      console.log(`\n💡 Open via proxy: ${this.controlPanelProxyUrl}`);
      console.log(`💡 Or locally: http://localhost:${this.config.controlPanelPort}\n`);

    } catch (error) {
      console.error('❌ Failed to start wrapper:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Wait for the browser to finish running all tests (only meaningful in testMode).
   */
  async waitForTests(): Promise<{ passed: number; failed: number }> {
    if (!this.server) throw new Error('Wrapper not started. Call start() first.');
    return this.server.waitForDone();
  }

  /**
   * Stop the wrapper
   */
  async stop(): Promise<void> {
    console.log('\n🛑 Stopping Tx Wrapper...');

    if (this._browserChild) {
      const { pid } = this._browserChild;
      try {
        if (pid !== undefined) {
          if (process.platform !== 'win32') {
            process.kill(-pid, 'SIGTERM'); // kill the entire process group
          } else {
            this._browserChild.kill();
          }
        }
      } catch { /* already exited */ }
      this._browserChild = null;
    }

    if (this._tempUserDataDir) {
      try { fs.rmSync(this._tempUserDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
      this._tempUserDataDir = null;
    }

    if (this._isSafariBrowser) {
      try { execSync('pkill -x Safari', { stdio: 'ignore' }); } catch { /* already closed */ }
      this._isSafariBrowser = false;
    }

    if (this.server) {
      await this.server.stop();
    }

    if (this.proxy) {
      this.proxy.close();
    }

    console.log('✅ Wrapper stopped');
  }

  /**
   * Get the proxy URL
   */
  getProxyUrl(): string {
    return this.proxyUrl;
  }

}
