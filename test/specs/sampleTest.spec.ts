import { theAnswer } from './testData.js';

describe('Math utilities', () => {
  it('should return the correct answer to the Ultimate Question of Life, The Universe, and Everything', () => {
    expect(theAnswer).toBe(42);
  });
  
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
