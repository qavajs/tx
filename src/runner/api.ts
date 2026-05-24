/**
 * Test API - Tx API for browser automation
 */

import { IframeInjector } from '../panel/iframeInjector';

export class TestApi {
  private injector: IframeInjector;
  private doc: Document | null = null;
  private win: Window | null = null;

  constructor(injector: IframeInjector) {
    this.injector = injector;
  }

  /**
   * Wait for iframe to be ready
   */
  private async waitForIframe(timeout = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      this.doc = this.injector.getDocument();
      this.win = this.injector.getWindow();
      if (this.doc && this.win && this.doc.readyState === 'complete') {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Iframe failed to load within timeout');
  }

  /**
   * Get elements (tx.get equivalent)
   */
  get(selector: string): Element[] {
    if (!this.doc) {
      throw new Error('Iframe not ready. Call wait() first');
    }
    return Array.from(this.doc.querySelectorAll(selector));
  }

  /**
   * Find a single element
   */
  find(selector: string): Element | null {
    if (!this.doc) {
      throw new Error('Iframe not ready');
    }
    return this.doc.querySelector(selector);
  }

  /**
   * Click an element
   */
  click(selector: string): void {
    const element = this.find(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    (element as any).click();
  }

  /**
   * Type text into an element
   */
  type(selector: string, text: string): void {
    const element = this.find(selector) as any;
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /**
   * Get text content of an element
   */
  text(selector: string): string {
    const element = this.find(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    return element.textContent || '';
  }

  /**
   * Check if element is visible
   */
  isVisible(selector: string): boolean {
    const element = this.find(selector);
    if (!element) {
      return false;
    }
    const style = this.win?.getComputedStyle(element);
    return !!(style && style.display !== 'none' && style.visibility !== 'hidden');
  }

  /**
   * Get attribute value
   */
  attr(selector: string, attrName: string): string | null {
    const element = this.find(selector);
    if (!element) {
      return null;
    }
    return element.getAttribute(attrName);
  }

  /**
   * Wait for element to be present
   */
  async waitForElement(selector: string, timeout = 5000): Promise<Element> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const element = this.find(selector);
      if (element) {
        return element;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Element not found within timeout: ${selector}`);
  }

  /**
   * Wait for element to disappear
   */
  async waitForElementToDisappear(selector: string, timeout = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const element = this.find(selector);
      if (!element) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Element still present after timeout: ${selector}`);
  }

  /**
   * Execute script in iframe context
   */
  execute(fn: (...args: any[]) => any, ...args: any[]): any {
    if (!this.win) {
      throw new Error('Iframe not ready');
    }
    return fn.apply(this.win, args);
  }

  /**
   * Take a screenshot (return element as data)
   */
  screenshot(selector?: string): {
    width: number;
    height: number;
    top: number;
    left: number;
  } {
    let element: Element;
    if (selector) {
      const el = this.find(selector);
      if (!el) throw new Error(`Element not found: ${selector}`);
      element = el;
    } else if (this.doc) {
      element = this.doc.documentElement;
    } else {
      throw new Error('Iframe not ready');
    }

    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
    };
  }

  /**
   * Get page title
   */
  title(): string {
    return this.doc?.title || '';
  }

  /**
   * Get current URL
   */
  url(): string {
    return this.win?.location.href || '';
  }

  /**
   * Wait for iframe to load
   */
  async wait(timeout = 5000): Promise<void> {
    await this.waitForIframe(timeout);
  }

  /**
   * Reload page
   */
  reload(): void {
    this.injector.reload();
  }

  /**
   * Visit URL
   */
  visit(url: string): void {
    this.injector.navigate(url);
  }
}
