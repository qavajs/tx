/**
 * Type declarations for the Tx test runner.
 *
 * Globals available in every test file:
 *   page, browser, expect, describe, it, test, beforeAll, afterAll, beforeEach, afterEach
 *
 * Module available via require / import:
 *   const { page, expect, Locator } = require('@qavajs/tx')
 */

// ── Custom matcher extension ──────────────────────────────────────────────────

interface CustomMatcherResult {
  /** `true` if the assertion currently passes (before negation is applied). */
  pass: boolean;
  /** Error message shown when the assertion fails (positive or negative). */
  message: string;
}

type CustomMatcherFn = (target: any, ...args: any[]) => CustomMatcherResult | Promise<CustomMatcherResult>;

/**
 * Derives the assertion method signature from a custom matcher function.
 * The first parameter (target) is consumed by `expect(target)`, so it is
 * dropped from the assertion method's parameter list.
 */
type MatcherToAssertion<F> =
  F extends (target: any, ...args: infer Args) => any
    ? (...args: Args) => Promise<void>
    : never;

/** Converts a record of custom matcher functions to assertion methods. */
type MatchersToAssertions<M> = { [K in keyof M]: MatcherToAssertion<M[K]> };

/**
 * Intersects a base assertion interface with custom matchers `T`, replacing
 * `not` so it also carries the custom matchers.
 */
type TxAssertions<Base extends object, T extends object> =
  Omit<Base, 'not'> & T & { not: Omit<Base, 'not'> & T };

/**
 * Augment these interfaces in your test setup file to add types for custom
 * matchers registered via `expect.extend(...)`.
 *
 * @example
 * declare global {
 *   interface TxLocatorMatchers {
 *     toHaveItemCount(expected: number): Promise<void>;
 *   }
 *   interface TxValueMatchers {
 *     toBeWithinRange(min: number, max: number): void;
 *   }
 * }
 */
interface TxLocatorMatchers {}
interface TxPageMatchers {}
interface TxValueMatchers {}

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

interface LocatorAssertions extends TxLocatorMatchers {
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
  toPass(opts?: TxTimeoutOptions): Promise<void>;
  not: Omit<LocatorAssertions, 'not'>;
}

