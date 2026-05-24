# tx API Reference

`tx` is a Playwright-style browser testing framework that runs tests inside a proxied iframe, making any website testable in any browser (including Safari) without WebDriver or extensions.

---

## Table of Contents

- [Configuration](#configuration)
  - [CLI flags](#cli-flags)
  - [Preprocessor](#preprocessor)
- [Writing Tests](#writing-tests)
  - [Fixtures](#fixtures)
- [page](#page)
  - [page.route / page.unroute](#pageroute--pageunroute)
  - [Route](#route)
  - [page.frameLocator](#pageframelocator)
  - [FrameLocator](#framelocator)
  - [page.mouse](#pagemouse)
- [browser](#browser)
  - [browser.newPage](#browsernewpage)
  - [browser.pages](#browserpages)
- [node](#node)
  - [node.task](#nodetask)
- [request](#request)
  - [request.fetch](#requestfetch)
  - [APIResponse](#apiresponse)
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
  "port1": 11337,
  "port2": 11338,
  "controlPanelPort": 11339,
  "headless": false,
  "testFiles": ["./specs/login.js"],
  "testMatch": "./specs/**/*.js",
  "viewport": { "width": 1920, "height": 1080 }
}
```

| Field              | Type                                    | Default       | Description                                      |
|--------------------|-----------------------------------------|---------------|--------------------------------------------------|
| `proxyHost`        | `string`                                | `"localhost"` | Hostname for the Hammerhead proxy                |
| `port1`            | `number`                                | `11337`        | Proxy port 1                                     |
| `port2`            | `number`                                | `11338`        | Proxy port 2                                     |
| `controlPanelPort` | `number`                                | `11339`        | HTTP server port for the control panel           |
| `headless`         | `boolean`                               | `false`       | Run the browser in headless mode                 |
| `browser`          | `string`                                | —             | Browser to launch: `chrome`, `firefox`, `edge`, `safari`, `chromium`, or an absolute path to a binary. Falls back to the first browser found on the system when omitted. |
| `testFiles`        | `string[]`                              | —             | Explicit list of test file paths (relative to config) |
| `testMatch`        | `string \| string[]`                    | —             | Glob pattern(s) for test file discovery          |
| `grep`             | `string`                                | —             | Filter tests by name or tag (substring or `/regex/flags`) |
| `viewport`         | `{ width, height }`                     | —             | Fixed iframe viewport size; scales to fit panel  |
| `reporters`        | `[path, config][]`                      | —             | Reporter modules — see [Reporters](#reporters)   |
| `tasks`            | `Record<string, TaskHandler>`           | —             | Named Node.js task handlers — see [node.task](#nodetask) |
| `preprocessor`     | `(source, filePath) => string`          | —             | Transform each spec file's raw TypeScript source before bundling/parsing — see [Preprocessor](#preprocessor) |
| `profiles`         | `Record<string, Omit<TxConfig, 'profiles'>>` | —      | Named config profiles — select at runtime with `--profile <name>`; merged on top of base config, before CLI args |
| `retries`          | `number`                                | `0`           | Number of times to retry a failing test before marking it failed. Each retry re-runs the full test (including `beforeEach`/`afterEach` hooks). The duration shown is that of the final attempt only. |
| `testMode`         | `boolean`                               | `false`       | Run all tests automatically on startup, then exit — exit code `0` if all passed, `1` if any failed |
| `snapshot`         | `boolean`                               | `false`       | Capture a DOM snapshot after each command and show it in the Snapshots panel |
| `actionTimeout`    | `number`                                | `5000`        | Default timeout in ms for locator actions (`click`, `fill`, `waitFor`, etc.) |
| `expectTimeout`    | `number`                                | `5000`        | Default timeout in ms for `expect()` assertion retry loops |
| `testTimeout`      | `number`                                | `30000`       | Maximum time in ms a single test function may run before it is cancelled |

`headless` can also be enabled via the environment variable `HEADLESS=true` without changing the config file.

### CLI flags

All config-file fields can be overridden at the command line. CLI values take precedence over the config file and over profile overrides.

```sh
npx tx [options]

  --config <path>          Path to config file (auto-detected: tx.config.json / .js / .mjs)
  --profile <name>         Activate a named profile defined in the config file
  --headless               Run browser in headless mode
  --test                   Enable testMode (run all tests then exit)
  --grep <pattern>         Filter tests by name or tag (substring or /regex/flags)
  --browser <name|path>    Browser to launch: chrome, firefox, edge, safari, chromium, or an absolute path
  --retries <n>            Number of retry attempts for failing tests
  --port <n>               Control panel port (alias for --controlPanelPort)
  --controlPanelPort <n>   Control panel port
  --port1 <n>              Proxy port 1
  --port2 <n>              Proxy port 2
  --proxyHost <host>       Proxy hostname
```

**Environment variables:**

| Variable       | Effect                                      |
|----------------|---------------------------------------------|
| `HEADLESS=true`| Same as `--headless` / `headless: true` in config |

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

### Preprocessor

A `preprocessor` function in `tx.config.js` receives the raw TypeScript source of each spec file and its absolute path, and must return the transformed source string. It runs before esbuild compiles the file — for both bundling (browser execution) and parsing (test discovery).

```ts
(source: string, filePath: string) => string
```

**`tx.config.js`:**

```js
module.exports = {
  preprocessor(source, filePath) {
    return source; // return the (possibly transformed) TypeScript source
  },
};
```

#### When it runs

The preprocessor is called in two places for each spec file:

| Phase | Trigger | What happens next |
|---|---|---|
| **Discovery** | File loaded by the watcher or requested by the server | Preprocessed source → esbuild `transformSync` (TS→CJS) → vm sandbox to extract test names |
| **Execution** | Test run requested from the control panel | Preprocessed source → esbuild `build` (bundle + IIFE) → sent to browser |

Both phases use the same preprocessor, so the test tree visible in the UI always matches what actually runs.

#### Examples

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
  return `import { describe } from 'tx';\ndescribe(${JSON.stringify(rel)}, () => {\n${source}\n});\n`;
},
```

---

## Writing Tests

Import `test`, `describe`, and any hooks from `'tx'`. Fixtures are received via destructuring — not globals.

```js
import { test, describe, beforeEach, afterEach } from 'tx';

describe('Suite name', () => {
  beforeEach(async ({ page }) => {
    await page.goto('https://example.com');
  });

  afterEach(async () => {
    // cleanup
  });

  test('test name', async ({ page, expect }) => {
    await expect(page.locator('h1')).toBeVisible();
  });

  // Optional tags — displayed as chips in the control panel; matched by --grep
  test('smoke check', { tag: ['@smoke', '@fast'] }, async ({ page, expect }) => {
    expect(page.url()).toContain('example.com');
  });
});
```

### Imports from `'tx'`

| Export       | Description                                              |
|--------------|----------------------------------------------------------|
| `test`       | Define a test case; also used as `test.extend()`         |
| `describe`   | Define a test suite                                      |
| `beforeEach` | Hook run before each test in the nearest `describe`      |
| `afterEach`  | Hook run after each test in the nearest `describe`       |
| `beforeAll`  | Hook run once before all tests in the nearest `describe` |
| `afterAll`   | Hook run once after all tests in the nearest `describe`  |

### Built-in fixtures (injected via destructuring)

| Fixture      | Description                                              |
|--------------|----------------------------------------------------------|
| `page`       | Playwright-style page object (see [page](#page))         |
| `browser`    | Multi-tab browser object (see [browser](#browser))       |
| `node`       | Node.js context bridge (see [node](#node))               |
| `request`    | HTTP request context (see [request](#request))           |
| `expect`     | Assertion function (see [expect](#expect))               |
| `log`        | `(message, opts?) => void` — write to the panel console; `opts`: `{ type?: 'info'\|'success'\|'error', cmd?: string, duration?: number }` |
| `log.open`   | `(message, cmd) => TxCommandHandle` — open a pending entry; resolve with `.success()` / `.fail()` |
| `attach`     | `(label, body, contentType?) => void` — attach data to the test result |

### test() signature

```ts
test(name: string, fn: (fixtures) => void | Promise<void>): void
test(name: string, options: { tag?: string[] }, fn: (fixtures) => void | Promise<void>): void
```

The optional `options` object currently accepts:

| Option | Type       | Description                                                                 |
|--------|------------|-----------------------------------------------------------------------------|
| `tag`  | `string[]` | Labels attached to the test. Shown as chips in the spec list. Matched by `grep` / `--grep`. |

Tags are freeform strings — conventionally prefixed with `@` (e.g. `'@smoke'`, `'@regression'`), but any string is valid.

### Fixtures

`test.extend()` creates a custom test function with additional fixtures injected into each test. Built-in fixtures (`page`, `browser`, `node`, `request`, `expect`) are always available via destructuring.

```js
import { test } from 'tx';

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

myTest('api token is returned', async ({ apiToken }) => {
  expect(apiToken).toBeTruthy();
});
```

**Fixture teardown** — code after `await use(value)` runs after the test completes, making fixtures self-cleaning:

```js
const myTest = test.extend({
  dbRecord: async ({}, use) => {
    const id = await db.insert({ name: 'test' });
    await use(id);
    await db.delete(id); // runs after test, pass or fail
  },
});
```

---

## page

Operates on the proxied iframe. Available as the `page` fixture via destructuring in test and hook callbacks.

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

```js
await page.waitForRequest(
  urlOrPredicate: string | RegExp | ((req: Request) => boolean | Promise<boolean>),
  options?: { timeout?: number }
): Promise<Request>
```
Wait for a network request that matches `urlOrPredicate` and return it. The returned object exposes `.url()`, `.method()`, `.headers()`, `.postData()`, `.resourceType()`, and `.isNavigationRequest()`. Default timeout: 30 000 ms.

- **string** — treated as a glob pattern (same matching as `page.route()`; `*` matches within a path segment, `**` matches across segments).
- **RegExp** — tested against the full request URL.
- **function** — called with the request object; must return `true` (or a promise resolving to `true`) to match.

```js
// Wait for any POST to /api/submit
const req = await page.waitForRequest('**/api/submit');
console.log(req.method()); // 'POST'

// Wait using a predicate
const req = await page.waitForRequest(
  r => r.url().includes('/search') && r.method() === 'GET'
);
```

```js
await page.waitForResponse(
  urlOrPredicate: string | RegExp | ((resp: Response) => boolean | Promise<boolean>),
  options?: { timeout?: number }
): Promise<Response>
```
Wait for a network response that matches `urlOrPredicate` and return it. The returned object exposes `.url()`, `.status()`, `.statusText()`, `.ok()`, `.headers()`, `.body()`, and `.request()`. Accepts the same `urlOrPredicate` forms as `waitForRequest`. Default timeout: 30 000 ms.

```js
// Trigger an action and wait for the resulting API response
const [, resp] = await Promise.all([
  page.locator('button[type="submit"]').click(),
  page.waitForResponse('**/api/login'),
]);
console.log(resp.status()); // 200

// Wait for a successful response
const resp = await page.waitForResponse(r => r.url().includes('/data') && r.status() === 200);
const body = resp.body(); // raw text captured by the bridge
```

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
  beforeEach(async ({ page }) => {
    // Dismiss the cookie banner whenever it appears, throughout the suite
    page.addLocatorHandler(
      page.locator('#cookie-banner'),
      async (banner) => {
        await banner.getByRole('button', { name: 'Accept all' }).click();
      }
    );

    await page.goto('https://shop.example.com');
  });

  test('adds item to cart', async ({ page, expect }) => {
    // If the banner appears before or during this click, it is dismissed first
    await page.locator('.add-to-cart').click();
    await expect(page.locator('.cart-count')).toHaveText('1');
  });
});
```

**Example — dismiss a modal at most once:**

```js
test('promo flow', async ({ page }) => {
  page.addLocatorHandler(
    page.locator('.promo-modal'),
    async (modal) => {
      await modal.locator('[aria-label="Close"]').click();
    },
    { times: 1 }
  );
  // … rest of test
});
```

**Example — non-blocking tooltip removal:**

```js
test('tooltip flow', async ({ page }) => {
  page.addLocatorHandler(
    page.locator('.blocking-tooltip'),
    async () => {
      await page.keyboard.press('Escape');
    },
    { noWaitAfter: true }   // tooltip may linger; don't stall the test
  );
});
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

## page.route / page.unroute

Intercept, modify, mock, or abort network requests made by the page.

```js
await page.route(
  pattern: string | RegExp | ((url: string) => boolean),
  handler: (route: Route, request: any) => void | Promise<void>
): Promise<void>
```

Register a route handler. When a fetch or XHR request URL matches `pattern`, `handler` is called instead of letting the request proceed normally. Multiple handlers can be registered; the most recently registered matching handler wins.

- **`pattern`** — a URL string (exact match), a `RegExp`, or a predicate function.
- **`handler`** — receives a [`Route`](#route) object and the original request. Must call `route.fulfill()`, `route.abort()`, or `route.continue()` (called automatically if the handler returns without deciding).

```js
await page.unroute(
  pattern: string | RegExp | ((url: string) => boolean),
  handler?: (route: Route, request: any) => void | Promise<void>
): Promise<void>
```

Remove a previously registered handler. If `handler` is omitted, all handlers for that pattern are removed.

**Examples:**

```js
// Mock a REST endpoint
await page.route('https://api.example.com/users', async route => {
  await route.fulfill({
    json: [{ id: 1, name: 'Alice' }],
  });
});

// Block all image requests
await page.route(/\.(png|jpe?g|gif|webp|svg)$/i, route => route.abort());

// Rewrite a URL
await page.route('https://api.example.com/v1/data', async (route, req) => {
  await route.continue({ url: 'https://api.example.com/v2/data' });
});

// Add an auth header to every API call
await page.route(/api\.example\.com/, async (route, req) => {
  await route.continue({
    headers: { ...req.headers(), Authorization: 'Bearer test-token' },
  });
});

// Remove a specific handler
const handler = async (route) => { await route.fulfill({ json: {} }); };
await page.route('/api/data', handler);
// … later:
await page.unroute('/api/data', handler);
```

---

## Route

Passed to the handler registered with `page.route()`. Controls what happens to the intercepted request.

```js
await route.fulfill(options?: {
  status?:      number;                  // HTTP status code (default: 200)
  contentType?: string;                  // Sets Content-Type header
  headers?:     Record<string, string>;  // Additional response headers
  body?:        string | Uint8Array;     // Raw response body
  json?:        any;                     // Body as JSON (sets Content-Type: application/json)
}): Promise<void>
```

Respond with custom data. `json` and `body` are mutually exclusive; `json` takes precedence.

```js
await route.abort(errorCode?: string): Promise<void>
```

Abort the request. `errorCode` defaults to `'failed'`. Common values: `'aborted'`, `'blockedbyclient'`, `'connectionrefused'`, `'timedout'`.

```js
await route.continue(opts?: {
  url?:     string;                  // Override the request URL
  method?:  string;                  // Override the HTTP method
  headers?: Record<string, string>;  // Override request headers
  postData?: BodyInit;               // Override the request body
}): Promise<void>
```

Pass the request through, optionally modifying it. Unspecified fields keep their original values.

```js
route.request(): object
```

Returns the original request object. Supports `.url()`, `.method()`, `.headers()`, `.postData()`, `.resourceType()`, `.isNavigationRequest()`.

---

## page.frameLocator

```js
page.frameLocator(selector: string): FrameLocator
```

Return a `FrameLocator` scoped to the `<iframe>` matched by `selector`. Use it to query elements inside a nested iframe.

```js
// Interact with content inside an iframe
const frame = page.frameLocator('#payment-iframe');
await frame.getByLabel('Card number').fill('4242 4242 4242 4242');
await frame.getByRole('button', { name: 'Pay' }).click();
```

`FrameLocator` can also be chained to reach doubly-nested iframes:

```js
const inner = page.frameLocator('#outer').frameLocator('#inner');
await inner.locator('.result').waitFor();
```

---

## FrameLocator

Returned by `page.frameLocator()` or `frameLocator.frameLocator()`. All methods return a [`Locator`](#locator) scoped to the target iframe's document.

```js
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

These behave identically to their `page.*` counterparts but operate on the iframe's DOM. The returned `Locator` objects support the full [Locator](#locator) API.

---

## page.mouse

Low-level mouse control. Coordinates are relative to the iframe viewport.

```js
await page.mouse.move(x: number, y: number, opts?: { steps?: number }): Promise<void>
```
Move the cursor to `(x, y)`. `steps` interpolates the movement in that many increments (useful for triggering hover transitions).

```js
await page.mouse.down(opts?: { button?: 'left' | 'middle' | 'right' }): Promise<void>
await page.mouse.up(opts?: { button?: 'left' | 'middle' | 'right' }): Promise<void>
```
Press or release a mouse button at the current cursor position.

```js
await page.mouse.click(x: number, y: number, opts?: {
  button?:     'left' | 'middle' | 'right';
  clickCount?: number;
  delay?:      number;  // ms between mousedown and mouseup
}): Promise<void>
```
Move to `(x, y)` and perform a full click (pointerdown → mousedown → mouseup → click).

```js
await page.mouse.dblclick(x: number, y: number, opts?: {
  button?: 'left' | 'middle' | 'right';
  delay?:  number;
}): Promise<void>
```
Perform two clicks in sequence and dispatch a `dblclick` event.

```js
await page.mouse.wheel(deltaX: number, deltaY: number): Promise<void>
```
Dispatch a `wheel` event at the current cursor position.

**Example — drag and drop:**

```js
await page.mouse.move(100, 200);
await page.mouse.down();
await page.mouse.move(300, 200, { steps: 10 });
await page.mouse.up();
```

---

## browser

Multi-tab manager available as the `browser` fixture via destructuring in test and hook callbacks.

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

**Example — multi-tab flow:**

```js
test('opens a popup and reads its title', async ({ page }) => {
  await page.goto('https://example.com');

  // intercept window.open / target="_blank"
  page.on('popup', async popup => {
    await popup.waitForURL(/popup-page/);
    console.log(await popup.title());
    await popup.close();
  });

  await page.locator('a[target="_blank"]').click();
});

test('manual multi-tab', async ({ page, browser }) => {
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

## node

Node.js context bridge available as the `node` fixture via destructuring. Provides access to Node.js APIs (file system, environment variables, databases, etc.) from within browser-side test code.

### node.task

```js
await node.task<T = unknown>(name: string, payload?: unknown): Promise<T>
```

Execute a named task handler registered in `tx.config.js` under `tasks` and return its result to the test.

**Parameters:**

| Parameter | Type      | Description                                                  |
|-----------|-----------|--------------------------------------------------------------|
| `name`    | `string`  | The task name as registered in `tx.config.js` under `tasks` |
| `payload` | `unknown` | Optional JSON-serializable argument passed to the handler    |

**Returns:** A `Promise` that resolves to the handler's return value (must be JSON-serializable). Throws if the task name is not registered or the handler throws.

**Defining tasks in `tx.config.js`:**

```js
const fs = require('fs');

module.exports = {
  tasks: {
    getEnv:   (name) => process.env[name] ?? null,
    readFile: ({ path }) => fs.readFileSync(path, 'utf-8'),
    writeFile: ({ path, content }) => { fs.writeFileSync(path, content); return null; },
    seedDatabase: async (records) => {
      await db.insertMany(records);
      return records.length;
    },
  },
};
```

**Using `node.task` directly in tests:**

```js
test('reads a fixture from disk', async ({ node, expect }) => {
  const json = await node.task('readFile', { path: './fixtures/user.json' });
  const user = JSON.parse(json);
  expect(user.name).toBe('Alice');
});

test('seeds the database before testing', async ({ node, page, expect }) => {
  const inserted = await node.task('seedDatabase', [{ id: 1, role: 'admin' }]);
  expect(inserted).toBe(1);
  await page.goto('https://app.example.com/users');
  await expect(page.locator('[data-testid="user-row"]')).toHaveCount(1);
});
```

**Using `node` as a fixture:**

```js
const myTest = test.extend({
  serverData: async ({ node }, use) => {
    const raw = await node.task('readFile', { path: './fixtures/data.json' });
    await use(JSON.parse(raw));
  },
});

myTest('shows seeded data', async ({ serverData }) => {
  expect(serverData.items).toHaveLength(3);
});
```

> **Note:** `browser.task(name, payload)` is a convenience alias that delegates to `node.task`. Prefer `node.task` in new code.

---

## request

An `APIRequestContext` available as the `request` fixture via destructuring. Makes HTTP requests directly from the panel process (not through the proxied iframe), so there are no iframe-imposed CORS restrictions. All requests appear in the **Network** tab alongside iframe requests.

### request.fetch

```js
await request.fetch(url: string, options?: RequestInit): Promise<APIResponse>
```

Fetch `url` using the native `fetch` API. `options` accepts the full standard [`RequestInit`](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit) object (`method`, `headers`, `body`, `credentials`, etc.).

### APIResponse

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

**Examples:**

```js
test('CRUD operations', async ({ request, expect }) => {
  // GET
  const resp = await request.fetch('https://api.example.com/users');
  expect(resp.status()).toBe(200);
  const users = await resp.json();

  // POST with JSON body
  const resp2 = await request.fetch('https://api.example.com/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alice' }),
  });
  expect(resp2.ok()).toBe(true);

  // DELETE
  const resp3 = await request.fetch('https://api.example.com/users/42', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(resp3.status()).toBe(204);
});
```

**Using `request` as a fixture:**

```js
test('status endpoint is healthy', async ({ request }) => {
  const resp = await request.fetch('https://api.example.com/health');
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.status).toBe('ok');
});
```

**Combining with other fixtures:**

```js
const myTest = test.extend({
  authToken: async ({ request }, use) => {
    const resp = await request.fetch('https://api.example.com/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret' }),
    });
    const { token } = await resp.json();
    await use(token);
  },
});

myTest('authenticated request succeeds', async ({ request, authToken }) => {
  const resp = await request.fetch('https://api.example.com/protected', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  expect(resp.status()).toBe(200);
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

The control panel server (`http://localhost:13339` by default) exposes these endpoints:

| Method | Path                           | Description                                                      |
|--------|--------------------------------|------------------------------------------------------------------|
| `GET`  | `/`                            | Control panel HTML                                               |
| `GET`  | `/panel.js`                    | Bundled browser-side JS (page, Locator, expect, testApi)         |
| `GET`  | `/api/tests`                   | `ParsedFile[]` — list of all loaded test files with their tests  |
| `GET`  | `/api/test-source?file=<name>` | Raw bundled JS source for a test file (by basename)              |
| `GET`  | `/api/version`                 | `{ version: number }` — increments on each file-change           |
| `POST` | `/api/run-test`                | Run test code server-side. Body: `{ code: string }`. Returns `RunResults` |
| `POST` | `/api/task`                    | Execute a named Node.js task. Body: `{ name, payload? }`. Returns `{ result }` or `{ error }` |
| `GET`  | `/about-blank`                        | Placeholder HTML page                                            |

All endpoints respond with `Access-Control-Allow-Origin: *`.

**POST /api/run-test example:**

```js
const res = await fetch('http://localhost:11339/api/run-test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: `test('x', () => {})` }),
});
const { passed, failed, total, duration, tests } = await res.json();
```

---

## TxWrapper (Node.js programmatic use)

```ts
import { TxWrapper } from './src/wrapper';

const wrapper = new TxWrapper({
  proxyHost:        'localhost',
  port1:            11337,
  port2:            11338,
  controlPanelPort: 11339,
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
