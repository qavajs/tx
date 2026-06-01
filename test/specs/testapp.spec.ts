import { test, expect, type TestInfo } from '@qavajs/tx';

test.describe('testInfo fixture', () => {
  test('title is the leaf test name', async ({ testInfo }) => {
    expect(testInfo.title).toBe('title is the leaf test name');
  });

  test('titlePath contains suite and test name', async ({ testInfo }) => {
    expect(testInfo.titlePath).toEqual(['testInfo fixture', 'titlePath contains suite and test name']);
  });

  test('retry is 0 on the first attempt', async ({ testInfo }) => {
    expect(testInfo.retry).toBe(0);
  });

  test('tags is empty when no tags are set', async ({ testInfo }) => {
    expect(testInfo.tags).toEqual([]);
  });

  test('tags reflect test-level tags', { tag: ['@smoke'] }, async ({ testInfo }) => {
    expect(testInfo.tags).toContain('@smoke');
  });
});
