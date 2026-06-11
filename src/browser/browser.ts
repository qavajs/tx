import { domToPng } from 'modern-screenshot';
import { actionTimeout, waitTimeout } from './config';
import type { WindowConfig } from '../types';
import { Route, routeHandlers as _routeHandlers, matchesRoutePattern as _matchesRoutePattern } from './route';
export { Route };
import { installEventBridges as _installEventBridges, installWindowBridges as _installWindowBridges, cleanupBridges as _cleanupBridges } from './bridges';
import { _clearRouteOrigFetch } from './route';
import { Locator, resolveSelector, _locatorHandlers } from './locator';
import { isXPath, resolveXPath, queryXPath } from './locator-utils';
import { makeLocatorQueries } from './locator-queries';
import { ariaSnapshot as _ariaSnapshot } from './aria';
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

// ── Viewport ──────────────────────────────────────────────────────────────────

let viewportW: number | null = null;
let viewportH: number | null = null;
let viewportObserver: ResizeObserver | null = null;

export function reapplyViewport() {
  const container = document.getElementById('iframe-container');
  const tag = document.getElementById('viewportTag');
  const tab = _activeTab();
  const iframe = tab?.iframe ?? null;

  if (tab?.popup) {
    const popup = tab.popup;
    if (!viewportW || !viewportH) {
      try { if (tag) tag.textContent = `${popup.innerWidth} × ${popup.innerHeight}`; } catch {}
      return;
    }
    try {
      const chromeW = popup.outerWidth - popup.innerWidth;
      const chromeH = popup.outerHeight - popup.innerHeight;
      popup.resizeTo(viewportW + chromeW, viewportH + chromeH);
      if (tag) tag.textContent = `${viewportW} × ${viewportH}`;
    } catch { /* cross-origin or sandboxed */ }
    return;
  }

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
  const ox = (cw - viewportW * scale) / 2;
  const oy = (ch - viewportH * scale) / 2;

  iframe.style.position = 'absolute';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.width = viewportW + 'px';
  iframe.style.height = viewportH + 'px';
  iframe.style.transform = `translate(${ox}px,${oy}px) scale(${scale})`;
  iframe.style.transformOrigin = 'top left';
  if (tag) tag.textContent = `${viewportW} × ${viewportH} @ ${Math.round(scale * 100)}%`;
}

export function applyViewport(w: number | null, h: number | null) {
  viewportW = w;
  viewportH = h;
  reapplyViewport();
}

// ── Tab state ─────────────────────────────────────────────────────────────────

interface TabEntry { id: string; iframe?: HTMLIFrameElement; popup?: Window; title: string; url: string; }
let _tabs: TabEntry[] = [];
let _activeTabId: string | null = null;
let _tabCounter = 0;
function _activeTab(): TabEntry | null { return _tabs.find(t => t.id === _activeTabId) ?? null; }

export const API_BASE = window.__CONFIG__.apiBase;

// Derive proxy prefix by stripping the trailing page URL (e.g. "about:blank") from the session URL
// e.g. "http://host/proxy/SESSION/about:blank" → "http://host/proxy/SESSION/"
const _proxyPrefix = window.__CONFIG__.proxyUrl.replace(/[^/]+$/, '');

// ── WebSocket connection — see ./ws ───────────────────────────────────────────

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

// Wire snapshot capture into the log module so logCommand.success can attach snapshots
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
  try {
    const tab = _activeTab();
    if (tab?.popup) return tab.popup.document;
    return tab?.iframe?.contentDocument ?? null;
  } catch { return null; }
}
export function iframeWin(): Window & typeof globalThis | null {
  try {
    const tab = _activeTab();
    if (tab?.popup) return tab.popup as any;
    return tab?.iframe?.contentWindow as any ?? null;
  } catch { return null; }
}

// ── Tab lifecycle ─────────────────────────────────────────────────────────────

let _onTabsChanged: (() => void) | null = null;
export function setOnTabsChanged(fn: () => void) { _onTabsChanged = fn; }

export function getTabsSnapshot() {
  return _tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.id === _activeTabId }));
}

export function setActiveTab(tabId: string) {
  for (const t of _tabs) if (t.iframe) t.iframe.style.display = 'none';
  const tab = _tabs.find(t => t.id === tabId);
  if (!tab) return;
  if (tab.iframe) tab.iframe.style.display = 'block';
  if (tab.popup) tab.popup.focus();
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
  iframeEl.src = url ? toProxiedUrl(url) : API_BASE + '/about-blank';
  setActiveTab(tabId);
  _onTabsChanged?.();
  return page;
}

