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

// ── StorageState ──────────────────────────────────────────────────────────────

interface TxStorageState {
  /** Serialized tough-cookie jar from the hammerhead proxy session. Treat as opaque. */
  cookieJar: object;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

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
  /** Returns a locator pointing to the nth (zero-based) matched element. */
  nth(n: number): Locator;
  /** Returns a locator pointing to the first matched element. */
  first(): Locator;
  /** Returns a locator pointing to the last matched element. */
  last(): Locator;
  /** Returns a new locator filtered by the given conditions. */
  filter(opts: { hasText?: string | RegExp; hasNotText?: string | RegExp; visible?: boolean }): Locator;
  /** Returns a locator for a descendant element matching `selector` within the current locator's elements. */
  locator(selector: string): Locator;

  // ── Actions ─────────────────────────────────────────────────────────────────
  /** Clicks the element. Waits for it to be actionable unless `force` is set. */
  click(opts?: { force?: boolean; timeout?: number }): Promise<void>;
  /** Double-clicks the element. */
  dblclick(opts?: TxTimeoutOptions): Promise<void>;
  /** Right-clicks the element, triggering a context-menu event. */
  rightClick(opts?: TxTimeoutOptions): Promise<void>;
  /** Clears any existing value, then types `value` into the element. */
  fill(value: string, opts?: TxFillOptions): Promise<void>;
  /** Clears the current value of an input or textarea. */
  clear(opts?: TxTimeoutOptions): Promise<void>;
  /** Types `text` character by character into the element, firing key events for each character. */
  type(text: string, opts?: { delay?: number; timeout?: number }): Promise<void>;
  /** Presses a keyboard key on the element. Supports modifier combos, e.g. `'Shift+A'`. */
  press(key: string, opts?: TxTimeoutOptions): Promise<void>;
  /** Selects one or more `<option>` elements by value inside a `<select>`. */
  selectOption(value: string | string[], opts?: TxTimeoutOptions): Promise<void>;
  /** Checks a checkbox or radio input. */
  check(opts?: TxTimeoutOptions): Promise<void>;
  /** Unchecks a checkbox input. */
  uncheck(opts?: TxTimeoutOptions): Promise<void>;
  /** Moves keyboard focus to the element. */
  focus(opts?: TxTimeoutOptions): Promise<void>;
  /** Removes keyboard focus from the element. */
  blur(opts?: TxTimeoutOptions): Promise<void>;
  /** Moves the mouse pointer over the element, triggering hover/mouseover events. */
  hover(opts?: TxTimeoutOptions): Promise<void>;
  /** Scrolls the element into view if it is outside the visible area of the page. */
  scrollIntoViewIfNeeded(opts?: TxTimeoutOptions): Promise<void>;
  /** Sets the value of a file input. Accepts a path string, an array of paths, or `TxFilePayload` descriptors. */
  setInputFiles(files: string | string[] | TxFilePayload | TxFilePayload[], opts?: TxTimeoutOptions): Promise<void>;

  // ── State queries ────────────────────────────────────────────────────────────
  /** Returns the `textContent` of the element, or `null` if the element has no text content. */
  textContent(): Promise<string | null>;
  /** Returns the `innerText` of the element (visible text only, affected by CSS). */
  innerText(): Promise<string>;
  /** Returns the current value of an input, textarea, or select element. */
  inputValue(): Promise<string>;
  /** Returns the value of the named attribute, or `null` if the attribute is absent. */
  getAttribute(name: string): Promise<string | null>;
  /** Returns `true` if the element is visible (not hidden by CSS or `display:none`). */
  isVisible(): Promise<boolean>;
  /** Returns `true` if the element is hidden or not present in the DOM. */
  isHidden(): Promise<boolean>;
  /** Returns `true` if the element is not disabled. */
  isEnabled(): Promise<boolean>;
  /** Returns `true` if the element is disabled. */
  isDisabled(): Promise<boolean>;
  /** Returns `true` if the checkbox or radio element is checked. */
  isChecked(): Promise<boolean>;
  /** Returns `true` if the element is editable (an input that is not read-only or disabled). */
  isEditable(): Promise<boolean>;
  /** Returns the number of elements matched by this locator. */
  count(): Promise<number>;
  /** Evaluates `pageFunction` in the page context with the matched element as its argument and returns the result. */
  evaluate<T = any>(pageFunction: string | ((element: Element, arg?: any) => T | Promise<T>), arg?: any): Promise<T>;
  /** Waits for the element to reach the given state (default `'visible'`). */
  waitFor(opts?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number }): Promise<void>;
  /** Returns the bounding box of the element in the iframe viewport coordinate space, or `null` if the element is not found. */
  boundingBox(opts?: TxTimeoutOptions): Promise<{ x: number; y: number; width: number; height: number } | null>;
  /** Returns a YAML string representing the ARIA accessibility tree rooted at the matched element. */
  ariaSnapshot(opts?: TxTimeoutOptions): Promise<string>;
}

