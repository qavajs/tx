# Changelog

All notable changes to `@qavajs/tx` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.0.12]

### Fixed
- Test discovery now works correctly when spec files import third-party packages (e.g. `chai`) — the VM sandbox used for parsing lacked host globals such as `EventTarget`, causing package initialisation to throw before any tests were registered; replaced the VM sandbox with `new Function` running in the host Node.js context so all globals are naturally available, with `createRequire` intercepting only `@qavajs/tx`

### Changed
- File watcher no longer filters by `.js`/`.ts` extension — any change to a tracked file triggers re-bundling, enabling test files with non-standard extensions to be watched correctly

### Added
- Built reporters (`ConsoleReporter`, `HtmlReporter`, `JUnitReporter`) are now compiled to `dist/reporters/` and included in the published package

## [0.0.11]

### Fixed
- Test discovery now works correctly when spec files import `test` from a local fixture file (e.g. `import { test } from './fixtures'`) — `parseTestFile` previously used `esbuild.transformSync` (transpile only), so `require('./fixtures')` resolved to a no-op stub in the VM sandbox and no tests were registered; switched to `esbuild.buildSync` with `bundle: true` and `external: ['@qavajs/tx']` so local imports are inlined before parsing

### Added
- `defineConfig(config)` — helper exported from `'@qavajs/tx'` that returns its argument unchanged; gives full TypeScript IntelliSense on all config fields when used in `tx.config.ts`
- `TxConfig` interface — full type declaration for the configuration object, now exported from `'@qavajs/tx'` for use in type annotations
- Keyboard shortcuts in the control panel — `R` runs all tests, `F` focuses the filter input, `↑`/`↓` navigates the visible test list, `Enter` runs the keyboard-focused test, `Esc` clears the filter or blurs the input. A `?` button in the topbar shows a hover tooltip listing all shortcuts
- Retry indicators in the UI — passing tests that required retries show `↺N` on the status badge (e.g. `234ms ↺2`); a `↻ Retry N` banner is prepended to the test log at the start of each retry attempt
- Inline attachments in the command log — `attach(label, body, contentType)` now renders directly in the log panel: images (`image/*`) appear as inline thumbnails; HTML attachments (`text/html`) get a "⊞ View HTML" button that opens the content in the snapshot viewer pane

### Changed
- Chromium launches now write a `Default/Preferences` file to the temp user data dir with `credentials_enable_service` and `password_manager_leak_detection` disabled, suppressing the "change this password" popup during test runs
- Profile deep merge — `--profile <name>` values are now deep-merged on top of the base config (nested objects like `viewport` are merged field-by-field instead of replaced wholesale)
- `ConsoleReporter` now prints `[retry N]` in yellow next to the test title when a test passed after one or more retries
- `window.runAll` now delegates to `window.runFiltered()` when a filter is active, and `runFiltered` now returns `{ passed, failed }` consistent with `runAll`; internal `_runMultiFile` helper extracted to deduplicate the run loop
- `main()` in `src/index.ts` is now guarded by `require.main === module` so the module can be imported without triggering CLI startup

## [0.0.10]

### Added
- `page.ariaSnapshot()` — returns a YAML string of the full-page ARIA accessibility tree rooted at `<body>`. Uses a Playwright-compatible format: `- heading "Title" [level=1]`, `- button "Submit" [disabled]`, `- textbox "Email": "user@example.com"`, etc. Hidden elements (`display:none`, `visibility:hidden`), `aria-hidden="true"` subtrees, and `role="none/presentation"` wrappers are excluded (children of `role="none"` wrappers bubble up). Generic/anonymous elements (`<div>`, `<span>`) are flattened out. Implemented in the standalone `src/browser/aria.ts` module which computes implicit roles, accessible names (aria-labelledby → aria-label → label association → text content), and ARIA state attributes (checked, expanded, disabled, required, selected, level, value).
- `locator.ariaSnapshot(opts?)` — same accessibility tree snapshot as `page.ariaSnapshot()` but rooted at the matched element. Waits for the element to be present, respecting the `timeout` option. Useful for asserting accessible structure of a specific widget or region.
- `workers` config option — splits spec files across N independent browser workers running in parallel when `testMode` is true. Each worker gets its own browser process, Hammerhead proxy, and HTTP/WebSocket server; they share no mutable state. Test events stream to a single shared `ReporterEmitter` in real time so reporters receive results as they arrive. Workers always run headless; Safari is not supported (it reuses an existing window). File distribution is round-robin across workers; port allocation is automatic (base ports + worker index × 10).  Activate with `--workers <n>` on the CLI or `workers: N` in the config file.

