/**
 * Type declarations for the Tx test runner.
 *
 * Globals available in every test file:
 *   page, browser, expect, describe, it, test, beforeAll, afterAll, beforeEach, afterEach
 *
 * Module available via require / import:
 *   const { page, expect, Locator } = require('tx')
 */

// ── Shared option types ───────────────────────────────────────────────────────

interface TxTimeoutOptions { timeout?: number; }
interface TxFillOptions    { timeout?: number; delay?: number; }
interface TxTextOptions    { exact?: boolean;  timeout?: number; }
interface TxNameOptions    { name?: string | RegExp; exact?: boolean; }

// ── Locator ───────────────────────────────────────────────────────────────────

interface Locator {
  // ── Chaining ────────────────────────────────────────────────────────────────
  nth(n: number): Locator;
  first(): Locator;
  last(): Locator;
  filter(opts: { hasText?: string | RegExp; hasNotText?: string | RegExp }): Locator;
  locator(selector: string): Locator;

  // ── Actions ─────────────────────────────────────────────────────────────────
  click(opts?: { force?: boolean; timeout?: number }): Promise<void>;
  dblclick(opts?: TxTimeoutOptions): Promise<void>;
  fill(value: string, opts?: TxFillOptions): Promise<void>;
  clear(opts?: TxTimeoutOptions): Promise<void>;
  type(text: string, opts?: { delay?: number; timeout?: number }): Promise<void>;
  press(key: string, opts?: TxTimeoutOptions): Promise<void>;
  selectOption(value: string | string[], opts?: TxTimeoutOptions): Promise<void>;
  check(opts?: TxTimeoutOptions): Promise<void>;
  uncheck(opts?: TxTimeoutOptions): Promise<void>;
  focus(opts?: TxTimeoutOptions): Promise<void>;
  hover(opts?: TxTimeoutOptions): Promise<void>;
  scrollIntoViewIfNeeded(opts?: TxTimeoutOptions): Promise<void>;

  // ── State queries ────────────────────────────────────────────────────────────
  textContent(): Promise<string | null>;
  innerText(): Promise<string>;
  inputValue(): Promise<string>;
  getAttribute(name: string): Promise<string | null>;
  isVisible(): Promise<boolean>;
  isHidden(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  isDisabled(): Promise<boolean>;
  isChecked(): Promise<boolean>;
  isEditable(): Promise<boolean>;
  count(): Promise<number>;
  waitFor(opts?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number }): Promise<void>;
}

// ── Assertions ────────────────────────────────────────────────────────────────

