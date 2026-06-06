import { log, attach, setLogContainer, page, expect, request, initIframe, setOnTabsChanged, getTabsSnapshot, createTab, closeTab, setActiveTab, browser, node, getSnapshots, clearSnapshots, wsConnect, wsSend, wsOnMessage, wsRequest } from '../browser/browser';
import { escHtml, escAttr } from '../utils/htmlUtils';
import { initNetworkListeners, initNetworkResizer } from '../browser/devPanel';
import { renderTestFileCard } from '../panel/render';
import { fetchAndRun, type TestResult, type RunSpec } from '../panel/runner-bridge';
import type { ParsedFile } from '../panel/render';

declare global {
  interface Window {
    runSuite: (filename: string, suiteName: string) => void;
    runTest: (filename: string, fullName: string) => void;
    toggleCard: (filename: string) => void;
    toggleSuite: (filename: string, suiteName: string) => void;
    runTestByFilename:(filename: string) => void;
    runAll: () => Promise<{ passed: number; failed: number }>;
    applyFilter: (query: string) => void;
    runFiltered: () => Promise<{ passed: number; failed: number }>;
    stopExecution: () => void;
  }
}

(window as any).tx = { page, expect, browser, node, request, log, attach };

// ── Autoscroll to running test ────────────────────────────────────────────────

function scrollToRunningItem(item: HTMLElement) {
  const container = document.querySelector<HTMLElement>('.tx-specs-scroll');
  if (!container) return;
  const cr = container.getBoundingClientRect();
  const ir = item.getBoundingClientRect();
  if (ir.top < cr.top) {
    container.scrollTop += ir.top - cr.top;
  } else if (ir.bottom > cr.bottom) {
    container.scrollTop += ir.bottom - cr.bottom;
  }
}

// ── Inline test log ───────────────────────────────────────────────────────────

let _activeTestLog: HTMLElement | null = null;

