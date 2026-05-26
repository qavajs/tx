# @qavajs/tx

`@qavajs/tx` is a browser test runner that routes websites through the [Hammerhead](https://github.com/DevExpress/testcafe-hammerhead) proxy and executes tests directly inside the browser — no WebDriver, no browser-specific binary, no separate driver process. Open any browser, point it at the control panel, and your tests run there.

The API is modelled after Playwright (`page`, `expect`, `browser`, `request`, fixtures via destructuring), so the authoring experience is familiar and existing page objects work without changes.

## Features

- **No browser driver** — runs in any browser (including Safari) via a proxy iframe; no WebDriver or CDP required
- **Playwright-compatible API** — `page`, `locator`, `expect`, `browser`, `request`, hooks, `test.extend()` fixtures
- **Interactive control panel** — live browser view, network inspector, console panel, and CSS selector playground in one UI
- **Node.js bridge** — call file-system, database, or any Node.js task from browser-side test code via `node.task()`
- **TypeScript first** — spec files written in TypeScript, compiled on the fly with esbuild
- **Snapshot mode** — captures computed-style DOM snapshots after each command for visual debugging
- **Pluggable reporters** — console and HTML reporters included; custom reporters are a single class
- **CI-ready** — headless mode, `--test` exit-on-finish flag, and `--shard` for parallel workers

## Installation

```bash
npm install @qavajs/tx
```

Or run from source:

```bash
git clone <repo>
cd @qavajs/tx
npm install
npm run build
```

## Quick Start

```bash
# Run in interactive mode (opens the control panel in your browser)
npx tx --config tx.config.js

# Run all tests and exit (CI mode)
npx tx --config tx.config.js --test
```

Write a spec file:

```ts
// specs/login.spec.ts
import { test } from '@qavajs/tx';

test.describe('Login', () => {
  test('redirects to inventory on valid credentials', async ({ page, expect }) => {
    await page.goto('https://www.saucedemo.com');
    await page.getByTestId('username').fill('standard_user');
    await page.getByTestId('password').fill('secret_sauce');
    await page.getByTestId('login-button').click();
    await page.waitForURL(/inventory/);
    await expect(page.getByTestId('title')).toHaveText('Products');
  });
});
```

Point `tx.config.js` at it:

```js
module.exports = {
  testFiles: ['./specs/**/*.spec.ts'],
  browser: 'chrome',
};
```

Then run:

```bash
npx tx --config tx.config.js
```

The control panel opens at `http://localhost:11339`. Click the spec to run it, or pass `--test` for CI mode.

## Configuration

Create a `tx.config.js` in your project root:

```js
module.exports = {
  // Proxy ports (Hammerhead)
  port1: 11337,
  port2: 11338,

  // Control panel port
  controlPanelPort: 11339,

  // Test files — glob patterns relative to this config file
  testFiles: ['./specs/**/*.spec.ts'],

  // Filter tests by name substring or /regex/flags (also matches tags)
  // grep: 'login',

  // Viewport applied to the iframe
  viewport: { width: 1600, height: 900 },

  // Timeouts (ms)
  actionTimeout: 10000,
  expectTimeout: 8000,
  testTimeout: 30000,

  // Browser to open ('chrome', 'firefox', 'safari', 'edge', or an absolute path)
  browser: 'chrome',

  // Reporters
  reporters: [
    ['./ConsoleReporter.ts', {}],
    ['./HtmlReporter.ts', { outputPath: 'report/report.html' }],
  ],

  // Save a PNG screenshot to test-artifacts/ when a test fails
  screenshotOnFailure: true,

  // Record a WebM video to test-artifacts/ when a test fails
  videoOnFailure: true,

  // Node.js task handlers callable from tests via node.task()
  tasks: {
    readFile: ({ path }) => require('fs').readFileSync(path, 'utf-8'),
    dirname:  () => __dirname,
  },

  // Transform each spec file's TypeScript source before it is bundled/parsed.
  // preprocessor(source, filePath) { return source; },

  // Named config profiles — select one at runtime with --profile <name>.
  // Profile values are merged on top of the base config, before CLI args.
  profiles: {
    ci: {
      headless: true,
      browser: 'chromium',
      testMode: true,
    },
    debug: {
      headless: false,
      actionTimeout: 30000,
      testTimeout: 120000,
    },
  },
};
```

All fields are optional. CLI flags override the config file.

### Config fields

| Field              | Type                                    | Default       | Description |
|--------------------|-----------------------------------------|---------------|-------------|
| `proxyHost`        | `string`                                | `"localhost"` | Hostname for the Hammerhead proxy |
| `port1`            | `number`                                | `11337`       | Proxy port 1 |
| `port2`            | `number`                                | `11338`       | Proxy port 2 |
| `controlPanelPort` | `number`                                | `11339`       | HTTP server port for the control panel |
| `headless`         | `boolean`                               | `false`       | Run the browser in headless mode |
| `browser`          | `string`                                | —             | Browser to launch: `chrome`, `firefox`, `edge`, `safari`, `chromium`, or an absolute path. Falls back to the first browser found when omitted. |
| `testFiles`        | `string[]`                              | —             | Explicit list of test file paths (relative to config) |
| `testMatch`        | `string \| string[]`                    | —             | Glob pattern(s) for test file discovery |
| `grep`             | `string`                                | —             | Filter tests by name or tag (substring or `/regex/flags`) |
| `viewport`         | `{ width, height }`                     | —             | Fixed iframe viewport size; scales to fit panel |
| `reporters`        | `[path, config][]`                      | —             | Reporter modules — see [Reporters](#reporters) |
| `tasks`            | `Record<string, TaskHandler>`           | —             | Named Node.js task handlers — see [node.task](#nodetask) |
| `preprocessor`     | `(source, filePath) => string`          | —             | Transform each spec file's raw TypeScript source before bundling/parsing — see [Preprocessor](#preprocessor) |
| `profiles`         | `Record<string, Omit<TxConfig, 'profiles'>>` | —      | Named config profiles selected at runtime with `--profile <name>`; merged on top of base config, before CLI args |
| `retries`          | `number`                                | `0`           | Number of times to retry a failing test before marking it failed. Each retry re-runs the full test including `beforeEach`/`afterEach` hooks. |
| `testMode`         | `boolean`                               | `false`       | Run all tests automatically on startup, then exit — exit code `0` if all passed, `1` if any failed |
| `snapshot`         | `boolean`                               | `false`       | Capture a DOM snapshot after each command and show it in the Snapshots panel |
| `actionTimeout`    | `number`                                | `5000`        | Default timeout in ms for locator actions (`click`, `fill`, `waitFor`, etc.) |
| `expectTimeout`    | `number`                                | `5000`        | Default timeout in ms for `expect()` assertion retry loops |
| `testTimeout`      | `number`                                | `30000`       | Maximum time in ms a single test function may run before it is cancelled |

`headless` can also be enabled via the environment variable `HEADLESS=true` without changing the config file.

### CLI flags

All config-file fields can be overridden at the command line. CLI values take precedence over the config file and over profile overrides.

| Flag | Description |
|------|-------------|
| `--config <path>` | Path to config file (auto-detected if omitted) |
| `--profile <name>` | Apply a named profile from `profiles` in the config file |
| `--test` | Run all tests then exit; non-zero exit on failures |
| `--grep <pattern>` | Filter tests by name or tag (substring or `/regex/flags`) |
| `--browser <name>` | Browser to open (`chrome`, `firefox`, `edge`, `safari`, or an absolute path) |
| `--port <n>` | Control panel port |
| `--headless` | Run the browser in headless mode |
| `--shard <n>/<total>` | Run only the nth shard of total (e.g. `--shard 2/4`) |
| `--retries <n>` | Number of retry attempts for failing tests |
| `--port1 <n>` | Proxy port 1 |
| `--port2 <n>` | Proxy port 2 |
| `--proxyHost <host>` | Proxy hostname |

### Preprocessor

A `preprocessor` function in `tx.config.js` receives the raw TypeScript source of each spec file and its absolute path, and must return the transformed source string. It runs before esbuild compiles the file — for both bundling (browser execution) and parsing (test discovery).

```ts
(source: string, filePath: string) => string
```

The preprocessor is called in two places for each spec file:

| Phase | Trigger | What happens next |
|---|---|---|
| **Discovery** | File loaded by the watcher or requested by the server | Preprocessed source → esbuild `transformSync` (TS→CJS) → vm sandbox to extract test names |
| **Execution** | Test run requested from the control panel | Preprocessed source → esbuild `build` (bundle + IIFE) → sent to browser |

Both phases use the same preprocessor, so the test tree visible in the UI always matches what actually runs.

**Inject a shared import into every spec file:**

```js
preprocessor(source) {
  return `import { myHelper } from '../support/helpers';\n` + source;
},
```

**Rewrite a path alias:**

```js
preprocessor(source, filePath) {
  return source.replace(/from '@app\//g, `from '${path.resolve(__dirname, 'src')}/`);
},
```

**Wrap every file in a describe block based on its path:**

```js
preprocessor(source, filePath) {
  const rel = path.relative(__dirname, filePath);
  return `import { test } from '@qavajs/tx';\ntest.describe(${JSON.stringify(rel)}, () => {\n${source}\n});\n`;
},
```

## Writing Tests

Tests look and feel like Playwright. Import `test` from `'@qavajs/tx'`. Fixtures (`page`, `browser`, `node`, `expect`, `request`, `log`, `attach`) are injected via destructuring — not globals.

```ts
import { test } from '@qavajs/tx';

test.describe('Login', () => {
  test('navigates to inventory after valid credentials', async ({ page, expect }) => {
    await page.goto('https://www.saucedemo.com');
    await page.getByTestId('username').fill('standard_user');
    await page.getByTestId('password').fill('secret_sauce');
    await page.getByTestId('login-button').click();
    await page.waitForURL(/inventory/, { timeout: 5000 });
    await expect(page.getByTestId('title')).toHaveText('Products');
  });

  // Tags are displayed as chips in the control panel and matched by --grep
  test('smoke check', { tag: ['@smoke'] }, async ({ page, expect }) => {
    await page.goto('https://www.saucedemo.com');
    await expect(page.getByTestId('login-button')).toBeVisible();
  });
});
```

### Imports from `'@qavajs/tx'`

| Export            | Description |
|-------------------|-------------|
| `test`            | Define a test case |
| `test.describe`   | Define a test suite |
| `test.beforeEach` | Hook run before each test in the nearest `test.describe` |
| `test.afterEach`  | Hook run after each test in the nearest `test.describe` |
| `test.beforeAll`  | Hook run once before all tests in the nearest `test.describe` |
| `test.afterAll`   | Hook run once after all tests in the nearest `test.describe` |
| `test.extend`     | Create a custom test function with additional fixtures |

### Built-in fixtures

| Fixture      | Description |
|--------------|-------------|
| `page`       | Playwright-style page object (see [page](#page)) |
| `browser`    | Multi-tab browser object (see [browser](#browser)) |
| `node`       | Node.js context bridge (see [node](#node)) |
| `request`    | HTTP request context (see [request](#request)) |
| `expect`     | Assertion function (see [expect](#expect)) |
| `log`        | `(message, opts?) => void` — write to the panel console; `opts`: `{ type?: 'info'\|'success'\|'error', cmd?: string, duration?: number }` |
| `log.open`   | `(message, cmd) => TxCommandHandle` — open a pending entry; resolve with `.success()` / `.fail()` |
| `attach`     | `(label, body, contentType?) => void` — attach data to the test result |

### Tags

The optional second argument to `test()` accepts a `tag` array:

```ts
test(name: string, options: { tag?: string[] }, fn: (fixtures) => void | Promise<void>): void
```

Tags are freeform strings — conventionally prefixed with `@` (e.g. `'@smoke'`, `'@regression'`). They are shown as chips in the spec list and matched by `grep` / `--grep`.

### Page object pattern

Page objects receive `page` from the test and can import `expect` from `'@qavajs/tx'` for assertions:

```ts
// pages/LoginPage.ts
import { expect } from '@qavajs/tx';

export class LoginPage {
  constructor(private page: Page) {}

  goto()  { return this.page.goto('https://www.saucedemo.com'); }
  login(user: string, pass: string) { /* ... */ }
  async expectLoaded() { await expect(this.page.getByTestId('title')).toBeVisible(); }
}

// specs/login.spec.ts
import { test } from '@qavajs/tx';
import { LoginPage } from '../pages/LoginPage';

test.describe('Login', () => {
  test('logs in', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login('standard_user', 'secret_sauce');
    await lp.expectLoaded();
  });
});
```

### Fixtures

`test.extend()` creates a custom test function with additional fixtures. Built-in fixtures are always available via destructuring.

```ts
import { test } from '@qavajs/tx';

const myTest = test.extend({
  // Static fixture — value computed once, passed to every test
  credentials: async ({}, use) => {
    await use({ username: 'admin', password: 's3cret' });
  },

  // Fixture that depends on another fixture
  apiToken: async ({ request }, use) => {
    const resp = await request.fetch('https://auth.example.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'test' }),
    });
    const { token } = await resp.json();
    await use(token);
  },

  // Page fixture — navigate before each test, clean up after
  loggedInPage: async ({ page, credentials }, use) => {
    await page.goto('https://app.example.com/login');
    await page.getByTestId('username').fill(credentials.username);
    await page.getByTestId('password').fill(credentials.password);
    await page.getByTestId('login-button').click();
    await page.waitForURL(/dashboard/);
    await use(page);
    await page.goto('https://app.example.com/logout');
  },

  // Node.js fixture — read from disk via node.task
  serverData: async ({ node }, use) => {
    const raw = await node.task('readFile', { path: './fixtures/data.json' });
    await use(JSON.parse(raw));
  },
});