interface LocatorAssertions {
  toBeVisible(opts?: TxTimeoutOptions): Promise<void>;
  toBeHidden(opts?: TxTimeoutOptions): Promise<void>;
  toBeEnabled(opts?: TxTimeoutOptions): Promise<void>;
  toBeDisabled(opts?: TxTimeoutOptions): Promise<void>;
  toBeChecked(opts?: TxTimeoutOptions): Promise<void>;
  toBeEditable(opts?: TxTimeoutOptions): Promise<void>;
  toBeEmpty(opts?: TxTimeoutOptions): Promise<void>;
  toHaveText(text: string | RegExp, opts?: TxTextOptions): Promise<void>;
  toContainText(text: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  toHaveValue(value: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  toHaveAttribute(name: string, value: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  toHaveCount(count: number, opts?: TxTimeoutOptions): Promise<void>;
  toHaveClass(cls: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  toHaveURL(url: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  toHaveTitle(title: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  not: Omit<LocatorAssertions, 'not'>;
}

interface ValueAssertions {
  toBe(expected: any): void;
  toEqual(expected: any): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toBeGreaterThan(n: number): void;
  toBeLessThan(n: number): void;
  toContain(item: any): void;
  toMatch(r: RegExp | string): void;
  not: Omit<ValueAssertions, 'not'>;
}

// ── Page event payload types ───────────────────────────────────────────────────

interface TxConsoleMessage {
  type(): string;
  text(): string;
  args(): any[];
  location(): { url: string; lineNumber: number; columnNumber: number };
}

interface TxRequest {
  url(): string;
  method(): string;
  headers(): Record<string, string>;
  postData(): any;
  isNavigationRequest(): boolean;
  resourceType(): string;
}

interface TxResponse {
  url(): string;
  status(): number;
  statusText(): string;
  ok(): boolean;
  request(): TxRequest;
}

interface TxFailedRequest extends TxRequest {
  failure(): { errorText: string };
}

interface TxDialog {
  type(): 'alert' | 'confirm' | 'prompt';
  message(): string;
  defaultValue(): string;
  accept(promptText?: string): void;
  dismiss(): void;
}

interface TxDownload {
  url(): string;
  suggestedFilename(): string;
}

interface TxFileChooser {
  element(): HTMLInputElement;
  isMultiple(): boolean;
  accept(): string;
  setFiles(files: File[]): void;
}

interface TxFrame {
  url(): string;
  name(): string;
  isMainFrame(): boolean;
}

// ── PopupPage ─────────────────────────────────────────────────────────────────

interface PopupPage {
  goto(url: string): Promise<void>;
  reload(): Promise<void>;
  url(): string;
  title(): Promise<string>;

  locator(selector: string): Locator;
  getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator;
  getByRole(role: string, opts?: TxNameOptions): Locator;
  getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator;
  getByPlaceholder(text: string | RegExp): Locator;
  getByTestId(id: string): Locator;
  getByAltText(text: string | RegExp): Locator;
  getByTitle(text: string | RegExp): Locator;

  waitForURL(url: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  waitForSelector(selector: string, opts?: { state?: 'visible' | 'attached'; timeout?: number }): Promise<Locator>;
  waitForTimeout(ms: number): Promise<void>;

  on(event: string, fn: (...args: any[]) => any): PopupPage;
  off(event: string, fn: (...args: any[]) => any): PopupPage;
  once(event: string, fn: (...args: any[]) => any): PopupPage;

  bringToFront(): Promise<void>;
  close(): Promise<void>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface Page {
  // ── Navigation ───────────────────────────────────────────────────────────────
  goto(url: string): Promise<void>;
  reload(): Promise<void>;
  url(): string;
  title(): Promise<string>;

  // ── Locator factories ─────────────────────────────────────────────────────────
  locator(selector: string): Locator;
  getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator;
  getByRole(role: string, opts?: TxNameOptions): Locator;
  getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator;
  getByPlaceholder(text: string | RegExp): Locator;
  getByTestId(id: string): Locator;
  getByAltText(text: string | RegExp): Locator;
  getByTitle(text: string | RegExp): Locator;

  // ── Waits ─────────────────────────────────────────────────────────────────────
  waitForURL(url: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  waitForSelector(selector: string, opts?: { state?: 'visible' | 'attached'; timeout?: number }): Promise<Locator>;
  waitForTimeout(ms: number): Promise<void>;

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  keyboard: {
    press(key: string): Promise<void>;
    type(text: string, opts?: { delay?: number }): Promise<void>;
  };

  // ── Viewport ──────────────────────────────────────────────────────────────────
  setViewportSize(size: { width: number; height: number }): void;

  // ── Events ────────────────────────────────────────────────────────────────────
  on(event: 'close',            fn: () => any): Page;
  on(event: 'console',          fn: (msg: TxConsoleMessage) => any): Page;
  on(event: 'crash',            fn: () => any): Page;
  on(event: 'dialog',           fn: (dialog: TxDialog) => any): Page;
  on(event: 'domcontentloaded', fn: () => any): Page;
  on(event: 'download',         fn: (dl: TxDownload) => any): Page;
  on(event: 'filechooser',      fn: (fc: TxFileChooser) => any): Page;
  on(event: 'frameattached',    fn: (frame: TxFrame) => any): Page;
  on(event: 'framedetached',    fn: (frame: TxFrame) => any): Page;
  on(event: 'framenavigated',   fn: (frame: TxFrame) => any): Page;
  on(event: 'load',             fn: () => any): Page;
  on(event: 'pageerror',        fn: (err: Error) => any): Page;
  on(event: 'popup',            fn: (popup: PopupPage) => any): Page;
  on(event: 'request',          fn: (req: TxRequest) => any): Page;
  on(event: 'requestfailed',    fn: (req: TxFailedRequest) => any): Page;
  on(event: 'requestfinished',  fn: (req: TxRequest) => any): Page;
  on(event: 'response',         fn: (res: TxResponse) => any): Page;
  on(event: 'websocket',        fn: (ws: WebSocket) => any): Page;
  on(event: 'worker',           fn: (w: Worker) => any): Page;
  on(event: string,             fn: (...args: any[]) => any): Page;

  off(event: string, fn: (...args: any[]) => any): Page;
  once(event: string, fn: (...args: any[]) => any): Page;

  bringToFront(): Promise<void>;
  close(): Promise<void>;
}

// ── Browser ───────────────────────────────────────────────────────────────────

interface Browser {
  /** Open a new tab and return a page object for it. */
  newPage(): Promise<PopupPage>;
  /** Return page objects for all currently open tabs. */
  pages(): PopupPage[];
}

// ── Globals injected by the test runner ───────────────────────────────────────

declare const page: Page;
declare const browser: Browser;

declare function expect(actual: Locator): LocatorAssertions;
declare function expect(actual: any): ValueAssertions;

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare const test: typeof it;
declare function beforeAll(fn: () => void | Promise<void>): void;
declare function afterAll(fn: () => void | Promise<void>): void;
declare function beforeEach(fn: () => void | Promise<void>): void;
declare function afterEach(fn: () => void | Promise<void>): void;

// ── 'tx' module — available via require('tx') or import from 'tx' ─────────────

declare module 'tx' {
  export { Locator, Page, PopupPage, Browser };
  export { LocatorAssertions, ValueAssertions };
  export { TxDialog, TxDownload, TxFileChooser, TxFrame, TxRequest, TxResponse, TxConsoleMessage };

  export const page: Page;
  export const browser: Browser;

  export function expect(actual: Locator): LocatorAssertions;
  export function expect(actual: any): ValueAssertions;
}
