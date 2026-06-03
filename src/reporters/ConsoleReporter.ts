import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
  LogEntry,
} from '../runner/reporter';

const ansi = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

const color = (text: string, c: keyof typeof ansi) =>
  `${ansi[c]}${text}${ansi.reset}`;

export class ConsoleReporter implements Reporter {
  constructor(private _config: Record<string, unknown> = {}) {}

  onBegin(_config: FullConfig, suite: Suite): void {
    const total = suite.allTests().length;
    console.log(color(`Running ${total} test(s)\n`, 'bold'));
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    console.log(this.formatStatus(test.title, result.status, result.duration, result.retry));

    this.printLogs(result.logs);
    this.printError(result.error);

    console.log('');
  }

  onEnd(result: FullResult): void {
    const summary =
      `Summary: ${result.passed} passed, ${result.failed} failed, ` +
      `${result.total} total ` +
      `(${result.duration}ms)\n`;

    console.log(
      result.failed > 0
        ? color(summary, 'red')
        : color(summary, 'green')
    );
  }

  private formatStatus(title: string, status: TestResult['status'], duration: number, retry?: number) {
    const retryLabel = retry != null && retry > 0 ? color(` [retry ${retry}]`, 'yellow') : '';
    const base = `${title}${retryLabel} (${duration}ms)`;

    switch (status) {
      case 'passed':
        return color(`[PASS] ${base}`, 'green');
      case 'failed':
        return color(`[FAIL] ${base}`, 'red');
      case 'skipped':
        return color(`[SKIP] ${base}`, 'yellow');
    }
  }

  private printLogs(logs?: LogEntry[], depth = 0) {
    if (!logs?.length) return;
    const indent = '  '.repeat(depth + 1);

    for (const entry of logs) {
      const icon =
        entry.state === 'pass'
          ? color('✓', 'green')
          : entry.state === 'fail'
            ? color('✗', 'red')
            : color('›', 'gray');

      const duration =
        entry.duration != null ? color(` (${entry.duration}ms)`, 'gray') : '';

      console.log(`${indent}${icon} ${entry.message}${duration}`);

      if (entry.children?.length) {
        this.printLogs(entry.children, depth + 1);
      }
    }
  }

  private printError(error?: unknown) {
    if (!error) return;

    const msg =
      error instanceof Error ? error.stack || error.message : String(error);

    console.log(color(`  ERROR: ${msg}`, 'red'));
  }
}