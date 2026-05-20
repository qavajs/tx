export {};

declare global {
  interface Window {
    __CONFIG__: { proxyUrl: string; targetUrl: string; port: number };
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

let viewportW: number | null = null;
let viewportH: number | null = null;
let viewportObserver: ResizeObserver | null = null;

function reapplyViewport() {
  const container = document.getElementById('iframe-container');
  const tag = document.getElementById('viewportTag');
  if (!container || !iframe) return;

  if (!viewportW || !viewportH) {
    iframe.style.position = '';
    iframe.style.top = '';
    iframe.style.left = '';
    iframe.style.width = '';
    iframe.style.height = '';
    iframe.style.transform = '';
    iframe.style.transformOrigin = '';
    if (tag) tag.textContent = `${iframe.offsetWidth} × ${iframe.offsetHeight}`;
    return;
  }

  const cw = container.clientWidth;
  const ch = container.clientHeight;
  if (!cw || !ch) return;

  const scale  = Math.min(cw / viewportW, ch / viewportH);
  const ox     = (cw - viewportW * scale) / 2;
  const oy     = (ch - viewportH * scale) / 2;

  iframe.style.position      = 'absolute';
  iframe.style.top           = '0';
  iframe.style.left          = '0';
  iframe.style.width         = viewportW + 'px';
  iframe.style.height        = viewportH + 'px';
  iframe.style.transform     = `translate(${ox}px,${oy}px) scale(${scale})`;
  iframe.style.transformOrigin = 'top left';
  if (tag) tag.textContent   = `${viewportW} × ${viewportH} @ ${Math.round(scale * 100)}%`;
}

function applyViewport(w: number | null, h: number | null) {
  viewportW = w;
  viewportH = h;
  reapplyViewport();
}

let iframe: HTMLIFrameElement | null = null;
const API_BASE = 'http://localhost:' + window.__CONFIG__.port;

// Extract proxy session prefix from proxyUrl so page.goto() routes through the proxy.
// proxyUrl format: "http://host:port/{sessionId}/{originalUrl}"
// proxyPrefix:     "http://host:port/{sessionId}/"
const _proxyPrefixMatch = window.__CONFIG__.proxyUrl.match(/^(https?:\/\/[^/]+\/[^/]+\/)/);
const _proxyPrefix = _proxyPrefixMatch ? _proxyPrefixMatch[1] : '';

function toProxiedUrl(url: string): string {
  // Already proxied or relative — leave as-is
  if (!_proxyPrefix || url.startsWith(_proxyPrefix) || !/^https?:\/\//.test(url)) return url;
  return _proxyPrefix + url;
}

// ── iframe helpers ────────────────────────────────────────────────────────────

function iframeDoc(): Document | null {
  try { return iframe?.contentDocument ?? null; } catch { return null; }
}
function iframeWin(): Window & typeof globalThis | null {
  try { return iframe?.contentWindow as any ?? null; } catch { return null; }
}

// ── Playwright-style Locator ──────────────────────────────────────────────────

type QueryFn = () => Element[];

function textMatches(el: Element, text: string | RegExp, exact = false): boolean {
  const t = (el.textContent ?? '').trim();
  return text instanceof RegExp ? text.test(t) : exact ? t === text : t.includes(text);
}

class Locator {
  constructor(readonly _query: QueryFn) {}

  _els(): Element[]        { return this._query(); }
  _el():  Element | null   { return this._els()[0] ?? null; }

  async _waitForEl(timeout = 5000): Promise<HTMLElement> {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const el = this._el() as HTMLElement | null;
      if (el) return el;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`Locator timed out after ${timeout}ms — element not found`);
  }

  // ── Chaining ──────────────────────────────────────────────────────────────

  nth(n: number): Locator {
    return new Locator(() => { const e = this._els()[n]; return e ? [e] : []; });
  }
  first(): Locator { return this.nth(0); }
  last():  Locator {
    return new Locator(() => { const a = this._els(); return a.length ? [a[a.length - 1]] : []; });
  }
  filter(opts: { hasText?: string | RegExp; hasNotText?: string | RegExp }): Locator {
    return new Locator(() => this._els().filter(el => {
      if (opts.hasText    && !textMatches(el, opts.hasText))    return false;
      if (opts.hasNotText &&  textMatches(el, opts.hasNotText)) return false;
      return true;
    }));
  }
  locator(selector: string): Locator {
    return new Locator(() =>
      this._els().flatMap(el => Array.from(el.querySelectorAll(selector)))
    );
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async click(opts?: { force?: boolean; timeout?: number }): Promise<void> {
    const el = await this._waitForEl(opts?.timeout);
    el.click();
    log(`click`, 'success');
  }

  async dblclick(opts?: { timeout?: number }): Promise<void> {
    const el = await this._waitForEl(opts?.timeout);
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  }

  async fill(value: string, opts?: { timeout?: number; delay?: number }): Promise<void> {
    const el    = await this._waitForEl(opts?.timeout) as HTMLInputElement | HTMLTextAreaElement;
    const win   = iframeWin() as any;
    const delay = opts?.delay ?? 30;

    // Use the iframe's own constructors so events are trusted by page scripts
    const KE = win.KeyboardEvent as typeof KeyboardEvent;
    const E  = win.Event        as typeof Event;

    // Native value setter — required for React/Vue controlled inputs
    const tag    = el.tagName;
    const proto  = tag === 'INPUT' ? win.HTMLInputElement.prototype : win.HTMLTextAreaElement.prototype;
    const setter = (Object.getOwnPropertyDescriptor(proto, 'value') ?? {}).set;
    const setVal = (v: string) => { if (setter) setter.call(el, v); else (el as any).value = v; };

    // Helper: build keyboard event init for a single character
    const kInit = (ch: string) => {
      const code    = ch === ' ' ? 32 : ch.charCodeAt(0);
      const isAlpha = /[a-zA-Z]/.test(ch);
      return {
        key:        ch,
        code:       ch === ' ' ? 'Space' : isAlpha ? 'Key' + ch.toUpperCase() : 'Unidentified',
        keyCode:    isAlpha ? ch.toUpperCase().charCodeAt(0) : code,
        charCode:   code,
        which:      isAlpha ? ch.toUpperCase().charCodeAt(0) : code,
        bubbles:    true,
        cancelable: true,
      };
    };

    el.focus();
    el.dispatchEvent(new E('focus', { bubbles: true }));

    // Clear existing value with a select-all + delete sequence
    setVal('');
    el.dispatchEvent(new E('input', { bubbles: true }));

    // Type character by character
    let current = '';
    for (const ch of value) {
      const ki = kInit(ch);
      el.dispatchEvent(new KE('keydown',  ki));
      el.dispatchEvent(new KE('keypress', ki));
      current += ch;
      setVal(current);
      el.dispatchEvent(new E('input', { bubbles: true }));
      el.dispatchEvent(new KE('keyup', ki));
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
    }

    el.dispatchEvent(new E('change', { bubbles: true }));
    el.dispatchEvent(new E('blur',   { bubbles: true }));
    log(`fill  "${value}"`, 'success');
  }

  async clear(opts?: { timeout?: number }): Promise<void> { await this.fill('', opts); }

  async type(text: string, opts?: { delay?: number; timeout?: number }): Promise<void> {
    const el = await this._waitForEl(opts?.timeout) as HTMLInputElement;
    el.focus();
    for (const ch of text) {
      if (opts?.delay) await new Promise(r => setTimeout(r, opts.delay));
      el.value += ch;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async press(key: string, opts?: { timeout?: number }): Promise<void> {
    const el = await this._waitForEl(opts?.timeout);
    const kOpts = { key, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown',  kOpts));
    el.dispatchEvent(new KeyboardEvent('keypress', kOpts));
    el.dispatchEvent(new KeyboardEvent('keyup',    kOpts));
    if (key === 'Enter') {
      const form = (el as HTMLInputElement).form;
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  }

  async selectOption(value: string | string[], opts?: { timeout?: number }): Promise<void> {
    const el = await this._waitForEl(opts?.timeout) as HTMLSelectElement;
    const vals = Array.isArray(value) ? value : [value];
    for (const opt of Array.from(el.options)) {
      opt.selected = vals.includes(opt.value) || vals.includes(opt.text);
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async check(opts?: { timeout?: number }): Promise<void> {
    const el = await this._waitForEl(opts?.timeout) as HTMLInputElement;
    if (!el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  async uncheck(opts?: { timeout?: number }): Promise<void> {
    const el = await this._waitForEl(opts?.timeout) as HTMLInputElement;
    if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  async focus(opts?: { timeout?: number }): Promise<void> {
    (await this._waitForEl(opts?.timeout)).focus();
  }

  async hover(opts?: { timeout?: number }): Promise<void> {
    const el = await this._waitForEl(opts?.timeout);
    el.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  }

  async scrollIntoViewIfNeeded(opts?: { timeout?: number }): Promise<void> {
    (await this._waitForEl(opts?.timeout)).scrollIntoView({ block: 'nearest' });
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async textContent(): Promise<string | null> {
    return this._el()?.textContent ?? null;
  }
  async innerText(): Promise<string> {
    return (this._el() as HTMLElement | null)?.innerText ?? '';
  }
  async inputValue(): Promise<string> {
    return (this._el() as HTMLInputElement | null)?.value ?? '';
  }
  async getAttribute(name: string): Promise<string | null> {
    return this._el()?.getAttribute(name) ?? null;
  }
  async isVisible(): Promise<boolean> {
    const el = this._el();
    const win = iframeWin();
    if (!el || !win) return false;
    const s = win.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'
      && (el as HTMLElement).offsetParent !== null;
  }
  async isHidden(): Promise<boolean>  { return !(await this.isVisible()); }
  async isEnabled(): Promise<boolean> {
    const el = this._el() as HTMLInputElement | HTMLButtonElement | null;
    return el ? !el.disabled : false;
  }
  async isDisabled(): Promise<boolean> { return !(await this.isEnabled()); }
  async isChecked(): Promise<boolean>  {
    return (this._el() as HTMLInputElement | null)?.checked ?? false;
  }
  async isEditable(): Promise<boolean> {
    const el = this._el() as HTMLInputElement | null;
    return el ? !el.readOnly && !el.disabled : false;
  }
  async count(): Promise<number> { return this._els().length; }

  async waitFor(opts?: { state?: 'visible'|'hidden'|'attached'|'detached'; timeout?: number }): Promise<void> {
    const state   = opts?.state   ?? 'visible';
    const timeout = opts?.timeout ?? 5000;
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const el = this._el();
      if (state === 'attached'  && el)                         return;
      if (state === 'detached'  && !el)                        return;
      if (state === 'visible'   && await this.isVisible())     return;
      if (state === 'hidden'    && !(await this.isVisible()))  return;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`waitFor(state="${state}") timed out after ${timeout}ms`);
  }
}

// ── Playwright-style page ─────────────────────────────────────────────────────

const ROLE_SELECTORS: Record<string, string> = {
  button:      'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]',
  link:        'a[href], [role="link"]',
  textbox:     'input[type="text"], input[type="email"], input[type="password"], input[type="search"], input[type="tel"], input[type="url"], input:not([type]), textarea, [role="textbox"]',
  checkbox:    'input[type="checkbox"], [role="checkbox"]',
  radio:       'input[type="radio"], [role="radio"]',
  combobox:    'select, [role="combobox"]',
  spinbutton:  'input[type="number"], [role="spinbutton"]',
  heading:     'h1,h2,h3,h4,h5,h6,[role="heading"]',
  img:         'img,[role="img"]',
  listitem:    'li,[role="listitem"]',
  list:        'ul,ol,[role="list"]',
  menuitem:    '[role="menuitem"]',
  tab:         '[role="tab"]',
  option:      'option,[role="option"]',
  navigation:  'nav,[role="navigation"]',
  main:        'main,[role="main"]',
  banner:      'header,[role="banner"]',
  contentinfo: 'footer,[role="contentinfo"]',
};

const page = {
  // ── Navigation ─────────────────────────────────────────────────────────────

  goto(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!iframe) { reject(new Error('iframe not ready')); return; }
      const navInput = document.getElementById('navUrl') as HTMLInputElement | null;
      if (navInput) navInput.value = url;
      const timer = setTimeout(() => reject(new Error(`goto("${url}") timed out`)), 30_000);
      iframe.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
      iframe.src = toProxiedUrl(url);
      log(`goto  ${url}`, 'info');
    });
  },

  reload(): Promise<void> {
    return new Promise((resolve, reject) => {
      const win = iframeWin();
      if (!win) { reject(new Error('iframe not ready')); return; }
      iframe!.addEventListener('load', () => resolve(), { once: true });
      win.location.reload();
    });
  },

  // ── Locator factories ───────────────────────────────────────────────────────

  locator(selector: string): Locator {
    return new Locator(() => {
      const doc = iframeDoc();
      return doc ? Array.from(doc.querySelectorAll(selector)) : [];
    });
  },

  getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator {
    const exact = opts?.exact ?? false;
    return new Locator(() => {
      const doc = iframeDoc();
      if (!doc) return [];
      // Match leaf nodes first, fall back to any element
      const leafs = Array.from(doc.querySelectorAll('*')).filter(
        el => el.children.length === 0 && textMatches(el, text, exact)
      );
      if (leafs.length) return leafs;
      return Array.from(doc.querySelectorAll('*')).filter(el => textMatches(el, text, exact));
    });
  },

  getByRole(role: string, opts?: { name?: string | RegExp; exact?: boolean }): Locator {
    return new Locator(() => {
      const doc = iframeDoc();
      if (!doc) return [];
      const sel = ROLE_SELECTORS[role] ?? `[role="${role}"]`;
      let els = Array.from(doc.querySelectorAll(sel));
      if (opts?.name) {
        const name  = opts.name;
        const exact = opts.exact ?? false;
        els = els.filter(el => {
          const labelledById = el.getAttribute('aria-labelledby');
          const acc = (
            el.getAttribute('aria-label') ??
            (labelledById ? doc.getElementById(labelledById)?.textContent ?? null : null) ??
            (el.tagName === 'INPUT' ? el.getAttribute('value') : null) ??
            (el.textContent ?? '')
          ).trim();
          return name instanceof RegExp ? name.test(acc) : exact ? acc === name : acc.includes(name);
        });
      }
      return els;
    });
  },

  getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator {
    const exact = opts?.exact ?? false;
    return new Locator(() => {
      const doc = iframeDoc();
      if (!doc) return [];
      const results: Element[] = [];
      for (const label of Array.from(doc.querySelectorAll<HTMLLabelElement>('label'))) {
        if (!textMatches(label, text, exact)) continue;
        const target = label.htmlFor
          ? doc.getElementById(label.htmlFor)
          : label.querySelector('input,select,textarea');
        if (target && !results.includes(target)) results.push(target);
      }
      // aria-label fallback
      for (const el of Array.from(doc.querySelectorAll('[aria-label]'))) {
        const lbl = el.getAttribute('aria-label') ?? '';
        const ok  = text instanceof RegExp ? text.test(lbl) : exact ? lbl === text : lbl.includes(text as string);
        if (ok && !results.includes(el)) results.push(el);
      }
      return results;
    });
  },

  getByPlaceholder(text: string | RegExp): Locator {
    return new Locator(() => {
      const doc = iframeDoc();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll('[placeholder]')).filter(el => {
        const p = el.getAttribute('placeholder') ?? '';
        return text instanceof RegExp ? text.test(p) : p.includes(text as string);
      });
    });
  },

  getByTestId(id: string): Locator {
    return new Locator(() => {
      const doc = iframeDoc();
      if (!doc) return [];
      const q = id.replace(/"/g, '\\"');
      // Support both data-testid (Playwright default) and data-test (common alternative)
      return Array.from(doc.querySelectorAll(`[data-testid="${q}"],[data-test="${q}"]`));
    });
  },

  getByAltText(text: string | RegExp): Locator {
    return new Locator(() => {
      const doc = iframeDoc();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll('[alt]')).filter(el => {
        const a = el.getAttribute('alt') ?? '';
        return text instanceof RegExp ? text.test(a) : a.includes(text as string);
      });
    });
  },

  getByTitle(text: string | RegExp): Locator {
    return new Locator(() => {
      const doc = iframeDoc();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll('[title]')).filter(el => {
        const t = el.getAttribute('title') ?? '';
        return text instanceof RegExp ? text.test(t) : t.includes(text as string);
      });
    });
  },

  // ── Page state ─────────────────────────────────────────────────────────────

  async title(): Promise<string> { return iframeDoc()?.title ?? ''; },
  url(): string {
    try {
      const href = iframeWin()?.location.href ?? '';
      return (_proxyPrefix && href.startsWith(_proxyPrefix)) ? href.slice(_proxyPrefix.length) : href;
    } catch { return ''; }
  },

  // ── Waits ──────────────────────────────────────────────────────────────────

  async waitForURL(url: string | RegExp, opts?: { timeout?: number }): Promise<void> {
    const timeout = opts?.timeout ?? 5000;
    const re = typeof url === 'string' ? new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : url;
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (re.test(page.url())) return;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`waitForURL(${url}) timed out — current: ${page.url()}`);
  },

  async waitForSelector(selector: string, opts?: { state?: 'visible'|'attached'; timeout?: number }): Promise<Locator> {
    const loc = page.locator(selector);
    await loc.waitFor({ state: opts?.state ?? 'visible', timeout: opts?.timeout });
    return loc;
  },

  async waitForTimeout(ms: number): Promise<void> {
    await new Promise(r => setTimeout(r, ms));
  },

  // ── Keyboard ───────────────────────────────────────────────────────────────

  keyboard: {
    async press(key: string): Promise<void> {
      const el = iframeDoc()?.activeElement as HTMLElement | null;
      if (el) {
        const o = { key, bubbles: true };
        el.dispatchEvent(new KeyboardEvent('keydown',  o));
        el.dispatchEvent(new KeyboardEvent('keypress', o));
        el.dispatchEvent(new KeyboardEvent('keyup',    o));
      }
    },
    async type(text: string, opts?: { delay?: number }): Promise<void> {
      for (const ch of text) {
        if (opts?.delay) await new Promise(r => setTimeout(r, opts.delay));
        await page.keyboard.press(ch);
      }
    },
  },

  // ── Viewport ───────────────────────────────────────────────────────────────

  setViewportSize(size: { width: number; height: number }): void {
    applyViewport(size.width, size.height);
    log(`viewport  ${size.width} × ${size.height}`, 'info');
  },
};

// ── Playwright-style expect ───────────────────────────────────────────────────

async function _retry(fn: () => Promise<void>, timeout = 5000): Promise<void> {
  const t0 = Date.now();
  let last: Error = new Error('Timeout');
  while (Date.now() - t0 < timeout) {
    try { await fn(); return; } catch (e: any) { last = e; }
    await new Promise(r => setTimeout(r, 50));
  }
  throw last;
}

function pwExpect(target: any) {
  const t      = (ms?: number) => ms ?? 5000;

  const matchers = {
    // ── Locator assertions (auto-retry) ────────────────────────────────────
    async toBeVisible     (opts?: { timeout?: number }) {
      await _retry(async () => { if (!await (target as Locator).isVisible())   throw new Error('Expected element to be visible'); },   t(opts?.timeout));
    },
    async toBeHidden      (opts?: { timeout?: number }) {
      await _retry(async () => { if ( await (target as Locator).isVisible())   throw new Error('Expected element to be hidden'); },    t(opts?.timeout));
    },
    async toBeEnabled     (opts?: { timeout?: number }) {
      await _retry(async () => { if (!await (target as Locator).isEnabled())   throw new Error('Expected element to be enabled'); },   t(opts?.timeout));
    },
    async toBeDisabled    (opts?: { timeout?: number }) {
      await _retry(async () => { if ( await (target as Locator).isEnabled())   throw new Error('Expected element to be disabled'); },  t(opts?.timeout));
    },
    async toBeChecked     (opts?: { timeout?: number }) {
      await _retry(async () => { if (!await (target as Locator).isChecked())   throw new Error('Expected element to be checked'); },   t(opts?.timeout));
    },
    async toBeEditable    (opts?: { timeout?: number }) {
      await _retry(async () => { if (!await (target as Locator).isEditable())  throw new Error('Expected element to be editable'); },  t(opts?.timeout));
    },
    async toBeEmpty       (opts?: { timeout?: number }) {
      await _retry(async () => {
        const v = await (target as Locator).inputValue();
        if (v !== '') throw new Error(`Expected empty input, got "${v}"`);
      }, t(opts?.timeout));
    },
    async toHaveText(text: string | RegExp, opts?: { exact?: boolean; timeout?: number }) {
      const exact = opts?.exact ?? false;
      await _retry(async () => {
        const got = ((await (target as Locator).textContent()) ?? '').trim();
        const ok  = text instanceof RegExp ? text.test(got)
                  : exact ? got === text : got.includes(text as string);
        if (!ok) throw new Error(`Expected text to ${exact ? 'equal' : 'include'} ${JSON.stringify(text)}, got ${JSON.stringify(got)}`);
      }, t(opts?.timeout));
    },
    async toContainText(text: string | RegExp, opts?: { timeout?: number }) {
      await _retry(async () => {
        const got = (await (target as Locator).textContent()) ?? '';
        const ok  = text instanceof RegExp ? text.test(got) : got.includes(text as string);
        if (!ok) throw new Error(`Expected "${got}" to contain ${JSON.stringify(text)}`);
      }, t(opts?.timeout));
    },
    async toHaveValue(value: string | RegExp, opts?: { timeout?: number }) {
      await _retry(async () => {
        const got = await (target as Locator).inputValue();
        const ok  = value instanceof RegExp ? value.test(got) : got === value;
        if (!ok) throw new Error(`Expected value ${JSON.stringify(value)}, got ${JSON.stringify(got)}`);
      }, t(opts?.timeout));
    },
    async toHaveAttribute(name: string, value: string | RegExp, opts?: { timeout?: number }) {
      await _retry(async () => {
        const a  = await (target as Locator).getAttribute(name);
        const ok = value instanceof RegExp ? value.test(a ?? '') : a === value;
        if (!ok) throw new Error(`Expected [${name}]=${JSON.stringify(value)}, got ${JSON.stringify(a)}`);
      }, t(opts?.timeout));
    },
    async toHaveCount(count: number, opts?: { timeout?: number }) {
      await _retry(async () => {
        const n = await (target as Locator).count();
        if (n !== count) throw new Error(`Expected ${count} elements, found ${n}`);
      }, t(opts?.timeout));
    },
    async toHaveClass(cls: string | RegExp, opts?: { timeout?: number }) {
      await _retry(async () => {
        const c  = (target as Locator)._el()?.className ?? '';
        const ok = cls instanceof RegExp ? cls.test(c) : c.split(/\s+/).includes(cls);
        if (!ok) throw new Error(`Expected class ${JSON.stringify(cls)}, got "${c}"`);
      }, t(opts?.timeout));
    },
    // ── Page-level assertions ───────────────────────────────────────────────
    async toHaveURL(url: string | RegExp, opts?: { timeout?: number }) {
      await _retry(async () => {
        const u  = page.url();
        const ok = url instanceof RegExp ? url.test(u) : u.includes(url as string);
        if (!ok) throw new Error(`Expected URL to match ${url}, got "${u}"`);
      }, t(opts?.timeout));
    },
    async toHaveTitle(title: string | RegExp, opts?: { timeout?: number }) {
      await _retry(async () => {
        const got = await page.title();
        const ok  = title instanceof RegExp ? title.test(got) : got === title;
        if (!ok) throw new Error(`Expected title ${JSON.stringify(title)}, got "${got}"`);
      }, t(opts?.timeout));
    },
    // ── Plain-value assertions (sync, for non-Locator targets) ─────────────
    toBe(expected: any) {
      if (target !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(target)}`);
    },
    toEqual(expected: any) {
      if (JSON.stringify(target) !== JSON.stringify(expected))
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(target)}`);
    },
    toBeTruthy() { if (!target) throw new Error(`Expected truthy, got ${JSON.stringify(target)}`); },
    toBeFalsy()  { if (target)  throw new Error(`Expected falsy, got ${JSON.stringify(target)}`);  },
    toBeNull()        { if (target !== null)      throw new Error(`Expected null, got ${JSON.stringify(target)}`); },
    toBeUndefined()   { if (target !== undefined) throw new Error(`Expected undefined, got ${JSON.stringify(target)}`); },
    toBeGreaterThan(n: number) { if (target <= n) throw new Error(`${target} is not > ${n}`); },
    toBeLessThan(n: number)    { if (target >= n) throw new Error(`${target} is not < ${n}`); },
    toContain(item: any) {
      if (Array.isArray(target)) {
        if (!target.includes(item)) throw new Error(`Array does not contain ${JSON.stringify(item)}`);
      } else {
        if (!String(target).includes(String(item))) throw new Error(`"${target}" does not contain "${item}"`);
      }
    },
    toMatch(r: RegExp | string) {
      const re = typeof r === 'string' ? new RegExp(r) : r;
      if (!re.test(String(target))) throw new Error(`"${target}" does not match ${re}`);
    },
  };

  const not = {
    async toBeVisible(opts?: { timeout?: number }) {
      await _retry(async () => { if ( await (target as Locator).isVisible())  throw new Error('Expected NOT visible'); },  t(opts?.timeout));
    },
    async toBeHidden(opts?: { timeout?: number }) {
      await _retry(async () => { if (!await (target as Locator).isVisible())  throw new Error('Expected NOT hidden'); },   t(opts?.timeout));
    },
    async toBeEnabled(opts?: { timeout?: number }) {
      await _retry(async () => { if ( await (target as Locator).isEnabled())  throw new Error('Expected NOT enabled'); },  t(opts?.timeout));
    },
    async toBeChecked(opts?: { timeout?: number }) {
      await _retry(async () => { if ( await (target as Locator).isChecked())  throw new Error('Expected NOT checked'); },  t(opts?.timeout));
    },
    async toHaveText(text: string | RegExp, opts?: { exact?: boolean; timeout?: number }) {
      const exact = opts?.exact ?? false;
      await _retry(async () => {
        const got = ((await (target as Locator).textContent()) ?? '').trim();
        const ok  = text instanceof RegExp ? text.test(got) : exact ? got === text : got.includes(text as string);
        if (ok) throw new Error(`Expected text NOT to match ${JSON.stringify(text)}`);
      }, t(opts?.timeout));
    },
    async toContainText(text: string | RegExp, opts?: { timeout?: number }) {
      await _retry(async () => {
        const got = (await (target as Locator).textContent()) ?? '';
        const ok  = text instanceof RegExp ? text.test(got) : got.includes(text as string);
        if (ok) throw new Error(`Expected NOT to contain ${JSON.stringify(text)}`);
      }, t(opts?.timeout));
    },
    async toHaveCount(count: number, opts?: { timeout?: number }) {
      await _retry(async () => {
        const n = await (target as Locator).count();
        if (n === count) throw new Error(`Expected count NOT to be ${count}`);
      }, t(opts?.timeout));
    },
    async toHaveURL(url: string | RegExp, opts?: { timeout?: number }) {
      await _retry(async () => {
        const u  = page.url();
        const ok = url instanceof RegExp ? url.test(u) : u.includes(url as string);
        if (ok) throw new Error(`Expected URL NOT to match ${url}`);
      }, t(opts?.timeout));
    },
    toBe(expected: any)       { if (target === expected)  throw new Error(`Expected NOT ${JSON.stringify(expected)}`); },
    toBeTruthy()               { if (target)   throw new Error(`Expected falsy, got ${JSON.stringify(target)}`); },
    toBeFalsy()                { if (!target)  throw new Error(`Expected truthy, got ${JSON.stringify(target)}`); },
    toBeNull()                 { if (target === null)     throw new Error('Expected NOT null'); },
    toContain(item: any) {
      if (Array.isArray(target)) {
        if (target.includes(item)) throw new Error(`Expected array NOT to contain ${JSON.stringify(item)}`);
      } else {
        if (String(target).includes(String(item))) throw new Error(`Expected NOT to contain "${item}"`);
      }
    },
    async toBeEmpty(opts?: { timeout?: number }) {
      await _retry(async () => {
        const v = await (target as Locator).inputValue();
        if (v === '') throw new Error('Expected input NOT to be empty');
      }, t(opts?.timeout));
    },
  };

  return { ...matchers, not };
}

// ── Legacy cy API (backward compat) ──────────────────────────────────────────

const testApi = {
  visit(url: string) {
    if (!iframe) { log('iframe not ready', 'error'); return; }
    iframe.src = url;
    (document.getElementById('navUrl') as HTMLInputElement | null)!.value = url;
    log(`visit  ${url}`, 'info');
  },
  reload() {
    if (!iframe) { log('iframe not ready', 'error'); return; }
    iframeWin()!.location.reload();
  },
  get(selector: string): Element[] {
    try { return iframeDoc() ? Array.from(iframeDoc()!.querySelectorAll(selector)) : []; }
    catch { log('Cross-origin blocked', 'error'); return []; }
  },
  find(selector: string): Element | null {
    try { return iframeDoc()?.querySelector(selector) ?? null; } catch { return null; }
  },
  text(selector: string): string {
    return testApi.find(selector)?.textContent ?? '';
  },
  click(selector: string) {
    const el = testApi.find(selector) as HTMLElement | null;
    if (!el) { log(`click: not found  ${selector}`, 'error'); return; }
    el.click();
    log(`click  ${selector}`, 'success');
  },
  type(selector: string, value: string) {
    const el = testApi.find(selector) as HTMLInputElement | null;
    if (!el) { log(`type: not found  ${selector}`, 'error'); return; }
    const win = iframeWin() as any;
    const proto  = el.tagName === 'INPUT' ? win.HTMLInputElement.prototype : win.HTMLTextAreaElement.prototype;
    const setter = (Object.getOwnPropertyDescriptor(proto, 'value') ?? {}).set;
    el.focus();
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    log(`type  ${selector}  "${value}"`, 'success');
  },
  isVisible(selector: string): boolean {
    const el = testApi.find(selector);
    const win = iframeWin();
    if (!el || !win) return false;
    const s = win.getComputedStyle(el);
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
        if (Date.now() - t0 >= timeout) return reject(new Error('Timeout: ' + selector));
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
        if (re.test(page.url())) return resolve();
        if (Date.now() - t0 >= timeout) return reject(new Error('Timeout URL: ' + pattern));
        setTimeout(tick, 100);
      };
      tick();
    });
  },
  wait(ms = 500): Promise<void> { return new Promise(r => setTimeout(r, ms)); },
  url():   string { return page.url(); },
  title(): string { return iframeDoc()?.title ?? ''; },
};

window.testApi = testApi;

// ── Command Log ───────────────────────────────────────────────────────────────

function log(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const container = document.getElementById('console');
  if (!container) return;
  const cls   = type === 'success' ? 'pass' : type === 'error' ? 'fail' : 'info';
  const icon  = type === 'success' ? '✓'   : type === 'error'  ? '✗'    : '›';
  const label = type === 'success' ? 'ok'  : type === 'error'  ? 'err'   : 'log';
  const entry = document.createElement('div');
  entry.className = `cy-cmd ${cls}`;
  const iconEl  = document.createElement('span'); iconEl.className  = `cy-cmd-icon ${cls}`;  iconEl.textContent  = icon;
  const labelEl = document.createElement('span'); labelEl.className = `cy-cmd-label ${cls}`; labelEl.textContent = label;
  const msgEl   = document.createElement('span'); msgEl.className   = 'cy-cmd-msg';          msgEl.textContent   = message;
  entry.appendChild(iconEl); entry.appendChild(labelEl); entry.appendChild(msgEl);
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
  const iconEl = document.createElement('span'); iconEl.className = `cy-cmd-icon ${cls}`; iconEl.textContent = icon;
  const msgEl  = document.createElement('span'); msgEl.className  = 'cy-cmd-msg';         msgEl.textContent  = t.name + (t.error ? '  —  ' + t.error : '');
  const durEl  = document.createElement('span'); durEl.className  = 'cy-cmd-dur';          durEl.textContent  = t.duration + 'ms';
  entry.appendChild(iconEl); entry.appendChild(msgEl); entry.appendChild(durEl);
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

// ── Spec card helpers ─────────────────────────────────────────────────────────

function setCardRunning(filename: string) {
  const b = document.getElementById('badges-' + escAttr(filename));
  if (b) b.innerHTML = '<span class="cy-badge" style="color:var(--warn)">●</span>';
}

function updateCardStatus(filename: string, passed: number, failed: number) {
  const b = document.getElementById('badges-' + escAttr(filename));
  if (!b) return;
  b.innerHTML = (passed > 0 ? `<span class="cy-badge cy-badge--pass">${passed}</span>` : '')
              + (failed > 0 ? `<span class="cy-badge cy-badge--fail">${failed}</span>` : '');
}

function setTestItemStatus(filename: string, fullName: string, state: 'running'|'pass'|'fail', duration?: number) {
  const key = escAttr(filename + '\x01' + fullName);
  const item = document.querySelector<HTMLElement>(`[data-testkey="${key}"]`);
  if (!item) return;
  item.classList.remove('running', 'pass', 'fail');
  item.classList.add(state);
  const dot   = item.querySelector('.cy-test-dot');
  const badge = item.querySelector<HTMLElement>('.cy-test-badge');
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
  card?.querySelectorAll('.cy-test-item, .cy-test-dot')
    .forEach(el => el.classList.remove('running', 'pass', 'fail'));
  card?.querySelectorAll<HTMLElement>('.cy-test-badge')
    .forEach(el => { el.className = 'cy-test-badge'; el.textContent = ''; });
  card?.querySelectorAll<HTMLElement>('.cy-suite-badges')
    .forEach(el => { el.innerHTML = ''; });
}

function refreshSuiteBadge(filename: string, suiteName: string) {
  const card = document.getElementById('card-' + escAttr(filename));
  if (!card) return;
  const items = Array.from(card.querySelectorAll<HTMLElement>('.cy-test-item')).filter(
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
    b.innerHTML = '<span class="cy-badge" style="color:var(--warn)">●</span>';
  } else {
    b.innerHTML = (pass > 0 ? `<span class="cy-badge cy-badge--pass">${pass}</span>` : '')
                + (fail > 0 ? `<span class="cy-badge cy-badge--fail">${fail}</span>` : '');
  }
}

function setTopbarStatus(state: 'ready'|'running'|'passed'|'failed', text: string) {
  const dot  = document.getElementById('statusIndicator');
  const span = document.getElementById('statusText');
  if (dot)  dot.className   = 'cy-status-dot ' + state;
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
    reapplyViewport();
  };
  iframe.onerror = () => log('iframe load error', 'error');
  container.appendChild(iframe);
  iframe.src = API_BASE + '/mock';
  log(`iframe → mock page`, 'info');

  viewportObserver?.disconnect();
  viewportObserver = new ResizeObserver(reapplyViewport);
  viewportObserver.observe(container);
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
      : '<div class="cy-empty">No .js files in examples/</div>';
  } catch (e: any) {
    container.innerHTML = `<div class="cy-empty" style="color:var(--fail)">Failed to load specs<br>${e.message}</div>`;
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
    '<div class="cy-suite-row">' +
      '<span class="cy-suite-name">' + escHtml(s) + '</span>' +
      '<span class="cy-suite-badges" id="sbadges-' + escAttr(f.filename + '\x01' + s) + '"></span>' +
      '<button class="cy-suite-run-btn" onclick="window.runSuite(' + jsq(f.filename) + ',' + jsq(s) + ')">&#9654;</button>' +
    '</div>' + names.map(n => {
      const fullName = s === '(root)' ? n : s + ' > ' + n;
      return '<div class="cy-test-item" data-testkey="' + escAttr(f.filename + '\x01' + fullName) + '" data-suite="' + escHtml(s) + '">' +
        '<span class="cy-test-dot"></span>' +
        '<span class="cy-test-name">' + escHtml(n) + '</span>' +
        '<span class="cy-test-badge"></span>' +
        '<button class="cy-test-run-btn" onclick="event.stopPropagation();window.runTest(' + jsq(f.filename) + ',' + jsq(fullName) + ')">&#9654;</button>' +
      '</div>';
    }).join('')
  ).join('');
  const ext  = f.filename.split('.').pop() ?? 'js';
  const stem = f.filename.slice(0, -(ext.length + 1));
  return '<div class="cy-spec-card" id="card-' + escAttr(f.filename) + '" data-filename="' + escHtml(f.filename) + '">' +
    '<div class="cy-spec-hdr" onclick="window.toggleCard(' + jsq(f.filename) + ')">' +
      '<span class="cy-spec-chevron">&#9658;</span>' +
      '<span class="cy-spec-ext">' + escHtml(ext) + '</span>' +
      '<span class="cy-spec-filename">' + escHtml(stem) + '</span>' +
      '<span class="cy-spec-badges" id="badges-' + escAttr(f.filename) + '"></span>' +
      '<button class="cy-spec-run-btn" onclick="event.stopPropagation();window.runTestByFilename(' + jsq(f.filename) + ')">&#9654;</button>' +
    '</div>' +
    (Object.keys(suites).length ? '<div class="cy-spec-body">' + suiteHtml + '</div>' : '') +
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
  const queue: Array<{ name: string; fn: () => any }> = [];
  const stack: string[] = [];
  const it = (name: string, fn: () => any) => {
    const suite    = stack.join(' > ');
    const fullName = stack.length ? suite + ' > ' + name : name;
    if (filterSuite && suite !== filterSuite) return;
    if (filterTest && fullName !== filterTest) return;
    queue.push({ name: fullName, fn });
  };
  const describe = (name: string, fn: () => void) => { stack.push(name); fn(); stack.pop(); };

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'describe','it','test','expect','cy','page',
      'setTimeout','clearTimeout','Promise','console',
      code
    );
    fn(describe, it, it, pwExpect, testApi, page, setTimeout, clearTimeout, Promise, console);
  } catch (e: any) {
    return [{ name: '(parse/compile error)', passed: false, error: e.message, duration: 0 }];
  }

  const results: TestResult[] = [];
  for (const t of queue) {
    if (filename) setTestItemStatus(filename, t.name, 'running');
    const t0 = Date.now();
    try {
      await Promise.resolve(t.fn());
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
    renderTestResults(await executeTests(await resp.text(), { filename }), filename);
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
    renderTestResults(await executeTests(await resp.text(), { filterSuite: suiteName, filename }), filename);
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
    renderTestResults(await executeTests(await resp.text(), { filterTest: fullName, filename }), filename);
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
  for (const card of Array.from(document.querySelectorAll<HTMLElement>('.cy-spec-card[data-filename]'))) {
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

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  log('cypress-safari ready', 'info');
  initIframe();
  loadTestList();
});
