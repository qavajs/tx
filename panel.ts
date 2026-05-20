export {};

declare global {
  interface Window {
    __CONFIG__: { proxyUrl: string; targetUrl: string; port: number };
    testApi: typeof testApi;
    runTestInBrowser: () => void;
    runTestOnServer:  () => void;
    runSuite:         (filename: string, suiteName: string) => void;
    toggleCard:       (filename: string) => void;
    runTestByFilename:(filename: string) => void;
    runAll:           () => void;
  }
}

let iframe: HTMLIFrameElement | null = null;

const API_BASE = 'http://localhost:' + window.__CONFIG__.port;

// ── testApi ───────────────────────────────────────────────────────────────────

const testApi = {
  visit(url: string) {
    if (!iframe) { log('iframe not ready', 'error'); return; }
    iframe.src = url;
    const navInput = document.getElementById('navUrl') as HTMLInputElement | null;
    if (navInput) navInput.value = url;
    log(`visit  ${url}`, 'info');
  },

  reload() {
    if (!iframe) { log('iframe not ready', 'error'); return; }
    iframe.contentWindow!.location.reload();
    log('reload', 'info');
  },

  get(selector: string): Element[] {
    try {
      if (!iframe || !iframe.contentDocument) return [];
      return Array.from(iframe.contentDocument.querySelectorAll(selector));
    } catch {
      log('Cross-origin blocked — open via proxy URL', 'error');
      return [];
    }
  },

  find(selector: string): Element | null {
    try {
      if (!iframe || !iframe.contentDocument) return null;
      return iframe.contentDocument.querySelector(selector);
    } catch { return null; }
  },

  text(selector: string): string {
    const el = testApi.find(selector);
    return el ? el.textContent || '' : '';
  },

  click(selector: string) {
    const el = testApi.find(selector) as HTMLElement | null;
    if (!el) { log(`click  ${selector}  — not found`, 'error'); return; }
    el.click();
    log(`click  ${selector}`, 'success');
  },

  type(selector: string, text: string) {
    const el = testApi.find(selector) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!el) { log(`type  ${selector}  — not found`, 'error'); return; }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const win = iframe!.contentWindow! as any;
      const proto = el.tagName === 'INPUT' ? win.HTMLInputElement.prototype : win.HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
      el.focus();
      el.dispatchEvent(new Event('focus',  { bubbles: true }));
      setter.call(el, text);
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur',   { bubbles: true }));
      log(`type  ${selector}  "${text}"`, 'success');
    }
  },

  isVisible(selector: string): boolean {
    const el = testApi.find(selector);
    if (!el || !iframe?.contentWindow) return false;
    const s = iframe.contentWindow.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  },

  attr(selector: string, name: string): string | null {
    return testApi.find(selector)?.getAttribute(name) ?? null;
  },

  waitForElement(selector: string, timeout = 5000): Promise<Element> {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        const el = testApi.find(selector);
        if (el) return resolve(el);
        if (Date.now() - t0 >= timeout) return reject(new Error('Timeout waiting for: ' + selector));
        setTimeout(tick, 100);
      };
      tick();
    });
  },

  waitForUrl(pattern: string | RegExp, timeout = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
      const tick = () => {
        if (re.test(testApi.url())) return resolve();
        if (Date.now() - t0 >= timeout) return reject(new Error('Timeout waiting for URL: ' + pattern));
        setTimeout(tick, 100);
      };
      tick();
    });
  },

  wait(ms = 500): Promise<void> { return new Promise(r => setTimeout(r, ms)); },

  url(): string {
    try { return iframe?.contentWindow?.location.href ?? ''; } catch { return ''; }
  },

  title(): string {
    try { return iframe?.contentDocument?.title ?? ''; } catch { return ''; }
  },
};

window.testApi = testApi;

// ── Command Log ───────────────────────────────────────────────────────────────

