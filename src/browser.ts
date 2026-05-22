// ── Global types ──────────────────────────────────────────────────────────────

declare global {
  interface Window {
    __CONFIG__: { proxyUrl: string; port: number; viewport?: { width: number; height: number }; autorun?: boolean; snapshot?: boolean; grep?: string; grepFlags?: string; actionTimeout?: number; expectTimeout?: number; testTimeout?: number };
  }
}

// ── Test abort mechanism ──────────────────────────────────────────────────────

let _testAbortError: Error | null = null;
const _abortListeners: Array<(err: Error) => void> = [];

export function setTestAbort(err: Error | null): void {
  _testAbortError = err;
  const fns = _abortListeners.splice(0);
  if (err) for (const fn of fns) fn(err);
}

function _awaitOrAbort(ms: number): Promise<void> {
  if (_testAbortError) return Promise.reject(_testAbortError);
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const abortFn = (err: Error) => { if (!settled) { settled = true; clearTimeout(id); reject(err); } };
    _abortListeners.push(abortFn);
    const id = setTimeout(() => {
      if (!settled) {
        settled = true;
        const idx = _abortListeners.indexOf(abortFn);
        if (idx >= 0) _abortListeners.splice(idx, 1);
        resolve();
      }
    }, ms);
  });
}

// ── Viewport ──────────────────────────────────────────────────────────────────

let viewportW: number | null = null;
let viewportH: number | null = null;
let viewportObserver: ResizeObserver | null = null;

export function reapplyViewport() {
  const container = document.getElementById('iframe-container');
  const tag = document.getElementById('viewportTag');
  const iframe = _activeTab()?.iframe ?? null;
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

// ── Tab state ─────────────────────────────────────────────────────────────────

interface TabEntry { id: string; iframe: HTMLIFrameElement; title: string; url: string; }
let _tabs: TabEntry[] = [];
let _activeTabId: string | null = null;
let _tabCounter = 0;
function _activeTab(): TabEntry | null { return _tabs.find(t => t.id === _activeTabId) ?? null; }

export const API_BASE = 'http://localhost:' + window.__CONFIG__.port;

// Derive proxy prefix by stripping the trailing page URL (e.g. "about:blank") from the session URL
// e.g. "http://host/proxy/SESSION/about:blank" → "http://host/proxy/SESSION/"
const _proxyPrefix = window.__CONFIG__.proxyUrl.replace(/[^/]+$/, '');

export interface SnapshotEntry {
  id: number;
  label: string;
  timestamp: number;
  url: string;
  title: string;
  html: string;
  viewport?: { width: number; height: number };
}

const _snapshots: SnapshotEntry[] = [];
let _snapshotCounter = 0;
const MAX_SNAPSHOTS = 40;
const _snapshotListeners = new Set<() => void>();

function _notifySnapshotListeners(): void {
  for (const fn of _snapshotListeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

function _captureSnapshot(label: string): number {
  const doc = iframeDoc();
  if (!doc) return -1;
  const url = page.url();
  const title = doc.title || '';

  const cloneRoot = doc.documentElement.cloneNode(true) as HTMLElement;

  for (const el of Array.from(cloneRoot.querySelectorAll('script'))) {
    el.remove();
  }

  let html = cloneRoot.outerHTML;
  if (!/<base\b/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${url}">`);
  }

  const snapshotId = ++_snapshotCounter;
  _snapshots.push({
    id: snapshotId,
    label: label || 'snapshot',
    timestamp: Date.now(),
    url,
    title,
    html,
    viewport: viewportW && viewportH ? { width: viewportW, height: viewportH } : undefined,
  });
  if (_snapshots.length > MAX_SNAPSHOTS) _snapshots.shift();
  _notifySnapshotListeners();
  return snapshotId;
}

export function getSnapshots(): SnapshotEntry[] {
  return [..._snapshots];
}

export function clearSnapshots(): void {
  _snapshots.length = 0;
  _snapshotCounter = 0;
  _notifySnapshotListeners();
}

export function onSnapshotsChanged(fn: () => void): () => void {
  _snapshotListeners.add(fn);
  return () => { _snapshotListeners.delete(fn); };
}

export function fromProxiedUrl(url: string): string {
  if (!url) return url ?? '';
  if (_proxyPrefix && url.startsWith(_proxyPrefix)) return url.slice(_proxyPrefix.length);
  return url;
}

export function toProxiedUrl(url: string): string {
  if (!_proxyPrefix) return removeTrailingSlash(url);
  if (url.startsWith(_proxyPrefix)) return removeTrailingSlash(url);

  if (!/^https?:\/\//.test(url)) {
    // Relative URL — resolve against the current page URL so it routes through the proxy
    const baseUrl = _activeTab()?.url;

    if (baseUrl && /^https?:\/\//.test(baseUrl)) {
      try {
        url = new URL(url, baseUrl).href;
      } catch {
        return removeTrailingSlash(url);
      }
    } else {
      return removeTrailingSlash(url);
    }
  }

  return removeTrailingSlash(_proxyPrefix + url);
}

function removeTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

// ── iframe helpers ────────────────────────────────────────────────────────────

export function iframeDoc(): Document | null {
  try { return _activeTab()?.iframe.contentDocument ?? null; } catch { return null; }
}
export function iframeWin(): Window & typeof globalThis | null {
  try { return _activeTab()?.iframe.contentWindow as any ?? null; } catch { return null; }
}

// ── Tab lifecycle ─────────────────────────────────────────────────────────────

let _onTabsChanged: (() => void) | null = null;
export function setOnTabsChanged(fn: () => void) { _onTabsChanged = fn; }

export function getTabsSnapshot() {
  return _tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.id === _activeTabId }));
}

export function setActiveTab(tabId: string) {
  for (const t of _tabs) t.iframe.style.display = 'none';
  const tab = _tabs.find(t => t.id === tabId);
  if (!tab) return;
  tab.iframe.style.display = 'block';
  _activeTabId = tabId;
  const navInput = document.getElementById('navUrl') as HTMLInputElement | null;
  if (navInput) navInput.value = tab.url;
  reapplyViewport();
  _onTabsChanged?.();
}

export function createTab(url?: string) {
  const tabId = 'tab-' + (++_tabCounter);
  const iframeEl = document.createElement('iframe');
  iframeEl.id = 'tx-tab-' + tabId;
  iframeEl.sandbox.add('allow-same-origin');
  iframeEl.sandbox.add('allow-scripts');
  iframeEl.sandbox.add('allow-forms');
  iframeEl.sandbox.add('allow-popups');
  iframeEl.sandbox.add('allow-modals');
  iframeEl.sandbox.add('allow-top-navigation-by-user-activation');
  iframeEl.style.width = '100%';
  iframeEl.style.height = '100%';
  iframeEl.style.border = 'none';
  iframeEl.style.display = 'none';
  const tab: TabEntry = { id: tabId, iframe: iframeEl, title: 'New Tab', url: url ?? '' };
  iframeEl.addEventListener('load', () => {
    try { tab.title = iframeEl.contentDocument?.title || 'New Tab'; } catch {}
    try {
      const href = iframeEl.contentWindow?.location.href ?? '';
      tab.url = (_proxyPrefix && href.startsWith(_proxyPrefix)) ? href.slice(_proxyPrefix.length) : href;
    } catch {}
    if (_activeTabId === tabId) {
      const navInput = document.getElementById('navUrl') as HTMLInputElement | null;
      if (navInput) navInput.value = tab.url;
    }
    _runInitScripts();
    _installEventBridges();
    reapplyViewport();
    _emitPage('domcontentloaded');
    _emitPage('load');
    if (window.__CONFIG__.snapshot) _captureSnapshot('load');
    _emitPage('framenavigated', { url: () => page.url(), name: () => '', isMainFrame: () => true });
    _onTabsChanged?.();
  });
  iframeEl.addEventListener('error', () => { _emitPage('crash'); });
  document.getElementById('iframe-container')!.appendChild(iframeEl);
  _tabs.push(tab);
  // Resolve src BEFORE switching active tab so toProxiedUrl can use the origin tab's URL as base
  iframeEl.src = url ? toProxiedUrl(url) : API_BASE + '/mock';
  setActiveTab(tabId);
  log('new tab', 'info');
  _onTabsChanged?.();
  return _makePopupPage(tabId);
}

export function closeTab(tabId: string) {
  const tab = _tabs.find(t => t.id === tabId);
  if (!tab) return;
  tab.iframe.remove();
  _tabs = _tabs.filter(t => t.id !== tabId);
  if (_activeTabId === tabId) {
    if (_tabs.length > 0) {
      setActiveTab(_tabs[_tabs.length - 1].id);
    } else {
      _activeTabId = null;
    }
  }
  _onTabsChanged?.();
}

export function closeExtraTabs() {
  const extra = _tabs.slice(1).map(t => t.id);
  for (const id of extra) closeTab(id);
}

// ── Command Log ───────────────────────────────────────────────────────────────

type LogState = 'pending' | 'info' | 'pass' | 'fail';

const LOG_STATE: Record<LogState, { icon: string }> = {
  pending: { icon: '…' },
  info:    { icon: '›' },
  pass:    { icon: '✓' },
  fail:    { icon: '✗' },
};

let _logContainer: HTMLElement | null = null;
export function setLogContainer(el: HTMLElement | null) { _logContainer = el; }

export interface LogEntry {
  cmd: string;
  message: string;
  state: 'pass' | 'fail' | 'info';
  duration?: number;
}

let _collectedLogs: LogEntry[] | null = null;

export function startCollectingLogs(): void { _collectedLogs = []; }

export function stopCollectingLogs(): LogEntry[] {
  const logs = _collectedLogs ?? [];
  _collectedLogs = null;
  return logs;
}

function createLogEntry(message: string, state: LogState, cmd?: string, duration?: number) {
  const container = _logContainer ?? document.getElementById('console');
  if (!container) return null;
  const cls   = state;
  const icon  = LOG_STATE[state].icon;
  const label = cmd ?? (state === 'pass' ? 'ok' : state === 'fail' ? 'err' : state === 'pending' ? 'pending' : 'log');
  const entry = document.createElement('div');
  entry.className = `tx-cmd ${cls}`;
  const iconEl  = document.createElement('span'); iconEl.className  = `tx-cmd-icon ${cls}`;  iconEl.textContent  = icon;
  const labelEl = document.createElement('span'); labelEl.className = `tx-cmd-label ${cls}`; labelEl.textContent = label;
  const msgEl   = document.createElement('span'); msgEl.className   = 'tx-cmd-msg';          msgEl.textContent   = message;
  entry.appendChild(iconEl); entry.appendChild(labelEl); entry.appendChild(msgEl);
  if (duration != null) {
    const durEl = document.createElement('span'); durEl.className = 'tx-cmd-dur'; durEl.textContent = duration + 'ms';
    entry.appendChild(durEl);
  }
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
  return entry;
}

function updateLogEntry(entry: HTMLElement | null, state: 'pass' | 'fail', duration?: number) {
  if (!entry) return;
  entry.classList.remove('pending', 'info', 'pass', 'fail');
  entry.classList.add(state);
  const iconEl  = entry.querySelector<HTMLElement>('.tx-cmd-icon');
  const labelEl = entry.querySelector<HTMLElement>('.tx-cmd-label');
  if (iconEl) {
    iconEl.className = `tx-cmd-icon ${state}`;
    iconEl.textContent = state === 'pass' ? '✓' : '✗';
  }
  if (labelEl) {
    labelEl.className = `tx-cmd-label ${state}`;
  }
  if (duration != null) {
    let durEl = entry.querySelector<HTMLElement>('.tx-cmd-dur');
    if (!durEl) {
      durEl = document.createElement('span');
      durEl.className = 'tx-cmd-dur';
      entry.appendChild(durEl);
    }
    durEl.textContent = duration + 'ms';
  }
}

const _snapshotCommands = new Set([
  'click', 'dblclick', 'rightClick', 'fill', 'type', 'press', 'select', 'check', 'uncheck', 'focus', 'hover', 'scroll', 'goto', 'reload', 'waitForURL', 'setInputFiles',
  'mouse.click', 'mouse.dblclick',
  'keyboard.press', 'keyboard.type', 'keyboard.insertText',
]);

export function log(message: string, type: 'info' | 'success' | 'error' = 'info', cmd?: string, duration?: number) {
  const state = type === 'success' ? 'pass' : type === 'error' ? 'fail' : 'info';
  createLogEntry(message, state, cmd, duration);
  if (_collectedLogs) _collectedLogs.push({ cmd: cmd ?? state, message, state, duration });
}

