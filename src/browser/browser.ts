import { actionTimeout, waitTimeout } from './config';
import type { WindowConfig } from '../types';
import type { TbCommandMethod, AgentLocatorSpec } from '../ws-protocol';
import { Route, routeHandlers as _routeHandlers, matchesRoutePattern as _matchesRoutePattern, dispatchRoute } from './route';
export { Route };
import { Locator, _locatorHandlers } from './locator';
import { isXPath, resolveXPath } from './locator-utils';
import { makeLocatorQueries } from './locator-queries';
import { Mouse } from './mouse';
import { Keyboard } from './keyboard';
import { wsConnect, wsOnMessage, wsSend, wsRequest } from './ws';
export { wsConnect, wsOnMessage, wsSend, wsRequest };
export { expect } from './assertions';

// ── Sub-modules ───────────────────────────────────────────────────────────────

import { _abortListeners, getAbortError, _awaitOrAbort } from './abort';
export { setTestAbort, _awaitOrAbort } from './abort';

import { _emitPage, _addPageListener, _removePageListener, addPermanentPageListener, clearPageListeners } from './page-events';
export { _emitPage } from './page-events';

import { logCommand, _withCommand, setLogContainer, stopCollectingLogs, setSnapshotCaptureFn } from './log';
export { LogEntry, TxCommandHandle, TxGroupHandle, logCommand, log, attach, _withCommand, setLogContainer, startCollectingLogs, stopCollectingLogs } from './log';

// ── Global types ──────────────────────────────────────────────────────────────

declare global {
  interface Window {
    __CONFIG__: WindowConfig;
  }
}

// ── sendCommand ───────────────────────────────────────────────────────────────

export async function sendCommand<T = void>(method: TbCommandMethod, params?: Record<string, unknown>): Promise<T> {
  const resp = await wsRequest<Record<string, unknown>>('tb-command', { method, params: params ?? {} });
  if (resp.error) throw new Error(resp.error as string);
  return resp.result as T;
}

// ── Viewport ──────────────────────────────────────────────────────────────────

let viewportW: number | null = null;
let viewportH: number | null = null;

export function reapplyViewport() {
  const tag = document.getElementById('viewportTag');
  if (tag) tag.textContent = viewportW && viewportH ? `${viewportW} × ${viewportH}` : '—';
}

export function applyViewport(w: number | null, h: number | null) {
  viewportW = w;
  viewportH = h;
  reapplyViewport();
}

// ── Tab state ─────────────────────────────────────────────────────────────────

interface TabEntry { id: string; title: string; url: string; }
let _tabs: TabEntry[] = [];
let _activeTabId: string | null = null;
function _activeTab(): TabEntry | null { return _tabs.find(t => t.id === _activeTabId) ?? null; }

export const API_BASE = 'http://localhost:' + window.__CONFIG__.port;

// Derive proxy prefix by stripping the trailing page URL from the session URL
const _proxyPrefix = window.__CONFIG__.proxyUrl.replace(/[^/]+$/, '');

// ── Navigation state cache ────────────────────────────────────────────────────

let _lastKnownUrl = '';
let _lastKnownTitle = '';

// ── Snapshots ─────────────────────────────────────────────────────────────────

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
  const snapshotId = ++_snapshotCounter;
  const url = _lastKnownUrl;
  const title = _lastKnownTitle;
  _snapshots.push({
    id: snapshotId,
    label: label || 'snapshot',
    timestamp: Date.now(),
    url,
    title,
    html: '',
    viewport: viewportW && viewportH ? { width: viewportW, height: viewportH } : undefined,
  });
  if (_snapshots.length > MAX_SNAPSHOTS) _snapshots.shift();
  _notifySnapshotListeners();
  // Async fill-in via agent
  sendCommand<string>('snapshot').then(html => {
    const entry = _snapshots.find(s => s.id === snapshotId);
    if (entry) { entry.html = html; _notifySnapshotListeners(); }
  }).catch(() => {});
  return snapshotId;
}

setSnapshotCaptureFn(_captureSnapshot);

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
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

