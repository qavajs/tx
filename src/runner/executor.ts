import { type QueueItem, type FixtureDefs, parseFixtureDeps, beginCollecting, endCollecting } from './testRegistrar';
export type { QueueItem, FixtureDefs };

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
  logs: LogEntry[];
  retry?: number;
  snapshots?: SnapshotEntry[];
}

import type { LogEntry, SnapshotEntry } from '../browser/browser';

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
  filePath: string,
  filters: { filterSuite?: string; filterTest?: string; filterTests?: string[] },
): QueueItem[] | { parseError: string } {
  beginCollecting(filters);
  try { delete require.cache[require.resolve(filePath)]; } catch { /* not yet cached */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(filePath);
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { parseError: err.stack || err.message };
  }
  return endCollecting();
}
