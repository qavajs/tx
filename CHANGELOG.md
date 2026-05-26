# Changelog

All notable changes to `@qavajs/tx` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
