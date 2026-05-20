/**
 * Test runner — executes JS test code in a Node.js vm sandbox.
 * Browser-control API and expect are importable via require('tx') inside the sandbox.
 */

import * as vm from 'vm';
import * as fs from 'fs';
import * as path from 'path';
import { Page, Locator, createExpect } from './serverPage';
import {
  ReporterEmitter,
  type Reporter,
  type FullConfig,
  type Suite,
  type TestCase,
  type TestResult as ReporterTestResult,
  type FullResult,
} from './reporter';

export { Page, Locator, createExpect };
export type { Reporter, FullConfig, Suite, TestCase, ReporterTestResult as ReporterTestResult, FullResult };
export { ReporterEmitter } from './reporter';

// ── Public interfaces ─────────────────────────────────────────────────────────

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

export interface ParsedTest { suite: string; name: string; }
export interface ParsedFile { filename: string; tests: ParsedTest[]; error?: string; }

// ── Test file parsing ─────────────────────────────────────────────────────────

export function parseTestCode(code: string): ParsedTest[] {
  const tests: ParsedTest[] = [];
  const stack: string[] = [];
  const it = (name: string) => tests.push({ suite: stack.join(' > '), name: String(name) });
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

// ── TestRunner ────────────────────────────────────────────────────────────────

export class TestRunner {
  private emitter = new ReporterEmitter();

  addReporter(reporter: Reporter): this {
    this.emitter.add(reporter);
    return this;
  }

  async runCode(code: string, extraContext: Record<string, any> = {}, _lifecycle = true): Promise<RunResults> {
    type QueueItem = {
      name: string; fn: () => any;
      beforeEachs: Array<() => any>; afterEachs: Array<() => any>;
      setupBeforeAlls: Array<() => any>; teardownAfterAlls: Array<() => any>;
    };
    const queue: QueueItem[] = [];
    const suiteStack: string[] = [];
    const hookStack: Array<{ beforeEachs: Array<() => any>; afterEachs: Array<() => any>; beforeAlls: Array<() => any>; afterAlls: Array<() => any> }> = [];

    const beforeEach = (fn: () => any) => {
      if (hookStack.length) hookStack[hookStack.length - 1].beforeEachs.push(fn);
    };
    const afterEach = (fn: () => any) => {
      if (hookStack.length) hookStack[hookStack.length - 1].afterEachs.push(fn);
    };
    const beforeAll = (fn: () => any) => {
      if (hookStack.length) hookStack[hookStack.length - 1].beforeAlls.push(fn);
    };
    const afterAll = (fn: () => any) => {
      if (hookStack.length) hookStack[hookStack.length - 1].afterAlls.push(fn);
    };

    const it = (name: string, fn: () => any) => {
      const full = suiteStack.length ? `${suiteStack.join(' > ')} > ${name}` : name;
      const beforeEachs = hookStack.flatMap(s => s.beforeEachs);
      const afterEachs = hookStack.flatMap(s => s.afterEachs).reverse();
      queue.push({ name: full, fn, beforeEachs, afterEachs, setupBeforeAlls: [], teardownAfterAlls: [] });
    };
    const describe = (name: string, fn: () => void) => {
      suiteStack.push(name);
      hookStack.push({ beforeEachs: [], afterEachs: [], beforeAlls: [], afterAlls: [] });
      const lenBefore = queue.length;
      try { fn(); } finally {
        const scope = hookStack[hookStack.length - 1];
        const scopeTests = queue.slice(lenBefore);
        if (scopeTests.length > 0) {
          if (scope.beforeAlls.length) scopeTests[0].setupBeforeAlls = [...scope.beforeAlls, ...scopeTests[0].setupBeforeAlls];
          if (scope.afterAlls.length) scopeTests[scopeTests.length - 1].teardownAfterAlls = [...scopeTests[scopeTests.length - 1].teardownAfterAlls, ...scope.afterAlls];
        }
        suiteStack.pop();
        hookStack.pop();
      }
    };

    const txStub: any = new Proxy({}, {
      get: (_t, prop) => (..._args: any[]) => {
        if (prop === 'url' || prop === 'title' || prop === 'text' || prop === 'attr') return '';
        if (prop === 'get') return [];
        if (prop === 'find') return null;
        if (prop === 'wait' || prop === 'waitForElement' || prop === 'waitForUrl') return Promise.resolve(null);
        return undefined;
      },
    });

    // Browser-control API and expect are available via require('tx')
    const _page = new Page();
    const _require = (id: string) => {
      if (id === 'tx') return { page: _page, expect: createExpect, Locator };
      throw new Error(`Cannot find module '${id}'`);
    };

    const sandbox = vm.createContext({
      describe, it, test: it,
      beforeEach, afterEach, beforeAll, afterAll,
      require: _require,
      expect: createExpect,
      console, setTimeout, clearTimeout, setInterval, clearInterval, Promise,
      tx: txStub,
      page: _page,
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

    const allTestCases: TestCase[] = queue.map(t => ({ title: t.name, fullTitle: t.name }));
    const suite: Suite = {
      title: '',
      tests: allTestCases,
      allTests() { return this.tests; },
    };
    if (_lifecycle) this.emitter.emitBegin({ testFiles: [] }, suite);

    for (let i = 0; i < queue.length; i++) {
      const t = queue[i];
      const testCase = allTestCases[i];
      const liveResult: ReporterTestResult = { status: 'passed', duration: 0 };
      this.emitter.emitTestBegin(testCase, liveResult);

      const start = Date.now();
      try {
        for (const hook of t.setupBeforeAlls) await Promise.resolve(hook());
        for (const hook of t.beforeEachs) await Promise.resolve(hook());
        await Promise.resolve(t.fn());
        for (const hook of t.afterEachs) await Promise.resolve(hook());
        for (const hook of t.teardownAfterAlls) await Promise.resolve(hook());
        liveResult.duration = Date.now() - start;
        liveResult.status = 'passed';
        results.push({ name: t.name, passed: true, duration: liveResult.duration });
      } catch (err: any) {
        liveResult.duration = Date.now() - start;
        liveResult.status = 'failed';
        liveResult.error = err.message;
        results.push({ name: t.name, passed: false, error: err.message, duration: liveResult.duration });
      }

      this.emitter.emitTestEnd(testCase, liveResult);
    }

    const passed = results.filter(r => r.passed).length;
    const runResults: RunResults = {
      passed,
      failed: results.length - passed,
      total: results.length,
      duration: Date.now() - suiteStart,
      tests: results,
    };

    if (_lifecycle) this.emitter.emitEnd({
      status: runResults.failed > 0 ? 'failed' : 'passed',
      passed: runResults.passed,
      failed: runResults.failed,
      total: runResults.total,
      duration: runResults.duration,
    });

    return runResults;
  }

  async runFile(filePath: string, extraContext: Record<string, any> = {}): Promise<RunResults> {
    return this.runCode(fs.readFileSync(filePath, 'utf-8'), extraContext);
  }

  async runFiles(filePaths: string[], extraContext: Record<string, any> = {}): Promise<RunResults> {
    const allTestCases: TestCase[] = [];
    for (const fp of filePaths) {
      const parsed = parseTestFile(fp);
      for (const t of parsed.tests) {
        allTestCases.push({ title: t.name, fullTitle: t.suite ? `${t.suite} > ${t.name}` : t.name });
      }
    }
    const suite: Suite = { title: '', tests: allTestCases, allTests() { return this.tests; } };
    this.emitter.emitBegin({ testFiles: filePaths }, suite);

    let totalPassed = 0, totalFailed = 0, totalDuration = 0;
    const allTests: TestResult[] = [];
    for (const fp of filePaths) {
      const r = await this.runCode(fs.readFileSync(fp, 'utf-8'), extraContext, false);
      totalPassed += r.passed;
      totalFailed += r.failed;
      totalDuration += r.duration;
      allTests.push(...r.tests);
    }

    const runResults: RunResults = {
      passed: totalPassed,
      failed: totalFailed,
      total: allTests.length,
      duration: totalDuration,
      tests: allTests,
    };
    this.emitter.emitEnd({
      status: totalFailed > 0 ? 'failed' : 'passed',
      passed: totalPassed,
      failed: totalFailed,
      total: allTests.length,
      duration: totalDuration,
    });
    return runResults;
  }

  report(results: RunResults): void {
    console.log('\n─────────────────────────────');
    for (const t of results.tests) {
      if (t.passed) console.log(`  ✅  ${t.name} (${t.duration}ms)`);
      else {
        console.log(`  ❌  ${t.name} (${t.duration}ms)`);
        if (t.error) console.log(`       ${t.error}`);
      }
    }
    console.log('─────────────────────────────');
    console.log(`  ${results.passed} passed, ${results.failed} failed, ${results.total} total (${results.duration}ms)\n`);
  }
}
