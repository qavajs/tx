/**
 * Tx Wrapper - Main orchestrator
 */

import * as fs from 'node:fs';
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
import { IframeInjector } from './iframeInjector';

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

import { TestApi } from './testApi';
import { TestServer } from './server';
import { startWatcher } from './watcher';
import type { Reporter } from './reporter';
import type { TaskHandler } from './types';

export class TxWrapper {
  private proxy: any;
  private session: any;
  private controlPanelSession: any;
  private proxyUrl: string = '';
  private controlPanelProxyUrl: string = '';
  private testApi: TestApi | null = null;
  private server: TestServer | null = null;
  private injector: IframeInjector | null = null;
  private _browserChild: ChildProcess | null = null;
  private _isSafariBrowser = false;

  constructor(
    private config: {
      proxyHost?: string;
      port1?: number;
      port2?: number;
      controlPanelPort?: number;
      headless?: boolean;
      browser?: string;
      testFiles?: string[];
      testPatterns?: string[];
      watchBaseDir?: string;
      viewport?: { width: number; height: number };
      reporters?: Reporter[];
      tasks?: Record<string, TaskHandler>;
      testMode?: boolean;
      snapshot?: boolean;
      grep?: RegExp;
      actionTimeout?: number;
      expectTimeout?: number;
      testTimeout?: number;
      retries?: number;
    } = {}
  ) {
    config.proxyHost = config.proxyHost || 'localhost';
    config.port1 = config.port1 || 11337;
    config.port2 = config.port2 || 11338;
    config.controlPanelPort = config.controlPanelPort || 11339;
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
      port1: this.config.port1 || 11337,
      port2: this.config.port2 || 11338,
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
  }

  /**
   * Start the wrapper
   */
  async start(): Promise<TestApi> {
    console.log('\n🚀 Starting Tx Wrapper...');

    try {
      // Initialize proxy
      this.initializeProxy();
      console.log(`✅ Proxy initialized at ${this.proxyUrl}`);

      // Wait a moment for proxy to stabilize
      await new Promise(resolve => setTimeout(resolve, 500));

      // Create iframe injector (for compatibility, though browser handles it)
      this.injector = new IframeInjector({
        proxyUrl: this.proxyUrl,
      });

      // Create test API
      this.testApi = new TestApi(this.injector);

      // Start control panel server (on localhost:11339)
      this.server = new TestServer(this.config.controlPanelPort, this.config.testFiles, this.config.reporters, this.config.testMode, this.config.snapshot, this.config.tasks, this.config.grep, this.config.actionTimeout, this.config.expectTimeout, this.config.testTimeout, this.config.retries);
      await this.server.start(this.proxyUrl, this.config.viewport);

      console.log(`✅ Control Panel server started at http://localhost:${this.config.controlPanelPort}`);
      console.log(`✅ Control Panel via proxy at ${this.controlPanelProxyUrl}`);
      console.log(`📦 Proxy URL: ${this.proxyUrl}`);

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
        args = [
          ...(this.config.headless ? headlessArgs(exePath) : []),
          this.controlPanelProxyUrl,
        ];
      }

      console.log(`\n🌐 ${this.config.headless ? 'Launching headless browser' : 'Opening browser'}: ${exePath}`);
      this._browserChild = spawn(spawnCmd, args, { stdio: 'ignore', detached: false });
      this._browserChild.on('error', (err: Error) => {
        console.error('Browser error:', err.message);
      });
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log(`\n✨ Control Panel ready for use`);
      console.log(`\n💡 Open via proxy: ${this.controlPanelProxyUrl}`);
      console.log(`💡 Or locally: http://localhost:${this.config.controlPanelPort}\n`);

      return this.testApi;
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
      try { this._browserChild.kill(); } catch { /* already exited */ }
      this._browserChild = null;
    }

    if (this._isSafariBrowser) {
      try { execSync('pkill -x Safari', { stdio: 'ignore' }); } catch { /* already closed */ }
      this._isSafariBrowser = false;
    }

    if (this.injector) {
      this.injector.remove();
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
   * Get the test API
   */
  getTestApi(): TestApi {
    if (!this.testApi) {
      throw new Error('Wrapper not started. Call start() first.');
    }
    return this.testApi;
  }

  /**
   * Get the proxy URL
   */
  getProxyUrl(): string {
    return this.proxyUrl;
  }

}
