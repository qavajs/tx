import type { LogEntry } from './browser';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
  logs: LogEntry[];
}

type HookFn = (...args: any[]) => any;
type HookEntry = { fn: HookFn; expectsFixtures: boolean };
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

export async function runWithFixtures(
  fixtureDefs: FixtureDefs,
  testFn: (fixtures: Record<string, any>) => any,
): Promise<void> {
  const resolved: Record<string, any> = {};
  const run = Object.entries(fixtureDefs).reduceRight(
    (inner: () => Promise<void>, [name, fixtureFn]) => async () => {
      await fixtureFn(resolved, async (value) => {
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

  const beforeEach = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].beforeEachs.push({ fn, expectsFixtures: fn.length > 0 }); };
  const afterEach = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].afterEachs.push({ fn, expectsFixtures: fn.length > 0 }); };
  const beforeAll = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].beforeAlls.push(fn); };
  const afterAll = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].afterAlls.push(fn); };

  const defaultFixtureDefs: FixtureDefs = {
    page:       async (_f, use) => { await use((window as any).page); },
    browser:    async (_f, use) => { await use((window as any).browser); },
    node:       async (_f, use) => { await use((window as any).node); },
    expect:     async (_f, use) => { await use((window as any).expect); },
    request:    async (_f, use) => { await use((window as any).request); },
    log:        async (_f, use) => { await use((window as any).log); },
    attach:     async (_f, use) => { await use((window as any).attach); },
    logCommand: async (_f, use) => { await use((window as any).logCommand); },
  };

  const makeTestFn = (fixtureDefs: FixtureDefs): any => {
    const testFn = (name: string, optsOrFn: HookFn | { tag?: string[] }, maybeFn?: HookFn) => {
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
        beforeEachs: hookStack.flatMap(s => s.beforeEachs),
        afterEachs:  hookStack.flatMap(s => s.afterEachs).reverse(),
        setupBeforeAlls: [], teardownAfterAlls: [],
      });
    };
    testFn.extend = (newDefs: FixtureDefs) => makeTestFn({ ...fixtureDefs, ...newDefs });
    return testFn;
  };

  const baseTest = makeTestFn(defaultFixtureDefs);

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
      }
      stack.pop();
      tagStack.pop();
      hookStack.pop();
    }
  };

  (window as any).describe = describe;
  (window as any).test = baseTest;
  (window as any).beforeEach = beforeEach;
  (window as any).afterEach = afterEach;
  (window as any).beforeAll = beforeAll;
  (window as any).afterAll = afterAll;

  try {
    new Function(code)();
  } catch (e: any) {
    return { parseError: e.stack || e.message };
  }
  return queue;
}
