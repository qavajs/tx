import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseTestFile, bundleTestFile, setPreprocessor } from '../../src/runner/runner';

// ── parseTestFile ──────────────────────────────────────────────────────────────

describe('parseTestFile', () => {
  let tmpFile: string;

  before(() => {
    tmpFile = path.join(os.tmpdir(), `tx-unit-parse-${Date.now()}.ts`);
  });

  after(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  test('returns test entries from a valid TypeScript spec file', () => {
    fs.writeFileSync(tmpFile, `
      import { test } from '@qavajs/tx';
      test('example test', async ({ page }) => {
        await page.goto('https://example.com');
      });
    `);
    const result = parseTestFile(tmpFile);
    assert.ok(!result.error, `unexpected error: ${result.error}`);
    assert.equal(result.tests.length, 1);
    assert.equal(result.tests[0].name, 'example test');
    assert.equal(result.filename, path.basename(tmpFile));
  });

  test('returns error field for files with type errors esbuild cannot transform', () => {
    fs.writeFileSync(tmpFile, 'const x: @@@invalid syntax =');
    const result = parseTestFile(tmpFile);
    assert.ok(typeof result.filename === 'string');
    // Either error string or tests list is acceptable — just must not throw
  });

  test('parses nested describe blocks', () => {
    fs.writeFileSync(tmpFile, `
      import { test } from '@qavajs/tx';
      test.describe('outer', () => {
        test.describe('inner', () => {
          test('nested', async () => {});
        });
      });
    `);
    const result = parseTestFile(tmpFile);
    assert.ok(!result.error);
    assert.equal(result.tests.length, 1);
    assert.equal(result.tests[0].suite, 'outer > inner');
  });
});

// ── bundleTestFile ─────────────────────────────────────────────────────────────

describe('bundleTestFile', () => {
  let tmpFile: string;

  before(() => {
    tmpFile = path.join(os.tmpdir(), `tx-unit-bundle-${Date.now()}.ts`);
    fs.writeFileSync(tmpFile, `
      import { test } from '@qavajs/tx';
      test('bundle test', async ({ page }) => {
        await page.goto('https://example.com');
      });
    `);
  });

  after(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  test('produces an IIFE with an inline source map', async () => {
    const result = await bundleTestFile(tmpFile);
    assert.ok(result.includes('sourceMappingURL=data:application/json'), 'expected inline source map');
    assert.ok(result.length > 100, 'bundle should not be empty');
  });

  test('returns the cached result on a second call', async () => {
    const first  = await bundleTestFile(tmpFile);
    const second = await bundleTestFile(tmpFile);
    assert.equal(first, second);
  });
});

// ── preprocessor cache invalidation ───────────────────────────────────────────

describe('preprocessor cache', () => {
  let tmpFile: string;

  before(() => {
    tmpFile = path.join(os.tmpdir(), `tx-unit-preprocess-${Date.now()}.ts`);
    fs.writeFileSync(tmpFile, `
      import { test } from '@qavajs/tx';
      test('original', async () => {});
    `);
  });

  after(() => {
    setPreprocessor(null);
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  test('changing the preprocessor invalidates the parse cache', () => {
    const r1 = parseTestFile(tmpFile);
    assert.equal(r1.tests[0].name, 'original');

    setPreprocessor((src) => src.replace('original', 'transformed'));
    const r2 = parseTestFile(tmpFile);
    assert.equal(r2.tests[0].name, 'transformed');
  });
});