// ── iframe stubs (kept for FrameLocator backwards compat) ─────────────────────
// Test execution now runs in the agent browser; these return null in the panel.

export function iframeDoc(): Document | null { return null; }
export function iframeWin(): Window & typeof globalThis | null { return null; }

// ── Tab lifecycle ─────────────────────────────────────────────────────────────

let _onTabsChanged: (() => void) | null = null;
export function setOnTabsChanged(fn: () => void) { _onTabsChanged = fn; }

export function getTabsSnapshot() {
  return _tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.id === _activeTabId }));
}

export async function setActiveTab(tabId: string) {
  await sendCommand('switchTab', { tabId });
  _activeTabId = tabId;
  const tab = _tabs.find(t => t.id === tabId);
  if (tab) { _lastKnownUrl = tab.url; _lastKnownTitle = tab.title; }
  _onTabsChanged?.();
}

export async function createTab(url?: string) {
  await sendCommand('newTab', { url });
  // _tabs will be updated via tab-created tb-event
  return page;
}

export async function closeTab(tabId: string) {
  await sendCommand('closeTab', { tabId });
  // _tabs will be updated via tab-closed tb-event
}

export async function closeExtraTabs() {
  const extra = _tabs.slice(1).map(t => t.id);
  for (const id of extra) await closeTab(id);
}

// ── Init scripts ─────────────────────────────────────────────────────────────

const _initScripts: string[] = [];

// ── saveArtifact ──────────────────────────────────────────────────────────────

function saveArtifact(name: string, data: string, ext = 'png'): void {
  let base64: string;
  if (data.startsWith('data:')) {
    base64 = data.split(',')[1];
  } else {
    const bytes = new TextEncoder().encode(data);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    base64 = btoa(bin);
  }
  wsSend('artifact', { name, ext, data: base64 });
}

// ── StorageState types ────────────────────────────────────────────────────────

export interface StorageState {
  cookieJar: object;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

// ── Shared page-event waiter ──────────────────────────────────────────────────

function _waitForPageEvent<T>(
  event: string,
  predicate: (arg: T) => boolean | Promise<boolean>,
  timeout: number,
  desc: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      settled = true;
      clearTimeout(timeoutId);
      _removePageListener(event, handler);
      _abortListeners.delete(abortFn);
    };
    const handler = async (arg: T) => {
      if (settled) return;
      try { if (!await Promise.resolve(predicate(arg))) return; } catch { return; }
      cleanup();
      resolve(arg);
    };
    const abortFn = (err: Error) => { if (!settled) { cleanup(); reject(err); } };
    const abortErr = getAbortError();
    if (abortErr) { reject(abortErr); return; }
    _abortListeners.add(abortFn);
    _addPageListener(event, handler);
    timeoutId = setTimeout(() => {
      if (!settled) { cleanup(); reject(new Error(`${desc} timed out after ${timeout}ms`)); }
    }, timeout);
  });
}

// ── page object ───────────────────────────────────────────────────────────────

