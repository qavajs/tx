import { log, setLogContainer, API_BASE, testApi, page, pwExpect, initIframe, setOnTabsChanged, getTabsSnapshot, createTab, closeTab, setActiveTab, closeExtraTabs, browser, getSnapshots, clearSnapshots } from './browser';

declare global {
  interface Window {
    testApi: typeof testApi;
    runTestInBrowser: () => void;
    runTestOnServer:  () => void;
    runSuite:         (filename: string, suiteName: string) => void;
    runTest:          (filename: string, fullName: string) => void;
    toggleCard:       (filename: string) => void;
    toggleSuite:      (filename: string, suiteName: string) => void;
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

// ── Inline test log ───────────────────────────────────────────────────────────

function activateTestLog(filename: string, fullName: string) {
  const key = escAttr(filename + '\x01' + fullName);
  const el = document.getElementById('tlog-' + key) as HTMLElement | null;
  if (!el) return;
  el.innerHTML = '';
  el.classList.add('open');
  setLogContainer(el);
}

function appendErrorToLog(error: string) {
  const el = document.querySelector<HTMLElement>('.tx-test-log.open');
  if (!el) return;
  const firstLine = error.split('\n')[0];
  const child = document.createElement('div');
  child.className = 'tx-cmd tx-cmd--result tx-cmd--child fail';
  child.innerHTML =
    '<div class="tx-cmd-num"></div>' +
    '<div class="tx-cmd-expander-col"></div>' +
    '<div class="tx-cmd-pin">' +
      '<span class="tx-cmd-msg tx-cmd-msg--error">' + escHtml(firstLine) + '</span>' +
    '</div>';
  el.appendChild(child);
  if (error.includes('\n')) {
    const stackEl = document.createElement('pre');
    stackEl.className = 'tx-cmd-stack';
    stackEl.textContent = error;
    el.appendChild(stackEl);
  }
  el.scrollTop = el.scrollHeight;
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
  card?.querySelectorAll<HTMLElement>('.tx-test-log')
    .forEach(el => { el.innerHTML = ''; el.classList.remove('open'); });
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
interface ParsedFile { filename: string; relPath?: string; tests: ParsedTest[]; }

async function loadTestList() {
  const container = document.getElementById('testList')!;
  try {
    const files = (await fetch(API_BASE + '/api/tests').then(r => r.json()) as ParsedFile[])
      .sort((a, b) => a.filename.localeCompare(b.filename));
    container.innerHTML = files.length
      ? files.map(renderTestFileCard).join('')
      : '<div class="tx-empty">No .js files in examples/</div>';
  } catch (e: any) {
    container.innerHTML = `<div class="tx-empty" style="color:var(--fail)">Failed to load specs<br>${e.message}</div>`;
  }
}

function renderTestItemHtml(filename: string, suite: string, name: string): string {
  const fullName = suite === '(root)' ? name : suite + ' > ' + name;
  const stateIcons =
    '<svg class="tx-state-svg tx-state-svg--idle" width="12" height="12" viewBox="0 0 16 16" fill="none">' +
      '<path d="M5 8h6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
    '</svg>' +
    '<svg class="tx-state-svg tx-state-svg--pass" width="12" height="12" viewBox="0 0 16 16" fill="none">' +
      '<path d="M4 8.667L7.333 12L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>' +
    '<svg class="tx-state-svg tx-state-svg--fail" width="12" height="12" viewBox="0 0 16 16" fill="none">' +
      '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>' +
    '<svg class="tx-state-svg tx-state-svg--running" width="12" height="12" viewBox="0 0 16 16" fill="none">' +
      '<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="2"/>' +
    '</svg>';
  const key = escAttr(filename + '\x01' + fullName);
  return '<div class="tx-test-item"' +
    ' data-testkey="' + key + '"' +
    ' data-suite="' + escHtml(suite) + '"' +
    ' data-fullname="' + escHtml(fullName) + '">' +
    '<span class="tx-test-chevron">&#9658;</span>' +
    '<span class="tx-test-dot">' + stateIcons + '</span>' +
    '<span class="tx-test-name">' + escHtml(name) + '</span>' +
    '<span class="tx-test-badge"></span>' +
    '<button class="tx-test-run-btn" onclick="event.stopPropagation();window.runTest(' + jsq(filename) + ',' + jsq(fullName) + ')">&#9654;</button>' +
  '</div>' +
  '<div class="tx-test-log" id="tlog-' + key + '"></div>';
}

function renderSuiteHtml(filename: string, suite: string, names: string[]): string {
  const key = escAttr(filename + '\x01' + suite);
  return '<div class="tx-suite-row" data-suite-key="' + key + '" onclick="window.toggleSuite(' + jsq(filename) + ',' + jsq(suite) + ')">' +
    '<span class="tx-suite-chevron">&#9658;</span>' +
    '<span class="tx-suite-name">' + escHtml(suite) + '</span>' +
    '<span class="tx-suite-badges" id="sbadges-' + key + '"></span>' +
    '<button class="tx-suite-run-btn" onclick="event.stopPropagation();window.runSuite(' + jsq(filename) + ',' + jsq(suite) + ')">&#9654;</button>' +
  '</div>' + names.map(n => renderTestItemHtml(filename, suite, n)).join('');
}

function renderTestFileCard(f: ParsedFile): string {
  const suites: Record<string, string[]> = Object.create(null);
  f.tests.forEach(t => {
    const k = t.suite || '(root)';
    if (!suites[k]) suites[k] = [];
    suites[k].push(t.name);
  });
  const suiteHtml = Object.entries(suites).map(([s, names]) => renderSuiteHtml(f.filename, s, names)).join('');
  const display  = f.relPath ?? f.filename;
  const ext      = display.split('.').pop() ?? 'js';
  const noExt    = display.slice(0, -(ext.length + 1));
  const lastSlash = noExt.lastIndexOf('/');
  const dir  = lastSlash >= 0 ? noExt.slice(0, lastSlash + 1) : '';
  const stem = lastSlash >= 0 ? noExt.slice(lastSlash + 1)    : noExt;
  return '<div class="tx-spec-card" id="card-' + escAttr(f.filename) + '" data-filename="' + escHtml(f.filename) + '">' +
    '<div class="tx-spec-hdr" onclick="window.toggleCard(' + jsq(f.filename) + ')">' +
      '<span class="tx-spec-chevron">&#9658;</span>' +
      '<span class="tx-spec-filename">' +
        (dir ? '<span class="tx-spec-dir">' + escHtml(dir) + '</span>' : '') +
        escHtml(stem) + '<span class="ext">.' + escHtml(ext) + '</span>' +
      '</span>' +
      '<button class="tx-spec-run-btn" onclick="event.stopPropagation();window.runTestByFilename(' + jsq(f.filename) + ')">&#9654;</button>' +
    '</div>' +
    (Object.keys(suites).length ? '<div class="tx-spec-body">' + suiteHtml + '</div>' : '') +
  '</div>';
}

window.toggleCard = (filename: string) =>
  document.getElementById('card-' + filename)?.classList.toggle('open');

window.toggleSuite = (filename: string, suiteName: string) => {
  const key = escAttr(filename + '\x01' + suiteName);
  const suiteRow = document.querySelector<HTMLElement>(`[data-suite-key="${key}"]`);
  if (!suiteRow) return;
  const collapsed = suiteRow.classList.toggle('collapsed');
  const card = document.getElementById('card-' + escAttr(filename));
  card?.querySelectorAll<HTMLElement>('.tx-test-item').forEach(item => {
    if (item.dataset.suite === suiteName) {
      item.style.display = collapsed ? 'none' : '';
      const logEl = item.nextElementSibling as HTMLElement | null;
      if (logEl?.classList.contains('tx-test-log')) logEl.style.display = collapsed ? 'none' : '';
    }
  });
};

// ── Test execution ────────────────────────────────────────────────────────────

interface TestResult { name: string; passed: boolean; error?: string; duration: number; }

type HookFn = () => any;
type HookScope = { beforeEachs: HookFn[]; afterEachs: HookFn[]; beforeAlls: HookFn[]; afterAlls: HookFn[] };
type QueueItem = {
  name: string; fn: HookFn;
  beforeEachs: HookFn[]; afterEachs: HookFn[];
  setupBeforeAlls: HookFn[]; teardownAfterAlls: HookFn[];
};

function buildTestQueue(
  code: string,
  filters: { filterSuite?: string; filterTest?: string; filterTests?: string[] }
): QueueItem[] | { parseError: string } {
  const { filterSuite, filterTest, filterTests } = filters;
  const queue: QueueItem[] = [];
  const stack: string[] = [];
  const hookStack: HookScope[] = [];

  const beforeEach = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].beforeEachs.push(fn); };
  const afterEach  = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].afterEachs.push(fn); };
  const beforeAll  = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].beforeAlls.push(fn); };
  const afterAll   = (fn: HookFn) => { if (hookStack.length) hookStack[hookStack.length - 1].afterAlls.push(fn); };

  const it = (name: string, fn: HookFn) => {
    const suite    = stack.join(' > ');
    const fullName = stack.length ? suite + ' > ' + name : name;
    if (filterSuite  && suite    !== filterSuite)              return;
    if (filterTest   && fullName !== filterTest)               return;
    if (filterTests  && !filterTests.includes(fullName))       return;
    queue.push({
      name: fullName, fn,
      beforeEachs: hookStack.flatMap(s => s.beforeEachs),
      afterEachs:  hookStack.flatMap(s => s.afterEachs).reverse(),
      setupBeforeAlls: [], teardownAfterAlls: [],
    });
  };

  const describe = (name: string, fn: () => void) => {
    stack.push(name);
    hookStack.push({ beforeEachs: [], afterEachs: [], beforeAlls: [], afterAlls: [] });
    const lenBefore = queue.length;
    try { fn(); } finally {
      const scope      = hookStack[hookStack.length - 1];
      const scopeTests = queue.slice(lenBefore);
      if (scopeTests.length > 0) {
        // Prepend so outer beforeAlls run before inner ones
        if (scope.beforeAlls.length) scopeTests[0].setupBeforeAlls = [...scope.beforeAlls, ...scopeTests[0].setupBeforeAlls];
        // Append so inner afterAlls run before outer ones
        if (scope.afterAlls.length)  scopeTests[scopeTests.length - 1].teardownAfterAlls = [...scopeTests[scopeTests.length - 1].teardownAfterAlls, ...scope.afterAlls];
      }
      stack.pop();
      hookStack.pop();
    }
  };

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
    return { parseError: e.stack || e.message };
  }
  return queue;
}