export function logCommand(message: string, cmd: string) {
  const entry = createLogEntry(message, 'pending', cmd);
  const startedAt = Date.now();
  return {
    success(duration?: number) {
      const dur = duration ?? Math.max(0, Date.now() - startedAt);
      updateLogEntry(entry, 'pass', dur);
      if (_collectedLogs) _collectedLogs.push({ cmd, message, state: 'pass', duration: dur });
      if (window.__CONFIG__.snapshot && _snapshotCommands.has(cmd)) {
        try {
          const snapshotId = _captureSnapshot(message || cmd);
          if (snapshotId > 0 && entry) {
            entry.dataset.snapshotId = String(snapshotId);
            entry.title = 'Click to open snapshot';
            entry.classList.add('has-snapshot');
            entry.onclick = () => {
              const id = Number(entry.dataset.snapshotId);
              if (id && (window as any).openSnapshot) (window as any).openSnapshot(id);
            };
            if (!entry.querySelector('.tx-cmd-snapshot-badge')) {
              const badge = document.createElement('span');
              badge.className = 'tx-cmd-snapshot-badge';
              badge.title = 'Snapshot available';
              const durEl = entry.querySelector<HTMLElement>('.tx-cmd-dur');
              entry.insertBefore(badge, durEl || null);
            }
          }
        } catch { /* ignore */ }
      }
    },
    fail(error?: string) {
      if (error && entry) {
        const msgEl = entry.querySelector<HTMLElement>('.tx-cmd-msg');
        if (msgEl) msgEl.textContent += ` — ${error}`;
      }
      const dur = Math.max(0, Date.now() - startedAt);
      updateLogEntry(entry, 'fail', dur);
      if (_collectedLogs) _collectedLogs.push({ cmd, message: error ? `${message} — ${error}` : message, state: 'fail', duration: dur });
    },
  };
}

// ── Command helper ────────────────────────────────────────────────────────────

