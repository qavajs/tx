# tx — Implementation Reference

**tx** is a Playwright-style virtual browser testing framework that runs websites inside an iframe via the Hammerhead proxy. Tests are written in TypeScript using a `page`/`expect` API modelled after Playwright.

---

## Project Structure

```
cypress-safari/
├── src/
│   ├── start.ts          # CLI entry point — config loading, arg parsing
│   ├── wrapper.ts        # TxWrapper — starts proxy + server + watcher
│   ├── server.ts         # HTTP server (port 3000) — serves control panel + test API
│   ├── browser.ts        # Browser-side runtime — page, Locator, tab management
│   ├── panel.ts          # Browser-side UI wiring — test runner panel
│   ├── testRunner.ts     # Node.js vm sandbox test runner
│   ├── serverPage.ts     # Server-side page API (fetch + regex HTML, no DOM)
│   ├── watcher.ts        # esbuild file bundler + fs.watch hot-reload
│   ├── reporter.ts       # Reporter event emitter system
│   ├── controlPanel.ts   # HTML generator for the control panel UI
│   ├── iframeInjector.ts # Iframe management helpers
│   ├── testApi.ts        # Legacy test API (compatibility shim)
│   ├── tsLoader.ts       # ts-node loader registration
│   └── types.ts          # TxConfig, TaskHandler, and shared type definitions
│
├── test/
│   ├── tx.config.js           # Project config file
│   ├── specs/                 # Test spec files (*.spec.ts)
│   ├── pages/                 # Page Object Model classes
│   ├── ConsoleReporter.ts     # Built-in console reporter
│   └── HtmlReporter.ts        # Built-in HTML report generator
│
├── dist/                 # esbuild output (index.js, panel.js, ...)
├── build.mjs             # esbuild build script
├── package.json
└── tsconfig.json
```

---

## Architecture

```
CLI (start.ts)
  └── TxWrapper (wrapper.ts)
        ├── Hammerhead Proxy      ports 1337 / 1338
        ├── TestServer (server.ts) port 3000
        │     ├── GET /           → control panel HTML
        │     ├── GET /panel.js   → bundled browser runtime
        │     ├── GET /mock       → blank page served through proxy
        │     ├── POST /api/run-test
        │     ├── POST /api/task
        │     ├── GET /api/tests
        │     └── GET /api/version
        └── Watcher (watcher.ts)
              └── esbuild bundles *.spec.ts → browser IIFE modules
```

At startup the proxy opens two sessions:

- **Proxy session** — wraps the target website URL through Hammerhead.
- **Control panel session** — wraps `http://localhost:3000` so the control panel loads through the proxy, bypassing CSP restrictions.

---

## Test File Format

Tests are standard `describe` / `test` blocks, identical to Playwright/Jest:

```typescript
describe('Login flow', () => {
  beforeEach(async () => { /* ... */ });

  test('logs in with valid credentials', async () => {
    await page.goto('https://www.saucedemo.com');
    await page.getByTestId('username').fill('standard_user');
    await page.getByTestId('password').fill('secret_sauce');
    await page.getByTestId('login-button').click();
    await page.waitForURL(/inventory/);
    await expect(page.locator('[data-test="title"]')).toHaveText('Products');
  });

  // Tags are shown as chips in the control panel and matched by grep
  test('smoke check', { tag: ['@smoke'] }, async () => {
    await page.goto('https://www.saucedemo.com');
    await expect(page.getByTestId('login-button')).toBeVisible();
  });
});
```

`page` and `expect` are available as globals. Fixtures are supported via `test.extend()`.

---

## page API

### Navigation
| Method | Description |
|--------|-------------|
| `page.goto(url)` | Navigate to URL (returns Promise) |
| `page.reload()` | Reload the current page |
| `page.url()` | Return current URL (real URL, proxy prefix stripped) |
| `page.title()` | Return current page title |
| `page.waitForURL(urlOrRegExp, opts?)` | Wait until URL matches |
| `page.waitForSelector(selector, opts?)` | Wait for element, returns Locator |
| `page.waitForTimeout(ms)` | Explicit delay |
| `page.evaluate(fn, ...args)` | Execute function in iframe context |
| `page.addInitScript(fnOrScript)` | Inject script on every page load |

### Locator factories
| Method | Description |
|--------|-------------|
| `page.locator(selector)` | CSS selector + `:has-text()` pseudo-class |
| `page.getByText(text, opts?)` | Match by text content |
| `page.getByRole(role, opts?)` | Match by ARIA role (+ optional `name`) |
| `page.getByLabel(text, opts?)` | Match by associated `<label>` or `aria-label` |
| `page.getByPlaceholder(text)` | Match by placeholder attribute |
| `page.getByTestId(id)` | Match by `data-testid` or `data-test` attribute |
| `page.getByAltText(text)` | Match by `alt` attribute |
| `page.getByTitle(text)` | Match by `title` attribute |
| `page.frameLocator(selector)` | Scope subsequent queries to a sub-frame |

