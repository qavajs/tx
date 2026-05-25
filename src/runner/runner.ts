import * as vm from 'vm';
import * as fs from 'fs';
import * as path from 'path';
import * as esbuild from 'esbuild';
import type { Preprocessor } from '../types';

let _preprocessor: Preprocessor | null = null;

export function setPreprocessor(fn: Preprocessor | null | undefined): void {
  _preprocessor = fn ?? null;
}

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
  const noop: any = () => noop;
  const deepNoop: any = new Proxy(noop, { get: (_t, _k) => deepNoop });
  const describe = (name: string, optsOrFn: any, maybeFn?: () => void) => {
    const fn = typeof optsOrFn === 'function' ? optsOrFn : maybeFn!;
    const tags = (optsOrFn && typeof optsOrFn === 'object' && Array.isArray(optsOrFn.tag)) ? optsOrFn.tag as string[] : [];
    stack.push(String(name));
    tagStack.push(tags);
    try { fn(); } catch { /* ignore body errors during parse */ }
    tagStack.pop();
    stack.pop();
  };
  const makeParserTestFn = (push: (name: string, tags?: string[]) => void): any => {
    const fn: any = (name: string, optsOrFn?: any, _maybeFn?: any) => {
      const tags = (optsOrFn && typeof optsOrFn === 'object' && Array.isArray(optsOrFn.tag))
        ? optsOrFn.tag as string[]
        : undefined;
      push(name, tags);
    };
    fn.extend     = (_defs: any) => makeParserTestFn(push);
    fn.describe   = describe;
    fn.beforeEach = noop;
    fn.afterEach  = noop;
    fn.beforeAll  = noop;
    fn.afterAll   = noop;
    return fn;
  };
  const test = makeParserTestFn(pushTest);
  // Module stub returned by require(). __esModule must be falsy so esbuild's
  // __toESM helper sets a .default, otherwise `import foo from 'lib'` produces
  // import_lib.default === undefined and top-level destructuring throws.
  // '@qavajs/tx' exports expose the parser stubs so `import { test, describe } from '@qavajs/tx'` is discovered.
  const txStub: any = new Proxy(
    Object.assign(() => deepNoop, { __esModule: false, default: deepNoop, test, describe, beforeEach: noop, afterEach: noop, beforeAll: noop, afterAll: noop }),
    { get: (t, k) => (k in t ? (t as any)[k] : deepNoop) },
  );
  const moduleStub: any = new Proxy(
    Object.assign(() => deepNoop, { __esModule: false, default: deepNoop }),
    { get: (t, k) => (k in t ? (t as any)[k] : deepNoop) },
  );
  const pageProxy: any = new Proxy({}, { get: () => noop });
  const exportsObj: any = {};
  const sandbox = vm.createContext({
    expect: () => noop,
    tx: deepNoop,
    page: pageProxy,
    require: (id: string) => id === '@qavajs/tx' ? txStub : moduleStub,
    exports: exportsObj,
    module: { exports: exportsObj },
    console: { log: noop, error: noop, warn: noop, info: noop, debug: noop },
    setTimeout: noop, clearTimeout: noop,
    Promise: { resolve: () => ({ then: noop }) },
    __dirname: '/',
    __filename: '/test.ts',
  });
  try { vm.runInContext(code, sandbox); } catch { /* syntax errors */ }
  return tests;
}

export async function bundleTestFile(filePath: string): Promise<string> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const contents = _preprocessor ? _preprocessor(raw, filePath) : raw;
  const result = await esbuild.build({
    stdin: { contents, resolveDir: path.dirname(filePath), sourcefile: filePath, loader: 'ts' },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    write: false,
    logLevel: 'silent',
    external: ['@qavajs/tx'],
    sourcemap: 'inline',
  });
  return result.outputFiles[0].text;
}

export function parseTestFile(filePath: string): ParsedFile {
  const filename = path.basename(filePath);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const source = _preprocessor ? _preprocessor(raw, filePath) : raw;
    const { code } = esbuild.transformSync(source, {
      loader: 'ts',
      target: 'node22',
      format: 'cjs',
      sourcefile: filePath,
    });
    return { filename, tests: parseTestCode(code) };
  } catch (err: any) {
    return { filename, tests: [], error: err.message };
  }
}
