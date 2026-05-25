import { test } from '@qavajs/tx';
import { theAnswer } from './testData.js';

test.describe('Utilities', () => {
  test.beforeAll(() => {
    console.log('Before all tests');
  });

  test('should return the correct answer to the Ultimate Question of Life, The Universe, and Everything', ({ expect }) => {
    expect(theAnswer).toBe(42);
  });

  test('adds numbers correctly', ({ expect }) => {
    expect(1 + 1).toBe(2);
    expect(10 - 3).toBe(7);
  });

  test('handles string operations', ({ expect }) => {
    const greeting = 'Hello, World!';
    expect(greeting).toContain('World');
    expect(greeting.length).toBeGreaterThan(5);
  });

  test('works with arrays', ({ expect }) => {
    const items = ['apple', 'banana', 'cherry'];
    expect(items).toContain('banana');
    expect(items.length).toBe(3);
  });

  test('task', async ({ browser, expect }) => {
    const file = await browser.task<string>('readFile', { path: './test/serverFile.json' });
    expect(JSON.parse(file)).toEqual({ data: 42 });
  });

  test('log', async ({ log }) => {
    log('this is custom log')
  });

  test('attach', async ({ attach }) => {
    attach('payload', '{ "answer": 42 }', 'application/json');
  });

  test('log command', async ({ log }) => {
    const command = log.open('this is async command', 'step');
    await new Promise(r => setTimeout(() => r(0), 2000));
    command.success();
  });
});
