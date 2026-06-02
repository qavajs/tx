import { log, attach, setLogContainer, testApi, page, expect, request, initIframe, setOnTabsChanged, getTabsSnapshot, createTab, closeTab, setActiveTab, browser, node, getSnapshots, clearSnapshots, wsConnect, wsSend, wsRequest, wsOnMessage } from '../browser/browser';
import { escHtml, escAttr, jsq } from '../utils/htmlUtils';
import { type TestResult } from '../runner/executor';
import { executeTests } from '../runner/testRunner';
import { initNetworkListeners, initNetworkResizer } from '../browser/devPanel';

declare global {
  interface Window {
    testApi: typeof testApi;
    runSuite: (filename: string, suiteName: string) => void;
    runTest: (filename: string, fullName: string) => void;
    toggleCard: (filename: string) => void;
    toggleSuite: (filename: string, suiteName: string) => void;
    runTestByFilename:(filename: string) => void;
    runAll: () => Promise<{ passed: number; failed: number }>;
    applyFilter: (query: string) => void;
    runFiltered: () => Promise<void>;
    stopExecution: () => void;
  }
}

window.testApi = testApi;

(window as any).tx = { page, expect, browser, node, request, log, attach, ...testApi };

// ── Inline test log ───────────────────────────────────────────────────────────

let _activeTestLog: HTMLElement | null = null;

function activateTestLog(filename: string, fullName: string) {
  const key = escAttr(filename + '\x01' + fullName);
  const el = document.getElementById('tlog-' + key) as HTMLElement | null;
  if (!el) return;
  el.innerHTML = '';
  el.classList.add('open');
  _activeTestLog = el;
  setLogContainer(el);
}

function appendErrorToLog(error: string) {
  const el = _activeTestLog;
  if (!el) return;
  const firstLine = error.split('\n')[0];
  const child = document.createElement('div');
  child.className = 'tx-cmd tx-cmd--result tx-cmd--child fail';
  child.innerHTML =
    '<div class="tx-cmd-num"></div>' +
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
  if (b) b.innerHTML = '<span class="tx-badge tx-badge--running">●</span>';
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
  const dot = item.querySelector('.tx-test-dot');
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
  if (state === 'pass' || state === 'fail') refreshRunnerStatus();
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
    b.innerHTML = '<span class="tx-badge tx-badge--running">●</span>';
  } else {
    b.innerHTML = (pass > 0 ? `<span class="tx-badge tx-badge--pass">${pass}</span>` : '')
                + (fail > 0 ? `<span class="tx-badge tx-badge--fail">${fail}</span>` : '');
  }
}

function setTopbarStatus(state: 'ready'|'running'|'passed'|'failed'|'connected'|'disconnected', text: string) {
  const dot = document.getElementById('statusIndicator');
  const span = document.getElementById('statusText');
  if (dot) dot.className = 'tx-status-dot ' + state;
  if (span) span.textContent = text;
}

// ── Spec list ─────────────────────────────────────────────────────────────────

interface ParsedTest { suite: string; name: string; tags?: string[]; }
interface ParsedFile { filename: string; relPath?: string; tests: ParsedTest[]; }

async function loadTestList() {
  const container = document.getElementById('testList')!;
  try {
    const msg = await wsRequest<{ data: ParsedFile[] }>('get-tests');
    const files = msg.data.sort((a, b) => a.filename.localeCompare(b.filename));
    container.innerHTML = files.length
      ? files.map(renderTestFileCard).join('')
      : '<div class="tx-empty">No .js files in examples/</div>';
    refreshRunnerStatus();
  } catch (e: any) {
    container.innerHTML = `<div class="tx-empty" style="color:var(--fail)">Failed to load specs<br>${e.message}</div>`;
  }
}

function renderTestItemHtml(filename: string, suite: string, name: string, tags: string[]): string {
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
  const tagsHtml = tags.length > 0
    ? '<span class="tx-test-tags">' + tags.map(t => '<span class="tx-test-tag">' + escHtml(t) + '</span>').join('') + '</span>'
    : '';
  return '<div class="tx-test-item"' +
    ' data-testkey="' + key + '"' +
    ' data-suite="' + escHtml(suite) + '"' +
    ' data-fullname="' + escHtml(fullName) + '"' +
    ' data-tags="' + escHtml(tags.join(' ')) + '">' +
    '<span class="tx-test-chevron">&#9658;</span>' +
    '<span class="tx-test-dot">' + stateIcons + '</span>' +
    '<span class="tx-test-name">' + escHtml(name) + '</span>' +
    tagsHtml +
    '<span class="tx-test-badge"></span>' +
    '<button class="tx-test-run-btn" aria-label="Run ' + escHtml(name) + '" onclick="event.stopPropagation();window.runTest(' + jsq(filename) + ',' + jsq(fullName) + ')">&#9654;</button>' +
  '</div>' +
  '<div class="tx-test-log" id="tlog-' + key + '"></div>';
}

