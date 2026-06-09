/**
 * Single redirect target for `require('@qavajs/tx')`.
 * Exports the full public API: browser helpers + test registrar.
 */
export { page, browser, request, node, expect, log, attach } from './browser/browser';
export { test, describe, beforeEach, afterEach, beforeAll, afterAll } from './runner/testRegistrar';
