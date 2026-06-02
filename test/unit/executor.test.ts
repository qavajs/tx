import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runWithFixtures } from '../../src/runner/executor';
import type { FixtureDefs } from '../../src/runner/executor';

// ── runWithFixtures ───────────────────────────────────────────────────────────

describe('runWithFixtures', () => {
  test('calls test function with a resolved fixture value', async () => {
    const defs: FixtureDefs = {
      value: async (_: Record<string, unknown>, use) => { await use(42); },
    };
    let received: unknown;
    await runWithFixtures(defs, async ({ value }) => { received = value; });
    assert.equal(received, 42);
  });

  test('resolves dependency order correctly', async () => {
    const order: string[] = [];
    const defs: FixtureDefs = {
      a: async (_: Record<string, unknown>, use) => {
        order.push('a:setup');
        await use('a');
        order.push('a:teardown');
      },
      b: async ({ a }: Record<string, unknown>, use) => {
        order.push('b:setup');
        await use('b-' + (a as string));
        order.push('b:teardown');
      },
    };
    // Explicit _deps so parseFixtureDeps doesn't need to parse the stringified fn
    
    (defs.b as any)._deps = ['a'];

    let bVal: unknown;
    await runWithFixtures(defs, async ({ b }) => { bVal = b; });
    assert.equal(bVal, 'b-a');
    assert.deepEqual(order, ['a:setup', 'b:setup', 'b:teardown', 'a:teardown']);
  });

  test('teardown runs even when the test throws', async () => {
    const torn: boolean[] = [];
    const defs: FixtureDefs = {
      fixture: async (_: Record<string, unknown>, use) => {
        await use('val');
        torn.push(true);
      },
    };
    await assert.rejects(
      () => runWithFixtures(defs, async () => { throw new Error('test error'); }),
      /test error/,
    );
    assert.ok(torn[0], 'teardown must run even after test failure');
  });

  test('resolves multiple independent fixtures', async () => {
    const defs: FixtureDefs = {
      x: async (_: Record<string, unknown>, use) => { await use(1); },
      y: async (_: Record<string, unknown>, use) => { await use(2); },
    };
    let result: unknown;
    await runWithFixtures(defs, async ({ x, y }) => { result = (x as number) + (y as number); });
    assert.equal(result, 3);
  });

  test('empty fixture defs runs test function with empty resolved map', async () => {
    let called = false;
    await runWithFixtures({}, async () => { called = true; });
    assert.ok(called);
  });
});
