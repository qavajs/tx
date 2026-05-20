import { log, API_BASE, testApi, page, pwExpect, initIframe, setOnTabsChanged, getTabsSnapshot, createTab, closeTab, setActiveTab, closeExtraTabs, browser } from './browser';

declare global {
  interface Window {
    testApi: typeof testApi;
    runTestInBrowser: () => void;
    runTestOnServer:  () => void;
    runSuite:         (filename: string, suiteName: string) => void;
    runTest:          (filename: string, fullName: string) => void;
    toggleCard:       (filename: string) => void;
    runTestByFilename:(filename: string) => void;
    runAll:           () => void;
  }
}

window.testApi = testApi;

// ── Globals for test code — importable via `import { page, expect } from 'tx'`
// or accessible directly as globals (page, expect, browser, tx) ───────────────

(window as any).page    = page;
(window as any).expect  = pwExpect;
(window as any).browser = browser;
(window as any).tx      = { page, expect: pwExpect, browser, ...testApi };

// ── Command Log (panel UI) ────────────────────────────────────────────────────

function logSection(title: string) {
  const container = document.getElementById('console');
  if (!container) return;
  const hdr = document.createElement('div');
  hdr.className = 'tx-log-section';
  hdr.textContent = title;
  container.appendChild(hdr);
  container.scrollTop = container.scrollHeight;
}