## [0.0.9]

### Added
- `expect.soft(target)` — non-fatal assertion variant; soft assertion failures are collected rather than thrown immediately. All accumulated failures are reported as a single aggregated error after the test body finishes (including `afterEach` hooks). Cleared automatically at the start of each attempt (including retries). Supports negation (`expect.soft(loc).not.toBeVisible()`) and all built-in matchers.
- `route.fetch(opts?)` — fetch the actual upstream response from within a `page.route()` handler without triggering route interception again. Accepts optional overrides (`url`, `method`, `headers`, `postData`) and returns a native `Response`. Enables the intercept-modify-fulfill pattern: `const resp = await route.fetch(); const json = await resp.json(); await route.fulfill({ json: { ...json, injected: true } });`
- `locator.boundingBox(opts?)` — returns `{ x, y, width, height }` of the element's bounding rectangle in the iframe viewport coordinate space, or `null` if the element is not found. Respects `timeout`.
- `locator.blur(opts?)` — dispatches `blur()` on the element; counterpart to `locator.focus()`.
- `expect(locator).toHaveCSS(property, value, opts?)` — asserts that `getComputedStyle(element).getPropertyValue(property)` matches the given value (string exact match or RegExp). Auto-retries until the condition is met or the timeout expires. Supports negation.

### Changed
- Command log messages now use full call-site syntax: `page.goto("url")` instead of `url`, `page.waitForTimeout(500)` instead of `500ms`, `request.fetch("url")` instead of `url`, etc.; applies to all `page.*`, `browser.*`, `request.*`, and `node.*` commands
- `expect()` log messages now show the full assertion expression: `expect(locator).toHaveText("foo")`, `expect(page).not.toHaveURL(/login/)`, etc.; applies to all built-in matchers and custom matchers registered via `expect.extend()`
- `page.route()`, `page.unroute()`, and `page.close()` now use `_withCommand` — they emit pending → pass/fail log entries with elapsed timing, consistent with all other `page.*` commands
- `page.addLocatorHandler()` and `page.removeLocatorHandler()` now use `logCommand` — they emit pass/fail entries with the locator description, consistent with other handler registration calls
- `browser.newPage()`, `browser.newWindow()`, and `browser.switchTab()` now use `_withCommand`/`logCommand` — they emit pending → pass/fail log entries with timing, replacing bare info-level `log()` calls

## [0.0.8]

### Added
- `_resetBrowserState()` exported from `src/browser/browser` — resets all mutable browser state (handlers, listeners, snapshots, log state) between test runs to prevent cross-test pollution
- `src/browser/ws.ts` — dedicated WebSocket client module extracted from `browser.ts`; exports `wsConnect`, `wsOnMessage`, `wsSend`, `wsRequest`
- `src/browser/assertions.ts` — `expect()` and all built-in matchers extracted from `browser.ts` into a focused module
- `src/browser/locator-utils.ts` — pure `textMatches` and `resolveSelector` helpers extracted from `locator.ts`; no browser-global dependencies, safe to import in Node.js tests
- `src/constants.ts` — shared port constants (`DEFAULT_PROXY_PORT_1`, `DEFAULT_PROXY_PORT_2`, `DEFAULT_CONTROL_PANEL_PORT`)
- `src/ws-protocol.ts` — typed WebSocket message protocol; `BrowserMessage` and `ServerMessage` discriminated unions with `Msg<T>` narrow helper replace all untyped `msg: any` casts in `server.ts`
- `.github/workflows/ci.yml` — CI pipeline that runs `typecheck`, `eslint`, and `test:unit` on every push and pull request
- Unit tests for `textMatches` / `resolveSelector` (`test/unit/locator.test.ts`, 13 tests) and `runWithFixtures` (`test/unit/executor.test.ts`, 5 tests); total unit test count: 47

