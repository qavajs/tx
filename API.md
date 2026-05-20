# tx API Reference

`tx` is a Playwright-style browser testing framework that runs tests inside a proxied iframe, making any website testable in any browser (including Safari) without WebDriver or extensions.

---

## Table of Contents

- [Configuration](#configuration)
- [Writing Tests](#writing-tests)
- [page](#page)
- [browser](#browser)
  - [browser.newPage](#browsernewpage)
  - [browser.pages](#browserpages)
  - [browser.task](#browsertask)
- [Locator](#locator)
- [expect](#expect)
- [page Events](#page-events)
- [TestRunner (Node.js)](#testrunner-nodejs)
- [TestSuite & Assert (Node.js)](#testsuite--assert-nodejs)
- [Server REST API](#server-rest-api)

---

## Configuration

`tx.config.json` (or passed via `--config` flag):

```json
{
  "proxyHost": "localhost",
  "port1": 1337,
  "port2": 1338,
  "controlPanelPort": 3000,
  "headless": false,
  "testFiles": ["./specs/login.js"],
  "testMatch": "./specs/**/*.js",
  "viewport": { "width": 1920, "height": 1080 }
}
```

| Field              | Type                          | Default       | Description                                      |
|--------------------|-------------------------------|---------------|--------------------------------------------------|
| `proxyHost`        | `string`                      | `"localhost"` | Hostname for the Hammerhead proxy                |
| `port1`            | `number`                      | `1337`        | Proxy port 1                                     |
| `port2`            | `number`                      | `1338`        | Proxy port 2                                     |
| `controlPanelPort` | `number`                      | `3000`        | HTTP server port for the control panel           |
| `headless`         | `boolean`                     | `false`       | Skip opening a browser window                    |
| `testFiles`        | `string[]`                    | —             | Explicit list of test file paths (relative to config) |
| `testMatch`        | `string \| string[]`          | —             | Glob pattern(s) for test file discovery          |
| `viewport`         | `{ width, height }`           | —             | Fixed iframe viewport size; scales to fit panel  |
| `reporters`        | `[path, config][]`            | —             | Reporter modules — see [Reporters](#reporters)   |
| `tasks`            | `Record<string, TaskHandler>` | —             | Named Node.js task handlers — see [browser.task](#browsertask) |

### Reporters

Reporters are specified as `[modulePath, configObject]` tuples. The module path is resolved relative to the config file and may be a `.ts` source file (compiled on demand).

```js
// tx.config.js
module.exports = {
  reporters: [
    ['./ConsoleReporter.ts', {}],
    ['./HtmlReporter.ts', { outputPath: 'report.html' }],
  ],
};
```

Each module must export a class implementing the `Reporter` interface:

```ts
interface Reporter {
  onBegin?(config: FullConfig, suite: Suite): void;
  onTestBegin?(test: TestCase, result: TestResult): void;
  onTestEnd?(test: TestCase, result: TestResult): void;
  onEnd?(result: FullResult): void;
}
```

The constructor receives the config object from the tuple as its sole argument.

---

## Writing Tests

Test files use Playwright/Jest-style globals injected at runtime. No imports are needed.

```js
describe('Suite name', () => {
  beforeEach(async () => {
    await page.goto('https://example.com');
  });

  afterEach(async () => {
    // cleanup
  });

  it('test name', async () => {
    await expect(page.locator('h1')).toBeVisible();
  });

  test('alias for it', async () => {
    expect(page.url()).toContain('example.com');
  });
});
```

### Globals available in test files

| Global        | Description                                              |
|---------------|----------------------------------------------------------|
| `describe`    | Define a test suite                                      |
| `it` / `test` | Define a test case                                       |
| `beforeEach`  | Hook run before each test in the nearest `describe`      |
| `afterEach`   | Hook run after each test in the nearest `describe`       |
| `page`        | Playwright-style page object (see [page](#page))         |
| `browser`     | Multi-tab browser object (see [browser](#browser))       |
| `expect`      | Assertion function (see [expect](#expect))               |
| `log`         | `(message, type?) => void` — write to the panel console  |

---

## page

Operates on the proxied iframe. Available as `window.page` in the browser and as the `page` global in test files.

### Navigation

```js
await page.goto(url: string): Promise<void>
```
Navigate the iframe to `url`. Waits for the `load` event (30 s timeout).

```js
await page.reload(): Promise<void>
```
Reload the current page. Waits for the `load` event.

```js
page.url(): string
```
Return the current URL (proxy prefix stripped).

```js
await page.title(): Promise<string>
```
Return the `<title>` of the current page.

```js
await page.waitForURL(url: string | RegExp, opts?: { timeout?: number }): Promise<void>
```
Poll until `page.url()` matches `url`. Default timeout: 5000 ms.

```js
await page.waitForSelector(selector: string, opts?: { state?: 'visible'|'attached'; timeout?: number }): Promise<Locator>
```
Wait until an element matching `selector` reaches the given state, then return a `Locator` for it.

```js
await page.waitForTimeout(ms: number): Promise<void>
```
Wait unconditionally for `ms` milliseconds.

### Locator factories

```js
page.locator(selector: string): Locator
```
Match elements by CSS selector. Supports the `:has-text("…")` pseudo-class.

```js
page.getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator
```
Match elements by their text content. Prefers leaf (childless) elements. `exact` defaults to `false` (substring match).

```js
page.getByRole(role: string, opts?: { name?: string | RegExp; exact?: boolean }): Locator
```
Match elements by ARIA role. Supported roles: `button`, `link`, `textbox`, `checkbox`, `radio`, `combobox`, `spinbutton`, `heading`, `img`, `listitem`, `list`, `menuitem`, `tab`, `option`, `navigation`, `main`, `banner`, `contentinfo`. Custom roles fall back to `[role="…"]`. Optional `name` filters by accessible name.

```js
page.getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator
```
Match form controls associated with a `<label>` whose text matches, or elements with a matching `aria-label`.

```js
page.getByPlaceholder(text: string | RegExp): Locator
```
Match inputs by their `placeholder` attribute.

```js
page.getByTestId(id: string): Locator
```
Match elements with `[data-testid="id"]` or `[data-test="id"]`.

```js
page.getByAltText(text: string | RegExp): Locator
```
Match elements with a matching `alt` attribute.

```js
page.getByTitle(text: string | RegExp): Locator
```
Match elements with a matching `title` attribute.

### Viewport

```js
page.setViewportSize(size: { width: number; height: number }): void
```
Apply a fixed viewport to the iframe (scales to fit the panel container).

### Script evaluation

```js
await page.evaluate(
  pageFunction: string | ((...args: any[]) => any),
  arg?: any
): Promise<any>
```

Evaluate a function or expression in the page's JavaScript context and return its result. If the result is a `Promise` it is awaited before returning.

- **`pageFunction`** — a JS expression string, or a function. Functions are serialized and called as an IIFE; they cannot close over variables in test scope.
- **`arg`** — passed as the sole argument when `pageFunction` is a function (must be JSON-serializable).

```js
// Expression string
const title = await page.evaluate('document.title');

// Function — read from the page
const itemCount = await page.evaluate(() => {
  return document.querySelectorAll('.item').length;
});

// Function with arg — write into the page
await page.evaluate((token) => {
  localStorage.setItem('auth_token', token);
}, 'my-secret-token');

// Async function — awaited automatically
const data = await page.evaluate(async () => {
  const res = await fetch('/api/user');
  return res.json();
});
```

### Script injection

```js
page.addInitScript(
  script: string | ((...args: any[]) => void),
  arg?: any
): { dispose(): void }
```

Register a script to run inside the page on every navigation, before any test code interacts with the page. Scripts are executed in the iframe's window context in registration order.

- **`script`** — either a JS source string or a function. Functions are serialized and called as an IIFE; they cannot close over variables in test scope.
- **`arg`** — passed as the sole argument when `script` is a function (must be JSON-serializable).
- **Returns** an object with a `dispose()` method that removes this specific script.

Scripts accumulate across navigations for the lifetime of the panel session. Call `dispose()` to stop a script from running on future navigations.

```js
// String form — set a global before the page's own code runs
page.addInitScript(`window.__ENV__ = 'test'`);

// Function form — mock an API
page.addInitScript(() => {
  window.fetch = async () => new Response('{"ok":true}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

// Function form with arg
page.addInitScript((cfg) => {
  window.__CONFIG__ = cfg;
}, { featureFlags: { darkMode: true } });

// Remove a specific script
const handle = page.addInitScript(`window.DEBUG = true`);
// … later:
handle.dispose();
```

### Keyboard

```js
await page.keyboard.press(key: string): Promise<void>
```
Dispatch `keydown`/`keypress`/`keyup` for `key` on the currently focused element.

```js
await page.keyboard.type(text: string, opts?: { delay?: number }): Promise<void>
```
Press each character in `text` sequentially. Optional `delay` (ms) between characters.

### Events

```js
page.on(event: string, fn: (...args) => any): page
page.off(event: string, fn: (...args) => any): page
page.once(event: string, fn: (...args) => any): page
```

See [page Events](#page-events) for available events.

### Locator handlers

```js
page.addLocatorHandler(
  locator: Locator,
  handler: (locator: Locator) => Promise<void>,
  options?: { noWaitAfter?: boolean; times?: number }
): void
```

Register a handler that is called automatically whenever the given locator becomes visible — **before** any Locator action (`click`, `fill`, `press`, etc.) is attempted. This is useful for dismissing overlays, cookie banners, or modals that can appear at unpredictable times and would otherwise block test interactions.

**Options:**

| Option        | Type      | Default | Description                                                                 |
|---------------|-----------|---------|-----------------------------------------------------------------------------|
| `noWaitAfter` | `boolean` | `false` | If `false` (default), after the handler returns tx waits up to 5 s for the locator to become hidden before continuing. Set to `true` to skip the wait. |
| `times`       | `number`  | `0`     | Maximum number of invocations. `0` means unlimited. The handler is automatically removed once the limit is reached. |

```js
page.removeLocatorHandler(locator: Locator): void
```

Remove a previously registered handler by the same locator reference.

**Behavior details:**
- The check runs before every Locator action, not on a timer.
- Handlers do not nest — actions performed inside a handler do not re-trigger handler checks (re-entrancy guard).
- All handlers are cleared when the panel is fully reset (equivalent to a new session).

**Example — cookie consent banner:**

```js
describe('Shopping flow', () => {
  beforeEach(async () => {
    // Dismiss the cookie banner whenever it appears, throughout the suite
    page.addLocatorHandler(
      page.locator('#cookie-banner'),
      async (banner) => {
        await banner.getByRole('button', { name: 'Accept all' }).click();
      }
    );

    await page.goto('https://shop.example.com');
  });

  it('adds item to cart', async () => {
    // If the banner appears before or during this click, it is dismissed first
    await page.locator('.add-to-cart').click();
    await expect(page.locator('.cart-count')).toHaveText('1');
  });
});
```

**Example — dismiss a modal at most once:**

```js
page.addLocatorHandler(
  page.locator('.promo-modal'),
  async (modal) => {
    await modal.locator('[aria-label="Close"]').click();
  },
  { times: 1 }
);
```

**Example — non-blocking tooltip removal:**

```js
page.addLocatorHandler(
  page.locator('.blocking-tooltip'),
  async () => {
    await page.keyboard.press('Escape');
  },
  { noWaitAfter: true }   // tooltip may linger; don't stall the test
);
```

### Lifecycle

```js
await page.bringToFront(): Promise<void>
```
Switch the tab bar focus to this page (makes it the active/visible tab).

```js
await page.close(): Promise<void>
```
Close this tab and emit the `close` event. If other tabs are open the most recent one becomes active.

---

## browser

Multi-tab manager available as the `browser` global in test files.

### browser.newPage

```js
const newPage = await browser.newPage(): Promise<Page>
```
Open a new blank tab and return a `Page`-like object for it. The new tab becomes the active tab immediately. Navigating via `page.goto()` still operates on whichever tab is currently active; use the returned object (or `page.bringToFront()`) to control specific tabs.

### browser.pages

```js
const pages = browser.pages(): Page[]
```
Return an array of `Page`-like objects for every currently open tab, in creation order.

### browser.task

```js
await browser.task<T = unknown>(name: string, payload?: unknown): Promise<T>
```

Execute a named task handler in the **Node.js process** and return its result to the test. This is the primary way to access Node.js APIs (file system, databases, environment variables, etc.) from within browser-side test code.

**Parameters:**

| Parameter | Type      | Description                                                   |
|-----------|-----------|---------------------------------------------------------------|
| `name`    | `string`  | The task name as registered in `tx.config.js` under `tasks`  |
| `payload` | `unknown` | Optional JSON-serializable argument passed to the handler     |

**Returns:** A `Promise` that resolves to the handler's return value (must be JSON-serializable). Throws if the task name is not registered or the handler throws.

**Defining tasks in `tx.config.js`:**

```js
const fs = require('fs');

module.exports = {
  // ...
  tasks: {
    // Simple value
    getEnv: (name) => process.env[name] ?? null,

    // File system
    readFile: ({ path }) => fs.readFileSync(path, 'utf-8'),
    writeFile: ({ path, content }) => { fs.writeFileSync(path, content); return null; },

    // Async — database seed, API call, etc.
    seedDatabase: async (records) => {
      await db.insertMany(records);
      return records.length;
    },
  },
};
```

**Using tasks in tests:**

```js
it('reads a fixture from disk', async () => {
  const json = await browser.task('readFile', { path: './fixtures/user.json' });
  const user = JSON.parse(json);
  expect(user.name).toBe('Alice');
});

it('seeds the database before testing', async () => {
  const inserted = await browser.task('seedDatabase', [{ id: 1, role: 'admin' }]);
  expect(inserted).toBe(1);

  await page.goto('https://app.example.com/users');
  await expect(page.locator('[data-testid="user-row"]')).toHaveCount(1);
});

it('reads an environment variable', async () => {
  const apiKey = await browser.task('getEnv', 'API_KEY');
  // use apiKey in test…
});
```

**Example — multi-tab flow:**

```js
it('opens a popup and reads its title', async () => {
  await page.goto('https://example.com');

  // intercept window.open / target="_blank"
  page.on('popup', async popup => {
    await popup.waitForURL(/popup-page/);
    console.log(await popup.title());
    await popup.close();
  });

  await page.locator('a[target="_blank"]').click();
});

it('manual multi-tab', async () => {
  const tab1 = await browser.newPage();
  await tab1.goto('https://example.com');

  const tab2 = await browser.newPage();
  await tab2.goto('https://example.org');

  console.log(browser.pages().length); // 3  (initial tab + tab1 + tab2)

  await tab1.bringToFront();           // switch UI to tab1
  await tab2.close();
});
```

---

## Locator

A lazy query that re-evaluates against the live DOM on each access. Returned by all `page.locator*` / `page.getBy*` methods.

### Chaining

```js
locator.nth(n: number): Locator          // 0-based index
locator.first(): Locator                  // same as .nth(0)
locator.last(): Locator                   // last matched element
locator.filter(opts: {
  hasText?:    string | RegExp;
  hasNotText?: string | RegExp;
}): Locator                               // filter by text content
locator.locator(selector: string): Locator // scoped child query
```

### Actions

All actions auto-wait up to `timeout` (default 5000 ms) for the element to appear.

```js
await locator.click(opts?: { force?: boolean; timeout?: number }): Promise<void>
await locator.dblclick(opts?: { timeout?: number }): Promise<void>
await locator.fill(value: string, opts?: { timeout?: number; delay?: number }): Promise<void>
```
`fill` clears the field first, then types character-by-character with full keyboard events (works with React/Vue controlled inputs).

```js
await locator.clear(opts?: { timeout?: number }): Promise<void>   // alias for fill('')
await locator.type(text: string, opts?: { delay?: number; timeout?: number }): Promise<void>
```
`type` appends text without clearing (simpler event sequence than `fill`).

```js
await locator.press(key: string, opts?: { timeout?: number }): Promise<void>
await locator.selectOption(value: string | string[], opts?: { timeout?: number }): Promise<void>
await locator.check(opts?: { timeout?: number }): Promise<void>
await locator.uncheck(opts?: { timeout?: number }): Promise<void>
await locator.focus(opts?: { timeout?: number }): Promise<void>
await locator.hover(opts?: { timeout?: number }): Promise<void>
await locator.scrollIntoViewIfNeeded(opts?: { timeout?: number }): Promise<void>
```

### Queries

```js
await locator.textContent(): Promise<string | null>
await locator.innerText(): Promise<string>
await locator.inputValue(): Promise<string>
await locator.getAttribute(name: string): Promise<string | null>
await locator.isVisible(): Promise<boolean>
await locator.isHidden(): Promise<boolean>
await locator.isEnabled(): Promise<boolean>
await locator.isDisabled(): Promise<boolean>
await locator.isChecked(): Promise<boolean>
await locator.isEditable(): Promise<boolean>
await locator.count(): Promise<number>
```

### Waiting

```js
await locator.waitFor(opts?: {
  state?:   'visible' | 'hidden' | 'attached' | 'detached';  // default: 'visible'
  timeout?: number;                                            // default: 5000
}): Promise<void>
```

---

## expect

```js
expect(target): Matchers
```

`expect` is the Playwright-style assertion function. Matchers that take a `Locator` auto-retry until the condition is met or the timeout expires (default 5000 ms). Matchers that take a plain value are synchronous.

### Locator matchers (async, auto-retry)

```js
await expect(locator).toBeVisible(opts?: { timeout?: number }): Promise<void>
await expect(locator).toBeHidden(opts?: { timeout?: number }): Promise<void>
await expect(locator).toBeEnabled(opts?: { timeout?: number }): Promise<void>
await expect(locator).toBeDisabled(opts?: { timeout?: number }): Promise<void>
await expect(locator).toBeChecked(opts?: { timeout?: number }): Promise<void>
await expect(locator).toBeEditable(opts?: { timeout?: number }): Promise<void>
await expect(locator).toBeEmpty(opts?: { timeout?: number }): Promise<void>
await expect(locator).toHaveText(text: string | RegExp, opts?: { exact?: boolean; timeout?: number }): Promise<void>
await expect(locator).toContainText(text: string | RegExp, opts?: { timeout?: number }): Promise<void>
await expect(locator).toHaveValue(value: string | RegExp, opts?: { timeout?: number }): Promise<void>
await expect(locator).toHaveAttribute(name: string, value: string | RegExp, opts?: { timeout?: number }): Promise<void>
await expect(locator).toHaveCount(count: number, opts?: { timeout?: number }): Promise<void>
await expect(locator).toHaveClass(cls: string | RegExp, opts?: { timeout?: number }): Promise<void>
```

### Page-level matchers (async, auto-retry)

```js
await expect(page).toHaveURL(url: string | RegExp, opts?: { timeout?: number }): Promise<void>
await expect(page).toHaveTitle(title: string | RegExp, opts?: { timeout?: number }): Promise<void>
```

### Plain-value matchers (sync)

```js
expect(value).toBe(expected: any): void
expect(value).toEqual(expected: any): void        // deep equality via JSON
expect(value).toBeTruthy(): void
expect(value).toBeFalsy(): void
expect(value).toBeNull(): void
expect(value).toBeUndefined(): void
expect(value).toBeGreaterThan(n: number): void
expect(value).toBeLessThan(n: number): void
expect(value).toContain(item: any): void          // array or substring
expect(value).toMatch(r: RegExp | string): void
```

### Negation

All matchers are available under `.not`:

```js
await expect(locator).not.toBeVisible()
expect(value).not.toBe(expected)
// etc.
```

---

## page Events

Subscribe via `page.on(event, handler)`. Events are emitted by bridges installed inside the proxied iframe after each navigation.

| Event              | Handler signature                              | Description                              |
|--------------------|------------------------------------------------|------------------------------------------|
| `close`            | `() => void`                                   | `page.close()` was called                |
| `console`          | `(msg) => void`                                | Console output from the page. `msg.type()`, `msg.text()`, `msg.args()`, `msg.location()` |
| `crash`            | `() => void`                                   | (reserved)                               |
| `dialog`           | `(dialog) => void`                             | `alert`/`confirm`/`prompt`. `dialog.type()`, `.message()`, `.accept(text?)`, `.dismiss()` |
| `domcontentloaded` | `() => void`                                   | (reserved)                               |
| `download`         | `(dl) => void`                                 | User clicked a download link. `dl.url()`, `dl.suggestedFilename()` |
| `filechooser`      | `(fc) => void`                                 | File input clicked. `fc.element()`, `fc.isMultiple()`, `fc.accept()`, `fc.setFiles(files[])` |
| `frameattached`    | `(frame) => void`                              | A sub-frame was added. `frame.url()`, `frame.name()`, `frame.isMainFrame()` |
| `framedetached`    | `(frame) => void`                              | A sub-frame was removed                  |
| `framenavigated`   | `(frame) => void`                              | A sub-frame navigated                    |
| `load`             | `() => void`                                   | (reserved)                               |
| `pageerror`        | `(err: Error) => void`                         | Uncaught error or unhandled rejection    |
| `popup`            | `(popup: Page) => void`                        | `window.open()` or `target="_blank"` click. Receives a full `Page`-like object — supports `goto`, `url`, `title`, `locator`, `getBy*`, `waitForURL`, `bringToFront`, `close`, etc. |
| `request`          | `(req) => void`                                | fetch/XHR started. `req.url()`, `.method()`, `.headers()`, `.postData()`, `.resourceType()` |
| `requestfailed`    | `(req) => void`                                | Request failed. `req.failure().errorText` |
| `requestfinished`  | `(req) => void`                                | Request completed successfully           |
| `response`         | `(res) => void`                                | Response received. `res.url()`, `.status()`, `.statusText()`, `.ok()`, `.request()` |
| `websocket`        | `(ws: WebSocket) => void`                      | A WebSocket was created                  |
| `worker`           | `(worker: Worker) => void`                     | A Web Worker was created                 |

**Example — intercept dialogs:**

```js
page.on('dialog', async dialog => {
  console.log(dialog.type(), dialog.message());
  await dialog.accept();
});
```

**Example — capture console output:**

```js
page.on('console', msg => {
  if (msg.type() === 'error') console.error('[page]', msg.text());
});
```

---

## TestRunner (Node.js)

`TestRunner` runs test code server-side in a Node.js `vm` sandbox. The `page` object available in the sandbox fetches pages over HTTP and parses them with regex (no real browser DOM).

```ts
import { TestRunner, parseTestCode, parseTestFile } from './src/testRunner';
```

### TestRunner

```ts
const runner = new TestRunner();

await runner.runCode(code: string, extraContext?: Record<string, any>): Promise<RunResults>
await runner.runFile(filePath: string, extraContext?: Record<string, any>): Promise<RunResults>
runner.report(results: RunResults): void   // pretty-print to console
```

### parseTestCode / parseTestFile

Extract the test structure without executing:

```ts
const tests: ParsedTest[] = parseTestCode(code: string)
// [{ suite: 'Suite name', name: 'test name' }, ...]

const file: ParsedFile = parseTestFile(filePath: string)
// { filename: 'foo.js', tests: [...], error?: string }
```

### Types

```ts
interface ParsedTest  { suite: string; name: string; }
interface ParsedFile  { filename: string; tests: ParsedTest[]; error?: string; }
interface TestResult  { name: string; passed: boolean; error?: string; duration: number; }
interface RunResults  { passed: number; failed: number; total: number; duration: number; tests: TestResult[]; }
```

---

## TestSuite & Assert (Node.js)

For structured test suites in TypeScript (Node-side):

```ts
import { TestSuite, Assert, test } from './src/types';

class MyTests extends TestSuite {
  @test('login flow')
  async testLogin() {
    // this.tx = TestApi instance
    this.tx.visit('https://example.com');
    await this.tx.waitForElement('h1');
    Assert.equal(this.tx.title(), 'Example Domain');
  }

  async beforeAll(): Promise<void> { /* suite setup */ }
  async afterAll(): Promise<void>  { /* suite teardown */ }
  async beforeEach(): Promise<void> {}
  async afterEach(): Promise<void> {}
}

const results = await new MyTests().run();
// { passed: number, failed: number, duration: number }
```

### Assert (static methods)

```ts
Assert.equal(actual, expected, message?)    // strict ===
Assert.truthy(value, message?)
Assert.falsy(value, message?)
Assert.includes(array, value, message?)
Assert.contains(text, substring, message?)
Assert.greater(actual, threshold, message?) // actual > threshold
Assert.less(actual, threshold, message?)    // actual < threshold
```

---

## Server REST API

The control panel server (`http://localhost:3000` by default) exposes these endpoints:

| Method | Path                           | Description                                                      |
|--------|--------------------------------|------------------------------------------------------------------|
| `GET`  | `/`                            | Control panel HTML                                               |
| `GET`  | `/panel.js`                    | Bundled browser-side JS (page, Locator, expect, testApi)         |
| `GET`  | `/api/tests`                   | `ParsedFile[]` — list of all loaded test files with their tests  |
| `GET`  | `/api/test-source?file=<name>` | Raw bundled JS source for a test file (by basename)              |
| `GET`  | `/api/version`                 | `{ version: number }` — increments on each file-change           |
| `POST` | `/api/run-test`                | Run test code server-side. Body: `{ code: string }`. Returns `RunResults` |
| `POST` | `/api/task`                    | Execute a named Node.js task. Body: `{ name, payload? }`. Returns `{ result }` or `{ error }` |
| `GET`  | `/mock`                        | Placeholder HTML page                                            |

All endpoints respond with `Access-Control-Allow-Origin: *`.

**POST /api/run-test example:**

```js
const res = await fetch('http://localhost:3000/api/run-test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: `it('x', () => {})` }),
});
const { passed, failed, total, duration, tests } = await res.json();
```

---

## TxWrapper (Node.js programmatic use)

```ts
import { TxWrapper } from './src/wrapper';

const wrapper = new TxWrapper({
  proxyHost:        'localhost',
  port1:            1337,
  port2:            1338,
  controlPanelPort: 3000,
  headless:         false,
  testFiles:        ['./specs/login.js'],
  testPatterns:     ['./specs/**/*.js'],
  watchBaseDir:     './specs',
  viewport:         { width: 1920, height: 1080 },
});

const testApi = await wrapper.start();   // boots proxy + server + watcher, opens browser
await wrapper.stop();

wrapper.getTestApi(): TestApi
wrapper.getProxyUrl(): string
```