function logResult(t: TestResult) {
  const container = document.getElementById('console');
  if (!container) return;
  const cls  = t.passed ? 'pass' : 'fail';
  const icon = t.passed ? '✓'   : '✗';
  const entry = document.createElement('div');
  entry.className = `tx-cmd ${cls}`;
  const iconEl = document.createElement('span'); iconEl.className = `tx-cmd-icon ${cls}`; iconEl.textContent = icon;
  const msgEl  = document.createElement('span'); msgEl.className  = 'tx-cmd-msg';         msgEl.textContent  = t.name + (t.error ? '  —  ' + t.error : '');
  const durEl  = document.createElement('span'); durEl.className  = 'tx-cmd-dur';          durEl.textContent  = t.duration + 'ms';
  entry.appendChild(iconEl); entry.appendChild(msgEl); entry.appendChild(durEl);
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

// ── Spec card helpers ─────────────────────────────────────────────────────────

function setCardRunning(filename: string) {
  const b = document.getElementById('badges-' + escAttr(filename));
  if (b) b.innerHTML = '<span class="tx-badge" style="color:var(--warn)">●</span>';
}

function updateCardStatus(filename: string, passed: number, failed: number) {
  const b = document.getElementById('badges-' + escAttr(filename));
  if (!b) return;
  b.innerHTML = (passed > 0 ? `<span class="tx-badge tx-badge--pass">${passed}</span>` : '')
              + (failed > 0 ? `<span class="tx-badge tx-badge--fail">${failed}</span>` : '');
}

function setTestItemStatus(filename: string, fullName: string, state: 'running'|'pass'|'fail', duration?: number) {
  const key = escAttr(filename + '\x01' + fullName);
  const item = document.querySelector<HTMLElement>(`[data-testkey="${key}"]`);
  if (!item) return;
  item.classList.remove('running', 'pass', 'fail');
  item.classList.add(state);
  const dot   = item.querySelector('.tx-test-dot');
  const badge = item.querySelector<HTMLElement>('.tx-test-badge');
  if (dot) { dot.classList.remove('running', 'pass', 'fail'); dot.classList.add(state); }
  if (badge) {
    badge.classList.remove('running', 'pass', 'fail');
    if (state === 'running') {
      badge.textContent = '';
    } else {
      badge.classList.add(state);
      badge.textContent = duration != null ? duration + 'ms' : (state === 'pass' ? 'PASS' : 'FAIL');
    }
  }
  refreshSuiteBadge(filename, item.dataset.suite ?? '');
}

function resetTestItems(filename: string) {
  const card = document.getElementById('card-' + escAttr(filename));
  card?.querySelectorAll('.tx-test-item, .tx-test-dot')
    .forEach(el => el.classList.remove('running', 'pass', 'fail'));
  card?.querySelectorAll<HTMLElement>('.tx-test-badge')
    .forEach(el => { el.className = 'tx-test-badge'; el.textContent = ''; });
  card?.querySelectorAll<HTMLElement>('.tx-suite-badges')
    .forEach(el => { el.innerHTML = ''; });
}

function refreshSuiteBadge(filename: string, suiteName: string) {
  const card = document.getElementById('card-' + escAttr(filename));
  if (!card) return;
  const items = Array.from(card.querySelectorAll<HTMLElement>('.tx-test-item')).filter(
    el => el.dataset.suite === suiteName
  );
  let pass = 0, fail = 0, running = 0;
  for (const item of items) {
    if (item.classList.contains('pass')) pass++;
    else if (item.classList.contains('fail')) fail++;
    else if (item.classList.contains('running')) running++;
  }
  const b = document.getElementById('sbadges-' + escAttr(filename + '\x01' + suiteName));
  if (!b) return;
  if (running > 0) {
    b.innerHTML = '<span class="tx-badge" style="color:var(--warn)">●</span>';
  } else {
    b.innerHTML = (pass > 0 ? `<span class="tx-badge tx-badge--pass">${pass}</span>` : '')
                + (fail > 0 ? `<span class="tx-badge tx-badge--fail">${fail}</span>` : '');
  }
}

function setTopbarStatus(state: 'ready'|'running'|'passed'|'failed', text: string) {
  const dot  = document.getElementById('statusIndicator');
  const span = document.getElementById('statusText');
  if (dot)  dot.className    = 'tx-status-dot ' + state;
  if (span) span.textContent = text;
}

// ── Spec list ─────────────────────────────────────────────────────────────────

interface ParsedTest { suite: string; name: string; }
interface ParsedFile { filename: string; tests: ParsedTest[]; }

async function loadTestList() {
  const container = document.getElementById('testList')!;
  try {
    const files = await fetch(API_BASE + '/api/tests').then(r => r.json()) as ParsedFile[];
    container.innerHTML = files.length
      ? files.map(renderTestFileCard).join('')
      : '<div class="tx-empty">No .js files in examples/</div>';
  } catch (e: any) {
    container.innerHTML = `<div class="tx-empty" style="color:var(--fail)">Failed to load specs<br>${e.message}</div>`;
  }
}

function renderTestFileCard(f: ParsedFile): string {
  const suites: Record<string, string[]> = Object.create(null);
  f.tests.forEach(t => {
    const k = t.suite || '(root)';
    if (!suites[k]) suites[k] = [];
    suites[k].push(t.name);
  });
  const suiteHtml = Object.entries(suites).map(([s, names]) =>
    '<div class="tx-suite-row">' +
      '<span class="tx-suite-name">' + escHtml(s) + '</span>' +
      '<span class="tx-suite-badges" id="sbadges-' + escAttr(f.filename + '\x01' + s) + '"></span>' +
      '<button class="tx-suite-run-btn" onclick="window.runSuite(' + jsq(f.filename) + ',' + jsq(s) + ')">&#9654;</button>' +
    '</div>' + names.map(n => {
      const fullName = s === '(root)' ? n : s + ' > ' + n;
      return '<div class="tx-test-item" data-testkey="' + escAttr(f.filename + '\x01' + fullName) + '" data-suite="' + escHtml(s) + '">' +
        '<span class="tx-test-dot"></span>' +
        '<span class="tx-test-name">' + escHtml(n) + '</span>' +
        '<span class="tx-test-badge"></span>' +
        '<button class="tx-test-run-btn" onclick="event.stopPropagation();window.runTest(' + jsq(f.filename) + ',' + jsq(fullName) + ')">&#9654;</button>' +
      '</div>';
    }).join('')
  ).join('');
  const ext  = f.filename.split('.').pop() ?? 'js';
  const stem = f.filename.slice(0, -(ext.length + 1));
  return '<div class="tx-spec-card" id="card-' + escAttr(f.filename) + '" data-filename="' + escHtml(f.filename) + '">' +
    '<div class="tx-spec-hdr" onclick="window.toggleCard(' + jsq(f.filename) + ')">' +
      '<span class="tx-spec-chevron">&#9658;</span>' +
      '<span class="tx-spec-filename">' + escHtml(f.filename) + '</span>' +
      '<button class="tx-spec-run-btn" onclick="event.stopPropagation();window.runTestByFilename(' + jsq(f.filename) + ')">&#9654;</button>' +
    '</div>' +
    (Object.keys(suites).length ? '<div class="tx-spec-body">' + suiteHtml + '</div>' : '') +
    '</div>';
}

window.toggleCard = (filename: string) =>
  document.getElementById('card-' + filename)?.classList.toggle('open');

// ── Test execution ────────────────────────────────────────────────────────────

interface TestResult { name: string; passed: boolean; error?: string; duration: number; }

async function executeTests(code: string, opts?: { filterSuite?: string; filterTest?: string; filename?: string }): Promise<TestResult[]> {
  const filterSuite = opts?.filterSuite;
  const filterTest  = opts?.filterTest;
  const filename    = opts?.filename;
  const queue: Array<{ name: string; fn: () => any; beforeEachs: Array<() => any>; afterEachs: Array<() => any> }> = [];
  const stack: string[] = [];
  const hookStack: Array<{ beforeEachs: Array<() => any>; afterEachs: Array<() => any> }> = [];

  const beforeEach = (fn: () => any) => {
    if (hookStack.length) hookStack[hookStack.length - 1].beforeEachs.push(fn);
  };
  const afterEach = (fn: () => any) => {
    if (hookStack.length) hookStack[hookStack.length - 1].afterEachs.push(fn);
  };

  const it = (name: string, fn: () => any) => {
    const suite    = stack.join(' > ');
    const fullName = stack.length ? suite + ' > ' + name : name;
    if (filterSuite && suite !== filterSuite) return;
    if (filterTest && fullName !== filterTest) return;
    const beforeEachs = hookStack.flatMap(s => s.beforeEachs);
    const afterEachs  = hookStack.flatMap(s => s.afterEachs).reverse();
    queue.push({ name: fullName, fn, beforeEachs, afterEachs });
  };
  const describe = (name: string, fn: () => void) => {
    stack.push(name);
    hookStack.push({ beforeEachs: [], afterEachs: [] });
    try { fn(); } finally { stack.pop(); hookStack.pop(); }
  };

  // Expose execution-scoped helpers on window so the bundled IIFE can resolve them
  // without needing Function-parameter injection.
  (window as any).describe   = describe;
  (window as any).it         = it;
  (window as any).test       = it;
  (window as any).beforeEach = beforeEach;
  (window as any).afterEach  = afterEach;

  try {
    // eslint-disable-next-line no-new-func
    new Function(code)();
  } catch (e: any) {
    return [{ name: '(parse/compile error)', passed: false, error: e.message, duration: 0 }];
  }

  const results: TestResult[] = [];
  for (const t of queue) {
    if (filename) setTestItemStatus(filename, t.name, 'running');
    const t0 = Date.now();
    try {
      closeExtraTabs();
      for (const hook of t.beforeEachs) await Promise.resolve(hook());
      await Promise.resolve(t.fn());
      for (const hook of t.afterEachs) await Promise.resolve(hook());
      const dur = Date.now() - t0;
      results.push({ name: t.name, passed: true, duration: dur });
      if (filename) setTestItemStatus(filename, t.name, 'pass', dur);
    } catch (e: any) {
      const dur = Date.now() - t0;
      results.push({ name: t.name, passed: false, error: e.message, duration: dur });
      if (filename) setTestItemStatus(filename, t.name, 'fail', dur);
    }
  }
  return results;
}

function reportToServer(results: TestResult[], filename?: string): void {
  fetch(API_BASE + '/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, tests: results }),
  }).catch(() => { /* non-critical */ });
}

