/**
 * IFrame Injector - Injects target site into an iframe with proxy support
 */

export interface IframeConfig {
  proxyUrl: string;
  containerId?: string;
}

export class IframeInjector {
  private config: IframeConfig;
  private iframe: HTMLIFrameElement | null = null;

  constructor(config: IframeConfig) {
    this.config = config;
  }

  /**
   * Inject the target site into an iframe
   */
  inject(containerId: string = this.config.containerId || 'iframe-container'): HTMLIFrameElement {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container with id '${containerId}' not found`);
    }

    // Create iframe
    this.iframe = document.createElement('iframe');
    this.iframe.id = 'tx-virtual-browser';
    this.iframe.style.width = '100%';
    this.iframe.style.height = '100%';
    this.iframe.style.border = 'none';
    this.iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-presentation');

    container.appendChild(this.iframe);

    // Navigate to proxied URL
    if (this.iframe.contentWindow) {
      this.iframe.contentWindow.location.href = this.config.proxyUrl;
    }

    return this.iframe;
  }

  /**
   * Get the iframe document
   */
  getDocument(): Document | null {
    return this.iframe?.contentDocument || null;
  }

  /**
   * Get the iframe window
   */
  getWindow(): Window | null {
    return this.iframe?.contentWindow || null;
  }

  /**
   * Remove the iframe
   */
  remove(): void {
    this.iframe?.remove();
    this.iframe = null;
  }

  /**
   * Reload the iframe
   */
  reload(): void {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.location.reload();
    }
  }

  /**
   * Navigate to a new URL
   */
  navigate(url: string): void {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.location.href = url;
    }
  }
}
