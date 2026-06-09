import { _awaitOrAbort, _withCommand, sendCommand } from './browser';
import { actionTimeout } from './config';
import type { AgentLocatorSpec } from '../ws-protocol';
import { isXPath, resolveXPath } from './locator-utils';
import { makeLocatorQueries } from './locator-queries';
export { textMatches, resolveSelector } from './locator-utils';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function _specParam(spec: AgentLocatorSpec): Record<string, unknown> {
  return { spec: spec as unknown as Record<string, unknown> };
}

function _bufferToBase64(buf: any): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ── Locator ───────────────────────────────────────────────────────────────────

export class Locator {
  constructor(readonly _spec: AgentLocatorSpec, readonly _desc = '') {}

  // ── Chaining ──────────────────────────────────────────────────────────────

  nth(n: number): Locator {
    return new Locator({ kind: 'nth', parent: this._spec, n }, `${this._desc}.nth(${n})`);
  }
  first(): Locator {
    return new Locator({ kind: 'first', parent: this._spec }, `${this._desc}.first()`);
  }
  last(): Locator {
    return new Locator({ kind: 'last', parent: this._spec }, `${this._desc}.last()`);
  }

  filter(opts: { hasText?: string | RegExp; hasNotText?: string | RegExp; visible?: boolean }): Locator {
    const base: AgentLocatorSpec = { kind: 'filter', parent: this._spec };
    const spec = base as any;
    if (opts.hasText instanceof RegExp) {
      spec.hasTextRe = opts.hasText.source; spec.hasTextReFlags = opts.hasText.flags;
    } else if (opts.hasText !== undefined) {
      spec.hasText = opts.hasText;
    }
    if (opts.hasNotText instanceof RegExp) {
      spec.hasNotTextRe = opts.hasNotText.source; spec.hasNotTextReFlags = opts.hasNotText.flags;
    } else if (opts.hasNotText !== undefined) {
      spec.hasNotText = opts.hasNotText;
    }
    if (opts.visible !== undefined) spec.visible = opts.visible;

    const filterArg = opts.hasText !== undefined
      ? `{ hasText: ${opts.hasText instanceof RegExp ? opts.hasText : JSON.stringify(opts.hasText)} }`
      : opts.hasNotText !== undefined
        ? `{ hasNotText: ${opts.hasNotText instanceof RegExp ? opts.hasNotText : JSON.stringify(opts.hasNotText)} }`
        : opts.visible !== undefined ? `{ visible: ${opts.visible} }` : '{}';
    return new Locator(spec as AgentLocatorSpec, `${this._desc}.filter(${filterArg})`);
  }

  locator(selector: string): Locator {
    const child: AgentLocatorSpec = isXPath(selector)
      ? { kind: 'xpath', xpath: resolveXPath(selector) }
      : { kind: 'css', selector };
    return new Locator({ kind: 'chain', parent: this._spec, child }, `${this._desc}.locator('${selector}')`);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async click(opts?: { force?: boolean; timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.click()`, 'click', async () => {
      await _checkLocatorHandlers();
      await sendCommand('click', { ..._specParam(this._spec), force: opts?.force, timeout: opts?.timeout });
    });
  }

  async dblclick(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.dblclick()`, 'dblclick', async () => {
      await _checkLocatorHandlers();
      await sendCommand('dblclick', { ..._specParam(this._spec), timeout: opts?.timeout });
    });
  }

  async rightClick(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.rightClick()`, 'rightClick', async () => {
      await _checkLocatorHandlers();
      await sendCommand('rightClick', { ..._specParam(this._spec), timeout: opts?.timeout });
    });
  }

  async fill(value: string, opts?: { timeout?: number; delay?: number }): Promise<void> {
    return _withCommand(`${this._desc}.fill(${JSON.stringify(value)})`, 'fill', async () => {
      await _checkLocatorHandlers();
      await sendCommand('fill', { ..._specParam(this._spec), value, delay: opts?.delay, timeout: opts?.timeout });
    });
  }

  async clear(opts?: { timeout?: number }): Promise<void> { await this.fill('', opts); }

  async type(text: string, opts?: { delay?: number; timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.type(${JSON.stringify(text)})`, 'type', async () => {
      await _checkLocatorHandlers();
      await sendCommand('type', { ..._specParam(this._spec), text, delay: opts?.delay, timeout: opts?.timeout });
    });
  }

