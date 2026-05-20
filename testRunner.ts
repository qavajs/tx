/**
 * Minimal test runner — executes JS test code in a Node.js vm sandbox.
 * Supports describe/it/test/expect, async tests, and loading files from disk.
 */

import * as vm from 'vm';
import * as fs from 'fs';
import * as path from 'path';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export interface RunResults {
  passed: number;
  failed: number;
  total: number;
  duration: number;
  tests: TestResult[];
}

function createExpect(actual: any) {
  const assert = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };
  const fmt = (v: any) => JSON.stringify(v);

  const matchers = {
    toBe:        (e: any)  => assert(actual === e,  `Expected ${fmt(e)}, got ${fmt(actual)}`),
    toEqual:     (e: any)  => assert(JSON.stringify(actual) === JSON.stringify(e), `Expected ${fmt(e)}, got ${fmt(actual)}`),
    toContain:   (e: any)  => Array.isArray(actual)
                               ? assert(actual.includes(e), `Array does not contain ${fmt(e)}`)
                               : assert(String(actual).includes(String(e)), `"${actual}" does not contain "${e}"`),
    toBeTruthy:  ()        => assert(!!actual, `Expected truthy, got ${fmt(actual)}`),
    toBeFalsy:   ()        => assert(!actual, `Expected falsy, got ${fmt(actual)}`),
    toBeNull:    ()        => assert(actual === null, `Expected null, got ${fmt(actual)}`),
    toBeUndefined: ()      => assert(actual === undefined, `Expected undefined, got ${fmt(actual)}`),
    toBeGreaterThan: (n: number) => assert(actual > n, `Expected ${fmt(actual)} > ${n}`),
    toBeLessThan:    (n: number) => assert(actual < n, `Expected ${fmt(actual)} < ${n}`),
    toMatch:     (r: RegExp | string) => {
      const re = typeof r === 'string' ? new RegExp(r) : r;
      assert(re.test(String(actual)), `"${actual}" does not match ${re}`);
    },
    not: {} as any,
  };

  matchers.not = {
    toBe:        (e: any) => assert(actual !== e,  `Expected not ${fmt(e)}`),
    toEqual:     (e: any) => assert(JSON.stringify(actual) !== JSON.stringify(e), `Expected values not to be equal`),
    toBeTruthy:  ()       => assert(!actual, `Expected falsy, got ${fmt(actual)}`),
    toBeFalsy:   ()       => assert(!!actual, `Expected truthy, got ${fmt(actual)}`),
    toBeNull:    ()       => assert(actual !== null, `Expected not null`),
    toContain:   (e: any) => Array.isArray(actual)
                              ? assert(!actual.includes(e), `Array should not contain ${fmt(e)}`)
                              : assert(!String(actual).includes(String(e)), `"${actual}" should not contain "${e}"`),
  };

  return matchers;
}

// ── Test file parsing ────────────────────────────────────────────────────────

export interface ParsedTest {
  suite: string;
  name: string;
}

export interface ParsedFile {
  filename: string;
  tests: ParsedTest[];
  error?: string;
}

/** Collect describe/it names from code without executing test bodies. */
export function parseTestCode(code: string): ParsedTest[] {
  const tests: ParsedTest[] = [];
  const suiteStack: string[] = [];

  const it = (name: string) => {
    tests.push({ suite: suiteStack.join(' > '), name: String(name) });
  };
  const describe = (name: string, fn: () => void) => {
    suiteStack.push(String(name));
    try { fn(); } catch { /* ignore test body errors during parse */ }
    suiteStack.pop();
  };

  const noop = () => ({});
  const sandbox = vm.createContext({
    describe, it, test: it,
    expect: () => noop,
    cy: new Proxy({}, { get: () => noop }),
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

// ── Runner ───────────────────────────────────────────────────────────────────

export class TestRunner {
  /**
   * Execute a JS test code string. The sandbox exposes describe/it/test/expect
   * plus any extra context values (e.g. { cy: mockApi }).
   */
  async runCode(code: string, extraContext: Record<string, any> = {}): Promise<RunResults> {
    const queue: Array<{ name: string; fn: () => any }> = [];
    const suiteStack: string[] = [];

    const it = (name: string, fn: () => any) => {
      const full = suiteStack.length ? `${suiteStack.join(' > ')} > ${name}` : name;
      queue.push({ name: full, fn });
    };

    const describe = (name: string, fn: () => void) => {
      suiteStack.push(name);
      try { fn(); } finally { suiteStack.pop(); }
    };

    // No-op stub for cy — browser tests that call cy work but return empty/null values.
    // Pass a real cy implementation via extraContext to test with actual browser state.
    const cypressStub: Record<string, (...args: any[]) => any> = new Proxy({}, {
      get: (_t, prop) => (..._args: any[]) => {
        if (prop === 'url' || prop === 'title' || prop === 'text' || prop === 'attr') return '';
        if (prop === 'get') return [];
        if (prop === 'find') return null;
        if (prop === 'isVisible') return false;
        if (prop === 'wait' || prop === 'waitForElement' || prop === 'waitForUrl') return Promise.resolve(null);
        return undefined;
      },
    });

    const sandbox = vm.createContext({
      describe,
      it,
      test: it,
      expect: createExpect,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Promise,
      cy: cypressStub,
      ...extraContext,
    });

    try {
      vm.runInContext(code, sandbox);
    } catch (err: any) {
      return {
        passed: 0, failed: 1, total: 1, duration: 0,
        tests: [{ name: '(parse/compile error)', passed: false, error: err.message, duration: 0 }],
      };
    }

    const results: TestResult[] = [];
    const suiteStart = Date.now();

    for (const t of queue) {
      const start = Date.now();
      try {
        await Promise.resolve(t.fn());
        results.push({ name: t.name, passed: true, duration: Date.now() - start });
      } catch (err: any) {
        results.push({ name: t.name, passed: false, error: err.message, duration: Date.now() - start });
      }
    }

    const passed = results.filter(r => r.passed).length;
    return {
      passed,
      failed: results.length - passed,
      total: results.length,
      duration: Date.now() - suiteStart,
      tests: results,
    };
  }

  /** Load a JS file from disk and run it. */
  async runFile(filePath: string, extraContext: Record<string, any> = {}): Promise<RunResults> {
    const code = fs.readFileSync(filePath, 'utf-8');
    return this.runCode(code, extraContext);
  }

  /** Pretty-print results to stdout. */
  report(results: RunResults): void {
    console.log('\n─────────────────────────────');
    for (const t of results.tests) {
      if (t.passed) {
        console.log(`  ✅  ${t.name} (${t.duration}ms)`);
      } else {
        console.log(`  ❌  ${t.name} (${t.duration}ms)`);
        if (t.error) console.log(`       ${t.error}`);
      }
    }
    console.log('─────────────────────────────');
    console.log(`  ${results.passed} passed, ${results.failed} failed, ${results.total} total (${results.duration}ms)\n`);
  }
}
