import * as vm from 'vm';
import * as fs from 'fs';
import * as path from 'path';

export interface ParsedTest { suite: string; name: string; }
export interface ParsedFile { filename: string; relPath?: string; tests: ParsedTest[]; error?: string; }

export function parseTestCode(code: string): ParsedTest[] {
  const tests: ParsedTest[] = [];
  const stack: string[] = [];
  const pushTest = (name: string) => tests.push({ suite: stack.join(' > '), name: String(name) });
  const makeParserTestFn = (push: (name: string) => void): any => {
    const fn: any = (name: string) => push(name);
    fn.extend = (_defs: any) => makeParserTestFn(push);
    return fn;
  };
  const it = makeParserTestFn(pushTest);
  const describe = (name: string, fn: () => void) => {
    stack.push(String(name));
    try { fn(); } catch { /* ignore body errors during parse */ }
    stack.pop();
  };
  const noop: any = () => noop;
  const pageProxy: any = new Proxy({}, { get: () => noop });
  const sandbox = vm.createContext({
    describe, it, test: it,
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