function activateTestLog(filename: string, fullName: string, attempt = 0) {
  const key = escAttr(filename + '\x01' + fullName);
  const el = document.getElementById('tlog-' + key) as HTMLElement | null;
  if (!el) return;
  el.innerHTML = '';
  el.classList.add('open');
  if (attempt > 0) {
    const banner = document.createElement('div');
    banner.className = 'tx-cmd info';
    banner.innerHTML =
      '<span class="tx-cmd-icon" style="color:var(--warn)">↻</span>' +
      '<span class="tx-cmd-msg" style="color:var(--warn);font-style:italic">Retry ' + attempt + '</span>';
    el.appendChild(banner);
  }
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
  const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (gap < 40) el.scrollTop = el.scrollHeight;
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

function setTestItemStatus(filename: string, fullName: string, state: 'running'|'pass'|'fail', duration?: number, retry?: number) {
  const key = escAttr(filename + '\x01' + fullName);
  const item = document.querySelector<HTMLElement>(`[data-testkey="${key}"]`);
  if (!item) return;
  item.classList.remove('running', 'pass', 'fail');
  item.classList.add(state);
  if (state === 'running') scrollToRunningItem(item);
  const dot = item.querySelector('.tx-test-dot');
  const badge = item.querySelector<HTMLElement>('.tx-test-badge');
  if (dot) { dot.classList.remove('running', 'pass', 'fail'); dot.classList.add(state); }
  if (badge) {
    badge.classList.remove('running', 'pass', 'fail');
    if (state === 'running') {
      badge.textContent = '';
    } else {
      badge.classList.add(state);
      const label = duration != null ? duration + 'ms' : (state === 'pass' ? 'PASS' : 'FAIL');
      badge.textContent = state === 'pass' && retry ? label + ` ↺${retry}` : label;
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

function showProgress(done: number, total: number) {
  const el = document.getElementById('runProgress');
  if (!el) return;
  el.textContent = `${done} / ${total}`;
  el.classList.remove('tx-hidden');
}

function hideProgress() {
  const el = document.getElementById('runProgress');
  if (!el) return;
  el.classList.add('tx-hidden');
  el.textContent = '';
}

// ── Spec list ─────────────────────────────────────────────────────────────────

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

function countResults(results: TestResult[]): { passed: number; failed: number; duration: number } {
  let passed = 0, failed = 0, duration = 0;
  for (const r of results) {
    if (r.passed) passed++
    else failed++;
    duration += r.duration;
  }
  return { passed, failed, duration };
}

async function _singleRun(
  setupFn: () => void,
  getSpecs: () => Array<{ file: string; tests: string[] | null }>,
  runFn: () => Promise<TestResult[]>,
  onError: (e: any) => void,
  total = 0,
): Promise<void> {
  _stopRequested = false;
  _runDone = 0;
  _runTotal = total;
  if (total > 0) showProgress(0, total);
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
  hideProgress();
  setStopBtnVisible(false);
}

async function _fetchAndRunFile(
  filename: string,
  spec: RunSpec | null,
  uiFilename?: string,
): Promise<TestResult[]> {
  const results = await fetchAndRun(filename, spec, {
    isStopRequested: () => _stopRequested,
    setCancelFn: (fn) => { _currentTestCancel = fn; },
    onAttemptBegin: uiFilename ? (testName, attempt) => {
      setTestItemStatus(uiFilename, testName, 'running');
      activateTestLog(uiFilename, testName, attempt);
    } : undefined,
    onAttemptError: uiFilename ? appendErrorToLog : undefined,
    onAttemptFinally: uiFilename ? (testName) => {
      const logEl = document.getElementById('tlog-' + escAttr(uiFilename + '\x01' + testName));
      logEl?.classList.remove('open');
      _activeTestLog = null;
    } : undefined,
    onTestEnd: (r) => {
      wsSend('report', { filename, tests: [r] } as Record<string, unknown>);
      if (uiFilename) setTestItemStatus(uiFilename, r.name, r.passed ? 'pass' : 'fail', r.duration, r.retry);
      if (_runTotal > 0) showProgress(++_runDone, _runTotal);
    },
  });
  renderTestResults(results, filename);
  return results;
}

async function _runMultiFile(
  byFile: Map<string, string[] | null>,
  specs: Array<{ file: string; tests: string[] | null }>,
  total: number,
): Promise<{ passed: number; failed: number }> {
  _stopRequested = false;
  _isTestRunning = true;
  setStopBtnVisible(true);
  _runDone = 0;
  _runTotal = total;
  if (total > 0) showProgress(0, total);
  setTopbarStatus('running', 'Running…');
  notifyRunBegin(specs);
  let totalPass = 0, totalFail = 0, totalDuration = 0;
  for (const [filename, tests] of byFile) {
    if (_stopRequested) break;
    openAndResetCard(filename);
    log(`run  ${filename}`);
    try {
      const spec: RunSpec | null = tests ? { filterTests: tests } : null;
      const { passed, failed, duration } = countResults(
        await _fetchAndRunFile(filename, spec, filename)
      );
      totalPass += passed; totalFail += failed; totalDuration += duration;
    } catch (e: any) {
      log('Error: ' + e.message, { type: 'error' });
      updateCardStatus(filename, 0, 1);
      totalFail++;
    }
  }
  notifyRunEnd(totalPass, totalFail, totalPass + totalFail, totalDuration);
  _isTestRunning = false;
  hideProgress();
  setStopBtnVisible(false);
  setTopbarStatus(
    _stopRequested ? 'ready' : (totalFail === 0 ? 'passed' : 'failed'),
    _stopRequested
      ? `Stopped — ${totalPass} passed, ${totalFail} failed`
      : `${totalPass} passed, ${totalFail} failed`,
  );
  return { passed: totalPass, failed: totalFail };
}

// ── Window actions ────────────────────────────────────────────────────────────

window.runTestByFilename = async (filename: string) => {
  const total = document.getElementById('card-' + escAttr(filename))?.querySelectorAll('.tx-test-item').length ?? 0;
  await _singleRun(
    () => { openAndResetCard(filename); log(`run  ${filename}`); },
    () => [{ file: filename, tests: null }],
    () => _fetchAndRunFile(filename, null, filename),
    () => updateCardStatus(filename, 0, 1),
    total,
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
    () => _fetchAndRunFile(filename, { filterSuite: suiteName }, filename),
    () => updateCardStatus(filename, 0, 1),
    suiteTests.length,
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
    () => _fetchAndRunFile(filename, { filterTest: fullName }, filename),
    () => setTestItemStatus(filename, fullName, 'fail'),
    1,
  );
};

window.runAll = async (): Promise<{ passed: number; failed: number }> => {
  const filterInput = document.getElementById('testFilter') as HTMLInputElement | null;
  if (filterInput?.value.trim()) return window.runFiltered();
  const btn = document.getElementById('runAllBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  const allCards = Array.from(document.querySelectorAll<HTMLElement>('.tx-spec-card[data-filename]'));
  const byFile = new Map(allCards.map(c => [c.dataset.filename!, null] as [string, null]));
  const specs = allCards.map(c => ({ file: c.dataset.filename!, tests: null }));
  const total = document.querySelectorAll('.tx-test-item').length;
  const result = await _runMultiFile(byFile, specs, total);
  if (btn) btn.disabled = false;
  return result;
};

// ── State ─────────────────────────────────────────────────────────────────────

let _watchVersion = -1;
let _isTestRunning = false;
let _stopRequested = false;
let _currentTestCancel: ((err: Error) => void) | null = null;
let _runTotal = 0;
let _runDone = 0;

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

(window as any).openHtmlAttachment = (html: string, label: string) => {
  const titleEl = document.getElementById('snapshotTitle');
  const urlEl = document.getElementById('snapshotUrl');
  const frame = document.getElementById('snapshotFrame') as HTMLIFrameElement | null;
  if (titleEl) titleEl.textContent = label || 'Attachment';
  if (urlEl) urlEl.textContent = '';
  if (frame) frame.srcdoc = html;
  _selectedSnapshotId = null;
  setBrowserView('snapshot');
};

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

window.runFiltered = async (): Promise<{ passed: number; failed: number }> => {
  const btn = document.getElementById('filterRunBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  const byFile = new Map<string, string[]>();
  for (const item of document.querySelectorAll<HTMLElement>('.tx-test-item')) {
    if (item.style.display === 'none') continue;
    const card = item.closest<HTMLElement>('.tx-spec-card[data-filename]');
    if (!card?.dataset.filename) continue;
    const list = byFile.get(card.dataset.filename) ?? [];
    list.push(item.dataset.fullname!);
    byFile.set(card.dataset.filename, list);
  }
  const specs = Array.from(byFile.entries()).map(([file, tests]) => ({ file, tests }));
  const total = Array.from(byFile.values()).reduce((sum, arr) => sum + arr.length, 0);
  const result = await _runMultiFile(byFile as Map<string, string[] | null>, specs, total);
  if (btn) btn.disabled = false;
  return result;
};

// ── Keyboard navigation ───────────────────────────────────────────────────────

let _kbFocusedTestKey: string | null = null;

function _getVisibleTestItems(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.tx-test-item'))
    .filter(el => el.style.display !== 'none');
}

function _setKbFocus(newKey: string | null): void {
  if (_kbFocusedTestKey != null) {
    for (const el of document.querySelectorAll<HTMLElement>('.tx-test-item')) {
      if (el.dataset.testkey === _kbFocusedTestKey) { el.classList.remove('tx-kb-focus'); break; }
    }
  }
  _kbFocusedTestKey = newKey;
  if (newKey != null) {
    for (const el of document.querySelectorAll<HTMLElement>('.tx-test-item')) {
      if (el.dataset.testkey === newKey) { el.classList.add('tx-kb-focus'); break; }
    }
  }
}

function _navigateTestList(dir: 1 | -1): void {
  const items = _getVisibleTestItems();
  if (!items.length) return;
  const curIdx = _kbFocusedTestKey != null
    ? items.findIndex(el => el.dataset.testkey === _kbFocusedTestKey)
    : -1;
  const nextIdx = dir === 1
    ? Math.min(items.length - 1, curIdx < 0 ? 0 : curIdx + 1)
    : Math.max(0, curIdx < 0 ? items.length - 1 : curIdx - 1);
  const next = items[nextIdx];
  if (!next) return;
  _setKbFocus(next.dataset.testkey ?? null);
  next.scrollIntoView({ block: 'nearest' });
}

function _runKbFocusedTest(): void {
  if (_kbFocusedTestKey == null || _isTestRunning) return;
  let focusedEl: HTMLElement | null = null;
  for (const el of document.querySelectorAll<HTMLElement>('.tx-test-item')) {
    if (el.dataset.testkey === _kbFocusedTestKey) { focusedEl = el; break; }
  }
  if (!focusedEl) return;
  const card = focusedEl.closest<HTMLElement>('.tx-spec-card[data-filename]');
  if (!card?.dataset.filename) return;
  const fullName = focusedEl.dataset.fullname;
  if (fullName) window.runTest(card.dataset.filename, fullName);
}

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

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    const filterInput = document.getElementById('testFilter') as HTMLInputElement | null;

    if (e.key === 'Escape') {
      if (filterInput && document.activeElement === filterInput) {
        if (filterInput.value) { filterInput.value = ''; window.applyFilter(''); }
        else filterInput.blur();
        e.preventDefault();
        return;
      }
      if (!isEditable && filterInput?.value) {
        filterInput.value = '';
        window.applyFilter('');
        _setKbFocus(null);
        e.preventDefault();
      }
      return;
    }

    if (isEditable) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        _navigateTestList(e.key === 'ArrowDown' ? 1 : -1);
        e.preventDefault();
      }
      return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case 'r': case 'R':
        if (!_isTestRunning) window.runAll();
        break;
      case 'f': case 'F':
        e.preventDefault();
        filterInput?.focus();
        filterInput?.select();
        break;
      case 'ArrowDown':
        _navigateTestList(1);
        e.preventDefault();
        break;
      case 'ArrowUp':
        _navigateTestList(-1);
        e.preventDefault();
        break;
      case 'Enter':
        _runKbFocusedTest();
        break;
    }
  });

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