async function executeTests(
  code: string,
  opts?: { filterSuite?: string; filterTest?: string; filterTests?: string[]; filename?: string }
): Promise<TestResult[]> {
  const filename = opts?.filename;
  const queue = buildTestQueue(code, opts ?? {});

  if ('parseError' in queue) {
    return [{ name: '(parse/compile error)', passed: false, error: queue.parseError, duration: 0 }];
  }

  const results: TestResult[] = [];
  for (const t of queue) {
    if (filename) {
      setTestItemStatus(filename, t.name, 'running');
      activateTestLog(filename, t.name);
    }
    const t0 = Date.now();
    try {
      closeExtraTabs();
      for (const hook of t.setupBeforeAlls)    await Promise.resolve(hook());
      for (const hook of t.beforeEachs)         await Promise.resolve(hook());
      await Promise.resolve(t.fn());
      for (const hook of t.afterEachs)          await Promise.resolve(hook());
      for (const hook of t.teardownAfterAlls)   await Promise.resolve(hook());
      const dur = Date.now() - t0;
      results.push({ name: t.name, passed: true, duration: dur });
      if (filename) {
        setTestItemStatus(filename, t.name, 'pass', dur);
        const logEl = document.getElementById('tlog-' + escAttr(filename + '\x01' + t.name));
        if (logEl?.children.length === 0) logEl.classList.remove('open');
      }
    } catch (e: any) {
      const dur = Date.now() - t0;
      results.push({ name: t.name, passed: false, error: e.stack || e.message, duration: dur });
      if (filename) setTestItemStatus(filename, t.name, 'fail', dur);
      appendErrorToLog(e.stack || e.message);
    } finally {
      setLogContainer(null);
    }
  }
  return results;
}

