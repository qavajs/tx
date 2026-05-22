/**
 * Type Definitions for Tx
 */

import type { Reporter } from './reporter';

/** A reporter entry: [path-to-module, config-object] */
export type ReporterEntry = [path: string, config: Record<string, unknown>];

/** A task handler executed in the Node.js context */
export type TaskHandler = (payload: unknown) => unknown | Promise<unknown>;

export interface TxConfig {
  /** Reporter entries — each is a [modulePath, configObject] tuple. */
  reporters?: ReporterEntry[];

  /** Named task handlers executed in Node.js context, callable via browser.task() */
  tasks?: Record<string, TaskHandler>;
  /** Proxy hostname (default: localhost) */
  proxyHost?: string;

  /** Proxy port 1 (default: 1337) */
  port1?: number;

  /** Proxy port 2 (default: 1338) */
  port2?: number;

  /** Control panel port (default: 3000) */
  controlPanelPort?: number;

  /** Run in headless mode (default: false) */
  headless?: boolean;

  /** Explicit list of test file paths (relative to config file) */
  testFiles?: string[];

  /** Regexp string (e.g. "login" or "/should log in/i") to filter tests by name — display and run only matching tests */
  grep?: string;

  /** Iframe viewport dimensions */
  viewport?: { width: number; height: number };

  /** Run all tests automatically, then close — exit code 0 = all passed, 1 = any failed */
  testMode?: boolean;

  /** Capture DOM snapshots after each command (default: false) */
  snapshot?: boolean;

  /** Default timeout for actions like click(), fill(), locator waits in ms (default: 5000) */
  actionTimeout?: number;

  /** Default timeout for expect() assertion retry loop in ms (default: 5000) */
  expectTimeout?: number;

  /** Maximum time a single test function may run in ms (default: 30000) */
  testTimeout?: number;

  /**
   * Browser to open the control panel in.
   * Accepts a well-known name ("chrome", "chromium", "firefox", "edge", "safari")
   * or an absolute path to a browser executable.
   * When omitted the OS default browser is used.
   */
  browser?: string;
}

export interface WaitOptions {
  timeout?: number;
}

export interface ScreenshotBounds {
  width: number;
  height: number;
  top: number;
  left: number;
}

export interface ElementInfo {
  tag: string;
  classes: string[];
  id: string;
  text: string;
  visible: boolean;
}

export interface TestResults {
  passed: number;
  failed: number;
  duration: number;
}

/**
 * Test API Type Definitions
 */
export interface ITestApi {
  // Navigation
  wait(timeout?: number): Promise<void>;
  visit(url: string): void;
  reload(): void;
  url(): string;
  title(): string;

  // Selectors
  get(selector: string): Element[];
  find(selector: string): Element | null;
  text(selector: string): string;
  attr(selector: string, attrName: string): string | null;
  isVisible(selector: string): boolean;

  // Interactions
  click(selector: string): void;
  type(selector: string, text: string): void;

  // Waiting
  waitForElement(selector: string, timeout?: number): Promise<Element>;
  waitForElementToDisappear(selector: string, timeout?: number): Promise<void>;

  // Advanced
  execute(fn: (...args: any[]) => any, ...args: any[]): any;
  screenshot(selector?: string): ScreenshotBounds;
}

/**
 * Wrapper Type Definitions
 */
export interface ITxWrapper {
  start(): Promise<ITestApi>;
  stop(): Promise<void>;
  getTestApi(): ITestApi;
  getProxyUrl(): string;
}

/**
 * Decorator for test functions
 */
export function test(name: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      console.log(`\n🧪 Running: ${name}`);
      try {
        await originalMethod.apply(this, args);
        console.log(`✅ Passed: ${name}`);
        return { passed: true, name };
      } catch (error) {
        console.error(`❌ Failed: ${name}`);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Test suite class
 */
export class TestSuite {
  protected tx: any;
  protected wrapper: any;

  async beforeAll(): Promise<void> {}
  async afterAll(): Promise<void> {}
  async beforeEach(): Promise<void> {}
  async afterEach(): Promise<void> {}

  async run(): Promise<TestResults> {
    const results: TestResults = {
      passed: 0,
      failed: 0,
      duration: 0,
    };

    const startTime = Date.now();

    try {
      await this.beforeAll();

      const methods = Object.getOwnPropertyNames(
        Object.getPrototypeOf(this)
      ).filter((name) => name.startsWith('test'));

      for (const method of methods) {
        try {
          await this.beforeEach();
          await (this as any)[method]();
          await this.afterEach();
          results.passed++;
        } catch (error) {
          results.failed++;
        }
      }

      await this.afterAll();
    } catch (error) {
      console.error('Suite error:', error);
    }

    results.duration = Date.now() - startTime;
    return results;
  }
}

/**
 * Assertion helpers
 */
export class Assert {
  static equal(actual: any, expected: any, message?: string): void {
    if (actual !== expected) {
      throw new Error(
        message || `Expected ${expected} but got ${actual}`
      );
    }
  }

  static truthy(value: any, message?: string): void {
    if (!value) {
      throw new Error(message || `Expected truthy value but got ${value}`);
    }
  }

  static falsy(value: any, message?: string): void {
    if (value) {
      throw new Error(message || `Expected falsy value but got ${value}`);
    }
  }

  static includes(array: any[], value: any, message?: string): void {
    if (!array.includes(value)) {
      throw new Error(
        message || `Expected array to include ${value}`
      );
    }
  }

  static contains(text: string, substring: string, message?: string): void {
    if (!text.includes(substring)) {
      throw new Error(
        message || `Expected "${text}" to contain "${substring}"`
      );
    }
  }

  static greater(actual: number, threshold: number, message?: string): void {
    if (actual <= threshold) {
      throw new Error(
        message || `Expected ${actual} to be greater than ${threshold}`
      );
    }
  }

  static less(actual: number, threshold: number, message?: string): void {
    if (actual >= threshold) {
      throw new Error(
        message || `Expected ${actual} to be less than ${threshold}`
      );
    }
  }
}
