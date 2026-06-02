import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchGlob } from '../../src/utils/glob';

describe('matchGlob', () => {
  test('** matches nested paths', () => {
    assert.ok(matchGlob('**/*.spec.ts', 'foo/bar.spec.ts'));
    assert.ok(matchGlob('**/*.spec.ts', 'a/b/c.spec.ts'));
    assert.ok(matchGlob('src/**/*.ts', 'src/runner/test.ts'));
  });

  test('** does not match wrong extension', () => {
    assert.ok(!matchGlob('**/*.spec.ts', 'foo/bar.ts'));
    assert.ok(!matchGlob('**/*.spec.ts', 'foo/bar.spec.js'));
  });

  test('* matches within a single directory segment', () => {
    assert.ok(matchGlob('*.ts', 'foo.ts'));
    assert.ok(!matchGlob('*.ts', 'a/foo.ts'));
  });

  test('exact pattern matches identical string', () => {
    assert.ok(matchGlob('foo.ts', 'foo.ts'));
    assert.ok(!matchGlob('foo.ts', 'bar.ts'));
  });

  test('**/dir matches files directly inside nested dir', () => {
    assert.ok(matchGlob('**/specs/*.ts', 'test/specs/example.ts'));
    assert.ok(!matchGlob('**/specs/*.ts', 'test/specs/nested/example.ts'));
  });

  test('? matches exactly one non-separator character', () => {
    assert.ok(matchGlob('f?o.ts', 'foo.ts'));
    assert.ok(!matchGlob('f?o.ts', 'fo.ts'));
  });

  test('pattern with fixed prefix and ** suffix', () => {
    assert.ok(matchGlob('src/**', 'src/index.ts'));
    assert.ok(matchGlob('src/**', 'src/utils/glob.ts'));
    assert.ok(!matchGlob('src/**', 'lib/index.ts'));
  });
});
