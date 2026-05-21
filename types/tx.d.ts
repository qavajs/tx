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

/** A synthetic file descriptor accepted by {@link Locator.setInputFiles}. */
interface TxFilePayload {
  /** File name including extension (e.g. `"photo.png"`). */
  name: string;
  /** MIME type (e.g. `"image/png"`). */
  mimeType: string;
  /** File content. */
  buffer: Buffer;
}

/** Handle returned by {@link Page.addInitScript}. Call `dispose()` to stop the script from running on future navigations. */
interface TxScriptHandle { dispose(): void; }

/** Options for {@link Page.addLocatorHandler}. */
interface TxLocatorHandlerOptions {
  /**
   * If `true`, tx will not wait for the locator to become hidden after the handler returns.
   * Default: `false`.
   */
  noWaitAfter?: boolean;
  /**
   * Maximum number of times this handler may be invoked. The handler is automatically
   * removed once the limit is reached. `0` (default) means unlimited.
   */
  times?: number;
}

// ── Locator ───────────────────────────────────────────────────────────────────

interface Locator {
  // ── Chaining ────────────────────────────────────────────────────────────────
  nth(n: number): Locator;
  first(): Locator;
  last(): Locator;
  filter(opts: { hasText?: string | RegExp; hasNotText?: string | RegExp; visible?: boolean }): Locator;
  locator(selector: string): Locator;