export function closeTab(tabId: string) {
  const tab = _tabs.find(t => t.id === tabId);
  if (!tab) return;
  if (tab.iframe) tab.iframe.remove();
  if (tab.popup) tab.popup.close();
  _tabs = _tabs.filter(t => t.id !== tabId);
  _cleanupBridges();
  _clearRouteOrigFetch();
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

// ── Per-protocol bridge installers moved to ./bridges ────────────────────────
// (installEventBridges imported as _installEventBridges above)

// ── Screenshot capture ────────────────────────────────────────────────────────

async function captureScreenshot(): Promise<string> {
  const doc = iframeDoc();
  if (!doc) throw new Error('no active tab');
  const tab = _activeTab()!;
  const w = viewportW ?? (tab.iframe?.offsetWidth || 1280);
  const h = viewportH ?? (tab.iframe?.offsetHeight || 720);
  return domToPng(doc.documentElement, { width: w, height: h });
}

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

// ── Full-page snapshot capture ─────────────────────────────────────────────────

async function _fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

async function _fetchDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

// url() pattern covering single-quoted, double-quoted, and bare URLs
const _cssUrlRe = /url\(\s*(?:'([^']*)'|"([^"]*)"|([^'")\s]*))\s*\)/g;

async function _inlineCSSResources(css: string): Promise<string> {
  // Fetch all @import rules in parallel (each imported sheet is itself inlined recursively)
  const importRe = /@import\s+(?:url\(\s*['"]?([^'")\s]+)['"]?\s*\)|['"]([^'"]+)['"])[^;]*;/g;
  const imports: { match: string; url: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(css)) !== null) imports.push({ match: m[0], url: m[1] || m[2] });
  if (imports.length > 0) {
    const inlined = await Promise.all(imports.map(async ({ url }) => {
      if (url.startsWith('data:')) return null;
      const imported = await _fetchText(url);
      return imported != null ? _inlineCSSResources(imported) : null;
    }));
    for (let i = 0; i < imports.length; i++) {
      if (inlined[i] != null) css = css.replace(imports[i].match, inlined[i]!);
    }
  }

  // Collect unique url() values then fetch all in parallel
  const urlMap = new Map<string, string>();
  _cssUrlRe.lastIndex = 0;
  while ((m = _cssUrlRe.exec(css)) !== null) {
    const u = m[1] ?? m[2] ?? m[3];
    if (u && !u.startsWith('data:')) urlMap.set(u, '');
  }
  await Promise.all(Array.from(urlMap.keys()).map(async url => {
    const d = await _fetchDataUrl(url);
    if (d) urlMap.set(url, d);
  }));
  _cssUrlRe.lastIndex = 0;
  return css.replace(_cssUrlRe, (_match, u1, u2, u3) => {
    const url = u1 ?? u2 ?? u3;
    const d = urlMap.get(url);
    return d ? `url('${d}')` : _match;
  });
}

