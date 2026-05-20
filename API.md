# tx API Reference

`tx` is a Playwright-style browser testing framework that runs tests inside a proxied iframe, making any website testable in any browser (including Safari) without WebDriver or extensions.

---

## Table of Contents

- [Configuration](#configuration)
- [Writing Tests](#writing-tests)
- [page](#page)
- [Locator](#locator)
- [expect](#expect)
- [Legacy tx API](#legacy-tx-api)
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

| Field              | Type                    | Default       | Description                                      |
|--------------------|-------------------------|---------------|--------------------------------------------------|
| `proxyHost`        | `string`                | `"localhost"` | Hostname for the Hammerhead proxy                |
| `port1`            | `number`                | `1337`        | Proxy port 1                                     |
| `port2`            | `number`                | `1338`        | Proxy port 2                                     |
| `controlPanelPort` | `number`                | `3000`        | HTTP server port for the control panel           |
| `headless`         | `boolean`               | `false`       | Skip opening a browser window                    |
| `testFiles`        | `string[]`              | —             | Explicit list of test file paths (relative to config) |
| `testMatch`        | `string \| string[]`    | —             | Glob pattern(s) for test file discovery          |
| `viewport`         | `{ width, height }`     | —             | Fixed iframe viewport size; scales to fit panel  |

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
| `expect`      | Assertion function (see [expect](#expect))               |
| `tx`          | Legacy simple API (see [Legacy tx API](#legacy-tx-api))  |
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

### Lifecycle

```js
await page.close(): Promise<void>
```
Remove the iframe and emit the `close` event.

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

## Legacy tx API

The `tx` global (also accessible as `window.testApi`) provides a simpler synchronous-first API. It is the original API and is kept for backward compatibility. Prefer the `page` + `expect` API for new tests.

### Navigation

```js
tx.visit(url: string): void       // navigate (no proxy rewriting)
tx.reload(): void                  // reload current page
tx.url(): string                   // current iframe URL
tx.title(): string                 // current page <title>
await tx.wait(ms?: number): Promise<void>  // wait ms (default 1000)
```

### Selectors

```js
tx.get(selector: string): Element[]         // querySelectorAll
tx.find(selector: string): Element | null   // querySelector
tx.text(selector: string): string           // textContent of first match
tx.attr(selector: string, name: string): string | null
tx.isVisible(selector: string): boolean
```

### Interactions

```js
tx.click(selector: string): void
tx.type(selector: string, value: string): void  // sets value + fires input/change
```

### Waiting

```js
await tx.waitForElement(selector: string, timeout?: number): Promise<Element>
await tx.waitForUrl(pattern: string | RegExp, timeout?: number): Promise<void>
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
| `popup`            | `(popup) => void`                              | `window.open()` was called. `popup.url()`, `popup.close()` |
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

| Method | Path                          | Description                                                      |
|--------|-------------------------------|------------------------------------------------------------------|
| `GET`  | `/`                           | Control panel HTML                                               |
| `GET`  | `/panel.js`                   | Bundled browser-side JS (page, Locator, expect, testApi)         |
| `GET`  | `/api/tests`                  | `ParsedFile[]` — list of all loaded test files with their tests  |
| `GET`  | `/api/test-source?file=<name>` | Raw bundled JS source for a test file (by basename)             |
| `GET`  | `/api/version`                | `{ version: number }` — increments on each file-change          |
| `POST` | `/api/run-test`               | Run test code server-side. Body: `{ code: string }`. Returns `RunResults` |
| `GET`  | `/mock`                       | Placeholder HTML page                                            |

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
