import * as vm from 'vm';
import { type HookScope, type QueueItem, type FixtureDefs, parseFixtureDeps, defaultFixtureDefs, buildTestRegistrar } from './testRegistrar';
export type { QueueItem, FixtureDefs };

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
  logs: LogEntry[];
  retry?: number;
}

import type { LogEntry } from '../browser/browser';

export async function runWithFixtures(
  fixtureDefs: FixtureDefs,

  testFn: (fixtures: Record<string, any>) => unknown,
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
      let innerErr: unknown;
      let innerFailed = false;
      await fixtureDefs[name](resolved, async (value) => {
        resolved[name] = value;
        try {
          await inner();
        } catch (e: unknown) {
          innerErr = e;
          innerFailed = true;
        }
      });
      if (innerFailed) throw innerErr;
    },
    async () => { await testFn(resolved); },
  );
  await run();
}

export function buildTestQueue(
  code: string,
  filters: { filterSuite?: string; filterTest?: string; filterTests?: string[] },
  vmContext: Record<string, unknown>
): QueueItem[] | { parseError: string } {
  const queue: QueueItem[] = [];
  const stack: string[] = [];
  const tagStack: string[][] = [];
  const hookStack: HookScope[] = [];

  const baseTest = buildTestRegistrar({ queue, stack, tagStack, hookStack, ...filters }, defaultFixtureDefs);

  // Inject test registrar globals into the vm context
  vmContext.describe = baseTest.describe;
  vmContext.it = baseTest;
  vmContext.test = baseTest;
  vmContext.beforeEach = baseTest.beforeEach;
  vmContext.afterEach = baseTest.afterEach;
  vmContext.beforeAll = baseTest.beforeAll;
  vmContext.afterAll = baseTest.afterAll;

  // Set up require('@qavajs/tx') to return the full test API
  const _txModule = { ...vmContext.tx as object, test: baseTest, describe: baseTest.describe, beforeEach: baseTest.beforeEach, afterEach: baseTest.afterEach, beforeAll: baseTest.beforeAll, afterAll: baseTest.afterAll };
  vmContext.require = (id: string) => {
    if (id === '@qavajs/tx') return _txModule;
    throw new Error(`Cannot require '${id}' in test context`);
  };

  try {
    vm.runInNewContext(code, vm.createContext(vmContext));
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { parseError: err.stack || err.message };
  }
  return queue;
}
