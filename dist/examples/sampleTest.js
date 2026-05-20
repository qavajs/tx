/**
 * Sample test file — compatible with both the browser runner (cy = window.testApi)
 * and the server-side runner (cy is a no-op stub, useful for pure-logic tests).
 *
 * Upload this file via the "Test Runner" panel in the Control Panel, then click
 * "Run in Browser" or "Run on Server".
 */

describe('Math utilities', () => {
  it('adds numbers correctly', () => {
    expect(1 + 1).toBe(2);
    expect(10 - 3).toBe(7);
  });

  it('handles string operations', () => {
    const greeting = 'Hello, World!';
    expect(greeting).toContain('World');
    expect(greeting.length).toBeGreaterThan(5);
  });

  it('works with arrays', () => {
    const items = ['apple', 'banana', 'cherry'];
    expect(items).toContain('banana');
    expect(items.length).toBe(3);
  });
});

describe('Browser smoke tests', () => {
  test('page URL is a non-empty string', () => {
    const url = cy.url ? cy.url() : '';
    expect(typeof url).toBe('string');
  });

  test('page title is accessible', () => {
    const title = cy.title ? cy.title() : '';
    expect(typeof title).toBe('string');
  });
});