// ── Server communication ──────────────────────────────────────────────────────

function reportToServer(results: TestResult[], filename?: string): void {
  fetch(API_BASE + '/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, tests: results }),
  }).catch(() => {});
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
  let passed = 0, failed = 0;
  results.forEach(t => { t.passed ? passed++ : failed++; });
  const status = document.getElementById('testRunnerStatus');
  if (status) {
    status.innerHTML =
      `<span class="tx-runner-pass">&#10003;&nbsp;${passed} passed</span>` +
      (failed > 0 ? `<span class="tx-runner-fail">&#10007;&nbsp;${failed} failed</span>` : '');
  }
  if (filename) updateCardStatus(filename, passed, failed);
}

// ── Run helpers ───────────────────────────────────────────────────────────────

function openAndResetCard(filename: string) {
  document.getElementById('card-' + escAttr(filename))?.classList.add('open');
  resetTestItems(filename);
  setCardRunning(filename);
}

function countResults(results: TestResult[]): { passed: number; failed: number; duration: number } {
  let passed = 0, failed = 0, duration = 0;
  for (const r of results) { r.passed ? passed++ : failed++; duration += r.duration; }
  return { passed, failed, duration };
}

async function fetchAndRun(
  filename: string,
  opts?: Parameters<typeof executeTests>[1]
): Promise<TestResult[]> {
  const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const results = await executeTests(await resp.text(), opts);
  renderTestResults(results, filename);
  reportToServer(results, filename);
  return results;
}

