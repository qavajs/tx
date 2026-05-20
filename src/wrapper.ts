/**
 * Tx Wrapper - Main orchestrator
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const hammerhead = require('testcafe-hammerhead');
import { IframeInjector, IframeConfig } from './iframeInjector';
import { TestApi } from './testApi';
import { TestServer } from './server';

export class TxWrapper {
  private proxy: any;
  private session: any;
  private controlPanelSession: any;
  private proxyUrl: string = '';
  private controlPanelProxyUrl: string = '';
  private targetUrl: string = '';
  private testApi: TestApi | null = null;
  private server: TestServer | null = null;
  private injector: IframeInjector | null = null;

  constructor(
    private config: {
      targetUrl?: string;
      proxyHost?: string;
      port1?: number;
      port2?: number;
      controlPanelPort?: number;
      headless?: boolean;
    } = {}
  ) {
    this.targetUrl = config.targetUrl || 'about:blank';
    config.proxyHost = config.proxyHost || 'localhost';
    config.port1 = config.port1 || 1337;
    config.port2 = config.port2 || 1338;
    config.controlPanelPort = config.controlPanelPort || 3000;
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
      port1: this.config.port1 || 1337,
      port2: this.config.port2 || 1338,
    });

    // @ts-ignore
    this.session = new ProxySession([], {});
    this.proxyUrl = this.proxy.openSession(this.targetUrl, this.session);

    // Create a second session for the control panel server (localhost:3000)
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
        targetUrl: this.targetUrl,
      });

      // Create test API
      this.testApi = new TestApi(this.injector);

      // Start control panel server (on localhost:3000)
      this.server = new TestServer(this.config.controlPanelPort);
      await this.server.start(this.proxyUrl, this.targetUrl);

      console.log(`✅ Control Panel server started at http://localhost:${this.config.controlPanelPort}`);
      console.log(`✅ Control Panel via proxy at ${this.controlPanelProxyUrl}`);
      console.log(`📦 Target proxy URL: ${this.proxyUrl}`);
      console.log(`🎯 Target URL: ${this.targetUrl}`);

      if (!this.config.headless) {
        // Open in browser via proxy to bypass CSP
        const { exec } = require('child_process');
        console.log(`\n🌐 Opening browser...`);
        
        exec(`open "${this.controlPanelProxyUrl}"`, (err: Error | null) => {
          if (err) {
            console.error('Failed to open browser:', err.message);
            console.log(`\n📍 Visit via proxy: ${this.controlPanelProxyUrl}`);
            console.log(`📍 Or visit locally: http://localhost:${this.config.controlPanelPort}`);
          } else {
            console.log(`✅ Browser opened successfully`);
          }
        });

        // Add small delay to ensure browser opens
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

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
   * Stop the wrapper
   */
  async stop(): Promise<void> {
    console.log('\n🛑 Stopping Tx Wrapper...');

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

  /**
   * Get target URL
   */
  getTargetUrl(): string {
    return this.targetUrl;
  }
}