### Fixed
- `runWithFixtures` now guarantees fixture teardown runs even when the test throws — errors from inner fixtures/tests are caught, teardown code after `await use(value)` executes, then the error is re-thrown; matches Playwright's fixture lifecycle guarantee
- `_checkLocatorHandlers` no longer uses a hardcoded 5 000 ms post-handler wait; now reads `window.__CONFIG__?.actionTimeout ?? 5000` so it respects the configured `actionTimeout`
- `_withCommand` and `request.fetch` catch blocks narrowed from `catch (e: any)` to `catch (e: unknown)` with explicit `instanceof Error` checks
- `buildTestQueue` catch block narrowed from `catch (e: any)` to `catch (e: unknown)`

### Changed
- `browser.ts` reduced from ~2 058 to ~1 740 lines by extracting the WebSocket client and `expect` assertions into dedicated modules; public exports are unchanged
- `server.ts` `_handleWsMessage` refactored from an untyped string-keyed dispatch table to a `switch` statement over `BrowserMessage['type']`; each handler now receives a fully-typed, narrowed message instead of casting `msg as { … }`

### Added
- `testInfo` fixture — provides read-only metadata about the currently running test; exposes `title` (leaf test name), `titlePath` (full suite-to-test name array), `retry` (zero-based attempt index), `tags` (test-level tags), `timeout`, `retries`, `actionTimeout`, and `expectTimeout` sourced from the active config; the `TestInfo` interface is exported from `'@qavajs/tx'` for use in type annotations
- `browser.storageState(opts?)` — captures the current cookie jar and `localStorage` items for the active origin; pass `{ path }` to also write the state to a JSON file; returns a `TxStorageState` object that can be passed directly to `browser.loadStorageState()`
- `browser.loadStorageState(state)` — restores cookies and `localStorage` from a `TxStorageState` object or a file path written by `browser.storageState({ path })`; cookies are applied to the proxy session immediately; `localStorage` items are written for the current page's origin; accepts an inline state object to seed specific cookies or storage values without navigating
- `page.mouse` — low-level mouse API for dispatching pointer and mouse events directly; exposes `mouse.move(x, y, opts?)`, `mouse.down(opts?)`, `mouse.up(opts?)`, `mouse.click(x, y, opts?)`, `mouse.dblclick(x, y, opts?)`, and `mouse.wheel(deltaX, deltaY)`; boundary events (`mouseenter`, `mouseleave`, `pointerenter`, `pointerleave`) are emitted correctly as the cursor crosses element boundaries; `steps` option on `move` interpolates the path for smooth drag simulation
- `:passed` / `:failed` filter tokens in the Specs panel filter bar — typing `:passed` or `:failed` narrows the test list to tests that have already run and match that outcome; tokens compose with free-text filters (e.g. `login :failed` shows only failed tests whose name contains "login"); the run button re-runs only the visible (filtered) tests
- Pass/fail/total counters in the Specs panel header — live totals update as tests complete, showing the count of all tests, passed tests (✓), and failed tests (✗)

### Fixed
- `browser.storageState()` now correctly captures cookies set during page navigation — the cookie jar was previously read from the wrong Hammerhead proxy session (the main session rather than the control-panel session that actually handles iframe navigation requests), so the returned `cookieJar` was always empty
- TypeScript configuration files (`.ts` extension) are now supported for `tx.config.ts` — the config loader now includes `.ts` files in its search and loads them via the TypeScript pipeline
- Test file resolution no longer produces duplicate entries when the same path is matched by multiple glob patterns

### Changed
- `src/browser/browser.ts` refactored — `Mouse`, `Keyboard`, and `Locator` implementations extracted into dedicated `src/browser/mouse.ts`, `src/browser/keyboard.ts`, and `src/browser/locator.ts` modules for maintainability
- Watcher now tracks files using paths relative to the watch base directory, fixing edge cases where absolute-path comparisons failed to match on reload

## [0.0.7]

