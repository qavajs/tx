/**
 * Test runner — executes JS test code in a Node.js vm sandbox.
 * Server-side page/locator API: built-in fetch + regex HTML parsing.
 * No external dependencies required.
 */

import * as vm from 'vm';
import * as fs from 'fs';
import * as path from 'path';
import { URL, URLSearchParams } from 'node:url';

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export interface RunResults {
  passed: number;
  failed: number;
  total: number;
  duration: number;
  tests: TestResult[];
}

export interface ParsedTest { suite: string; name: string; }
export interface ParsedFile { filename: string; tests: ParsedTest[]; error?: string; }

// ── HTML element representation ───────────────────────────────────────────────

interface HtmlEl {
  tag: string;
  attrs: Record<string, string>;
  text: string;    // inner text (tags stripped)
  offset: number;  // byte offset in source for form membership
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  // double-quoted, single-quoted, unquoted, boolean
  const re = /([\w:-]+)\s*=\s*"([^"]*)"|( [\w:-]+)\s*=\s*'([^']*)'|([\w:-]+)\s*=\s*([^\s"'`=<>]+)|([\w:-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m[1] !== undefined)  out[m[1]] = m[2];
    else if (m[3] !== undefined) out[m[3].trim()] = m[4];
    else if (m[5] !== undefined) out[m[5]] = m[6];
    else if (m[7] !== undefined) out[m[7]] = '';
  }
  return out;
}

function parseElements(html: string): HtmlEl[] {
  const els: HtmlEl[] = [];
  // Match opening tags — capture tag name and attribute string
  const tagRe = /<([\w-]+)((?:\s[^>]*?)?)\s*\/?>/gis;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    if (['script', 'style', '!doctype', '!--'].some(t => tag.startsWith(t))) continue;
    const attrs = parseAttrs(m[2] ?? '');
    const after = m.index + m[0].length;
    // Grab inner text by finding the closing tag (first match only)
    const closeM = new RegExp(`</${tag}\\s*>`, 'i').exec(html.slice(after));
    const inner = closeM ? html.slice(after, after + closeM.index) : '';
    const text = inner.replace(/<[^>]+>/gs, ' ').replace(/\s+/g, ' ').trim();
    els.push({ tag, attrs, text, offset: m.index });
  }
  return els;
}

// ── CSS selector matching ─────────────────────────────────────────────────────