async function captureFullSnapshot(): Promise<string> {
  const doc = iframeDoc();
  if (!doc) throw new Error('no active tab');
  const pageUrl = page.url();

  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  for (const el of Array.from(clone.querySelectorAll('script'))) el.remove();

  // Sync live form state into clone (cloneNode copies attributes, not JS properties)
  const liveInputs = Array.from(doc.querySelectorAll<HTMLInputElement>('input'));
  const cloneInputs = Array.from(clone.querySelectorAll<HTMLInputElement>('input'));
  for (let i = 0; i < liveInputs.length; i++) {
    if (!cloneInputs[i]) continue;
    const type = liveInputs[i].type.toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      if (liveInputs[i].checked) cloneInputs[i].setAttribute('checked', '');
      else cloneInputs[i].removeAttribute('checked');
    } else {
      cloneInputs[i].setAttribute('value', liveInputs[i].value);
    }
  }
  const liveTextareas = Array.from(doc.querySelectorAll<HTMLTextAreaElement>('textarea'));
  const cloneTextareas = Array.from(clone.querySelectorAll<HTMLTextAreaElement>('textarea'));
  for (let i = 0; i < liveTextareas.length; i++) {
    if (cloneTextareas[i]) cloneTextareas[i].textContent = liveTextareas[i].value;
  }
  const liveSelects = Array.from(doc.querySelectorAll<HTMLSelectElement>('select'));
  const cloneSelects = Array.from(clone.querySelectorAll<HTMLSelectElement>('select'));
  for (let i = 0; i < liveSelects.length; i++) {
    if (!cloneSelects[i]) continue;
    const liveOpts = Array.from(liveSelects[i].options);
    const cloneOpts = Array.from(cloneSelects[i].querySelectorAll<HTMLOptionElement>('option'));
    for (let j = 0; j < liveOpts.length; j++) {
      if (!cloneOpts[j]) continue;
      if (liveOpts[j].selected) cloneOpts[j].setAttribute('selected', '');
      else cloneOpts[j].removeAttribute('selected');
    }
  }

  const links = Array.from(clone.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]'))
    .filter(l => !l.getAttribute('href')!.startsWith('data:'));
  const styleEls = Array.from(clone.querySelectorAll<HTMLStyleElement>('style'));
  const imgs = Array.from(clone.querySelectorAll<HTMLImageElement>('img[src]'))
    .filter(img => !img.getAttribute('src')!.startsWith('data:'));

  // Fetch and process all resources in parallel
  const [linkCSS, styleCSS, imgDataUrls] = await Promise.all([
    Promise.all(links.map(async l => {
      const css = await _fetchText(l.getAttribute('href')!);
      return css != null ? _inlineCSSResources(css) : null;
    })),
    Promise.all(styleEls.map(el => el.textContent ? _inlineCSSResources(el.textContent) : Promise.resolve(null))),
    Promise.all(imgs.map(img => _fetchDataUrl(img.getAttribute('src')!))),
  ]);

  for (let i = 0; i < links.length; i++) {
    if (linkCSS[i] != null) {
      const style = doc.createElement('style');
      style.textContent = linkCSS[i]!;
      links[i].replaceWith(style);
    }
  }
  for (let i = 0; i < styleEls.length; i++) {
    if (styleCSS[i] != null) styleEls[i].textContent = styleCSS[i];
  }
  for (let i = 0; i < imgs.length; i++) {
    if (imgDataUrls[i]) imgs[i].setAttribute('src', imgDataUrls[i]!);
  }

  let html = '<!DOCTYPE html>' + clone.outerHTML;
  if (!/<base\b/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${pageUrl}">`);
  }
  return html;
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

