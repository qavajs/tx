import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseFixtureDeps, buildTestRegistrar, type QueueItem } from '../../src/runner/testRegistrar';
import { parseTestCode } from '../../src/runner/runner';

// ── parseFixtureDeps ───────────────────────────────────────────────────────────

describe('parseFixtureDeps', () => {
  test('extracts a single fixture name from destructuring', () => {
    const fn = async ({ page }: Record<string, unknown>, use: (v: unknown) => Promise<void>) => { await use(page); };
    assert.deepEqual(parseFixtureDeps(fn), ['page']);
  });

  test('extracts multiple fixture names', () => {
    const fn = async ({ page, browser, expect }: Record<string, unknown>, use: (v: unknown) => Promise<void>) => { await use(page); void browser; void expect; };
    assert.deepEqual(parseFixtureDeps(fn), ['page', 'browser', 'expect']);
  });

  test('returns empty array when there is no destructuring', () => {
    const fn = async (fixtures: Record<string, unknown>, use: (v: unknown) => Promise<void>) => { await use(fixtures); };
    assert.deepEqual(parseFixtureDeps(fn), []);
  });

  test('returns cached _deps when present', () => {
    const fn = async (_: Record<string, unknown>, use: (v: unknown) => Promise<void>) => { await use(null); };
    
    (fn as any)._deps = ['cached'];
    assert.deepEqual(parseFixtureDeps(fn), ['cached']);
  });
});

// ── parseTestCode ──────────────────────────────────────────────────────────────

describe('parseTestCode', () => {
  test('parses a top-level test', () => {
    const code = `
      var _tx = require('@qavajs/tx');
      _tx.test('my test', async function() {});
    `;
    const tests = parseTestCode(code);
    assert.equal(tests.length, 1);
    assert.equal(tests[0].name, 'my test');
    assert.equal(tests[0].suite, '');
  });

  test('parses a test inside a describe block', () => {
    const code = `
      var _tx = require('@qavajs/tx');
      _tx.test.describe('suite', function() {
        _tx.test('inner test', async function() {});
      });
    `;
    const tests = parseTestCode(code);
    assert.equal(tests.length, 1);
    assert.equal(tests[0].name, 'inner test');
    assert.equal(tests[0].suite, 'suite');
  });

  test('parses nested describe blocks', () => {
    const code = `
      var _tx = require('@qavajs/tx');
      _tx.test.describe('outer', function() {
        _tx.test.describe('inner', function() {
          _tx.test('deep test', async function() {});
        });
      });
    `;
    const tests = parseTestCode(code);
    assert.equal(tests.length, 1);
    assert.equal(tests[0].suite, 'outer > inner');
  });

  test('parses tag options on a test', () => {
    const code = `
      var _tx = require('@qavajs/tx');
      _tx.test('tagged', { tag: ['@smoke'] }, async function() {});
    `;
    const tests = parseTestCode(code);
    assert.equal(tests.length, 1);
    assert.deepEqual(tests[0].tags, ['@smoke']);
  });

  test('parses multiple tests', () => {
    const code = `
      var _tx = require('@qavajs/tx');
      _tx.test('test 1', async function() {});
      _tx.test('test 2', async function() {});
    `;
    const tests = parseTestCode(code);
    assert.equal(tests.length, 2);
    assert.equal(tests[0].name, 'test 1');
    assert.equal(tests[1].name, 'test 2');
  });

  test('catches errors thrown inside describe body so parsing does not throw', () => {
    // An error mid-body aborts remaining registrations in that block, but the
    // overall parse call must not throw — tests registered before the error are kept.
    const code = `
      var _tx = require('@qavajs/tx');
      _tx.test.describe('suite', function() {
        _tx.test('registered first', async function() {});
        undeclaredVariable.access();
        _tx.test('never reached', async function() {});
      });
    `;
    assert.doesNotThrow(() => {
      const tests = parseTestCode(code);
      assert.equal(tests[0].name, 'registered first');
    });
  });

  test('returns empty array for code with no tests', () => {
    const tests = parseTestCode('var x = 1;');
    assert.equal(tests.length, 0);
  });

  test('handles syntax errors gracefully without throwing', () => {
    assert.doesNotThrow(() => parseTestCode('this is not valid ==='));
  });
});

// ── buildTestRegistrar ─────────────────────────────────────────────────────────

describe('buildTestRegistrar', () => {
  function makeCtx(extra?: Partial<{ filterTest: string }>) {
    const queue: QueueItem[] = [];
    const ctx = { queue, stack: [], tagStack: [], hookStack: [{ beforeEachs: [], afterEachs: [], beforeAlls: [], afterAlls: [] }], ...extra };
    return { ctx, queue };
  }

  test('registers tests into the queue', () => {
    const { ctx, queue } = makeCtx();
    const test = buildTestRegistrar(ctx, {});
    test('my test', async () => {});
    assert.equal(queue.length, 1);
    assert.equal(queue[0].name, 'my test');
  });

  test('nests test names under describe', () => {
    const { ctx, queue } = makeCtx();
    const test = buildTestRegistrar(ctx, {});
    test.describe('suite', () => {
      test('child', async () => {});
    });
    assert.equal(queue[0].name, 'suite > child');
  });

  test('beforeEach hooks are propagated to tests in scope', () => {
    const { ctx, queue } = makeCtx();
    const test = buildTestRegistrar(ctx, {});
    const hook = async () => {};
    test.describe('suite', () => {
      test.beforeEach(hook);
      test('t', async () => {});
    });
    assert.equal(queue[0].beforeEachs.length, 1);
  });

  test('filterTest skips tests that do not match', () => {
    const { ctx, queue } = makeCtx({ filterTest: 'only this' });
    const test = buildTestRegistrar(ctx, {});
    test('only this', async () => {});
    test('skip this', async () => {});
    assert.equal(queue.length, 1);
  });
});