function matchToken(el: HtmlEl, token: string): boolean {
  // Attribute selector: [name], [name=val], [name^=val], [name$=val], [name*=val]
  const am = token.match(/^\[([\w:-]+)(?:([\^$*]?=)"?([^"'\]]*)"?)?\]$/);
  if (am) {
    const [, name, op, val = ''] = am;
    const v = el.attrs[name];
    if (!op) return v !== undefined;
    if (v === undefined) return false;
    if (op === '=')  return v === val;
    if (op === '^=') return v.startsWith(val);
    if (op === '$=') return v.endsWith(val);
    if (op === '*=') return v.includes(val);
    return false;
  }
  if (token.startsWith('#')) return el.attrs['id'] === token.slice(1);
  if (token.startsWith('.')) return (el.attrs['class'] ?? '').split(/\s+/).includes(token.slice(1));
  return el.tag === token.toLowerCase();
}

/** Split "input.foo[type=text]" → ["input", ".foo", "[type=text]"] */
function splitCompound(sel: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let depth = 0;
  for (const ch of sel) {
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    if (!depth && cur && (ch === '.' || ch === '#' || ch === '[')) {
      parts.push(cur); cur = ch;
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function matchEl(el: HtmlEl, sel: string): boolean {
  sel = sel.trim();
  const htMatch = sel.match(/:has-text\(["'](.+?)["']\)/);
  if (htMatch) {
    if (!el.text.includes(htMatch[1])) return false;
    sel = sel.replace(/:has-text\(["'](.+?)["']\)/, '').trim();
    if (!sel || sel === '*') return true;
  }
  return splitCompound(sel).every(t => matchToken(el, t));
}

function queryAll(els: HtmlEl[], selector: string): HtmlEl[] {
  const seen = new Set<HtmlEl>();
  const out: HtmlEl[] = [];
  for (const part of selector.split(',').map(s => s.trim())) {
    // Handle descendant combinator (space) — match last segment, verify ancestors by offset
    const segs = part.split(/\s+/);
    const lastSeg = segs[segs.length - 1];
    for (const el of els) {
      if (!matchEl(el, lastSeg)) continue;
      if (!seen.has(el)) { seen.add(el); out.push(el); }
    }
  }
  return out;
}

// ── Role → tag mapping ────────────────────────────────────────────────────────

const ROLE_SELECTORS: Record<string, string> = {
  button:   'button, input[type="button"], input[type="submit"], input[type="reset"]',
  link:     'a',
  textbox:  'input[type="text"], input[type="email"], input[type="password"], input[type="search"], input[type="url"], textarea',
  checkbox: 'input[type="checkbox"]',
  radio:    'input[type="radio"]',
  combobox: 'select',
  heading:  'h1, h2, h3, h4, h5, h6',
  img:      'img',
  listitem: 'li',
  list:     'ul, ol',
};

// ── fetch helper ──────────────────────────────────────────────────────────────

async function fetchPage(url: string, init: RequestInit = {}): Promise<{ url: string; html: string }> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'cypress-safari/1.0', 'Accept': 'text/html,*/*' },
    ...init,
  });
  return { url: res.url, html: await res.text() };
}

function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Page ─────────────────────────────────────────────────────────────────────

class Page {
  private _url = '';
  private _els: HtmlEl[] = [];

  private _load(url: string, html: string): void {
    this._url = url;
    this._els = parseElements(html);
  }

  async goto(url: string): Promise<void> {
    const { url: finalUrl, html } = await fetchPage(url);
    this._load(finalUrl, html);
  }

  async reload(): Promise<void> {
    if (this._url) await this.goto(this._url);
  }

  url(): string { return this._url; }

  async title(): Promise<string> {
    return this._els.find(e => e.tag === 'title')?.text ?? '';
  }

  locator(selector: string): Locator {
    return new Locator(() => queryAll(this._els, selector), this);
  }

  getByTestId(id: string): Locator {
    return new Locator(() => queryAll(this._els, `[data-testid="${id}"], [data-test="${id}"]`), this);
  }

  getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator {
    return new Locator(() => this._els.filter(el => {
      const t = el.text.trim();
      if (text instanceof RegExp) return text.test(t);
      return opts?.exact ? t === text : t.includes(text);
    }), this);
  }

  getByRole(role: string, opts?: { name?: string | RegExp; exact?: boolean }): Locator {
    return new Locator(() => {
      const roleSel = `[role="${role}"]`;
      const tagSel = ROLE_SELECTORS[role] ?? '';
      const all = queryAll(this._els, tagSel ? `${roleSel}, ${tagSel}` : roleSel);
      if (!opts?.name) return all;
      const name = opts.name;
      const exact = opts.exact;
      return all.filter(el => {
        const label = (el.attrs['aria-label'] ?? el.attrs['placeholder'] ?? el.text).trim();
        if (name instanceof RegExp) return name.test(label);
        return exact ? label === name : label.toLowerCase().includes((name as string).toLowerCase());
      });
    }, this);
  }

  getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator {
    return new Locator(() => {
      const labels = this._els.filter(el => {
        if (el.tag !== 'label') return false;
        const t = el.text.trim();
        if (text instanceof RegExp) return text.test(t);
        return opts?.exact ? t === text : t.includes(text as string);
      });
      const out: HtmlEl[] = [];
      for (const lbl of labels) {
        const forId = lbl.attrs['for'];
        if (forId) {
          const target = this._els.find(e => e.attrs['id'] === forId);
          if (target) out.push(target);
        }
      }
      return out;
    }, this);
  }

  getByPlaceholder(text: string | RegExp): Locator {
    return new Locator(() => this._els.filter(el => {
      const p = el.attrs['placeholder'] ?? '';
      return text instanceof RegExp ? text.test(p) : p.includes(text as string);
    }), this);
  }

  getByAltText(text: string | RegExp): Locator {
    return new Locator(() => this._els.filter(el => {
      const a = el.attrs['alt'] ?? '';
      return text instanceof RegExp ? text.test(a) : a.includes(text as string);
    }), this);
  }

  getByTitle(text: string | RegExp): Locator {
    return new Locator(() => this._els.filter(el => {
      const t = el.attrs['title'] ?? '';
      return text instanceof RegExp ? text.test(t) : t.includes(text as string);
    }), this);
  }

  async waitForURL(pattern: string | RegExp, opts?: { timeout?: number }): Promise<void> {
    const deadline = Date.now() + (opts?.timeout ?? 5000);
    while (Date.now() < deadline) {
      const ok = pattern instanceof RegExp ? pattern.test(this._url) : this._url.includes(pattern);
      if (ok) return;
      await wait(50);
    }
    throw new Error(`waitForURL: "${this._url}" did not match "${pattern}"`);
  }

  async waitForSelector(selector: string, opts?: { timeout?: number }): Promise<Locator> {
    const loc = this.locator(selector);
    await loc.waitFor({ timeout: opts?.timeout });
    return loc;
  }

  async waitForTimeout(ms: number): Promise<void> { await wait(ms); }

  keyboard = {
    press: async (_key: string) => {},
    type:  async (_text: string) => {},
  };

  // Internal: click a resolved element
  async _click(el: HtmlEl): Promise<void> {
    if (el.tag === 'a') {
      const href = el.attrs['href'];
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        const abs = /^https?:\/\//.test(href) ? href : new URL(href, this._url).href;
        await this.goto(abs);
      }
      return;
    }
    const type = (el.attrs['type'] ?? 'submit').toLowerCase();
    if (el.tag === 'button' || (el.tag === 'input' && type === 'submit')) {
      await this._submitForm(el);
      return;
    }
    if (el.tag === 'input' && type === 'checkbox') {
      if ('checked' in el.attrs) delete el.attrs['checked'];
      else el.attrs['checked'] = '';
    }
    if (el.tag === 'input' && type === 'radio') {
      const name = el.attrs['name'];
      if (name) {
        for (const sib of this._els.filter(e => e.tag === 'input' && e.attrs['type'] === 'radio' && e.attrs['name'] === name)) {
          delete sib.attrs['checked'];
        }
      }
      el.attrs['checked'] = '';
    }
  }

  async _submitForm(el: HtmlEl): Promise<void> {
    // Find the form that precedes this element (closest one by offset)
    const forms = this._els.filter(e => e.tag === 'form');
    if (!forms.length) return;
    let form = forms[0];
    for (const f of forms) { if (f.offset <= el.offset) form = f; }

    const action = form.attrs['action'] ?? '';
    const method = (form.attrs['method'] ?? 'get').toLowerCase();
    const actionUrl = action ? (/^https?:\/\//.test(action) ? action : new URL(action, this._url).href) : this._url;

    // Collect form field values — all inputs between this form and the next
    const nextFormOffset = (() => {
      const idx = forms.indexOf(form);
      return forms[idx + 1]?.offset ?? Infinity;
    })();

    const params = new URLSearchParams();
    for (const inp of this._els) {
      if (inp.offset <= form.offset || inp.offset >= nextFormOffset) continue;
      if (!['input', 'select', 'textarea'].includes(inp.tag)) continue;
      const name = inp.attrs['name'];
      if (!name) continue;
      const t = (inp.attrs['type'] ?? 'text').toLowerCase();
      if (['submit', 'button', 'image', 'reset'].includes(t)) continue;
      if ((t === 'checkbox' || t === 'radio') && !('checked' in inp.attrs)) continue;
      params.append(name, inp.attrs['value'] ?? '');
    }

    if (method === 'post') {
      const { url, html } = await fetchPage(actionUrl, {
        method: 'POST',
        body: params.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      this._load(url, html);
    } else {
      const u = new URL(actionUrl);
      for (const [k, v] of params) u.searchParams.set(k, v);
      await this.goto(u.href);
    }
  }
}

// ── Locator ──────────────────────────────────────────────────────────────────

type QueryFn = () => HtmlEl[];

class Locator {
  constructor(private _query: QueryFn, private _page: Page, private _idx: number | null = null) {}

  protected _resolve(): HtmlEl[] { return this._query(); }

  protected _one(): HtmlEl | null {
    const els = this._resolve();
    const i = this._idx ?? 0;
    return els[i < 0 ? els.length + i : i] ?? null;
  }

  nth(n: number): Locator  { return new Locator(this._query, this._page, n); }
  first(): Locator          { return this.nth(0); }
  last(): Locator           { return this.nth(-1); }

  filter(opts: { hasText?: string | RegExp }): Locator {
    const base = this._query;
    return new Locator(() => {
      const els = base();
      if (!opts.hasText) return els;
      const f = opts.hasText;
      return els.filter(el => f instanceof RegExp ? f.test(el.text) : el.text.includes(f));
    }, this._page, this._idx);
  }

  locator(selector: string): Locator {
    const base = this._query;
    return new Locator(() => {
      const parents = base();
      if (!parents.length) return [];
      const minOff = parents[0].offset;
      const maxOff = parents[parents.length - 1].offset + 10000;
      return (this._page as any)._els.filter((e: HtmlEl) =>
        e.offset > minOff && e.offset < maxOff && matchEl(e, selector)
      );
    }, this._page);
  }

  async click(): Promise<void> {
    const el = this._one();
    if (el) await this._page._click(el);
  }

  async fill(value: string): Promise<void> {
    const el = this._one();
    if (el) el.attrs['value'] = value;
  }

  async clear(): Promise<void> { await this.fill(''); }

  async type(text: string, _opts?: { delay?: number }): Promise<void> {
    const el = this._one();
    if (el) el.attrs['value'] = (el.attrs['value'] ?? '') + text;
  }

  async press(_key: string): Promise<void> {}

  async selectOption(value: string | string[]): Promise<void> {
    const el = this._one();
    if (el) el.attrs['value'] = Array.isArray(value) ? value[0] : value;
  }

  async check(): Promise<void> {
    const el = this._one();
    if (el) el.attrs['checked'] = '';
  }

  async uncheck(): Promise<void> {
    const el = this._one();
    if (el) delete el.attrs['checked'];
  }

  async focus(): Promise<void> {}
  async hover(): Promise<void> {}
  async scrollIntoViewIfNeeded(): Promise<void> {}

  async waitFor(opts?: { state?: string; timeout?: number }): Promise<void> {
    const state = opts?.state ?? 'visible';
    const deadline = Date.now() + (opts?.timeout ?? 5000);
    while (Date.now() < deadline) {
      const el = this._one();
      if (state === 'attached'  && el)  return;
      if (state === 'detached'  && !el) return;
      if (state === 'visible'   && el && !('hidden' in el.attrs)) return;
      if (state === 'hidden'    && (!el || 'hidden' in el.attrs)) return;
      await wait(50);
    }
    throw new Error(`waitFor: element did not reach state "${state}"`);
  }

  async textContent(): Promise<string>  { return this._one()?.text ?? ''; }
  async innerText(): Promise<string>    { return this.textContent(); }
  async inputValue(): Promise<string>   { return this._one()?.attrs['value'] ?? ''; }

  async getAttribute(name: string): Promise<string | null> {
    const el = this._one();
    return el ? (el.attrs[name] ?? null) : null;
  }

  async isVisible(): Promise<boolean> {
    const el = this._one();
    if (!el) return false;
    if ('hidden' in el.attrs) return false;
    if (/display\s*:\s*none/i.test(el.attrs['style'] ?? '')) return false;
    return true;
  }

  async isHidden(): Promise<boolean>    { return !(await this.isVisible()); }
  async isEnabled(): Promise<boolean>   { const el = this._one(); return el ? !('disabled' in el.attrs) : false; }
  async isDisabled(): Promise<boolean>  { return !(await this.isEnabled()); }
  async isChecked(): Promise<boolean>   { const el = this._one(); return el ? 'checked' in el.attrs : false; }
  async isEditable(): Promise<boolean>  {
    const el = this._one();
    return el ? !('disabled' in el.attrs) && !('readonly' in el.attrs) : false;
  }
  async count(): Promise<number> { return this._resolve().length; }
}

// ── Expect ───────────────────────────────────────────────────────────────────

function createExpect(actual: any) {
  if (actual instanceof Locator) {
    async function retry(fn: () => Promise<void>, timeout = 5000): Promise<void> {
      const deadline = Date.now() + timeout;
      let lastErr: any;
      while (Date.now() < deadline) {
        try { await fn(); return; } catch (e) { lastErr = e; }
        await wait(50);
      }
      throw lastErr ?? new Error('Assertion timed out');
    }

    const matchers = {
      toBeVisible:   async (opts?: { timeout?: number }) => retry(async () => { if (!await actual.isVisible())  throw new Error('Expected element to be visible'); },   opts?.timeout),
      toBeHidden:    async (opts?: { timeout?: number }) => retry(async () => { if (!await actual.isHidden())   throw new Error('Expected element to be hidden'); },    opts?.timeout),
      toBeEnabled:   async (opts?: { timeout?: number }) => retry(async () => { if (!await actual.isEnabled())  throw new Error('Expected element to be enabled'); },   opts?.timeout),
      toBeDisabled:  async (opts?: { timeout?: number }) => retry(async () => { if (!await actual.isDisabled()) throw new Error('Expected element to be disabled'); },  opts?.timeout),
      toBeChecked:   async (opts?: { timeout?: number }) => retry(async () => { if (!await actual.isChecked())  throw new Error('Expected element to be checked'); },   opts?.timeout),
      toBeEditable:  async (opts?: { timeout?: number }) => retry(async () => { if (!await actual.isEditable()) throw new Error('Expected element to be editable'); },  opts?.timeout),
      toHaveCount:   async (n: number, opts?: { timeout?: number }) => retry(async () => {
        const c = await actual.count();
        if (c !== n) throw new Error(`Expected count ${n}, got ${c}`);
      }, opts?.timeout),
      toHaveText:    async (expected: string | RegExp, opts?: { timeout?: number }) => retry(async () => {
        const t = (await actual.textContent()).trim();
        const ok = expected instanceof RegExp ? expected.test(t) : t === String(expected);
        if (!ok) throw new Error(`Expected text "${t}" to equal "${expected}"`);
      }, opts?.timeout),
      toContainText: async (expected: string | RegExp, opts?: { timeout?: number }) => retry(async () => {
        const t = await actual.textContent();
        const ok = expected instanceof RegExp ? expected.test(t) : t.includes(String(expected));
        if (!ok) throw new Error(`Expected "${t}" to contain "${expected}"`);
      }, opts?.timeout),
      toHaveValue:   async (expected: string | RegExp, opts?: { timeout?: number }) => retry(async () => {
        const v = await actual.inputValue();
        const ok = expected instanceof RegExp ? expected.test(v) : v === String(expected);
        if (!ok) throw new Error(`Expected value "${v}" to equal "${expected}"`);
      }, opts?.timeout),
      toHaveAttribute: async (name: string, value: string | RegExp, opts?: { timeout?: number }) => retry(async () => {
        const a = await actual.getAttribute(name) ?? '';
        const ok = value instanceof RegExp ? value.test(a) : a === String(value);
        if (!ok) throw new Error(`Expected [${name}]="${a}" to match "${value}"`);
      }, opts?.timeout),
      toHaveClass: async (expected: string | RegExp, opts?: { timeout?: number }) => retry(async () => {
        const cls = await actual.getAttribute('class') ?? '';
        const ok = expected instanceof RegExp ? expected.test(cls) : cls.split(/\s+/).includes(String(expected));
        if (!ok) throw new Error(`Expected class "${cls}" to include "${expected}"`);
      }, opts?.timeout),
      not: {} as any,
    };

    matchers.not = {
      toBeVisible:   async (opts?: { timeout?: number }) => retry(async () => { if (await actual.isVisible())  throw new Error('Expected element not to be visible'); },  opts?.timeout),
      toBeHidden:    async (opts?: { timeout?: number }) => retry(async () => { if (await actual.isHidden())   throw new Error('Expected element not to be hidden'); },   opts?.timeout),
      toBeChecked:   async (opts?: { timeout?: number }) => retry(async () => { if (await actual.isChecked())  throw new Error('Expected element not to be checked'); },  opts?.timeout),
      toHaveText:    async (expected: string | RegExp, opts?: { timeout?: number }) => retry(async () => {
        const t = (await actual.textContent()).trim();
        const ok = expected instanceof RegExp ? expected.test(t) : t === String(expected);
        if (ok) throw new Error(`Expected text not to be "${expected}"`);
      }, opts?.timeout),
      toContainText: async (expected: string | RegExp, opts?: { timeout?: number }) => retry(async () => {
        const t = await actual.textContent();
        const ok = expected instanceof RegExp ? expected.test(t) : t.includes(String(expected));
        if (ok) throw new Error(`Expected text not to contain "${expected}"`);
      }, opts?.timeout),
    };

    return matchers;
  }

  // ── Value matchers (non-Locator) ──────────────────────────────────────────
  const assert = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };
  const fmt = (v: any) => JSON.stringify(v);

  const matchers = {
    toBe:            (e: any) => assert(actual === e, `Expected ${fmt(e)}, got ${fmt(actual)}`),
    toEqual:         (e: any) => assert(JSON.stringify(actual) === JSON.stringify(e), `Expected ${fmt(e)}, got ${fmt(actual)}`),
    toContain:       (e: any) => Array.isArray(actual)
                                   ? assert(actual.includes(e), `Array does not contain ${fmt(e)}`)
                                   : assert(String(actual).includes(String(e)), `"${actual}" does not contain "${e}"`),
    toBeTruthy:      ()       => assert(!!actual, `Expected truthy, got ${fmt(actual)}`),
    toBeFalsy:       ()       => assert(!actual, `Expected falsy, got ${fmt(actual)}`),
    toBeNull:        ()       => assert(actual === null, `Expected null, got ${fmt(actual)}`),
    toBeUndefined:   ()       => assert(actual === undefined, `Expected undefined, got ${fmt(actual)}`),
    toBeGreaterThan: (n: number) => assert(actual > n, `Expected ${fmt(actual)} > ${n}`),
    toBeLessThan:    (n: number) => assert(actual < n, `Expected ${fmt(actual)} < ${n}`),
    toMatch: (r: RegExp | string) => {
      const re = typeof r === 'string' ? new RegExp(r) : r;
      assert(re.test(String(actual)), `"${actual}" does not match ${re}`);
    },
    not: {} as any,
  };

  matchers.not = {
    toBe:      (e: any) => assert(actual !== e, `Expected not ${fmt(e)}`),
    toEqual:   (e: any) => assert(JSON.stringify(actual) !== JSON.stringify(e), `Expected values not to be equal`),
    toBeTruthy: ()      => assert(!actual, `Expected falsy, got ${fmt(actual)}`),
    toBeFalsy:  ()      => assert(!!actual, `Expected truthy, got ${fmt(actual)}`),
    toBeNull:   ()      => assert(actual !== null, `Expected not null`),
    toContain:  (e: any) => Array.isArray(actual)
                              ? assert(!actual.includes(e), `Array should not contain ${fmt(e)}`)
                              : assert(!String(actual).includes(String(e)), `"${actual}" should not contain "${e}"`),
  };

  return matchers;
}

// ── Test file parsing ─────────────────────────────────────────────────────────

export function parseTestCode(code: string): ParsedTest[] {
  const tests: ParsedTest[] = [];
  const stack: string[] = [];
  const it = (name: string) => tests.push({ suite: stack.join(' > '), name: String(name) });
  const describe = (name: string, fn: () => void) => {
    stack.push(String(name));
    try { fn(); } catch { /* ignore body errors during parse */ }
    stack.pop();
  };
  const noop: any = () => noop;
  const pageProxy: any = new Proxy({}, { get: () => noop });
  const sandbox = vm.createContext({
    describe, it, test: it,
    beforeEach: noop, afterEach: noop,
    expect: () => noop,
    tx: new Proxy({}, { get: () => noop }),
    page: pageProxy,
    console: { log: noop, error: noop, warn: noop },
    setTimeout: noop, clearTimeout: noop,
    Promise: { resolve: () => ({ then: noop }) },
  });
  try { vm.runInContext(code, sandbox); } catch { /* syntax errors */ }
  return tests;
}

export function parseTestFile(filePath: string): ParsedFile {
  const filename = path.basename(filePath);
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    return { filename, tests: parseTestCode(code) };
  } catch (err: any) {
    return { filename, tests: [], error: err.message };
  }
}

// ── TestRunner ────────────────────────────────────────────────────────────────

export class TestRunner {
  async runCode(code: string, extraContext: Record<string, any> = {}): Promise<RunResults> {
    const queue: Array<{ name: string; fn: () => any; beforeEachs: Array<() => any>; afterEachs: Array<() => any> }> = [];
    const suiteStack: string[] = [];
    const hookStack: Array<{ beforeEachs: Array<() => any>; afterEachs: Array<() => any> }> = [];

    const beforeEach = (fn: () => any) => {
      if (hookStack.length) hookStack[hookStack.length - 1].beforeEachs.push(fn);
    };
    const afterEach = (fn: () => any) => {
      if (hookStack.length) hookStack[hookStack.length - 1].afterEachs.push(fn);
    };

    const it = (name: string, fn: () => any) => {
      const full = suiteStack.length ? `${suiteStack.join(' > ')} > ${name}` : name;
      const beforeEachs = hookStack.flatMap(s => s.beforeEachs);
      const afterEachs = hookStack.flatMap(s => s.afterEachs).reverse();
      queue.push({ name: full, fn, beforeEachs, afterEachs });
    };
    const describe = (name: string, fn: () => void) => {
      suiteStack.push(name);
      hookStack.push({ beforeEachs: [], afterEachs: [] });
      try { fn(); } finally { suiteStack.pop(); hookStack.pop(); }
    };

    const cypressStub: any = new Proxy({}, {
      get: (_t, prop) => (..._args: any[]) => {
        if (prop === 'url' || prop === 'title' || prop === 'text' || prop === 'attr') return '';
        if (prop === 'get') return [];
        if (prop === 'find') return null;
        if (prop === 'wait' || prop === 'waitForElement' || prop === 'waitForUrl') return Promise.resolve(null);
        return undefined;
      },
    });

    const page = new Page();

    const sandbox = vm.createContext({
      describe, it, test: it,
      beforeEach, afterEach,
      expect: createExpect,
      console, setTimeout, clearTimeout, setInterval, clearInterval, Promise,
      tx: cypressStub,
      page,
      ...extraContext,
    });

    try {
      vm.runInContext(code, sandbox);
    } catch (err: any) {
      return {
        passed: 0, failed: 1, total: 1, duration: 0,
        tests: [{ name: '(parse/compile error)', passed: false, error: err.message, duration: 0 }],
      };
    }

    const results: TestResult[] = [];
    const suiteStart = Date.now();

    for (const t of queue) {
      const start = Date.now();
      try {
        for (const hook of t.beforeEachs) await Promise.resolve(hook());
        await Promise.resolve(t.fn());
        for (const hook of t.afterEachs) await Promise.resolve(hook());
        results.push({ name: t.name, passed: true, duration: Date.now() - start });
      } catch (err: any) {
        results.push({ name: t.name, passed: false, error: err.message, duration: Date.now() - start });
      }
    }

    const passed = results.filter(r => r.passed).length;
    return {
      passed,
      failed: results.length - passed,
      total: results.length,
      duration: Date.now() - suiteStart,
      tests: results,
    };
  }

  async runFile(filePath: string, extraContext: Record<string, any> = {}): Promise<RunResults> {
    return this.runCode(fs.readFileSync(filePath, 'utf-8'), extraContext);
  }

  report(results: RunResults): void {
    console.log('\n─────────────────────────────');
    for (const t of results.tests) {
      if (t.passed) console.log(`  ✅  ${t.name} (${t.duration}ms)`);
      else {
        console.log(`  ❌  ${t.name} (${t.duration}ms)`);
        if (t.error) console.log(`       ${t.error}`);
      }
    }
    console.log('─────────────────────────────');
    console.log(`  ${results.passed} passed, ${results.failed} failed, ${results.total} total (${results.duration}ms)\n`);
  }
}
