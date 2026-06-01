import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { textMatches, resolveSelector } from '../../src/browser/locator-utils';

// ── textMatches ───────────────────────────────────────────────────────────────

describe('textMatches', () => {
  test('returns true when text contains substring', () => {
    const el = { textContent: 'Hello World' } as Element;
    assert.ok(textMatches(el, 'World'));
  });

  test('returns false when text does not contain substring', () => {
    const el = { textContent: 'Hello' } as Element;
    assert.ok(!textMatches(el, 'World'));
  });

  test('matches against RegExp', () => {
    const el = { textContent: 'Hello 123' } as Element;
    assert.ok(textMatches(el, /\d+/));
  });

  test('exact match requires full equality after trim', () => {
    const el = { textContent: 'Hello' } as Element;
    assert.ok(textMatches(el, 'Hello', true));
    assert.ok(!textMatches(el, 'Hell', true));
  });

  test('trims whitespace before comparing', () => {
    const el = { textContent: '  Hello  ' } as Element;
    assert.ok(textMatches(el, 'Hello', true));
  });

  test('returns false for null textContent', () => {
    const el = { textContent: null } as unknown as Element;
    assert.ok(!textMatches(el, 'Hello'));
  });

  test('RegExp matches against trimmed text', () => {
    const el = { textContent: '  42  ' } as Element;
    assert.ok(textMatches(el, /^\d+$/));
  });
});

// ── resolveSelector ───────────────────────────────────────────────────────────

describe('resolveSelector', () => {
  test('returns plain selector with null hasText', () => {
    const result = resolveSelector('button');
    assert.deepEqual(result, [{ base: 'button', hasText: null }]);
  });

  test('extracts double-quoted :has-text() filter', () => {
    const result = resolveSelector('button:has-text("Submit")');
    assert.deepEqual(result, [{ base: 'button', hasText: 'Submit' }]);
  });

  test('extracts single-quoted :has-text() filter', () => {
    const result = resolveSelector("div:has-text('click me')");
    assert.deepEqual(result, [{ base: 'div', hasText: 'click me' }]);
  });

  test('uses * as base when only :has-text() is present', () => {
    const result = resolveSelector(':has-text("Submit")');
    assert.deepEqual(result, [{ base: '*', hasText: 'Submit' }]);
  });

  test('splits comma-separated selectors', () => {
    const result = resolveSelector('input, button');
    assert.deepEqual(result, [
      { base: 'input', hasText: null },
      { base: 'button', hasText: null },
    ]);
  });

  test('handles mixed selectors with and without has-text', () => {
    const result = resolveSelector('span:has-text("ok"), div');
    assert.deepEqual(result, [
      { base: 'span', hasText: 'ok' },
      { base: 'div', hasText: null },
    ]);
  });
});
