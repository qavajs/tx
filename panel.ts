export {};

declare global {
  interface Window {
    __CONFIG__: { proxyUrl: string; targetUrl: string; port: number };
    testApi: typeof testApi;
    runTestInBrowser: () => void;
    runTestOnServer: () => void;
    runSuite: (filename: string, suiteName: string) => void;
    toggleCard: (filename: string) => void;
    runTestByFilename: (filename: string) => void;
  }
}

let iframe: HTMLIFrameElement | null = null;

const API_BASE = 'http://localhost:' + window.__CONFIG__.port;

const testApi = {
  visit(url: string) {
    if (!iframe) { log('iframe not ready', 'error'); return; }
    iframe.src = url;
    log(`Navigating to: ${url}`, 'info');
  },

  reload() {
    if (!iframe) { log('iframe not ready', 'error'); return; }
    iframe.contentWindow!.location.reload();
    log('Page reloaded', 'info');
  },

  get(selector: string): Element[] {
    try {
      if (!iframe || !iframe.contentDocument) return [];
      return Array.from(iframe.contentDocument.querySelectorAll(selector));
    } catch {
      log('Cross-origin access blocked. Open via proxy URL, not localhost:3000 directly.', 'error');
      return [];
    }
  },

  find(selector: string): Element | null {
    try {
      if (!iframe || !iframe.contentDocument) return null;
      return iframe.contentDocument.querySelector(selector);
    } catch {
      return null;
    }
  },

  text(selector: string): string {
    const el = testApi.find(selector);
    return el ? el.textContent || '' : '';
  },

  click(selector: string) {
    const el = testApi.find(selector) as HTMLElement | null;
    if (!el) { log(`Element not found: ${selector}`, 'error'); return; }
    el.click();
    log(`Clicked: ${selector}`, 'success');
  },

  type(selector: string, text: string) {
    const el = testApi.find(selector) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!el) { log(`Element not found: ${selector}`, 'error'); return; }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const win = iframe!.contentWindow! as any;
      const proto = el.tagName === 'INPUT'
        ? win.HTMLInputElement.prototype
        : win.HTMLTextAreaElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
      el.focus();
      el.dispatchEvent(new Event('focus', { bubbles: true }));
      nativeSetter.call(el, text);
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur',   { bubbles: true }));
      log(`Typed: ${text}`, 'success');
    }
  },

  isVisible(selector: string): boolean {
    const el = testApi.find(selector);
    if (!el || !iframe || !iframe.contentWindow) return false;
    const style = iframe.contentWindow.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  },

  attr(selector: string, attrName: string): string | null {
    const el = testApi.find(selector);
    return el ? el.getAttribute(attrName) : null;
  },

  waitForElement(selector: string, timeout = 5000): Promise<Element> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const el = testApi.find(selector);
        if (el) return resolve(el);
        if (Date.now() - start >= timeout) return reject(new Error('Timeout waiting for: ' + selector));
        setTimeout(check, 100);
      };
      check();
    });
  },

  waitForUrl(pattern: string | RegExp, timeout = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
      const check = () => {
        if (re.test(testApi.url())) return resolve();
        if (Date.now() - start >= timeout) return reject(new Error('Timeout waiting for URL: ' + pattern));
        setTimeout(check, 100);
      };
      check();
    });
  },

  wait(ms = 500): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  url(): string {
    try { return iframe && iframe.contentWindow ? iframe.contentWindow.location.href : ''; }
    catch { return ''; }
  },

  title(): string {
    try { return iframe && iframe.contentDocument ? iframe.contentDocument.title : ''; }
    catch { return ''; }
  },
};

window.testApi = testApi;

// ── Logging ──────────────────────────────────────────────────────────────────