export const page = {
  // ── Navigation ─────────────────────────────────────────────────────────────

  goto(url: string): Promise<void> {
    return _withCommand(`page.goto(${JSON.stringify(url)})`, 'goto', () => new Promise<void>((resolve, reject) => {
      const tab = _activeTab();
      if (!tab) { reject(new Error('no active tab')); return; }
      const navInput = document.getElementById('navUrl') as HTMLInputElement | null;
      if (navInput) navInput.value = url;
      const timer = setTimeout(() => reject(new Error(`goto("${url}") timed out`)), 30_000);
      if (tab.iframe) {
        tab.iframe.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
        tab.iframe.src = toProxiedUrl(url);
      } else if (tab.popup) {
        const popup = tab.popup;
        const cleanup = () => {
          clearTimeout(timer);
          clearInterval(poll);
        };
        const poll = setInterval(() => {
          try {
            if (popup.closed) { cleanup(); reject(new Error('Window closed')); return; }
            if (popup.document.readyState === 'complete') {
              try {
                const href = popup.location.href;
                tab.url = (_proxyPrefix && href.startsWith(_proxyPrefix)) ? href.slice(_proxyPrefix.length) : href;
              } catch { /* ignore cross-origin */ }
              cleanup();
              reapplyViewport();
              resolve();
            }
          } catch {
            // Cross-origin access failure typically means we are between pages
            // Just wait for the next poll
          }
        }, 200);
        popup.location.href = toProxiedUrl(url);
      }
    }));
  },

  reload(): Promise<void> {
    return _withCommand('page.reload()', 'reload', () => new Promise<void>((resolve, reject) => {
      const win = iframeWin();
      const tab = _activeTab();
      if (!win || !tab) { reject(new Error('no active tab')); return; }
      if (tab.iframe) {
        tab.iframe.addEventListener('load', () => resolve(), { once: true });
      } else if (tab.popup) {
        const popup = tab.popup;
        const poll = setInterval(() => {
          try {
            if (popup.closed) { clearInterval(poll); reject(new Error('Window closed')); return; }
            if (popup.document.readyState === 'complete') {
              clearInterval(poll);
              reapplyViewport();
              resolve();
            }
          } catch { /* ignore cross-origin */ }
        }, 100);
      }
      win.location.reload();
    }));
  },

  // ── Locator factories ───────────────────────────────────────────────────────

  locator(selector: string): Locator {
    return new Locator(() => {
      const doc = iframeDoc();
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
    }, `locator('${selector}')`);
  },

  ...makeLocatorQueries(iframeDoc),

  // ── Page state ─────────────────────────────────────────────────────────────

  async title(): Promise<string> {
    return _withCommand('page.title()', 'title', async () => iframeDoc()?.title ?? '');
  },
  url(): string {
    try {
      const href = iframeWin()?.location.href ?? '';
      return (_proxyPrefix && href.startsWith(_proxyPrefix)) ? href.slice(_proxyPrefix.length) : href;
    } catch { return ''; }
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

  async waitForSelector(selector: string, opts?: { state?: 'visible'|'attached'; timeout?: number }): Promise<Locator> {
    const loc = page.locator(selector);
    await loc.waitFor({ state: opts?.state ?? 'visible', timeout: opts?.timeout });
    return loc;
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

  // ── Keyboard ───────────────────────────────────────────────────────────────

  keyboard: new Keyboard(),

  // ── Mouse ──────────────────────────────────────────────────────────────────

  mouse: new Mouse(),

  // ── Viewport ───────────────────────────────────────────────────────────────

  setViewportSize(size: { width: number; height: number }): void {
    const entry = logCommand(`page.setViewportSize({ width: ${size.width}, height: ${size.height} })`, 'viewport');
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
    const win = iframeWin() as any;
    if (!win) throw new Error('no active page');
    const code = typeof pageFunction === 'function'
      ? arg !== undefined
        ? `(${pageFunction.toString()})(${JSON.stringify(arg)})`
        : `(${pageFunction.toString()})()`
      : String(pageFunction);
    return _withCommand(`page.evaluate(${code.slice(0, 50).replace(/\s+/g, ' ')})`, 'evaluate', () => Promise.resolve(win.eval(code)));
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
    const entry = logCommand(`page.addInitScript(${code.slice(0, 50).replace(/\s+/g, ' ')})`, 'initScript');
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

    closeExtraTabs();

    if (_tabs.length === 0) {
      createTab();
      return;
    }

    const tab = _activeTab();
    if (!tab) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('resetSession: blank page load timed out')), 10_000);
      if (tab.iframe) {
        tab.iframe.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
        tab.iframe.src = API_BASE + '/about-blank';
      } else if (tab.popup) {
        tab.popup.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
        tab.popup.location.href = API_BASE + '/about-blank';
      } else {
        clearTimeout(timer);
        resolve();
      }
    });
  },

  // ── Route interception ────────────────────────────────────────────────────────

  async route(
    pattern: string | RegExp | ((url: string) => boolean),
    handler: (route: Route, request: any) => void | Promise<void>
  ): Promise<void> {
    const desc = typeof pattern === 'string' ? JSON.stringify(pattern) : String(pattern);
    return _withCommand(`page.route(${desc})`, 'route', async () => {
      _routeHandlers.push({ pattern, handler });
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
      closeTab(_activeTabId ?? '');
    });
  },

  async screenshot(opts?: { path?: string }): Promise<string> {
    return _withCommand('page.screenshot()', 'screenshot', async () => {
      const dataUrl = await captureScreenshot();
      if (opts?.path) saveArtifact(opts.path, dataUrl);
      return dataUrl;
    });
  },

  async snapshot(opts?: { path?: string }): Promise<string> {
    return _withCommand('page.snapshot()', 'snapshot', async () => {
      const html = await captureFullSnapshot();
      if (opts?.path) saveArtifact(opts.path, html, 'html');
      return html;
    });
  },

  async ariaSnapshot(): Promise<string> {
    return _withCommand('page.ariaSnapshot()', 'ariaSnapshot', async () => {
      const doc = iframeDoc();
      if (!doc) throw new Error('no active tab');
      return _ariaSnapshot(doc.body ?? doc.documentElement);
    });
  },
};

// ── Playwright-style expect — see ./assertions ────────────────────────────────


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
        _installWindowBridges(win);
      }
    } catch { /* cross-origin — ignore */ }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ── State reset (test isolation) ─────────────────────────────────────────────

/** Reset all mutable browser state between test runs to prevent cross-test pollution. */
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

// ── iframe init ───────────────────────────────────────────────────────────────