function renderTestResults(results: TestResult[], filename?: string) {
  if (filename) logSection(filename);
  let passed = 0, failed = 0;
  results.forEach(t => { logResult(t); t.passed ? passed++ : failed++; });
  const status = document.getElementById('testRunnerStatus');
  if (status) {
    status.textContent = `${passed} passed, ${failed} failed`;
    status.style.color = failed === 0 ? 'var(--pass)' : 'var(--fail)';
  }
  if (filename) updateCardStatus(filename, passed, failed);
}

// ── Window actions ────────────────────────────────────────────────────────────

window.runTestByFilename = async (filename: string) => {
  document.getElementById('card-' + escAttr(filename))?.classList.add('open');
  resetTestItems(filename);
  setCardRunning(filename);
  log(`run  ${filename}`, 'info');
  try {
    const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const results = await executeTests(await resp.text(), { filename });
    renderTestResults(results, filename);
    reportToServer(results, filename);
  } catch (e: any) {
    log('Error: ' + e.message, 'error');
    updateCardStatus(filename, 0, 1);
  }
};

window.runSuite = async (filename: string, suiteName: string) => {
  document.getElementById('card-' + escAttr(filename))?.classList.add('open');
  resetTestItems(filename);
  setCardRunning(filename);
  log(`suite  "${suiteName}"  in ${filename}`, 'info');
  try {
    const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const results = await executeTests(await resp.text(), { filterSuite: suiteName, filename });
    renderTestResults(results, filename);
    reportToServer(results, filename);
  } catch (e: any) {
    log('Error: ' + e.message, 'error');
    updateCardStatus(filename, 0, 1);
  }
};

