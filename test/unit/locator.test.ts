import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { textMatches, resolveSelector } from '../../src/browser/locator-utils';

// ── textMatches ───────────────────────────────────────────────────────────────

describe('textMatches', () => {
  test('returns true when text contains substring', () => {
    const el = { textContent: 'Hello World' } as any ;
    assert.ok(textMatches(el, 'World'));
  });

  test('returns false when text does not contain substring', () => {
    const el = { textContent: 'Hello' } as any ;
    assert.ok(!textMatches(el, 'World'));
  });

  test('matches against RegExp', () => {
    const el = { textContent: 'Hello 123' } as any ;
    assert.ok(textMatches(el, /\d+/));
  });

  test('exact match requires full equality after trim', () => {
    const el = { textContent: 'Hello' } as any ;
    assert.ok(textMatches(el, 'Hello', true));
    assert.ok(!textMatches(el, 'Hell', true));
  });

  test('trims whitespace before comparing', () => {
    const el = { textContent: '  Hello  ' } as any ;
    assert.ok(textMatches(el, 'Hello', true));
  });

  test('returns false for null textContent', () => {
    const el = { textContent: null } as unknown as any ;
    assert.ok(!textMatches(el, 'Hello'));
  });

  test('RegExp matches against trimmed text', () => {
    const el = { textContent: '  42  ' } as any ;
    assert.ok(textMatches(el, /^\d+$/));
  });
});

// ── resolveSelector ───────────────────────────────────────────────────────────

describe('resolveSelector', () => {
  test('returns single selector as array', () => {
    assert.deepEqual(resolveSelector('button'), ['button']);
  });

  test('splits comma-separated selectors', () => {
    assert.deepEqual(resolveSelector('input, button'), ['input', 'button']);
  });

  test('trims whitespace around each part', () => {
    assert.deepEqual(resolveSelector('  span ,  div  '), ['span', 'div']);
  });
});