async function _withCommand<T>(message: string, cmd: string, fn: () => Promise<T>): Promise<T> {
  const entry = logCommand(message, cmd);
  try {
    const result = await fn();
    entry.success();
    return result;
  } catch (error: any) {
    entry.fail(error?.message ?? String(error));
    throw error;
  }
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
  constructor(readonly _query: QueryFn, readonly _desc = '') {}

  _els(): Element[]      { return this._query(); }
  _el():  Element | null { return this._els()[0] ?? null; }

  async _waitForEl(timeout?: number): Promise<HTMLElement> {
    const _timeout = timeout ?? window.__CONFIG__?.actionTimeout ?? 5000;
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
    // checkVisibility walks the full ancestor chain (display, visibility, opacity,
    // content-visibility) — the same logic Playwright uses. Available in all
    // modern Chromium/Firefox/Safari builds.
    if (typeof (htmlEl as any).checkVisibility === 'function') {
      return (htmlEl as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    // Fallback for older environments
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

  async _waitForActionableEl(opts: { timeout?: number; force?: boolean } = {}, action?: 'click' | 'dblclick' | 'rightClick' | 'check' | 'uncheck' | 'fill' | 'clear' | 'selectOption' | 'hover' | 'type'): Promise<HTMLElement> {
    const timeout = opts.timeout ?? window.__CONFIG__?.actionTimeout ?? 5000;
    const force = !!opts.force;
    const needsStable = action === 'click' || action === 'dblclick' || action === 'rightClick' || action === 'check' || action === 'uncheck' || action === 'hover';
    const needsEditable = action === 'fill' || action === 'clear' || action === 'selectOption' || action === 'type';
    const t0 = Date.now();
    let stableRect: DOMRect | null = null;
    let lastReason = 'element not found';

    while (Date.now() - t0 < timeout) {
      const el = this._el() as HTMLElement | null;
      if (!el) {
        lastReason = 'element not found';
        stableRect = null;
        await _awaitOrAbort(50);
        continue;
      }
      if (force) return el;
      if (!this._isVisibleElement(el)) {
        lastReason = 'element not visible';
        stableRect = null;
        await _awaitOrAbort(50);
        continue;
      }
      if (!this._receivesEvents(el)) {
        lastReason = 'element does not receive events';
        stableRect = null;
        await _awaitOrAbort(50);
        continue;
      }
      if (!this._isEnabledElement(el)) {
        lastReason = 'element is disabled';
        stableRect = null;
        await _awaitOrAbort(50);
        continue;
      }
      if (needsEditable && !this._isEditableElement(el)) {
        lastReason = 'element is not editable';
        stableRect = null;
        await _awaitOrAbort(50);
        continue;
      }
      if (needsStable) {
        const rect = el.getBoundingClientRect();
        if (!stableRect) {
          stableRect = rect;
          lastReason = 'element is not stable';
          await _awaitOrAbort(50);
          continue;
        }
        if (rect.top !== stableRect.top || rect.left !== stableRect.left || rect.width !== stableRect.width || rect.height !== stableRect.height) {
          stableRect = rect;
          lastReason = 'element is not stable';
          await _awaitOrAbort(50);
          continue;
        }
      }
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return el;
    }

    throw new Error(`Locator timed out after ${timeout}ms — ${this._desc} ${lastReason}`);
  }

  // ── Chaining ──────────────────────────────────────────────────────────────

  nth(n: number): Locator {
    return new Locator(() => { const e = this._els()[n]; return e ? [e] : []; }, `${this._desc}:nth(${n})`);
  }
  first(): Locator { return this.nth(0); }
  last():  Locator {
    return new Locator(() => { const a = this._els(); return a.length ? [a[a.length - 1]] : []; }, `${this._desc}:last`);
  }
  filter(opts: { hasText?: string | RegExp; hasNotText?: string | RegExp; visible?: boolean }): Locator {
    const tag = opts.hasText ? `[has-text: ${opts.hasText}]` : opts.hasNotText ? `[not-text: ${opts.hasNotText}]` : opts.visible !== undefined ? `[visible: ${opts.visible}]` : '[filtered]';
    return new Locator(() => this._els().filter(el => {
      if (opts.hasText    && !textMatches(el, opts.hasText))    return false;
      if (opts.hasNotText &&  textMatches(el, opts.hasNotText)) return false;
      if (opts.visible !== undefined && this._isVisibleElement(el) !== opts.visible) return false;
      return true;
    }), `${this._desc}${tag}`);
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
    }, `${this._desc} ${selector}`.trim());
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async click(opts?: { force?: boolean; timeout?: number }): Promise<void> {
    return _withCommand(this._desc, 'click', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'click');
      // Resolve the actual hit-target at the element's center, matching real Playwright behaviour
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
    return _withCommand(this._desc, 'dblclick', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'dblclick');
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
  }

  async rightClick(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(this._desc, 'rightClick', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'rightClick');
      const init: MouseEventInit = { bubbles: true, cancelable: true, button: 2, buttons: 2 };
      el.dispatchEvent(new MouseEvent('mousedown',    init));
      el.dispatchEvent(new MouseEvent('mouseup',      init));
      el.dispatchEvent(new MouseEvent('contextmenu',  init));
    });
  }

  async fill(value: string, opts?: { timeout?: number; delay?: number }): Promise<void> {
    return _withCommand(this._desc ? `${this._desc}  "${value}"` : `"${value}"`, 'fill', async () => {
      await _checkLocatorHandlers();
      const el    = await this._waitForActionableEl(opts, 'fill') as HTMLInputElement | HTMLTextAreaElement;
      const win   = iframeWin() as any;
      const delay = opts?.delay ?? 30;

      // Use the iframe's own constructors so events are trusted by page scripts
      const KE = win.KeyboardEvent as typeof KeyboardEvent;
      const E  = win.Event        as typeof Event;
      const IE = (win.InputEvent ?? win.Event) as typeof InputEvent;

      // Native value setter — required for React/Vue controlled inputs
      const tag    = el.tagName;
      const proto  = tag === 'INPUT' ? win.HTMLInputElement.prototype : win.HTMLTextAreaElement.prototype;
      const setter = (Object.getOwnPropertyDescriptor(proto, 'value') ?? {}).set;
      const setVal = (v: string) => { if (setter) setter.call(el, v); else (el as any).value = v; };

      // Map a character to its DOM KeyboardEvent.code value
      const KEY_CODE_MAP: Record<string, string> = {
        ' ': 'Space', '.': 'Period', ',': 'Comma', '-': 'Minus', '=': 'Equal',
        '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash',
        ';': 'Semicolon', "'": 'Quote', '`': 'Backquote', '/': 'Slash',
      };
      const charToCode = (ch: string): string => {
        if (/[a-zA-Z]/.test(ch)) return 'Key' + ch.toUpperCase();
        if (/[0-9]/.test(ch))    return 'Digit' + ch;
        return KEY_CODE_MAP[ch] ?? 'Unidentified';
      };

      // keydown/keyup: charCode is always 0; keypress carries the actual charCode
      const kDown = (ch: string) => {
        const raw = ch.charCodeAt(0);
        const kc  = /[a-zA-Z]/.test(ch) ? ch.toUpperCase().charCodeAt(0) : raw;
        return { key: ch, code: charToCode(ch), keyCode: kc, charCode: 0, which: kc, bubbles: true, cancelable: true };
      };
      const kPress = (ch: string) => {
        const raw = ch.charCodeAt(0);
        return { key: ch, code: charToCode(ch), keyCode: raw, charCode: raw, which: raw, bubbles: true, cancelable: true };
      };

      el.focus();
      el.dispatchEvent(new E('focus',   { bubbles: false }));
      el.dispatchEvent(new E('focusin', { bubbles: true  }));

      // Clear existing value
      setVal('');
      el.dispatchEvent(new IE('input', { bubbles: true, cancelable: false, inputType: 'deleteContent' } as any));

      // Type character by character
      let current = '';
      for (const ch of value) {
        el.dispatchEvent(new KE('keydown',  kDown(ch)));
        el.dispatchEvent(new KE('keypress', kPress(ch)));
        current += ch;
        setVal(current);
        el.dispatchEvent(new IE('input', { bubbles: true, cancelable: false, inputType: 'insertText', data: ch } as any));
        el.dispatchEvent(new KE('keyup', kDown(ch)));
        if (delay > 0) await _awaitOrAbort(delay);
      }

      el.dispatchEvent(new E('change',   { bubbles: true  }));
      el.dispatchEvent(new E('blur',     { bubbles: false }));
      el.dispatchEvent(new E('focusout', { bubbles: true  }));
    });
  }

  async clear(opts?: { timeout?: number }): Promise<void> { await this.fill('', opts); }

  async type(text: string, opts?: { delay?: number; timeout?: number }): Promise<void> {
    return _withCommand(this._desc ? `${this._desc}  "${text}"` : `"${text}"`, 'type', async () => {
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
    return _withCommand(this._desc ? `${this._desc}  ${key}` : key, 'press', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForEl(opts?.timeout);
      const kOpts = { key, bubbles: true, cancelable: true };
      el.dispatchEvent(new KeyboardEvent('keydown',  kOpts));
      el.dispatchEvent(new KeyboardEvent('keypress', kOpts));
      el.dispatchEvent(new KeyboardEvent('keyup',    kOpts));
      if (key === 'Enter') {
        const form = (el as HTMLInputElement).form;
        if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    });
  }

  async selectOption(value: string | string[], opts?: { timeout?: number }): Promise<void> {
    const label = Array.isArray(value) ? value.join(', ') : value;
    return _withCommand(this._desc ? `${this._desc}  ${label}` : label, 'select', async () => {
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
    return _withCommand(this._desc, 'check', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'check') as HTMLInputElement;
      if (!el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }

  async uncheck(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(this._desc, 'uncheck', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'uncheck') as HTMLInputElement;
      if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }

  async focus(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(this._desc, 'focus', async () => {
      await _checkLocatorHandlers();
      (await this._waitForEl(opts?.timeout)).focus();
    });
  }

  async hover(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(this._desc, 'hover', async () => {
      await _checkLocatorHandlers();
      const el = await this._waitForActionableEl(opts, 'hover');
      el.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    });
  }

  async scrollIntoViewIfNeeded(opts?: { timeout?: number }): Promise<void> {
    return _withCommand(this._desc, 'scroll', async () => {
      await _checkLocatorHandlers();
      (await this._waitForEl(opts?.timeout)).scrollIntoView({ block: 'nearest' });
    });
  }

  async setInputFiles(
    files: string | string[] | { name: string; mimeType: string; buffer: Buffer } | { name: string; mimeType: string; buffer: Buffer }[],
    opts?: { timeout?: number }
  ): Promise<void> {
    const arr = Array.isArray(files) ? files : [files];
    const names = arr.map(f => (typeof f === 'string' ? f.split('/').pop() ?? f : f.name)).join(', ');
    return _withCommand(this._desc ? `${this._desc}  ${names}` : names, 'setInputFiles', async () => {
      await _checkLocatorHandlers();
      const el  = await this._waitForEl(opts?.timeout) as HTMLInputElement;
      const win = iframeWin() as any;
      const DT  = (win?.DataTransfer ?? DataTransfer) as typeof DataTransfer;
      const F   = (win?.File        ?? File)          as typeof File;
      const dt  = new DT();
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
      el.dispatchEvent(new Event('input',  { bubbles: true }));
    });
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
    const el = this._el() as HTMLElement | null;
    if (!el) return false;
    if (typeof (el as any).checkVisibility === 'function') {
      return (el as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    const win = iframeWin();
    if (!win) return false;
    const s = win.getComputedStyle(el);
    if (s.visibility === 'hidden' || s.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
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

  async evaluate<T = any>(pageFunction: string | ((element: Element, arg?: any) => T | Promise<T>), arg?: any): Promise<T> {
    return _withCommand(this._desc, 'evaluate', async () => {
      const el = await this._waitForEl();
      if (typeof pageFunction === 'function') {
        return Promise.resolve(arg !== undefined ? pageFunction(el, arg) : pageFunction(el));
      }
      const win = iframeWin() as any;
      if (!win) throw new Error('no active page');
      const fn = win.eval(`(${pageFunction})`);
      return Promise.resolve(arg !== undefined ? fn(el, arg) : fn(el));
    });
  }

  async waitFor(opts?: { state?: 'visible'|'hidden'|'attached'|'detached'; timeout?: number }): Promise<void> {
    const state   = opts?.state   ?? 'visible';
    const timeout = opts?.timeout ?? window.__CONFIG__?.actionTimeout ?? 5000;
    return _withCommand(this._desc ? `${this._desc}  ${state}` : state, 'waitFor', async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        const el = this._el();
        if (state === 'attached'  && el)                        return;
        if (state === 'detached'  && !el)                       return;
        if (state === 'visible'   && await this.isVisible())    return;
        if (state === 'hidden'    && !(await this.isVisible())) return;
        await _awaitOrAbort(50);
      }
      throw new Error(`waitFor(state="${state}") timed out after ${timeout}ms`);
    });
  }
}

// ── Init scripts ─────────────────────────────────────────────────────────────

const _initScripts: string[] = [];

function _runInitScripts(): void {
  const win = iframeWin() as any;
  if (!win) return;
  for (const code of _initScripts) {
    try { win.eval(code); }
    catch (e: any) { console.error('[addInitScript]', e.message); }
  }
}

// ── Locator handlers ──────────────────────────────────────────────────────────

interface LocatorHandlerEntry {
  locator: Locator;
  handler: (locator: Locator) => Promise<void>;
  noWaitAfter: boolean;
  times: number;
  invocations: number;
}

const _locatorHandlers: LocatorHandlerEntry[] = [];
let _handlerRunning = false;

async function _checkLocatorHandlers(): Promise<void> {
  if (_handlerRunning || _locatorHandlers.length === 0) return;
  _handlerRunning = true;
  try {
    for (let i = _locatorHandlers.length - 1; i >= 0; i--) {
      const h = _locatorHandlers[i];
      if (!await h.locator.isVisible()) continue;
      h.invocations++;
      await h.handler(h.locator);
      if (!h.noWaitAfter) {
        const t0 = Date.now();
        while (Date.now() - t0 < 5000 && await h.locator.isVisible()) {
          await _awaitOrAbort(50);
        }
      }
      if (h.times > 0 && h.invocations >= h.times) _locatorHandlers.splice(i, 1);
    }
  } finally {
    _handlerRunning = false;
  }
}

// ── Page event system ─────────────────────────────────────────────────────────

const _pageListeners = new Map<string, Set<(...args: any[]) => any>>();
const _permanentPageListeners = new Map<string, Set<(...args: any[]) => any>>();

function _emitPage(event: string, ...args: any[]): void {
  for (const fn of _permanentPageListeners.get(event) ?? []) {
    try { fn(...args); } catch (e) { console.error(`page.on('${event}') handler error:`, e); }
  }
  for (const fn of _pageListeners.get(event) ?? []) {
    try { fn(...args); } catch (e) { console.error(`page.on('${event}') handler error:`, e); }
  }
}

function _addPageListener(event: string, fn: (...args: any[]) => any): void {
  if (!_pageListeners.has(event)) _pageListeners.set(event, new Set());
  _pageListeners.get(event)!.add(fn);
}

function _removePageListener(event: string, fn: (...args: any[]) => any): void {
  _pageListeners.get(event)?.delete(fn);
}

let _frameObserver: MutationObserver | null = null;

// ── Per-protocol bridge installers ────────────────────────────────────────────

function _bridgeConsole(win: any): void {
  const consoleMethods = ['log', 'debug', 'info', 'warn', 'error', 'trace'] as const;
  for (const m of consoleMethods) {
    const orig = (win.console[m] as (...a: any[]) => void).bind(win.console);
    win.console[m] = (...args: any[]) => {
      orig(...args);
      const text = args.map((a: any) => {
        try { return typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a); }
        catch { return String(a); }
      }).join(' ');
      _emitPage('console', {
        type:     () => (m === 'warn' ? 'warning' : m),
        text:     () => text,
        args:     () => args,
        location: () => ({ url: win.location?.href ?? '', lineNumber: 0, columnNumber: 0 }),
      });
    };
  }
}

function _bridgeErrors(win: any): void {
  win.addEventListener('error', (e: ErrorEvent) => {
    _emitPage('pageerror', e.error instanceof Error ? e.error : new Error(e.message || String(e)));
  });
  win.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason ?? 'Unhandled promise rejection'));
    _emitPage('pageerror', err);
  });
}

function _bridgeDialogs(win: any): void {
  const makeDialog = (type: string, message: string, defaultValue = '') => {
    let accepted = type === 'alert';
    let promptText = defaultValue;
    return {
      type:         () => type,
      message:      () => message,
      defaultValue: () => defaultValue,
      accept:  (text?: string) => { accepted = true; if (text !== undefined) promptText = text; },
      dismiss: () => { accepted = false; },
      _result: () => {
        if (type === 'confirm') return accepted;
        if (type === 'prompt')  return accepted ? promptText : null;
        return undefined;
      },
    };
  };
  win.alert   = (message = '') => { _emitPage('dialog', makeDialog('alert', String(message))); };
  win.confirm = (message = '') => { const d = makeDialog('confirm', String(message)); _emitPage('dialog', d); return Boolean(d._result()); };
  win.prompt  = (message = '', def = '') => { const d = makeDialog('prompt', String(message), String(def)); _emitPage('dialog', d); return d._result() as string | null; };
}

function _bridgePopup(win: any): void {
  win.open = (url?: string, _target?: string, _features?: string) => {
    const popupPage = createTab(url);
    _emitPage('popup', popupPage);
    return _tabs[_tabs.length - 1]?.iframe.contentWindow ?? null;
  };
}

function _normalizeHeaders(h: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  try {
    if (typeof h.forEach === 'function') {
      h.forEach((val: string, key: string) => { out[key.toLowerCase()] = val; });
    } else if (Array.isArray(h)) {
      for (const [k, v] of h as [string, string][]) out[(k as string).toLowerCase()] = String(v);
    } else if (typeof h === 'object') {
      for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
    }
  } catch { /* ignore */ }
  return out;
}

function _isTextContent(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct.includes('text') || ct.includes('json') || ct.includes('xml') || ct.includes('javascript') || ct.includes('form');
}

// ── Route interception ────────────────────────────────────────────────────────

function _globToRegex(pattern: string): RegExp {
  const reStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x01')
    .replace(/\*/g, '[^/]*')
    .replace(/\x01/g, '.*');
  return new RegExp('^' + reStr + '$');
}

function _matchesRoutePattern(pattern: string | RegExp | ((url: string) => boolean), url: string): boolean {
  if (typeof pattern === 'function') return pattern(url);
  if (pattern instanceof RegExp) return pattern.test(url);
  try { return _globToRegex(pattern).test(url); } catch { return false; }
}

interface _RouteDecision {
  action: 'fulfill' | 'abort' | 'continue';
  response?: Response;
  errorCode?: string;
  continueOpts?: { url?: string; method?: string; headers?: Record<string, string>; postData?: BodyInit };
}

export class Route {
  private _decided = false;
  private _resolve!: (d: _RouteDecision) => void;
  private _promise: Promise<_RouteDecision>;

  constructor(
    private readonly _req: {
      url(): string; method(): string; headers(): Record<string, string>;
      postData(): any; isNavigationRequest(): boolean; resourceType(): string;
    }
  ) {
    this._promise = new Promise(r => { this._resolve = r; });
  }

  private _decide(d: _RouteDecision): void {
    if (this._decided) return;
    this._decided = true;
    this._resolve(d);
  }

  async fulfill(options: {
    status?: number;
    contentType?: string;
    headers?: Record<string, string>;
    body?: string | Uint8Array;
    json?: any;
  } = {}): Promise<void> {
    let body: BodyInit = options.body !== undefined ? options.body as BodyInit : '';
    const hdrs: Record<string, string> = {};
    if (options.json !== undefined) { body = JSON.stringify(options.json); hdrs['content-type'] = 'application/json'; }
    if (options.contentType) hdrs['content-type'] = options.contentType;
    Object.assign(hdrs, options.headers ?? {});
    this._decide({ action: 'fulfill', response: new Response(body, { status: options.status ?? 200, headers: hdrs }) });
  }

  async abort(errorCode = 'failed'): Promise<void> {
    this._decide({ action: 'abort', errorCode });
  }

  async continue(opts?: { url?: string; method?: string; headers?: Record<string, string>; postData?: BodyInit }): Promise<void> {
    this._decide({ action: 'continue', continueOpts: opts });
  }

  request() { return this._req; }

  /** @internal */
  _getDecision(): Promise<_RouteDecision> { return this._promise; }
  /** @internal */
  _isDecided(): boolean { return this._decided; }
}

interface _RouteHandlerEntry {
  pattern: string | RegExp | ((url: string) => boolean);
  handler: (route: Route, request: any) => void | Promise<void>;
}

const _routeHandlers: _RouteHandlerEntry[] = [];

async function _dispatchRoute(
  url: string,
  req: { url(): string; method(): string; headers(): Record<string, string>; postData(): any; isNavigationRequest(): boolean; resourceType(): string }
): Promise<_RouteDecision | null> {
  for (let i = _routeHandlers.length - 1; i >= 0; i--) {
    if (_matchesRoutePattern(_routeHandlers[i].pattern, url)) {
      const route = new Route(req);
      try { await Promise.resolve(_routeHandlers[i].handler(route, req)); } catch { /* ignore handler errors */ }
      if (!route._isDecided()) await route.continue();
      return route._getDecision();
    }
  }
  return null;
}

function _bridgeFetch(win: any): void {
  if (typeof win.fetch !== 'function') return;
  const origFetch = (win.fetch as typeof fetch).bind(win);
  win.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Use duck-typing instead of `instanceof URL` to work across iframe/window boundaries
    let url = typeof input === 'string' ? input
      : (input && typeof (input as any).href === 'string') ? (input as any).href
      : (input && typeof (input as any).url  === 'string') ? (input as any).url
      : '';
    // Resolve relative URLs to absolute using the real (non-proxy) page URL
    if (url && !/^https?:\/\//.test(url)) {
      try {
        const base = fromProxiedUrl(win.location?.href ?? '');
        if (base) url = new URL(url, base).href;
      } catch { /* keep original */ }
    }
    const isReqObj = input != null && typeof input === 'object' && typeof (input as any).href !== 'string';
    const method = ((init?.method) ?? (isReqObj ? (input as any).method : undefined) ?? 'GET').toUpperCase();
    const reqHeaders = _normalizeHeaders(init?.headers ?? (isReqObj ? (input as any).headers : undefined));
    const req    = { url: () => url, method: () => method, headers: () => reqHeaders, postData: () => init?.body ?? null, isNavigationRequest: () => false, resourceType: () => 'fetch' };

    const decision = await _dispatchRoute(url, req);
    _emitPage('request', req);

    if (decision?.action === 'abort') {
      const err = new TypeError(decision.errorCode ?? 'Failed to fetch');
      _emitPage('requestfailed', { ...req, failure: () => ({ errorText: String(err) }) });
      throw err;
    }

    if (decision?.action === 'fulfill' && decision.response) {
      const resp = decision.response;
      const respHeaders = _normalizeHeaders(resp.headers);
      let respBody: string | null = null;
      if (_isTextContent(resp.headers.get('content-type') ?? '')) {
        try { const text = await resp.clone().text(); respBody = text.length > 65536 ? text.slice(0, 65536) + '\n[truncated]' : text; } catch { /* ignore */ }
      }
      _emitPage('response', { url: () => url, status: () => resp.status, statusText: () => resp.statusText, ok: () => resp.ok, headers: () => respHeaders, body: () => respBody, request: () => req });
      _emitPage('requestfinished', req);
      return resp;
    }

    // 'continue' or no route — proceed with origFetch, possibly with modified options
    let fetchInput: RequestInfo | URL = input;
    let fetchInit: RequestInit | undefined = init;
    if (decision?.action === 'continue' && decision.continueOpts) {
      const o = decision.continueOpts;
      if (o.url) fetchInput = o.url;
      fetchInit = { ...init, ...(o.method ? { method: o.method } : {}), ...(o.headers ? { headers: o.headers } : {}), ...(o.postData !== undefined ? { body: o.postData } : {}) };
    }

    try {
      const resp = await origFetch(fetchInput, fetchInit);
      const respHeaders = _normalizeHeaders(resp.headers);
      let respBody: string | null = null;
      if (_isTextContent(resp.headers.get('content-type') ?? '')) {
        try {
          const text = await resp.clone().text();
          respBody = text.length > 65536 ? text.slice(0, 65536) + '\n[truncated]' : text;
        } catch { /* ignore */ }
      }
      _emitPage('response', { url: () => url, status: () => resp.status, statusText: () => resp.statusText, ok: () => resp.ok, headers: () => respHeaders, body: () => respBody, request: () => req });
      _emitPage('requestfinished', req);
      return resp;
    } catch (err) {
      _emitPage('requestfailed', { ...req, failure: () => ({ errorText: String(err) }) });
      throw err;
    }
  };
}

function _bridgeXHR(win: any): void {
  if (!win.XMLHttpRequest) return;
  const proto       = win.XMLHttpRequest.prototype as any;
  const origOpen    = proto.open as Function;
  const origSend    = proto.send as Function;
  proto.open = function (method: string, url: string | URL, ...rest: any[]) {
    (this as any)._xMethod = method;
    let xUrl = String(url);
    if (xUrl && !/^https?:\/\//.test(xUrl)) {
      try {
        const base = fromProxiedUrl(win.location?.href ?? '');
        if (base) xUrl = new URL(xUrl, base).href;
      } catch { /* keep original */ }
    }
    (this as any)._xUrl = xUrl;
    return origOpen.call(this, method, url, ...rest);
  };
  proto.send = function (body?: XMLHttpRequestBodyInit | Document | null) {
    const self = this as any;
    const xUrl = self._xUrl ?? '';
    const xMethod = (self._xMethod ?? 'GET').toUpperCase();
    const req  = { url: () => xUrl, method: () => xMethod, headers: () => ({}), postData: () => body ?? null, isNavigationRequest: () => false, resourceType: () => 'xhr' };

    const routeEntry = _routeHandlers.slice().reverse().find(h => _matchesRoutePattern(h.pattern, xUrl));
    if (routeEntry) {
      (async () => {
        const route = new Route(req);
        try { await Promise.resolve(routeEntry.handler(route, req)); } catch { /* ignore */ }
        if (!route._isDecided()) await route.continue();
        const decision = await route._getDecision();

        _emitPage('request', req);

        if (decision.action === 'abort') {
          _emitPage('requestfailed', { ...req, failure: () => ({ errorText: decision.errorCode ?? 'aborted' }) });
          try { const ev = new Event('abort'); self.dispatchEvent(ev); if (self.onabort) self.onabort(ev); } catch { /* ignore */ }
          return;
        }

        if (decision.action === 'fulfill' && decision.response) {
          const resp = decision.response;
          const hdrs: Record<string, string> = {};
          resp.headers.forEach((v: string, k: string) => { hdrs[k] = v; });
          let responseText = '';
          try { responseText = await resp.clone().text(); } catch { /* ignore */ }

          Object.defineProperty(self, 'status',       { value: resp.status,     configurable: true, writable: true });
          Object.defineProperty(self, 'statusText',   { value: resp.statusText, configurable: true, writable: true });
          Object.defineProperty(self, 'responseText', { value: responseText,    configurable: true, writable: true });
          Object.defineProperty(self, 'response',     { value: responseText,    configurable: true, writable: true });
          Object.defineProperty(self, 'readyState',   { value: 4,               configurable: true, writable: true });
          self.getAllResponseHeaders = () => Object.entries(hdrs).map(([k, v]) => `${k}: ${v}`).join('\r\n');
          self.getResponseHeader = (name: string) => hdrs[name.toLowerCase()] ?? null;

          _emitPage('response', { url: () => xUrl, status: () => resp.status, statusText: () => resp.statusText, ok: () => resp.ok, headers: () => hdrs, body: () => responseText, request: () => req });
          _emitPage('requestfinished', req);
          try {
            const rsc = new Event('readystatechange'); self.dispatchEvent(rsc); if (self.onreadystatechange) self.onreadystatechange(rsc);
            const load = new ProgressEvent('load'); self.dispatchEvent(load); if (self.onload) self.onload(load);
            const loadend = new ProgressEvent('loadend'); self.dispatchEvent(loadend); if (self.onloadend) self.onloadend(loadend);
          } catch { /* ignore */ }
          return;
        }

        // 'continue' — call origSend
        self.addEventListener('load', () => {
          const respHeaders: Record<string, string> = {};
          try {
            const raw = (self.getAllResponseHeaders() as string) ?? '';
            for (const line of raw.trim().split('\r\n')) {
              const idx = line.indexOf(':');
              if (idx > 0) respHeaders[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
            }
          } catch { /* ignore */ }
          let respBody: string | null = null;
          if (_isTextContent(self.getResponseHeader?.('content-type') ?? '')) {
            try { const text = String(self.responseText ?? ''); respBody = text.length > 65536 ? text.slice(0, 65536) + '\n[truncated]' : text; } catch { /* ignore */ }
          }
          _emitPage('response', { url: () => xUrl, status: () => self.status, statusText: () => self.statusText, ok: () => self.status >= 200 && self.status < 300, headers: () => respHeaders, body: () => respBody, request: () => req });
          _emitPage('requestfinished', req);
        });
        self.addEventListener('error', () => _emitPage('requestfailed', { ...req, failure: () => ({ errorText: 'Network error' }) }));
        self.addEventListener('abort', () => _emitPage('requestfailed', { ...req, failure: () => ({ errorText: 'Request aborted' }) }));
        origSend.call(self, body);
      })();
      return;
    }

    // No route match — original behavior
    _emitPage('request', req);
    this.addEventListener('load', () => {
      const respHeaders: Record<string, string> = {};
      try {
        const raw = (self.getAllResponseHeaders() as string) ?? '';
        for (const line of raw.trim().split('\r\n')) {
          const idx = line.indexOf(':');
          if (idx > 0) respHeaders[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
        }
      } catch { /* ignore */ }
      let respBody: string | null = null;
      if (_isTextContent(self.getResponseHeader?.('content-type') ?? '')) {
        try {
          const text = String(self.responseText ?? '');
          respBody = text.length > 65536 ? text.slice(0, 65536) + '\n[truncated]' : text;
        } catch { /* ignore */ }
      }
      _emitPage('response', { url: () => self._xUrl, status: () => self.status, statusText: () => self.statusText, ok: () => self.status >= 200 && self.status < 300, headers: () => respHeaders, body: () => respBody, request: () => req });
      _emitPage('requestfinished', req);
    });
    this.addEventListener('error', () => _emitPage('requestfailed', { ...req, failure: () => ({ errorText: 'Network error' }) }));
    this.addEventListener('abort', () => _emitPage('requestfailed', { ...req, failure: () => ({ errorText: 'Request aborted' }) }));
    return origSend.call(this, body);
  };
}

function _bridgeWebSocket(win: any): void {
  if (!win.WebSocket) return;
  const OrigWS: typeof WebSocket = win.WebSocket;
  win.WebSocket = class extends OrigWS {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url as string, protocols);
      _emitPage('websocket', this);
    }
  };
  win.WebSocket.CONNECTING = OrigWS.CONNECTING;
  win.WebSocket.OPEN       = OrigWS.OPEN;
  win.WebSocket.CLOSING    = OrigWS.CLOSING;
  win.WebSocket.CLOSED     = OrigWS.CLOSED;
}

function _bridgeWorker(win: any): void {
  if (!win.Worker) return;
  const OrigWorker: typeof Worker = win.Worker;
  win.Worker = class extends OrigWorker {
    constructor(scriptURL: string | URL, options?: WorkerOptions) {
      super(scriptURL, options);
      _emitPage('worker', this);
    }
  };
}

function _bridgeDocumentEvents(doc: Document): void {
  // target="_blank" links → new tab
  doc.addEventListener('click', (e: MouseEvent) => {
    const a = (e.target as Element)?.closest?.('a') as HTMLAnchorElement | null;
    if (!a || a.target !== '_blank' || a.hasAttribute('download')) return;
    e.preventDefault();
    if (a.href) { const popupPage = createTab(a.href); _emitPage('popup', popupPage); }
  }, true);

  // downloads
  doc.addEventListener('click', (e: MouseEvent) => {
    const a = (e.target as Element)?.closest?.('a') as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.href || '';
    if (a.hasAttribute('download') || /\.(pdf|zip|tar\.gz|gz|docx?|xlsx?|pptx?|csv|txt|png|jpe?g|gif|mp[34]|exe|dmg|pkg|deb|rpm)(\?|#|$)/i.test(href)) {
      _emitPage('download', {
        url:               () => href,
        suggestedFilename: () => a.download || href.split('/').pop()?.split('?')[0] || 'download',
      });
    }
  }, true);

  // file chooser
  doc.addEventListener('click', (e: MouseEvent) => {
    const el    = e.target as HTMLElement;
    const input = (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'file')
      ? el as HTMLInputElement
      : (el.closest?.('input[type="file"]') as HTMLInputElement | null);
    if (!input) return;
    _emitPage('filechooser', {
      element:    () => input,
      isMultiple: () => input.multiple,
      accept:     () => input.accept,
      setFiles:   (files: File[]) => {
        try {
          const dt = new DataTransfer();
          for (const f of files) dt.items.add(f);
          Object.defineProperty(input, 'files', { value: dt.files, configurable: true, writable: false });
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } catch { /* ignore */ }
      },
    });
  }, true);

  // sub-frame lifecycle (frameattached / framedetached / framenavigated)
  _frameObserver?.disconnect();
  _frameObserver = new MutationObserver((mutations: MutationRecord[]) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        const el = node as HTMLElement;
        if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
          const frame = { url: () => (el as HTMLIFrameElement).src, name: () => (el as any).name ?? '', isMainFrame: () => false };
          _emitPage('frameattached', frame);
          el.addEventListener('load', () => {
            try {
              const url = (el as HTMLIFrameElement).contentWindow?.location.href ?? (el as HTMLIFrameElement).src;
              _emitPage('framenavigated', { url: () => url, name: () => (el as any).name ?? '', isMainFrame: () => false });
            } catch { /* cross-origin sub-frame */ }
          });
        }
      }
      for (const node of Array.from(m.removedNodes)) {
        const el = node as HTMLElement;
        if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
          _emitPage('framedetached', { url: () => (el as HTMLIFrameElement).src, name: () => (el as any).name ?? '', isMainFrame: () => false });
        }
      }
    }
  });
  const docRoot = doc.documentElement ?? doc.body;
  if (docRoot) _frameObserver.observe(docRoot, { subtree: true, childList: true });
}