window.runTest = async (filename: string, fullName: string) => {
  document.getElementById('card-' + escAttr(filename))?.classList.add('open');
  setTestItemStatus(filename, fullName, 'running');
  setCardRunning(filename);
  log(`it  "${fullName}"`, 'info');
  try {
    const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const results = await executeTests(await resp.text(), { filterTest: fullName, filename });
    renderTestResults(results, filename);
    reportToServer(results, filename);
  } catch (e: any) {
    log('Error: ' + e.message, 'error');
    setTestItemStatus(filename, fullName, 'fail');
  }
};

window.runAll = async () => {
  const btn = document.getElementById('runAllBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  setTopbarStatus('running', 'Running…');
  let totalPass = 0, totalFail = 0;
  for (const card of Array.from(document.querySelectorAll<HTMLElement>('.tx-spec-card[data-filename]'))) {
    const filename = card.dataset.filename!;
    document.getElementById('card-' + escAttr(filename))?.classList.add('open');
    resetTestItems(filename);
    setCardRunning(filename);
    log(`run  ${filename}`, 'info');
    try {
      const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const results = await executeTests(await resp.text(), { filename });
      renderTestResults(results, filename);
      reportToServer(results, filename);
      results.forEach(r => r.passed ? totalPass++ : totalFail++);
    } catch (e: any) {
      log('Error: ' + e.message, 'error');
      updateCardStatus(filename, 0, 1);
      totalFail++;
    }
  }
  setTopbarStatus(totalFail === 0 ? 'passed' : 'failed', `${totalPass} passed, ${totalFail} failed`);
  if (btn) btn.disabled = false;
};

window.runTestInBrowser = async () => {
  const input = document.getElementById('testFileInput') as HTMLInputElement;
  const file  = input.files?.[0];
  if (!file) { log('Select a .js file first', 'error'); return; }
  log(`run  ${file.name}  (browser)`, 'info');
  renderTestResults(await executeTests(await file.text()), file.name);
};

window.runTestOnServer = async () => {
  const input = document.getElementById('testFileInput') as HTMLInputElement;
  const file  = input.files?.[0];
  if (!file) { log('Select a .js file first', 'error'); return; }
  log(`upload  ${file.name}  → server`, 'info');
  try {
    const resp = await fetch(API_BASE + '/api/run-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: await file.text() }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json() as any;
    if (data.error) throw new Error(data.error);
    renderTestResults(data.tests, file.name);
    log(`server: ${data.passed} passed, ${data.failed} failed (${data.duration}ms)`,
      data.failed === 0 ? 'success' : 'error');
  } catch (e: any) {
    log('Server error: ' + e.message, 'error');
  }
};

// ── HTML helpers ──────────────────────────────────────────────────────────────

function escHtml(s: string) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s: string) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '_');
}
function jsq(s: string) {
  return JSON.stringify(s).replace(/"/g, '&quot;');
}

// ── File-change polling ───────────────────────────────────────────────────────

let _watchVersion = -1;

async function pollUpdates() {
  try {
    const { version } = await fetch(API_BASE + '/api/version').then(r => r.json()) as { version: number };
    if (_watchVersion < 0) {
      _watchVersion = version;
    } else if (version !== _watchVersion) {
      _watchVersion = version;
      await loadTestList();
      log('test files updated', 'info');
    }
  } catch { /* server not ready yet */ }
  setTimeout(pollUpdates, 2000);
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function renderTabBar() {
  const bar = document.getElementById('tabBar');
  if (!bar) return;
  bar.innerHTML = '';
  for (const t of getTabsSnapshot()) {
    const item = document.createElement('div');
    item.className = 'tx-tab-item' + (t.active ? ' active' : '');
    item.onclick = () => setActiveTab(t.id);
    const title = document.createElement('span');
    title.className = 'tx-tab-title';
    title.textContent = t.title || t.url || 'New Tab';
    title.title = t.url || '';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tx-tab-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close tab';
    closeBtn.onclick = (e) => { e.stopPropagation(); closeTab(t.id); };
    item.appendChild(title);
    item.appendChild(closeBtn);
    bar.appendChild(item);
  }
  const newBtn = document.createElement('button');
  newBtn.className = 'tx-new-tab-btn';
  newBtn.title = 'New tab';
  newBtn.textContent = '+';
  newBtn.onclick = () => createTab();
  bar.appendChild(newBtn);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  log('tx ready', 'info');
  setOnTabsChanged(renderTabBar);
  initIframe();
  renderTabBar();
  loadTestList();
  pollUpdates();
});