### Keyboard & Mouse
| Method | Description |
|--------|-------------|
| `page.keyboard.press(key)` | Press a key on the focused element |
| `page.keyboard.type(text, opts?)` | Type text character by character |
| `page.mouse.move(x, y)` | Move mouse pointer |
| `page.mouse.click(x, y, opts?)` | Click at coordinates |

### Events
| Event | Description |
|-------|-------------|
| `page.on('console', fn)` | Forward iframe console messages |
| `page.on('pageerror', fn)` | Uncaught errors and unhandled rejections |
| `page.on('dialog', fn)` | alert / confirm / prompt intercept |
| `page.on('popup', fn)` | New tab opened via `window.open` or `target="_blank"` |
| `page.on('request', fn)` | Every fetch / XHR request |
| `page.on('response', fn)` | Every fetch / XHR response |
| `page.on('requestfinished', fn)` | Request completed |
| `page.on('requestfailed', fn)` | Request failed |
| `page.on('download', fn)` | Download link clicked |
| `page.on('filechooser', fn)` | File input activated |
| `page.on('websocket', fn)` | WebSocket opened |
| `page.on('worker', fn)` | Web Worker created |
| `page.on('frameattached/detached/navigated', fn)` | Sub-frame lifecycle |

---

## Locator API

A `Locator` is lazy — it re-queries the DOM on every call. All action methods automatically wait for the element to be visible, enabled, stable, and receiving events (up to `timeout`, default 5 s).

### Chaining
```typescript
page.locator('ul li').nth(2)
page.locator('.item').first()
page.locator('.item').last()
page.locator('.item').filter({ hasText: 'Add to cart' })
page.locator('form').locator('input[type="email"]')
```

### Actions
| Method | Notes |
|--------|-------|
| `.click(opts?)` | Dispatches mouseover → mousedown → mouseup → click |
| `.dblclick(opts?)` | |
| `.rightClick(opts?)` | Dispatches contextmenu |
| `.fill(value, opts?)` | Clears field then types, fires React/Vue-compatible events |
| `.clear(opts?)` | Alias for `.fill('')` |
| `.type(text, opts?)` | Appends text character by character |
| `.press(key, opts?)` | Keyboard events + form submit on Enter |
| `.selectOption(value, opts?)` | `<select>` value or text |
| `.check(opts?)` / `.uncheck(opts?)` | Checkbox / radio |
| `.focus(opts?)` | |
| `.hover(opts?)` | |
| `.scrollIntoViewIfNeeded(opts?)` | |
| `.setInputFiles(files, opts?)` | File input (path string or `{ name, mimeType, buffer }`) |

### Queries
| Method | Returns |
|--------|---------|
| `.textContent()` | `Promise<string \| null>` |
| `.innerText()` | `Promise<string>` |
| `.inputValue()` | `Promise<string>` |
| `.getAttribute(name)` | `Promise<string \| null>` |
| `.isVisible()` | `Promise<boolean>` |
| `.isHidden()` | `Promise<boolean>` |
| `.isEnabled()` | `Promise<boolean>` |
| `.isDisabled()` | `Promise<boolean>` |
| `.isChecked()` | `Promise<boolean>` |
| `.isEditable()` | `Promise<boolean>` |
| `.count()` | `Promise<number>` |
| `.waitFor(opts?)` | Wait for `state: 'visible' \| 'hidden' \| 'attached' \| 'detached'` |

---

## expect() Matchers

```typescript
expect(value).toBe(expected)
expect(value).toEqual(expected)
expect(value).toBeTruthy()
expect(value).toBeFalsy()
expect(value).toBeNull()
expect(value).toBeUndefined()
expect(value).toContain(substring)
expect(value).toMatch(regexpOrString)
expect(number).toBeGreaterThan(n)
expect(number).toBeLessThan(n)
expect(array).toHaveLength(n)
expect(fn).toThrow()
```

Locator-based async matchers (auto-retry until timeout):
```typescript
await expect(locator).toHaveText(text, opts?)
await expect(locator).toContainText(text, opts?)
await expect(locator).toHaveValue(value)
await expect(locator).toHaveCount(n, opts?)
await expect(locator).toBeVisible(opts?)
await expect(locator).toBeHidden(opts?)
await expect(locator).toBeEnabled(opts?)
await expect(locator).toBeDisabled(opts?)
await expect(locator).toBeChecked(opts?)
await expect(locator).toHaveAttribute(name, value?)
await expect(page).toHaveURL(urlOrRegExp, opts?)
await expect(page).toHaveTitle(titleOrRegExp, opts?)
```