// ── Window actions ────────────────────────────────────────────────────────────

window.runTestByFilename = async (filename: string) => {
  openAndResetCard(filename);
  log(`run  ${filename}`, 'info');
  await notifyRunBegin([{ file: filename, tests: null }]);
  try {
    const { passed, failed, duration } = countResults(await fetchAndRun(filename, { filename }));
    notifyRunEnd(passed, failed, passed + failed, duration);
  } catch (e: any) {
    log('Error: ' + e.message, 'error');
    updateCardStatus(filename, 0, 1);
    notifyRunEnd(0, 1, 1, 0);
  }
};

window.runSuite = async (filename: string, suiteName: string) => {
  openAndResetCard(filename);
  const suiteTests = Array.from(
    document.getElementById('card-' + escAttr(filename))
      ?.querySelectorAll<HTMLElement>('.tx-test-item') ?? []
  ).filter(el => el.dataset.suite === suiteName).map(el => el.dataset.fullname!).filter(Boolean);
  await notifyRunBegin([{ file: filename, tests: suiteTests.length ? suiteTests : null }]);
  try {
    const { passed, failed, duration } = countResults(await fetchAndRun(filename, { filterSuite: suiteName, filename }));
    notifyRunEnd(passed, failed, passed + failed, duration);
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
  await notifyRunBegin([{ file: filename, tests: [fullName] }]);
  try {
    const { passed, failed, duration } = countResults(await fetchAndRun(filename, { filterTest: fullName, filename }));
    notifyRunEnd(passed, failed, passed + failed, duration);
  } catch (e: any) {
    log('Error: ' + e.message, 'error');
    setTestItemStatus(filename, fullName, 'fail');
    notifyRunEnd(0, 1, 1, 0);
  }
};

window.runAll = async (): Promise<{ passed: number; failed: number }> => {
  const filterInput = document.getElementById('testFilter') as HTMLInputElement | null;
  if (filterInput?.value.trim()) {
    await window.runFiltered();
    return { passed: 0, failed: 0 };
  }
  const btn = document.getElementById('runAllBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  _isTestRunning = true;
  setTopbarStatus('running', 'Running…');
  const allCards = Array.from(document.querySelectorAll<HTMLElement>('.tx-spec-card[data-filename]'));
  await notifyRunBegin(allCards.map(c => ({ file: c.dataset.filename!, tests: null })));
  let totalPass = 0, totalFail = 0, totalDuration = 0;
  for (const card of allCards) {
    const filename = card.dataset.filename!;
    openAndResetCard(filename);
    log(`run  ${filename}`, 'info');
    try {
      const { passed, failed, duration } = countResults(await fetchAndRun(filename, { filename }));
      totalPass += passed; totalFail += failed; totalDuration += duration;
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

(window as any).openSnapshot = openSnapshot;

(window as any).setBrowserView = setBrowserView;

// ── Filter ────────────────────────────────────────────────────────────────────

function buildFilterMatcher(query: string): ((name: string) => boolean) | null {
  const q = query.trim();
  if (!q) return null;
  const reMatch = q.match(/^\/(.+)\/([gimsuy]*)$/);
  if (reMatch) {
    try {
      const re = new RegExp(reMatch[1], reMatch[2]);
      return name => re.test(name);
    } catch { /* fall through to substring */ }
  }
  const lower = q.toLowerCase();
  return name => name.toLowerCase().includes(lower);
}

window.applyFilter = (query: string) => {
  const matcher = buildFilterMatcher(query);
  const runBtn = document.getElementById('filterRunBtn') as HTMLButtonElement | null;
  if (runBtn) runBtn.style.display = matcher ? 'flex' : 'none';

  for (const card of document.querySelectorAll<HTMLElement>('.tx-spec-card[data-filename]')) {
    let cardHasMatch = false;

    for (const item of card.querySelectorAll<HTMLElement>('.tx-test-item')) {
      const name = item.querySelector('.tx-test-name')?.textContent ?? '';
      const fullName = item.dataset.fullname ?? name;
      const matches = !matcher || matcher(name) || matcher(fullName);
      item.style.display = matches ? '' : 'none';
      const logEl = item.nextElementSibling as HTMLElement | null;
      if (logEl?.classList.contains('tx-test-log')) logEl.style.display = matches ? '' : 'none';
      if (matches) cardHasMatch = true;
    }

    for (const suiteRow of card.querySelectorAll<HTMLElement>('.tx-suite-row')) {
      const suiteName = suiteRow.querySelector<HTMLElement>('.tx-suite-name')?.textContent ?? '';
      const hasSuiteVisible = Array.from(card.querySelectorAll<HTMLElement>('.tx-test-item'))
        .some(item => item.dataset.suite === suiteName && item.style.display !== 'none');
      suiteRow.style.display = !matcher || hasSuiteVisible ? '' : 'none';
    }

    card.style.display = !matcher || cardHasMatch ? '' : 'none';
    if (matcher && cardHasMatch) card.classList.add('open');
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
    const list = byFile.get(card.dataset.filename) ?? [];
    list.push(item.dataset.fullname!);
    byFile.set(card.dataset.filename, list);
  }

  await notifyRunBegin(Array.from(byFile.entries()).map(([file, tests]) => ({ file, tests })));

  for (const [filename, testNames] of byFile) {
    openAndResetCard(filename);
    log(`run filtered  ${filename}`, 'info');
    try {
      const { passed, failed, duration } = countResults(await fetchAndRun(filename, { filename, filterTests: testNames }));
      totalPass += passed; totalFail += failed; totalDuration += duration;
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
  const specsHandle = document.getElementById('specsResizer');
  if (!specs || !specsHandle) return;

  const saved = Number(localStorage.getItem('tx-specs-w') || 0);
  if (saved) specs.style.width = saved + 'px';

  specsHandle.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    specsHandle.classList.add('dragging');
    document.body.style.cursor    = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const startW = specs.offsetWidth;
    const onMove = (ev: MouseEvent) => {
      specs.style.width = Math.min(600, Math.max(150, startW + ev.clientX - startX)) + 'px';
    };
    const onUp = () => {
      specsHandle.classList.remove('dragging');
      document.body.style.cursor    = '';
      document.body.style.userSelect = '';
      localStorage.setItem('tx-specs-w', String(specs.offsetWidth));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  setOnTabsChanged(renderTabBar);
  initIframe();
  renderTabBar();
  renderBrowserView();
  document.getElementById('testList')?.addEventListener('click', (event: MouseEvent) => {
    const item = (event.target as Element).closest<HTMLElement>('.tx-test-item');
    if (!item) return;
    const logEl = item.nextElementSibling as HTMLElement | null;
    if (logEl?.classList.contains('tx-test-log')) logEl.classList.toggle('open');
  });
  initResizers();
  const snapshotWrapper = document.getElementById('snapshotViewportWrapper');
  if (snapshotWrapper) {
    new ResizeObserver(() => { if (_activeBrowserView === 'snapshot') applySnapshotViewport(); })
      .observe(snapshotWrapper);
  }
  await loadTestList();
  if (window.__CONFIG__.grep) {
    const grepSource = window.__CONFIG__.grep;
    const grepFlags = window.__CONFIG__.grepFlags ?? '';
    const grepPattern = `/${grepSource}/${grepFlags}`;
    const filterInput = document.getElementById('testFilter') as HTMLInputElement | null;
    if (filterInput) {
      filterInput.value = grepPattern;
      window.applyFilter(grepPattern);
    }
  }
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
