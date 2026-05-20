import { log, API_BASE, testApi, page, pwExpect, initIframe, setOnTabsChanged, getTabsSnapshot, createTab, closeTab, setActiveTab, closeExtraTabs, browser, getSnapshots, clearSnapshots } from './browser';

declare global {
  interface Window {
    testApi: typeof testApi;
    runTestInBrowser: () => void;
    runTestOnServer:  () => void;
    runSuite:         (filename: string, suiteName: string) => void;
    runTest:          (filename: string, fullName: string) => void;
    toggleCard:       (filename: string) => void;
    runTestByFilename:(filename: string) => void;
    runAll:           () => Promise<{ passed: number; failed: number }>;
    applyFilter:      (query: string) => void;
    runFiltered:      () => Promise<void>;
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
  const firstLine = t.error ? t.error.split('\n')[0] : '';
  const msgEl  = document.createElement('span'); msgEl.className  = 'tx-cmd-msg';  msgEl.textContent = t.name + (firstLine ? '  —  ' + firstLine : '');
  const durEl  = document.createElement('span'); durEl.className  = 'tx-cmd-dur';  durEl.textContent = t.duration + 'ms';
  entry.appendChild(iconEl); entry.appendChild(msgEl); entry.appendChild(durEl);
  container.appendChild(entry);
  if (!t.passed && t.error && t.error.includes('\n')) {
    const stackEl = document.createElement('pre');
    stackEl.className = 'tx-cmd-stack';
    stackEl.textContent = t.error;
    container.appendChild(stackEl);
  }
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

function setTopbarStatus(state: 'ready'|'running'|'passed'|'failed'|'connected'|'disconnected', text: string) {
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
      return '<div class="tx-test-item" data-testkey="' + escAttr(f.filename + '\x01' + fullName) + '" data-suite="' + escHtml(s) + '" data-fullname="' + escHtml(fullName) + '">' +
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
      '<span class="tx-spec-filename">' + escHtml(stem) + '<span class="ext">.' + escHtml(ext) + '</span></span>' +
      '<button class="tx-spec-run-btn" onclick="event.stopPropagation();window.runTestByFilename(' + jsq(f.filename) + ')">&#9654;</button>' +
    '</div>' +
    (Object.keys(suites).length ? '<div class="tx-spec-body">' + suiteHtml + '</div>' : '') +
    '</div>';
}

window.toggleCard = (filename: string) =>
  document.getElementById('card-' + filename)?.classList.toggle('open');

// ── Test execution ────────────────────────────────────────────────────────────

interface TestResult { name: string; passed: boolean; error?: string; duration: number; }

async function executeTests(code: string, opts?: { filterSuite?: string; filterTest?: string; filterTests?: string[]; filename?: string }): Promise<TestResult[]> {
  const filterSuite  = opts?.filterSuite;
  const filterTest   = opts?.filterTest;
  const filterTests  = opts?.filterTests;
  const filename     = opts?.filename;
  type QueueItem = {
    name: string; fn: () => any;
    beforeEachs: Array<() => any>; afterEachs: Array<() => any>;
    setupBeforeAlls: Array<() => any>; teardownAfterAlls: Array<() => any>;
  };
  const queue: QueueItem[] = [];
  const stack: string[] = [];
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
    const suite    = stack.join(' > ');
    const fullName = stack.length ? suite + ' > ' + name : name;
    if (filterSuite && suite !== filterSuite) return;
    if (filterTest && fullName !== filterTest) return;
    if (filterTests && !filterTests.includes(fullName)) return;
    const beforeEachs = hookStack.flatMap(s => s.beforeEachs);
    const afterEachs  = hookStack.flatMap(s => s.afterEachs).reverse();
    queue.push({ name: fullName, fn, beforeEachs, afterEachs, setupBeforeAlls: [], teardownAfterAlls: [] });
  };
  const describe = (name: string, fn: () => void) => {
    stack.push(name);
    hookStack.push({ beforeEachs: [], afterEachs: [], beforeAlls: [], afterAlls: [] });
    const lenBefore = queue.length;
    try { fn(); } finally {
      const scope = hookStack[hookStack.length - 1];
      const scopeTests = queue.slice(lenBefore);
      if (scopeTests.length > 0) {
        // Prepend so outer beforeAlls run before inner ones
        if (scope.beforeAlls.length) scopeTests[0].setupBeforeAlls = [...scope.beforeAlls, ...scopeTests[0].setupBeforeAlls];
        // Append so inner afterAlls run before outer ones
        if (scope.afterAlls.length) scopeTests[scopeTests.length - 1].teardownAfterAlls = [...scopeTests[scopeTests.length - 1].teardownAfterAlls, ...scope.afterAlls];
      }
      stack.pop();
      hookStack.pop();
    }
  };

  // Expose execution-scoped helpers on window so the bundled IIFE can resolve them
  // without needing Function-parameter injection.
  (window as any).describe   = describe;
  (window as any).it         = it;
  (window as any).test       = it;
  (window as any).beforeEach = beforeEach;
  (window as any).afterEach  = afterEach;
  (window as any).beforeAll  = beforeAll;
  (window as any).afterAll   = afterAll;

  try {
    // eslint-disable-next-line no-new-func
    new Function(code)();
  } catch (e: any) {
    return [{ name: '(parse/compile error)', passed: false, error: e.stack || e.message, duration: 0 }];
  }

  const results: TestResult[] = [];
  for (const t of queue) {
    if (filename) setTestItemStatus(filename, t.name, 'running');
    const t0 = Date.now();
    try {
      closeExtraTabs();
      for (const hook of t.setupBeforeAlls) await Promise.resolve(hook());
      for (const hook of t.beforeEachs) await Promise.resolve(hook());
      await Promise.resolve(t.fn());
      for (const hook of t.afterEachs) await Promise.resolve(hook());
      for (const hook of t.teardownAfterAlls) await Promise.resolve(hook());
      const dur = Date.now() - t0;
      results.push({ name: t.name, passed: true, duration: dur });
      if (filename) setTestItemStatus(filename, t.name, 'pass', dur);
    } catch (e: any) {
      const dur = Date.now() - t0;
      results.push({ name: t.name, passed: false, error: e.stack || e.message, duration: dur });
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

async function notifyRunBegin(specs: Array<{ file: string; tests: string[] | null }>): Promise<void> {
  await fetch(API_BASE + '/api/run-begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ specs }),
  }).catch(() => {});
}

function notifyRunEnd(passed: number, failed: number, total: number, duration: number): void {
  fetch(API_BASE + '/api/run-end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passed, failed, total, duration }),
  }).catch(() => {});
}

function renderTestResults(results: TestResult[], filename?: string) {
  if (filename) logSection(filename);
  let passed = 0, failed = 0;
  results.forEach(t => { logResult(t); t.passed ? passed++ : failed++; });
  const status = document.getElementById('testRunnerStatus');
  if (status) {
    status.innerHTML =
      `<span class="tx-runner-pass">&#10003;&nbsp;${passed} passed</span>` +
      (failed > 0 ? `<span class="tx-runner-fail">&#10007;&nbsp;${failed} failed</span>` : '');
  }
  if (filename) updateCardStatus(filename, passed, failed);
}

// ── Window actions ────────────────────────────────────────────────────────────

window.runTestByFilename = async (filename: string) => {
  document.getElementById('card-' + escAttr(filename))?.classList.add('open');
  resetTestItems(filename);
  setCardRunning(filename);
  log(`run  ${filename}`, 'info');
  await notifyRunBegin([{ file: filename, tests: null }]);
  try {
    const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const results = await executeTests(await resp.text(), { filename });
    renderTestResults(results, filename);
    reportToServer(results, filename);
    const passed = results.filter(r => r.passed).length;
    notifyRunEnd(passed, results.length - passed, results.length, results.reduce((s, r) => s + r.duration, 0));
  } catch (e: any) {
    log('Error: ' + e.message, 'error');
    updateCardStatus(filename, 0, 1);
    notifyRunEnd(0, 1, 1, 0);
  }
};

window.runSuite = async (filename: string, suiteName: string) => {
  document.getElementById('card-' + escAttr(filename))?.classList.add('open');
  resetTestItems(filename);
  setCardRunning(filename);
  log(`suite  "${suiteName}"  in ${filename}`, 'info');
  const _suiteTests = Array.from(
    document.getElementById('card-' + escAttr(filename))
      ?.querySelectorAll<HTMLElement>('.tx-test-item') ?? []
  ).filter(el => el.dataset.suite === suiteName).map(el => el.dataset.fullname!).filter(Boolean);
  await notifyRunBegin([{ file: filename, tests: _suiteTests.length ? _suiteTests : null }]);
  try {
    const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const results = await executeTests(await resp.text(), { filterSuite: suiteName, filename });
    renderTestResults(results, filename);
    reportToServer(results, filename);
    const passed = results.filter(r => r.passed).length;
    notifyRunEnd(passed, results.length - passed, results.length, results.reduce((s, r) => s + r.duration, 0));
  } catch (e: any) {
    log('Error: ' + e.message, 'error');
    updateCardStatus(filename, 0, 1);
    notifyRunEnd(0, 1, 1, 0);
  }
};

window.runTest = async (filename: string, fullName: string) => {
  document.getElementById('card-' + escAttr(filename))?.classList.add('open');
  setTestItemStatus(filename, fullName, 'running');
  setCardRunning(filename);
  log(`it  "${fullName}"`, 'info');
  await notifyRunBegin([{ file: filename, tests: [fullName] }]);
  try {
    const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const results = await executeTests(await resp.text(), { filterTest: fullName, filename });
    renderTestResults(results, filename);
    reportToServer(results, filename);
    const passed = results.filter(r => r.passed).length;
    notifyRunEnd(passed, results.length - passed, results.length, results.reduce((s, r) => s + r.duration, 0));
  } catch (e: any) {
    log('Error: ' + e.message, 'error');
    setTestItemStatus(filename, fullName, 'fail');
    notifyRunEnd(0, 1, 1, 0);
  }
};

window.runAll = async (): Promise<{ passed: number; failed: number }> => {
  const btn = document.getElementById('runAllBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  _isTestRunning = true;
  setTopbarStatus('running', 'Running…');
  const allCards = Array.from(document.querySelectorAll<HTMLElement>('.tx-spec-card[data-filename]'));
  const allFilenames = allCards.map(c => c.dataset.filename!);
  await notifyRunBegin(allFilenames.map(f => ({ file: f, tests: null })));
  let totalPass = 0, totalFail = 0, totalDuration = 0;
  for (const card of allCards) {
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
      results.forEach(r => { r.passed ? totalPass++ : totalFail++; totalDuration += r.duration; });
    } catch (e: any) {
      log('Error: ' + e.message, 'error');
      updateCardStatus(filename, 0, 1);
      totalFail++;
    }
  }
  notifyRunEnd(totalPass, totalFail, totalPass + totalFail, totalDuration);
  _isTestRunning = false;
  setTopbarStatus(totalFail === 0 ? 'passed' : 'failed', `${totalPass} passed, ${totalFail} failed`);
  if (btn) btn.disabled = false;
  return { passed: totalPass, failed: totalFail };
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
let _isTestRunning = false;

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
    if (!_isTestRunning) setTopbarStatus('connected', 'Connected');
  } catch {
    if (!_isTestRunning) setTopbarStatus('disconnected', 'Disconnected');
  }
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

let _selectedSnapshotId: number | null = null;
let _activeBrowserView: 'browser' | 'snapshot' = 'browser';

function formatSnapshotTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function setBrowserView(view: 'browser' | 'snapshot') {
  _activeBrowserView = view;
  renderBrowserView();
}

function applySnapshotViewport() {
  const frame = document.getElementById('snapshotFrame') as HTMLIFrameElement | null;
  const wrapper = document.getElementById('snapshotViewportWrapper') as HTMLElement | null;
  const tag = document.getElementById('snapshotViewportTag') as HTMLElement | null;
  if (!frame || !wrapper) return;

  const snapshot = _selectedSnapshotId != null
    ? getSnapshots().find(s => s.id === _selectedSnapshotId)
    : undefined;
  const vp = snapshot?.viewport ?? (window as any).__CONFIG__?.viewport;

  if (!vp?.width || !vp?.height) {
    frame.style.position = '';
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.transform = '';
    frame.style.transformOrigin = '';
    if (tag) tag.textContent = '—';
    return;
  }

  const cw = wrapper.clientWidth;
  const ch = wrapper.clientHeight;
  if (!cw || !ch) return;

  const scale = Math.min(cw / vp.width, ch / vp.height);
  const ox = (cw - vp.width * scale) / 2;
  const oy = (ch - vp.height * scale) / 2;

  frame.style.position = 'absolute';
  frame.style.top = '0';
  frame.style.left = '0';
  frame.style.width = vp.width + 'px';
  frame.style.height = vp.height + 'px';
  frame.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
  frame.style.transformOrigin = 'top left';
  if (tag) tag.textContent = `${vp.width} × ${vp.height} @ ${Math.round(scale * 100)}%`;
}

function renderBrowserView() {
  const livePane = document.getElementById('liveBrowserPane');
  const snapshotPane = document.getElementById('snapshotPane');
  if (livePane && snapshotPane) {
    livePane.classList.toggle('tx-browser-pane--hidden', _activeBrowserView !== 'browser');
    snapshotPane.classList.toggle('tx-browser-pane--hidden', _activeBrowserView !== 'snapshot');
  }
  if (_activeBrowserView === 'snapshot') applySnapshotViewport();
}

function openSnapshot(id: number) {
  const snapshot = getSnapshots().find(item => item.id === id);
  const frame = document.getElementById('snapshotFrame') as HTMLIFrameElement | null;
  if (!snapshot || !frame) return;
  const titleEl = document.getElementById('snapshotTitle');
  const urlEl = document.getElementById('snapshotUrl');
  if (titleEl) titleEl.textContent = snapshot.label || snapshot.title || 'Snapshot';
  if (urlEl) urlEl.textContent = `${snapshot.url} · ${formatSnapshotTime(snapshot.timestamp)}`;
  frame.srcdoc = snapshot.html;
  _selectedSnapshotId = id;
  setBrowserView('snapshot');
  applySnapshotViewport();
}

(window as any).clearSnapshots = () => {
  clearSnapshots();
  _selectedSnapshotId = null;
  setBrowserView('browser');
};

(window as any).setBrowserView = setBrowserView;

// ── Filter ────────────────────────────────────────────────────────────────────

window.applyFilter = (query: string) => {
  const q = query.trim().toLowerCase();
  const runBtn = document.getElementById('filterRunBtn') as HTMLButtonElement | null;
  if (runBtn) runBtn.style.display = q ? 'flex' : 'none';

  for (const card of document.querySelectorAll<HTMLElement>('.tx-spec-card[data-filename]')) {
    let cardHasMatch = false;

    for (const item of card.querySelectorAll<HTMLElement>('.tx-test-item')) {
      const name = item.querySelector('.tx-test-name')?.textContent?.toLowerCase() ?? '';
      const matches = !q || name.includes(q);
      item.style.display = matches ? '' : 'none';
      if (matches) cardHasMatch = true;
    }

    for (const suiteRow of card.querySelectorAll<HTMLElement>('.tx-suite-row')) {
      const suiteName = suiteRow.querySelector<HTMLElement>('.tx-suite-name')?.textContent ?? '';
      const hasSuiteVisible = Array.from(card.querySelectorAll<HTMLElement>('.tx-test-item'))
        .some(item => item.dataset.suite === suiteName && item.style.display !== 'none');
      suiteRow.style.display = !q || hasSuiteVisible ? '' : 'none';
    }

    card.style.display = !q || cardHasMatch ? '' : 'none';
    if (q && cardHasMatch) card.classList.add('open');
  }
};

window.runFiltered = async () => {
  const btn = document.getElementById('filterRunBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  _isTestRunning = true;
  setTopbarStatus('running', 'Running…');
  let totalPass = 0, totalFail = 0, totalDuration = 0;

  const byFile = new Map<string, string[]>();
  for (const item of document.querySelectorAll<HTMLElement>('.tx-test-item')) {
    if (item.style.display === 'none') continue;
    const card = item.closest<HTMLElement>('.tx-spec-card[data-filename]');
    if (!card?.dataset.filename) continue;
    const fullName = item.dataset.fullname!;
    const list = byFile.get(card.dataset.filename) ?? [];
    list.push(fullName);
    byFile.set(card.dataset.filename, list);
  }

  await notifyRunBegin(Array.from(byFile.entries()).map(([file, tests]) => ({ file, tests })));

  for (const [filename, testNames] of byFile) {
    document.getElementById('card-' + escAttr(filename))?.classList.add('open');
    resetTestItems(filename);
    setCardRunning(filename);
    log(`run filtered  ${filename}`, 'info');
    try {
      const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const results = await executeTests(await resp.text(), { filename, filterTests: testNames });
      renderTestResults(results, filename);
      reportToServer(results, filename);
      results.forEach(r => { r.passed ? totalPass++ : totalFail++; totalDuration += r.duration; });
    } catch (e: any) {
      log('Error: ' + e.message, 'error');
      updateCardStatus(filename, 0, 1);
      totalFail++;
    }
  }

  notifyRunEnd(totalPass, totalFail, totalPass + totalFail, totalDuration);
  _isTestRunning = false;
  setTopbarStatus(totalFail === 0 ? 'passed' : 'failed', `${totalPass} passed, ${totalFail} failed`);
  if (btn) btn.disabled = false;
};

// ── Panel resizing ────────────────────────────────────────────────────────────

function initResizers() {
  const specs = document.querySelector<HTMLElement>('.tx-specs');
  const log   = document.querySelector<HTMLElement>('.tx-log-panel');
  const specsHandle = document.getElementById('specsResizer');
  const logHandle   = document.getElementById('logResizer');
  if (!specs || !log || !specsHandle || !logHandle) return;

  const saved = {
    specs: Number(localStorage.getItem('tx-specs-w') || 0),
    log:   Number(localStorage.getItem('tx-log-w')   || 0),
  };
  if (saved.specs) specs.style.width = saved.specs + 'px';
  if (saved.log)   log.style.width   = saved.log   + 'px';

  function attach(handle: HTMLElement, target: HTMLElement, key: string, min: number, max: number) {
    handle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      handle.classList.add('dragging');
      document.body.style.cursor    = 'col-resize';
      document.body.style.userSelect = 'none';
      const startX = e.clientX;
      const startW = target.offsetWidth;
      const onMove = (ev: MouseEvent) => {
        target.style.width = Math.min(max, Math.max(min, startW + ev.clientX - startX)) + 'px';
      };
      const onUp = () => {
        handle.classList.remove('dragging');
        document.body.style.cursor    = '';
        document.body.style.userSelect = '';
        localStorage.setItem(key, String(target.offsetWidth));
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  attach(specsHandle, specs, 'tx-specs-w', 150, 500);
  attach(logHandle,   log,   'tx-log-w',   180, 600);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  log('tx ready', 'info');
  setOnTabsChanged(renderTabBar);
  initIframe();
  renderTabBar();
  renderBrowserView();
  const consoleEl = document.getElementById('console');
  if (consoleEl) {
    consoleEl.addEventListener('click', (event: MouseEvent) => {
      let el = event.target as HTMLElement | null;
      while (el && !el.classList.contains('tx-cmd')) el = el.parentElement;
      const id = el?.dataset.snapshotId ? Number(el.dataset.snapshotId) : null;
      if (id) openSnapshot(id);
    });
  }
  initResizers();
  const snapshotWrapper = document.getElementById('snapshotViewportWrapper');
  if (snapshotWrapper) {
    new ResizeObserver(() => { if (_activeBrowserView === 'snapshot') applySnapshotViewport(); })
      .observe(snapshotWrapper);
  }
  await loadTestList();
  pollUpdates();
  if (window.__CONFIG__.autorun) {
    const { passed, failed } = await window.runAll();
    fetch(API_BASE + '/api/done', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passed, failed }),
    }).catch(() => {});
  }
});