myTest('dashboard shows username', async ({ loggedInPage, credentials }) => {
  await expect(loggedInPage.getByTestId('welcome')).toHaveText(credentials.username);
});
```

**Fixture teardown** — code after `await use(value)` runs after the test completes, making fixtures self-cleaning:

```ts
const myTest = test.extend({
  dbRecord: async ({}, use) => {
    const id = await db.insert({ name: 'test' });
    await use(id);
    await db.delete(id); // runs after test, pass or fail
  },
});
```

### Hooks

```ts
import { test } from '@qavajs/tx';

test.describe('suite', () => {
  test.beforeAll(async () => { /* runs once before all tests in this describe */ });
  test.afterAll(async  () => { /* runs once after  all tests in this describe */ });
  test.beforeEach(async ({ page }) => { await page.goto('https://example.com'); });
  test.afterEach(async  () => { /* runs after  each test */ });

  test('test', async ({ page, expect }) => { /* ... */ });
});
```

## API Reference

### `page`

Operates on the proxied iframe. Available as the `page` fixture via destructuring.

#### Navigation

```ts
await page.goto(url: string): Promise<void>
```
Navigate the iframe to `url`. Waits for the `load` event (30 s timeout).

```ts
await page.reload(): Promise<void>
```
Reload the current page. Waits for the `load` event.

```ts
page.url(): string
```
Return the current URL (proxy prefix stripped).

```ts
await page.title(): Promise<string>
```
Return the `<title>` of the current page.

```ts
await page.waitForURL(url: string | RegExp, opts?: { timeout?: number }): Promise<void>
```
Poll until `page.url()` matches `url`. Default timeout: 5000 ms.

```ts
await page.waitForSelector(selector: string, opts?: { state?: 'visible'|'attached'; timeout?: number }): Promise<Locator>
```
Wait until an element matching `selector` reaches the given state, then return a `Locator` for it.

```ts
await page.waitForTimeout(ms: number): Promise<void>
```
Wait unconditionally for `ms` milliseconds.

```ts
await page.waitForRequest(
  urlOrPredicate: string | RegExp | ((req: Request) => boolean | Promise<boolean>),
  options?: { timeout?: number }
): Promise<Request>
```
Wait for a network request matching `urlOrPredicate` and return it. Exposes `.url()`, `.method()`, `.headers()`, `.postData()`, `.resourceType()`, `.isNavigationRequest()`. Default timeout: 30 000 ms.

- **string** — treated as a glob pattern (`*` matches within a path segment, `**` matches across segments).
- **RegExp** — tested against the full request URL.
- **function** — called with the request object; must return `true` to match.

```ts
// Wait for any POST to /api/submit
const req = await page.waitForRequest('**/api/submit');
console.log(req.method()); // 'POST'
```

```ts
await page.waitForResponse(
  urlOrPredicate: string | RegExp | ((resp: Response) => boolean | Promise<boolean>),
  options?: { timeout?: number }
): Promise<Response>
```
Wait for a network response matching `urlOrPredicate`. Exposes `.url()`, `.status()`, `.statusText()`, `.ok()`, `.headers()`, `.body()`, `.request()`. Default timeout: 30 000 ms.

```ts
// Trigger an action and wait for the resulting API response
const [, resp] = await Promise.all([
  page.locator('button[type="submit"]').click(),
  page.waitForResponse('**/api/login'),
]);
console.log(resp.status()); // 200
```

#### Locator factories

```ts
page.locator(selector: string): Locator
```
Match elements by CSS selector. Supports the `:has-text("…")` pseudo-class.

```ts
page.getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator
```
Match elements by their text content. Prefers leaf (childless) elements. `exact` defaults to `false` (substring match).

```ts
page.getByRole(role: string, opts?: { name?: string | RegExp; exact?: boolean }): Locator
```
Match elements by ARIA role. Optional `name` filters by accessible name.

```ts
page.getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator
```
Match form controls associated with a `<label>` whose text matches, or elements with a matching `aria-label`.

```ts
page.getByPlaceholder(text: string | RegExp): Locator
```
Match inputs by their `placeholder` attribute.

```ts
page.getByTestId(id: string): Locator
```
Match elements with `[data-testid="id"]` or `[data-test="id"]`.

```ts
page.getByAltText(text: string | RegExp): Locator
```
Match elements with a matching `alt` attribute.

```ts
page.getByTitle(text: string | RegExp): Locator
```
Match elements with a matching `title` attribute.

#### Viewport

```ts
page.setViewportSize(size: { width: number; height: number }): void
```
Apply a fixed viewport to the iframe (scales to fit the panel container).

#### Script evaluation

```ts
await page.evaluate(
  pageFunction: string | ((...args: any[]) => any),
  arg?: any
): Promise<any>
```

Evaluate a function or expression in the page's JavaScript context. Functions are serialized and cannot close over variables in test scope. `arg` is passed as the sole argument when `pageFunction` is a function (must be JSON-serializable).

```ts
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