function renderSuiteHtml(filename: string, suite: string, items: Array<{ name: string; tags: string[] }>): string {
  const key = escAttr(filename + '\x01' + suite);
  return '<div class="tx-suite-row" data-suite-key="' + key + '" onclick="window.toggleSuite(' + jsq(filename) + ',' + jsq(suite) + ')">' +
    '<span class="tx-suite-chevron">&#9658;</span>' +
    '<span class="tx-suite-name">' + escHtml(suite) + '</span>' +
    '<span class="tx-suite-badges" id="sbadges-' + key + '"></span>' +
    '<button class="tx-suite-run-btn" aria-label="Run suite ' + escHtml(suite) + '" onclick="event.stopPropagation();window.runSuite(' + jsq(filename) + ',' + jsq(suite) + ')">&#9654;</button>' +
  '</div>' + items.map(({ name, tags }) => renderTestItemHtml(filename, suite, name, tags)).join('');
}

function renderTestFileCard(f: ParsedFile): string {
  const suites: Record<string, Array<{ name: string; tags: string[] }>> = Object.create(null);
  f.tests.forEach(t => {
    const k = t.suite || '(root)';
    if (!suites[k]) suites[k] = [];
    suites[k].push({ name: t.name, tags: t.tags ?? [] });
  });
  const suiteHtml = Object.entries(suites).map(([s, items]) => renderSuiteHtml(f.filename, s, items)).join('');
  const display = f.relPath ?? f.filename;
  const ext = display.split('.').pop() ?? 'js';
  const noExt = display.slice(0, -(ext.length + 1));
  const lastSlash = noExt.lastIndexOf('/');
  const dir = lastSlash >= 0 ? noExt.slice(0, lastSlash + 1) : '';
  const stem = lastSlash >= 0 ? noExt.slice(lastSlash + 1) : noExt;
  return '<div class="tx-spec-card" id="card-' + escAttr(f.filename) + '" data-filename="' + escHtml(f.filename) + '">' +
    '<div class="tx-spec-hdr" onclick="window.toggleCard(' + jsq(f.filename) + ')">' +
      '<span class="tx-spec-chevron">&#9658;</span>' +
      '<span class="tx-spec-filename">' +
        (dir ? '<span class="tx-spec-dir">' + escHtml(dir) + '</span>' : '') +
        escHtml(stem) + '<span class="ext">.' + escHtml(ext) + '</span>' +
      '</span>' +
      '<span class="tx-suite-badges" id="badges-' + escAttr(f.filename) + '"></span>' +
      '<button class="tx-spec-run-btn" aria-label="Run ' + escHtml(display) + '" onclick="event.stopPropagation();window.runTestByFilename(' + jsq(f.filename) + ')">&#9654;</button>' +
    '</div>' +
    (Object.keys(suites).length ? '<div class="tx-spec-body">' + suiteHtml + '</div>' : '') +
  '</div>';
}

window.toggleCard = (filename: string) =>
  document.getElementById('card-' + escAttr(filename))?.classList.toggle('open');

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

// ── Server communication ──────────────────────────────────────────────────────


function notifyRunBegin(specs: Array<{ file: string; tests: string[] | null }>): void {
  wsSend('run-begin', { specs } as Record<string, unknown>);
}

function notifyRunEnd(passed: number, failed: number, total: number, duration: number): void {
  wsSend('run-end', { passed, failed, total, duration });
}

function refreshRunnerStatus() {
  const status = document.getElementById('testRunnerStatus');
  if (!status) return;
  const total = document.querySelectorAll('.tx-test-item').length;
  const passed = document.querySelectorAll('.tx-test-item.pass').length;
  const failed = document.querySelectorAll('.tx-test-item.fail').length;
  status.innerHTML =
    `<span class="tx-runner-total">${total}</span>` +
    `<span class="tx-runner-pass">&#10003;&nbsp;${passed}</span>` +
    `<span class="tx-runner-fail">&#10007;&nbsp;${failed}</span>`;
}

function renderTestResults(results: TestResult[], filename?: string) {
  let passed = 0;
  let failed = 0;
  results.forEach(t => {
    if (t.passed) passed++
    else failed++;
  });
  refreshRunnerStatus();
  if (filename) updateCardStatus(filename, passed, failed);
}

