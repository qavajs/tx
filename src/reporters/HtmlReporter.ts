import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult, LogEntry } from '../runner/reporter';
import reportCss from './report.css';
import reportJs from './report.iife.js';

interface StepEntry {
  cmd: string;
  message: string;
  state: 'pass' | 'fail' | 'info' | 'warn';
  duration?: number;
  children?: StepEntry[];
}

interface AttachmentEntry {
  label: string;
  body: string;
  contentType: string;
}

interface TestEntry {
  title: string;
  fullTitle: string;
  file?: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  steps: StepEntry[];
  attachments: AttachmentEntry[];
}

export interface HtmlReporterConfig {
  outputPath?: string;
  title?: string;
}

export class HtmlReporter implements Reporter {
  private tests: TestEntry[] = [];
  private outputPath: string;
  private reportTitle: string;
  private startTime = Date.now();

  constructor(config: HtmlReporterConfig = {}) {
    this.outputPath = resolve(config.outputPath ?? 'report.html');
    this.reportTitle = config.title ?? 'Test Report';
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.tests = [];
    this.startTime = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const logs = result.logs ?? [];

    const steps = logsToSteps(logs);

    const attachments = flattenLogs(logs)
      .filter((l: LogEntry) => l.cmd === 'attach' && l.attachment)
      .map((l: LogEntry) => ({
        label: l.message,
        body: l.attachment!.body,
        contentType: l.attachment!.contentType,
      }));

    this.tests.push({
      title: test.title,
      fullTitle: test.fullTitle,
      file: test.file,
      status: result.status,
      duration: result.duration,
      error: result.error,
      steps,
      attachments,
    });
  }

  onEnd(result: FullResult): void {
    mkdirSync(dirname(this.outputPath), { recursive: true });
    writeFileSync(this.outputPath, buildHtml(this.tests, result, this.reportTitle, this.startTime));
    console.log(`\nHTML report written to ${this.outputPath}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function flattenLogs(logs: LogEntry[]): LogEntry[] {
  const out: LogEntry[] = [];
  for (const entry of logs) {
    out.push(entry);
    if (entry.children?.length) out.push(...flattenLogs(entry.children));
  }
  return out;
}

function logsToSteps(logs: LogEntry[]): StepEntry[] {
  return logs
    .filter(l => l.cmd !== 'attach')
    .map(l => ({
      cmd: l.cmd,
      message: l.message,
      state: l.state as StepEntry['state'],
      duration: l.duration,
      children: l.children?.length ? logsToSteps(l.children) : undefined,
    }));
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseSuite(fullTitle: string): string {
  const idx = fullTitle.lastIndexOf(' > ');
  return idx >= 0 ? fullTitle.slice(0, idx) : '(root)';
}

function parseTitle(fullTitle: string): string {
  const idx = fullTitle.lastIndexOf(' > ');
  return idx >= 0 ? fullTitle.slice(idx + 3) : fullTitle;
}

function fmtDur(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

// ── HTML builder ─────────────────────────────────────────────────────────────

function buildHtml(
  tests: TestEntry[],
  result: FullResult,
  reportTitle: string,
  startTime: number,
): string {
  const skipped = result.total - result.passed - result.failed;
  const passRate = result.total > 0 ? Math.round((result.passed / result.total) * 100) : 0;
  const generated = new Date(startTime).toLocaleString();
  const maxDur = Math.max(...tests.map(t => t.duration), 1);
  const oc = result.status === 'passed' ? 'pass' : 'fail';

  const data = tests.map((t, i) => ({
    id: i,
    title: parseTitle(t.fullTitle),
    fullTitle: t.fullTitle,
    suite: parseSuite(t.fullTitle),
    status: t.status,
    duration: t.duration,
    durPct: Math.max(2, Math.round((t.duration / maxDur) * 100)),
    error: t.error ?? null,
    steps: t.steps,
    attachments: t.attachments.map(a => {
      const isImage = a.contentType.startsWith('image/');
      const isHtml = a.contentType === 'text/html';
      return {
        label: a.label,
        contentType: a.contentType,
        isImage,
        isHtml,
        src: isImage ? (a.body.startsWith('data:') ? a.body : `data:${a.contentType};base64,${a.body}`) : null,
        body: isImage ? '' : isHtml ? a.body : a.body.slice(0, 4000),
      };
    }),
  }));

  // Prevent </script> from breaking the embedded JSON
  const json = JSON.stringify(data).replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(reportTitle)}</title>
  <style>${reportCss as string}</style>
</head>
<body>

<header class="hdr">
  <div class="hdr-inner">
    <div class="hdr-left">
      <svg class="logo" viewBox="0 0 24 24" fill="none">
        <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <h1>${esc(reportTitle)}</h1>
    </div>
    <div class="hdr-right">
      <span class="run-badge ${oc}">${result.status.toUpperCase()}</span>
      <span class="gen-time">Generated ${esc(generated)}</span>
    </div>
  </div>
</header>

<main>
  <div class="stats">
    <div class="stat">
      <div class="n">${result.total}</div>
      <div class="l">Total</div>
    </div>
    <div class="stat pass">
      <div class="n">${result.passed}</div>
      <div class="l">Passed</div>
    </div>
    <div class="stat fail">
      <div class="n">${result.failed}</div>
      <div class="l">Failed</div>
    </div>
    <div class="stat skip">
      <div class="n">${skipped}</div>
      <div class="l">Skipped</div>
    </div>
    <div class="stat rate">
      <div class="n">${passRate}%</div>
      <div class="l">Pass Rate</div>
      <div class="rbar"><div class="rfill ${oc}" style="width:${passRate}%"></div></div>
    </div>
    <div class="stat">
      <div class="n">${fmtDur(result.duration)}</div>
      <div class="l">Duration</div>
    </div>
  </div>

  <div class="toolbar">
    <div class="sw">
      <svg class="si" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
      </svg>
      <input id="s" class="search" type="search" placeholder="Search tests…" autocomplete="off">
      <button class="si-x" id="sx" title="Clear search">
        <svg viewBox="0 0 14 14" fill="none" width="14" height="14"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="fbs">
      <button class="fb active" data-f="all">All <span>${result.total}</span></button>
      <button class="fb pass"   data-f="passed">Passed <span>${result.passed}</span></button>
      <button class="fb fail"   data-f="failed">Failed <span>${result.failed}</span></button>
      <button class="fb skip"   data-f="skipped">Skipped <span>${skipped}</span></button>
    </div>
    <div class="suite-btns">
      <button id="expand-all" class="suite-btn">Expand all</button>
      <button id="collapse-all" class="suite-btn">Collapse all</button>
    </div>
    ${result.failed > 0 ? '<button class="jump" id="jf">↓ Jump to failures</button>' : ''}
  </div>

  <div id="groups"></div>
  <div id="empty" class="empty" style="display:none"><p>No tests match the current filter.</p></div>
</main>

<footer>Generated by <strong>tx</strong> &bull; ${esc(generated)}</footer>

<div id="lb" class="lb" style="display:none">
  <button class="lb-close" id="lbc">&times;</button>
  <img id="lbi" src="" alt="">
</div>

<script>
const DATA=${json};
${reportJs as string}
</script>
</body>
</html>`;
}