#### Script injection

```ts
page.addInitScript(
  script: string | ((...args: any[]) => void),
  arg?: any
): { dispose(): void }
```

Register a script to run inside the page on every navigation, before any test code interacts with it. Returns a `dispose()` handle to remove the script.

```ts
// Set a global before the page's own code runs
page.addInitScript(`window.__ENV__ = 'test'`);

// Mock an API on every navigation
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
handle.dispose();
```

#### Keyboard

```ts
await page.keyboard.press(key: string): Promise<void>    // e.g. 'Enter', 'Shift+A'
await page.keyboard.type(text: string, opts?: { delay?: number }): Promise<void>
await page.keyboard.insertText(text: string): Promise<void>  // no key events
await page.keyboard.down(key: string): Promise<void>
await page.keyboard.up(key: string): Promise<void>
```

#### Mouse

Low-level mouse control. Coordinates are relative to the iframe viewport.

```ts
await page.mouse.move(x: number, y: number, opts?: { steps?: number }): Promise<void>
await page.mouse.down(opts?: { button?: 'left' | 'middle' | 'right' }): Promise<void>
await page.mouse.up(opts?: { button?: 'left' | 'middle' | 'right' }): Promise<void>
await page.mouse.click(x: number, y: number, opts?: {
  button?: 'left' | 'middle' | 'right';
  clickCount?: number;
  delay?: number;
}): Promise<void>
await page.mouse.dblclick(x: number, y: number, opts?: {
  button?: 'left' | 'middle' | 'right';
  delay?: number;
}): Promise<void>
await page.mouse.wheel(deltaX: number, deltaY: number): Promise<void>
```