// ── Run helpers ───────────────────────────────────────────────────────────────

function openAndResetCard(filename: string) {
  document.getElementById('card-' + escAttr(filename))?.classList.add('open');
  resetTestItems(filename);
  setCardRunning(filename);
}

async function _singleRun(
  setupFn: () => void,
  getSpecs: () => Array<{ file: string; tests: string[] | null }>,
  runFn: () => Promise<TestResult[]>,
  onError: (e: any) => void,
): Promise<void> {
  _stopRequested = false;
  setStopBtnVisible(true);
  setupFn();
  notifyRunBegin(getSpecs());
  try {
    const { passed, failed, duration } = countResults(await runFn());
    notifyRunEnd(passed, failed, passed + failed, duration);
  } catch (e: any) {
    log('Error: ' + (e as Error).message, { type: 'error' });
    onError(e);
    notifyRunEnd(0, 1, 1, 0);
  }
  setStopBtnVisible(false);
}

function countResults(results: TestResult[]): { passed: number; failed: number; duration: number } {
  let passed = 0, failed = 0, duration = 0;
  for (const r of results) { 
    if (r.passed) passed++
    else failed++;
    duration += r.duration;
  }
  return { passed, failed, duration };
}

async function fetchAndRun(
  filename: string,
  opts?: { filterSuite?: string; filterTest?: string; filterTests?: string[]; filename?: string }
): Promise<TestResult[]> {
  const msg = await wsRequest<{ data?: string; error?: string }>('get-test-source', { file: filename });
  if (msg.error || !msg.data) throw new Error(msg.error ?? 'Failed to load test source');
  const results = await executeTests(msg.data, {
    ...opts,
    isStopRequested: () => _stopRequested,
    setCancelFn: (fn) => { _currentTestCancel = fn; },
    onAttemptBegin: opts?.filename ? (testName, attempt) => {
      if (attempt > 0) {
        const logEl = document.getElementById('tlog-' + escAttr(opts.filename! + '\x01' + testName));
        if (logEl) { logEl.innerHTML = ''; logEl.classList.add('open'); }
      }
      setTestItemStatus(opts.filename!, testName, 'running');
      activateTestLog(opts.filename!, testName);
    } : undefined,
    onAttemptError: opts?.filename ? appendErrorToLog : undefined,
    onAttemptFinally: opts?.filename ? (testName, passed, attemptsLeft) => {
      const logEl = document.getElementById('tlog-' + escAttr(opts.filename! + '\x01' + testName));
      if (!passed || attemptsLeft > 0) logEl?.classList.remove('open');
      _activeTestLog = null;
    } : undefined,
    onTestEnd: (r) => {
      wsSend('report', { filename, tests: [r] } as Record<string, unknown>);
      if (opts?.filename) setTestItemStatus(opts.filename, r.name, r.passed ? 'pass' : 'fail', r.duration);
    },
  });
  renderTestResults(results, filename);
  return results;
}

// ── Window actions ────────────────────────────────────────────────────────────

window.runTestByFilename = async (filename: string) => {
  await _singleRun(
    () => { openAndResetCard(filename); log(`run  ${filename}`); },
    () => [{ file: filename, tests: null }],
    () => fetchAndRun(filename, { filename }),
    () => updateCardStatus(filename, 0, 1),
  );
};

window.runSuite = async (filename: string, suiteName: string) => {
  let suiteTests: string[] = [];
  await _singleRun(
    () => {
      const card = document.getElementById('card-' + escAttr(filename));
      card?.classList.add('open');
      card?.querySelectorAll<HTMLElement>('.tx-test-item').forEach(item => {
        if (item.dataset.suite !== suiteName) return;
        item.classList.remove('running', 'pass', 'fail');
        item.querySelector('.tx-test-dot')?.classList.remove('running', 'pass', 'fail');
        const badge = item.querySelector<HTMLElement>('.tx-test-badge');
        if (badge) { badge.className = 'tx-test-badge'; badge.textContent = ''; }
        const logEl = item.nextElementSibling as HTMLElement | null;
        if (logEl?.classList.contains('tx-test-log')) { logEl.innerHTML = ''; logEl.classList.remove('open'); }
      });
      const sbadge = document.getElementById('sbadges-' + escAttr(filename + '\x01' + suiteName));
      if (sbadge) sbadge.innerHTML = '<span class="tx-badge tx-badge--running">●</span>';
      setCardRunning(filename);
      suiteTests = Array.from(
        document.getElementById('card-' + escAttr(filename))
          ?.querySelectorAll<HTMLElement>('.tx-test-item') ?? []
      ).filter(el => el.dataset.suite === suiteName).map(el => el.dataset.fullname!).filter(Boolean);
    },
    () => [{ file: filename, tests: suiteTests.length ? suiteTests : null }],
    () => fetchAndRun(filename, { filterSuite: suiteName, filename }),
    () => updateCardStatus(filename, 0, 1),
  );
};