export const page = {
  // ── Navigation ─────────────────────────────────────────────────────────────

  async goto(url: string): Promise<void> {
    return _withCommand(`page.goto(${JSON.stringify(url)})`, 'goto', async () => {
      await sendCommand('navigate', { url });
    });
  },

  async reload(): Promise<void> {
    return _withCommand('page.reload()', 'reload', async () => {
      await sendCommand('reload');
    });
  },

  // ── Locator factories ───────────────────────────────────────────────────────

  locator(selector: string): Locator {
    if (isXPath(selector)) {
      return new Locator({ kind: 'xpath', xpath: resolveXPath(selector) }, `locator('${selector}')`);
    }
    return new Locator({ kind: 'css', selector }, `locator('${selector}')`);
  },

  ...makeLocatorQueries(),

  // ── Page state ─────────────────────────────────────────────────────────────

  async title(): Promise<string> {
    return _withCommand('page.title()', 'title', async () => sendCommand<string>('title'));
  },

  url(): string {
    return _lastKnownUrl;
  },

  // ── Waits ──────────────────────────────────────────────────────────────────

  async waitForURL(url: string | RegExp, opts?: { timeout?: number }): Promise<void> {
    const timeout = actionTimeout(opts?.timeout);
    const re = typeof url === 'string' ? new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : url;
    return _withCommand(`page.waitForURL(${JSON.stringify(String(url))})`, 'waitForURL', async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        if (re.test(page.url())) return;
        await _awaitOrAbort(50);
      }
      throw new Error(`waitForURL(${url}) timed out — current: ${page.url()}`);
    });
  },

  async waitForSelector(selector: string, opts?: { state?: 'visible' | 'attached'; timeout?: number }): Promise<Locator> {
    const loc = page.locator(selector);
    await loc.waitFor({ state: opts?.state ?? 'visible', timeout: opts?.timeout });
    return loc;
  },

  async waitForFunction(fn: string | ((...args: any[]) => any), arg?: any, opts?: { timeout?: number }): Promise<void> {
    const code = typeof fn === 'function' ? fn.toString() : String(fn);
    return _withCommand(`page.waitForFunction(${code.slice(0, 50)})`, 'waitForFunction', () =>
      sendCommand('waitForFunction', { code, arg, timeout: opts?.timeout }));
  },

  async waitForTimeout(ms: number): Promise<void> {
    return _withCommand(`page.waitForTimeout(${ms})`, 'wait', () => _awaitOrAbort(ms));
  },

  waitForRequest(
    urlOrPredicate: string | RegExp | ((req: any) => boolean | Promise<boolean>),
    options?: { timeout?: number }
  ): Promise<any> {
    const timeout = waitTimeout(options?.timeout);
    const predicate: (req: any) => boolean | Promise<boolean> = typeof urlOrPredicate === 'function'
      ? urlOrPredicate
      : (req: any) => _matchesRoutePattern(urlOrPredicate, req.url());
    const desc = typeof urlOrPredicate === 'string' ? urlOrPredicate : String(urlOrPredicate);
    return _withCommand(`page.waitForRequest(${JSON.stringify(desc.slice(0, 50))})`, 'waitForRequest', () =>
      _waitForPageEvent('request', predicate, timeout, `waitForRequest(${desc})`));
  },

  waitForResponse(
    urlOrPredicate: string | RegExp | ((resp: any) => boolean | Promise<boolean>),
    options?: { timeout?: number }
  ): Promise<any> {
    const timeout = waitTimeout(options?.timeout);
    const predicate: (resp: any) => boolean | Promise<boolean> = typeof urlOrPredicate === 'function'
      ? urlOrPredicate
      : (resp: any) => _matchesRoutePattern(urlOrPredicate, resp.url());
    const desc = typeof urlOrPredicate === 'string' ? urlOrPredicate : String(urlOrPredicate);
    return _withCommand(`page.waitForResponse(${JSON.stringify(desc.slice(0, 50))})`, 'waitForResponse', () =>
      _waitForPageEvent('response', predicate, timeout, `waitForResponse(${desc})`));
  },

  // ── Keyboard / Mouse ────────────────────────────────────────────────────────

  keyboard: new Keyboard(),
  mouse: new Mouse(),

  // ── Viewport ───────────────────────────────────────────────────────────────

  async setViewportSize(size: { width: number; height: number }): Promise<void> {
    return _withCommand(`page.setViewportSize({ width: ${size.width}, height: ${size.height} })`, 'viewport', async () => {
      applyViewport(size.width, size.height);
      await sendCommand('setViewportSize', { width: size.width, height: size.height });
    });
  },

  // ── Events ─────────────────────────────────────────────────────────────────

  on(event: string, fn: (...args: any[]) => any) {
    _addPageListener(event, fn);
    const entry = logCommand(`page.on(${JSON.stringify(event)})`, 'on');
    entry.success();
    return page;
  },

  onPermanent(event: string, fn: (...args: any[]) => any) {
    addPermanentPageListener(event, fn);
    return page;
  },

  off(event: string, fn: (...args: any[]) => any) {
    _removePageListener(event, fn);
    const entry = logCommand(`page.off(${JSON.stringify(event)})`, 'off');
    entry.success();
    return page;
  },

  once(event: string, fn: (...args: any[]) => any) {
    const wrapper = (...args: any[]) => { _removePageListener(event, wrapper); fn(...args); };
    _addPageListener(event, wrapper);
    return page;
  },

  waitForEvent<T = any>(
    event: string,
    optionsOrPredicate?: ((arg: T) => boolean | Promise<boolean>) | { predicate?: (arg: T) => boolean | Promise<boolean>; timeout?: number }
  ): Promise<T> {
    const predicate = typeof optionsOrPredicate === 'function'
      ? optionsOrPredicate
      : optionsOrPredicate?.predicate;
    const timeout = (typeof optionsOrPredicate === 'object' && optionsOrPredicate?.timeout != null)
      ? optionsOrPredicate.timeout
      : waitTimeout();
    const matchAll = (arg: T): boolean | Promise<boolean> => predicate ? predicate(arg) : true;
    return _withCommand(`page.waitForEvent(${JSON.stringify(event)})`, 'waitForEvent', () =>
      _waitForPageEvent<T>(event, matchAll, timeout, `waitForEvent(${JSON.stringify(event)})`));
  },

  async evaluate(pageFunction: string | ((...args: any[]) => any), arg?: any): Promise<any> {
    const code = typeof pageFunction === 'function'
      ? arg !== undefined
        ? `(${pageFunction.toString()})(${JSON.stringify(arg)})`
        : `(${pageFunction.toString()})()`
      : String(pageFunction);
    return _withCommand(`page.evaluate(${code.slice(0, 50).replace(/\s+/g, ' ')})`, 'evaluate', () =>
      sendCommand('evaluate', { code }));
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
    sendCommand('addInitScript', { code }).catch(() => {});
    const entry = logCommand(`page.addInitScript(${code.slice(0, 50).replace(/\s+/g, ' ')})`, 'initScript');
    entry.success();
    return {
      dispose() {
        const i = _initScripts.indexOf(code);
        if (i >= 0) {
          _initScripts.splice(i, 1);
          sendCommand('clearInitScripts')
            .then(() => Promise.all(_initScripts.map(c => sendCommand('addInitScript', { code: c }))))
            .catch(() => {});
        }
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
    const entry = logCommand(`page.addLocatorHandler(${locator._desc})`, 'addLocatorHandler');
    entry.success();
  },

  removeLocatorHandler(locator: Locator): void {
    const i = _locatorHandlers.findIndex(h => h.locator === locator);
    if (i >= 0) _locatorHandlers.splice(i, 1);
    const entry = logCommand(`page.removeLocatorHandler(${locator._desc})`, 'removeLocatorHandler');
    entry.success();
  },

  async resetSession(): Promise<void> {
    _locatorHandlers.length = 0;
    _routeHandlers.length = 0;
    clearPageListeners();
    _initScripts.length = 0;
    await sendCommand('resetSession');
  },

  // ── Route interception ────────────────────────────────────────────────────────

  async route(
    pattern: string | RegExp | ((url: string) => boolean),
    handler: (route: Route, request: any) => void | Promise<void>
  ): Promise<void> {
    const desc = typeof pattern === 'string' ? JSON.stringify(pattern) : String(pattern);
    return _withCommand(`page.route(${desc})`, 'route', async () => {
      const wasEmpty = _routeHandlers.length === 0;
      _routeHandlers.push({ pattern, handler });
      if (wasEmpty) await sendCommand('route-register', { pattern: '**' });
    });
  },

  async unroute(
    pattern: string | RegExp | ((url: string) => boolean),
    handler?: (route: Route, request: any) => void | Promise<void>
  ): Promise<void> {
    const desc = typeof pattern === 'string' ? JSON.stringify(pattern) : String(pattern);
    return _withCommand(`page.unroute(${desc})`, 'unroute', async () => {
      for (let i = _routeHandlers.length - 1; i >= 0; i--) {
        if (_routeHandlers[i].pattern === pattern && (!handler || _routeHandlers[i].handler === handler)) {
          _routeHandlers.splice(i, 1);
        }
      }
    });
  },

  async close(): Promise<void> {
    return _withCommand('page.close()', 'close', async () => {
      _emitPage('close');
      if (_activeTabId) await closeTab(_activeTabId);
    });
  },

  async screenshot(opts?: { path?: string }): Promise<string> {
    return _withCommand('page.screenshot()', 'screenshot', async () => {
      const dataUrl = await sendCommand<string>('screenshot');
      if (opts?.path) saveArtifact(opts.path, dataUrl);
      return dataUrl;
    });
  },

  async snapshot(opts?: { path?: string }): Promise<string> {
    return _withCommand('page.snapshot()', 'snapshot', async () => {
      const html = await sendCommand<string>('snapshot');
      if (opts?.path) saveArtifact(opts.path, html, 'html');
      return html;
    });
  },

  async ariaSnapshot(): Promise<string> {
    return _withCommand('page.ariaSnapshot()', 'ariaSnapshot', async () => {
      return sendCommand<string>('ariaSnapshot');
    });
  },

  async content(): Promise<string> {
    return _withCommand('page.content()', 'content', () => sendCommand<string>('getHTML'));
  },

  async waitForNavigation(opts?: { url?: string | RegExp; timeout?: number }): Promise<void> {
    return _withCommand('page.waitForNavigation()', 'waitForNavigation', async () => {
      await sendCommand('waitForNavigation', { timeout: opts?.timeout });
      if (opts?.url) {
        const re = typeof opts.url === 'string'
          ? new RegExp(opts.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          : opts.url;
        if (!re.test(_lastKnownUrl)) throw new Error(`waitForNavigation: URL ${_lastKnownUrl} does not match ${opts.url}`);
      }
    });
  },

  /** Pre-queue a dialog decision so the next confirm/prompt returns the expected value. */
  async handleDialog(action: 'accept' | 'dismiss', promptText?: string): Promise<void> {
    return sendCommand('dialog-response', { action, text: promptText ?? '' });
  },
};

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

export const request = {
  async fetch(url: string, options?: RequestInit): Promise<ApiResponse> {
    const entry = logCommand(`request.fetch(${JSON.stringify(url)})`, 'request');
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
    } catch (error: unknown) {
      _emitPage('requestfailed', { ...req, failure: () => ({ errorText: String(error) }) });
      entry.fail(error instanceof Error ? error.message : String(error));
      throw error;
    }
  },
};

// ── Node object ───────────────────────────────────────────────────────────────

export const node = {
  async task<T = unknown>(name: string, payload?: unknown): Promise<T> {
    return _withCommand(`node.task(${JSON.stringify(name)})`, 'task', async () => {
      const resp = await wsRequest<{ result?: T; error?: string }>('task', { name, payload: payload ?? null } as Record<string, unknown>);
      if (resp.error) throw new Error(resp.error ?? `task "${name}" failed`);
      return resp.result as T;
    });
  },
};

// ── Browser object ────────────────────────────────────────────────────────────

export const browser = {
  async newPage(): Promise<void> {
    return _withCommand('browser.newPage()', 'newPage', async () => {
      await createTab();
    });
  },

  async newWindow(url?: string): Promise<void> {
    return _withCommand(`browser.newWindow(${url ? JSON.stringify(url) : ''})`, 'newWindow', async () => {
      await createTab(url);
    });
  },

  tabs(): ReturnType<typeof getTabsSnapshot> {
    return getTabsSnapshot();
  },

  switchTab(predicate: (tab: ReturnType<typeof getTabsSnapshot>[number]) => boolean): void {
    const tab = getTabsSnapshot().find(predicate);
    if (!tab) return;
    const entry = logCommand(`browser.switchTab()`, 'switchTab');
    setActiveTab(tab.id).then(() => entry.success()).catch(err => entry.fail(err?.message));
  },

  async storageState(opts?: { path?: string }): Promise<StorageState> {
    return _withCommand('page.storageState()', 'storageState', async () => {
      const { jar } = await wsRequest<{ jar: object }>('get-cookie-jar');

      const rawOrigin = _lastKnownUrl ? (() => { try { return new URL(_lastKnownUrl).origin; } catch { return ''; } })() : '';
      const origin = rawOrigin === 'null' ? '' : rawOrigin;

      const localStorageItems = await sendCommand<Array<{ name: string; value: string }>>('getLocalStorage');

      const state: StorageState = {
        cookieJar: jar,
        origins: localStorageItems.length ? [{ origin, localStorage: localStorageItems }] : [],
      };

      if (opts?.path) {
        await wsRequest('save-storage-state', { filePath: opts.path, data: JSON.stringify(state, null, 2) });
      }

      return state;
    });
  },

  async loadStorageState(state: StorageState | string): Promise<void> {
    return _withCommand(`page.loadStorageState(${typeof state === 'string' ? JSON.stringify(state) : ''})`, 'loadStorageState', async () => {
      let resolved: StorageState;
      if (typeof state === 'string') {
        const { data } = await wsRequest<{ data: string }>('load-storage-state', { filePath: state });
        resolved = JSON.parse(data) as StorageState;
      } else {
        resolved = state;
      }

      await wsRequest('set-cookie-jar', { jar: resolved.cookieJar ?? {} });

      if (resolved.origins?.length) {
        const rawOrigin = _lastKnownUrl ? (() => { try { return new URL(_lastKnownUrl).origin; } catch { return ''; } })() : '';
        for (const entry of resolved.origins) {
          if (entry.origin && rawOrigin && entry.origin !== rawOrigin) continue;
          if (entry.localStorage?.length) {
            await sendCommand('setLocalStorage', { items: entry.localStorage });
          }
        }
      }
    });
  },
};

// ── State reset (test isolation) ─────────────────────────────────────────────

export function _resetBrowserState(): void {
  _locatorHandlers.length = 0;
  _routeHandlers.length = 0;
  clearPageListeners();
  _snapshotListeners.clear();
  _snapshots.length = 0;
  _snapshotCounter = 0;
  stopCollectingLogs();
  setLogContainer(null);
}

// ── Browser state init ────────────────────────────────────────────────────────

export function initBrowserState() {
  _tabs = []; _activeTabId = null;
  _lastKnownUrl = ''; _lastKnownTitle = '';
  _initScripts.length = 0;
  _locatorHandlers.length = 0;
  _routeHandlers.length = 0;
  if (window.__CONFIG__.viewport) {
    const { width, height } = window.__CONFIG__.viewport;
    viewportW = width; viewportH = height;
    reapplyViewport();
  }
}

// ── Route interception handler ────────────────────────────────────────────────

async function _handleRequestIntercepted(payload: {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}): Promise<void> {
  const { requestId, url, method, headers, body } = payload;
  const req = {
    url:                 () => url,
    method:              () => method,
    headers:             () => headers,
    postData:            () => body,
    isNavigationRequest: () => false,
    resourceType:        () => 'fetch',
  };

  const fetchFn = async (opts?: { url?: string; method?: string; headers?: Record<string, string>; postData?: BodyInit }) => {
    const res = await sendCommand<{ status: number; headers: Record<string, string>; body: string }>('route-fetch', {
      url: opts?.url ?? url,
      method: opts?.method ?? method,
      headers: opts?.headers ?? headers,
      body: opts?.postData !== undefined ? String(opts.postData) : (body ?? undefined),
    });
    return new Response(res.body, { status: res.status, headers: res.headers });
  };

  const decision = await dispatchRoute(url, req, fetchFn) ?? { action: 'continue' as const };

  let decisionPayload: Record<string, unknown>;
  if (decision.action === 'fulfill' && decision.response) {
    const respBody = await decision.response.clone().text();
    const hdrs: Record<string, string> = {};
    decision.response.headers.forEach((v, k) => { hdrs[k] = v; });
    decisionPayload = { action: 'fulfill', status: decision.response.status, headers: hdrs, body: respBody };
  } else if (decision.action === 'abort') {
    decisionPayload = { action: 'abort', errorCode: decision.errorCode ?? 'failed' };
  } else {
    const cont = (decision as any).continueOpts;
    decisionPayload = { action: 'continue', ...(cont ?? {}) };
  }

  await sendCommand('route-decision', { requestId, ...decisionPayload });
}

// ── tb-event wiring ───────────────────────────────────────────────────────────

wsOnMessage('tb-event', (msg: Record<string, unknown>) => {
  const event = msg.event as string;
  const p = (msg.payload ?? {}) as Record<string, unknown>;

  switch (event) {
    case 'load': {
      const url = fromProxiedUrl((p.url as string) ?? '');
      const title = (p.title as string) ?? '';
      _lastKnownUrl = url;
      _lastKnownTitle = title;
      const tab = _tabs.find(t => t.id === _activeTabId);
      if (tab) { tab.url = url; tab.title = title; }
      _onTabsChanged?.();
      _emitPage('load');
      if (window.__CONFIG__.snapshot) _captureSnapshot('load');
      break;
    }

    case 'domcontentloaded':
      _emitPage('domcontentloaded');
      break;

    case 'framenavigated': {
      const url = fromProxiedUrl((p.url as string) ?? '');
      const title = (p.title as string) ?? '';
      _lastKnownUrl = url;
      _lastKnownTitle = title;
      const tab = _tabs.find(t => t.id === _activeTabId);
      if (tab) { tab.url = url; tab.title = title; }
      _onTabsChanged?.();
      _emitPage('framenavigated', { url: () => url, name: () => '', isMainFrame: () => true });
      break;
    }

    case 'console':
      _emitPage('console', p);
      break;

    case 'pageerror':
      _emitPage('pageerror', new Error((p.message as string) ?? String(p)));
      break;

    case 'dialog': {
      const dialogProxy = {
        type:         () => p.dialogType,
        message:      () => p.message,
        defaultValue: () => p.defaultValue,
        accept:       (promptText?: string) => sendCommand('dialog-response', { action: 'accept', text: promptText ?? '' }),
        dismiss:      () => sendCommand('dialog-response', { action: 'dismiss' }),
      };
      _emitPage('dialog', dialogProxy);
      break;
    }

    case 'request':
    case 'response':
    case 'requestfailed':
    case 'requestfinished':
      _emitPage(event, p);
      break;

    case 'request-intercepted':
      _handleRequestIntercepted(p as any).catch(err => {
        console.error('[route] intercept error:', err);
        sendCommand('route-decision', { requestId: (p as any).requestId, action: 'continue' }).catch(() => {});
      });
      break;

    case 'tab-created': {
      const tabId = p.tabId as string;
      const url = fromProxiedUrl((p.url as string) ?? '');
      const title = (p.title as string) ?? 'New Tab';
      if (!_tabs.find(t => t.id === tabId)) {
        _tabs.push({ id: tabId, title, url });
      }
      _activeTabId = tabId;
      _lastKnownUrl = url;
      _lastKnownTitle = title;
      _onTabsChanged?.();
      break;
    }

    case 'tab-closed': {
      const tabId = p.tabId as string;
      _tabs = _tabs.filter(t => t.id !== tabId);
      if (_activeTabId === tabId) {
        _activeTabId = _tabs[_tabs.length - 1]?.id ?? null;
        const tab = _activeTab();
        if (tab) { _lastKnownUrl = tab.url; _lastKnownTitle = tab.title; }
      }
      _onTabsChanged?.();
      break;
    }

    case 'tab-switched': {
      const tabId = p.tabId as string;
      _activeTabId = tabId;
      const tab = _tabs.find(t => t.id === tabId);
      if (tab) { _lastKnownUrl = tab.url; _lastKnownTitle = tab.title; }
      _onTabsChanged?.();
      break;
    }

    case 'crash':
      _emitPage('crash');
      break;

    case 'popup':
    case 'download':
    case 'websocket':
    case 'worker':
    case 'filechooser':
    case 'frameattached':
    case 'framedetached':
    case 'close':
      _emitPage(event, p);
      break;
  }
});

wsOnMessage('agent-connected', () => {
  // Re-send all registered init scripts to the newly connected agent
  for (const code of _initScripts) {
    sendCommand('addInitScript', { code }).catch(() => {});
  }
  // Re-enable route interception if handlers exist
  if (_routeHandlers.length > 0) {
    sendCommand('route-register', { pattern: '**' }).catch(() => {});
  }
});
