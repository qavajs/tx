# tx-flow

A Playwright-style E2E test runner that proxies websites through [Hammerhead](https://github.com/DevExpress/testcafe-hammerhead) and runs tests directly in a browser iframe — no separate browser driver required.

Tests use the same `page`, `expect`, `browser`, and fixture API shape as Playwright, so the authoring experience is familiar. Fixtures are injected via destructuring — no implicit globals. The built-in control panel gives you a live view of the running browser, a network inspector, a console panel, and a CSS selector playground alongside your spec list.

## Installation

```bash
npm install tx-flow
```

Or run from source:

```bash
git clone <repo>
cd tx-flow
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

### CLI flags

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

## Writing Tests

Tests look and feel like Playwright. Import `test` and `describe` from `'tx'`. Fixtures (`page`, `browser`, `node`, `expect`, `request`, `log`, `attach`, `logCommand`) are injected via destructuring — not globals.

```ts
import { test, describe } from 'tx';

describe('Login', () => {
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

### Page object pattern

Page objects receive `page` from the test and can import `expect` from `'tx'` for assertions:

```ts
// pages/LoginPage.ts
import { expect } from 'tx';

export class LoginPage {
  constructor(private page: Page) {}

  goto()  { return this.page.goto('https://www.saucedemo.com'); }
  login(user: string, pass: string) { /* ... */ }
  async expectLoaded() { await expect(this.page.getByTestId('title')).toBeVisible(); }
}

// specs/login.spec.ts
import { test, describe } from 'tx';
import { LoginPage } from '../pages/LoginPage';

describe('Login', () => {
  test('logs in', async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.goto();
    await lp.login('standard_user', 'secret_sauce');
    await lp.expectLoaded();
  });
});
```

### Fixtures

```ts
import { test } from 'tx';

const myTest = test.extend<{ apiToken: string }>({
  apiToken: async ({}, use) => {
    await use(process.env.TOKEN ?? 'dev-token');
  },
});

myTest('uses fixture', async ({ page, apiToken }) => {
  await page.goto(`https://example.com?token=${apiToken}`);
});
```

### Hooks

```ts
import { test, describe, beforeAll, beforeEach, afterEach, afterAll } from 'tx';

describe('suite', () => {
  beforeAll(async () => { /* runs once before all tests in this describe */ });
  afterAll(async  () => { /* runs once after  all tests in this describe */ });
  beforeEach(async ({ page }) => { await page.goto('https://example.com'); });
  afterEach(async  () => { /* runs after  each test */ });

  test('test', async ({ page, expect }) => { /* ... */ });
});
```

## API Reference

### `page`

| Method | Description |
|--------|-------------|
| `page.goto(url)` | Navigate to a URL |
| `page.reload()` | Reload the page |
| `page.url()` | Return the current URL string |
| `page.title()` | Return the page title |
| `page.locator(selector)` | Create a locator |
| `page.getByText(text)` | Locate by visible text |
| `page.getByRole(role, opts?)` | Locate by ARIA role |
| `page.getByLabel(text)` | Locate by label |
| `page.getByPlaceholder(text)` | Locate by placeholder |
| `page.getByTestId(id)` | Locate by `data-testid` |
| `page.waitForURL(url, opts?)` | Wait until the URL matches |
| `page.waitForSelector(sel, opts?)` | Wait until an element appears |
| `page.waitForTimeout(ms)` | Wait a fixed duration |
| `page.evaluate(fn, arg?)` | Run a function in the page context |
| `page.addInitScript(script, arg?)` | Register a script for every navigation |
| `page.route(url, handler)` | Intercept requests |
| `page.keyboard` | Keyboard API (see below) |
| `page.mouse` | Mouse API (see below) |
| `page.setViewportSize(size)` | Set viewport dimensions |
| `page.on(event, fn)` | Subscribe to page events |
| `page.screenshot(opts?)` | Capture iframe as PNG; `opts.path` saves it to `test-artifacts/` via server |

### `Locator`

| Method | Description |
|--------|-------------|
| `locator.click(opts?)` | Click the element |
| `locator.dblclick(opts?)` | Double-click |
| `locator.fill(value, opts?)` | Clear and fill an input |
| `locator.type(text, opts?)` | Type character by character |
| `locator.press(key, opts?)` | Press a key |
| `locator.check(opts?)` / `uncheck(opts?)` | Check/uncheck a checkbox |
| `locator.selectOption(value, opts?)` | Select a `<select>` option |
| `locator.hover(opts?)` | Hover over element |
| `locator.focus(opts?)` | Focus element |
| `locator.setInputFiles(files, opts?)` | Attach files to a file input |
| `locator.textContent()` | Get raw text content |
| `locator.innerText()` | Get rendered text |
| `locator.inputValue()` | Get current input value |
| `locator.getAttribute(name)` | Get an attribute value |
| `locator.isVisible()` / `isHidden()` | Visibility state |
| `locator.isEnabled()` / `isDisabled()` | Enabled state |
| `locator.isChecked()` / `isEditable()` | Checked / editable state |
| `locator.count()` | Number of matched elements |
| `locator.nth(n)` / `first()` / `last()` | Index into the match set |
| `locator.filter(opts)` | Narrow by text or visibility |
| `locator.waitFor(opts?)` | Wait for a specific state |
| `locator.evaluate(fn, arg?)` | Run a function on the element |

### `expect`

```ts
// Locator assertions (auto-retry until timeout)
await expect(locator).toBeVisible();
await expect(locator).toBeHidden();
await expect(locator).toBeEnabled();
await expect(locator).toBeDisabled();
await expect(locator).toBeChecked();
await expect(locator).toHaveText('Hello');
await expect(locator).toContainText('ello');
await expect(locator).toHaveValue('foo');
await expect(locator).toHaveAttribute('href', /example/);
await expect(locator).toHaveCount(3);
await expect(locator).toHaveClass('active');

// Page assertions
await expect(page).toHaveURL(/dashboard/);
await expect(page).toHaveTitle('My App');

// Value assertions (synchronous)
expect(count).toBe(6);
expect(items).toContain('banana');
expect(value).toBeGreaterThan(0);

// Negate any assertion
await expect(locator).not.toBeVisible();
```

### `browser`

```ts
// Open a new tab
const newTab = await browser.newPage();
await newTab.goto('https://example.com');
await newTab.close();

// List open tabs
const tabs = browser.pages();
```

### `node`

```ts
// Call a Node.js task defined in tx.config.js
const content = await node.task('readFile', { path: '/tmp/data.json' });
const apiKey  = await node.task('getEnv', 'API_KEY');
```

Use `node` as a fixture to access Node.js tasks inside `test.extend` definitions:

```ts
const myTest = test.extend({
  serverData: async ({ node }, use) => {
    const raw = await node.task('readFile', { path: './fixtures/data.json' });
    await use(JSON.parse(raw));
  },
});
```

### `request`

```ts
const resp = await request.fetch('https://api.example.com/data');
const json = await resp.json();
expect(resp.ok()).toBe(true);
```

### `page.screenshot`

Captures the current iframe as a PNG and returns a data URL. Pass `path` to also save the file to `test-artifacts/` on the server.

```ts
// Capture and use in-memory
const dataUrl = await page.screenshot();

// Capture and persist to disk
await page.screenshot({ path: 'my-screenshot' }); // saved as test-artifacts/my-screenshot.png
```

### `log` and `attach`

`log` writes a message to the command panel during a test. `attach` adds named data (text, JSON, images, …) to the test result so reporters can display or store it. Both are available as fixtures:

```ts
test('checkout', async ({ page, log, attach }) => {
  log('starting checkout flow');

  // Attach plain text
  attach('cart state', JSON.stringify(cart), 'application/json');

  // Attach a screenshot inline
  attach('page state', await page.screenshot(), 'image/png');
});
```

Also usable inside `test.extend` fixture definitions:

```ts
const myTest = test.extend<{ cartData: object }>({
  cartData: async ({ node, log, attach }, use) => {
    const raw = await node.task('readFile', { path: './fixtures/cart.json' });
    log('loaded cart fixture');
    attach('cart fixture', raw, 'application/json');
    await use(JSON.parse(raw));
  },
});
```

The HTML reporter renders image attachments inline and text/JSON attachments in a code block, grouped under the test row they belong to.

### `page.keyboard`

```ts
await page.keyboard.press('Enter');
await page.keyboard.press('Shift+A');        // modifier combo
await page.keyboard.type('hello world');     // character by character
await page.keyboard.insertText('fast paste'); // no key events
await page.keyboard.down('Shift');
await page.keyboard.up('Shift');
```

### `page.mouse`

```ts
await page.mouse.click(100, 200);
await page.mouse.dblclick(100, 200);
await page.mouse.move(300, 400);
await page.mouse.down();
await page.mouse.up();
await page.mouse.wheel(0, 300);
```

### Route interception

```ts
await page.route('**/api/users', async (route, request) => {
  await route.fulfill({
    status: 200,
    json: [{ id: 1, name: 'Alice' }],
  });
});

// Continue with modified headers
await page.route(/auth/, async (route) => {
  await route.continue({ headers: { Authorization: 'Bearer test' } });
});

await page.unroute('**/api/users');
```

## Reporters

Reporters receive structured run events (begin, test result, run end). Pass them in `tx.config.js`:

```js
reporters: [
  ['./ConsoleReporter.ts', {}],
  ['./HtmlReporter.ts', { outputPath: 'report/report.html' }],
],
```

A custom reporter exports a class with the `Reporter` interface:

```ts
import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from 'tx-flow/reporter';

export default class MyReporter implements Reporter {
  constructor(config: Record<string, unknown>) {}

  onBegin(config: FullConfig, suite: Suite): void {}
  onTestBegin(test: TestCase, result: TestResult): void {}
  onTestEnd(test: TestCase, result: TestResult): void {
    // result.logs contains all log() calls and attach() entries for this test
    const attachments = result.logs
      ?.filter(l => l.cmd === 'attach' && l.attachment)
      .map(l => ({ label: l.message, ...l.attachment! }));
    console.log(test.fullTitle, result.status, attachments);
  }
  onEnd(result: FullResult): void {}
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

## Control Panel

The control panel is a browser-based UI served at `http://localhost:11339` (or your configured `controlPanelPort`). It includes:

- **Spec list** — all discovered test files with pass/fail badges; run individual tests, suites, or all specs
- **Live browser** — the target site rendered in an iframe via the Hammerhead proxy
- **Snapshot viewer** — DOM snapshots captured after each command (enable with `snapshot: true`)
- **Network panel** — live request/response log with headers and body inspection
- **Console panel** — page `console.*` output and page errors
- **Selector playground** — type a CSS selector to highlight matching elements in the live iframe

## Project Structure

```
tx-flow/
├── src/
│   ├── start.ts          # CLI entry point; parses args, loads config, starts the wrapper
│   ├── wrapper.ts        # Orchestrates proxy, HTTP server, and browser lifecycle
│   ├── browser.ts        # page / browser / expect / request API implementations
│   ├── controller.ts     # Control panel frontend logic (test runner, UI panels)
│   ├── testRunner.ts     # Server-side spec file parsing
│   ├── iframeInjector.ts # iframe lifecycle management
│   ├── server.ts         # HTTP server (serves control panel + API endpoints)
│   ├── controlPanel.ts   # Control panel HTML generation
│   ├── reporter.ts       # Reporter interface
│   ├── watcher.ts        # File-change watcher (live reload)
│   ├── tsLoader.ts       # TypeScript require hook for spec files
│   └── types.ts          # Shared TypeScript types
├── types/
│   └── tx.d.ts           # Public type declarations
├── dist/                 # Compiled output
├── tx.config.js          # Example config (in the test/ directory for local dev)
└── package.json
```

## How It Works

1. **Startup** — `tx` starts a Hammerhead proxy (two ports) and a lightweight HTTP server.
2. **Proxy session** — Hammerhead creates a session URL for the target site, rewriting all network requests and responses so they flow through the proxy from inside the iframe.
3. **Control panel** — the HTTP server serves an HTML page that embeds the iframe and the spec runner UI.
4. **Test execution** — when a test runs, the spec file is fetched from the server, transpiled on the fly, and `new Function(code)()` is called in the browser context. A `require('tx')` shim is installed so that `import { test, describe, … } from 'tx'` works, and fixtures (`page`, `browser`, `expect`, etc.) are resolved and injected via the DI system before each test body runs.
5. **Reporting** — results are posted back to the server, which forwards them to any configured reporter.

## License

MIT