export function initIframe() {
  _cleanupBridges();
  _clearRouteOrigFetch();
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
  /** Execute a named task in the Node.js context and return its result */
  async task<T = unknown>(name: string, payload?: unknown): Promise<T> {
    return _withCommand(`node.task(${JSON.stringify(name)})`, 'task', async () => {
      const resp = await wsRequest<{ result?: T; error?: string }>('task', { name, payload: payload ?? null } as Record<string, unknown>);
      if (resp.error) throw new Error(resp.error ?? `task "${name}" failed`);
      return resp.result as T;
    });
  },
};

export function createWindow(url?: string) {
  const tabId = 'tab-' + (++_tabCounter);
  const targetUrl = url ? toProxiedUrl(url) : API_BASE + '/about-blank';
  const winW = viewportW ?? 1280;
  const winH = viewportH ?? 720;
  const winFeatures = `width=${winW},height=${winH}`;

  let popupWin: Window | null = null;
  try {
    // @ts-ignore
    popupWin = window.open.call(window, targetUrl, tabId, winFeatures);
  } catch (_) {}

  if (!popupWin) {
    popupWin = window.open(targetUrl, tabId, winFeatures);
  }

  if (!popupWin) throw new Error('Popup blocked or failed to open');
  const tab: TabEntry = { id: tabId, popup: popupWin, title: 'New Window', url: url ?? '' };

  let initialized = false;
  const onInit = () => {
    if (initialized || popupWin!.closed) return;
    try {
      // Check if we can access the document (same-origin check)
      if (popupWin!.document.readyState !== 'complete' && popupWin!.document.readyState !== 'interactive') return;
      initialized = true;

      try { tab.title = popupWin!.document.title || 'New Window'; } catch {}
      try {
        const href = popupWin!.location.href ?? '';
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
    } catch (_) {
      // Cross-origin access failure typically means we are between pages
    }
  };

  popupWin.addEventListener('load', onInit);
  // Polling fallback
  const timer = setInterval(() => {
    if (initialized || popupWin!.closed) {
      clearInterval(timer);
      return;
    }
    onInit();
  }, 200);

  _tabs.push(tab);
  setActiveTab(tabId);
  _onTabsChanged?.();
  return page;
}

// ── Browser object ────────────────────────────────────────────────────────────

export const browser = {
  /** Open a new tab, make it active, and return the global page object */
  async newPage(): Promise<void> {
    return _withCommand('browser.newPage()', 'newPage', async () => {
      createTab();
    });
  },

  /** Open a new window, make it active, and return the global page object */
  async newWindow(url?: string): Promise<void> {
    return _withCommand(`browser.newWindow(${url ? JSON.stringify(url) : ''})`, 'newWindow', async () => {
      createWindow(url);
    });
  },

  /** Return a snapshot of all open tabs. */
  tabs(): ReturnType<typeof getTabsSnapshot> {
    return getTabsSnapshot();
  },

  /** Switch the active tab by matching against tab snapshot fields (id, title, url, active) */
  switchTab(predicate: (tab: ReturnType<typeof getTabsSnapshot>[number]) => boolean): void {
    const tab = getTabsSnapshot().find(predicate);
    if (!tab) return;
    const entry = logCommand(`browser.switchTab()`, 'switchTab');
    setActiveTab(tab.id);
    entry.success();
  },

  async storageState(opts?: { path?: string }): Promise<StorageState> {
    return _withCommand('page.storageState()', 'storageState', async () => {
      const { jar } = await wsRequest<{ jar: object }>('get-cookie-jar');

      const win = iframeWin() as any;
      const rawOrigin = (() => { try { return win?.location?.origin ?? ''; } catch { return ''; } })();
      const origin = rawOrigin === 'null' ? '' : rawOrigin;

      const localStorageItems: Array<{ name: string; value: string }> = [];
      if (win?.localStorage) {
        try {
          for (let i = 0; i < win.localStorage.length; i++) {
            const key = win.localStorage.key(i);
            if (key !== null) localStorageItems.push({ name: key, value: win.localStorage.getItem(key) ?? '' });
          }
        } catch { /* cross-origin */ }
      }

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

      const win = iframeWin() as any;
      if (win?.localStorage && resolved.origins?.length) {
        const rawOrigin = (() => { try { return win.location.origin ?? ''; } catch { return ''; } })();
        for (const entry of resolved.origins) {
          if (entry.origin && rawOrigin && entry.origin !== rawOrigin) continue;
          try {
            for (const { name, value } of entry.localStorage ?? []) {
              win.localStorage.setItem(name, value);
            }
          } catch { /* cross-origin */ }
        }
      }
    });
  },
};