// ── Event bridge orchestrator ─────────────────────────────────────────────────

function _installEventBridges(): void {
  const win = iframeWin() as any;
  const doc = iframeDoc();
  if (!win || !doc) return;

  // Window-level bridges are guarded against re-installation on the same window
  if (!win.__cyEventBridges) {
    win.__cyEventBridges = true;
    _bridgeConsole(win);
    _bridgeErrors(win);
    _bridgeDialogs(win);
    _bridgePopup(win);
    _bridgeFetch(win);
    _bridgeXHR(win);
    _bridgeWebSocket(win);
    _bridgeWorker(win);
  }

  // Document-level bridges: guarded per document to prevent duplicate listeners
  if (!(doc as any).__cyDocBridges) {
    (doc as any).__cyDocBridges = true;
    _bridgeDocumentEvents(doc);
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

// ── FrameLocator ─────────────────────────────────────────────────────────────

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

  locator(selector: string): Locator {
    return new Locator(() => {
      const doc = this._frameDoc();
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
    }, `frame(${this._selector}) >> ${selector}`);
  }

  getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator {
    const exact = opts?.exact ?? false;
    const desc = `frame(${this._selector}) >> text(${text instanceof RegExp ? text : `"${text}"`})`;
    return new Locator(() => {
      const doc = this._frameDoc();
      if (!doc) return [];
      const leafs = Array.from(doc.querySelectorAll('*')).filter(
        el => el.children.length === 0 && textMatches(el, text, exact)
      );
      if (leafs.length) return leafs;
      return Array.from(doc.querySelectorAll('*')).filter(el => textMatches(el, text, exact));
    }, desc);
  }

  getByRole(role: string, opts?: { name?: string | RegExp; exact?: boolean }): Locator {
    const desc = opts?.name
      ? `frame(${this._selector}) >> role=${role}[name="${opts.name}"]`
      : `frame(${this._selector}) >> role=${role}`;
    return new Locator(() => {
      const doc = this._frameDoc();
      if (!doc) return [];
      const sel = ROLE_SELECTORS[role] ?? `[role="${role}"]`;
      let els = Array.from(doc.querySelectorAll(sel));
      if (opts?.name) {
        const name = opts.name;
        const exact = opts.exact ?? false;
        els = els.filter(el => {
          const labelledById = el.getAttribute('aria-labelledby');
          const labelled = labelledById ? doc.getElementById(labelledById) : null;
          const acc = (
            el.getAttribute('aria-label') ??
            labelled?.textContent ??
            (el.tagName === 'INPUT' ? el.getAttribute('value') : null) ??
            el.textContent ?? ''
          ).trim();
          return name instanceof RegExp ? name.test(acc) : exact ? acc === name : acc.includes(name);
        });
      }
      return els;
    }, desc);
  }

  getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator {
    const exact = opts?.exact ?? false;
    const desc = `frame(${this._selector}) >> label(${text instanceof RegExp ? text : `"${text}"`})`;
    return new Locator(() => {
      const doc = this._frameDoc();
      if (!doc) return [];
      const results: Element[] = [];
      for (const label of Array.from(doc.querySelectorAll<HTMLLabelElement>('label'))) {
        if (!textMatches(label, text, exact)) continue;
        const target = label.htmlFor
          ? doc.getElementById(label.htmlFor)
          : label.querySelector('input,select,textarea');
        if (target && !results.includes(target)) results.push(target);
      }
      for (const el of Array.from(doc.querySelectorAll('[aria-label]'))) {
        const lbl = el.getAttribute('aria-label') ?? '';
        const ok = text instanceof RegExp ? text.test(lbl) : exact ? lbl === text : lbl.includes(text as string);
        if (ok && !results.includes(el)) results.push(el);
      }
      return results;
    }, desc);
  }

  getByPlaceholder(text: string | RegExp): Locator {
    const desc = `frame(${this._selector}) >> placeholder(${text instanceof RegExp ? text : `"${text}"`})`;
    return new Locator(() => {
      const doc = this._frameDoc();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll('[placeholder]')).filter(el => {
        const p = el.getAttribute('placeholder') ?? '';
        return text instanceof RegExp ? text.test(p) : p.includes(text as string);
      });
    }, desc);
  }

  getByTestId(id: string): Locator {
    const q = id.replace(/"/g, '\\"');
    return new Locator(() => {
      const doc = this._frameDoc();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll(`[data-testid="${q}"],[data-test="${q}"]`));
    }, `frame(${this._selector}) >> [data-testid="${id}"]`);
  }

  getByAltText(text: string | RegExp): Locator {
    const desc = `frame(${this._selector}) >> alt(${text instanceof RegExp ? text : `"${text}"`})`;
    return new Locator(() => {
      const doc = this._frameDoc();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll('[alt]')).filter(el => {
        const a = el.getAttribute('alt') ?? '';
        return text instanceof RegExp ? text.test(a) : a.includes(text as string);
      });
    }, desc);
  }

  getByTitle(text: string | RegExp): Locator {
    const desc = `frame(${this._selector}) >> title(${text instanceof RegExp ? text : `"${text}"`})`;
    return new Locator(() => {
      const doc = this._frameDoc();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll('[title]')).filter(el => {
        const t = el.getAttribute('title') ?? '';
        return text instanceof RegExp ? text.test(t) : t.includes(text as string);
      });
    }, desc);
  }

  frameLocator(selector: string): FrameLocator {
    return new FrameLocator(selector, () => this._frameDoc());
  }
}

