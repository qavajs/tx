export type HookFn = (...args: any[]) => any;
export type HookEntry = { fn: HookFn; fixtureDefs: FixtureDefs };
export type HookScope = { beforeEachs: HookEntry[]; afterEachs: HookEntry[]; beforeAlls: HookFn[]; afterAlls: HookFn[] };

export type QueueItem = {
  name: string; fn: HookFn; tags: string[];
  fixtureDefs: FixtureDefs; expectsFixtures: boolean;
  beforeEachs: HookEntry[]; afterEachs: HookEntry[];
  setupBeforeAlls: HookFn[]; teardownAfterAlls: HookFn[];
};

type UseCallback<T> = (value: T) => Promise<void>;
type FixtureFn<T> = (fixtures: Record<string, any>, use: UseCallback<T>) => Promise<void>;
export type FixtureDefs = Record<string, FixtureFn<any>>;

export function parseFixtureDeps(fn: FixtureFn<any>): string[] {
  if ((fn as any)._deps) return (fn as any)._deps as string[];
  try {
    const m = fn.toString().match(/\(\s*\{\s*([^}]*?)\s*\}/);
    if (!m) return [];
    return m[1].split(',').map(s => s.trim().split(/[\s:=]/)[0].trim()).filter(s => /^[a-zA-Z_$]/.test(s));
  } catch { return []; }
}

export const defaultFixtureDefs: FixtureDefs = {
  page:    async (_f, use) => { await use((window as any).tx.page); },
  browser: async (_f, use) => { await use((window as any).tx.browser); },
  node:    async (_f, use) => { await use((window as any).tx.node); },
  expect:  async (_f, use) => { await use((window as any).tx.expect); },
  request: async (_f, use) => { await use((window as any).tx.request); },
  log:     async (_f, use) => { await use((window as any).tx.log); },
  attach:  async (_f, use) => { await use((window as any).tx.attach); },
  step:    async (_f, use) => {
    await use((title: string, fn: () => any): any => {
      const g = (window as any).tx.log.group(title, 'step');
      let result: any;
      try {
        result = fn();
      } catch (e) {
        g.end();
        throw e;
      }
      if (result instanceof Promise) {
        return result.then(
          (v: any) => { g.end(); return v; },
          (e: any) => { g.end(); throw e; },
        );
      }
      g.end();
      return result;
    });
  },
};

export interface RegistrationCtx {
  queue: QueueItem[];
  stack: string[];
  tagStack: string[][];
  hookStack: HookScope[];
  filterSuite?: string;
  filterTest?: string;
  filterTests?: string[];
}

export function buildTestRegistrar(ctx: RegistrationCtx, fixtureDefs: FixtureDefs = defaultFixtureDefs): any {
  const { queue, stack, tagStack, hookStack } = ctx;

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

  const makeTestFn = (defs: FixtureDefs): any => {
    const testFn: any = (name: string, optsOrFn: HookFn | { tag?: string[] }, maybeFn?: HookFn) => {
      const opts = typeof optsOrFn === 'object' ? optsOrFn : undefined;
      const fn = (typeof optsOrFn === 'function' ? optsOrFn : maybeFn) as HookFn;
      const inheritedTags = ([] as string[]).concat(...tagStack);
      const tags = [...inheritedTags, ...(opts?.tag ?? [])];
      const suite = stack.join(' > ');
      const fullName = stack.length ? suite + ' > ' + name : name;
      if (ctx.filterSuite && suite !== ctx.filterSuite) return;
      if (ctx.filterTest && fullName !== ctx.filterTest) return;
      if (ctx.filterTests && !ctx.filterTests.includes(fullName)) return;
      queue.push({
        name: fullName, fn, tags,
        fixtureDefs: defs, expectsFixtures: fn.length > 0,
        beforeEachs: [],
        afterEachs:  [],
        setupBeforeAlls: [], teardownAfterAlls: [],
      });
    };
    testFn.extend = (newDefs: FixtureDefs) => {
      const merged: FixtureDefs = { ...defs };
      for (const [name, newFn] of Object.entries(newDefs)) {
        const baseFn = defs[name];
        if (baseFn && parseFixtureDeps(newFn).includes(name)) {
          // Playwright-style override: fixture uses its own name to receive base value
          const baseName = '\x00' + name;
          merged[baseName] = baseFn;
          const wrapper = (fixtures: Record<string, any>, use: (v: any) => Promise<void>) =>
            newFn({ ...fixtures, [name]: fixtures[baseName] }, use);
          (wrapper as any)._deps = [...parseFixtureDeps(newFn).filter(d => d !== name), baseName];
          merged[name] = wrapper;
        } else {
          merged[name] = newFn;
        }
      }
      return makeTestFn(merged);
    };
    testFn.describe = describe;
    testFn.beforeEach = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].beforeEachs.push({ fn, fixtureDefs: defs }); };
    testFn.afterEach = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].afterEachs.push({ fn, fixtureDefs: defs }); };
    testFn.beforeAll = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].beforeAlls.push(fn); };
    testFn.afterAll = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].afterAlls.push(fn); };
    return testFn;
  };

  return makeTestFn(fixtureDefs);
}
