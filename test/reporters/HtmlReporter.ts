import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult, LogEntry } from '../../src/runner/reporter';

interface TestEntry {
  title: string;
  fullTitle: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  attachments: Array<{ label: string; body: string; contentType: string }>;
}

export interface HtmlReporterConfig {
  outputPath?: string;
}

export class HtmlReporter implements Reporter {
  private tests: TestEntry[] = [];
  private outputPath: string;

  constructor(config: HtmlReporterConfig = {}) {
    this.outputPath = resolve(config.outputPath ?? 'report.html');
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.tests = [];
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const attachments = (result.logs ?? [])
      .filter((l: LogEntry) => l.cmd === 'attach' && l.attachment)
      .map((l: LogEntry) => ({ label: l.message, body: l.attachment!.body, contentType: l.attachment!.contentType }));
    this.tests.push({
      title: test.title,
      fullTitle: test.fullTitle,
      status: result.status,
      duration: result.duration,
      error: result.error,
      attachments,
    });
  }

  onEnd(result: FullResult): void {
    mkdirSync(dirname(this.outputPath), { recursive: true });
    writeFileSync(this.outputPath, buildHtml(this.tests, result));
    console.log(`HTML report written to ${this.outputPath}`);
  }
}

function escape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAttachment(a: { label: string; body: string; contentType: string }): string {
  const isImage = a.contentType.startsWith('image/');
  const src = isImage
    ? (a.body.startsWith('data:') ? a.body : `data:${a.contentType};base64,${a.body}`)
    : null;
  const inner = src
    ? `<img src="${src}" alt="${escape(a.label)}" style="max-width:100%;max-height:300px;display:block;border-radius:4px">`
    : `<pre class="attach-body">${escape(a.body.slice(0, 4000))}${a.body.length > 4000 ? '\n…' : ''}</pre>`;
  return `<div class="attachment"><span class="attach-label">📎 ${escape(a.label)}</span>${inner}</div>`;
}

function buildHtml(tests: TestEntry[], result: FullResult): string {
  const rows = tests.map(t => {
    const statusClass = t.status === 'passed' ? 'pass' : t.status === 'failed' ? 'fail' : 'skip';
    const errorHtml = t.error
      ? `<pre class="error">${escape(t.error)}</pre>`
      : '';
    const attachHtml = t.attachments.length > 0
      ? `<div class="attachments">${t.attachments.map(renderAttachment).join('')}</div>`
      : '';
    const extraHtml = errorHtml + attachHtml;
    return `
    <tr class="${statusClass}">
      <td class="badge">${t.status}</td>
      <td>${escape(t.fullTitle)}</td>
      <td class="dur">${t.duration}ms</td>
    </tr>${extraHtml ? `\n    <tr class="${statusClass} extra-row"><td colspan="3">${extraHtml}</td></tr>` : ''}`;
  }).join('');

  const overallClass = result.status === 'passed' ? 'pass' : 'fail';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Test Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f5f5f5; color: #222; }
    h1 { margin: 0 0 16px; font-size: 1.4rem; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; }
    .stat { background: #fff; border-radius: 6px; padding: 12px 20px; border: 1px solid #ddd; }
    .stat .n { font-size: 1.8rem; font-weight: 700; }
    .stat.pass .n { color: #1a9c4e; }
    .stat.fail .n { color: #c0392b; }
    .stat .label { font-size: 0.8rem; color: #666; text-transform: uppercase; letter-spacing: .05em; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; border: 1px solid #ddd; }
    th { text-align: left; padding: 10px 14px; background: #f0f0f0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: .05em; color: #555; }
    td { padding: 10px 14px; border-top: 1px solid #eee; vertical-align: top; }
    tr.pass td:first-child { color: #1a9c4e; }
    tr.fail td:first-child { color: #c0392b; }
    tr.skip td:first-child { color: #888; }
    .badge { font-weight: 600; font-size: 0.85rem; white-space: nowrap; }
    .dur { color: #888; font-size: 0.85rem; white-space: nowrap; }
    pre.error { margin: 0; font-size: 0.82rem; color: #c0392b; white-space: pre-wrap; word-break: break-all; }
    tr.extra-row td { padding-top: 0; background: #fafafa; }
    .overall { margin-bottom: 12px; font-size: 1rem; }
    .overall.pass { color: #1a9c4e; font-weight: 700; }
    .overall.fail { color: #c0392b; font-weight: 700; }
    .attachments { display: flex; flex-wrap: wrap; gap: 12px; padding: 8px 0 4px; }
    .attachment { border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; background: #fff; max-width: 420px; }
    .attach-label { display: block; font-size: 0.8rem; font-weight: 600; color: #555; margin-bottom: 6px; }
    pre.attach-body { margin: 0; font-size: 0.8rem; background: #1e1e1e; color: #d4d4d4; padding: 8px; border-radius: 4px; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow: auto; }
  </style>
</head>
<body>
  <h1>Test Report</h1>
  <p class="overall ${overallClass}">${result.status.toUpperCase()} &mdash; ${result.duration}ms</p>
  <div class="summary">
    <div class="stat pass"><div class="n">${result.passed}</div><div class="label">Passed</div></div>
    <div class="stat fail"><div class="n">${result.failed}</div><div class="label">Failed</div></div>
    <div class="stat"><div class="n">${result.total}</div><div class="label">Total</div></div>
  </div>
  <table>
    <thead><tr><th>Status</th><th>Test</th><th>Duration</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}