// ── Mouse ─────────────────────────────────────────────────────────────────────

type MouseButton = 'left' | 'middle' | 'right';

class Mouse {
  private _x = 0;
  private _y = 0;

  private _buttons = 0;
  private _clickCount = 0;

  // Current hovered ancestry path:
  // [target, parent, body, html]
  private _hoverPath: Element[] = [];

  private get _doc(): Document | null {
    return iframeDoc();
  }

  private _buttonCode(button?: MouseButton): number {
    switch (button) {
      case 'middle':
        return 1;
      case 'right':
        return 2;
      default:
        return 0;
    }
  }

  private _buttonMask(button: number): number {
    switch (button) {
      case 1:
        return 4;
      case 2:
        return 2;
      default:
        return 1;
    }
  }

  private _target(): HTMLElement | null {
    return this._doc?.elementFromPoint(
      this._x,
      this._y,
    ) as HTMLElement | null;
  }

  private _path(el: Element | null): Element[] {
    const path: Element[] = [];

    let current = el;

    while (current) {
      path.push(current);
      current = current.parentElement;
    }

    return path;
  }

  private _dispatch(
    target: EventTarget | null,
    type: string,
    init: MouseEventInit = {},
  ): void {
    if (!target) return;

    const eventInit: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,

      clientX: this._x,
      clientY: this._y,
      screenX: this._x,
      screenY: this._y,

      buttons: this._buttons,

      ...init,
    };

    // pointer event
    if (type.startsWith('pointer')) {
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          ...eventInit,
        }),
      );
      return;
    }

    target.dispatchEvent(
      new MouseEvent(type, eventInit),
    );
  }

  private _emitBoundaryEvents(
    prevTarget: Element | null,
    nextTarget: Element | null,
  ): void {
    const prevPath = this._hoverPath;
    const nextPath = this._path(nextTarget);

    const prevSet = new Set(prevPath);
    const nextSet = new Set(nextPath);

    const leaving = prevPath.filter(
      el => !nextSet.has(el),
    );

    const entering = nextPath.filter(
      el => !prevSet.has(el),
    );

    // ---- LEAVE ----
    for (const el of leaving) {
      this._dispatch(el, 'pointerout', {
        relatedTarget: nextTarget,
      });

      this._dispatch(el, 'mouseout', {
        relatedTarget: nextTarget,
      });

      this._dispatch(el, 'pointerleave', {
        bubbles: false,
        relatedTarget: nextTarget,
      });

      this._dispatch(el, 'mouseleave', {
        bubbles: false,
        relatedTarget: nextTarget,
      });
    }

    // ---- ENTER ----
    // browser order: outer → inner
    for (const el of [...entering].reverse()) {
      this._dispatch(el, 'pointerover', {
        relatedTarget: prevTarget,
      });

      this._dispatch(el, 'mouseover', {
        relatedTarget: prevTarget,
      });

      this._dispatch(el, 'pointerenter', {
        bubbles: false,
        relatedTarget: prevTarget,
      });

      this._dispatch(el, 'mouseenter', {
        bubbles: false,
        relatedTarget: prevTarget,
      });
    }

    this._hoverPath = nextPath;
  }

  private _emitMove(target: Element | null): void {
    this._dispatch(target, 'pointermove');
    this._dispatch(target, 'mousemove');
  }

  async move(
    x: number,
    y: number,
    opts?: { steps?: number },
  ): Promise<void> {
    return _withCommand(`${x}, ${y}`, 'mouse.move', async () => {
      const steps = Math.max(1, opts?.steps ?? 1);

      const startX = this._x;
      const startY = this._y;

      for (let i = 1; i <= steps; i++) {
        this._x = startX + ((x - startX) * i) / steps;
        this._y = startY + ((y - startY) * i) / steps;

        const prevTarget = this._hoverPath[0] ?? null;
        const nextTarget = this._target();

        if (prevTarget !== nextTarget) {
          this._emitBoundaryEvents(prevTarget, nextTarget);
        }

        this._emitMove(nextTarget);

        if (i < steps) {
          await new Promise(r => setTimeout(r, 0));
        }
      }
    });
  }

  async down(
    opts?: { button?: MouseButton },
  ): Promise<void> {
    return _withCommand(`${this._x}, ${this._y}`, 'mouse.down', async () => {
      const button = this._buttonCode(opts?.button);
      this._buttons |= this._buttonMask(button);
      const target = this._target();
      this._dispatch(target, 'pointerdown', { button });
      this._dispatch(target, 'mousedown', { button, detail: this._clickCount + 1 });
    });
  }

  async up(
    opts?: { button?: MouseButton },
  ): Promise<void> {
    return _withCommand(`${this._x}, ${this._y}`, 'mouse.up', async () => {
      const button = this._buttonCode(opts?.button);
      const mask   = this._buttonMask(button);
      const target = this._target();
      this._dispatch(target, 'pointerup', { button });
      this._dispatch(target, 'mouseup', { button, detail: this._clickCount + 1 });
      this._buttons &= ~mask;
    });
  }

  async click(
    x: number,
    y: number,
    opts?: {
      button?: MouseButton;
      clickCount?: number;
      delay?: number;
    },
  ): Promise<void> {
    return _withCommand(`${x}, ${y}`, 'mouse.click', async () => {
      await this.move(x, y);

      this._clickCount = opts?.clickCount ?? this._clickCount + 1;

      await this.down(opts);

      if (opts?.delay) {
        await new Promise(r => setTimeout(r, opts.delay));
      }

      await this.up(opts);

      const target = this._target();
      const button = this._buttonCode(opts?.button);

      this._dispatch(target, 'click', { button, detail: this._clickCount });

      if (button === 2) {
        this._dispatch(target, 'contextmenu', { button: 2 });
      }
    });
  }

  async dblclick(
    x: number,
    y: number,
    opts?: {
      button?: MouseButton;
      delay?: number;
    },
  ): Promise<void> {
    return _withCommand(`${x}, ${y}`, 'mouse.dblclick', async () => {
      await this.click(x, y, { ...opts, clickCount: 1 });

      if (opts?.delay) {
        await new Promise(r => setTimeout(r, opts.delay));
      }

      await this.click(x, y, { ...opts, clickCount: 2 });

      const target = this._target();
      this._dispatch(target, 'dblclick', { button: this._buttonCode(opts?.button), detail: 2 });
    });
  }

  async wheel(
    deltaX: number,
    deltaY: number,
  ): Promise<void> {
    return _withCommand(`Δ${deltaX}, ${deltaY}`, 'mouse.wheel', async () => {
      this._target()?.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX: this._x,
          clientY: this._y,
          screenX: this._x,
          screenY: this._y,
          deltaX,
          deltaY,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        }),
      );
    });
  }
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

interface _KeyInfo { key: string; code: string; keyCode: number }

const _KEY_DEFS: Record<string, _KeyInfo> = {
  Enter:        { key: 'Enter',      code: 'Enter',        keyCode: 13  },
  Return:       { key: 'Enter',      code: 'Enter',        keyCode: 13  },
  Tab:          { key: 'Tab',        code: 'Tab',          keyCode: 9   },
  Backspace:    { key: 'Backspace',  code: 'Backspace',    keyCode: 8   },
  Delete:       { key: 'Delete',     code: 'Delete',       keyCode: 46  },
  Escape:       { key: 'Escape',     code: 'Escape',       keyCode: 27  },
  Esc:          { key: 'Escape',     code: 'Escape',       keyCode: 27  },
  Space:        { key: ' ',          code: 'Space',        keyCode: 32  },
  ArrowUp:      { key: 'ArrowUp',    code: 'ArrowUp',      keyCode: 38  },
  ArrowDown:    { key: 'ArrowDown',  code: 'ArrowDown',    keyCode: 40  },
  ArrowLeft:    { key: 'ArrowLeft',  code: 'ArrowLeft',    keyCode: 37  },
  ArrowRight:   { key: 'ArrowRight', code: 'ArrowRight',   keyCode: 39  },
  Home:         { key: 'Home',       code: 'Home',         keyCode: 36  },
  End:          { key: 'End',        code: 'End',          keyCode: 35  },
  PageUp:       { key: 'PageUp',     code: 'PageUp',       keyCode: 33  },
  PageDown:     { key: 'PageDown',   code: 'PageDown',     keyCode: 34  },
  Insert:       { key: 'Insert',     code: 'Insert',       keyCode: 45  },
  Shift:        { key: 'Shift',      code: 'ShiftLeft',    keyCode: 16  },
  ShiftLeft:    { key: 'Shift',      code: 'ShiftLeft',    keyCode: 16  },
  ShiftRight:   { key: 'Shift',      code: 'ShiftRight',   keyCode: 16  },
  Control:      { key: 'Control',    code: 'ControlLeft',  keyCode: 17  },
  ControlLeft:  { key: 'Control',    code: 'ControlLeft',  keyCode: 17  },
  ControlRight: { key: 'Control',    code: 'ControlRight', keyCode: 17  },
  Alt:          { key: 'Alt',        code: 'AltLeft',      keyCode: 18  },
  AltLeft:      { key: 'Alt',        code: 'AltLeft',      keyCode: 18  },
  AltRight:     { key: 'Alt',        code: 'AltRight',     keyCode: 18  },
  Meta:         { key: 'Meta',       code: 'MetaLeft',     keyCode: 91  },
  MetaLeft:     { key: 'Meta',       code: 'MetaLeft',     keyCode: 91  },
  MetaRight:    { key: 'Meta',       code: 'MetaRight',    keyCode: 92  },
  CapsLock:     { key: 'CapsLock',   code: 'CapsLock',     keyCode: 20  },
  F1:           { key: 'F1',         code: 'F1',           keyCode: 112 },
  F2:           { key: 'F2',         code: 'F2',           keyCode: 113 },
  F3:           { key: 'F3',         code: 'F3',           keyCode: 114 },
  F4:           { key: 'F4',         code: 'F4',           keyCode: 115 },
  F5:           { key: 'F5',         code: 'F5',           keyCode: 116 },
  F6:           { key: 'F6',         code: 'F6',           keyCode: 117 },
  F7:           { key: 'F7',         code: 'F7',           keyCode: 118 },
  F8:           { key: 'F8',         code: 'F8',           keyCode: 119 },
  F9:           { key: 'F9',         code: 'F9',           keyCode: 120 },
  F10:          { key: 'F10',        code: 'F10',          keyCode: 121 },
  F11:          { key: 'F11',        code: 'F11',          keyCode: 122 },
  F12:          { key: 'F12',        code: 'F12',          keyCode: 123 },
};

