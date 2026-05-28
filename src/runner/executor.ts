import { type HookScope, type QueueItem, type FixtureDefs, parseFixtureDeps, defaultFixtureDefs, buildTestRegistrar } from './testRegistrer';
export type { QueueItem, FixtureDefs };

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
  logs: LogEntry[];
}

import type { LogEntry } from '../browser/browser';

export async function runWithFixtures(
  fixtureDefs: FixtureDefs,
  testFn: (fixtures: Record<string, any>) => any,
): Promise<void> {
  const resolved: Record<string, any> = {};
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (name: string): void => {
    if (done.has(name) || visiting.has(name)) return;
    visiting.add(name);
    for (const dep of parseFixtureDeps(fixtureDefs[name])) {
      if (dep !== name && fixtureDefs[dep]) visit(dep);
    }
    visiting.delete(name);
    done.add(name);
    ordered.push(name);
  };
  for (const name of Object.keys(fixtureDefs)) visit(name);
  const run = ordered.reduceRight(
    (inner: () => Promise<void>, name) => async () => {
      await fixtureDefs[name](resolved, async (value) => {
        resolved[name] = value;
        await inner();
      });
    },
    async () => { await testFn(resolved); },
  );
  await run();
}

export function buildTestQueue(
  code: string,
  filters: { filterSuite?: string; filterTest?: string; filterTests?: string[] }
): QueueItem[] | { parseError: string } {
  const queue: QueueItem[] = [];
  const stack: string[] = [];
  const tagStack: string[][] = [];
  const hookStack: HookScope[] = [];

  const baseTest = buildTestRegistrar({ queue, stack, tagStack, hookStack, ...filters }, defaultFixtureDefs);

  const _txModule = { ...(window as any).tx, test: baseTest, describe: baseTest.describe, beforeEach: baseTest.beforeEach, afterEach: baseTest.afterEach, beforeAll: baseTest.beforeAll, afterAll: baseTest.afterAll };
  (window as any).require = (id: string) => {
    if (id === '@qavajs/tx') return _txModule;
    throw new Error(`Cannot require '${id}' in test context`);
  };

  try {
    // @ts-ignore
    new window['%hammerhead%'].nativeMethods.Function(code)();
  } catch (e: any) {
    return { parseError: e.stack || e.message };
  }
  return queue;
}
