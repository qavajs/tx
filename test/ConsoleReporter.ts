import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '../src/reporter';

export class ConsoleReporter implements Reporter {
  constructor(_config: Record<string, unknown> = {}) { }

  onBegin(_config: FullConfig, suite: Suite): void {
    console.log(`Running ${suite.allTests().length} test(s)`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'passed') {
      console.log(`[Passed] ${test.title} (${result.duration}ms)`);
    } else {
      console.log(`[Failed] ${test.title} (${result.duration}ms)`);
    }
    if (result.logs?.length) {
      for (const entry of result.logs) {
        const icon = entry.state === 'pass' ? '✓' : entry.state === 'fail' ? '✗' : '›';
        const dur = entry.duration != null ? ` (${entry.duration}ms)` : '';
        console.log(`${icon} ${entry.cmd}  ${entry.message}${dur}`);
      }
    }
    if (result.error) console.log(`${result.error}`);
  }

  onEnd(result: FullResult): void {
    console.log(`  ${result.passed} passed, ${result.failed} failed, ${result.total} total (${result.duration}ms)\n`);
  }
}