---

## browser API

```typescript
const newPage = await browser.newPage()   // Open a new tab
await browser.closeTab(tabId)             // Close a tab
browser.closeExtraTabs()                  // Close all tabs except the first
const result = await browser.task('readFile', { path: './data.json' })
```

`browser.task()` calls a named handler registered in `tx.config.js` under `tasks`, running in the Node.js context.

---

## Configuration (tx.config.js)

```javascript
module.exports = {
  proxyHost: 'localhost',
  port1: 1337,              // Hammerhead proxy port 1
  port2: 1338,              // Hammerhead proxy port 2
  controlPanelPort: 3000,   // Control panel HTTP port
  headless: false,          // Run browser in headless mode
  browser: 'chrome',        // 'chrome' | 'firefox' | 'edge' | 'safari' | 'chromium' | absolute path
  testFiles: ['./specs/**/*.spec.ts'],  // Glob patterns
  grep: 'login',            // Filter tests by name or tag (string or /regexp/flags)
  viewport: { width: 1600, height: 900 },
  testMode: false,          // Run all tests then exit with code 0/1
  snapshot: false,          // Capture DOM snapshots after each command
  reporters: [
    ['./ConsoleReporter.ts', {}],
    ['./HtmlReporter.ts', { outputPath: 'report/report.html' }],
  ],
  tasks: {
    readFile: ({ path }) => require('fs').readFileSync(path, 'utf-8'),
    dirname:  () => __dirname,
  },
  // Named profiles — select with --profile <name>; merged before CLI args
  profiles: {
    ci:    { headless: true, browser: 'chromium', testMode: true },
    debug: { headless: false, actionTimeout: 30000, testTimeout: 120000 },
  },
};
```

---

## Running Tests

```bash
# Interactive mode — opens browser, hot-reloads on file change
npm start

# Test mode — runs all specs, exits 0 on pass / 1 on failure
npm test

# Build only
node build.mjs

# Typecheck
npm run typecheck
```

CLI overrides:
```bash
node dist/index.js --config test/tx.config.js
node dist/index.js --config test/tx.config.js --test
node dist/index.js --config test/tx.config.js --grep login
node dist/index.js --config test/tx.config.js --profile ci
node dist/index.js --headless true
```

---

## Reporter API

Custom reporters implement the `Reporter` interface from `src/reporter.ts`:

```typescript
import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '../src/reporter';

export class MyReporter implements Reporter {
  onBegin(config: FullConfig, suite: Suite): void { }
  onTestBegin(test: TestCase, result: TestResult): void { }
  onTestEnd(test: TestCase, result: TestResult): void { }
  onEnd(result: FullResult): void { }
}
```

Register in `tx.config.js` under `reporters` as `['./MyReporter.ts', { ...config }]`.

---

## Snapshot Mode

When `snapshot: true` is set in config, the framework captures a full computed-style DOM snapshot after each destructive command (`click`, `fill`, `goto`, etc.). Snapshots appear as camera badges in the command log and can be opened in an overlay for visual diffing.

---

## Fixtures

Tests can use Playwright-style fixtures via `test.extend()`:

```typescript
import { test as base } from 'tx';

const test = base.extend({
  loggedIn: async ({ page }, use) => {
    await page.goto('https://example.com');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('secret');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await use(page);
  },
});

test('sees dashboard', async ({ loggedIn }) => {
  await expect(loggedIn.getByRole('heading')).toHaveText('Dashboard');
});
```

---

## Page Object Model

```typescript
// test/pages/LoginPage.ts
export class LoginPage {
  constructor(private page: typeof page) {}

  async goto() { await this.page.goto('https://www.saucedemo.com'); }

  async login(username: string, password: string) {
    await this.page.getByTestId('username').fill(username);
    await this.page.getByTestId('password').fill(password);
    await this.page.getByTestId('login-button').click();
  }

  async waitForInventory() {
    await this.page.waitForURL(/inventory/);
  }
}
```

---

## Limitations

- Runs in a single browser window. The browser is spawned directly by the process and killed on `stop()`.
- Cross-origin sub-frames inside the target site are not accessible (sandboxed by the browser).
- No built-in screenshot/PDF capture — snapshotting is DOM-based (computed styles, no rasterization).
- Hammerhead proxies HTTP/HTTPS; WebSocket traffic passes through but is not interceptable at the network level.