**Drag and drop:**

```ts
await page.mouse.move(100, 200);
await page.mouse.down();
await page.mouse.move(300, 200, { steps: 10 });
await page.mouse.up();
```

#### Events

```ts
page.on(event: string, fn: (...args) => any): page
page.off(event: string, fn: (...args) => any): page
page.once(event: string, fn: (...args) => any): page
```

See [page Events](#page-events) for available events.

#### Locator handlers

```ts
page.addLocatorHandler(
  locator: Locator,
  handler: (locator: Locator) => Promise<void>,
  options?: { noWaitAfter?: boolean; times?: number }
): void
```

Register a handler called automatically whenever the given locator becomes visible — **before** any Locator action is attempted. Useful for dismissing overlays, cookie banners, or modals that appear at unpredictable times.

| Option        | Type      | Default | Description |
|---------------|-----------|---------|-------------|
| `noWaitAfter` | `boolean` | `false` | Skip waiting for the locator to become hidden after the handler returns |
| `times`       | `number`  | `0`     | Maximum invocations; `0` means unlimited |

```ts
page.removeLocatorHandler(locator: Locator): void
```

```ts
// Dismiss cookie banner throughout a suite
page.addLocatorHandler(
  page.locator('#cookie-banner'),
  async (banner) => {
    await banner.getByRole('button', { name: 'Accept all' }).click();
  }
);

// Dismiss a modal at most once
page.addLocatorHandler(
  page.locator('.promo-modal'),
  async (modal) => { await modal.locator('[aria-label="Close"]').click(); },
  { times: 1 }
);
```

#### Lifecycle

```ts
await page.bringToFront(): Promise<void>
```
Switch the tab bar focus to this page (makes it the active/visible tab).

```ts
await page.close(): Promise<void>
```
Close this tab and emit the `close` event. If other tabs are open the most recent one becomes active.

#### Screenshot

Captures the current iframe as a PNG and returns a data URL. Pass `path` to also save the file to `test-artifacts/` on the server.

```ts
// Capture and use in-memory
const dataUrl = await page.screenshot();

// Capture and persist to disk
await page.screenshot({ path: 'my-screenshot' }); // saved as test-artifacts/my-screenshot.png
```

---

### `page.route` / `page.unroute`

Intercept, modify, mock, or abort network requests made by the page.

```ts
await page.route(
  pattern: string | RegExp | ((url: string) => boolean),
  handler: (route: Route, request: any) => void | Promise<void>
): Promise<void>
```

Register a route handler. Multiple handlers can be registered; the most recently registered matching handler wins. Must call `route.fulfill()`, `route.abort()`, or `route.continue()`.

```ts
await page.unroute(
  pattern: string | RegExp | ((url: string) => boolean),
  handler?: (route: Route, request: any) => void | Promise<void>
): Promise<void>
```

Remove a previously registered handler. If `handler` is omitted, all handlers for that pattern are removed.

```ts
// Mock a REST endpoint
await page.route('https://api.example.com/users', async route => {
  await route.fulfill({ json: [{ id: 1, name: 'Alice' }] });
});

// Block all image requests
await page.route(/\.(png|jpe?g|gif|webp|svg)$/i, route => route.abort());

// Add an auth header to every API call
await page.route(/api\.example\.com/, async (route, req) => {
  await route.continue({
    headers: { ...req.headers(), Authorization: 'Bearer test-token' },
  });
});

await page.unroute('**/api/users');
```

---

### `Route`

Passed to the handler registered with `page.route()`.

```ts
await route.fulfill(options?: {
  status?:      number;                  // HTTP status code (default: 200)
  contentType?: string;                  // Sets Content-Type header
  headers?:     Record<string, string>;  // Additional response headers
  body?:        string | Uint8Array;     // Raw response body
  json?:        any;                     // Body as JSON (sets Content-Type: application/json)
}): Promise<void>
```

```ts
await route.abort(errorCode?: string): Promise<void>
```
Abort the request. `errorCode` defaults to `'failed'`. Common values: `'aborted'`, `'blockedbyclient'`, `'connectionrefused'`, `'timedout'`.

```ts
await route.continue(opts?: {
  url?:      string;
  method?:   string;
  headers?:  Record<string, string>;
  postData?: BodyInit;
}): Promise<void>
```
Pass the request through, optionally modifying it.

```ts
route.request(): object
```
Returns the original request object. Supports `.url()`, `.method()`, `.headers()`, `.postData()`, `.resourceType()`, `.isNavigationRequest()`.

---

### `page.frameLocator`

```ts
page.frameLocator(selector: string): FrameLocator
```

Return a `FrameLocator` scoped to the `<iframe>` matched by `selector`. Use it to query elements inside a nested iframe.

```ts
const frame = page.frameLocator('#payment-iframe');
await frame.getByLabel('Card number').fill('4242 4242 4242 4242');
await frame.getByRole('button', { name: 'Pay' }).click();

// Chain for doubly-nested iframes
const inner = page.frameLocator('#outer').frameLocator('#inner');
await inner.locator('.result').waitFor();
```

---

### `FrameLocator`

All methods return a [`Locator`](#locator) scoped to the target iframe's document.

```ts
frameLocator.locator(selector: string): Locator
frameLocator.getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator
frameLocator.getByRole(role: string, opts?: { name?: string | RegExp; exact?: boolean }): Locator
frameLocator.getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator
frameLocator.getByPlaceholder(text: string | RegExp): Locator
frameLocator.getByTestId(id: string): Locator
frameLocator.getByAltText(text: string | RegExp): Locator
frameLocator.getByTitle(text: string | RegExp): Locator
frameLocator.frameLocator(selector: string): FrameLocator  // nest further
```

---

### `Locator`

A lazy query that re-evaluates against the live DOM on each access. All action methods auto-wait up to `timeout` (default 5000 ms) for the element to appear.

#### Chaining

```ts
locator.nth(n: number): Locator
locator.first(): Locator
locator.last(): Locator
locator.filter(opts: { hasText?: string | RegExp; hasNotText?: string | RegExp }): Locator
locator.locator(selector: string): Locator  // scoped child query
```

#### Actions

```ts
await locator.click(opts?: { force?: boolean; timeout?: number }): Promise<void>
await locator.dblclick(opts?: { timeout?: number }): Promise<void>
await locator.rightClick(opts?: { timeout?: number }): Promise<void>  // dispatches contextmenu
await locator.fill(value: string, opts?: { timeout?: number; delay?: number }): Promise<void>
```
`fill` clears the field first, then types with full keyboard events (works with React/Vue controlled inputs).

```ts
await locator.clear(opts?: { timeout?: number }): Promise<void>   // alias for fill('')
await locator.type(text: string, opts?: { delay?: number; timeout?: number }): Promise<void>
```
`type` appends text without clearing.

```ts
await locator.press(key: string, opts?: { timeout?: number }): Promise<void>
await locator.selectOption(value: string | string[], opts?: { timeout?: number }): Promise<void>
await locator.check(opts?: { timeout?: number }): Promise<void>
await locator.uncheck(opts?: { timeout?: number }): Promise<void>
await locator.focus(opts?: { timeout?: number }): Promise<void>
await locator.hover(opts?: { timeout?: number }): Promise<void>
await locator.scrollIntoViewIfNeeded(opts?: { timeout?: number }): Promise<void>
await locator.setInputFiles(files: string | string[] | { name: string; mimeType: string; buffer: Buffer }, opts?: { timeout?: number }): Promise<void>
await locator.evaluate(fn: Function, arg?: any): Promise<any>
```

#### Queries

```ts
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

#### Waiting

```ts
await locator.waitFor(opts?: {
  state?:   'visible' | 'hidden' | 'attached' | 'detached';  // default: 'visible'
  timeout?: number;
}): Promise<void>
```

---

### `expect`

`expect` is the Playwright-style assertion function. Matchers that take a `Locator` auto-retry until the condition is met or the timeout expires (default 5000 ms). Matchers that take a plain value are synchronous.

#### Locator matchers (async, auto-retry)

```ts
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

#### Page-level matchers (async, auto-retry)

```ts
await expect(page).toHaveURL(url: string | RegExp, opts?: { timeout?: number }): Promise<void>
await expect(page).toHaveTitle(title: string | RegExp, opts?: { timeout?: number }): Promise<void>
```

#### Plain-value matchers (sync)

```ts
expect(value).toBe(expected: any): void
expect(value).toEqual(expected: any): void      // deep equality via JSON
expect(value).toBeTruthy(): void
expect(value).toBeFalsy(): void
expect(value).toBeNull(): void
expect(value).toBeUndefined(): void
expect(value).toBeGreaterThan(n: number): void
expect(value).toBeLessThan(n: number): void
expect(value).toContain(item: any): void        // array or substring
expect(value).toMatch(r: RegExp | string): void
expect(array).toHaveLength(n: number): void
expect(fn).toThrow(): void
```

#### Negation

All matchers are available under `.not`:

```ts
await expect(locator).not.toBeVisible();
expect(value).not.toBe(expected);
```

---

### `browser`

Multi-tab manager available as the `browser` fixture.

```ts
await browser.newPage(): Promise<void>
```
Open a new blank tab and make it the active tab. After the call, interact with it via the global `page` fixture.

```ts
browser.tabs(): TxTabInfo[]
```
Return a snapshot array of all open tabs. Each entry has `id`, `title`, `url`, and `active` fields.

```ts
browser.switchTab(predicate: (tab: TxTabInfo) => boolean): void
```
Switch the active tab to the first tab where `predicate` returns `true`. Use `page` to interact with it afterwards.

```ts
// Multi-tab flow
test('multi-tab', async ({ page, browser, expect }) => {
  await page.goto('https://example.com');

  await browser.newPage();
  await page.goto('https://example.org');   // page now refers to the new tab

  console.log(browser.tabs().length);       // 2

  browser.switchTab(t => t.url.includes('example.com'));
  await expect(page).toHaveURL(/example\.com/);

  await page.close();  // close the active tab
});

// Handle window.open / target="_blank"
test('popup', async ({ page }) => {
  page.on('popup', async popup => {
    await popup.waitForURL(/popup-page/);
    console.log(await popup.title());
    await popup.close();
  });
  await page.locator('a[target="_blank"]').click();
});
```

---

### `node`

Node.js context bridge available as the `node` fixture. Provides access to Node.js APIs (file system, environment variables, databases, etc.) from within browser-side test code.

#### `node.task`

```ts
await node.task<T = unknown>(name: string, payload?: unknown): Promise<T>
```

Execute a named task handler registered in `tx.config.js` under `tasks`.

**Defining tasks in `tx.config.js`:**

```js
module.exports = {
  tasks: {
    getEnv:       (name) => process.env[name] ?? null,
    readFile:     ({ path }) => fs.readFileSync(path, 'utf-8'),
    writeFile:    ({ path, content }) => { fs.writeFileSync(path, content); return null; },
    seedDatabase: async (records) => { await db.insertMany(records); return records.length; },
  },
};
```

**Using `node.task` in tests:**

```ts
test('reads a fixture from disk', async ({ node, expect }) => {
  const json = await node.task('readFile', { path: './fixtures/user.json' });
  const user = JSON.parse(json);
  expect(user.name).toBe('Alice');
});
```

**Using `node` in `test.extend`:**

```ts
const myTest = test.extend({
  serverData: async ({ node, log, attach }, use) => {
    const raw = await node.task('readFile', { path: './fixtures/data.json' });
    log('loaded data fixture');
    attach('data fixture', raw, 'application/json');
    await use(JSON.parse(raw));
  },
});
```

---

### `request`

An `APIRequestContext` available as the `request` fixture. Makes HTTP requests directly from the panel process (not through the proxied iframe), so there are no CORS restrictions. All requests appear in the **Network** tab.

```ts
await request.fetch(url: string, options?: RequestInit): Promise<APIResponse>
```

`options` accepts the full standard `RequestInit` object (`method`, `headers`, `body`, `credentials`, etc.).

#### `APIResponse`

| Method | Returns | Description |
|---|---|---|
| `ok()` | `boolean` | `true` when status is 200–299 |
| `status()` | `number` | HTTP status code |
| `statusText()` | `string` | HTTP status text |
| `headers()` | `Record<string, string>` | Response headers (lowercased keys) |
| `url()` | `string` | Final response URL (after redirects) |
| `json<T>()` | `Promise<T>` | Parse body as JSON |
| `text()` | `Promise<string>` | Body as a string |
| `body()` | `Promise<ArrayBuffer>` | Raw body bytes |

```ts
test('CRUD operations', async ({ request, expect }) => {
  const resp = await request.fetch('https://api.example.com/users');
  expect(resp.status()).toBe(200);
  const users = await resp.json();

  const resp2 = await request.fetch('https://api.example.com/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice' }),
  });
  expect(resp2.ok()).toBe(true);
});
```

---

### `log` and `attach`

`log` writes a message to the command panel during a test. `attach` adds named data (text, JSON, images, …) to the test result so reporters can display or store it.

```ts
test('checkout', async ({ page, log, attach }) => {
  log('starting checkout flow');

  // Attach plain text
  attach('cart state', JSON.stringify(cart), 'application/json');

  // Attach a screenshot inline
  attach('page state', await page.screenshot(), 'image/png');
});
```

The HTML reporter renders image attachments inline and text/JSON attachments in a code block, grouped under the test row they belong to.

---

### `page Events`

Subscribe via `page.on(event, handler)`. Events are emitted by bridges installed inside the proxied iframe after each navigation.

| Event              | Handler signature                              | Description |
|--------------------|------------------------------------------------|-------------|
| `close`            | `() => void`                                   | `page.close()` was called |
| `console`          | `(msg) => void`                                | Console output. `msg.type()`, `msg.text()`, `msg.args()`, `msg.location()` |
| `dialog`           | `(dialog) => void`                             | `alert`/`confirm`/`prompt`. `dialog.type()`, `.message()`, `.accept(text?)`, `.dismiss()` |
| `download`         | `(dl) => void`                                 | User clicked a download link. See [`Download`](#download) |
| `filechooser`      | `(fc) => void`                                 | File input clicked. See [`FileChooser`](#filechooser) |
| `frameattached`    | `(frame) => void`                              | A sub-frame was added. `frame.url()`, `frame.name()`, `frame.isMainFrame()` |
| `framedetached`    | `(frame) => void`                              | A sub-frame was removed |
| `framenavigated`   | `(frame) => void`                              | A sub-frame navigated |
| `pageerror`        | `(err: Error) => void`                         | Uncaught error or unhandled rejection |
| `popup`            | `(popup: Page) => void`                        | `window.open()` or `target="_blank"` click. Receives a full `Page`-like object. |
| `request`          | `(req) => void`                                | fetch/XHR started. `req.url()`, `.method()`, `.headers()`, `.postData()`, `.resourceType()` |
| `requestfailed`    | `(req) => void`                                | Request failed. `req.failure().errorText` |
| `requestfinished`  | `(req) => void`                                | Request completed successfully |
| `response`         | `(res) => void`                                | Response received. `res.url()`, `.status()`, `.statusText()`, `.ok()`, `.request()` |
| `websocket`        | `(ws: WebSocket) => void`                      | A WebSocket was created |
| `worker`           | `(worker: Worker) => void`                     | A Web Worker was created |

```ts
page.on('dialog', async dialog => {
  console.log(dialog.type(), dialog.message());
  await dialog.accept();
});

page.on('console', msg => {
  if (msg.type() === 'error') console.error('[page]', msg.text());
});
```

---

### `Download`

Passed to handlers registered with `page.on('download', …)` and `page.waitForEvent('download')`. Emitted whenever the user clicks a link that carries a `download` attribute or whose URL ends with a recognized file extension (`.pdf`, `.zip`, `.csv`, etc.).

```ts
dl.url(): string
```
Returns the `href` of the link that triggered the download.

```ts
dl.suggestedFilename(): string
```
Returns the `download` attribute value when set; otherwise falls back to the last path segment of the URL.

```ts
await dl.createReadStream(): Promise<ReadableStream<Uint8Array>>
```
Fetches the download URL and returns its content as a Web [`ReadableStream<Uint8Array>`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream). Use a `ReadableStreamDefaultReader` to consume the bytes.

```ts
await dl.saveAs(path: string): Promise<void>
```
Fetches the download URL and writes the content to `path` on the **server's** filesystem. Parent directories are created automatically.

```ts
// Inspect and stream content
page.on('download', async dl => {
  console.log(dl.url());                 // 'https://example.com/report.csv'
  console.log(dl.suggestedFilename());   // 'report.csv'

  const stream = await dl.createReadStream();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const text = new TextDecoder().decode(
    chunks.reduce((a, c) => {
      const m = new Uint8Array(a.length + c.length);
      m.set(a); m.set(c, a.length);
      return m;
    }, new Uint8Array(0))
  );
  console.log(text);
});

// Save to disk
page.on('download', async dl => {
  await dl.saveAs(`/tmp/downloads/${dl.suggestedFilename()}`);
});
```

---

### `FileChooser`

Passed to handlers registered with `page.on('filechooser', …)` and `page.waitForEvent('filechooser')`. Emitted whenever a `<input type="file">` element receives a click.

```ts
fc.element(): HTMLInputElement
```
Returns the underlying file `<input>` element.

```ts
fc.isMultiple(): boolean
```
Returns `true` when the input carries the `multiple` attribute.

```ts
fc.accept(): string
```
Returns the value of the `accept` attribute, or an empty string when the attribute is absent.

```ts
fc.setFiles(files: File[]): void
```
Programmatically sets the input's `FileList` to the supplied array and dispatches a `change` event on the element. Use the browser's built-in `File` constructor to create entries.

```ts
// Accept all file-chooser dialogs automatically
page.on('filechooser', fc => {
  fc.setFiles([
    new File(['hello world'], 'hello.txt', { type: 'text/plain' }),
  ]);
});

// Inspect chooser properties before deciding
page.on('filechooser', fc => {
  console.log(fc.isMultiple()); // true / false
  console.log(fc.accept());     // e.g. 'image/png,image/jpeg'
  console.log(fc.element().id); // DOM id of the input
});
```

---

## Reporters

Reporters receive structured run events (begin, test result, run end). Pass them in `tx.config.js`:

```js
reporters: [
  ['./ConsoleReporter.ts', {}],
  ['./HtmlReporter.ts', { outputPath: 'report/report.html' }],
],
```

### Architecture

Tests execute inside the browser. Results travel to Node.js reporters via HTTP, then `ReporterEmitter` fans them out to every registered reporter.

```
Browser (controller.ts)
  │  POST /api/run-begin   → emitBegin(config, suite)
  │  POST /api/report      → emitTestBegin + emitTestEnd  (per file, after it completes)
  │  POST /api/run-end     → emitEnd(result)
  ▼
TestServer (server.ts)
  └── ReporterEmitter (reporter.ts)
        ├── ConsoleReporter
        ├── HtmlReporter
        └── … any custom reporters
```

**Event sequence:**

1. `onBegin` — once, before the first test. Receives the list of test files and the complete test suite tree.
2. `onTestBegin` / `onTestEnd` — once per test, in execution order. Called after each spec file completes (results are batched per file).
3. `onEnd` — once, after all files have run.

### Reporter interface

Defined in `src/reporter.ts`. All methods are optional.

```ts
import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@qavajs/tx/reporter';

interface Reporter {
  onBegin?(config: FullConfig, suite: Suite): void;
  onTestBegin?(test: TestCase, result: TestResult): void;
  onTestEnd?(test: TestCase, result: TestResult): void;
  onEnd?(result: FullResult): void;
}
```

The constructor receives the config object from the tuple as its sole argument.

### Types

```ts
interface FullConfig {
  testFiles: string[];       // basenames of the files included in this run
}

interface Suite {
  title: string;
  tests: TestCase[];
  allTests(): TestCase[];    // flat list of all test cases
}

interface TestCase {
  title: string;             // bare test name (no suite prefix)
  fullTitle: string;         // suite path + test name, e.g. "Login > should redirect"
}

interface TestResult {
  status: 'passed' | 'failed' | 'skipped';
  duration: number;          // milliseconds
  error?: string;            // stack trace or message, present when status === 'failed'
  logs?: LogEntry[];         // all log() calls and attach() entries for this test
}

interface FullResult {
  status: 'passed' | 'failed';
  passed: number;
  failed: number;
  total: number;
  duration: number;          // cumulative milliseconds across all tests
}
```

`TestResult.logs` is an array of `LogEntry` objects:

| Field | Type | Description |
|-------|------|-------------|
| `cmd` | `string` | Command name (e.g. `'click'`, `'attach'`, `'info'`) |
| `message` | `string` | Human-readable description or attachment label |
| `state` | `'pass' \| 'fail' \| 'info'` | Outcome of the step |
| `duration` | `number?` | Step duration in ms |
| `attachment` | `{ body: string; contentType: string }?` | Present only for `attach()` entries |

### Built-in reporters

**ConsoleReporter** — prints a one-line summary per test and totals at the end:

```
Running 12 test(s)
[Passed] Login > should redirect (312ms)
[Failed] Login > wrong password (89ms)
       Error: expected 'error' to be visible
  11 passed, 1 failed, 12 total (2145ms)
```

**HtmlReporter** — writes a self-contained HTML file after the run. Accepts one config option:

| Option       | Type     | Default         | Description |
|--------------|----------|-----------------|-------------|
| `outputPath` | `string` | `"report.html"` | Path for the generated HTML file |

### Writing a custom reporter

```ts
import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@qavajs/tx/reporter';

export default class MyReporter implements Reporter {
  constructor(config: Record<string, unknown>) {}

  onBegin(config: FullConfig, suite: Suite): void {}
  onTestBegin(test: TestCase, result: TestResult): void {}
  onTestEnd(test: TestCase, result: TestResult): void {
    const attachments = result.logs
      ?.filter(l => l.cmd === 'attach' && l.attachment)
      .map(l => ({ label: l.message, ...l.attachment! }));
    console.log(test.fullTitle, result.status, attachments);
  }
  onEnd(result: FullResult): void {}
}
```

Example Slack reporter:

```ts
export class SlackReporter implements Reporter {
  private webhook: string;
  private failures: string[] = [];

  constructor(config: { webhook: string }) {
    this.webhook = config.webhook;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'failed') {
      this.failures.push(`• ${test.fullTitle}: ${result.error?.split('\n')[0]}`);
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    const text = result.status === 'passed'
      ? `All ${result.total} tests passed (${result.duration}ms)`
      : `${result.failed} failed of ${result.total}\n${this.failures.join('\n')}`;
    await fetch(this.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  }
}
```

Register it:

```js
reporters: [['./SlackReporter.ts', { webhook: process.env.SLACK_WEBHOOK }]],
```

`onEnd` may return a `Promise`; the server awaits it before responding to the browser.

### Loading mechanism

1. Each `reporters` entry is a `[modulePath, configObject]` tuple.
2. The module path is resolved relative to the config file directory.
3. `.ts` files are supported — compiled on demand via `src/tsLoader.ts`.
4. The loader looks for a default export or the first exported class constructor, instantiated with the config object as its sole argument.

---

## Control Panel

The control panel is a browser-based UI served at `http://localhost:11339` (or your configured `controlPanelPort`). It includes:

- **Spec list** — all discovered test files with pass/fail badges; run individual tests, suites, or all specs
- **Live browser** — the target site rendered in an iframe via the Hammerhead proxy
- **Snapshot viewer** — DOM snapshots captured after each command (enable with `snapshot: true`)
- **Network panel** — live request/response log with headers and body inspection
- **Console panel** — page `console.*` output and page errors
- **Selector playground** — type a CSS selector to highlight matching elements in the live iframe

---

## Snapshot Mode

When `snapshot: true` is set in config, the framework captures a full computed-style DOM snapshot after each destructive command (`click`, `fill`, `goto`, etc.). Snapshots appear as camera badges in the command log and can be opened in an overlay for visual diffing.

---

## Sharding

Pass `--shard <current>/<total>` to split test files across N parallel CI workers:

```bash
node dist/index.js --config tx.config.js --test --shard 1/4
node dist/index.js --config tx.config.js --test --shard 2/4
node dist/index.js --config tx.config.js --test --shard 3/4
node dist/index.js --config tx.config.js --test --shard 4/4
```

The resolved file list is sorted alphabetically, then divided into `total` equal buckets; worker `current` executes bucket `current` (1-based). If the total number of files doesn't divide evenly the last shard receives fewer files.

`shard` can also be set in `tx.config.js`:

```js
module.exports = {
  shard: { current: Number(process.env.SHARD_INDEX), total: Number(process.env.SHARD_TOTAL) },
  testMode: true,
};
```

---

## Architecture

```
CLI (start.ts)
  └── TxWrapper (wrapper.ts)
        ├── Hammerhead Proxy      ports 11337 / 11338
        ├── TestServer (server.ts) port 11339
        │     ├── GET /           → control panel HTML
        │     ├── GET /panel.js   → bundled browser runtime
        │     ├── GET /about-blank       → blank page served through proxy
        │     ├── POST /api/run-test
        │     ├── POST /api/task
        │     ├── GET /api/tests
        │     └── GET /api/version
        └── Watcher (watcher.ts)
              └── esbuild bundles *.spec.ts → browser IIFE modules
```

At startup the proxy opens two sessions:

- **Proxy session** — wraps the target website URL through Hammerhead.
- **Control panel session** — wraps `http://localhost:11339` so the control panel loads through the proxy, bypassing CSP restrictions.

---

## Server REST API

The control panel server exposes these endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | Control panel HTML |
| `GET`  | `/panel.js` | Bundled browser-side JS (page, Locator, expect, testApi) |
| `GET`  | `/api/tests` | `ParsedFile[]` — list of all loaded test files with their tests |
| `GET`  | `/api/test-source?file=<name>` | Raw bundled JS source for a test file (by basename) |
| `GET`  | `/api/version` | `{ version: number }` — increments on each file-change |
| `POST` | `/api/run-test` | Run test code server-side. Body: `{ code: string }`. Returns `RunResults` |
| `POST` | `/api/task` | Execute a named Node.js task. Body: `{ name, payload? }`. Returns `{ result }` or `{ error }` |
| `GET`  | `/about-blank` | Placeholder HTML page |

All endpoints respond with `Access-Control-Allow-Origin: *`.

```js
const res = await fetch('http://localhost:11339/api/run-test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: `test('x', () => {})` }),
});
const { passed, failed, total, duration, tests } = await res.json();
```

---

## Programmatic Use

```ts
import { TxWrapper } from './src/wrapper';

const wrapper = new TxWrapper({
  proxyHost:        'localhost',
  port1:            11337,
  port2:            11338,
  controlPanelPort: 11339,
  headless:         false,
  testFiles:        ['./specs/login.js'],
  viewport:         { width: 1920, height: 1080 },
});

const testApi = await wrapper.start();   // boots proxy + server + watcher, opens browser
await wrapper.stop();

wrapper.getTestApi(): TestApi
wrapper.getProxyUrl(): string
```

---

## TestRunner (Node.js)

`TestRunner` runs test code server-side in a Node.js `vm` sandbox. Useful for parsing test structure without a browser.

```ts
import { TestRunner, parseTestCode, parseTestFile } from './src/testRunner';

const runner = new TestRunner();
await runner.runCode(code: string, extraContext?: Record<string, any>): Promise<RunResults>
await runner.runFile(filePath: string, extraContext?: Record<string, any>): Promise<RunResults>
runner.report(results: RunResults): void   // pretty-print to console
```

**Extract test structure without executing:**

```ts
const tests: ParsedTest[] = parseTestCode(code: string)
// [{ suite: 'Suite name', name: 'test name' }, ...]

const file: ParsedFile = parseTestFile(filePath: string)
// { filename: 'foo.js', tests: [...], error?: string }
```

**Types:**

```ts
interface ParsedTest  { suite: string; name: string; tags?: string[]; }
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

**Assert static methods:**

```ts
Assert.equal(actual, expected, message?)
Assert.truthy(value, message?)
Assert.falsy(value, message?)
Assert.includes(array, value, message?)
Assert.contains(text, substring, message?)
Assert.greater(actual, threshold, message?)
Assert.less(actual, threshold, message?)
```

---

## Project Structure

```
@qavajs/tx/
├── src/
│   ├── start.ts          # CLI entry point; parses args, loads config, starts the wrapper
│   ├── wrapper.ts        # Orchestrates proxy, HTTP server, and browser lifecycle
│   ├── browser.ts        # page / browser / expect / request API implementations
│   ├── controller.ts     # Control panel frontend logic (test runner, UI panels)
│   ├── testRunner.ts     # Server-side spec file parsing
│   ├── iframeInjector.ts # iframe lifecycle management
│   ├── server.ts         # HTTP server (serves control panel + API endpoints)
│   ├── controlPanel.ts   # Control panel HTML generation
│   ├── reporter.ts       # Reporter interface and ReporterEmitter
│   ├── watcher.ts        # File-change watcher (live reload)
│   ├── tsLoader.ts       # TypeScript require hook for spec files
│   └── types.ts          # Shared TypeScript types
├── types/
│   └── tx.d.ts           # Public type declarations
├── dist/                 # Compiled output
├── tx.config.js          # Example config (in the test/ directory for local dev)
└── package.json
```

---

## How It Works

1. **Startup** — `@qavajs/tx` starts a Hammerhead proxy (two ports) and a lightweight HTTP server.
2. **Proxy session** — Hammerhead creates a session URL for the target site, rewriting all network requests and responses so they flow through the proxy from inside the iframe.
3. **Control panel** — the HTTP server serves an HTML page that embeds the iframe and the spec runner UI.
4. **Test execution** — when a test runs, the spec file is fetched from the server, transpiled on the fly, and `new Function(code)()` is called in the browser context. A `require('@qavajs/tx')` shim is installed so that `import { test } from '@qavajs/tx'` works, and fixtures (`page`, `browser`, `expect`, etc.) are resolved and injected via the DI system before each test body runs.
5. **Reporting** — results are posted back to the server, which forwards them to any configured reporter.

---

## Limitations

- Runs in a single browser window. The browser is spawned directly by the process and killed on `stop()`.
- Cross-origin sub-frames inside the target site are not accessible (sandboxed by the browser).
- No built-in screenshot/PDF capture — snapshotting is DOM-based (computed styles, no rasterization).
- Hammerhead proxies HTTP/HTTPS; WebSocket traffic passes through but is not interceptable at the network level.

## License

MIT
