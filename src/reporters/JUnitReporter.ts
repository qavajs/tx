import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '../runner/reporter';

interface TestEntry {
  file: string;
  name: string;
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
  error?: string;
}

export class JUnitReporter implements Reporter {
  private tests: TestEntry[] = [];
  private outputPath: string;

  constructor(config: Record<string, unknown> = {}) {
    this.outputPath = path.resolve((config.outputPath as string) ?? 'test-results/junit.xml');
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.tests = [];
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.tests.push({
      file: test.file ?? 'unknown',
      name: test.fullTitle,
      duration: result.duration,
      status: result.status,
      error: result.error,
    });
  }

  onEnd(_result: FullResult): void {
    const xml = buildJUnit(this.tests);
    fs.mkdirSync(path.dirname(this.outputPath), { recursive: true });
    fs.writeFileSync(this.outputPath, xml, 'utf-8');
    console.log(`JUnit report written to ${this.outputPath}`);
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildJUnit(tests: TestEntry[]): string {
  const byFile = new Map<string, TestEntry[]>();
  for (const t of tests) {
    const arr = byFile.get(t.file) ?? [];
    arr.push(t);
    byFile.set(t.file, arr);
  }

  let totalTests = 0, totalFailures = 0, totalTime = 0;
  const suites: string[] = [];

  for (const [file, entries] of byFile) {
    const failures = entries.filter(e => e.status === 'failed').length;
    const suiteTime = entries.reduce((s, e) => s + e.duration, 0) / 1000;
    totalTests += entries.length;
    totalFailures += failures;
    totalTime += suiteTime;

    const cases = entries.map(e => {
      const attrs = `name="${esc(e.name)}" classname="${esc(file)}" time="${(e.duration / 1000).toFixed(3)}"`;
      if (e.status === 'failed') {
        const msg = esc((e.error ?? '').split('\n')[0]);
        const body = esc(e.error ?? '');
        return `    <testcase ${attrs}>\n      <failure message="${msg}" type="Error">${body}</failure>\n    </testcase>`;
      }
      if (e.status === 'skipped') {
        return `    <testcase ${attrs}>\n      <skipped/>\n    </testcase>`;
      }
      return `    <testcase ${attrs}/>`;
    }).join('\n');

    suites.push(
      `  <testsuite name="${esc(file)}" tests="${entries.length}" failures="${failures}" errors="0" time="${suiteTime.toFixed(3)}">\n${cases}\n  </testsuite>`
    );
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites name="tx" tests="${totalTests}" failures="${totalFailures}" errors="0" time="${totalTime.toFixed(3)}">\n` +
    suites.join('\n') + '\n' +
    `</testsuites>\n`
  );
}