  async press(key: string, opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.press(${JSON.stringify(key)})`, 'press', async () => {
      await _checkLocatorHandlers();
      await sendCommand('press', { ..._specParam(this._spec), key, timeout: opts?.timeout });
    });
  }

  async selectOption(value: string | string[], opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.selectOption(${JSON.stringify(value)})`, 'select', async () => {
      await _checkLocatorHandlers();
      await sendCommand('selectOption', { ..._specParam(this._spec), value, timeout: opts?.timeout });
    });
  }

  async check(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.check()`, 'check', async () => {
      await _checkLocatorHandlers();
      await sendCommand('check', { ..._specParam(this._spec), timeout: opts?.timeout });
    });
  }

  async uncheck(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.uncheck()`, 'uncheck', async () => {
      await _checkLocatorHandlers();
      await sendCommand('uncheck', { ..._specParam(this._spec), timeout: opts?.timeout });
    });
  }

  async focus(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.focus()`, 'focus', async () => {
      await _checkLocatorHandlers();
      await sendCommand('focus', { ..._specParam(this._spec), timeout: opts?.timeout });
    });
  }

  async blur(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.blur()`, 'blur', async () => {
      await sendCommand('blur', { ..._specParam(this._spec), timeout: opts?.timeout });
    });
  }

  async hover(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.hover()`, 'hover', async () => {
      await _checkLocatorHandlers();
      await sendCommand('hover', { ..._specParam(this._spec), timeout: opts?.timeout });
    });
  }

  async scrollIntoViewIfNeeded(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(`${this._desc}.scrollIntoViewIfNeeded()`, 'scroll', async () => {
      await _checkLocatorHandlers();
      await sendCommand('scrollIntoView', { ..._specParam(this._spec), timeout: opts?.timeout });
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
      const serialized = arr.map(f =>
        typeof f === 'string'
          ? { name: f.split('/').pop() ?? f, path: f }
          : { name: f.name, mimeType: f.mimeType, data: _bufferToBase64(f.buffer) }
      );
      await sendCommand('setInputFiles', { ..._specParam(this._spec), files: serialized as unknown as Record<string, unknown>, timeout: opts?.timeout });
    });
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async textContent(): Promise<string | null> {
    return _withCommand(`${this._desc}.textContent()`, 'textContent', () =>
      sendCommand<string | null>('textContent', _specParam(this._spec)));
  }

  async innerText(): Promise<string> {
    return _withCommand(`${this._desc}.innerText()`, 'innerText', () =>
      sendCommand<string>('innerText', _specParam(this._spec)));
  }

  async inputValue(): Promise<string> {
    return _withCommand(`${this._desc}.inputValue()`, 'inputValue', () =>
      sendCommand<string>('inputValue', _specParam(this._spec)));
  }

  async getAttribute(name: string): Promise<string | null> {
    return _withCommand(`${this._desc}.getAttribute(${JSON.stringify(name)})`, 'getAttribute', () =>
      sendCommand<string | null>('getAttribute', { ..._specParam(this._spec), name }));
  }

  async isVisible(): Promise<boolean> {
    return _withCommand(`${this._desc}.isVisible()`, 'isVisible', () =>
      sendCommand<boolean>('isVisible', _specParam(this._spec)));
  }

  async isHidden(): Promise<boolean> {
    return _withCommand(`${this._desc}.isHidden()`, 'isHidden', async () =>
      !(await sendCommand<boolean>('isVisible', _specParam(this._spec))));
  }

  async isEnabled(): Promise<boolean> {
    return _withCommand(`${this._desc}.isEnabled()`, 'isEnabled', () =>
      sendCommand<boolean>('isEnabled', _specParam(this._spec)));
  }

  async isDisabled(): Promise<boolean> {
    return _withCommand(`${this._desc}.isDisabled()`, 'isDisabled', async () =>
      !(await sendCommand<boolean>('isEnabled', _specParam(this._spec))));
  }

  async isChecked(): Promise<boolean> {
    return _withCommand(`${this._desc}.isChecked()`, 'isChecked', () =>
      sendCommand<boolean>('isChecked', _specParam(this._spec)));
  }

  async isEditable(): Promise<boolean> {
    return _withCommand(`${this._desc}.isEditable()`, 'isEditable', () =>
      sendCommand<boolean>('isEditable', _specParam(this._spec)));
  }

  async count(): Promise<number> {
    return _withCommand(`${this._desc}.count()`, 'count', () =>
      sendCommand<number>('count', _specParam(this._spec)));
  }

  async evaluate<T = any>(pageFunction: string | ((element: Element, arg?: any) => T | Promise<T>), arg?: any): Promise<T> {
    return _withCommand(`${this._desc}.evaluate(...)`, 'evaluate', () => {
      const code = typeof pageFunction === 'function' ? pageFunction.toString() : pageFunction;
      return sendCommand<T>('locatorEvaluate', { ..._specParam(this._spec), code, arg });
    });
  }

  async waitFor(opts?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number }): Promise<void> {
    const state = opts?.state ?? 'visible';
    return _withCommand(`${this._desc}.waitFor({ state: '${state}' })`, 'waitFor', () =>
      sendCommand('waitForSelector', { ..._specParam(this._spec), state, timeout: opts?.timeout }));
  }

  async boundingBox(opts?: { timeout?: number }): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return _withCommand(`${this._desc}.boundingBox()`, 'boundingBox', () =>
      sendCommand<{ x: number; y: number; width: number; height: number } | null>('boundingBox', { ..._specParam(this._spec), timeout: opts?.timeout }));
  }

  async ariaSnapshot(opts?: { timeout?: number }): Promise<string> {
    return _withCommand(`${this._desc}.ariaSnapshot()`, 'ariaSnapshot', () =>
      sendCommand<string>('ariaSnapshot', { ..._specParam(this._spec), timeout: opts?.timeout }));
  }
}

// ── FrameLocator ──────────────────────────────────────────────────────────────
// NOTE: Cross-process iframe access is not yet supported. FrameLocator methods
// create top-level-scoped locators as a best-effort stub.

export class FrameLocator {
  constructor(private readonly _selector: string) {}

  private _prefix() {
    return `frameLocator('${this._selector}')`;
  }

  locator(selector: string): Locator {
    const child: AgentLocatorSpec = isXPath(selector)
      ? { kind: 'xpath', xpath: resolveXPath(selector) }
      : { kind: 'css', selector };
    // Best-effort: chain under the frame element (not into its content)
    return new Locator(
      { kind: 'chain', parent: { kind: 'css', selector: this._selector }, child },
      `${this._prefix()}.locator('${selector}')`,
    );
  }

  private _queries() { return makeLocatorQueries(this._prefix()); }

  getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator { return this._queries().getByText(text, opts); }
  getByRole(role: string, opts?: { name?: string | RegExp; exact?: boolean }): Locator { return this._queries().getByRole(role, opts); }
  getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator { return this._queries().getByLabel(text, opts); }
  getByPlaceholder(text: string | RegExp): Locator { return this._queries().getByPlaceholder(text); }
  getByTestId(id: string): Locator { return this._queries().getByTestId(id); }
  getByAltText(text: string | RegExp): Locator { return this._queries().getByAltText(text); }
  getByTitle(text: string | RegExp): Locator { return this._queries().getByTitle(text); }
  frameLocator(selector: string): FrameLocator { return new FrameLocator(selector); }
}
