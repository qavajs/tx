// ── Global types ──────────────────────────────────────────────────────────────

declare global {
  interface Window {
    __CONFIG__: { proxyUrl: string; targetUrl: string; port: number };
  }
}

// ── Viewport ──────────────────────────────────────────────────────────────────

let viewportW: number | null = null;
let viewportH: number | null = null;
let viewportObserver: ResizeObserver | null = null;

export function reapplyViewport() {
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

  const scale = Math.min(cw / viewportW, ch / viewportH);
  const ox    = (cw - viewportW * scale) / 2;
  const oy    = (ch - viewportH * scale) / 2;

  iframe.style.position      = 'absolute';
  iframe.style.top           = '0';
  iframe.style.left          = '0';
  iframe.style.width         = viewportW + 'px';
  iframe.style.height        = viewportH + 'px';
  iframe.style.transform     = `translate(${ox}px,${oy}px) scale(${scale})`;
  iframe.style.transformOrigin = 'top left';
  if (tag) tag.textContent   = `${viewportW} × ${viewportH} @ ${Math.round(scale * 100)}%`;
}

export function applyViewport(w: number | null, h: number | null) {
  viewportW = w;
  viewportH = h;
  reapplyViewport();
}

// ── iframe state ──────────────────────────────────────────────────────────────

let iframe: HTMLIFrameElement | null = null;

export const API_BASE = 'http://localhost:' + window.__CONFIG__.port;

const _proxyPrefixMatch = window.__CONFIG__.proxyUrl.match(/^(https?:\/\/[^/]+\/[^/]+\/)/);
const _proxyPrefix = _proxyPrefixMatch ? _proxyPrefixMatch[1] : '';

export function toProxiedUrl(url: string): string {
  if (!_proxyPrefix || url.startsWith(_proxyPrefix) || !/^https?:\/\//.test(url)) return url;
  return _proxyPrefix + url;
}

// ── iframe helpers ────────────────────────────────────────────────────────────

export function iframeDoc(): Document | null {
  try { return iframe?.contentDocument ?? null; } catch { return null; }
}
export function iframeWin(): Window & typeof globalThis | null {
  try { return iframe?.contentWindow as any ?? null; } catch { return null; }
}

// ── Command Log ───────────────────────────────────────────────────────────────

export function log(message: string, type: 'info' | 'success' | 'error' = 'info') {
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

// ── Playwright-style Locator ──────────────────────────────────────────────────

type QueryFn = () => Element[];

function textMatches(el: Element, text: string | RegExp, exact = false): boolean {
  const t = (el.textContent ?? '').trim();
  return text instanceof RegExp ? text.test(t) : exact ? t === text : t.includes(text);
}

/** Parse `:has-text("...")` pseudo-classes out of a selector string. */
function resolveSelector(selector: string): { base: string; hasText: string | null }[] {
  return selector.split(',').map(s => {
    s = s.trim();
    const m = s.match(/:has-text\(["'](.+?)["']\)/);
    if (m) {
      const base = s.replace(/:has-text\(["'](.+?)["']\)/, '').trim() || '*';
      return { base, hasText: m[1] };
    }
    return { base: s, hasText: null };
  });
}

export class Locator {
  constructor(readonly _query: QueryFn) {}

  _els(): Element[]      { return this._query(); }
  _el():  Element | null { return this._els()[0] ?? null; }

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
    return new Locator(() => {
      const parts = resolveSelector(selector);
      const seen = new Set<Element>();
      const out: Element[] = [];
      for (const root of this._els()) {
        for (const { base, hasText } of parts) {
          for (const el of Array.from(root.querySelectorAll(base))) {
            if (hasText && !textMatches(el, hasText)) continue;
            if (!seen.has(el)) { seen.add(el); out.push(el); }
          }
        }
      }
      return out;
    });
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
  async isChecked(): Promise<boolean> {
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
      if (state === 'attached'  && el)                        return;
      if (state === 'detached'  && !el)                       return;
      if (state === 'visible'   && await this.isVisible())    return;
      if (state === 'hidden'    && !(await this.isVisible())) return;
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

export const page = {
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
      if (!doc) return [];
      const parts = resolveSelector(selector);
      const seen = new Set<Element>();
      const out: Element[] = [];
      for (const { base, hasText } of parts) {
        for (const el of Array.from(doc.querySelectorAll(base))) {
          if (hasText && !textMatches(el, hasText)) continue;
          if (!seen.has(el)) { seen.add(el); out.push(el); }
        }
      }
      return out;
    });
  },

  getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator {
    const exact = opts?.exact ?? false;
    return new Locator(() => {
      const doc = iframeDoc();
      if (!doc) return [];
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

export function pwExpect(target: any) {
  const t = (ms?: number) => ms ?? 5000;

  const matchers = {
    // ── Locator assertions (auto-retry) ────────────────────────────────────
    async toBeVisible(opts?: { timeout?: number }) {
      await _retry(async () => { if (!await (target as Locator).isVisible())  throw new Error('Expected element to be visible'); },  t(opts?.timeout));
    },
    async toBeHidden(opts?: { timeout?: number }) {
      await _retry(async () => { if ( await (target as Locator).isVisible())  throw new Error('Expected element to be hidden'); },   t(opts?.timeout));
    },
    async toBeEnabled(opts?: { timeout?: number }) {
      await _retry(async () => { if (!await (target as Locator).isEnabled())  throw new Error('Expected element to be enabled'); },  t(opts?.timeout));
    },
    async toBeDisabled(opts?: { timeout?: number }) {
      await _retry(async () => { if ( await (target as Locator).isEnabled())  throw new Error('Expected element to be disabled'); }, t(opts?.timeout));
    },
    async toBeChecked(opts?: { timeout?: number }) {
      await _retry(async () => { if (!await (target as Locator).isChecked())  throw new Error('Expected element to be checked'); },  t(opts?.timeout));
    },
    async toBeEditable(opts?: { timeout?: number }) {
      await _retry(async () => { if (!await (target as Locator).isEditable()) throw new Error('Expected element to be editable'); }, t(opts?.timeout));
    },
    async toBeEmpty(opts?: { timeout?: number }) {
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
    // ── Plain-value assertions (sync) ───────────────────────────────────────
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
    toBeNull()      { if (target !== null)      throw new Error(`Expected null, got ${JSON.stringify(target)}`); },
    toBeUndefined() { if (target !== undefined) throw new Error(`Expected undefined, got ${JSON.stringify(target)}`); },
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
    toBe(expected: any)  { if (target === expected)   throw new Error(`Expected NOT ${JSON.stringify(expected)}`); },
    toBeTruthy()          { if (target)   throw new Error(`Expected falsy, got ${JSON.stringify(target)}`); },
    toBeFalsy()           { if (!target)  throw new Error(`Expected truthy, got ${JSON.stringify(target)}`); },
    toBeNull()            { if (target === null)  throw new Error('Expected NOT null'); },
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

export const testApi = {
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

// ── iframe init ───────────────────────────────────────────────────────────────

export function initIframe() {
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