### Added
- `page.snapshot(opts?)` — captures the current page as a self-contained HTML string; all external stylesheets, images, and web fonts are fetched and inlined as data URLs so the file opens correctly without a server; `@import` rules and `url()` references inside CSS are inlined recursively; live form state (checkbox, radio, text inputs, selects, textareas) is synced into the clone before serialisation; pass `{ path }` to also save the file to `<path>.html` relative to the working directory; returns the HTML string in all cases
- `step` fixture — groups commands in the log panel under a named collapsible step; supports both async (`await step('label', async () => { … })`) and sync (`step('label', () => value)`) callbacks; returns the callback's result so values can flow through; the group border reflects child state (red on any failure, green on all pass)
- `log.group(message, cmd?, fn?)` — groups log entries into a collapsible section in the command panel; supports functional form (`await log.group('label', async () => { … })`) and imperative form (`const g = log.group('label'); …; g.end()`); optional `cmd` argument sets the short label shown in the left column (defaults to `'group'`); groups can be nested; the group border reflects child state (red on any failure, green on all pass)

### Changed
- `HtmlReporter` now renders `text/html` attachments in an embedded `<iframe>` (full-width, 400 px tall) with an **↗** button in the attachment header that opens the snapshot in a new browser tab as a Blob URL; the complete HTML body is stored without truncation (the 4 000-character limit previously applied only to text attachments)
- Artifact files are now saved at a path relative to the working directory instead of always inside `test-artifacts/`; parent directories are created automatically if they do not exist
- `page.screenshot({ path })` now saves `<path>.png` relative to the working directory (previously forced into `test-artifacts/`)
- Matcher log messages now include the expected value: `toHaveText`, `toContainText`, `toHaveValue`, `toHaveAttribute`, `toHaveCount`, and `toHaveClass` append the expected value to the locator description in the log entry
- `toBeTruthy`, `toBeFalsy`, `toBeNull`, and `toBeUndefined` now log the actual target value instead of an empty message

## [0.0.6]

### Added
- `browser.newWindow(url?)` — opens a native browser popup window, navigates it to `url` if provided, and makes it the active page; interact with it via the global `page` fixture immediately after the call
- Popup window support: all `page` APIs (`goto`, `reload`, `locator`, `click`, `fill`, `evaluate`, `route`, events, etc.) work identically in popup windows as in iframe-based tabs
- `browser.switchTab()` and `browser.tabs()` now include popup windows alongside iframe-based tabs in the same list
- `page.on('popup')` and `page.waitForEvent('popup')` intercept windows opened by the page via `window.open()` or `target="_blank"` links
- Popup blocking automatically disabled at browser launch (`--disable-popup-blocking`) on Chrome and Firefox so `window.open()` calls are never suppressed
- `expect` is now a top-level named export from `'@qavajs/tx'` — import it directly alongside `test` instead of receiving it as a fixture
- `expect.extend(matchers)` — returns a new scoped `expect` function with the given custom matchers merged in; pure and side-effect-free, the original `expect` is unmodified
- `expect(value).toPass(opts?)` — async polling assertion that retries an arbitrary callback until it stops throwing, with configurable timeout
- `TxExpect<T>` generic interface — custom matcher types propagate through `.extend<M>()` calls so `expect(x).toCustomMatcher()` type-checks without extra declarations
- `TxLocatorMatchers`, `TxPageMatchers`, `TxValueMatchers` — empty ambient interfaces for augmenting built-in assertion types via declaration merging

### Changed
- Matcher log messages now include the expected value: `toHaveText`, `toContainText`, `toHaveValue`, `toHaveAttribute`, `toHaveCount`, and `toHaveClass` append the expected value to the locator description in the log entry
- `toBeTruthy`, `toBeFalsy`, `toBeNull`, and `toBeUndefined` now log the actual target value instead of an empty message
- `expect` removed from `TxBaseFixtures` — it is no longer injected as a test fixture; update destructuring patterns to use the module import instead
- `not` is no longer a separate object with duplicated matcher definitions; the unified `_makeExpect(target, negated, localMatchers)` factory threads a `negated` flag through all matchers, halving the internal implementation size
- Custom matchers registered via `expect.extend` are scoped to the returned function and do not mutate any shared state

## [0.0.5]

### Added
- `TestServer.removeFile(basename)` — evicts a deleted test file from the bundle/parse/test-list caches and broadcasts a new version to all connected WebSocket clients
- File watcher now handles deletions: when a watched file no longer exists after the debounce window, `server.removeFile()` is called so the UI drops it from the test list automatically

