import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult, LogEntry } from '../runner/reporter';

interface StepEntry {
  cmd: string;
  message: string;
  state: 'pass' | 'fail' | 'info';
  duration?: number;
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
    const allLogs = flattenLogs(result.logs ?? []);

    const steps = allLogs
      .filter((l: LogEntry) => l.cmd !== 'attach')
      .map((l: LogEntry) => ({ cmd: l.cmd, message: l.message, state: l.state, duration: l.duration }));

    const attachments = allLogs
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

function fmtDur(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
:root {
  --bg: #f1f5f9;
  --surface: #fff;
  --border: #e2e8f0;
  --text: #1e293b;
  --muted: #64748b;
  --pass: #16a34a;
  --pass-light: #dcfce7;
  --pass-dark: #166534;
  --fail: #dc2626;
  --fail-light: #fee2e2;
  --fail-dark: #991b1b;
  --skip: #d97706;
  --skip-light: #fef3c7;
  --skip-dark: #92400e;
  --primary: #2563eb;
  --radius: 10px;
  --shadow: 0 1px 3px rgba(0,0,0,.07), 0 1px 2px rgba(0,0,0,.05);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; font-size: 14px; }

/* ── Header ── */
.hdr { background: #0f172a; color: #f8fafc; }
.hdr-inner { max-width: 1440px; margin: 0 auto; padding: 0 24px; height: 56px; display: flex; align-items: center; justify-content: space-between; }
.hdr-left { display: flex; align-items: center; gap: 10px; }
.logo { width: 20px; height: 20px; color: #60a5fa; flex-shrink: 0; }
.hdr h1 { font-size: 1rem; font-weight: 600; color: #f8fafc; letter-spacing: -.01em; }
.hdr-right { display: flex; align-items: center; gap: 14px; }
.run-badge { padding: 3px 11px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; letter-spacing: .08em; }
.run-badge.pass { background: var(--pass-light); color: var(--pass-dark); }
.run-badge.fail { background: var(--fail-light); color: var(--fail-dark); }
.gen-time { font-size: 0.75rem; color: #94a3b8; }

/* ── Main ── */
main { max-width: 1440px; margin: 0 auto; padding: 20px 24px 40px; }

/* ── Stats ── */
.stats { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 18px; flex: 1; min-width: 100px; box-shadow: var(--shadow); }
.stat .n { font-size: 1.75rem; font-weight: 700; line-height: 1; letter-spacing: -.02em; }
.stat .l { font-size: 0.68rem; color: var(--muted); text-transform: uppercase; letter-spacing: .07em; margin-top: 3px; }
.stat.pass .n { color: var(--pass); }
.stat.fail .n { color: var(--fail); }
.stat.skip .n { color: var(--skip); }
.rbar { height: 3px; background: var(--border); border-radius: 2px; margin-top: 10px; overflow: hidden; }
.rfill { height: 100%; border-radius: 2px; }
.rfill.pass { background: var(--pass); }
.rfill.fail { background: var(--fail); }

/* ── Toolbar ── */
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.sw { position: relative; flex: 1; min-width: 180px; }
.si { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 15px; height: 15px; color: #94a3b8; pointer-events: none; }
.si-x { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 15px; height: 15px; color: #94a3b8; background: none; border: none; cursor: pointer; display: none; align-items: center; justify-content: center; padding: 0; }
.si-x.visible { display: flex; }
.search { width: 100%; padding: 7px 30px 7px 32px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.85rem; background: var(--surface); outline: none; transition: border-color .15s, box-shadow .15s; }
.search:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
.fbs { display: flex; gap: 5px; flex-wrap: wrap; }
.fb { padding: 6px 12px; border: 1px solid var(--border); background: var(--surface); border-radius: 8px; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 5px; transition: all .15s; white-space: nowrap; color: var(--text); }
.fb:hover { background: #f8fafc; border-color: #cbd5e1; }
.fb.active { background: #0f172a; color: #fff; border-color: #0f172a; }
.fb.pass.active { background: var(--pass); border-color: var(--pass); }
.fb.fail.active { background: var(--fail); border-color: var(--fail); }
.fb.skip.active { background: var(--skip); border-color: var(--skip); }
.fb span { font-weight: 600; }
.jump { padding: 6px 12px; background: var(--fail-light); color: var(--fail); border: 1px solid #fecaca; border-radius: 8px; font-size: 0.8rem; cursor: pointer; white-space: nowrap; transition: background .15s; }
.jump:hover { background: #fecaca; }

/* ── Groups ── */
#groups { display: flex; flex-direction: column; gap: 8px; }

/* ── Group ── */
.group { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
.group.has-fail { border-color: #fca5a5; }
.gh { display: flex; align-items: center; gap: 10px; padding: 11px 14px; cursor: pointer; user-select: none; transition: background .15s; }
.gh:hover { background: #f8fafc; }
.group.has-fail .gh { background: #fff5f5; }
.group.has-fail .gh:hover { background: #fee2e2; }
.chev { width: 15px; height: 15px; color: #94a3b8; flex-shrink: 0; transition: transform .2s; }
.chev.open { transform: rotate(90deg); }
.gname { font-size: 0.85rem; font-weight: 600; flex: 1; word-break: break-word; }
.gbadges { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
.gbadge { font-size: 0.68rem; padding: 2px 7px; border-radius: 10px; font-weight: 600; white-space: nowrap; }
.gbadge.pass { background: var(--pass-light); color: var(--pass-dark); }
.gbadge.fail { background: var(--fail-light); color: var(--fail-dark); }
.gbadge.skip { background: var(--skip-light); color: var(--skip-dark); }
.gbadge.total { background: #f1f5f9; color: #475569; }
.gdur { font-size: 0.72rem; color: var(--muted); white-space: nowrap; }
.gbody { border-top: 1px solid #f8fafc; }

/* ── Test rows ── */
.tr { border-top: 1px solid #f8fafc; }
.tr:first-child { border-top: none; }
.ts { display: flex; align-items: center; gap: 9px; padding: 9px 14px; cursor: pointer; transition: background .15s; }
.ts:hover { background: #fafafa; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.dot.pass { background: var(--pass); }
.dot.fail { background: var(--fail); }
.dot.skip { background: var(--skip); }
.tname { flex: 1; font-size: 0.855rem; word-break: break-word; }
.tdur { font-size: 0.75rem; color: var(--muted); white-space: nowrap; }
.dbar-w { width: 64px; height: 3px; background: #f1f5f9; border-radius: 2px; overflow: hidden; flex-shrink: 0; }
.dbar { height: 100%; border-radius: 2px; }
.dbar.pass { background: #86efac; }
.dbar.fail { background: #fca5a5; }
.dbar.skip { background: #fcd34d; }
.exi { width: 13px; height: 13px; color: #cbd5e1; flex-shrink: 0; transition: transform .18s; }
.exi.open { transform: rotate(90deg); }

/* ── Test detail ── */
.td { display: none; background: #fafafa; border-top: 1px solid #f1f5f9; padding: 10px 14px 12px 30px; }
.td.open { display: block; }

/* ── Steps ── */
.steps { list-style: none; margin-bottom: 10px; }
.step { display: flex; align-items: flex-start; gap: 7px; padding: 2px 0; font-size: 0.8rem; color: #475569; line-height: 1.4; }
.sico { flex-shrink: 0; margin-top: 1px; width: 13px; height: 13px; }
.sico.pass { color: var(--pass); }
.sico.fail { color: var(--fail); }
.sico.info { color: #94a3b8; }
.step span { font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace; font-size: 0.79rem; }
.sdur { color: #94a3b8; margin-left: auto; white-space: nowrap; padding-left: 10px; }

/* ── Error ── */
.err-block { background: #fff5f5; border: 1px solid #fecaca; border-radius: 7px; padding: 10px 12px; margin-bottom: 10px; }
.err-hdr { display: flex; align-items: center; margin-bottom: 5px; }
.err-lbl { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--fail); }
.copy-btn { font-size: 0.68rem; background: none; border: 1px solid #fecaca; color: var(--fail); border-radius: 4px; padding: 1px 6px; cursor: pointer; margin-left: 8px; transition: background .12s; }
.copy-btn:hover { background: #fee2e2; }
.err-block pre { font-size: 0.78rem; color: #991b1b; white-space: pre-wrap; word-break: break-all; font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace; line-height: 1.5; }

/* ── Attachments ── */
.atts { display: flex; flex-wrap: wrap; gap: 10px; }
.att { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); max-width: 380px; }
.att.att-html { max-width: 100%; width: 100%; }
.att-lbl { font-size: 0.72rem; font-weight: 600; color: var(--muted); padding: 6px 10px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 5px; }
.att-img { display: block; max-width: 100%; max-height: 220px; cursor: zoom-in; object-fit: contain; }
.att-txt { font-size: 0.75rem; font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace; background: #1e293b; color: #e2e8f0; padding: 10px; max-height: 160px; overflow: auto; white-space: pre-wrap; word-break: break-all; line-height: 1.5; }
.att-iframe { display: block; width: 100%; height: 400px; border: none; background: #fff; }
.att-open { font-size: 0.68rem; background: none; border: 1px solid var(--border); color: var(--muted); border-radius: 4px; padding: 1px 6px; cursor: pointer; margin-left: auto; transition: background .12s; }
.att-open:hover { background: #f1f5f9; }

/* ── Empty ── */
.empty { text-align: center; padding: 60px 24px; color: #94a3b8; }
.empty p { font-size: 0.9rem; }

/* ── Lightbox ── */
.lb { position: fixed; inset: 0; background: rgba(0,0,0,.88); display: flex; align-items: center; justify-content: center; z-index: 9999; cursor: zoom-out; }
.lb-close { position: absolute; top: 14px; right: 18px; background: none; border: none; color: #fff; font-size: 2rem; cursor: pointer; line-height: 1; opacity: .8; }
.lb-close:hover { opacity: 1; }
#lbi { max-width: 95vw; max-height: 92vh; border-radius: 4px; cursor: default; box-shadow: 0 20px 60px rgba(0,0,0,.5); }

/* ── Footer ── */
footer { text-align: center; padding: 20px; font-size: 0.75rem; color: #94a3b8; border-top: 1px solid var(--border); margin-top: 8px; }

/* ── Print ── */
@media print {
  .toolbar, footer { display: none !important; }
  .td { display: block !important; }
  .gbody { display: block !important; }
  .group { box-shadow: none; break-inside: avoid; }
}
`;

// ── JS ────────────────────────────────────────────────────────────────────────

const JS = `
(function () {
  var activeFilter = 'all';
  var query = '';

  function sc(status) { return status === 'passed' ? 'pass' : status === 'failed' ? 'fail' : 'skip'; }

  function fmt(ms) {
    if (ms >= 60000) return (ms / 60000).toFixed(1) + 'm';
    if (ms >= 1000)  return (ms / 1000).toFixed(2) + 's';
    return ms + 'ms';
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  var STEP_ICONS = {
    pass: '<svg class="sico pass" viewBox="0 0 14 14" fill="none"><path d="M2.5 7l3 3L11.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fail: '<svg class="sico fail" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    info: '<svg class="sico info" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 6.5v3M7 5v.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
  };

  var CHEV = '<svg class="chev open" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var EXI  = '<svg class="exi" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ATT_ICON = '<svg viewBox="0 0 14 14" fill="none" style="width:11px;height:11px"><path d="M8.5 1.5H3.5a1 1 0 00-1 1v9a1 1 0 001 1h7a1 1 0 001-1V5l-3-3.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8.5 1.5v3h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function renderTest(t) {
    var cls = sc(t.status);
    var steps = '';
    if (t.steps && t.steps.length) {
      steps = '<ul class="steps">' + t.steps.map(function(s) {
        var ico = STEP_ICONS[s.state] || STEP_ICONS.info;
        var dur = s.duration != null ? '<span class="sdur">' + fmt(s.duration) + '</span>' : '';
        return '<li class="step">' + ico + '<span>' + esc(s.message) + '</span>' + dur + '</li>';
      }).join('') + '</ul>';
    }

    var errBlock = '';
    if (t.error) {
      errBlock = '<div class="err-block"><div class="err-hdr"><span class="err-lbl">Error</span><button class="copy-btn" data-tid="' + t.id + '">Copy</button></div><pre>' + esc(t.error) + '</pre></div>';
    }

    var atts = '';
    if (t.attachments && t.attachments.length) {
      atts = '<div class="atts">' + t.attachments.map(function(a, ai) {
        var inner, attCls = 'att', openBtn = '';
        if (a.isImage) {
          inner = '<img class="att-img" src="' + a.src + '" alt="' + esc(a.label) + '" data-lb>';
        } else if (a.isHtml) {
          attCls = 'att att-html';
          inner = '<iframe class="att-iframe" srcdoc="' + esc(a.body) + '" sandbox="allow-same-origin"></iframe>';
          openBtn = '<button class="att-open" data-tid="' + t.id + '" data-ai="' + ai + '">↗</button>';
        } else {
          inner = '<div class="att-txt">' + esc(a.body) + (a.body && a.body.length >= 4000 ? '\\n…' : '') + '</div>';
        }
        return '<div class="' + attCls + '"><div class="att-lbl">' + ATT_ICON + esc(a.label) + openBtn + '</div>' + inner + '</div>';
      }).join('') + '</div>';
    }

    var hasDetail = steps || errBlock || atts;

    return '<div class="tr" data-status="' + t.status + '" data-id="' + t.id + '">'
      + '<div class="ts">'
      + '<span class="dot ' + cls + '"></span>'
      + '<span class="tname">' + esc(t.title) + '</span>'
      + '<span class="tdur">' + fmt(t.duration) + '</span>'
      + '<div class="dbar-w"><div class="dbar ' + cls + '" style="width:' + t.durPct + '%"></div></div>'
      + (hasDetail ? EXI : '<span style="width:13px;flex-shrink:0"></span>')
      + '</div>'
      + (hasDetail ? '<div class="td">' + steps + errBlock + atts + '</div>' : '')
      + '</div>';
  }

  function groupBy(tests) {
    var map = [];
    var idx = {};
    tests.forEach(function(t) {
      var s = t.suite || '(root)';
      if (!(s in idx)) { idx[s] = map.length; map.push({ name: s, tests: [] }); }
      map[idx[s]].tests.push(t);
    });
    return map;
  }

  function renderGroups(filtered) {
    var container = document.getElementById('groups');
    var empty = document.getElementById('empty');
    if (!filtered.length) {
      container.innerHTML = '';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    var groups = groupBy(filtered);
    container.innerHTML = groups.map(function(g) {
      var passed  = g.tests.filter(function(t){return t.status==='passed';}).length;
      var failed  = g.tests.filter(function(t){return t.status==='failed';}).length;
      var skipped = g.tests.filter(function(t){return t.status==='skipped';}).length;
      var dur     = g.tests.reduce(function(a,b){return a+b.duration;},0);

      var badges = '';
      if (failed)  badges += '<span class="gbadge fail">'  + failed  + ' failed</span>';
      if (passed)  badges += '<span class="gbadge pass">'  + passed  + ' passed</span>';
      if (skipped) badges += '<span class="gbadge skip">'  + skipped + ' skipped</span>';
      badges += '<span class="gbadge total">' + g.tests.length + ' total</span>';

      return '<div class="group' + (failed ? ' has-fail' : '') + '">'
        + '<div class="gh">' + CHEV + '<span class="gname">' + esc(g.name) + '</span>'
        + '<div class="gbadges">' + badges + '</div>'
        + '<span class="gdur">' + fmt(dur) + '</span></div>'
        + '<div class="gbody">' + g.tests.map(renderTest).join('') + '</div>'
        + '</div>';
    }).join('');

    wireEvents();
  }

  function wireEvents() {
    // expand/collapse test detail
    document.querySelectorAll('.ts').forEach(function(el) {
      el.addEventListener('click', function() {
        var row = el.closest('.tr');
        var detail = row && row.querySelector('.td');
        if (!detail) return;
        var icon = el.querySelector('.exi');
        var open = detail.classList.toggle('open');
        if (icon) icon.classList.toggle('open', open);
      });
    });

    // copy error
    document.querySelectorAll('.copy-btn[data-tid]').forEach(function(btn) {
      btn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        var t = DATA.find(function(d){ return d.id === parseInt(btn.dataset.tid); });
        if (!t || !t.error) return;
        navigator.clipboard.writeText(t.error).then(function() {
          btn.textContent = 'Copied!';
          setTimeout(function(){ btn.textContent = 'Copy'; }, 1500);
        });
      });
    });

    // image lightbox
    document.querySelectorAll('[data-lb]').forEach(function(img) {
      img.addEventListener('click', function(ev) {
        ev.stopPropagation();
        document.getElementById('lbi').src = img.src;
        document.getElementById('lb').style.display = 'flex';
      });
    });

    // open HTML attachment in new tab
    document.querySelectorAll('.att-open[data-tid]').forEach(function(btn) {
      btn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        var t = DATA.find(function(d) { return d.id === parseInt(btn.dataset.tid); });
        var a = t && t.attachments[parseInt(btn.dataset.ai)];
        if (!a || !a.body) return;
        var blob = new Blob([a.body], { type: 'text/html' });
        var url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
      });
    });

    // auto-expand failed tests
    document.querySelectorAll('.tr[data-status="failed"]').forEach(function(row) {
      var detail = row.querySelector('.td');
      var icon   = row.querySelector('.exi');
      if (detail) detail.classList.add('open');
      if (icon)   icon.classList.add('open');
    });
  }

  // group collapse (event delegation — survives re-renders)
  document.addEventListener('click', function(ev) {
    var gh = ev.target.closest && ev.target.closest('.gh');
    if (!gh) return;
    var body  = gh.nextElementSibling;
    var chev  = gh.querySelector('.chev');
    var isOpen = body.style.display !== 'none' && body.style.display !== '';
    // first time display is '' (visible); toggle to 'none' then back
    body.style.display = isOpen ? 'none' : '';
    if (chev) chev.classList.toggle('open', !isOpen);
  });

  // filter buttons
  document.querySelectorAll('.fb').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.fb').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      activeFilter = btn.dataset.f;
      refresh();
    });
  });

  // search
  var searchEl = document.getElementById('s');
  var clearBtn = document.getElementById('sx');
  searchEl.addEventListener('input', function() {
    query = searchEl.value;
    if (clearBtn) clearBtn.classList.toggle('visible', query.length > 0);
    refresh();
  });
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      searchEl.value = ''; query = '';
      clearBtn.classList.remove('visible');
      refresh();
    });
  }

  // jump to failures
  var jumpBtn = document.getElementById('jf');
  if (jumpBtn) {
    jumpBtn.addEventListener('click', function() {
      document.querySelectorAll('.fb').forEach(function(b){
        b.classList.toggle('active', b.dataset.f === 'failed');
      });
      activeFilter = 'failed';
      refresh();
      var firstFail = document.querySelector('.group.has-fail');
      if (firstFail) firstFail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // lightbox close
  var lb = document.getElementById('lb');
  document.getElementById('lbc').addEventListener('click', function() { lb.style.display = 'none'; });
  lb.addEventListener('click', function(ev) {
    if (ev.target === lb) lb.style.display = 'none';
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape') lb.style.display = 'none';
  });

  function getFiltered() {
    return DATA.filter(function(t) {
      var fOk = activeFilter === 'all' || t.status === activeFilter;
      var qOk = !query || t.fullTitle.toLowerCase().indexOf(query.toLowerCase()) >= 0;
      return fOk && qOk;
    });
  }

  function refresh() { renderGroups(getFiltered()); }

  refresh();
}());
`;

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
    title: t.title,
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
  <style>${CSS}</style>
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
${JS}
</script>
</body>
</html>`;
}