interface PageAssertions extends TxPageMatchers {
  toHaveTitle(titleOrRegExp: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  toHaveURL(url: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  toPass(opts?: TxTimeoutOptions): Promise<void>;
  not: Omit<PageAssertions, 'not'>;
}

interface ValueAssertions extends TxValueMatchers {
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
  toPass(opts?: TxTimeoutOptions): Promise<void>;
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
  headers(): Record<string, string>;
  body(): string | null;
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
  /** Returns a Web ReadableStream of the downloaded file's bytes. */
  createReadStream(): Promise<ReadableStream<Uint8Array>>;
  /** Saves the downloaded file to `path` on the server's filesystem. */
  saveAs(path: string): Promise<void>;
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

// ── Keyboard ──────────────────────────────────────────────────────────────────

interface Keyboard {
  /**
   * Dispatches a `keydown` event for `key` and marks it as held.
   * Modifier keys (`Shift`, `Control`, `Alt`, `Meta`) affect the `shiftKey` /
   * `ctrlKey` / `altKey` / `metaKey` flags of subsequent events until `up()` is called.
   */
  down(key: string): Promise<void>;

  /** Dispatches a `keyup` event for `key` and releases it from the held-modifier set. */
  up(key: string): Promise<void>;

  /**
   * Fires `keydown` → `keypress` (for printable keys) → `keyup` on the focused element.
   *
   * Supports modifier combos via `+` notation, e.g. `'Shift+A'`, `'Control+c'`, `'Meta+a'`.
   * Named keys: `'Enter'`, `'Tab'`, `'Escape'`, `'Backspace'`, `'Delete'`, `'ArrowUp'`,
   * `'ArrowDown'`, `'ArrowLeft'`, `'ArrowRight'`, `'Home'`, `'End'`, `'PageUp'`,
   * `'PageDown'`, `'Space'`, `'F1'`–`'F12'`, modifier names, etc.
   */
  press(key: string, opts?: { delay?: number }): Promise<void>;

  /**
   * Types `text` character by character into the focused element.
   * For each character fires `keydown` → `keypress` → `input` → `keyup` and
   * updates the element's value (React / Vue native-setter compatible).
   */
  type(text: string, opts?: { delay?: number }): Promise<void>;

  /**
   * Inserts `text` directly into the focused input or textarea value and fires
   * an `input` event — without generating any key events.
   */
  insertText(text: string): Promise<void>;
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
  waitForRequest(urlOrPredicate: string | RegExp | ((req: TxRequest) => boolean | Promise<boolean>), opts?: TxTimeoutOptions): Promise<TxRequest>;
  waitForResponse(urlOrPredicate: string | RegExp | ((resp: TxResponse) => boolean | Promise<boolean>), opts?: TxTimeoutOptions): Promise<TxResponse>;

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  keyboard: Keyboard;

  // ── Mouse ─────────────────────────────────────────────────────────────────────
  mouse: Mouse;

  // ── Viewport ──────────────────────────────────────────────────────────────────
  setViewportSize(size: { width: number; height: number }): void;

  // ── Screenshot ────────────────────────────────────────────────────────────────
  /**
   * Capture the current iframe as a PNG and return a data URL.
   * Pass `path` to also save the file to `<path>.png` relative to the working directory.
   */
  screenshot(opts?: { path?: string }): Promise<string>;

  /**
   * Capture the current page as a self-contained HTML string with all CSS, images, and fonts
   * inlined as data URLs. Pass `path` to also save to `<path>.html` relative to the working directory.
   */
  snapshot(opts?: { path?: string }): Promise<string>;

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

  // ── Route interception ────────────────────────────────────────────────────────

  /**
   * Intercept requests matching `url` and invoke `handler` with a {@link Route} object.
   *
   * - **string** — treated as a glob pattern (`*` = single segment, `**` = any).
   * - **RegExp** — tested against the full request URL.
   * - **function** — called with the URL string; return `true` to match.
   *
   * The handler must call `route.fulfill()`, `route.abort()`, or `route.continue()`.
   * If it returns without calling any of these, the request continues unchanged.
   */
  route(
    url: string | RegExp | ((url: string) => boolean),
    handler: (route: Route, request: TxRequest) => void | Promise<void>
  ): Promise<void>;

  /**
   * Remove a previously registered route handler.
   * If `handler` is omitted, all handlers for `url` are removed.
   */
  unroute(
    url: string | RegExp | ((url: string) => boolean),
    handler?: (route: Route, request: TxRequest) => void | Promise<void>
  ): Promise<void>;

  // ── Events ────────────────────────────────────────────────────────────────────
  on(event: 'close',            fn: () => any): Page;
  on(event: 'console',          fn: (msg: TxConsoleMessage) => any): Page;
  on(event: 'dialog',           fn: (dialog: TxDialog) => any): Page;
  on(event: 'domcontentloaded', fn: () => any): Page;
  on(event: 'download',         fn: (dl: TxDownload) => any): Page;
  on(event: 'filechooser',      fn: (fc: TxFileChooser) => any): Page;
  on(event: 'frameattached',    fn: (frame: TxFrame) => any): Page;
  on(event: 'framedetached',    fn: (frame: TxFrame) => any): Page;
  on(event: 'framenavigated',   fn: (frame: TxFrame) => any): Page;
  on(event: 'load',             fn: () => any): Page;
  on(event: 'pageerror',        fn: (err: Error) => any): Page;
  on(event: 'popup',            fn: (popup: Page) => any): Page;
  on(event: 'request',          fn: (req: TxRequest) => any): Page;
  on(event: 'requestfailed',    fn: (req: TxFailedRequest) => any): Page;
  on(event: 'requestfinished',  fn: (req: TxRequest) => any): Page;
  on(event: 'response',         fn: (res: TxResponse) => any): Page;
  on(event: string,             fn: (...args: any[]) => any): Page;

  off(event: string, fn: (...args: any[]) => any): Page;
  once(event: string, fn: (...args: any[]) => any): Page;

  waitForEvent(event: 'dialog',        options?: { predicate?: (d: TxDialog)          => boolean | Promise<boolean>; timeout?: number } | ((d: TxDialog)          => boolean | Promise<boolean>)): Promise<TxDialog>;
  waitForEvent(event: 'popup',         options?: { predicate?: (p: Page)              => boolean | Promise<boolean>; timeout?: number } | ((p: Page)              => boolean | Promise<boolean>)): Promise<Page>;
  waitForEvent(event: 'console',       options?: { predicate?: (m: TxConsoleMessage)  => boolean | Promise<boolean>; timeout?: number } | ((m: TxConsoleMessage)  => boolean | Promise<boolean>)): Promise<TxConsoleMessage>;
  waitForEvent(event: 'request',       options?: { predicate?: (r: TxRequest)         => boolean | Promise<boolean>; timeout?: number } | ((r: TxRequest)         => boolean | Promise<boolean>)): Promise<TxRequest>;
  waitForEvent(event: 'requestfailed', options?: { predicate?: (r: TxFailedRequest)   => boolean | Promise<boolean>; timeout?: number } | ((r: TxFailedRequest)   => boolean | Promise<boolean>)): Promise<TxFailedRequest>;
  waitForEvent(event: 'requestfinished', options?: { predicate?: (r: TxRequest)       => boolean | Promise<boolean>; timeout?: number } | ((r: TxRequest)         => boolean | Promise<boolean>)): Promise<TxRequest>;
  waitForEvent(event: 'response',      options?: { predicate?: (r: TxResponse)        => boolean | Promise<boolean>; timeout?: number } | ((r: TxResponse)        => boolean | Promise<boolean>)): Promise<TxResponse>;
  waitForEvent(event: 'download',      options?: { predicate?: (d: TxDownload)        => boolean | Promise<boolean>; timeout?: number } | ((d: TxDownload)        => boolean | Promise<boolean>)): Promise<TxDownload>;
  waitForEvent(event: 'filechooser',   options?: { predicate?: (f: TxFileChooser)     => boolean | Promise<boolean>; timeout?: number } | ((f: TxFileChooser)     => boolean | Promise<boolean>)): Promise<TxFileChooser>;
  waitForEvent(event: 'frameattached', options?: { predicate?: (f: TxFrame)           => boolean | Promise<boolean>; timeout?: number } | ((f: TxFrame)           => boolean | Promise<boolean>)): Promise<TxFrame>;
  waitForEvent(event: 'framedetached', options?: { predicate?: (f: TxFrame)           => boolean | Promise<boolean>; timeout?: number } | ((f: TxFrame)           => boolean | Promise<boolean>)): Promise<TxFrame>;
  waitForEvent(event: 'framenavigated', options?: { predicate?: (f: TxFrame)          => boolean | Promise<boolean>; timeout?: number } | ((f: TxFrame)           => boolean | Promise<boolean>)): Promise<TxFrame>;
  waitForEvent(event: 'pageerror',     options?: { predicate?: (e: Error)             => boolean | Promise<boolean>; timeout?: number } | ((e: Error)             => boolean | Promise<boolean>)): Promise<Error>;
  waitForEvent(event: 'load' | 'domcontentloaded' | 'close', options?: { timeout?: number }): Promise<void>;
  waitForEvent<T = any>(event: string, options?: { predicate?: (arg: T) => boolean | Promise<boolean>; timeout?: number } | ((arg: T) => boolean | Promise<boolean>)): Promise<T>;

  /**
   * Clear route handlers, locator handlers, and page listeners; then navigate
   * to a blank page. Also clears localStorage, sessionStorage, and cookies
   * for the current origin (best-effort — cross-origin values are skipped).
   */
  resetSession(): Promise<void>;

  close(): Promise<void>;
}

// ── Route ─────────────────────────────────────────────────────────────────────

interface TxRouteFulfillOptions {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  json?: any;
}

interface TxRouteContinueOptions {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  postData?: string;
}

interface Route {
  fulfill(options?: TxRouteFulfillOptions): Promise<void>;
  abort(errorCode?: string): Promise<void>;
  continue(options?: TxRouteContinueOptions): Promise<void>;
  request(): TxRequest;
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

// ── Tab snapshot ──────────────────────────────────────────────────────────────

/** Describes an open tab as returned by {@link Browser.tabs} and {@link Browser.switchTab}'s predicate argument. */
interface TxTabInfo {
  id: string;
  title: string;
  url: string;
  active: boolean;
}

// ── Browser ───────────────────────────────────────────────────────────────────

interface Browser {
  /**
   * Open a new tab, make it active, and return the global `page` object.
   * Interact with the new tab immediately via `page` — no need to use the return value.
   */
  newPage(): Promise<void>;

  /**
   * Open a new window (popup), make it active, and return the global `page` object.
   * Interact with the new window immediately via `page` — no need to use the return value.
   */
  newWindow(url?: string): Promise<void>;

  /** Return a snapshot of all open tabs. */
  tabs(): TxTabInfo[];

  /**
   * Switch the active tab by matching against tab info fields.
   *
   * @example
   * browser.switchTab(t => t.url.includes('/dashboard'));
   * browser.switchTab(t => t.title === 'My App');
   */
  switchTab(predicate: (tab: TxTabInfo) => boolean): void;
}

// ── NodeContext ───────────────────────────────────────────────────────────────

interface NodeContext {
  /** Execute a named task defined in `tx.config.js` under the `tasks` key. */
  task<T = unknown>(name: string, payload?: unknown): Promise<T>;
}

// ── TxExpect ──────────────────────────────────────────────────────────────────

interface TxExpect<T extends object = {}> {
  (actual: Page): TxAssertions<PageAssertions, T>;
  (actual: Locator): TxAssertions<LocatorAssertions, T>;
  (actual: any): TxAssertions<ValueAssertions, T>;
  /** Returns a new scoped expect with the given custom matchers merged in. */
  extend<M extends Record<string, (target: any, ...args: any[]) => CustomMatcherResult | Promise<CustomMatcherResult>>>(
    matchers: M
  ): TxExpect<T & MatchersToAssertions<M>>;
}

// ── Fixture types ─────────────────────────────────────────────────────────────

type TxUseCallback<T> = (value: T) => Promise<void>;
type TxFixtureFn<T, F extends Record<string, any>> = (fixtures: F, use: TxUseCallback<T>) => Promise<void>;
type TxFixtureDefs<NewF extends Record<string, any>, AllF extends Record<string, any> = NewF> = { [K in keyof NewF]: TxFixtureFn<NewF[K], AllF> };

/** Handle returned by `log.group()`. Call `end()` to close the group and finalize its state. */
interface TxGroupHandle {
  end(): void;
}

/** Writes a message to the command log panel during a test. */
interface TxLogFn {
  (message: string, opts?: { type?: 'info' | 'success' | 'error'; cmd?: string }): void;
  /** Open a pending command entry in the test log and return a handle to resolve it. */
  open: TxLogCommandFn;
  /**
   * Open a collapsible group in the test log.
   *
   * **Imperative form** — open a group manually and close it by calling `handle.end()`:
   * ```ts
   * const g = log.group('My group');
   * const g = log.group('My group', 'step');   // custom cmd label
   * // ... log entries here are nested inside the group ...
   * g.end();
   * ```
   *
   * **Functional form** — all log entries produced inside `fn` are grouped automatically:
   * ```ts
   * await log.group('My group', async () => { ... });
   * await log.group('My group', 'step', async () => { ... });   // custom cmd label
   * ```
   */
  group(message: string, cmd?: string): TxGroupHandle;
  group<T>(message: string, fn: () => T | Promise<T>): Promise<T>;
  group<T>(message: string, cmd: string, fn: () => T | Promise<T>): Promise<T>;
}

/** Attaches named data to the test result for reporters to display. */
type TxAttachFn = (label: string, body: string, contentType?: string) => void;

/** Groups commands in the log panel under a named collapsible step, and returns the callback's result. */
interface TxStepFn {
  <T>(title: string, fn: () => Promise<T>): Promise<T>;
  <T>(title: string, fn: () => T): T;
}

/** Handle returned by `logCommand`. Must be resolved by calling `success` or `fail`. */
interface TxCommandHandle {
  /**
   * Resolve the entry as passed and record its duration.
   *
   * @param duration Elapsed time in milliseconds. Defaults to the time since
   *   `logCommand` was called.
   */
  success(duration?: number): void;

  /**
   * Resolve the entry as failed.
   *
   * @param error Optional message appended to the log entry.
   */
  fail(error?: string): void;
}

/**
 * Open a pending command entry in the test log and return a handle to resolve it.
 *
 * Use this to wrap asynchronous steps so the log shows a spinner while the
 * operation is in progress, then flips to a pass/fail indicator when done.
 *
 * @param message Human-readable description shown in the log panel.
 * @param cmd     Short label for the command type (e.g. `'request'`, `'step'`).
 * @returns A {@link TxCommandHandle} whose `success` or `fail` must be called to close the entry.
 *
 * @example
 * const step = logCommand('fetch user data', 'request');
 * try {
 *   await fetchUserData();
 *   step.success();
 * } catch (err) {
 *   step.fail(err.message);
 *   throw err;
 * }
 */
type TxLogCommandFn = (message: string, cmd: string) => TxCommandHandle;

interface TxBaseFixtures {
  page: Page;
  browser: Browser;
  node: NodeContext;
  request: APIRequestContext;
  log: TxLogFn;
  attach: TxAttachFn;
  step: TxStepFn;
}

interface TxTestOptions {
  /** Tags for filtering, e.g. `['@smoke', '@regression']` */
  tag?: string[];
}

interface TestFactory<F extends Record<string, any> = TxBaseFixtures> {
  (name: string, fn: (fixtures: F) => void | Promise<void>): void;
  (name: string, options: TxTestOptions, fn: (fixtures: F) => void | Promise<void>): void;
  extend<NewF extends Record<string, any>>(defs: TxFixtureDefs<NewF, F & NewF>): TestFactory<F & NewF>;
  describe(name: string, fn: () => void): void;
  describe(name: string, options: TxDescribeOptions, fn: () => void): void;
  beforeEach(fn: (fixtures: F) => void | Promise<void>): void;
  beforeEach(fn: () => void | Promise<void>): void;
  afterEach(fn: (fixtures: F) => void | Promise<void>): void;
  afterEach(fn: () => void | Promise<void>): void;
  beforeAll(fn: () => void | Promise<void>): void;
  afterAll(fn: () => void | Promise<void>): void;
}

interface TxDescribeOptions {
  /** Tags inherited by every test in this describe block, e.g. `['@smoke']` */
  tag?: string[];
}

// ── '@qavajs/tx' module — available via require('@qavajs/tx') or import from '@qavajs/tx' ─────────────

declare module '@qavajs/tx' {
  export { Locator, FrameLocator, Page, Browser };
  export { LocatorAssertions, PageAssertions, ValueAssertions };
  export { TxDialog, TxDownload, TxFileChooser, TxFrame, TxRequest, TxResponse, TxConsoleMessage };
  export { TxScriptHandle, TxLocatorHandlerOptions, TxFilePayload };
  export { TxTabInfo };
  export { NodeContext };
  export { TxLogFn, TxAttachFn, TxLogCommandFn, TxCommandHandle, TxGroupHandle, TxStepFn };
  export { TxBaseFixtures, TxFixtureFn, TxFixtureDefs, TxUseCallback, TestFactory, TxTestOptions, TxDescribeOptions };
  export { CustomMatcherResult, CustomMatcherFn };
  export { TxLocatorMatchers, TxPageMatchers, TxValueMatchers };
  export { Keyboard };
  export { Mouse, TxMouseClickOptions, TxMouseButton };
  export { APIResponse, APIRequestContext };
  export { Route, TxRouteFulfillOptions, TxRouteContinueOptions };

  export const page: Page;
  export const browser: Browser;
  export const node: NodeContext;
  export const request: APIRequestContext;
  export const test: TestFactory<TxBaseFixtures>;
  export const log: TxLogFn;
  export const attach: TxAttachFn;

  export { TxExpect };
  export const expect: TxExpect;

  export function describe(name: string, fn: () => void): void;
  export function describe(name: string, options: TxDescribeOptions, fn: () => void): void;

  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: (fixtures: TxBaseFixtures) => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: (fixtures: TxBaseFixtures) => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
}