function log(message: string, type = 'info') {
  const el = document.getElementById('console')!;
  const line = document.createElement('div');
  line.className = 'console-line ' + type;
  line.textContent = '> ' + message;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
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
    log('iframe loaded', 'success');
    document.getElementById('statusIndicator')!.className = 'status-indicator ready';
    document.getElementById('statusText')!.textContent = 'Ready';
  };
  iframe.onerror = () => log('iframe error', 'error');

  container.appendChild(iframe);
  iframe.src = window.__CONFIG__.proxyUrl;
  log('iframe created and navigating to proxy...', 'info');
}

// ── Test list ─────────────────────────────────────────────────────────────────

interface ParsedTest { suite: string; name: string; }
interface ParsedFile { filename: string; tests: ParsedTest[]; }

async function loadTestList() {
  const container = document.getElementById('testList')!;
  try {
    const resp = await fetch(API_BASE + '/api/tests');
    const files = await resp.json() as ParsedFile[];
    if (!files.length) {
      container.innerHTML = '<div class="test-list-empty">No .js files in examples/</div>';
      return;
    }
    container.innerHTML = files.map(renderTestFileCard).join('');
  } catch (e: any) {
    container.innerHTML = '<div class="test-list-empty" style="color:#f44336;">Failed to load: ' + e.message + '</div>';
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
    const items = names.map(n => '<div class="test-item-name">' + escHtml(n) + '</div>').join('');
    return '<div class="test-suite-row">' +
      '<span class="test-suite-name">' + escHtml(suite) + '</span>' +
      '<button class="test-suite-run" onclick="runSuite(' + jsq(f.filename) + ',' + jsq(suite) + ')">&#9654;</button>' +
      '</div>' + items;
  }).join('');

  const hasBody = Object.keys(suites).length > 0;
  return '<div class="test-file-card" id="card-' + escAttr(f.filename) + '">' +
    '<div class="test-file-header" onclick="toggleCard(' + jsq(f.filename) + ')">' +
      '<span class="test-file-name">' + escHtml(f.filename) + '</span>' +
      '<button class="test-file-run" onclick="event.stopPropagation();runTestByFilename(' + jsq(f.filename) + ')">&#9654; Run</button>' +
    '</div>' +
    (hasBody ? '<div class="test-file-body">' + suiteHtml + '</div>' : '') +
    '</div>';
}

window.toggleCard = (filename: string) => {
  document.getElementById('card-' + filename)?.classList.toggle('open');
};

window.runTestByFilename = async (filename: string) => {
  log('Fetching ' + filename + '…', 'info');
  try {
    const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const results = await executeTests(await resp.text());
    renderTestResults(results);
  } catch (e: any) {
    log('Error: ' + e.message, 'error');
  }
};

window.runSuite = async (filename: string, suiteName: string) => {
  log('Fetching ' + filename + '…', 'info');
  try {
    const resp = await fetch(API_BASE + '/api/test-source?file=' + encodeURIComponent(filename));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    log('Running suite "' + suiteName + '" from ' + filename + '…', 'info');
    const results = await executeTests(await resp.text(), { filterSuite: suiteName });
    renderTestResults(results);
  } catch (e: any) {
    log('Error: ' + e.message, 'error');
  }
};

// ── HTML helpers ──────────────────────────────────────────────────────────────

function escHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s: string) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '_');
}
function jsq(s: string) {
  return JSON.stringify(s).replace(/"/g, '&quot;');
}

// ── Test runner ───────────────────────────────────────────────────────────────

interface TestResult { name: string; passed: boolean; error?: string; duration: number; }

function testExpect(actual: any) {
  const fail = (msg: string) => { throw new Error(msg); };
  const fmt  = (v: any)      => JSON.stringify(v);
  const m: any = {
    toBe:            (e: any) => actual !== e && fail('Expected ' + fmt(e) + ', got ' + fmt(actual)),
    toEqual:         (e: any) => JSON.stringify(actual) !== JSON.stringify(e) && fail('Expected ' + fmt(e) + ', got ' + fmt(actual)),
    toContain:       (e: any) => Array.isArray(actual)
                                   ? (!actual.includes(e)                 && fail('Array does not contain ' + fmt(e)))
                                   : (!String(actual).includes(String(e)) && fail('"' + actual + '" does not contain "' + e + '"')),
    toBeTruthy:      ()       => !actual  && fail('Expected truthy, got ' + fmt(actual)),
    toBeFalsy:       ()       =>  actual  && fail('Expected falsy, got '  + fmt(actual)),
    toBeNull:        ()       => actual !== null      && fail('Expected null, got ' + fmt(actual)),
    toBeUndefined:   ()       => actual !== undefined && fail('Expected undefined, got ' + fmt(actual)),
    toBeGreaterThan: (n: number) => actual <= n && fail(fmt(actual) + ' is not > ' + n),
    toBeLessThan:    (n: number) => actual >= n && fail(fmt(actual) + ' is not < ' + n),
    toMatch: (r: RegExp | string) => {
      const re = typeof r === 'string' ? new RegExp(r) : r;
      !re.test(String(actual)) && fail('"' + actual + '" does not match ' + re);
    },
  };
  m.not = {
    toBe:       (e: any) => actual === e  && fail('Expected not ' + fmt(e)),
    toEqual:    (e: any) => JSON.stringify(actual) === JSON.stringify(e) && fail('Expected values not to be equal'),
    toBeTruthy: ()       =>  actual  && fail('Expected falsy, got '  + fmt(actual)),
    toBeFalsy:  ()       => !actual  && fail('Expected truthy, got ' + fmt(actual)),
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
  const results: TestResult[] = [];

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('describe', 'it', 'test', 'expect', 'cy', 'setTimeout', 'clearTimeout', 'Promise', 'console', code);
    fn(describe, it, it, testExpect, window.testApi, setTimeout, clearTimeout, Promise, console);
  } catch (e: any) {
    return [{ name: '(parse error)', passed: false, error: e.message, duration: 0 }];
  }

  for (const t of queue) {
    const start = Date.now();
    try {
      await Promise.resolve(t.fn());
      results.push({ name: t.name, passed: true, duration: Date.now() - start });
    } catch (e: any) {
      results.push({ name: t.name, passed: false, error: e.message, duration: Date.now() - start });
    }
  }
  return results;
}

function renderTestResults(results: TestResult[]) {
  let passed = 0, failed = 0;
  for (const t of results) {
    if (t.passed) { passed++; log('✅ ' + t.name + ' (' + t.duration + 'ms)', 'success'); }
    else          { failed++; log('❌ ' + t.name + (t.error ? ': ' + t.error : '') + ' (' + t.duration + 'ms)', 'error'); }
  }
  const status = document.getElementById('testRunnerStatus')!;
  status.textContent = passed + ' passed, ' + failed + ' failed';
  status.style.color = failed === 0 ? '#4caf50' : '#f44336';
}

window.runTestInBrowser = async () => {
  const input = document.getElementById('testFileInput') as HTMLInputElement;
  const file  = input.files?.[0];
  if (!file) { log('Select a .js test file first', 'error'); return; }
  log('Running ' + file.name + ' in browser...', 'info');
  renderTestResults(await executeTests(await file.text()));
};

window.runTestOnServer = async () => {
  const input = document.getElementById('testFileInput') as HTMLInputElement;
  const file  = input.files?.[0];
  if (!file) { log('Select a .js test file first', 'error'); return; }
  log('Uploading ' + file.name + ' to server...', 'info');
  try {
    const resp = await fetch(API_BASE + '/api/run-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: await file.text() }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json() as any;
    if (data.error) throw new Error(data.error);
    renderTestResults(data.tests);
    log('Server: ' + data.passed + ' passed, ' + data.failed + ' failed (' + data.duration + 'ms)',
      data.failed === 0 ? 'success' : 'error');
  } catch (e: any) {
    log('Server error: ' + e.message, 'error');
  }
};

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  log('Control Panel loaded', 'success');
  initIframe();
  loadTestList();
});
