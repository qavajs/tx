# Changelog

All notable changes to `@qavajs/tx` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- `log.group(message, cmd?, fn?)` — groups log entries into a collapsible section in the command panel; supports functional form (`await log.group('label', async () => { … })`) and imperative form (`const g = log.group('label'); …; g.end()`); optional `cmd` argument sets the short label shown in the left column (defaults to `'group'`); groups can be nested; the group border reflects child state (red on any failure, green on all pass)

### Changed
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
