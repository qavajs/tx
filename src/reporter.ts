/**
 * Reporter event emitter system — Playwright-compatible reporter API.
 */

export interface FullConfig {
  testFiles: string[];
}

export interface TestCase {
  title: string;
  fullTitle: string;
}

export interface TestResult {
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

export interface Suite {
  title: string;
  tests: TestCase[];
  allTests(): TestCase[];
}

export interface FullResult {
  status: 'passed' | 'failed';
  passed: number;
  failed: number;
  total: number;
  duration: number;
}

export interface Reporter {
  onBegin?(config: FullConfig, suite: Suite): void;
  onTestBegin?(test: TestCase, result: TestResult): void;
  onTestEnd?(test: TestCase, result: TestResult): void;
  onEnd?(result: FullResult): void;
}

export class ConsoleReporter implements Reporter {
  onBegin(_config: FullConfig, suite: Suite): void {
    console.log(`Running ${suite.allTests().length} test(s)`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'passed') {
      console.log(`  ✅  ${test.title} (${result.duration}ms)`);
    } else {
      console.log(`  ❌  ${test.title} (${result.duration}ms)`);
      if (result.error) console.log(`       ${result.error}`);
    }
  }

  onEnd(result: FullResult): void {
    console.log(`  ${result.passed} passed, ${result.failed} failed, ${result.total} total (${result.duration}ms)\n`);
  }
}

export class ReporterEmitter {
  private reporters: Reporter[] = [];

  add(reporter: Reporter): this {
    this.reporters.push(reporter);
    return this;
  }

  emitBegin(config: FullConfig, suite: Suite): void {
    for (const r of this.reporters) r.onBegin?.(config, suite);
  }

  emitTestBegin(test: TestCase, result: TestResult): void {
    for (const r of this.reporters) r.onTestBegin?.(test, result);
  }

  emitTestEnd(test: TestCase, result: TestResult): void {
    for (const r of this.reporters) r.onTestEnd?.(test, result);
  }

  emitEnd(result: FullResult): void {
    for (const r of this.reporters) r.onEnd?.(result);
  }
}