window.runTest = async (filename: string, fullName: string) => {
  await _singleRun(
    () => {
      document.getElementById('card-' + escAttr(filename))?.classList.add('open');
      setTestItemStatus(filename, fullName, 'running');
      setCardRunning(filename);
    },
    () => [{ file: filename, tests: [fullName] }],
    () => fetchAndRun(filename, { filterTest: fullName, filename }),
    () => setTestItemStatus(filename, fullName, 'fail'),
  );
};

window.runAll = async (): Promise<{ passed: number; failed: number }> => {
  const filterInput = document.getElementById('testFilter') as HTMLInputElement | null;
  if (filterInput?.value.trim()) {
    await window.runFiltered();
    return { passed: 0, failed: 0 };
  }
  const btn = document.getElementById('runAllBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  _stopRequested = false;
  _isTestRunning = true;
  setStopBtnVisible(true);
  setTopbarStatus('running', 'Running…');
  const allCards = Array.from(document.querySelectorAll<HTMLElement>('.tx-spec-card[data-filename]'));
  notifyRunBegin(allCards.map(c => ({ file: c.dataset.filename!, tests: null })));
  let totalPass = 0, totalFail = 0, totalDuration = 0;
  for (const card of allCards) {
    if (_stopRequested) break;
    const filename = card.dataset.filename!;
    openAndResetCard(filename);
    log(`run  ${filename}`);
    try {
      const { passed, failed, duration } = countResults(await fetchAndRun(filename, { filename }));
      totalPass += passed; totalFail += failed; totalDuration += duration;
    } catch (e: any) {
      log('Error: ' + e.message, { type: 'error' });
      updateCardStatus(filename, 0, 1);
      totalFail++;
    }
  }
  notifyRunEnd(totalPass, totalFail, totalPass + totalFail, totalDuration);
  _isTestRunning = false;
  setStopBtnVisible(false);
  if (_stopRequested) {
    setTopbarStatus('ready', `Stopped — ${totalPass} passed, ${totalFail} failed`);
  } else {
    setTopbarStatus(totalFail === 0 ? 'passed' : 'failed', `${totalPass} passed, ${totalFail} failed`);
  }
  if (btn) btn.disabled = false;
  return { passed: totalPass, failed: totalFail };
};

// ── State ─────────────────────────────────────────────────────────────────────

let _watchVersion = -1;
let _isTestRunning = false;
let _stopRequested = false;
let _currentTestCancel: ((err: Error) => void) | null = null;

function setStopBtnVisible(visible: boolean) {
  const btn = document.getElementById('stopBtn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.classList.toggle('tx-hidden', !visible);
  btn.disabled = false;
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
    closeBtn.setAttribute('aria-label', 'Close tab');
    closeBtn.onclick = (e) => { e.stopPropagation(); closeTab(t.id); };
    item.appendChild(title);
    item.appendChild(closeBtn);
    bar.appendChild(item);
  }
  const newBtn = document.createElement('button');
  newBtn.className = 'tx-new-tab-btn';
  newBtn.title = 'New tab';
  newBtn.setAttribute('aria-label', 'New tab');
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

function parseStatusFilter(query: string): { statusFilter: 'pass' | 'fail' | null; remainingQuery: string } {
  let statusFilter: 'pass' | 'fail' | null = null;
  let remaining = query;
  if (/:passed\b/.test(remaining)) {
    statusFilter = 'pass';
    remaining = remaining.replace(/:passed\b/, '').trim();
  } else if (/:failed\b/.test(remaining)) {
    statusFilter = 'fail';
    remaining = remaining.replace(/:failed\b/, '').trim();
  }
  return { statusFilter, remainingQuery: remaining };
}

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
  const { statusFilter, remainingQuery } = parseStatusFilter(query);
  const matcher = buildFilterMatcher(remainingQuery);
  const hasFilter = !!(matcher || statusFilter);
  const runBtn = document.getElementById('filterRunBtn') as HTMLButtonElement | null;
  if (runBtn) runBtn.classList.toggle('tx-hidden', !hasFilter);

  for (const card of document.querySelectorAll<HTMLElement>('.tx-spec-card[data-filename]')) {
    let cardHasMatch = false;

    for (const item of card.querySelectorAll<HTMLElement>('.tx-test-item')) {
      const name = item.querySelector('.tx-test-name')?.textContent ?? '';
      const fullName = item.dataset.fullname ?? name;
      const itemTags = (item.dataset.tags ?? '').split(/\s+/).filter(Boolean);
      const nameMatches = !matcher || matcher(name) || matcher(fullName) || itemTags.some(t => matcher!(t));
      const statusMatches = !statusFilter || item.classList.contains(statusFilter);
      const matches = nameMatches && statusMatches;
      item.style.display = matches ? '' : 'none';
      const logEl = item.nextElementSibling as HTMLElement | null;
      if (logEl?.classList.contains('tx-test-log')) logEl.style.display = matches ? '' : 'none';
      if (matches) cardHasMatch = true;
    }

    for (const suiteRow of card.querySelectorAll<HTMLElement>('.tx-suite-row')) {
      const suiteName = suiteRow.querySelector<HTMLElement>('.tx-suite-name')?.textContent ?? '';
      const hasSuiteVisible = Array.from(card.querySelectorAll<HTMLElement>('.tx-test-item'))
        .some(item => item.dataset.suite === suiteName && item.style.display !== 'none');
      suiteRow.style.display = !hasFilter || hasSuiteVisible ? '' : 'none';
    }

    card.style.display = !hasFilter || cardHasMatch ? '' : 'none';
    if (hasFilter && cardHasMatch) card.classList.add('open');
  }
};

window.runFiltered = async () => {
  const btn = document.getElementById('filterRunBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  _stopRequested = false;
  _isTestRunning = true;
  setStopBtnVisible(true);
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

  notifyRunBegin(Array.from(byFile.entries()).map(([file, tests]) => ({ file, tests })));

  for (const [filename, testNames] of byFile) {
    if (_stopRequested) break;
    openAndResetCard(filename);
    log(`run filtered  ${filename}`);
    try {
      const { passed, failed, duration } = countResults(await fetchAndRun(filename, { filename, filterTests: testNames }));
      totalPass += passed; totalFail += failed; totalDuration += duration;
    } catch (e: any) {
      log('Error: ' + e.message, { type: 'error' });
      updateCardStatus(filename, 0, 1);
      totalFail++;
    }
  }

  notifyRunEnd(totalPass, totalFail, totalPass + totalFail, totalDuration);
  _isTestRunning = false;
  setStopBtnVisible(false);
  if (_stopRequested) {
    setTopbarStatus('ready', `Stopped — ${totalPass} passed, ${totalFail} failed`);
  } else {
    setTopbarStatus(totalFail === 0 ? 'passed' : 'failed', `${totalPass} passed, ${totalFail} failed`);
  }
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
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const startW = specs.offsetWidth;
    const onMove = (ev: MouseEvent) => {
      specs.style.width = Math.min(600, Math.max(150, startW + ev.clientX - startX)) + 'px';
    };
    const onUp = () => {
      specsHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('tx-specs-w', String(specs.offsetWidth));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}


window.stopExecution = () => {
  _stopRequested = true;
  _currentTestCancel?.(new Error('Test stopped'));
  const btn = document.getElementById('stopBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  setTopbarStatus('running', 'Stopping…');
};

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  setOnTabsChanged(renderTabBar);
  initNetworkListeners();
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
  initNetworkResizer();
  const snapshotWrapper = document.getElementById('snapshotViewportWrapper');
  if (snapshotWrapper) {
    new ResizeObserver(() => { if (_activeBrowserView === 'snapshot') applySnapshotViewport(); })
      .observe(snapshotWrapper);
  }
  wsConnect(
    () => { if (!_isTestRunning) setTopbarStatus('connected', 'Connected'); },
    () => { if (!_isTestRunning) setTopbarStatus('disconnected', 'Disconnected'); },
  );
  wsOnMessage('version', async (msg: { version: number }) => {
    if (_watchVersion < 0) {
      _watchVersion = msg.version;
    } else if (msg.version !== _watchVersion) {
      _watchVersion = msg.version;
      await loadTestList();
      const filterInput = document.getElementById('testFilter') as HTMLInputElement | null;
      if (filterInput?.value) window.applyFilter(filterInput.value);
      log('test files updated');
    }
    if (!_isTestRunning) setTopbarStatus('connected', 'Connected');
  });
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
  if (window.__CONFIG__.autorun) {
    const { passed, failed } = await window.runAll();
    wsSend('done', { passed, failed });
  }
});