// ── Assertions ────────────────────────────────────────────────────────────────

interface LocatorAssertions extends TxLocatorMatchers {
  /** Asserts that the element is visible on the page. */
  toBeVisible(opts?: TxTimeoutOptions): Promise<void>;
  /** Asserts that the element is hidden or not present in the DOM. */
  toBeHidden(opts?: TxTimeoutOptions): Promise<void>;
  /** Asserts that the element is not disabled. */
  toBeEnabled(opts?: TxTimeoutOptions): Promise<void>;
  /** Asserts that the element is disabled. */
  toBeDisabled(opts?: TxTimeoutOptions): Promise<void>;
  /** Asserts that the checkbox or radio element is checked. */
  toBeChecked(opts?: TxTimeoutOptions): Promise<void>;
  /** Asserts that the element is editable (not read-only or disabled). */
  toBeEditable(opts?: TxTimeoutOptions): Promise<void>;
  /** Asserts that the element has no value (empty input, textarea, or no text content). */
  toBeEmpty(opts?: TxTimeoutOptions): Promise<void>;
  /** Asserts that the element's text content exactly matches `text` (or matches the RegExp). */
  toHaveText(text: string | RegExp, opts?: TxTextOptions): Promise<void>;
  /** Asserts that the element's text content includes `text` (or a portion matching the RegExp). */
  toContainText(text: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  /** Asserts that the input, textarea, or select element has the given `value`. */
  toHaveValue(value: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  /** Asserts that the element has attribute `name`, optionally equal to `value`. */
  toHaveAttribute(name: string, value?: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  /** Asserts that the locator matches exactly `count` elements. */
  toHaveCount(count: number, opts?: TxTimeoutOptions): Promise<void>;
  /** Asserts that the element has the given CSS class in its `className`. */
  toHaveClass(cls: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  /** Asserts that the element's computed CSS `property` equals `value`. */
  toHaveCSS(property: string, value: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  /** Retries the preceding assertion until it passes or `timeout` is exceeded. */
  toPass(opts?: TxTimeoutOptions): Promise<void>;
  /** Negates all assertions on this object. */
  not: Omit<LocatorAssertions, 'not'>;
}

interface PageAssertions extends TxPageMatchers {
  /** Asserts that the page's `<title>` matches `titleOrRegExp`. */
  toHaveTitle(titleOrRegExp: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  /** Asserts that the page's current URL matches `url`. */
  toHaveURL(url: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  /** Retries the preceding assertion until it passes or `timeout` is exceeded. */
  toPass(opts?: TxTimeoutOptions): Promise<void>;
  /** Negates all assertions on this object. */
  not: Omit<PageAssertions, 'not'>;
}

interface ValueAssertions extends TxValueMatchers {
  /** Asserts strict equality (`===`) to `expected`. */
  toBe(expected: any): void;
  /** Asserts deep equality to `expected`. */
  toEqual(expected: any): void;
  /** Asserts that the value is truthy. */
  toBeTruthy(): void;
  /** Asserts that the value is falsy. */
  toBeFalsy(): void;
  /** Asserts that the value is `null`. */
  toBeNull(): void;
  /** Asserts that the value is `undefined`. */
  toBeUndefined(): void;
  /** Asserts that the numeric value is greater than `n`. */
  toBeGreaterThan(n: number): void;
  /** Asserts that the numeric value is less than `n`. */
  toBeLessThan(n: number): void;
  /** Asserts that an array contains `item`, or a string contains the substring `item`. */
  toContain(item: any): void;
  /** Asserts that the string value matches the RegExp or contains the substring. */
  toMatch(r: RegExp | string): void;
  /** Retries the preceding assertion until it passes or `timeout` is exceeded. */
  toPass(opts?: TxTimeoutOptions): Promise<void>;
  /** Negates all assertions on this object. */
  not: Omit<ValueAssertions, 'not'>;
}

// ── Page event payload types ───────────────────────────────────────────────────

interface TxConsoleMessage {
  /** Returns the console message type (e.g. `'log'`, `'error'`, `'warning'`). */
  type(): string;
  /** Returns the text content of the console message. */
  text(): string;
  /** Returns the list of arguments passed to the console call. */
  args(): any[];
  /** Returns the source location where the console method was called. */
  location(): { url: string; lineNumber: number; columnNumber: number };
}

interface TxRequest {
  /** Returns the request URL. */
  url(): string;
  /** Returns the HTTP method (e.g. `'GET'`, `'POST'`). */
  method(): string;
  /** Returns the HTTP request headers as a key-value map. */
  headers(): Record<string, string>;
  /** Returns the request body, or `null` for requests without a body. */
  postData(): any;
  /** Returns `true` if this request is a top-level navigation request. */
  isNavigationRequest(): boolean;
  /** Returns the resource type (e.g. `'document'`, `'fetch'`, `'xhr'`, `'image'`). */
  resourceType(): string;
}

interface TxResponse {
  /** Returns the response URL. */
  url(): string;
  /** Returns the HTTP status code (e.g. `200`, `404`). */
  status(): number;
  /** Returns the HTTP status text (e.g. `'OK'`, `'Not Found'`). */
  statusText(): string;
  /** Returns `true` if the status code is in the 200–299 range. */
  ok(): boolean;
  /** Returns the HTTP response headers as a key-value map. */
  headers(): Record<string, string>;
  /** Returns the response body as a string, or `null`. */
  body(): string | null;
  /** Returns the {@link TxRequest} that initiated this response. */
  request(): TxRequest;
}

interface TxFailedRequest extends TxRequest {
  /** Returns failure details including the human-readable error text. */
  failure(): { errorText: string };
}

interface TxDialog {
  /** Returns the dialog type: `'alert'`, `'confirm'`, or `'prompt'`. */
  type(): 'alert' | 'confirm' | 'prompt';
  /** Returns the message text displayed inside the dialog. */
  message(): string;
  /** Returns the default value of a prompt dialog (empty string for alert/confirm). */
  defaultValue(): string;
  /** Accepts the dialog, optionally providing `promptText` for prompt dialogs. */
  accept(promptText?: string): void;
  /** Dismisses the dialog (equivalent to clicking Cancel). */
  dismiss(): void;
}

interface TxDownload {
  /** Returns the download URL. */
  url(): string;
  /** Returns the suggested filename derived from the `Content-Disposition` header or URL. */
  suggestedFilename(): string;
  /** Returns a Web ReadableStream of the downloaded file's bytes. */
  createReadStream(): Promise<ReadableStream<Uint8Array>>;
  /** Saves the downloaded file to `path` on the server's filesystem. */
  saveAs(path: string): Promise<void>;
}

interface TxFileChooser {
  /** Returns the underlying `<input type="file">` element. */
  element(): HTMLInputElement;
  /** Returns `true` if the file input accepts multiple files. */
  isMultiple(): boolean;
  /** Returns the `accept` attribute of the file input (e.g. `'image/*'`). */
  accept(): string;
  /** Sets the chosen files on the file input element, triggering a `change` event. */
  setFiles(files: File[]): void;
}

interface TxFrame {
  /** Returns the URL of the frame's current document. */
  url(): string;
  /** Returns the `name` attribute of the `<iframe>` element. */
  name(): string;
  /** Returns `true` if this is the top-level (main) frame of the page. */
  isMainFrame(): boolean;
}

// ── FrameLocator ─────────────────────────────────────────────────────────────

interface FrameLocator {
  /** Returns a locator for elements inside this frame matching `selector`. */
  locator(selector: string): Locator;
  /** Returns a locator for elements inside this frame that contain `text`. */
  getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator;
  /** Returns a locator for elements inside this frame matching the given ARIA `role`. */
  getByRole(role: string, opts?: TxNameOptions): Locator;
  /** Returns a locator for form elements inside this frame associated with a `<label>` whose text matches. */
  getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator;
  /** Returns a locator for inputs inside this frame with matching placeholder text. */
  getByPlaceholder(text: string | RegExp): Locator;
  /** Returns a locator for elements inside this frame with the given `data-testid` attribute. */
  getByTestId(id: string): Locator;
  /** Returns a locator for elements inside this frame with a matching `alt` attribute. */
  getByAltText(text: string | RegExp): Locator;
  /** Returns a locator for elements inside this frame with a matching `title` attribute. */
  getByTitle(text: string | RegExp): Locator;
  /** Returns a `FrameLocator` for a nested `<iframe>` matching `selector` within this frame. */
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
  /** Moves the mouse to `(x, y)` and fires a click event. */
  click(x: number, y: number, opts?: TxMouseClickOptions): Promise<void>;
  /** Moves the mouse to `(x, y)` and fires a double-click event. */
  dblclick(x: number, y: number, opts?: { button?: 'left' | 'right' | 'middle'; delay?: number }): Promise<void>;
  /** Fires a `mousedown` event at the current mouse position. */
  down(opts?: TxMouseButton): Promise<void>;
  /** Moves the mouse to `(x, y)`. Pass `steps` to interpolate intermediate `mousemove` events. */
  move(x: number, y: number, opts?: { steps?: number }): Promise<void>;
  /** Fires a `mouseup` event at the current mouse position. */
  up(opts?: TxMouseButton): Promise<void>;
  /** Dispatches a wheel event at the current mouse position with the given scroll deltas. */
  wheel(deltaX: number, deltaY: number): Promise<void>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface Page {
  // ── Navigation ───────────────────────────────────────────────────────────────
  /** Navigates the page to `url` and waits for the load event. */
  goto(url: string): Promise<void>;
  /** Reloads the current page. */
  reload(): Promise<void>;
  /** Returns the current page URL. */
  url(): string;
  /** Returns the current page title. */
  title(): Promise<string>;

  // ── Locator factories ─────────────────────────────────────────────────────────
  /** Returns a locator for elements matching the CSS or XPath `selector`. */
  locator(selector: string): Locator;
  /** Returns a locator for elements that contain `text` (substring match by default). */
  getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator;
  /** Returns a locator for elements with the given ARIA `role`, optionally filtered by `name`. */
  getByRole(role: string, opts?: TxNameOptions): Locator;
  /** Returns a locator for form elements associated with a `<label>` whose text matches. */
  getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator;
  /** Returns a locator for inputs with a matching placeholder attribute. */
  getByPlaceholder(text: string | RegExp): Locator;
  /** Returns a locator for elements with the given `data-testid` attribute value. */
  getByTestId(id: string): Locator;
  /** Returns a locator for elements with a matching `alt` attribute. */
  getByAltText(text: string | RegExp): Locator;
  /** Returns a locator for elements with a matching `title` attribute or tooltip. */
  getByTitle(text: string | RegExp): Locator;
  /** Returns a {@link FrameLocator} for a child `<iframe>` matching `selector`. */
  frameLocator(selector: string): FrameLocator;

  // ── Waits ─────────────────────────────────────────────────────────────────────
  /** Waits until the page URL matches `url`. */
  waitForURL(url: string | RegExp, opts?: TxTimeoutOptions): Promise<void>;
  /** Waits for an element matching `selector` to reach the given `state` and returns its locator. */
  waitForSelector(selector: string, opts?: { state?: 'visible' | 'attached'; timeout?: number }): Promise<Locator>;
  /** Pauses test execution for `ms` milliseconds. */
  waitForTimeout(ms: number): Promise<void>;
  /** Waits for a request whose URL (or predicate return value) matches, then returns it. */
  waitForRequest(urlOrPredicate: string | RegExp | ((req: TxRequest) => boolean | Promise<boolean>), opts?: TxTimeoutOptions): Promise<TxRequest>;
  /** Waits for a response whose URL (or predicate return value) matches, then returns it. */
  waitForResponse(urlOrPredicate: string | RegExp | ((resp: TxResponse) => boolean | Promise<boolean>), opts?: TxTimeoutOptions): Promise<TxResponse>;

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  keyboard: Keyboard;

  // ── Mouse ─────────────────────────────────────────────────────────────────────
  mouse: Mouse;

  // ── Viewport ──────────────────────────────────────────────────────────────────
  /** Sets the page viewport to the given `width` and `height` in CSS pixels. */
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

  /**
   * Returns a YAML string representing the ARIA accessibility tree of the current page.
   * Uses a Playwright-compatible format, e.g.:
   * ```yaml
   * - heading "Page Title" [level=1]
   * - navigation:
   *   - link "Home"
   *   - link "About"
   * - button "Submit" [disabled]
   * - textbox "Email": "user@example.com"
   * ```
   */
  ariaSnapshot(): Promise<string>;

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
  /** Registers an event listener. Returns `this` for chaining. */
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

  /** Removes a previously registered event listener. Returns `this` for chaining. */
  off(event: string, fn: (...args: any[]) => any): Page;
  /** Registers a one-time event listener that auto-removes after the first invocation. Returns `this` for chaining. */
  once(event: string, fn: (...args: any[]) => any): Page;

  /** Waits for the next occurrence of `event` and resolves with the event payload. */
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

  /** Closes the current page (tab). */
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

interface TxRouteFetchOptions {
  /** Override the URL for the upstream request. Defaults to the intercepted request URL. */
  url?: string;
  /** Override the HTTP method. Defaults to the intercepted request method. */
  method?: string;
  /** Headers merged on top of the intercepted request headers. */
  headers?: Record<string, string>;
  /** Override the request body. */
  postData?: BodyInit;
}

interface Route {
  /** Fulfills the intercepted request with the provided options (status, headers, body, etc.). */
  fulfill(options?: TxRouteFulfillOptions): Promise<void>;
  /** Aborts the intercepted request with the given error code (e.g. `'failed'`, `'blockedbyclient'`). */
  abort(errorCode?: string): Promise<void>;
  /** Continues the intercepted request, optionally overriding URL, method, headers, or body. */
  continue(options?: TxRouteContinueOptions): Promise<void>;
  /**
   * Fetch the actual upstream response from within a route handler without triggering
   * route interception again. Use this to inspect or modify the real server response
   * before fulfilling it.
   *
   * @example
   * await page.route('**\/api/items', async route => {
   *   const resp = await route.fetch();
   *   const json = await resp.json();
   *   json.push({ id: 999, name: 'injected' });
   *   await route.fulfill({ json });
   * });
   */
  fetch(options?: TxRouteFetchOptions): Promise<Response>;
  /** Returns the {@link TxRequest} object for the intercepted request. */
  request(): TxRequest;
}

// ── APIResponse ───────────────────────────────────────────────────────────────

interface APIResponse {
  /** Returns `true` if the HTTP status code is in the 200–299 range. */
  ok(): boolean;
  /** Returns the HTTP status code. */
  status(): number;
  /** Returns the HTTP status text (e.g. `'OK'`). */
  statusText(): string;
  /** Returns the response headers as a key-value map. */
  headers(): Record<string, string>;
  /** Returns the response URL. */
  url(): string;
  /** Parses the response body as JSON and returns the result. */
  json<T = unknown>(): Promise<T>;
  /** Returns the response body as a string. */
  text(): Promise<string>;
  /** Returns the raw response body as an `ArrayBuffer`. */
  body(): Promise<ArrayBuffer>;
}

// ── APIRequestContext ─────────────────────────────────────────────────────────

interface APIRequestContext {
  /** Sends an HTTP request to `url` with the given `options` and returns the response. */
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

  /**
   * Capture the current storage state — cookies visible to the page and localStorage
   * for the current origin — in a Playwright-compatible format.
   *
   * Pass `path` to also write the state to a JSON file (relative to the working directory).
   *
   * @example
   * await page.goto('https://example.com/login');
   * // ... authenticate ...
   * await browser.storageState({ path: 'auth.json' });
   */
  storageState(opts?: { path?: string }): Promise<TxStorageState>;

  /**
   * Restore a previously captured storage state. Cookies are written via `document.cookie`
   * (hammerhead syncs them into the proxy session) and localStorage is restored for the
   * matching origin. Pass a file path to load from a JSON file saved by {@link Browser.storageState}.
   */
  loadStorageState(state: TxStorageState | string): Promise<void>;
}

// ── NodeContext ───────────────────────────────────────────────────────────────

interface NodeContext {
  /** Execute a named task defined in `tx.config.js` under the `tasks` key. */
  task<T = unknown>(name: string, payload?: unknown): Promise<T>;
}

// ── TxExpect ──────────────────────────────────────────────────────────────────

interface TxExpect<T extends object = {}> {
  /** Creates an assertion wrapper for `actual`. Throws immediately on failure. */
  (actual: null | undefined): TxAssertions<ValueAssertions, T>;
  (actual: Page): TxAssertions<PageAssertions, T>;
  (actual: Locator): TxAssertions<LocatorAssertions, T>;
  (actual: any): TxAssertions<ValueAssertions, T>;
  /**
   * Non-fatal assertion variant. Failures are collected rather than thrown immediately.
   * All accumulated failures are reported together as a single aggregated error after
   * the test body finishes. Supports all built-in matchers and negation.
   *
   * @example
   * await expect.soft(page.locator('.error')).toBeVisible();
   * expect.soft(value).toBe(expected);
   */
  soft(actual: null | undefined): TxAssertions<ValueAssertions, T>;
  soft(actual: Page): TxAssertions<PageAssertions, T>;
  soft(actual: Locator): TxAssertions<LocatorAssertions, T>;
  soft(actual: any): TxAssertions<ValueAssertions, T>;
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

/** Metadata about the currently running test, available via the `testInfo` fixture. */
interface TestInfo {
  /** The leaf test title (without suite prefix). */
  title: string;
  /** Full title path from outermost suite to test name. */
  titlePath: string[];
  /** Zero-based retry attempt index (0 on the first run). */
  retry: number;
  /** Tags applied to this test. */
  tags: string[];
  /** Maximum time this test may run in ms (from `testTimeout` config, default 30000). */
  timeout: number;
  /** Maximum number of retry attempts configured (from `retries` config, default 0). */
  retries: number;
  /** Default timeout for locator actions in ms (from `actionTimeout` config, default 5000). */
  actionTimeout: number;
  /** Default timeout for `expect()` assertion retry loops in ms (from `expectTimeout` config, default 5000). */
  expectTimeout: number;
}

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
   * Resolve the entry as a hard failure (red ✗). The entry is marked failed
   * and any surrounding group turns red.
   *
   * @param error Optional message appended to the log entry.
   */
  fail(error?: string): void;

  /**
   * Resolve the entry as a soft (non-fatal) failure (amber ⚠). Used by
   * `expect.soft()` — the entry is visually distinct from a hard failure and
   * any surrounding group turns amber rather than red.
   *
   * @param error Optional message appended to the log entry.
   */
  warn(error?: string): void;
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
  testInfo: TestInfo;
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
  export { TxStorageState };
  export { NodeContext };
  export { TxLogFn, TxAttachFn, TxLogCommandFn, TxCommandHandle, TxGroupHandle, TxStepFn };
  export { TestInfo };
  export { TxBaseFixtures, TxFixtureFn, TxFixtureDefs, TxUseCallback, TestFactory, TxTestOptions, TxDescribeOptions };
  export { CustomMatcherResult, CustomMatcherFn };
  export { TxLocatorMatchers, TxPageMatchers, TxValueMatchers };
  export { Keyboard };
  export { Mouse, TxMouseClickOptions, TxMouseButton };
  export { APIResponse, APIRequestContext };
  export { Route, TxRouteFulfillOptions, TxRouteContinueOptions, TxRouteFetchOptions };

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
