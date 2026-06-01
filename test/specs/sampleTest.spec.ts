import { test, expect as baseExpect } from '@qavajs/tx';
import { theAnswer } from './testData.js';

const expect = baseExpect.extend({
  toBeEven(value: number) {
    return {
      pass: value % 2 === 0,
      message: `Expected ${value} to be even`,
    };
  },
});

test.describe('Utilities', () => {
  test.beforeAll(() => {
    console.log('Before all tests');
  });

  test('should return the correct answer to the Ultimate Question of Life, The Universe, and Everything', () => {
    expect(theAnswer).toBe(42);
  });

  test('adds numbers correctly', () => {
    expect(1 + 1).toBe(2);
    expect(10 - 3).toBe(7);
  });

  test('handles string operations', () => {
    const greeting = 'Hello, World!';
    expect(greeting).toContain('World');
    expect(greeting.length).toBeGreaterThan(5);
  });

  test('works with arrays', () => {
    const items = ['apple', 'banana', 'cherry'];
    expect(items).toContain('banana');
    expect(items.length).toBe(3);
  });

  test('custom matcher', () => {
    expect(4).toBeEven();
    expect(3).not.toBeEven();
  });

  test('task', async ({ node }) => {
    const file = await node.task<string>('readFile', { path: './test/serverFile.json' });
    expect(JSON.parse(file)).toEqual({ data: 42 });
  });

  test('log', async ({ log }) => {
    log('this is custom log');
  });

  test('attach', async ({ attach }) => {
    attach('payload', '{ "answer": 42 }', 'application/json');
  });

  test('log.group functional API', async ({ log }) => {
    await log.group('setup', async () => {
      log('connect to database', { type: 'success' });
      log('seed test data', { type: 'success' });
    });
    await log.group('assertions', async () => {
      log('record count is 3', { type: 'success' });
      log('status is active', { type: 'success' });
    });
  });

  test('log.group with custom cmd', async ({ log }) => {
    await log.group('user logs in', 'step', async () => {
      log('fill email', { type: 'success' });
      log('fill password', { type: 'success' });
      log('click submit', { type: 'success' });
    });
    await log.group('verify dashboard', 'step', async () => {
      log('header visible', { type: 'success' });
    });
  });

  test('log.group imperative API', async ({ log }) => {
    const g = log.group('preparation', 'setup');
    log('step one', { type: 'success' });
    log('step two', { type: 'success' });
    g.end();
  });

});
