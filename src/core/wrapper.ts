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
import { NodeTestRunner } from '../runner/node-runner';
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
  private agentProxyUrl: string = '';
  private server: TestServer | null = null;
  private _nodeRunner: NodeTestRunner | null = null;
  private _browserChild: ChildProcess | null = null;
  private _agentBrowserChild: ChildProcess | null = null;
  private _agentSafariPid: number | null = null;
  private _isSafariBrowser = false;
  private _tempUserDataDir: string | null = null;
  private _agentTempUserDataDir: string | null = null;

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

    // Agent shell is proxied through the test session (same origin as test iframes)
    const agentEntryUrl = `http://localhost:${this.config.controlPanelPort}/agent`;
    this.agentProxyUrl = this.proxy.openSession(agentEntryUrl, this.session);

    this._collector = new ProxyCollector([this.session, this.controlPanelSession], (msg) => this.server?.sendToClients(msg));
  }

  /** Kill Safari agent by PID (Safari is launched via `open` so _agentBrowserChild is useless). */
  private _killSafariAgent(): void {
    console.log(`[tx] _killSafariAgent pid=${this._agentSafariPid}`);
    if (this._agentSafariPid) {
      try { process.kill(this._agentSafariPid, 'SIGKILL'); } catch { /* already gone */ }
      this._agentSafariPid = null;
    }
    this._agentBrowserChild = null;
  }

  /** Open Safari at url and store its PID via pgrep polling until found (max 5s). */
  private _spawnSafariAgent(url: string): void {
    this._agentBrowserChild = spawn('open', ['-n', '-a', 'Safari', url], { stdio: 'ignore' });
    this._agentBrowserChild.unref();
    let attempts = 0;
    const poll = setInterval(() => {
      try {
        const raw = execSync('pgrep -n -x Safari').toString().trim();
        const pid = parseInt(raw, 10);
        if (!isNaN(pid)) {
          console.log(`[tx] pgrep Safari → pid=${pid} (attempt ${attempts + 1})`);
          this._agentSafariPid = pid;
          clearInterval(poll);
          return;
        }
      } catch { /* Safari not yet visible to pgrep */ }
      if (++attempts >= 10) {
        clearInterval(poll);
        console.log('[tx] pgrep Safari: gave up after 10 attempts');
      }
    }, 500);
  }

  /** Close the agent browser after a test run ends. */
  private _closeAgentBrowser(): void {
    if (this._isSafariBrowser) { this._killSafariAgent(); return; }
    if (this._agentBrowserChild) {
      const { pid } = this._agentBrowserChild;
      try {
        if (pid !== undefined) {
          if (process.platform !== 'win32') process.kill(-pid, 'SIGTERM');
          else this._agentBrowserChild.kill();
        }
      } catch { /* already exited */ }
      this._agentBrowserChild = null;
    }
    if (this._agentTempUserDataDir) {
      try { fs.rmSync(this._agentTempUserDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
      this._agentTempUserDataDir = null;
    }
  }

  /** Kill the agent browser (if running) and spawn a fresh instance. On first call, just spawns. */
  private async _restartAgentBrowser(): Promise<void> {
    if (this._isSafariBrowser) {
      this._killSafariAgent();
      if (this.agentProxyUrl) this._spawnSafariAgent(this.agentProxyUrl);
      return;
    }

    // For Chromium/Firefox: kill the old process group and wait for it to exit
    // before spawning a new one, so the OS releases any lock files on the profile dir.
    if (this._agentBrowserChild) {
      const child = this._agentBrowserChild;
      this._agentBrowserChild = null;
      await new Promise<void>(resolve => {
        const done = setTimeout(resolve, 3000); // fallback
        child.once('exit', () => { clearTimeout(done); resolve(); });
        const { pid } = child;
        try {
          if (pid !== undefined) {
            if (process.platform !== 'win32') process.kill(-pid, 'SIGKILL');
            else child.kill();
          }
        } catch { /* already exited */ }
      });
    }

    if (this._agentTempUserDataDir) {
      try { fs.rmSync(this._agentTempUserDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
      this._agentTempUserDataDir = null;
    }

    const exePath = findBrowserExecutable(this.config.browser);
    if (!exePath || !this.agentProxyUrl) return;
    const [agentCmd, agentArgList] = this._buildBrowserArgs(exePath, this.agentProxyUrl, true);
    this._agentBrowserChild = spawn(agentCmd, agentArgList, { stdio: 'ignore', detached: process.platform !== 'win32' });
    this._agentBrowserChild.unref();
    this._agentBrowserChild.on('error', (err: Error) => {
      console.error('Agent browser error:', err.message);
    });
    console.log('[tx] Agent browser restarted');
  }

  /** Build [cmd, args] for spawning a browser at the given URL. `isAgent` uses a separate user-data-dir. */
  private _buildBrowserArgs(exePath: string, url: string, isAgent: boolean): [string, string[]] {
    if (this._isSafariBrowser) {
      return ['open', ['-n', '-a', 'Safari', url]];
    }
    const isFirefox = exePath.toLowerCase().includes('firefox');
    if (isFirefox) {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), isAgent ? 'tx-agent-ff-' : 'tx-ff-'));
      if (isAgent) this._agentTempUserDataDir = tmpDir;
      else this._tempUserDataDir = tmpDir;
      // Embed the target URL as the startup homepage instead of passing it as a CLI argument.
      // Firefox on a fresh profile often ignores the positional URL argument and shows its home
      // page; setting browser.startup.homepage is more reliable.
      // times.json marks the directory as a valid existing profile so Firefox reads prefs.js.
      fs.writeFileSync(path.join(tmpDir, 'times.json'), JSON.stringify({ created: Date.now(), firstUse: Date.now() }));
      fs.writeFileSync(path.join(tmpDir, 'prefs.js'), [
        'user_pref("browser.startup.page", 1);',
        `user_pref("browser.startup.homepage", ${JSON.stringify(url)});`,
        'user_pref("startup.homepage_welcome_url", "");',
        'user_pref("startup.homepage_override_url", "");',
        'user_pref("browser.startup.homepage_override.mstone", "ignore");',
        'user_pref("browser.aboutwelcome.enabled", false);',
        'user_pref("browser.shell.checkDefaultBrowser", false);',
        'user_pref("browser.sessionstore.resume_from_crash", false);',
        'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
        'user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);',
        'user_pref("browser.uitour.enabled", false);',
        'user_pref("trailhead.firstrun.didSeeAboutWelcome", true);',
      ].join('\n'));
      return [exePath, [
        '--no-remote', '--new-instance', '--disable-popup-blocking',
        '-profile', tmpDir,
        ...(this.config.headless ? ['--headless'] : []),
        // No positional URL arg — Firefox opens browser.startup.homepage instead
      ]];
    }
    // Chromium-based — each browser instance needs its own user-data-dir
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), isAgent ? 'tx-agent-' : 'tx-chrome-'));
    const defaultProfileDir = path.join(tmpDir, 'Default');
    fs.mkdirSync(defaultProfileDir, { recursive: true });
    fs.writeFileSync(path.join(defaultProfileDir, 'Preferences'), JSON.stringify({
      credentials_enable_service: false,
      profile: { password_manager_enabled: false, password_manager_leak_detection: false },
    }));
    if (isAgent) this._agentTempUserDataDir = tmpDir;
    else this._tempUserDataDir = tmpDir;
    return [exePath, [
      `--user-data-dir=${tmpDir}`,
      '--no-first-run', '--no-default-browser-check', '--enable-automation', '--disable-popup-blocking',
      ...(this.config.headless ? headlessArgs(exePath) : []),
      url,
    ]];
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
        testIdAttribute: this.config.testIdAttribute,
        agentProxyUrl:   this.agentProxyUrl,
        onGetCookieJar:  () => cpSession.cookies.serializeJar(),
        onSetCookieJar:  (jar) => cpSession.cookies.setJar(jar),
        onRestartAgent:  () => this._restartAgentBrowser(),
        onRunEnd:        () => this._closeAgentBrowser(),
      });
      await this.server.start(this.proxyUrl, this.config.viewport);
      this._collector?.attach();

      // Wire Node test runner
      this._nodeRunner = new NodeTestRunner(this.server, {
        port: this.config.controlPanelPort!,
        proxyUrl: this.proxyUrl,
        retries: this.config.retries,
        actionTimeout: this.config.actionTimeout,
        expectTimeout: this.config.expectTimeout,
        testTimeout: this.config.testTimeout,
        snapshot: this.config.snapshot,
      });
      this.server.setNodeRunner(this._nodeRunner);

      console.log(`✅ Control Panel server started at http://localhost:${this.config.controlPanelPort}`);
      console.log(`✅ Control Panel via proxy at ${this.controlPanelProxyUrl}`);
      console.log(`📦 Proxy URL: ${this.proxyUrl}`);

      setPreprocessor(this.config.preprocessor);

      if (this.config.testFiles?.length) {
        startWatcher(
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
        snapshot:      this.config.snapshot ?? true,
        testFiles:     this.config.testFiles?.length ?? 0,
        grep:          this.config.grep ? String(this.config.grep) : '-',
        viewport:      this.config.viewport ? `${this.config.viewport.width}×${this.config.viewport.height}` : '-',
        retries:       this.config.retries ?? '-',
        actionTimeout: this.config.actionTimeout ?? '-',
        expectTimeout: this.config.expectTimeout ?? '-',
        testTimeout:   this.config.testTimeout ?? '-',
      });

      this._isSafariBrowser = exePath.toLowerCase().includes('safari') && process.platform === 'darwin';
      const [spawnCmd, args] = this._buildBrowserArgs(exePath, this.controlPanelProxyUrl, false);

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

    for (const [child, label] of [[this._browserChild, 'browser'], [this._agentBrowserChild, 'agent browser']] as const) {
      if (child) {
        const { pid } = child;
        try {
          if (pid !== undefined) {
            if (process.platform !== 'win32') process.kill(-pid, 'SIGTERM');
            else child.kill();
          }
        } catch { /* already exited */ }
        void label;
      }
    }
    this._browserChild = null;
    this._agentBrowserChild = null;
    if (this._agentSafariPid) {
      try { process.kill(this._agentSafariPid, 'SIGTERM'); } catch { /* already gone */ }
      this._agentSafariPid = null;
    }

    for (const dir of [this._tempUserDataDir, this._agentTempUserDataDir]) {
      if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    this._tempUserDataDir = null;
    this._agentTempUserDataDir = null;

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