### Fixed
- Config file parsing now works correctly on Windows (path normalization no longer drops drive letters or mis-interprets backslash separators)

### Changed
- Test filter input is now reapplied after the test list reloads on a file-change notification, so active filters persist across hot-reload cycles
- All `Locator` query methods (`textContent`, `innerText`, `inputValue`, `getAttribute`, `isVisible`, `isHidden`, `isEnabled`, `isDisabled`, `isChecked`, `isEditable`, `count`) now emit `_withCommand` log entries, consistent with action methods
- `page.resetSession()` now emits a `_withCommand` log entry (pending → pass/fail with timing)
- `page.unroute()` now emits a log entry, consistent with `page.route()`
- `page.removeLocatorHandler()` now emits a log entry, consistent with `page.addLocatorHandler()`
- `browser.newPage()` now emits a log entry
- `browser.switchTab()` now emits a log entry showing the matched tab's title
- `page.title()` now emits a `_withCommand` log entry
- `Locator.waitFor()` and all `expect` / `expect.not` retry callbacks use internal sync helpers (`_checkVisibility`, `_checkEnabled`, `_checkChecked`, `_checkEditable`, `_textContent`, `_inputValue`, `_getAttribute`) to avoid emitting spurious log entries on every retry iteration

## [0.0.4]

### Added
- `browser.tabs()` — returns a `TxTabInfo[]` snapshot of all open tabs (`id`, `title`, `url`, `active`)
- `browser.switchTab(predicate)` — switch the active tab by matching against tab info fields
- `TxTabInfo` interface exported in type declarations

### Changed
- `browser.newPage()` now returns `Promise<void>` instead of `Promise<PopupPage>`; interact with the new tab via the global `page` fixture after calling it
- `page.on('popup')` and `page.waitForEvent('popup')` handlers now receive a `Page` object instead of the removed `PopupPage` type

### Removed
- `PopupPage` interface and internal `_makePopupPage` factory — popup handlers now receive the global `page` object directly
- `browser.pages()` — use `browser.tabs()` to inspect open tabs
- `browser.task()` — use `node.task()` instead
- `page.bringToFront()` — use `browser.switchTab()` to switch the active tab

## [0.0.3] - 2026-05-26

### Added
- `TxDownload.createReadStream()` — returns a Web `ReadableStream<Uint8Array>` of the downloaded file's bytes
- `TxDownload.saveAs(path)` — saves the downloaded file to the given path on the server filesystem via WebSocket
- `page.resetSession()` — clears route handlers, locator handlers, page listeners, and navigates to a blank page; also clears `localStorage`, `sessionStorage`, and cookies for the current origin
- `save-download` WebSocket message handler in `TestServer` for writing base64-encoded file data to disk

### Changed
- Popup page `close()` now emits the `'close'` page event before closing the tab
- Removed unimplemented `'crash'`, `'websocket'`, and `'worker'` event overloads from the `Page` type definitions
- `waitForEvent` signature cleaned up: removed `'crash'`, `'websocket'`, and `'worker'` overloads

## [0.0.2] - 2026-05-25

### Changed
- `esbuild` promoted from `devDependencies` to `dependencies` — it is required at runtime for bundling test files
- `HtmlReporter` moved from `test/reporters/` into `src/reporters/` and is now part of the published package

## [0.0.1] - 2025

### Added
- Initial release of `@qavajs/tx` — a browser testing framework built on the Hammerhead proxy
- TypeScript support with source map integration for accurate error locations
- CLI entry point (`tx`) with `--config` and `--test` flags
- Built-in reporters: console reporter and HTML reporter
- Preprocessor API for transforming test files before execution
- Test sharding support
- WebSocket-based proxy server for request/response interception
- `waitForRequest` / `waitForResponse` fixtures for network assertions
- `screenshot` fixture for capturing page screenshots
- `log` and `attach` fixtures for test output
- `logCommand` fixture for command logging
- `node` fixture with `node.task` method for running Node.js tasks
- `beforeEach` / `afterEach` page event hooks
- Locator API with timeout handling, `fill` (character-by-character), and `:has-text` pseudo-class support
- Fixture system with preprocessor support
- Configuration via `tx.config.js`
