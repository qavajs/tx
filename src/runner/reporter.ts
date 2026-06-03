/**
 * Reporter event emitter system — Playwright-compatible reporter API.
 */

export interface FullConfig {
  testFiles: string[];
}

export interface TestCase {
  title: string;
  fullTitle: string;
  file?: string;
}

export interface Attachment {
  body: string;
  contentType: string;
}

export interface LogEntry {
  cmd: string;
  message: string;
  state: 'pass' | 'fail' | 'info';
  duration?: number;
  attachment?: Attachment;
  children?: LogEntry[];
}

export interface TestResult {
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  logs?: LogEntry[];
  retry?: number;
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
