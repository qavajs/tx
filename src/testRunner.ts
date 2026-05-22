import * as vm from 'vm';
import * as fs from 'fs';
import * as path from 'path';

export interface ParsedTest { suite: string; name: string; tags?: string[]; }
export interface ParsedFile { filename: string; relPath?: string; tests: ParsedTest[]; error?: string; }

export function parseTestCode(code: string): ParsedTest[] {
  const tests: ParsedTest[] = [];
  const stack: string[] = [];
  const tagStack: string[][] = [];
  const pushTest = (name: string, tags?: string[]) => {
    const inheritedTags = ([] as string[]).concat(...tagStack);
    const mergedTags = tags ? [...inheritedTags, ...tags] : (inheritedTags.length ? inheritedTags : undefined);
    tests.push({ suite: stack.join(' > '), name: String(name), tags: mergedTags });
  };
  const makeParserTestFn = (push: (name: string, tags?: string[]) => void): any => {
    const fn: any = (name: string, optsOrFn?: any, _maybeFn?: any) => {
      const tags = (optsOrFn && typeof optsOrFn === 'object' && Array.isArray(optsOrFn.tag))
        ? optsOrFn.tag as string[]
        : undefined;
      push(name, tags);
    };
    fn.extend = (_defs: any) => makeParserTestFn(push);
    return fn;
  };
  const test = makeParserTestFn(pushTest);
  const describe = (name: string, optsOrFn: any, maybeFn?: () => void) => {
    const fn = typeof optsOrFn === 'function' ? optsOrFn : maybeFn!;
    const tags = (optsOrFn && typeof optsOrFn === 'object' && Array.isArray(optsOrFn.tag)) ? optsOrFn.tag as string[] : [];
    stack.push(String(name));
    tagStack.push(tags);
    try { fn(); } catch { /* ignore body errors during parse */ }
    tagStack.pop();
    stack.pop();
  };
  const noop: any = () => noop;
  const pageProxy: any = new Proxy({}, { get: () => noop });
  const sandbox = vm.createContext({
    describe, test,
    beforeEach: noop, afterEach: noop, beforeAll: noop, afterAll: noop,
    expect: () => noop,
    tx: new Proxy({}, { get: () => noop }),
    page: pageProxy,
    require: () => ({ page: pageProxy, expect: () => noop }),
    console: { log: noop, error: noop, warn: noop },
    setTimeout: noop, clearTimeout: noop,
    Promise: { resolve: () => ({ then: noop }) },
  });
  try { vm.runInContext(code, sandbox); } catch { /* syntax errors */ }
  return tests;
}

export function parseTestFile(filePath: string): ParsedFile {
  const filename = path.basename(filePath);
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    return { filename, tests: parseTestCode(code) };
  } catch (err: any) {
    return { filename, tests: [], error: err.message };
  }
}