function log(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const container = document.getElementById('console');
  if (!container) return;

  const isPass = type === 'success';
  const isFail = type === 'error';
  const cls    = isPass ? 'pass' : isFail ? 'fail' : 'info';
  const icon   = isPass ? '✓'   : isFail ? '✗'    : '›';
  const label  = isPass ? 'ok'  : isFail ? 'err'   : 'log';

  const entry = document.createElement('div');
  entry.className = `cy-cmd ${cls}`;

  const iconEl = document.createElement('span');
  iconEl.className = `cy-cmd-icon ${cls}`;
  iconEl.textContent = icon;

  const labelEl = document.createElement('span');
  labelEl.className = `cy-cmd-label ${cls}`;
  labelEl.textContent = label;

  const msgEl = document.createElement('span');
  msgEl.className = 'cy-cmd-msg';
  msgEl.textContent = message;

  entry.appendChild(iconEl);
  entry.appendChild(labelEl);
  entry.appendChild(msgEl);
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

function logSection(title: string) {
  const container = document.getElementById('console');
  if (!container) return;
  const hdr = document.createElement('div');
  hdr.className = 'cy-log-section';
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
  entry.className = `cy-cmd ${cls}`;

  const iconEl = document.createElement('span');
  iconEl.className = `cy-cmd-icon ${cls}`;
  iconEl.textContent = icon;

  const msgEl = document.createElement('span');
  msgEl.className = 'cy-cmd-msg';
  msgEl.textContent = t.name + (t.error ? '  —  ' + t.error : '');

  const durEl = document.createElement('span');
  durEl.className = 'cy-cmd-dur';
  durEl.textContent = t.duration + 'ms';

  entry.appendChild(iconEl);
  entry.appendChild(msgEl);
  entry.appendChild(durEl);
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

// ── Spec card status helpers ──────────────────────────────────────────────────

function setCardRunning(filename: string) {
  const badges = document.getElementById('badges-' + escAttr(filename));
  if (badges) badges.innerHTML = '<span class="cy-badge" style="color:var(--warn)">●</span>';
}

function updateCardStatus(filename: string, passed: number, failed: number) {
  const badges = document.getElementById('badges-' + escAttr(filename));
  if (!badges) return;
  let html = '';
  if (passed > 0) html += `<span class="cy-badge cy-badge--pass">${passed}</span>`;
  if (failed > 0) html += `<span class="cy-badge cy-badge--fail">${failed}</span>`;
  badges.innerHTML = html;
}

function setTopbarStatus(state: 'ready' | 'running' | 'passed' | 'failed', text: string) {
  const dot  = document.getElementById('statusIndicator');
  const span = document.getElementById('statusText');
  if (dot)  dot.className  = 'cy-status-dot ' + state;
  if (span) span.textContent = text;
}

// ── iframe ────────────────────────────────────────────────────────────────────

function initIframe() {
  const container = document.getElementById('iframe-container')!;
  container.innerHTML = '';

  iframe = document.createElement('iframe');
  iframe.id = 'cy-virtual-browser';
  iframe.sandbox.add('allow-same-origin');
  iframe.sandbox.add('allow-scripts');
  iframe.sandbox.add('allow-forms');
  iframe.sandbox.add('allow-popups');
  iframe.sandbox.add('allow-modals');
  iframe.sandbox.add('allow-top-navigation-by-user-activation');

  iframe.onload = () => {
    setTopbarStatus('ready', 'Ready');
    log('iframe ready', 'success');
    try {
      const w = iframe!.offsetWidth;
      const h = iframe!.offsetHeight;
      const tag = document.getElementById('viewportTag');
      if (tag) tag.textContent = `${w} × ${h}`;
    } catch { /* cross-origin */ }
  };
  iframe.onerror = () => log('iframe load error', 'error');

  container.appendChild(iframe);
  iframe.src = window.__CONFIG__.proxyUrl;
  log(`iframe → ${window.__CONFIG__.proxyUrl}`, 'info');
}

// ── Spec list ─────────────────────────────────────────────────────────────────

interface ParsedTest { suite: string; name: string; }
interface ParsedFile { filename: string; tests: ParsedTest[]; }

async function loadTestList() {
  const container = document.getElementById('testList')!;
  try {
    const resp  = await fetch(API_BASE + '/api/tests');
    const files = await resp.json() as ParsedFile[];
    if (!files.length) {
      container.innerHTML = '<div class="cy-empty">No .js files in examples/</div>';
      return;
    }
    container.innerHTML = files.map(renderTestFileCard).join('');
  } catch (e: any) {
    container.innerHTML = `<div class="cy-empty" style="color:var(--fail)">Failed to load specs<br>${e.message}</div>`;
  }
}

function renderTestFileCard(f: ParsedFile): string {
  const suites: Record<string, string[]> = Object.create(null);
  f.tests.forEach(t => {
    const key = t.suite || '(root)';
    if (!suites[key]) suites[key] = [];
    suites[key].push(t.name);
  });

  const suiteHtml = Object.entries(suites).map(([suite, names]) => {
    const items = names.map(n =>
      '<div class="cy-test-item">' + escHtml(n) + '</div>'
    ).join('');
    return '<div class="cy-suite-row">' +
      '<span class="cy-suite-name">' + escHtml(suite) + '</span>' +
      '<button class="cy-suite-run-btn" onclick="window.runSuite(' + jsq(f.filename) + ',' + jsq(suite) + ')">&#9654;</button>' +
      '</div>' + items;
  }).join('');

  const hasBody = Object.keys(suites).length > 0;
  const ext = f.filename.split('.').pop() ?? 'js';
  const stem = f.filename.slice(0, -(ext.length + 1));

  return '<div class="cy-spec-card" id="card-' + escAttr(f.filename) + '" data-filename="' + escHtml(f.filename) + '">' +
    '<div class="cy-spec-hdr" onclick="window.toggleCard(' + jsq(f.filename) + ')">' +
      '<span class="cy-spec-chevron">›</span>' +
      '<span class="cy-spec-ext">' + escHtml(ext) + '</span>' +
      '<span class="cy-spec-filename">' + escHtml(stem) + '</span>' +
      '<span class="cy-spec-badges" id="badges-' + escAttr(f.filename) + '"></span>' +
      '<button class="cy-spec-run-btn" onclick="event.stopPropagation();window.runTestByFilename(' + jsq(f.filename) + ')">&#9654;</button>' +
    '</div>' +
    (hasBody ? '<div class="cy-spec-body">' + suiteHtml + '</div>' : '') +
    '</div>';
}

window.toggleCard = (filename: string) => {
  document.getElementById('card-' + filename)?.classList.toggle('open');
};

// ── Test execution ────────────────────────────────────────────────────────────

interface TestResult { name: string; passed: boolean; error?: string; duration: number; }

function testExpect(actual: any) {
  const fail = (msg: string) => { throw new Error(msg); };
  const fmt  = (v: any)      => JSON.stringify(v);
  const m: any = {
    toBe:            (e: any) => actual !== e && fail(`Expected ${fmt(e)}, got ${fmt(actual)}`),
    toEqual:         (e: any) => JSON.stringify(actual) !== JSON.stringify(e) && fail(`Expected ${fmt(e)}, got ${fmt(actual)}`),
    toContain:       (e: any) => Array.isArray(actual)
                                   ? (!actual.includes(e)                 && fail(`Array does not contain ${fmt(e)}`))
                                   : (!String(actual).includes(String(e)) && fail(`"${actual}" does not contain "${e}"`)),
    toBeTruthy:      ()       => !actual && fail(`Expected truthy, got ${fmt(actual)}`),
    toBeFalsy:       ()       =>  actual && fail(`Expected falsy, got ${fmt(actual)}`),
    toBeNull:        ()       => actual !== null      && fail(`Expected null, got ${fmt(actual)}`),
    toBeUndefined:   ()       => actual !== undefined && fail(`Expected undefined, got ${fmt(actual)}`),
    toBeGreaterThan: (n: number) => actual <= n && fail(`${fmt(actual)} is not > ${n}`),
    toBeLessThan:    (n: number) => actual >= n && fail(`${fmt(actual)} is not < ${n}`),
    toMatch: (r: RegExp | string) => {
      const re = typeof r === 'string' ? new RegExp(r) : r;
      !re.test(String(actual)) && fail(`"${actual}" does not match ${re}`);
    },
  };
  m.not = {
    toBe:       (e: any) => actual === e && fail(`Expected not ${fmt(e)}`),
    toEqual:    (e: any) => JSON.stringify(actual) === JSON.stringify(e) && fail('Expected values not to be equal'),
    toBeTruthy: ()       =>  actual && fail(`Expected falsy, got ${fmt(actual)}`),
    toBeFalsy:  ()       => !actual && fail(`Expected truthy, got ${fmt(actual)}`),
    toBeNull:   ()       => actual === null && fail('Expected not null'),
  };
  return m;
}

async function executeTests(code: string, options?: { filterSuite?: string }): Promise<TestResult[]> {
  const filterSuite = options?.filterSuite;
  const queue: Array<{ name: string; fn: () => any }> = [];
  const stack: string[] = [];
  const it = (name: string, fn: () => any) => {
    const suite = stack.join(' > ');
    if (filterSuite && suite !== filterSuite) return;
    queue.push({ name: stack.length ? suite + ' > ' + name : name, fn });
  };
  const describe = (name: string, fn: () => void) => { stack.push(name); fn(); stack.pop(); };

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('describe','it','test','expect','cy','setTimeout','clearTimeout','Promise','console', code);
    fn(describe, it, it, testExpect, window.testApi, setTimeout, clearTimeout, Promise, console);
  } catch (e: any) {
    return [{ name: '(parse error)', passed: false, error: e.message, duration: 0 }];
  }

  const results: TestResult[] = [];
  for (const t of queue) {
    const t0 = Date.now();
    try {
      await Promise.resolve(t.fn());
      results.push({ name: t.name, passed: true, duration: Date.now() - t0 });
    } catch (e: any) {
      results.push({ name: t.name, passed: false, error: e.message, duration: Date.now() - t0 });
    }
  }
  return results;
}

function renderTestResults(results: TestResult[], filename?: string) {
  if (filename) logSection(filename);
  let passed = 0, failed = 0;
  for (const t of results) {
    logResult(t);
    t.passed ? passed++ : failed++;
  }
  const status = document.getElementById('testRunnerStatus');
  if (status) {
    status.textContent = `${passed} passed, ${failed} failed`;
    status.style.color = failed === 0 ? 'var(--pass)' : 'var(--fail)';
  }
  if (filename) updateCardStatus(filename, passed, failed);
}

// ── Window-exposed actions ────────────────────────────────────────────────────

window.runTestByFilename = async (filename: string) => {
  setCardRunning(filename);
  log(`run  ${filename}`, 'info');
  try {
    const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const results = await executeTests(await resp.text());
    renderTestResults(results, filename);
  } catch (e: any) {
    log('Error: ' + e.message, 'error');
    updateCardStatus(filename, 0, 1);
  }
};

window.runSuite = async (filename: string, suiteName: string) => {
  setCardRunning(filename);
  log(`suite  "${suiteName}"  in ${filename}`, 'info');
  try {
    const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const results = await executeTests(await resp.text(), { filterSuite: suiteName });
    renderTestResults(results, filename);
  } catch (e: any) {
    log('Error: ' + e.message, 'error');
    updateCardStatus(filename, 0, 1);
  }
};

window.runAll = async () => {
  const btn = document.getElementById('runAllBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  setTopbarStatus('running', 'Running…');

  const cards = Array.from(document.querySelectorAll<HTMLElement>('.cy-spec-card[data-filename]'));
  let totalPass = 0, totalFail = 0;

  for (const card of cards) {
    const filename = card.dataset.filename;
    if (!filename) continue;
    setCardRunning(filename);
    log(`run  ${filename}`, 'info');
    try {
      const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const results = await executeTests(await resp.text());
      renderTestResults(results, filename);
      results.forEach(r => r.passed ? totalPass++ : totalFail++);
    } catch (e: any) {
      log('Error: ' + e.message, 'error');
      updateCardStatus(filename, 0, 1);
      totalFail++;
    }
  }

  const state  = totalFail === 0 ? 'passed' : 'failed';
  const text   = `${totalPass} passed, ${totalFail} failed`;
  setTopbarStatus(state, text);
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

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  log('cypress-safari ready', 'info');
  initIframe();
  loadTestList();
});