function _resolveKey(name: string): _KeyInfo {
  if (_KEY_DEFS[name]) return _KEY_DEFS[name];
  if (name.length === 1) {
    const upper = name.toUpperCase();
    let code: string;
    if (/[a-zA-Z]/.test(name)) {
      code = 'Key' + upper;
    } else if (/[0-9]/.test(name)) {
      code = 'Digit' + name;
    } else {
      const CODE_MAP: Record<string, string> = {
        ' ': 'Space', '.': 'Period', ',': 'Comma', '-': 'Minus', '=': 'Equal',
        '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash',
        ';': 'Semicolon', "'": 'Quote', '`': 'Backquote', '/': 'Slash',
      };
      code = CODE_MAP[name] ?? 'Unidentified';
    }
    const kc = /[a-zA-Z]/.test(name) ? upper.charCodeAt(0) : name.charCodeAt(0);
    return { key: name, code, keyCode: kc };
  }
  return { key: name, code: name, keyCode: 0 };
}

export class Keyboard {
  private _pressed = new Set<string>();

  private get _doc(): Document | null { return iframeDoc(); }

  private _activeEl(): HTMLElement | null {
    return this._doc?.activeElement as HTMLElement | null;
  }

  private _buildInit(info: _KeyInfo): KeyboardEventInit {
    return {
      key:        info.key,
      code:       info.code,
      keyCode:    info.keyCode,
      which:      info.keyCode,
      charCode:   0,
      bubbles:    true,
      cancelable: true,
      shiftKey:   this._pressed.has('Shift'),
      ctrlKey:    this._pressed.has('Control'),
      altKey:     this._pressed.has('Alt'),
      metaKey:    this._pressed.has('Meta'),
    };
  }

  private _fire(target: EventTarget | null, type: string, init: KeyboardEventInit): void {
    if (!target) return;
    const win = iframeWin() as any;
    const KE = win?.KeyboardEvent ?? KeyboardEvent;
    target.dispatchEvent(new KE(type, init));
  }

  async down(key: string): Promise<void> {
    return _withCommand(key, 'keyboard.down', async () => {
      const info = _resolveKey(key);
      this._pressed.add(info.key);
      this._fire(this._activeEl(), 'keydown', this._buildInit(info));
    });
  }

  async up(key: string): Promise<void> {
    return _withCommand(key, 'keyboard.up', async () => {
      const info = _resolveKey(key);
      this._pressed.delete(info.key);
      this._fire(this._activeEl(), 'keyup', this._buildInit(info));
    });
  }

  private _pressRaw(info: _KeyInfo): void {
    const target = this._activeEl();
    const init = this._buildInit(info);
    this._fire(target, 'keydown', init);
    if (info.key.length === 1) {
      const cc = info.key.charCodeAt(0);
      this._fire(target, 'keypress', { ...init, charCode: cc, keyCode: cc, which: cc });
    }
    if (info.key === 'Enter') {
      const form = (target as HTMLInputElement | null)?.form;
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
    this._fire(target, 'keyup', this._buildInit(info));
  }

  async press(key: string, opts?: { delay?: number }): Promise<void> {
    return _withCommand(key, 'keyboard.press', async () => {
      const parts = key.split('+');
      const mainKey = parts[parts.length - 1];
      const mods = parts.slice(0, -1);

      for (const mod of mods) {
        const info = _resolveKey(mod);
        this._pressed.add(info.key);
        this._fire(this._activeEl(), 'keydown', this._buildInit(info));
      }

      this._pressRaw(_resolveKey(mainKey));

      if (opts?.delay) await _awaitOrAbort(opts.delay);

      for (const mod of [...mods].reverse()) {
        const info = _resolveKey(mod);
        this._pressed.delete(info.key);
        this._fire(this._activeEl(), 'keyup', this._buildInit(info));
      }
    });
  }

  async type(text: string, opts?: { delay?: number }): Promise<void> {
    return _withCommand(`"${text}"`, 'keyboard.type', async () => {
      for (const ch of text) {
        if (opts?.delay) await _awaitOrAbort(opts.delay);
        const info = _resolveKey(ch);
        const target = this._activeEl();
        const init = this._buildInit(info);
        const cc = ch.charCodeAt(0);

        this._fire(target, 'keydown', init);
        this._fire(target, 'keypress', { ...init, charCode: cc, keyCode: cc, which: cc });

        const el = target as HTMLInputElement | HTMLTextAreaElement | null;
        if (el && 'value' in el && !el.readOnly && !(el as any).disabled) {
          const win = iframeWin() as any;
          const proto = el.tagName === 'INPUT' ? win?.HTMLInputElement?.prototype : win?.HTMLTextAreaElement?.prototype;
          const setter = proto ? (Object.getOwnPropertyDescriptor(proto, 'value') ?? {}).set : undefined;
          if (setter) setter.call(el, el.value + ch); else (el as any).value += ch;
          const IE = win?.InputEvent ?? win?.Event ?? InputEvent;
          el.dispatchEvent(new IE('input', { bubbles: true, cancelable: false, inputType: 'insertText', data: ch } as any));
        }

        this._fire(target, 'keyup', this._buildInit(info));
      }
    });
  }

  async insertText(text: string): Promise<void> {
    return _withCommand(`"${text}"`, 'keyboard.insertText', async () => {
      const target = this._activeEl() as HTMLInputElement | HTMLTextAreaElement | null;
      if (target && 'value' in target) {
        const win = iframeWin() as any;
        const proto = target.tagName === 'INPUT' ? win?.HTMLInputElement?.prototype : win?.HTMLTextAreaElement?.prototype;
        const setter = proto ? (Object.getOwnPropertyDescriptor(proto, 'value') ?? {}).set : undefined;
        if (setter) setter.call(target, target.value + text); else (target as any).value += text;
        const IE = win?.InputEvent ?? win?.Event ?? InputEvent;
        target.dispatchEvent(new IE('input', { bubbles: true, cancelable: false, inputType: 'insertText', data: text } as any));
      }
    });
  }
}

export const page = {
  // ── Navigation ─────────────────────────────────────────────────────────────

  goto(url: string): Promise<void> {
    return _withCommand(url, 'goto', () => new Promise<void>((resolve, reject) => {
      const tab = _activeTab();
      if (!tab) { reject(new Error('no active tab')); return; }
      const navInput = document.getElementById('navUrl') as HTMLInputElement | null;
      if (navInput) navInput.value = url;
      const timer = setTimeout(() => reject(new Error(`goto("${url}") timed out`)), 30_000);
      tab.iframe.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
      tab.iframe.src = toProxiedUrl(url);
    }));
  },

  reload(): Promise<void> {
    return _withCommand('', 'reload', () => new Promise<void>((resolve, reject) => {
      const win = iframeWin();
      const tab = _activeTab();
      if (!win || !tab) { reject(new Error('no active tab')); return; }
      tab.iframe.addEventListener('load', () => resolve(), { once: true });
      win.location.reload();
    }));
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
    }, selector);
  },

  getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator {
    const exact = opts?.exact ?? false;
    const desc = `text(${text instanceof RegExp ? text : `"${text}"`})`;
    return new Locator(() => {
      const doc = iframeDoc();
      if (!doc) return [];
      const leafs = Array.from(doc.querySelectorAll('*')).filter(
        el => el.children.length === 0 && textMatches(el, text, exact)
      );
      if (leafs.length) return leafs;
      return Array.from(doc.querySelectorAll('*')).filter(el => textMatches(el, text, exact));
    }, desc);
  },

  getByRole(role: string, opts?: { name?: string | RegExp; exact?: boolean }): Locator {
    const desc = opts?.name ? `role=${role}[name="${opts.name}"]` : `role=${role}`;
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
          const labelled = labelledById ? doc.getElementById(labelledById) : null;
          const acc = (
            el.getAttribute('aria-label') ??
            labelled?.textContent ??
            (el.tagName === 'INPUT' ? el.getAttribute('value') : null) ??
            el.textContent ??
            ''
          ).trim();
          return name instanceof RegExp ? name.test(acc) : exact ? acc === name : acc.includes(name);
        });
      }
      return els;
    }, desc);
  },

  getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator {
    const exact = opts?.exact ?? false;
    const desc = `label(${text instanceof RegExp ? text : `"${text}"`})`;
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
    }, desc);
  },

  getByPlaceholder(text: string | RegExp): Locator {
    const desc = `placeholder(${text instanceof RegExp ? text : `"${text}"`})`;
    return new Locator(() => {
      const doc = iframeDoc();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll('[placeholder]')).filter(el => {
        const p = el.getAttribute('placeholder') ?? '';
        return text instanceof RegExp ? text.test(p) : p.includes(text as string);
      });
    }, desc);
  },

  getByTestId(id: string): Locator {
    return new Locator(() => {
      const doc = iframeDoc();
      if (!doc) return [];
      const q = id.replace(/"/g, '\\"');
      // Support both data-testid (Playwright default) and data-test (common alternative)
      return Array.from(doc.querySelectorAll(`[data-testid="${q}"],[data-test="${q}"]`));
    }, `[data-testid="${id}"]`);
  },

  getByAltText(text: string | RegExp): Locator {
    const desc = `alt(${text instanceof RegExp ? text : `"${text}"`})`;
    return new Locator(() => {
      const doc = iframeDoc();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll('[alt]')).filter(el => {
        const a = el.getAttribute('alt') ?? '';
        return text instanceof RegExp ? text.test(a) : a.includes(text as string);
      });
    }, desc);
  },

  getByTitle(text: string | RegExp): Locator {
    const desc = `title(${text instanceof RegExp ? text : `"${text}"`})`;
    return new Locator(() => {
      const doc = iframeDoc();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll('[title]')).filter(el => {
        const t = el.getAttribute('title') ?? '';
        return text instanceof RegExp ? text.test(t) : t.includes(text as string);
      });
    }, desc);
  },

  frameLocator(selector: string): FrameLocator {
    return new FrameLocator(selector, iframeDoc);
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
    const timeout = opts?.timeout ?? window.__CONFIG__?.actionTimeout ?? 5000;
    const re = typeof url === 'string' ? new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : url;
    return _withCommand(String(url), 'waitForURL', async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        if (re.test(page.url())) return;
        await _awaitOrAbort(50);
      }
      throw new Error(`waitForURL(${url}) timed out — current: ${page.url()}`);
    });
  },

  async waitForSelector(selector: string, opts?: { state?: 'visible'|'attached'; timeout?: number }): Promise<Locator> {
    const loc = page.locator(selector);
    await loc.waitFor({ state: opts?.state ?? 'visible', timeout: opts?.timeout });
    return loc;
  },

  async waitForTimeout(ms: number): Promise<void> {
    return _withCommand(`${ms}ms`, 'wait', () => _awaitOrAbort(ms));
  },

  // ── Keyboard ───────────────────────────────────────────────────────────────

  keyboard: new Keyboard(),

  // ── Mouse ──────────────────────────────────────────────────────────────────

  mouse: new Mouse(),

  // ── Viewport ───────────────────────────────────────────────────────────────

  setViewportSize(size: { width: number; height: number }): void {
    const entry = logCommand(`${size.width} × ${size.height}`, 'viewport');
    try {
      applyViewport(size.width, size.height);
      entry.success();
    } catch (error: any) {
      entry.fail(error?.message ?? String(error));
      throw error;
    }
  },

  // ── Events ─────────────────────────────────────────────────────────────────
  //
  // Supported events:
  //   close · console · crash · dialog · domcontentloaded · download
  //   filechooser · frameattached · framedetached · framenavigated · load
  //   pageerror · popup · request · requestfailed · requestfinished
  //   response · websocket · worker

  on(event: string, fn: (...args: any[]) => any) {
    _addPageListener(event, fn);
    return page;
  },

  onPermanent(event: string, fn: (...args: any[]) => any) {
    if (!_permanentPageListeners.has(event)) _permanentPageListeners.set(event, new Set());
    _permanentPageListeners.get(event)!.add(fn);
    return page;
  },

  off(event: string, fn: (...args: any[]) => any) {
    _removePageListener(event, fn);
    return page;
  },

  once(event: string, fn: (...args: any[]) => any) {
    const wrapper = (...args: any[]) => { _removePageListener(event, wrapper); fn(...args); };
    _addPageListener(event, wrapper);
    return page;
  },

  async bringToFront(): Promise<void> {
    if (_activeTabId) setActiveTab(_activeTabId);
  },

  async evaluate(pageFunction: string | ((...args: any[]) => any), arg?: any): Promise<any> {
    const win = iframeWin() as any;
    if (!win) throw new Error('no active page');
    const code = typeof pageFunction === 'function'
      ? arg !== undefined
        ? `(${pageFunction.toString()})(${JSON.stringify(arg)})`
        : `(${pageFunction.toString()})()`
      : String(pageFunction);
    return _withCommand(code.slice(0, 50).replace(/\s+/g, ' '), 'evaluate', () => Promise.resolve(win.eval(code)));
  },

  addInitScript(script: string | ((...args: any[]) => any), arg?: any): { dispose: () => void } {
    let code: string;
    if (typeof script === 'function') {
      code = arg !== undefined
        ? `(${script.toString()})(${JSON.stringify(arg)})`
        : `(${script.toString()})()`;
    } else {
      code = script;
    }
    _initScripts.push(code);
    const entry = logCommand(code.slice(0, 50).replace(/\s+/g, ' '), 'initScript');
    entry.success();
    return {
      dispose() {
        const i = _initScripts.indexOf(code);
        if (i >= 0) _initScripts.splice(i, 1);
      },
    };
  },

  addLocatorHandler(
    locator: Locator,
    handler: (locator: Locator) => Promise<void>,
    options?: { noWaitAfter?: boolean; times?: number }
  ): void {
    _locatorHandlers.push({
      locator,
      handler,
      noWaitAfter: options?.noWaitAfter ?? false,
      times: options?.times ?? 0,
      invocations: 0,
    });
    log('handler registered', 'info', 'addLocatorHandler');
  },

  removeLocatorHandler(locator: Locator): void {
    const i = _locatorHandlers.findIndex(h => h.locator === locator);
    if (i >= 0) _locatorHandlers.splice(i, 1);
  },

  async resetSession(): Promise<void> {
    _locatorHandlers.length = 0;
    _routeHandlers.length = 0;
    _pageListeners.clear();

    try {
      const win = iframeWin() as any;
      const doc = iframeDoc() as any;
      if (win) {
        try { win.localStorage.clear(); } catch { /* cross-origin */ }
        try { win.sessionStorage.clear(); } catch { /* cross-origin */ }
      }
      if (doc) {
        try {
          const hostname = win?.location?.hostname ?? '';
          for (const cookie of doc.cookie.split(';')) {
            const name = cookie.split('=')[0].trim();
            if (!name) continue;
            const base = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
            doc.cookie = base;
            if (hostname) doc.cookie = `${base}; domain=${hostname}`;
          }
        } catch { /* cross-origin or HttpOnly */ }
      }
    } catch { /* ignore */ }

    const tab = _activeTab();
    if (!tab) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('resetSession: blank page load timed out')), 10_000);
      tab.iframe.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
      tab.iframe.src = API_BASE + '/mock';
    });
  },

  // ── Route interception ────────────────────────────────────────────────────────

  async route(
    pattern: string | RegExp | ((url: string) => boolean),
    handler: (route: Route, request: any) => void | Promise<void>
  ): Promise<void> {
    _routeHandlers.push({ pattern, handler });
    log(typeof pattern === 'string' ? pattern : String(pattern), 'info', 'route');
  },

  async unroute(
    pattern: string | RegExp | ((url: string) => boolean),
    handler?: (route: Route, request: any) => void | Promise<void>
  ): Promise<void> {
    for (let i = _routeHandlers.length - 1; i >= 0; i--) {
      if (_routeHandlers[i].pattern === pattern && (!handler || _routeHandlers[i].handler === handler)) {
        _routeHandlers.splice(i, 1);
      }
    }
  },

  async close(): Promise<void> {
    _emitPage('close');
    closeTab(_activeTabId ?? '');
    log('page closed', 'info');
  },
};

