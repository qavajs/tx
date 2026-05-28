import type { LogEntry } from '../browser/browser';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
  logs: LogEntry[];
}

type HookFn = (...args: any[]) => any;
type HookEntry = { fn: HookFn; fixtureDefs: FixtureDefs };
type HookScope = { beforeEachs: HookEntry[]; afterEachs: HookEntry[]; beforeAlls: HookFn[]; afterAlls: HookFn[] };

export type QueueItem = {
  name: string; fn: HookFn; tags: string[];
  fixtureDefs: FixtureDefs; expectsFixtures: boolean;
  beforeEachs: HookEntry[]; afterEachs: HookEntry[];
  setupBeforeAlls: HookFn[]; teardownAfterAlls: HookFn[];
};

type UseCallback<T> = (value: T) => Promise<void>;
type FixtureFn<T> = (fixtures: Record<string, any>, use: UseCallback<T>) => Promise<void>;
export type FixtureDefs = Record<string, FixtureFn<any>>;

function _parseFixtureDeps(fn: FixtureFn<any>): string[] {
  if ((fn as any)._deps) return (fn as any)._deps as string[];
  try {
    const m = fn.toString().match(/\(\s*\{\s*([^}]*?)\s*\}/);
    if (!m) return [];
    return m[1].split(',').map(s => s.trim().split(/[\s:=]/)[0].trim()).filter(s => /^[a-zA-Z_$]/.test(s));
  } catch { return []; }
}

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
    for (const dep of _parseFixtureDeps(fixtureDefs[name])) {
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
  const { filterSuite, filterTest, filterTests } = filters;
  const queue: QueueItem[] = [];
  const stack: string[] = [];
  const tagStack: string[][] = [];
  const hookStack: HookScope[] = [];

  const defaultFixtureDefs: FixtureDefs = {
    page:       async (_f, use) => { await use((window as any).tx.page); },
    browser:    async (_f, use) => { await use((window as any).tx.browser); },
    node:       async (_f, use) => { await use((window as any).tx.node); },
    expect:     async (_f, use) => { await use((window as any).tx.expect); },
    request:    async (_f, use) => { await use((window as any).tx.request); },
    log:        async (_f, use) => { await use((window as any).tx.log); },
    attach:     async (_f, use) => { await use((window as any).tx.attach); },
  };

  const describe = (name: string, optsOrFn: (() => void) | { tag?: string[] }, maybeFn?: () => void) => {
    const fn = typeof optsOrFn === 'function' ? optsOrFn : maybeFn!;
    const tags = (optsOrFn && typeof optsOrFn === 'object' && Array.isArray(optsOrFn.tag)) ? optsOrFn.tag as string[] : [];
    stack.push(name);
    tagStack.push(tags);
    hookStack.push({ beforeEachs: [], afterEachs: [], beforeAlls: [], afterAlls: [] });
    const lenBefore = queue.length;
    try { fn(); } finally {
      const scope = hookStack[hookStack.length - 1];
      const scopeTests = queue.slice(lenBefore);
      if (scopeTests.length > 0) {
        if (scope.beforeAlls.length) scopeTests[0].setupBeforeAlls = [...scope.beforeAlls, ...scopeTests[0].setupBeforeAlls];
        if (scope.afterAlls.length) scopeTests[scopeTests.length - 1].teardownAfterAlls = [...scopeTests[scopeTests.length - 1].teardownAfterAlls, ...scope.afterAlls];
        if (scope.beforeEachs.length) for (const t of scopeTests) t.beforeEachs = [...scope.beforeEachs, ...t.beforeEachs];
        if (scope.afterEachs.length) for (const t of scopeTests) t.afterEachs = [...t.afterEachs, ...[...scope.afterEachs].reverse()];
      }
      stack.pop();
      tagStack.pop();
      hookStack.pop();
    }
  };

  const makeTestFn = (fixtureDefs: FixtureDefs): any => {
    const testFn: any = (name: string, optsOrFn: HookFn | { tag?: string[] }, maybeFn?: HookFn) => {
      const opts = typeof optsOrFn === 'object' ? optsOrFn : undefined;
      const fn = (typeof optsOrFn === 'function' ? optsOrFn : maybeFn) as HookFn;
      const inheritedTags = ([] as string[]).concat(...tagStack);
      const tags = [...inheritedTags, ...(opts?.tag ?? [])];
      const suite = stack.join(' > ');
      const fullName = stack.length ? suite + ' > ' + name : name;
      if (filterSuite && suite !== filterSuite) return;
      if (filterTest && fullName !== filterTest) return;
      if (filterTests && !filterTests.includes(fullName)) return;
      queue.push({
        name: fullName, fn, tags,
        fixtureDefs, expectsFixtures: fn.length > 0,
        beforeEachs: [],
        afterEachs:  [],
        setupBeforeAlls: [], teardownAfterAlls: [],
      });
    };
    testFn.extend = (newDefs: FixtureDefs) => {
      const merged: FixtureDefs = { ...fixtureDefs };
      for (const [name, newFn] of Object.entries(newDefs)) {
        const baseFn = fixtureDefs[name];
        if (baseFn && _parseFixtureDeps(newFn).includes(name)) {
          // Playwright-style override: fixture uses its own name to receive base value
          const baseName = '\x00' + name;
          merged[baseName] = baseFn;
          const wrapper = (fixtures: Record<string, any>, use: (v: any) => Promise<void>) =>
            newFn({ ...fixtures, [name]: fixtures[baseName] }, use);
          (wrapper as any)._deps = [..._parseFixtureDeps(newFn).filter(d => d !== name), baseName];
          merged[name] = wrapper;
        } else {
          merged[name] = newFn;
        }
      }
      return makeTestFn(merged);
    };
    testFn.describe = describe;
    testFn.beforeEach = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].beforeEachs.push({ fn, fixtureDefs }); };
    testFn.afterEach = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].afterEachs.push({ fn, fixtureDefs }); };
    testFn.beforeAll = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].beforeAlls.push(fn); };
    testFn.afterAll = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].afterAlls.push(fn); };
    return testFn;
  };

  const baseTest = makeTestFn(defaultFixtureDefs);

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
