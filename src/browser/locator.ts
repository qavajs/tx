import { _awaitOrAbort, iframeDoc, iframeWin, _withCommand } from './browser';
import { actionTimeout } from './config';
export { textMatches, resolveSelector } from './locator-utils';
import { textMatches, resolveSelector, isXPath, resolveXPath, queryXPath } from './locator-utils';
import { makeLocatorQueries } from './locator-queries';
import { ariaSnapshot } from './aria';

export const ROLE_SELECTORS: Record<string, string> = {
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

// ── Locator handler state ─────────────────────────────────────────────────────

interface LocatorHandlerEntry {
  locator: Locator;
  handler: (locator: Locator) => Promise<void>;
  noWaitAfter: boolean;
  times: number;
  invocations: number;
}

export const _locatorHandlers: LocatorHandlerEntry[] = [];
let _handlerRunning = false;

export async function _checkLocatorHandlers(): Promise<void> {
  if (_handlerRunning || _locatorHandlers.length === 0) return;
  _handlerRunning = true;
  try {
    for (let i = _locatorHandlers.length - 1; i >= 0; i--) {
      const h = _locatorHandlers[i];
      if (!await h.locator.isVisible()) continue;
      h.invocations++;
      await h.handler(h.locator);
      if (!h.noWaitAfter) {
        const waitMs = actionTimeout();
        const t0 = Date.now();
        while (Date.now() - t0 < waitMs && await h.locator.isVisible()) {
          await _awaitOrAbort(50);
        }
      }
      if (h.times > 0 && h.invocations >= h.times) _locatorHandlers.splice(i, 1);
    }
  } finally {
    _handlerRunning = false;
  }
}

// ── Locator ───────────────────────────────────────────────────────────────────

type QueryFn = () => Element[];

export class Locator {
  constructor(readonly _query: QueryFn, readonly _desc = '') {}

  _els(): Element[] { return this._query(); }
  _el(): Element | null { return this._els()[0] ?? null; }

  async _waitForEl(timeout?: number): Promise<HTMLElement> {
    const _timeout = actionTimeout(timeout);
    const t0 = Date.now();
    while (Date.now() - t0 < _timeout) {
      const el = this._el() as HTMLElement | null;
      if (el) { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return el; }
      await _awaitOrAbort(50);
    }
    throw new Error(`Locator timed out after ${_timeout}ms — element not found`);
  }

  _isVisibleElement(el: Element | null): boolean {
    if (!el) return false;
    const htmlEl = el as HTMLElement;
    if (typeof (htmlEl as any).checkVisibility === 'function') {
      return (htmlEl as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    const win = iframeWin();
    if (!win) return false;
    const s = win.getComputedStyle(htmlEl);
    if (s.visibility === 'hidden' || s.opacity === '0') return false;
    const rect = htmlEl.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  _receivesEvents(el: HTMLElement): boolean {
    const win = iframeWin();
    if (!win) return false;
    const s = win.getComputedStyle(el);
    if (s.pointerEvents === 'none') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  _isEnabledElement(el: HTMLElement): boolean {
    return !('disabled' in el && (el as any).disabled);
  }

  _isEditableElement(el: HTMLElement): boolean {
    return this._isEnabledElement(el) && !('readOnly' in el && (el as any).readOnly);
  }

  async _waitForActionableEl(
    opts: { timeout?: number; force?: boolean } = {},
    action?: 'click' | 'dblclick' | 'rightClick' | 'check' | 'uncheck' | 'fill' | 'clear' | 'selectOption' | 'hover' | 'type',
  ): Promise<HTMLElement> {
    const timeout = actionTimeout(opts.timeout);
    const force = !!opts.force;
    const needsStable = action === 'click' || action === 'dblclick' || action === 'rightClick' || action === 'check' || action === 'uncheck' || action === 'hover';
    const needsEditable = action === 'fill' || action === 'clear' || action === 'selectOption' || action === 'type';
    const t0 = Date.now();
    let stableRect: DOMRect | null = null;
    let lastReason = 'element not found';

    while (Date.now() - t0 < timeout) {
      const el = this._el() as HTMLElement | null;
      if (!el) { lastReason = 'element not found'; stableRect = null; await _awaitOrAbort(50); continue; }
      if (force) return el;
      if (!this._isVisibleElement(el)) { lastReason = 'element not visible'; stableRect = null; await _awaitOrAbort(50); continue; }
      if (!this._receivesEvents(el)) { lastReason = 'element does not receive events'; stableRect = null; await _awaitOrAbort(50); continue; }
      if (!this._isEnabledElement(el)) { lastReason = 'element is disabled'; stableRect = null; await _awaitOrAbort(50); continue; }
      if (needsEditable && !this._isEditableElement(el)) { lastReason = 'element is not editable'; stableRect = null; await _awaitOrAbort(50); continue; }
      if (needsStable) {
        const rect = el.getBoundingClientRect();
        if (!stableRect) { stableRect = rect; lastReason = 'element is not stable'; await _awaitOrAbort(50); continue; }
        if (rect.top !== stableRect.top || rect.left !== stableRect.left || rect.width !== stableRect.width || rect.height !== stableRect.height) {
          stableRect = rect; lastReason = 'element is not stable'; await _awaitOrAbort(50); continue;
        }
      }
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return el;
    }
    throw new Error(`Locator timed out after ${timeout}ms — ${this._desc} ${lastReason}`);
  }

  // ── Chaining ──────────────────────────────────────────────────────────────

  nth(n: number): Locator {
    return new Locator(() => { const e = this._els()[n]; return e ? [e] : []; }, `${this._desc}.nth(${n})`);
  }
  first(): Locator {
    return new Locator(() => { const a = this._els(); return a.length ? [a[0]] : []; }, `${this._desc}.first()`);
  }
  last(): Locator {
    return new Locator(() => { const a = this._els(); return a.length ? [a[a.length - 1]] : []; }, `${this._desc}.last()`);
  }
  filter(opts: { hasText?: string | RegExp; hasNotText?: string | RegExp; visible?: boolean }): Locator {
    const filterArg = opts.hasText !== undefined
      ? `{ hasText: ${opts.hasText instanceof RegExp ? opts.hasText : JSON.stringify(opts.hasText)} }`
      : opts.hasNotText !== undefined
        ? `{ hasNotText: ${opts.hasNotText instanceof RegExp ? opts.hasNotText : JSON.stringify(opts.hasNotText)} }`
        : opts.visible !== undefined ? `{ visible: ${opts.visible} }` : '{}';
    return new Locator(() => this._els().filter(el => {
      if (opts.hasText && !textMatches(el, opts.hasText)) return false;
      if (opts.hasNotText && textMatches(el, opts.hasNotText)) return false;
      if (opts.visible !== undefined && this._isVisibleElement(el) !== opts.visible) return false;
      return true;
    }), `${this._desc}.filter(${filterArg})`);
  }
  locator(selector: string): Locator {
    return new Locator(() => {
      const seen = new Set<Element>();
      const out: Element[] = [];
      if (isXPath(selector)) {
        for (const root of this._els()) {
          for (const el of queryXPath(root, resolveXPath(selector))) {
            if (!seen.has(el)) { seen.add(el); out.push(el); }
          }
        }
        return out;
      }
      const parts = resolveSelector(selector);
      for (const root of this._els()) {
        for (const base of parts) {
          for (const el of Array.from(root.querySelectorAll(base))) {
            if (!seen.has(el)) { seen.add(el); out.push(el); }
          }
        }
      }
      return out;
    }, `${this._desc}.locator('${selector}')`);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async click(opts?: { force?: boolean; timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.click()`, 'click', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'click');
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const doc = iframeDoc();
      const target = (doc?.elementFromPoint(cx, cy) as HTMLElement | null) ?? el;
      const win = iframeWin() as any;
      const ME = (win?.MouseEvent ?? MouseEvent) as typeof MouseEvent;
      const init: MouseEventInit = { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy };
      target.dispatchEvent(new ME('mouseover', init));
      target.dispatchEvent(new ME('mouseenter', { ...init, bubbles: false }));
      target.dispatchEvent(new ME('mousedown', init));
      target.dispatchEvent(new ME('mouseup', init));
      if (typeof (target as any).click === 'function') {
        target.click();
      } else {
        target.dispatchEvent(new ME('click', init));
      }
    });
  }

  async dblclick(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.dblclick()`, 'dblclick', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'dblclick');
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
  }

  async rightClick(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.rightClick()`, 'rightClick', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'rightClick');
      const init: MouseEventInit = { bubbles: true, cancelable: true, button: 2, buttons: 2 };
      el.dispatchEvent(new MouseEvent('mousedown', init));
      el.dispatchEvent(new MouseEvent('mouseup', init));
      el.dispatchEvent(new MouseEvent('contextmenu', init));
    });
  }

  async fill(value: string, opts?: { timeout?: number; delay?: number }): Promise<void> {
    return _withCommand(`${this._desc}.fill(${JSON.stringify(value)})`, 'fill', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'fill') as HTMLInputElement | HTMLTextAreaElement;
      const win = iframeWin() as any;
      const delay = opts?.delay ?? 30;
      const KE = win.KeyboardEvent as typeof KeyboardEvent;
      const E = win.Event as typeof Event;
      const IE = (win.InputEvent ?? win.Event) as typeof InputEvent;
      const tag = el.tagName;
      const proto = tag === 'INPUT' ? win.HTMLInputElement.prototype : win.HTMLTextAreaElement.prototype;
      const setter = (Object.getOwnPropertyDescriptor(proto, 'value') ?? {}).set;
      const setVal = (v: string) => { if (setter) setter.call(el, v); else (el as any).value = v; };
      const KEY_CODE_MAP: Record<string, string> = {
        ' ': 'Space', '.': 'Period', ',': 'Comma', '-': 'Minus', '=': 'Equal',
        '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash',
        ';': 'Semicolon', "'": 'Quote', '`': 'Backquote', '/': 'Slash',
      };
      const charToCode = (ch: string): string => {
        if (/[a-zA-Z]/.test(ch)) return 'Key' + ch.toUpperCase();
        if (/[0-9]/.test(ch)) return 'Digit' + ch;
        return KEY_CODE_MAP[ch] ?? 'Unidentified';
      };
      const kDown = (ch: string) => {
        const raw = ch.charCodeAt(0);
        const kc = /[a-zA-Z]/.test(ch) ? ch.toUpperCase().charCodeAt(0) : raw;
        return { key: ch, code: charToCode(ch), keyCode: kc, charCode: 0, which: kc, bubbles: true, cancelable: true };
      };
      const kPress = (ch: string) => {
        const raw = ch.charCodeAt(0);
        return { key: ch, code: charToCode(ch), keyCode: raw, charCode: raw, which: raw, bubbles: true, cancelable: true };
      };
      el.focus();
      el.dispatchEvent(new E('focus', { bubbles: false }));
      el.dispatchEvent(new E('focusin', { bubbles: true }));
      setVal('');
      el.dispatchEvent(new IE('input', { bubbles: true, cancelable: false, inputType: 'deleteContent' } as any));
      let current = '';
      for (const ch of value) {
        el.dispatchEvent(new KE('keydown', kDown(ch)));
        el.dispatchEvent(new KE('keypress', kPress(ch)));
        current += ch;
        setVal(current);
        el.dispatchEvent(new IE('input', { bubbles: true, cancelable: false, inputType: 'insertText', data: ch } as any));
        el.dispatchEvent(new KE('keyup', kDown(ch)));
        if (delay > 0) await _awaitOrAbort(delay);
      }
      el.dispatchEvent(new E('change', { bubbles: true }));
      el.dispatchEvent(new E('blur', { bubbles: false }));
      el.dispatchEvent(new E('focusout', { bubbles: true }));
    });
  }

  async clear(opts?: { timeout?: number }): Promise<void> { await this.fill('', opts); }

  async type(text: string, opts?: { delay?: number; timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.type(${JSON.stringify(text)})`, 'type', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'type') as HTMLInputElement;
      el.focus();
      for (const ch of text) {
        if (opts?.delay) await _awaitOrAbort(opts.delay);
        el.value += ch;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  async press(key: string, opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.press(${JSON.stringify(key)})`, 'press', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForEl(opts?.timeout);
      const kOpts = { key, bubbles: true, cancelable: true };
      el.dispatchEvent(new KeyboardEvent('keydown', kOpts));
      el.dispatchEvent(new KeyboardEvent('keypress', kOpts));
      el.dispatchEvent(new KeyboardEvent('keyup', kOpts));
      if (key === 'Enter') {
        const form = (el as HTMLInputElement).form;
        if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    });
  }

  async selectOption(value: string | string[], opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.selectOption(${JSON.stringify(value)})`, 'select', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'selectOption') as HTMLSelectElement;
      const vals = Array.isArray(value) ? value : [value];
      for (const opt of Array.from(el.options)) {
        opt.selected = vals.includes(opt.value) || vals.includes(opt.text);
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  async check(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.check()`, 'check', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'check') as HTMLInputElement;
      if (!el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }

  async uncheck(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.uncheck()`, 'uncheck', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'uncheck') as HTMLInputElement;
      if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }

  async focus(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.focus()`, 'focus', async () => {
      await _checkLocatorHandlers();
      (await this._waitForEl(opts?.timeout)).focus();
    });
  }

  async blur(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.blur()`, 'blur', async () => {
      (await this._waitForEl(opts?.timeout)).blur();
    });
  }

  async hover(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.hover()`, 'hover', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'hover');
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    });
  }

  async scrollIntoViewIfNeeded(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.scrollIntoViewIfNeeded()`, 'scroll', async () => {
      await _checkLocatorHandlers();
      (await this._waitForEl(opts?.timeout)).scrollIntoView({ block: 'nearest' });
    });
  }

  async setInputFiles(
    files: string | string[] | { name: string; mimeType: string; buffer: Buffer } | { name: string; mimeType: string; buffer: Buffer }[],
    opts?: { timeout?: number },
  ): Promise<void> {
    const arr = Array.isArray(files) ? files : [files];
    const names = arr.map(f => (typeof f === 'string' ? f.split('/').pop() ?? f : f.name)).join(', ');
    return _withCommand(`${this._desc}.setInputFiles(${JSON.stringify(names)})`, 'setInputFiles', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForEl(opts?.timeout) as HTMLInputElement;
      const win = iframeWin() as any;
      const DT = (win?.DataTransfer ?? DataTransfer) as typeof DataTransfer;
      const F = (win?.File ?? File) as typeof File;
      const dt = new DT();
      for (const f of arr) {
        if (typeof f === 'string') {
          dt.items.add(new F([], f.split('/').pop() ?? f));
        } else {
          dt.items.add(new F([f.buffer as any], f.name, { type: f.mimeType }));
        }
      }
      const valueStr = typeof arr[0] === 'string' ? arr[0] as string : (arr[0] as { name: string }).name;
      Object.defineProperty(el, 'files', { value: dt.files, configurable: true, writable: false });
      Object.defineProperty(el, 'value', { value: valueStr, configurable: true, writable: true });
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async textContent(): Promise<string | null> {
    return _withCommand(`${this._desc}.textContent()`, 'textContent', async () => this._el()?.textContent ?? null);
  }
  async innerText(): Promise<string> {
    return _withCommand(`${this._desc}.innerText()`, 'innerText', async () => (this._el() as HTMLElement | null)?.innerText ?? '');
  }
  async inputValue(): Promise<string> {
    return _withCommand(`${this._desc}.inputValue()`, 'inputValue', async () => (this._el() as HTMLInputElement | null)?.value ?? '');
  }
  async getAttribute(name: string): Promise<string | null> {
    return _withCommand(`${this._desc}.getAttribute(${JSON.stringify(name)})`, 'getAttribute', async () => this._el()?.getAttribute(name) ?? null);
  }
  _checkVisibility(): boolean {
    return this._isVisibleElement(this._el());
  }
  async isVisible(): Promise<boolean> {
    return _withCommand(`${this._desc}.isVisible()`, 'isVisible', async () => this._checkVisibility());
  }
  async isHidden(): Promise<boolean> {
    return _withCommand(`${this._desc}.isHidden()`, 'isHidden', async () => !this._checkVisibility());
  }
  _checkEnabled(): boolean {
    const el = this._el() as HTMLInputElement | HTMLButtonElement | null;
    return el ? !el.disabled : false;
  }
  async isEnabled(): Promise<boolean> {
    return _withCommand(`${this._desc}.isEnabled()`, 'isEnabled', async () => this._checkEnabled());
  }
  async isDisabled(): Promise<boolean> {
    return _withCommand(`${this._desc}.isDisabled()`, 'isDisabled', async () => !this._checkEnabled());
  }
  _checkChecked(): boolean {
    return (this._el() as HTMLInputElement | null)?.checked ?? false;
  }
  async isChecked(): Promise<boolean> {
    return _withCommand(`${this._desc}.isChecked()`, 'isChecked', async () => this._checkChecked());
  }
  _checkEditable(): boolean {
    const el = this._el() as HTMLInputElement | null;
    return el ? !el.readOnly && !el.disabled : false;
  }
  async isEditable(): Promise<boolean> {
    return _withCommand(`${this._desc}.isEditable()`, 'isEditable', async () => this._checkEditable());
  }
  _textContent(): string | null { return this._el()?.textContent ?? null; }
  _inputValue(): string { return (this._el() as HTMLInputElement | null)?.value ?? ''; }
  _getAttribute(name: string): string | null { return this._el()?.getAttribute(name) ?? null; }
  async count(): Promise<number> {
    return _withCommand(`${this._desc}.count()`, 'count', async () => this._els().length);
  }

  async evaluate<T = any>(pageFunction: string | ((element: Element, arg?: any) => T | Promise<T>), arg?: any): Promise<T> {
    return _withCommand(`${this._desc}.evaluate(...)`, 'evaluate', async () => {
      const el = await this._waitForEl();
      const win = iframeWin() as any;
      if (!win) throw new Error('no active page');
      const src = typeof pageFunction === 'function' ? pageFunction.toString() : pageFunction;
      const fn = win.eval(`(${src})`);
      return Promise.resolve(arg !== undefined ? fn(el, arg) : fn(el));
    });
  }

  async waitFor(opts?: { state?: 'visible'|'hidden'|'attached'|'detached'; timeout?: number }): Promise<void> {
    const state = opts?.state ?? 'visible';
    const timeout = actionTimeout(opts?.timeout);
    return _withCommand(`${this._desc}.waitFor({ state: '${state}' })`, 'waitFor', async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        const el = this._el();
        if (state === 'attached' && el) return;
        if (state === 'detached' && !el) return;
        if (state === 'visible' && this._checkVisibility()) return;
        if (state === 'hidden' && !this._checkVisibility()) return;
        await _awaitOrAbort(50);
      }
      throw new Error(`waitFor(state="${state}") timed out after ${timeout}ms`);
    });
  }

  async boundingBox(opts?: { timeout?: number }): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return _withCommand(`${this._desc}.boundingBox()`, 'boundingBox', async () => {
      const el = await this._waitForEl(opts?.timeout);
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
  }

  async ariaSnapshot(opts?: { timeout?: number }): Promise<string> {
    return _withCommand(`${this._desc}.ariaSnapshot()`, 'ariaSnapshot', async () => {
      const el = await this._waitForEl(opts?.timeout);
      return ariaSnapshot(el);
    });
  }
}

// ── FrameLocator ──────────────────────────────────────────────────────────────

export class FrameLocator {
  constructor(
    private readonly _selector: string,
    private readonly _getParentDoc: () => Document | null,
  ) {}

  private _frameDoc(): Document | null {
    const doc = this._getParentDoc();
    if (!doc) return null;
    const frame = doc.querySelector(this._selector) as HTMLIFrameElement | null;
    if (!frame) return null;
    try { return frame.contentDocument; } catch { return null; }
  }

  private _queries() {
    return makeLocatorQueries(() => this._frameDoc(), `frameLocator('${this._selector}')`);
  }

  locator(selector: string): Locator {
    return new Locator(() => {
      const doc = this._frameDoc();
      if (!doc) return [];
      if (isXPath(selector)) return queryXPath(doc, resolveXPath(selector));
      const parts = resolveSelector(selector);
      const seen = new Set<Element>();
      const out: Element[] = [];
      for (const base of parts) {
        for (const el of Array.from(doc.querySelectorAll(base))) {
          if (!seen.has(el)) { seen.add(el); out.push(el); }
        }
      }
      return out;
    }, `frameLocator('${this._selector}').locator('${selector}')`);
  }

  getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator { return this._queries().getByText(text, opts); }
  getByRole(role: string, opts?: { name?: string | RegExp; exact?: boolean }): Locator { return this._queries().getByRole(role, opts); }
  getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator { return this._queries().getByLabel(text, opts); }
  getByPlaceholder(text: string | RegExp): Locator { return this._queries().getByPlaceholder(text); }
  getByTestId(id: string): Locator { return this._queries().getByTestId(id); }
  getByAltText(text: string | RegExp): Locator { return this._queries().getByAltText(text); }
  getByTitle(text: string | RegExp): Locator { return this._queries().getByTitle(text); }
  frameLocator(selector: string): FrameLocator { return this._queries().frameLocator(selector); }
}