// ── Playwright-style expect ───────────────────────────────────────────────────

async function _retry(fn: () => Promise<void>, timeout?: number): Promise<void> {
  const _timeout = timeout ?? window.__CONFIG__?.expectTimeout ?? 5000;
  const t0 = Date.now();
  let last: Error = new Error('Timeout');
  while (Date.now() - t0 < _timeout) {
    try { await fn(); return; } catch (e: any) { last = e; }
    await _awaitOrAbort(50);
  }
  throw last;
}

export function expect(target: any) {
  const t = (ms?: number) => ms ?? window.__CONFIG__?.expectTimeout ?? 5000;
  const locDesc = (target instanceof Locator) ? (target as Locator)._desc : '';

  // la = async matcher log helper, ls = sync matcher log helper
  const la = async (cmd: string, msg: string, fn: () => Promise<void>) => {
    const entry = logCommand(msg, cmd);
    try { await fn(); entry.success(); }
    catch (e: any) { entry.fail(e?.message ?? String(e)); throw e; }
  };
  const ls = (cmd: string, msg: string, fn: () => void) => {
    const entry = logCommand(msg, cmd);
    try { fn(); entry.success(); }
    catch (e: any) { entry.fail(e?.message ?? String(e)); throw e; }
  };

  // Runs `fn` in a retry loop; fn must throw with a descriptive error on failure.
  const locAssert = (cmd: string, fn: (loc: Locator) => Promise<void>, timeout?: number) =>
    la(cmd, locDesc, async () => await _retry(() => fn(target as Locator), t(timeout)));

  // ── Locator assertions (auto-retry) ──────────────────────────────────────────

  const matchers = {
    async toBeVisible(opts?: { timeout?: number }) {
      await locAssert('toBeVisible', async l => {
        if (!await l.isVisible()) throw new Error('Expected element to be visible');
      }, opts?.timeout);
    },
    async toBeHidden(opts?: { timeout?: number }) {
      await locAssert('toBeHidden', async l => {
        if (await l.isVisible()) throw new Error('Expected element to be hidden');
      }, opts?.timeout);
    },
    async toBeEnabled(opts?: { timeout?: number }) {
      await locAssert('toBeEnabled', async l => {
        if (!await l.isEnabled()) throw new Error('Expected element to be enabled');
      }, opts?.timeout);
    },
    async toBeDisabled(opts?: { timeout?: number }) {
      await locAssert('toBeDisabled', async l => {
        if (await l.isEnabled()) throw new Error('Expected element to be disabled');
      }, opts?.timeout);
    },
    async toBeChecked(opts?: { timeout?: number }) {
      await locAssert('toBeChecked', async l => {
        if (!await l.isChecked()) throw new Error('Expected element to be checked');
      }, opts?.timeout);
    },
    async toBeEditable(opts?: { timeout?: number }) {
      await locAssert('toBeEditable', async l => {
        if (!await l.isEditable()) throw new Error('Expected element to be editable');
      }, opts?.timeout);
    },
    async toBeEmpty(opts?: { timeout?: number }) {
      await locAssert('toBeEmpty', async l => {
        const got = await l.inputValue();
        if (got !== '') throw new Error(`Expected empty input, got ${JSON.stringify(got)}`);
      }, opts?.timeout);
    },
    async toHaveText(text: string | RegExp, opts?: { exact?: boolean; timeout?: number }) {
      const exact = opts?.exact ?? false;
      await locAssert('toHaveText', async l => {
        const got = ((await l.textContent()) ?? '').trim();
        if (!(text instanceof RegExp ? text.test(got) : exact ? got === text : got.includes(text as string)))
          throw new Error(`Expected text to ${exact ? 'equal' : 'include'} ${JSON.stringify(text)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout);
    },
    async toContainText(text: string | RegExp, opts?: { timeout?: number }) {
      await locAssert('toContainText', async l => {
        const got = (await l.textContent()) ?? '';
        if (!(text instanceof RegExp ? text.test(got) : got.includes(text as string)))
          throw new Error(`Expected text to contain ${JSON.stringify(text)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout);
    },
    async toHaveValue(value: string | RegExp, opts?: { timeout?: number }) {
      await locAssert('toHaveValue', async l => {
        const got = await l.inputValue();
        if (!(value instanceof RegExp ? value.test(got) : got === value))
          throw new Error(`Expected value ${JSON.stringify(value)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout);
    },
    async toHaveAttribute(name: string, value: string | RegExp = '', opts?: { timeout?: number }) {
      await locAssert('toHaveAttr', async l => {
        const got = await l.getAttribute(name);
        if (!(value instanceof RegExp ? value.test(got ?? '') : got === value))
          throw new Error(`Expected [${name}]=${JSON.stringify(value)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout);
    },
    async toHaveCount(count: number, opts?: { timeout?: number }) {
      await locAssert('toHaveCount', async l => {
        const got = await l.count();
        if (got !== count) throw new Error(`Expected ${count} elements, got ${got}`);
      }, opts?.timeout);
    },
    async toHaveClass(cls: string | RegExp, opts?: { timeout?: number }) {
      await locAssert('toHaveClass', async l => {
        const got = l._el()?.className ?? '';
        if (!(cls instanceof RegExp ? cls.test(got) : got.split(/\s+/).includes(cls as string)))
          throw new Error(`Expected class ${JSON.stringify(cls)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout);
    },

    // ── Page-level assertions ───────────────────────────────────────────────
    async toHaveURL(url: string | RegExp, opts?: { timeout?: number }) {
      await la('toHaveURL', String(url), async () => {
        await _retry(async () => {
          const u = page.url();
          if (!(url instanceof RegExp ? url.test(u) : u.includes(url as string)))
            throw new Error(`Expected URL to match ${url}, got "${u}"`);
        }, t(opts?.timeout));
      });
    },
    async toHaveTitle(title: string | RegExp, opts?: { timeout?: number }) {
      await la('toHaveTitle', String(title), async () => {
        await _retry(async () => {
          const got = await page.title();
          if (!(title instanceof RegExp ? title.test(got) : got === title))
            throw new Error(`Expected title ${JSON.stringify(title)}, got "${got}"`);
        }, t(opts?.timeout));
      });
    },

    // ── Plain-value assertions (sync) ───────────────────────────────────────
    toBe(expected: any)        { ls('toBe',         JSON.stringify(expected), () => { if (target !== expected)                                    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(target)}`); }); },
    toEqual(expected: any)     { ls('toEqual',      JSON.stringify(expected), () => { if (JSON.stringify(target) !== JSON.stringify(expected))    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(target)}`); }); },
    toBeTruthy()               { ls('toBeTruthy',   '', () => { if (!target)           throw new Error(`Expected truthy, got ${JSON.stringify(target)}`); }); },
    toBeFalsy()                { ls('toBeFalsy',    '', () => { if (target)            throw new Error(`Expected falsy, got ${JSON.stringify(target)}`); }); },
    toBeNull()                 { ls('toBeNull',     '', () => { if (target !== null)   throw new Error(`Expected null, got ${JSON.stringify(target)}`); }); },
    toBeUndefined()            { ls('toBeUndef',    '', () => { if (target !== undefined) throw new Error(`Expected undefined, got ${JSON.stringify(target)}`); }); },
    toBeGreaterThan(n: number) { ls('toBeGt',  String(n), () => { if (target <= n) throw new Error(`${target} is not > ${n}`); }); },
    toBeLessThan(n: number)    { ls('toBeLt',  String(n), () => { if (target >= n) throw new Error(`${target} is not < ${n}`); }); },
    toContain(item: any) {
      ls('toContain', JSON.stringify(item), () => {
        if (Array.isArray(target)) { if (!target.includes(item)) throw new Error(`Array does not contain ${JSON.stringify(item)}`); }
        else { if (!String(target).includes(String(item))) throw new Error(`"${target}" does not contain "${item}"`); }
      });
    },
    toMatch(r: RegExp | string) {
      ls('toMatch', String(r), () => {
        const re = typeof r === 'string' ? new RegExp(r) : r;
        if (!re.test(String(target))) throw new Error(`"${target}" does not match ${re}`);
      });
    },
  };

  const not = {
    async toBeVisible(opts?: { timeout?: number }) {
      await locAssert('not.toBeVisible', async l => {
        if (await l.isVisible()) throw new Error('Expected element NOT to be visible');
      }, opts?.timeout);
    },
    async toBeHidden(opts?: { timeout?: number }) {
      await locAssert('not.toBeHidden', async l => {
        if (!await l.isVisible()) throw new Error('Expected element NOT to be hidden');
      }, opts?.timeout);
    },
    async toBeEnabled(opts?: { timeout?: number }) {
      await locAssert('not.toBeEnabled', async l => {
        if (await l.isEnabled()) throw new Error('Expected element NOT to be enabled');
      }, opts?.timeout);
    },
    async toBeChecked(opts?: { timeout?: number }) {
      await locAssert('not.toBeChecked', async l => {
        if (await l.isChecked()) throw new Error('Expected element NOT to be checked');
      }, opts?.timeout);
    },
    async toBeEmpty(opts?: { timeout?: number }) {
      await locAssert('not.toBeEmpty', async l => {
        const got = await l.inputValue();
        if (got === '') throw new Error('Expected input NOT to be empty');
      }, opts?.timeout);
    },
    async toHaveText(text: string | RegExp, opts?: { exact?: boolean; timeout?: number }) {
      const exact = opts?.exact ?? false;
      await locAssert('not.toHaveText', async l => {
        const got = ((await l.textContent()) ?? '').trim();
        if (text instanceof RegExp ? text.test(got) : exact ? got === text : got.includes(text as string))
          throw new Error(`Expected text NOT to match ${JSON.stringify(text)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout);
    },
    async toContainText(text: string | RegExp, opts?: { timeout?: number }) {
      await locAssert('not.toContain', async l => {
        const got = (await l.textContent()) ?? '';
        if (text instanceof RegExp ? text.test(got) : got.includes(text as string))
          throw new Error(`Expected NOT to contain ${JSON.stringify(text)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout);
    },
    async toHaveCount(count: number, opts?: { timeout?: number }) {
      await locAssert('not.toHaveCount', async l => {
        const got = await l.count();
        if (got === count) throw new Error(`Expected count NOT to be ${count}, got ${got}`);
      }, opts?.timeout);
    },
    async toHaveURL(url: string | RegExp, opts?: { timeout?: number }) {
      await la('not.toHaveURL', String(url), async () => {
        await _retry(async () => {
          const u = page.url();
          if (url instanceof RegExp ? url.test(u) : u.includes(url as string))
            throw new Error(`Expected URL NOT to match ${url}, got "${u}"`);
        }, t(opts?.timeout));
      });
    },
    toBe(expected: any) { ls('not.toBe',      JSON.stringify(expected), () => { if (target === expected)  throw new Error(`Expected NOT ${JSON.stringify(expected)}`); }); },
    toBeTruthy()        { ls('not.toBeTruthy', '', () => { if (target)    throw new Error(`Expected falsy, got ${JSON.stringify(target)}`); }); },
    toBeFalsy()         { ls('not.toBeFalsy',  '', () => { if (!target)   throw new Error(`Expected truthy, got ${JSON.stringify(target)}`); }); },
    toBeNull()          { ls('not.toBeNull',   '', () => { if (target === null) throw new Error('Expected NOT null'); }); },
    toContain(item: any) {
      ls('not.toContain', JSON.stringify(item), () => {
        if (Array.isArray(target)) { if (target.includes(item)) throw new Error(`Expected array NOT to contain ${JSON.stringify(item)}`); }
        else { if (String(target).includes(String(item))) throw new Error(`Expected NOT to contain "${item}"`); }
      });
    },
  };

  return { ...matchers, not };
}

// ── Legacy tx API (backward compat) ──────────────────────────────────────────

export const testApi = {
  visit(url: string) {
    const tab = _activeTab();
    if (!tab) { log('iframe not ready', 'error'); return; }
    tab.iframe.src = toProxiedUrl(url);
    const navInput = document.getElementById('navUrl') as HTMLInputElement | null;
    if (navInput) navInput.value = url;
    log(url, 'info', 'visit');
  },
  reload() {
    const win = iframeWin();
    if (!win) { log('iframe not ready', 'error'); return; }
    log('', 'info', 'reload');
    win.location.reload();
  },
  get(selector: string): Element[] {
    try { return iframeDoc() ? Array.from(iframeDoc()!.querySelectorAll(selector)) : []; }
    catch { log('cross-origin blocked', 'error'); return []; }
  },
  find(selector: string): Element | null {
    try { return iframeDoc()?.querySelector(selector) ?? null; } catch { return null; }
  },
  text(selector: string): string {
    return testApi.find(selector)?.textContent ?? '';
  },
  click(selector: string) {
    const el = testApi.find(selector) as HTMLElement | null;
    if (!el) { log(selector, 'error', 'click'); return; }
    el.click();
    log(selector, 'success', 'click');
  },
  type(selector: string, value: string) {
    const el = testApi.find(selector) as HTMLInputElement | null;
    if (!el) { log(selector, 'error', 'type'); return; }
    const win = iframeWin() as any;
    const proto  = el.tagName === 'INPUT' ? win.HTMLInputElement.prototype : win.HTMLTextAreaElement.prototype;
    const setter = (Object.getOwnPropertyDescriptor(proto, 'value') ?? {}).set;
    el.focus();
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    log(`${selector}  "${value}"`, 'success', 'type');
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

// ── Popup page factory ────────────────────────────────────────────────────────

function _makePopupPage(tabId: string) {
  const _activate = () => { if (_tabs.find(t => t.id === tabId)) setActiveTab(tabId); };
  const popupPage = {
    async goto(url: string) { _activate(); return page.goto(url); },
    reload() { _activate(); return page.reload(); },
    url() { _activate(); return page.url(); },
    async title() { _activate(); return page.title(); },
    locator(selector: string) {
      return new Locator(() => { _activate(); return page.locator(selector)._els(); });
    },
    getByText: (text: string | RegExp, opts?: any) => new Locator(() => { _activate(); return page.getByText(text, opts)._els(); }),
    getByRole: (role: string, opts?: any) => new Locator(() => { _activate(); return page.getByRole(role, opts)._els(); }),
    getByLabel: (text: string | RegExp, opts?: any) => new Locator(() => { _activate(); return page.getByLabel(text, opts)._els(); }),
    getByPlaceholder: (text: string | RegExp) => new Locator(() => { _activate(); return page.getByPlaceholder(text)._els(); }),
    getByTestId: (id: string) => new Locator(() => { _activate(); return page.getByTestId(id)._els(); }),
    getByAltText: (text: string | RegExp) => new Locator(() => { _activate(); return page.getByAltText(text)._els(); }),
    getByTitle: (text: string | RegExp) => new Locator(() => { _activate(); return page.getByTitle(text)._els(); }),
    frameLocator: (selector: string) => new FrameLocator(selector, () => { _activate(); return iframeDoc(); }),
    waitForURL: (url: string | RegExp, opts?: any) => { _activate(); return page.waitForURL(url, opts); },
    waitForSelector: (sel: string, opts?: any) => { _activate(); return page.waitForSelector(sel, opts); },
    waitForTimeout: (ms: number) => page.waitForTimeout(ms),
    async bringToFront() { _activate(); },
    on:   (event: string, fn: any) => { _addPageListener(event, fn); return popupPage; },
    off:  (event: string, fn: any) => { _removePageListener(event, fn); return popupPage; },
    once: (event: string, fn: any) => { page.once(event, fn); return popupPage; },
    async close() { closeTab(tabId); },
  };
  return popupPage;
}

export type PopupPage = ReturnType<typeof _makePopupPage>;

// ── Early bridge watcher ──────────────────────────────────────────────────────
// Polls via rAF to detect new iframe windows as soon as they appear — well
// before the outer `load` event fires — so requests made during page init
// are captured.

let _earlyWatcherStarted = false;

function _startEarlyBridgeWatcher(): void {
  if (_earlyWatcherStarted) return;
  _earlyWatcherStarted = true;
  let lastWin: object | null = null;
  const tick = () => {
    try {
      const win = iframeWin() as any;
      if (win && win !== lastWin) {
        lastWin = win;
        if (!win.__cyEventBridges) {
          win.__cyEventBridges = true;
          _bridgeConsole(win);
          _bridgeErrors(win);
          _bridgeDialogs(win);
          _bridgePopup(win);
          _bridgeFetch(win);
          _bridgeXHR(win);
          _bridgeWebSocket(win);
          _bridgeWorker(win);
        }
      }
    } catch { /* cross-origin — ignore */ }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ── iframe init ───────────────────────────────────────────────────────────────

export function initIframe() {
  _tabs = []; _activeTabId = null; _tabCounter = 0;
  _initScripts.length = 0;
  _locatorHandlers.length = 0;
  _routeHandlers.length = 0;
  document.getElementById('iframe-container')!.innerHTML = '';
  viewportObserver?.disconnect();
  viewportObserver = new ResizeObserver(reapplyViewport);
  viewportObserver.observe(document.getElementById('iframe-container')!);
  if (window.__CONFIG__.viewport) {
    const { width, height } = window.__CONFIG__.viewport;
    viewportW = width; viewportH = height;
  }
  _startEarlyBridgeWatcher();
  createTab();
}

// ── API Response wrapper ──────────────────────────────────────────────────────

export interface ApiResponse {
  ok(): boolean;
  status(): number;
  statusText(): string;
  headers(): Record<string, string>;
  url(): string;
  json<T = unknown>(): Promise<T>;
  text(): Promise<string>;
  body(): Promise<ArrayBuffer>;
}

function _wrapResponse(resp: Response): ApiResponse {
  const hdrs: Record<string, string> = {};
  resp.headers.forEach((val, key) => { hdrs[key.toLowerCase()] = val; });
  return {
    ok:         () => resp.ok,
    status:     () => resp.status,
    statusText: () => resp.statusText,
    headers:    () => ({ ...hdrs }),
    url:        () => resp.url,
    json:       () => resp.clone().json(),
    text:       () => resp.clone().text(),
    body:       () => resp.clone().arrayBuffer(),
  };
}

// ── API Request context ───────────────────────────────────────────────────────

export const request = {
  async fetch(url: string, options?: RequestInit): Promise<ApiResponse> {
    const entry = logCommand(url, 'request');
    const method = (options?.method ?? 'GET').toUpperCase();
    const reqHeaders = _normalizeHeaders(options?.headers);
    const req = {
      url:                 () => url,
      method:              () => method,
      headers:             () => reqHeaders,
      postData:            () => options?.body ?? null,
      isNavigationRequest: () => false,
      resourceType:        () => 'fetch',
    };
    _emitPage('request', req);
    try {
      const resp = await globalThis.fetch(url, options);
      const respHeaders = _normalizeHeaders(resp.headers);
      let respBody: string | null = null;
      if (_isTextContent(resp.headers.get('content-type') ?? '')) {
        try {
          const text = await resp.clone().text();
          respBody = text.length > 65536 ? text.slice(0, 65536) + '\n[truncated]' : text;
        } catch { /* ignore */ }
      }
      _emitPage('response', { url: () => url, status: () => resp.status, statusText: () => resp.statusText, ok: () => resp.ok, headers: () => respHeaders, body: () => respBody, request: () => req });
      _emitPage('requestfinished', req);
      entry.success();
      return _wrapResponse(resp);
    } catch (error: any) {
      _emitPage('requestfailed', { ...req, failure: () => ({ errorText: String(error) }) });
      entry.fail(error?.message ?? String(error));
      throw error;
    }
  },
};

// ── Browser object ────────────────────────────────────────────────────────────

export const browser = {
  /** Open a new tab and return a Page-like object for it */
  async newPage(): Promise<PopupPage> {
    return createTab();
  },

  /** Return Page-like objects for all currently open tabs */
  pages(): PopupPage[] {
    return _tabs.map(t => _makePopupPage(t.id));
  },

  /** Execute a named task in the Node.js context and return its result */
  async task<T = unknown>(name: string, payload?: unknown): Promise<T> {
    return _withCommand(name, 'task', async () => {
      const resp = await fetch(API_BASE + '/api/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, payload: payload ?? null }),
      });
      const data = await resp.json() as { result?: T; error?: string };
      if (!resp.ok || data.error) throw new Error(data.error ?? `task "${name}" failed`);
      return data.result as T;
    });
  },
};