  // ── Actions ─────────────────────────────────────────────────────────────────
  click(opts?: { force?: boolean; timeout?: number }): Promise<void>;
  dblclick(opts?: TxTimeoutOptions): Promise<void>;
  rightClick(opts?: TxTimeoutOptions): Promise<void>;
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
  setInputFiles(files: string | string[] | TxFilePayload | TxFilePayload[], opts?: TxTimeoutOptions): Promise<void>;

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
  evaluate<T = any>(pageFunction: string | ((element: Element, arg?: any) => T | Promise<T>), arg?: any): Promise<T>;
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
  toHaveAttribute(name: string, value?: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  toHaveCount(count: number, opts?: TxTimeoutOptions): Promise<void>;
  toHaveClass(cls: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  not: Omit<LocatorAssertions, 'not'>;
}

interface PageAssertions {
  toHaveTitle(titleOrRegExp: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  toHaveURL(url: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  not: Omit<PageAssertions, 'not'>;
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

// ── FrameLocator ─────────────────────────────────────────────────────────────

interface FrameLocator {
  locator(selector: string): Locator;
  getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator;
  getByRole(role: string, opts?: TxNameOptions): Locator;
  getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator;
  getByPlaceholder(text: string | RegExp): Locator;
  getByTestId(id: string): Locator;
  getByAltText(text: string | RegExp): Locator;
  getByTitle(text: string | RegExp): Locator;
  frameLocator(selector: string): FrameLocator;
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
  frameLocator(selector: string): FrameLocator;

  waitForURL(url: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  waitForSelector(selector: string, opts?: { state?: 'visible' | 'attached'; timeout?: number }): Promise<Locator>;
  waitForTimeout(ms: number): Promise<void>;

  on(event: string, fn: (...args: any[]) => any): PopupPage;
  off(event: string, fn: (...args: any[]) => any): PopupPage;
  once(event: string, fn: (...args: any[]) => any): PopupPage;

  bringToFront(): Promise<void>;
  close(): Promise<void>;
}

// ── Mouse ─────────────────────────────────────────────────────────────────────

interface TxMouseClickOptions { button?: 'left' | 'right' | 'middle'; clickCount?: number; delay?: number; }
interface TxMouseButton { button?: 'left' | 'right' | 'middle'; }

interface Mouse {
  click(x: number, y: number, opts?: TxMouseClickOptions): Promise<void>;
  dblclick(x: number, y: number, opts?: { button?: 'left' | 'right' | 'middle'; delay?: number }): Promise<void>;
  down(opts?: TxMouseButton): Promise<void>;
  move(x: number, y: number, opts?: { steps?: number }): Promise<void>;
  up(opts?: TxMouseButton): Promise<void>;
  wheel(deltaX: number, deltaY: number): Promise<void>;
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
  frameLocator(selector: string): FrameLocator;

  // ── Waits ─────────────────────────────────────────────────────────────────────
  waitForURL(url: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  waitForSelector(selector: string, opts?: { state?: 'visible' | 'attached'; timeout?: number }): Promise<Locator>;
  waitForTimeout(ms: number): Promise<void>;

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  keyboard: {
    press(key: string): Promise<void>;
    type(text: string, opts?: { delay?: number }): Promise<void>;
  };

  // ── Mouse ─────────────────────────────────────────────────────────────────────
  mouse: Mouse;

  // ── Viewport ──────────────────────────────────────────────────────────────────
  setViewportSize(size: { width: number; height: number }): void;

  // ── Script evaluation ─────────────────────────────────────────────────────────
  /**
   * Evaluate a function or expression in the page's JavaScript context and return the result.
   *
   * - **string** — evaluated as an expression in the iframe window scope.
   * - **function** — serialized to a self-calling IIFE; cannot close over test-scope variables.
   * - **arg** — passed as the sole argument when `pageFunction` is a function (must be JSON-serializable).
   *
   * If the result is a `Promise` it is awaited before returning. Non-serializable
   * return values (e.g. DOM nodes) are returned as-is since tx runs in the same process.
   */
  evaluate<T = any>(pageFunction: string | ((...args: any[]) => T | Promise<T>), arg?: any): Promise<T>;

  // ── Script injection ──────────────────────────────────────────────────────────
  /**
   * Register a script that runs in the page on every navigation, before any test
   * code interacts with the page.
   *
   * - **string** — executed as-is in the iframe window scope.
   * - **function** — serialized to a self-calling IIFE; cannot close over test-scope variables.
   * - **arg** — passed as the sole argument when `script` is a function (must be JSON-serializable).
   *
   * Returns a handle whose `dispose()` method removes this script from future navigations.
   */
  addInitScript(script: string | ((...args: any[]) => void), arg?: any): TxScriptHandle;

  // ── Locator handlers ──────────────────────────────────────────────────────────
  /**
   * Register a handler that is invoked automatically whenever `locator` is visible,
   * checked before every Locator action (`click`, `fill`, `press`, …).
   *
   * Useful for dismissing overlays, cookie banners, or modals that appear at
   * unpredictable times and would otherwise block test interactions.
   *
   * Actions performed inside a handler do not re-trigger handler checks (re-entrancy guard).
   */
  addLocatorHandler(
    locator: Locator,
    handler: (locator: Locator) => Promise<void>,
    options?: TxLocatorHandlerOptions
  ): void;

  /** Remove a handler previously registered with {@link Page.addLocatorHandler}. */
  removeLocatorHandler(locator: Locator): void;

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

// ── APIResponse ───────────────────────────────────────────────────────────────

interface APIResponse {
  ok(): boolean;
  status(): number;
  statusText(): string;
  headers(): Record<string, string>;
  url(): string;
  json<T = unknown>(): Promise<T>;
  text(): Promise<string>;
  body(): Promise<ArrayBuffer>;
}

// ── APIRequestContext ─────────────────────────────────────────────────────────

interface APIRequestContext {
  fetch(url: string, options?: RequestInit): Promise<APIResponse>;
}

// ── Browser ───────────────────────────────────────────────────────────────────

interface Browser {
  /** Open a new tab and return a page object for it. */
  newPage(): Promise<PopupPage>;

  /** Return page objects for all currently open tabs. */
  pages(): PopupPage[];

  /**
   * Execute a named task in the Node.js context and return its result.
   *
   * Tasks are defined in `tx.config.js` under the `tasks` key.
   * The handler receives `payload` as its sole argument and may be async.
   * The return value must be JSON-serializable.
   *
   * Throws if the task name is not registered or if the handler throws.
   *
   * @param name    - The task name as registered in `tx.config.js`
   * @param payload - Optional JSON-serializable argument passed to the handler
   *
   * @example
   * // tx.config.js
   * tasks: {
   *   readFile: ({ path }) => require('fs').readFileSync(path, 'utf-8'),
   * }
   *
   * // test file
   * const content = await browser.task('readFile', { path: '/tmp/data.json' });
   */
  task<T = unknown>(name: string, payload?: unknown): Promise<T>;
}

// ── Fixture types ─────────────────────────────────────────────────────────────

type TxUseCallback<T> = (value: T) => Promise<void>;
type TxFixtureFn<T, F extends Record<string, any>> = (fixtures: F, use: TxUseCallback<T>) => Promise<void>;
type TxFixtureDefs<F extends Record<string, any>> = { [K in keyof F]: TxFixtureFn<F[K], any> };

interface TxBaseFixtures {
  page: Page;
  browser: Browser;
  request: APIRequestContext;
  expect: {
    (actual: Page): PageAssertions;
    (actual: Locator): LocatorAssertions;
    (actual: any): ValueAssertions;
  };
}

interface TestFactory<F extends Record<string, any> = TxBaseFixtures> {
  (name: string, fn: (fixtures: F) => void | Promise<void>): void;
  extend<NewF extends Record<string, any>>(defs: TxFixtureDefs<NewF>): TestFactory<F & NewF>;
}

// ── Globals injected by the test runner ───────────────────────────────────────

declare const page: Page;
declare const browser: Browser;
declare const request: APIRequestContext;

declare function expect(actual: Page): PageAssertions;
declare function expect(actual: Locator): LocatorAssertions;
declare function expect(actual: any): ValueAssertions;

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: (fixtures: TxBaseFixtures) => void | Promise<void>): void;
declare const test: TestFactory<TxBaseFixtures>;
declare function beforeAll(fn: () => void | Promise<void>): void;
declare function afterAll(fn: () => void | Promise<void>): void;
declare function beforeEach(fn: (fixtures: TxBaseFixtures) => void | Promise<void>): void;
declare function beforeEach(fn: () => void | Promise<void>): void;
declare function afterEach(fn: (fixtures: TxBaseFixtures) => void | Promise<void>): void;
declare function afterEach(fn: () => void | Promise<void>): void;

// ── 'tx' module — available via require('tx') or import from 'tx' ─────────────

declare module 'tx' {
  export { Locator, FrameLocator, Page, PopupPage, Browser };
  export { LocatorAssertions, PageAssertions, ValueAssertions };
  export { TxDialog, TxDownload, TxFileChooser, TxFrame, TxRequest, TxResponse, TxConsoleMessage };
  export { TxScriptHandle, TxLocatorHandlerOptions, TxFilePayload };
  export { TxBaseFixtures, TxFixtureFn, TxFixtureDefs, TxUseCallback, TestFactory };
  export { Mouse, TxMouseClickOptions, TxMouseButton };
  export { APIResponse, APIRequestContext };

  export const page: Page;
  export const browser: Browser;
  export const request: APIRequestContext;
  export const test: TestFactory<TxBaseFixtures>;

  export function expect(actual: Page): PageAssertions;
  export function expect(actual: Locator): LocatorAssertions;
  export function expect(actual: any): ValueAssertions;
}
