// Browser B agent — receives DOM commands via WebSocket, executes in test iframe

import { domToPng } from 'modern-screenshot';
import type { AgentLocatorSpec, TbCommandMethod } from '../ws-protocol';

// ── Config ────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    __AGENT_CONFIG__: { port: number; proxyPrefix: string; testIdAttribute?: string };
  }
}

const _cfg = window.__AGENT_CONFIG__;
const _proxyPrefix = _cfg.proxyPrefix;
const _testIdAttribute = _cfg.testIdAttribute ?? 'data-testid';

// ── WebSocket ─────────────────────────────────────────────────────────────────

let _ws: WebSocket | null = null;

function _wsSend(msg: object): void {
  if (_ws?.readyState === WebSocket.OPEN) _ws.send(JSON.stringify(msg));
}

function _emitEvent(event: string, payload: unknown): void {
  _wsSend({ type: 'tb-event', event, payload });
}

function _sendResult(id: string, result?: unknown, error?: string): void {
  const msg: Record<string, unknown> = { type: 'tb-result', id };
  if (result !== undefined) msg.result = result;
  if (error !== undefined) msg.error = error;
  _wsSend(msg);
}

// ── Tab state ─────────────────────────────────────────────────────────────────

interface TabEntry { id: string; iframe: HTMLIFrameElement; title: string; url: string; }
let _tabs: TabEntry[] = [];
let _activeTabId: string | null = null;
let _tabCounter = 0;

function _activeTab(): TabEntry | null { return _tabs.find(t => t.id === _activeTabId) ?? null; }
function iframeDoc(): Document | null {
  try { return _activeTab()?.iframe.contentDocument ?? null; } catch { return null; }
}
function iframeWin(): (Window & typeof globalThis) | null {
  try { return (_activeTab()?.iframe.contentWindow as any) ?? null; } catch { return null; }
}

// ── Init scripts ──────────────────────────────────────────────────────────────

const _initScripts: string[] = [];

function _runInitScripts(): void {
  const win = iframeWin() as any;
  if (!win) return;
  for (const code of _initScripts) {
    try { win.eval(code); } catch (e: any) { console.error('[agent:initScript]', e.message); }
  }
}

// ── URL helpers ───────────────────────────────────────────────────────────────

function fromProxiedUrl(url: string): string {
  if (!url) return '';
  if (_proxyPrefix && url.startsWith(_proxyPrefix)) return url.slice(_proxyPrefix.length);
  return url;
}

function toProxiedUrl(url: string): string {
  if (!_proxyPrefix) return url;
  if (url.startsWith(_proxyPrefix)) return url;
  if (!/^https?:\/\//.test(url)) {
    const baseUrl = _activeTab()?.url;
    if (baseUrl && /^https?:\/\//.test(baseUrl)) {
      try { url = new URL(url, baseUrl).href; } catch { return url; }
    } else { return url; }
  }
  return _proxyPrefix + url;
}

// ── Route interception ────────────────────────────────────────────────────────

interface RouteDecision {
  action: 'fulfill' | 'abort' | 'continue';
  response?: { status: number; statusText: string; headers: Record<string, string>; body: string };
  continueOpts?: { url?: string; method?: string; headers?: Record<string, string>; postData?: string };
  errorCode?: string;
}

let _interceptAll = false;
let _routeDecisionCounter = 0;
const _pendingRouteDecisions = new Map<string, (d: RouteDecision) => void>();

async function _interceptFetch(
  requestId: string,
  url: string, method: string, headers: Record<string, string>, body: string | null,
  origFetch: () => Promise<Response>,
): Promise<Response> {
  // Register listener before emitting so we never miss the decision
  const decision = await new Promise<RouteDecision>(resolve => {
    _pendingRouteDecisions.set(requestId, resolve);
    setTimeout(() => { if (_pendingRouteDecisions.delete(requestId)) resolve({ action: 'continue' }); }, 30_000);
    // Emit after listener is registered (synchronous Promise constructor)
    _emitEvent('request-intercepted', { requestId, url, method, headers, body });
  });

  if (decision.action === 'abort') {
    const err = new TypeError(decision.errorCode ?? 'Failed to fetch');
    _emitEvent('requestfailed', { url, method, errorText: String(err) });
    throw err;
  }
  if (decision.action === 'fulfill' && decision.response) {
    const { status, statusText, headers: h, body: b } = decision.response;
    _emitEvent('response', { url, status, ok: status >= 200 && status < 300 });
    _emitEvent('requestfinished', { url });
    return new Response(b, { status, statusText, headers: h });
  }
  // continue
  try {
    const o = decision.continueOpts;
    const resp = o
      ? await fetch(o.url ?? url, { method: o.method ?? method, ...(o.headers ? { headers: o.headers } : {}), ...(o.postData !== undefined ? { body: o.postData } : {}) })
      : await origFetch();
    _emitEvent('response', { url, status: resp.status, ok: resp.ok });
    _emitEvent('requestfinished', { url });
    return resp;
  } catch (err) {
    _emitEvent('requestfailed', { url, errorText: String(err) });
    throw err;
  }
}

// ── Dialog interception ───────────────────────────────────────────────────────

interface DialogDecision { action: 'accept' | 'dismiss'; promptText?: string; }
const _pendingDialogDecisions: DialogDecision[] = [];

// ── Bridge installers ─────────────────────────────────────────────────────────

function _normalizeHeaders(h: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  try {
    if (typeof h.forEach === 'function') h.forEach((v: string, k: string) => { out[k.toLowerCase()] = v; });
    else if (Array.isArray(h)) { for (const [k, v] of h as [string, string][]) out[(k as string).toLowerCase()] = String(v); }
    else if (typeof h === 'object') { for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v); }
  } catch { /* ignore */ }
  return out;
}

function _bridgeConsole(win: any): void {
  const methods = ['log', 'debug', 'info', 'warn', 'error', 'trace'] as const;
  for (const m of methods) {
    const orig = (win.console[m] as (...a: any[]) => void).bind(win.console);
    win.console[m] = (...args: any[]) => {
      orig(...args);
      const text = args.map((a: any) => {
        try { return typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a); } catch { return String(a); }
      }).join(' ');
      _emitEvent('console', { type: m === 'warn' ? 'warning' : m, text });
    };
  }
}

function _bridgeErrors(win: any): void {
  win.addEventListener('error', (e: ErrorEvent) => {
    _emitEvent('pageerror', { message: e.message || String(e), stack: e.error?.stack });
  });
  win.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason ?? 'Unhandled promise rejection');
    _emitEvent('pageerror', { message: msg, stack: e.reason instanceof Error ? e.reason.stack : undefined });
  });
}

function _bridgeDialogs(win: any): void {
  // NOTE: browser dialog stubs are synchronous. The panel's dialog handler fires
  // AFTER the stub returns, so page.on('dialog') cannot affect the return value.
  // To pre-queue a decision before the dialog fires, use page.handleDialog().
  win.alert = (message = '') => {
    _emitEvent('dialog', { type: 'alert', message: String(message), defaultValue: '' });
    // alert has no meaningful return value; consume any queued decision
    _pendingDialogDecisions.shift();
  };
  win.confirm = (message = '') => {
    _emitEvent('dialog', { type: 'confirm', message: String(message), defaultValue: '' });
    const d = _pendingDialogDecisions.shift() ?? { action: 'dismiss' as const };
    return d.action === 'accept';
  };
  win.prompt = (message = '', def = '') => {
    _emitEvent('dialog', { type: 'prompt', message: String(message), defaultValue: String(def) });
    const d = _pendingDialogDecisions.shift() ?? { action: 'dismiss' as const };
    return d.action === 'accept' ? (d.promptText ?? String(def)) : null;
  };
}

function _bridgeFetch(win: any): void {
  if (typeof win.fetch !== 'function') return;
  const origFetch = (win.fetch as typeof fetch).bind(win);
  win.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === 'string' ? input
      : typeof (input as any).href === 'string' ? (input as any).href
        : typeof (input as any).url === 'string' ? (input as any).url : '';
    if (url && !/^https?:\/\//.test(url)) {
      try {
        const base = fromProxiedUrl(win.location?.href ?? '');
        if (base) url = new URL(url, base).href;
      } catch { /* keep */ }
    }
    const isReqObj = input != null && typeof input === 'object' && typeof (input as any).href !== 'string';
    const method = ((init?.method) ?? (isReqObj ? (input as any).method : undefined) ?? 'GET').toUpperCase();
    const reqHeaders = _normalizeHeaders(init?.headers ?? (isReqObj ? (input as any).headers : undefined));
    const body = init?.body != null ? String(init.body) : null;
    _emitEvent('request', { url, method, headers: reqHeaders });
    if (_interceptAll) {
      const requestId = 'req-' + (++_routeDecisionCounter);
      return _interceptFetch(requestId, url, method, reqHeaders, body, () => origFetch(input, init));
    }
    try {
      const resp = await origFetch(input, init);
      _emitEvent('response', { url, status: resp.status, ok: resp.ok });
      _emitEvent('requestfinished', { url });
      return resp;
    } catch (err) {
      _emitEvent('requestfailed', { url, errorText: String(err) });
      throw err;
    }
  };
}

function _bridgeWebSocket(win: any): void {
  if (!win.WebSocket) return;
  const OrigWS: typeof WebSocket = win.WebSocket;
  win.WebSocket = class extends OrigWS {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url as string, protocols);
      _emitEvent('websocket', { url: String(url) });
    }
  };
  win.WebSocket.CONNECTING = OrigWS.CONNECTING;
  win.WebSocket.OPEN = OrigWS.OPEN;
  win.WebSocket.CLOSING = OrigWS.CLOSING;
  win.WebSocket.CLOSED = OrigWS.CLOSED;
}

function _bridgeWorker(win: any): void {
  if (!win.Worker) return;
  const OrigWorker: typeof Worker = win.Worker;
  win.Worker = class extends OrigWorker {
    constructor(scriptURL: string | URL, options?: WorkerOptions) {
      super(scriptURL, options);
      _emitEvent('worker', { url: String(scriptURL) });
    }
  };
}

function _bridgePopup(win: any): void {
  win.open = (url?: string) => {
    const tab = _createTab(url);
    _setActiveTab(tab.id);
    _emitEvent('popup', { url: url ?? '', tabId: tab.id });
    _emitEvent('tab-created', { tabId: tab.id, url: tab.url });
    return tab.iframe.contentWindow;
  };
}

let _frameObserver: MutationObserver | null = null;

function _bridgeDocumentEvents(doc: Document): void {
  doc.addEventListener('click', (e: MouseEvent) => {
    const a = (e.target as Element)?.closest?.('a') as HTMLAnchorElement | null;
    if (!a || a.target !== '_blank' || a.hasAttribute('download')) return;
    e.preventDefault();
    if (a.href) {
      const tab = _createTab(fromProxiedUrl(a.href));
      _setActiveTab(tab.id);
      _emitEvent('popup', { url: fromProxiedUrl(a.href), tabId: tab.id });
      _emitEvent('tab-created', { tabId: tab.id, url: tab.url });
    }
  }, true);

  doc.addEventListener('click', (e: MouseEvent) => {
    const a = (e.target as Element)?.closest?.('a') as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.href || '';
    if (a.hasAttribute('download') || /\.(pdf|zip|tar\.gz|gz|docx?|xlsx?|pptx?|csv|txt|png|jpe?g|gif|mp[34]|exe|dmg|pkg|deb|rpm)(\?|#|$)/i.test(href)) {
      _emitEvent('download', { url: fromProxiedUrl(href), suggestedFilename: a.download || href.split('/').pop()?.split('?')[0] || 'download' });
    }
  }, true);

  _frameObserver?.disconnect();
  _frameObserver = new MutationObserver((mutations: MutationRecord[]) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        const el = node as HTMLElement;
        if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
          _emitEvent('frameattached', { url: fromProxiedUrl((el as HTMLIFrameElement).src), name: (el as any).name ?? '', isMainFrame: false });
          el.addEventListener('load', () => {
            try {
              const url = (el as HTMLIFrameElement).contentWindow?.location.href ?? (el as HTMLIFrameElement).src;
              _emitEvent('framenavigated', { url: fromProxiedUrl(url), name: (el as any).name ?? '', isMainFrame: false });
            } catch { /* cross-origin */ }
          });
        }
      }
      for (const node of Array.from(m.removedNodes)) {
        const el = node as HTMLElement;
        if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
          _emitEvent('framedetached', { url: fromProxiedUrl((el as HTMLIFrameElement).src), name: (el as any).name ?? '', isMainFrame: false });
        }
      }
    }
  });
  const root = doc.documentElement ?? doc.body;
  if (root) _frameObserver.observe(root, { subtree: true, childList: true });
}

function _installWindowBridges(win: any): void {
  if (win.__agentBridges) return;
  win.__agentBridges = true;
  _bridgeConsole(win);
  _bridgeErrors(win);
  _bridgeDialogs(win);
  _bridgePopup(win);
  _bridgeFetch(win);
  _bridgeWebSocket(win);
  _bridgeWorker(win);
}

function _installDocumentBridges(doc: Document): void {
  if ((doc as any).__agentDocBridges) return;
  (doc as any).__agentDocBridges = true;
  _bridgeDocumentEvents(doc);
}

// ── Tab lifecycle ─────────────────────────────────────────────────────────────

const _tabContainer = document.getElementById('tab-container')!;

function _onTabLoad(tab: TabEntry): void {
  const win = tab.iframe.contentWindow as any;
  const doc = tab.iframe.contentDocument;
  if (!win || !doc) return;
  try { tab.title = doc.title || ''; } catch {}
  try {
    const href = win.location?.href ?? '';
    tab.url = fromProxiedUrl(href);
  } catch {}
  _runInitScripts();
  _installWindowBridges(win);
  _installDocumentBridges(doc);
  _emitEvent('domcontentloaded', { url: tab.url, title: tab.title });
  _emitEvent('load', { url: tab.url, title: tab.title });
  _emitEvent('framenavigated', { url: tab.url, title: tab.title, name: '', isMainFrame: true });
}

function _createTab(url?: string): TabEntry {
  const tabId = 'tab-' + (++_tabCounter);
  const iframeEl = document.createElement('iframe');
  iframeEl.id = 'agent-tab-' + tabId;
  iframeEl.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation');
  iframeEl.style.cssText = 'width:100%;height:100%;border:none;display:none;position:absolute;top:0;left:0;';
  const tab: TabEntry = { id: tabId, iframe: iframeEl, title: '', url: url ?? '' };
  iframeEl.addEventListener('load', () => _onTabLoad(tab));
  _tabContainer.appendChild(iframeEl);
  _tabs.push(tab);
  iframeEl.src = url ? toProxiedUrl(url) : 'about:blank';
  return tab;
}

function _setActiveTab(tabId: string): void {
  for (const t of _tabs) t.iframe.style.display = 'none';
  const tab = _tabs.find(t => t.id === tabId);
  if (!tab) return;
  tab.iframe.style.display = 'block';
  _activeTabId = tabId;
}

function _closeTab(tabId: string): void {
  const tab = _tabs.find(t => t.id === tabId);
  if (!tab) return;
  tab.iframe.remove();
  _tabs = _tabs.filter(t => t.id !== tabId);
  if (_activeTabId === tabId) {
    _activeTabId = _tabs.length > 0 ? _tabs[_tabs.length - 1].id : null;
    if (_activeTabId) _setActiveTab(_activeTabId);
  }
}

// ── Early bridge watcher ──────────────────────────────────────────────────────

let _earlyWatcherStarted = false;

function _startEarlyBridgeWatcher(): void {
  if (_earlyWatcherStarted) return;
  _earlyWatcherStarted = true;
  let lastWin: object | null = null;
  let _lastPolledUrl = '';
  const tick = () => {
    try {
      const win = iframeWin() as any;
      if (win && win !== lastWin) { lastWin = win; _installWindowBridges(win); }
      // Detect URL changes for SPA navigation and cases where iframe 'load' doesn't fire
      if (win) {
        try {
          const href = fromProxiedUrl(win.location?.href ?? '');
          if (href && href !== 'about:blank' && href !== _lastPolledUrl) {
            _lastPolledUrl = href;
            const tab = _activeTab();
            if (tab && tab.url !== href) {
              tab.url = href;
              _emitEvent('framenavigated', { url: href, title: win.document?.title ?? tab.title, name: '', isMainFrame: true });
            }
          }
        } catch { /* cross-origin or restricted, ignore */ }
      }
    } catch { /* ignore */ }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ── Locator spec evaluation ───────────────────────────────────────────────────

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

function _getAccessibleName(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labeler = el.ownerDocument?.getElementById(labelledBy);
    if (labeler) return (labeler.textContent ?? '').trim();
  }
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder.trim();
  const title = el.getAttribute('title');
  if (title) return title.trim();
  const id = el.getAttribute('id');
  if (id) {
    try {
      const label = el.ownerDocument?.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) return (label.textContent ?? '').trim();
    } catch { /* ignore */ }
  }
  return (el.textContent ?? '').trim();
}

function _nameMatches(el: Element, name?: string, nameRe?: string, nameReFlags?: string, nameExact?: boolean): boolean {
  if (name === undefined && nameRe === undefined) return true;
  const accName = _getAccessibleName(el);
  if (nameRe !== undefined) {
    try { return new RegExp(nameRe, nameReFlags ?? '').test(accName); } catch { return false; }
  }
  if (name !== undefined) return nameExact ? accName === name : accName.toLowerCase().includes(name.toLowerCase());
  return true;
}

function _evalSpecIn(spec: AgentLocatorSpec, root: Document | Element): Element[] {
  const doc = root.nodeType === Node.DOCUMENT_NODE ? root as Document : (root as Element).ownerDocument!;
  switch (spec.kind) {
    case 'css': {
      const parts = spec.selector.split(',').map(s => s.trim());
      const seen = new Set<Element>(); const out: Element[] = [];
      for (const s of parts) {
        try { for (const el of Array.from(root.querySelectorAll(s))) { if (!seen.has(el)) { seen.add(el); out.push(el); } } }
        catch { /* invalid */ }
      }
      return out;
    }
    case 'xpath': {
      const result = doc.evaluate(spec.xpath, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const out: Element[] = [];
      for (let i = 0; i < result.snapshotLength; i++) { const n = result.snapshotItem(i); if (n?.nodeType === 1) out.push(n as Element); }
      return out;
    }
    case 'text': {
      const t = spec.text; const exact = spec.exact;
      return Array.from(root.querySelectorAll('*')).filter(el => {
        const content = (el.textContent ?? '').trim();
        return exact ? content === t : content.includes(t);
      });
    }
    case 'textRe': {
      let re: RegExp;
      try { re = new RegExp(spec.source, spec.flags); } catch { return []; }
      return Array.from(root.querySelectorAll('*')).filter(el => re.test((el.textContent ?? '').trim()));
    }
    case 'role': {
      const sel = ROLE_SELECTORS[spec.role] ?? `[role="${spec.role}"]`;
      return Array.from(root.querySelectorAll(sel)).filter(el => _nameMatches(el, spec.name, spec.nameRe, spec.nameReFlags, spec.nameExact));
    }
    case 'label': {
      const labels = Array.from(root.querySelectorAll('label')).filter(l => {
        const t = (l.textContent ?? '').trim();
        if (spec.textRe) { try { return new RegExp(spec.textRe, spec.textReFlags ?? '').test(t); } catch { return false; } }
        return spec.text !== undefined ? t.includes(spec.text) : true;
      });
      const seen = new Set<Element>(); const out: Element[] = [];
      for (const label of labels) {
        const forId = label.getAttribute('for');
        const target = forId ? doc.getElementById(forId) : label.querySelector('input,select,textarea');
        if (target && !seen.has(target)) { seen.add(target); out.push(target); }
      }
      return out;
    }
    case 'placeholder': {
      return Array.from(root.querySelectorAll('[placeholder]')).filter(el => {
        const ph = el.getAttribute('placeholder') ?? '';
        if (spec.textRe) { try { return new RegExp(spec.textRe, spec.textReFlags ?? '').test(ph); } catch { return false; } }
        return spec.text !== undefined ? ph.includes(spec.text) : true;
      });
    }
    case 'testid': {
      try { return Array.from(root.querySelectorAll(`[${_testIdAttribute}="${CSS.escape(spec.id)}"]`)); }
      catch { return Array.from(root.querySelectorAll(`[${_testIdAttribute}="${spec.id}"]`)); }
    }
    case 'alt': {
      return Array.from(root.querySelectorAll('[alt]')).filter(el => {
        const alt = el.getAttribute('alt') ?? '';
        if (spec.textRe) { try { return new RegExp(spec.textRe, spec.textReFlags ?? '').test(alt); } catch { return false; } }
        return spec.text !== undefined ? alt.includes(spec.text) : true;
      });
    }
    case 'title': {
      return Array.from(root.querySelectorAll('[title]')).filter(el => {
        const title = el.getAttribute('title') ?? '';
        if (spec.textRe) { try { return new RegExp(spec.textRe, spec.textReFlags ?? '').test(title); } catch { return false; } }
        return spec.text !== undefined ? title.includes(spec.text) : true;
      });
    }
    case 'nth': { const p = _evalSpecIn(spec.parent, root); const el = p[spec.n]; return el ? [el] : []; }
    case 'first': { const p = _evalSpecIn(spec.parent, root); return p.length ? [p[0]] : []; }
    case 'last':  { const p = _evalSpecIn(spec.parent, root); return p.length ? [p[p.length - 1]] : []; }
    case 'chain': {
      const seen = new Set<Element>(); const out: Element[] = [];
      for (const p of _evalSpecIn(spec.parent, root)) {
        for (const c of _evalSpecIn(spec.child, p)) { if (!seen.has(c)) { seen.add(c); out.push(c); } }
      }
      return out;
    }
    case 'filter': {
      return _evalSpecIn(spec.parent, root).filter(el => {
        const t = (el.textContent ?? '').trim();
        if (spec.hasText !== undefined && !t.includes(spec.hasText)) return false;
        if (spec.hasTextRe !== undefined) { try { if (!new RegExp(spec.hasTextRe, spec.hasTextReFlags ?? '').test(t)) return false; } catch { return false; } }
        if (spec.hasNotText !== undefined && t.includes(spec.hasNotText)) return false;
        if (spec.hasNotTextRe !== undefined) { try { if (new RegExp(spec.hasNotTextRe, spec.hasNotTextReFlags ?? '').test(t)) return false; } catch { /* ignore */ } }
        if (spec.visible !== undefined && _isVisible(el as HTMLElement) !== spec.visible) return false;
        return true;
      });
    }
  }
}

function evalSpec(spec: AgentLocatorSpec): Element[] {
  const doc = iframeDoc();
  if (!doc) return [];
  return _evalSpecIn(spec, doc);
}

// ── Element state helpers ─────────────────────────────────────────────────────

function _isVisible(el: HTMLElement): boolean {
  if (typeof (el as any).checkVisibility === 'function') {
    return (el as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  const win = iframeWin();
  if (!win) return false;
  const s = win.getComputedStyle(el);
  if (s.visibility === 'hidden' || s.opacity === '0') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function _isEnabled(el: HTMLElement): boolean { return !('disabled' in el && (el as any).disabled); }
function _isEditable(el: HTMLElement): boolean { return _isEnabled(el) && !('readOnly' in el && (el as any).readOnly); }

// ── Wait helpers ──────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 30_000;
const ACTION_TIMEOUT  = 10_000;

function _sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function _waitForSpec(spec: AgentLocatorSpec, timeout: number, state = 'visible'): Promise<Element[]> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const doc = iframeDoc();
    if (doc) {
      const els = _evalSpecIn(spec, doc);
      if (state === 'attached'  && els.length > 0) return els;
      if (state === 'detached'  && els.length === 0) return [];
      if (state === 'visible'   && els.some(el => _isVisible(el as HTMLElement))) return els;
      if (state === 'hidden'    && els.every(el => !_isVisible(el as HTMLElement))) return els;
    }
    await _sleep(50);
  }
  throw new Error(`waitForSelector timed out after ${timeout}ms`);
}

async function _waitForActionable(spec: AgentLocatorSpec, timeout: number, action?: string): Promise<HTMLElement> {
  const t0 = Date.now();
  const needsStable   = ['click','dblclick','rightClick','check','uncheck','hover'].includes(action ?? '');
  const needsEditable = ['fill','clear','selectOption','type'].includes(action ?? '');
  let lastReason = 'element not found'; let stableRect: DOMRect | null = null;
  let docNullCount = 0;
  while (Date.now() - t0 < timeout) {
    const doc = iframeDoc();
    if (!doc) { docNullCount++; await _sleep(50); continue; }
    const el = _evalSpecIn(spec, doc)[0] as HTMLElement | null;
    if (!el)                               { lastReason = 'element not found';      stableRect = null; await _sleep(50); continue; }
    if (!_isVisible(el))                   { lastReason = 'element not visible';    stableRect = null; await _sleep(50); continue; }
    if (!_isEnabled(el))                   { lastReason = 'element is disabled';    stableRect = null; await _sleep(50); continue; }
    if (needsEditable && !_isEditable(el)) { lastReason = 'element is not editable'; stableRect = null; await _sleep(50); continue; }
    if (needsStable) {
      const rect = el.getBoundingClientRect();
      if (!stableRect) { stableRect = rect; lastReason = 'element is not stable'; await _sleep(50); continue; }
      if (rect.top !== stableRect.top || rect.left !== stableRect.left || rect.width !== stableRect.width || rect.height !== stableRect.height) {
        stableRect = rect; lastReason = 'element is not stable'; await _sleep(50); continue;
      }
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return el;
  }
  const doc = iframeDoc();
  if (docNullCount > 0 && !doc) {
    throw new Error(`waitForActionable timed out after ${timeout}ms — no iframe document (contentDocument was inaccessible throughout)`);
  }
  if (docNullCount > 0 && doc) {
    throw new Error(`waitForActionable timed out after ${timeout}ms — ${lastReason} (iframe document was null for ${docNullCount * 50}ms of the wait)`);
  }
  // Doc was accessible but element never appeared — include page URL and body length for diagnosis
  const url = _activeTab()?.url ?? '?';
  const bodyLen = doc?.body?.innerHTML?.length ?? 0;
  throw new Error(`waitForActionable timed out after ${timeout}ms — ${lastReason} (page: ${url}, body length: ${bodyLen})`);
}

// ── Snapshot helpers ──────────────────────────────────────────────────────────

async function _captureScreenshot(): Promise<string> {
  const doc = iframeDoc();
  if (!doc) throw new Error('no active tab');
  const tab = _activeTab()!;
  return domToPng(doc.documentElement, { width: tab.iframe.offsetWidth || 1280, height: tab.iframe.offsetHeight || 720 });
}

async function _captureFullSnapshot(): Promise<string> {
  const doc = iframeDoc();
  if (!doc) throw new Error('no active tab');
  const pageUrl = _activeTab()?.url ?? '';
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  for (const el of Array.from(clone.querySelectorAll('script'))) el.remove();
  let html = '<!DOCTYPE html>' + clone.outerHTML;
  if (!/<base\b/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${pageUrl}">`);
  return html;
}

function _ariaSnapshotBasic(el: Element): string {
  const lines: string[] = [];
  const walk = (node: Element, indent: string) => {
    const role = node.getAttribute('role') || node.tagName.toLowerCase();
    const name = _getAccessibleName(node);
    lines.push(`${indent}- ${role}${name ? ': ' + name : ''}`);
    for (const child of Array.from(node.children)) walk(child, indent + '  ');
  };
  walk(el, '');
  return lines.join('\n');
}

// ── Command dispatch ──────────────────────────────────────────────────────────

type Handler = (p: any) => Promise<unknown>;
const _cmds = new Map<TbCommandMethod, Handler>();
const reg = (m: TbCommandMethod, h: Handler) => _cmds.set(m, h);

// ── Navigation ────────────────────────────────────────────────────────────────

reg('navigate', async ({ url, timeout = DEFAULT_TIMEOUT }) => {
  const tab = _activeTab(); if (!tab) throw new Error('no active tab');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`navigate timed out`)), timeout);
    tab.iframe.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
    tab.iframe.src = toProxiedUrl(url);
  });
});

reg('setViewportSize', async ({ width, height }: { width: number; height: number }) => {
  const tab = _activeTab();
  if (tab) {
    tab.iframe.style.width  = `${width}px`;
    tab.iframe.style.height = `${height}px`;
  }
  // Resize the agent window itself so media queries fire correctly
  try { window.resizeTo(width, height); } catch {}
});

reg('reload', async () => {
  const win = iframeWin(); const tab = _activeTab();
  if (!win || !tab) throw new Error('no active tab');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('reload timed out')), DEFAULT_TIMEOUT);
    tab.iframe.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
    win.location.reload();
  });
});

reg('waitForNavigation', async ({ timeout = DEFAULT_TIMEOUT }: { timeout?: number } = {}) => {
  const tab = _activeTab(); if (!tab) throw new Error('no active tab');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('waitForNavigation timed out')), timeout);
    tab.iframe.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
  return { url: _activeTab()?.url ?? '' };
});

reg('evaluate', async ({ code }) => {
  const win = iframeWin() as any; if (!win) throw new Error('no active tab');
  return await Promise.resolve(win.eval(code));
});

reg('title',    async () => iframeDoc()?.title ?? '');
reg('url',      async () => _activeTab()?.url ?? '');
reg('screenshot', async () => _captureScreenshot());
reg('snapshot',   async () => _captureFullSnapshot());
reg('getHTML',    async () => _captureFullSnapshot());

reg('ariaSnapshot', async ({ spec }: { spec?: AgentLocatorSpec }) => {
  const doc = iframeDoc(); if (!doc) throw new Error('no active tab');
  if (spec) {
    const el = _evalSpecIn(spec, doc)[0];
    if (!el) throw new Error('element not found');
    return _ariaSnapshotBasic(el);
  }
  return _ariaSnapshotBasic(doc.body ?? doc.documentElement);
});

// ── Selector queries ──────────────────────────────────────────────────────────

reg('querySelector',    async ({ spec }: { spec: AgentLocatorSpec }) => evalSpec(spec).length > 0);
reg('querySelectorAll', async ({ spec }: { spec: AgentLocatorSpec }) => evalSpec(spec).length);
reg('count',            async ({ spec }: { spec: AgentLocatorSpec }) => evalSpec(spec).length);

reg('waitForSelector', async ({ spec, state = 'visible', timeout = ACTION_TIMEOUT }) => {
  await _waitForSpec(spec, timeout, state);
});

reg('waitForFunction', async ({ code, timeout = ACTION_TIMEOUT }) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const win = iframeWin() as any;
    if (win) { try { const r = await Promise.resolve(win.eval(`(${code})()`)); if (r) return r; } catch { /* keep */ } }
    await _sleep(50);
  }
  throw new Error(`waitForFunction timed out after ${timeout}ms`);
});

reg('waitForActionable', async ({ spec, action, timeout = ACTION_TIMEOUT }) => {
  await _waitForActionable(spec, timeout, action);
});

// ── Click actions ─────────────────────────────────────────────────────────────

reg('click', async ({ spec, timeout = ACTION_TIMEOUT }) => {
  const el = await _waitForActionable(spec, timeout, 'click');
  const doc = iframeDoc(); const win = iframeWin() as any;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2; const cy = rect.top + rect.height / 2;
  const target = (doc?.elementFromPoint(cx, cy) as HTMLElement | null) ?? el;
  const ME = (win?.MouseEvent ?? MouseEvent) as typeof MouseEvent;
  const init: MouseEventInit = { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy };
  target.dispatchEvent(new ME('mouseover', init));
  target.dispatchEvent(new ME('mouseenter', { ...init, bubbles: false }));
  target.dispatchEvent(new ME('mousedown', init));
  target.dispatchEvent(new ME('mouseup', init));
  if (typeof (target as any).click === 'function') target.click();
  else target.dispatchEvent(new ME('click', init));
});

reg('dblclick', async ({ spec, timeout = ACTION_TIMEOUT }) => {
  const el = await _waitForActionable(spec, timeout, 'dblclick');
  el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
});

reg('rightClick', async ({ spec, timeout = ACTION_TIMEOUT }) => {
  const el = await _waitForActionable(spec, timeout, 'rightClick');
  const init: MouseEventInit = { bubbles: true, cancelable: true, button: 2, buttons: 2 };
  el.dispatchEvent(new MouseEvent('mousedown', init));
  el.dispatchEvent(new MouseEvent('mouseup', init));
  el.dispatchEvent(new MouseEvent('contextmenu', init));
});

reg('hover', async ({ spec, timeout = ACTION_TIMEOUT }) => {
  const el = await _waitForActionable(spec, timeout, 'hover');
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
});

reg('focus', async ({ spec, timeout = ACTION_TIMEOUT }) => {
  await _waitForSpec(spec, timeout, 'attached');
  (evalSpec(spec)[0] as HTMLElement | null)?.focus();
});

reg('blur', async ({ spec, timeout = ACTION_TIMEOUT }) => {
  await _waitForSpec(spec, timeout, 'attached');
  (evalSpec(spec)[0] as HTMLElement | null)?.blur();
});

reg('scrollIntoView', async ({ spec, timeout = ACTION_TIMEOUT }) => {
  await _waitForSpec(spec, timeout, 'attached');
  (evalSpec(spec)[0] as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
});

// ── Text input ────────────────────────────────────────────────────────────────

reg('fill', async ({ spec, value, delay = 30, timeout = ACTION_TIMEOUT }) => {
  const el = await _waitForActionable(spec, timeout, 'fill') as HTMLInputElement | HTMLTextAreaElement;
  const win = iframeWin() as any;
  const tag = el.tagName;
  const proto = tag === 'INPUT' ? win.HTMLInputElement?.prototype : win.HTMLTextAreaElement?.prototype;
  const setter = proto ? (Object.getOwnPropertyDescriptor(proto, 'value') ?? {}).set : undefined;
  const setVal = (v: string) => { if (setter) setter.call(el, v); else (el as any).value = v; };
  const KE = win.KeyboardEvent as typeof KeyboardEvent;
  const E = win.Event as typeof Event;
  const IE = (win.InputEvent ?? win.Event) as typeof InputEvent;
  const charToCode = (ch: string) => /[a-zA-Z]/.test(ch) ? 'Key' + ch.toUpperCase() : /[0-9]/.test(ch) ? 'Digit' + ch : 'Unidentified';
  el.focus();
  el.dispatchEvent(new E('focus', { bubbles: false }));
  el.dispatchEvent(new E('focusin', { bubbles: true }));
  setVal('');
  el.dispatchEvent(new IE('input', { bubbles: true, cancelable: false, inputType: 'deleteContent' } as any));
  let current = '';
  for (const ch of value) {
    const raw = ch.charCodeAt(0); const kc = /[a-zA-Z]/.test(ch) ? ch.toUpperCase().charCodeAt(0) : raw;
    const kDown = { key: ch, code: charToCode(ch), keyCode: kc, charCode: 0, which: kc, bubbles: true, cancelable: true };
    const kPress = { key: ch, code: charToCode(ch), keyCode: raw, charCode: raw, which: raw, bubbles: true, cancelable: true };
    el.dispatchEvent(new KE('keydown', kDown));
    el.dispatchEvent(new KE('keypress', kPress));
    current += ch; setVal(current);
    el.dispatchEvent(new IE('input', { bubbles: true, cancelable: false, inputType: 'insertText', data: ch } as any));
    el.dispatchEvent(new KE('keyup', kDown));
    if (delay > 0) await _sleep(delay);
  }
  el.dispatchEvent(new E('change', { bubbles: true }));
  el.dispatchEvent(new E('blur', { bubbles: false }));
  el.dispatchEvent(new E('focusout', { bubbles: true }));
});

reg('type', async ({ spec, text, delay = 0, timeout = ACTION_TIMEOUT }) => {
  const el = await _waitForActionable(spec, timeout, 'type') as HTMLInputElement;
  el.focus();
  for (const ch of text) {
    if (delay) await _sleep(delay);
    el.value += ch;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
});

reg('press', async ({ spec, key, timeout = ACTION_TIMEOUT }) => {
  await _waitForSpec(spec, timeout, 'attached');
  const el = evalSpec(spec)[0] as HTMLElement | null;
  if (!el) throw new Error('element not found');
  const kOpts = { key, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent('keydown', kOpts));
  el.dispatchEvent(new KeyboardEvent('keypress', kOpts));
  el.dispatchEvent(new KeyboardEvent('keyup', kOpts));
  if (key === 'Enter') { const form = (el as HTMLInputElement).form; if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
});

reg('check', async ({ spec, timeout = ACTION_TIMEOUT }) => {
  const el = await _waitForActionable(spec, timeout, 'check') as HTMLInputElement;
  if (!el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
});

reg('uncheck', async ({ spec, timeout = ACTION_TIMEOUT }) => {
  const el = await _waitForActionable(spec, timeout, 'uncheck') as HTMLInputElement;
  if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
});

reg('select', async ({ spec, value, timeout = ACTION_TIMEOUT }) => {
  const el = await _waitForActionable(spec, timeout, 'selectOption') as HTMLSelectElement;
  const vals = Array.isArray(value) ? value : [value];
  for (const opt of Array.from(el.options)) opt.selected = vals.includes(opt.value) || vals.includes(opt.text);
  el.dispatchEvent(new Event('change', { bubbles: true }));
});

reg('selectOption', async ({ spec, value, timeout = ACTION_TIMEOUT }) => {
  const el = await _waitForActionable(spec, timeout, 'selectOption') as HTMLSelectElement;
  const vals = Array.isArray(value) ? value : [value];
  for (const opt of Array.from(el.options)) opt.selected = vals.includes(opt.value) || vals.includes(opt.text);
  el.dispatchEvent(new Event('change', { bubbles: true }));
});

reg('setInputFiles', async ({ spec, files, timeout = ACTION_TIMEOUT }) => {
  await _waitForSpec(spec, timeout, 'attached');
  const doc = iframeDoc(); const win = iframeWin() as any;
  if (!doc || !win) throw new Error('no active tab');
  const el = _evalSpecIn(spec, doc)[0] as HTMLInputElement | null;
  if (!el) throw new Error('element not found');
  const DT = (win?.DataTransfer ?? DataTransfer) as typeof DataTransfer;
  const F  = (win?.File ?? File) as typeof File;
  const dt = new DT();
  for (const f of (files as Array<{ name: string; mimeType?: string; data?: string; buffer?: number[] }>)) {
    let bytes: Uint8Array;
    if (f.data) {
      const bin = atob(f.data);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new Uint8Array(f.buffer ?? []);
    }
    dt.items.add(new F([bytes.buffer as ArrayBuffer], f.name, { type: f.mimeType ?? '' }));
  }
  Object.defineProperty(el, 'files', { value: dt.files, configurable: true, writable: false });
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

// ── State queries ─────────────────────────────────────────────────────────────

reg('getAttribute', async ({ spec, name }) => (evalSpec(spec)[0]?.getAttribute(name) ?? null));
reg('innerText',    async ({ spec }) => (evalSpec(spec)[0] as HTMLElement | null)?.innerText ?? '');
reg('textContent',  async ({ spec }) => evalSpec(spec)[0]?.textContent ?? null);
reg('inputValue',   async ({ spec }) => (evalSpec(spec)[0] as HTMLInputElement | null)?.value ?? '');
reg('isVisible',    async ({ spec }) => { const el = evalSpec(spec)[0] as HTMLElement | null; return el ? _isVisible(el) : false; });
reg('isEnabled',    async ({ spec }) => { const el = evalSpec(spec)[0] as HTMLElement | null; return el ? _isEnabled(el) : false; });
reg('isChecked',    async ({ spec }) => (evalSpec(spec)[0] as HTMLInputElement | null)?.checked ?? false);
reg('isEditable',   async ({ spec }) => { const el = evalSpec(spec)[0] as HTMLElement | null; return el ? _isEditable(el) : false; });

reg('boundingBox', async ({ spec }) => {
  const el = evalSpec(spec)[0] as HTMLElement | null; if (!el) return null;
  const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
});

reg('locatorEvaluate', async ({ spec, code, arg }) => {
  await _waitForSpec(spec, ACTION_TIMEOUT, 'attached');
  const doc = iframeDoc(); const win = iframeWin() as any;
  if (!doc || !win) throw new Error('no active tab');
  const el = _evalSpecIn(spec, doc)[0]; if (!el) throw new Error('element not found');
  const fn = win.eval(`(${code})`);
  return Promise.resolve(arg !== undefined ? fn(el, arg) : fn(el));
});

// ── Dialog / route ────────────────────────────────────────────────────────────

reg('dialog-response', async ({ action, text, promptText }: { action: 'accept' | 'dismiss'; text?: string; promptText?: string }) => {
  _pendingDialogDecisions.push({ action, promptText: text ?? promptText });
});

reg('route-register', async ({ intercept = true }: { intercept?: boolean }) => {
  if (intercept) _interceptAll = true;
});

reg('route-decision', async ({ requestId, action, response, continueOpts, errorCode }) => {
  const resolve = _pendingRouteDecisions.get(requestId);
  if (resolve) { _pendingRouteDecisions.delete(requestId); resolve({ action, response, continueOpts, errorCode }); }
});

reg('route-fetch', async ({ url, method, headers, body }: { url: string; method: string; headers: Record<string, string>; body?: string }) => {
  const resp = await fetch(url, { method, headers, ...(body ? { body } : {}) });
  const h: Record<string, string> = {};
  resp.headers.forEach((v, k) => { h[k] = v; });
  return { status: resp.status, statusText: resp.statusText, headers: h, body: await resp.text() };
});

// ── Session reset ─────────────────────────────────────────────────────────────

reg('resetSession', async () => {
  _interceptAll = false;
  _initScripts.length = 0;
  _pendingDialogDecisions.length = 0;
  for (const id of _tabs.slice(1).map(t => t.id)) _closeTab(id);
  const tab = _activeTab();
  if (!tab) { const t = _createTab(); _setActiveTab(t.id); return; }
  const win = iframeWin() as any; const doc = iframeDoc() as any;
  if (win) { try { win.localStorage.clear(); } catch {} try { win.sessionStorage.clear(); } catch {} }
  if (doc && win) {
    try {
      const hostname = win.location?.hostname ?? '';
      for (const cookie of doc.cookie.split(';')) {
        const name = cookie.split('=')[0].trim(); if (!name) continue;
        const base = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
        doc.cookie = base; if (hostname) doc.cookie = `${base}; domain=${hostname}`;
      }
    } catch {}
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('resetSession timed out')), 10_000);
    tab.iframe.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
    tab.iframe.src = 'about:blank';
  });
});

// ── Init scripts ──────────────────────────────────────────────────────────────

reg('addInitScript',   async ({ code }: { code: string }) => { _initScripts.push(code); });
reg('clearInitScripts', async () => { _initScripts.length = 0; });

// ── Local storage ─────────────────────────────────────────────────────────────

reg('getLocalStorage', async ({ key }: { key?: string }) => {
  const win = iframeWin() as any; if (!win?.localStorage) return key ? null : [];
  if (key !== undefined) return win.localStorage.getItem(key);
  const out: Array<{ name: string; value: string }> = [];
  for (let i = 0; i < win.localStorage.length; i++) {
    const k = win.localStorage.key(i);
    if (k !== null) out.push({ name: k, value: win.localStorage.getItem(k) ?? '' });
  }
  return out;
});

reg('setLocalStorage', async ({ key, value, items }: { key?: string; value?: string; items?: Array<{ name: string; value: string }> }) => {
  const win = iframeWin() as any; if (!win?.localStorage) throw new Error('localStorage not available');
  if (items) {
    for (const item of items) win.localStorage.setItem(item.name, item.value);
  } else if (key !== undefined) {
    win.localStorage.setItem(key, value ?? '');
  }
});

reg('clearStorage', async () => {
  const win = iframeWin() as any;
  if (win?.localStorage)    try { win.localStorage.clear();    } catch {}
  if (win?.sessionStorage)  try { win.sessionStorage.clear();  } catch {}
});

// ── Tabs ──────────────────────────────────────────────────────────────────────

reg('newTab', async ({ url }: { url?: string }) => {
  const tab = _createTab(url); _setActiveTab(tab.id);
  _emitEvent('tab-created', { tabId: tab.id, url: tab.url }); return tab.id;
});

reg('closeTab', async ({ tabId }: { tabId: string }) => {
  _closeTab(tabId); _emitEvent('tab-closed', { tabId });
});

reg('switchTab', async ({ tabId }: { tabId: string }) => {
  _setActiveTab(tabId); _emitEvent('tab-switched', { tabId });
});

reg('getTabsSnapshot', async () => _tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.id === _activeTabId })));

// ── Mouse ─────────────────────────────────────────────────────────────────────

let _mx = 0, _my = 0, _mButtons = 0, _mClickCount = 0;
let _mHoverPath: Element[] = [];

function _mPath(el: Element | null): Element[] {
  const p: Element[] = []; let cur = el;
  while (cur) { p.push(cur); cur = cur.parentElement; }
  return p;
}

function _mDispatch(target: EventTarget | null, type: string, init: MouseEventInit = {}): void {
  if (!target) return;
  const evInit: MouseEventInit = { bubbles: true, cancelable: true, composed: true, clientX: _mx, clientY: _my, screenX: _mx, screenY: _my, buttons: _mButtons, ...init };
  if (type.startsWith('pointer')) { target.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, ...evInit })); return; }
  target.dispatchEvent(new MouseEvent(type, evInit));
}

function _mBoundary(prev: Element | null, next: Element | null): void {
  const pp = _mHoverPath; const np = _mPath(next); const ps = new Set(pp); const ns = new Set(np);
  for (const el of pp.filter(e => !ns.has(e))) {
    _mDispatch(el, 'pointerout', { relatedTarget: next }); _mDispatch(el, 'mouseout', { relatedTarget: next });
    _mDispatch(el, 'pointerleave', { bubbles: false, relatedTarget: next }); _mDispatch(el, 'mouseleave', { bubbles: false, relatedTarget: next });
  }
  for (const el of [...np.filter(e => !ps.has(e))].reverse()) {
    _mDispatch(el, 'pointerover', { relatedTarget: prev }); _mDispatch(el, 'mouseover', { relatedTarget: prev });
    _mDispatch(el, 'pointerenter', { bubbles: false, relatedTarget: prev }); _mDispatch(el, 'mouseenter', { bubbles: false, relatedTarget: prev });
  }
  _mHoverPath = np;
}

reg('mouseMove', async ({ x, y, steps = 1 }: { x: number; y: number; steps?: number }) => {
  const doc = iframeDoc(); const sx = _mx; const sy = _my;
  for (let i = 1; i <= steps; i++) {
    _mx = sx + ((x - sx) * i) / steps; _my = sy + ((y - sy) * i) / steps;
    const prev = _mHoverPath[0] ?? null; const next = doc?.elementFromPoint(_mx, _my) as Element | null ?? null;
    if (prev !== next) _mBoundary(prev, next);
    _mDispatch(next, 'pointermove'); _mDispatch(next, 'mousemove');
    if (i < steps) await _sleep(0);
  }
});

reg('mouseDown', async ({ button = 'left' }: { button?: string }) => {
  const b = button === 'middle' ? 1 : button === 'right' ? 2 : 0;
  const mask = b === 1 ? 4 : b === 2 ? 2 : 1; _mButtons |= mask;
  const target = iframeDoc()?.elementFromPoint(_mx, _my) ?? null;
  _mDispatch(target, 'pointerdown', { button: b }); _mDispatch(target, 'mousedown', { button: b, detail: _mClickCount + 1 });
});

reg('mouseUp', async ({ button = 'left' }: { button?: string }) => {
  const b = button === 'middle' ? 1 : button === 'right' ? 2 : 0;
  const mask = b === 1 ? 4 : b === 2 ? 2 : 1;
  const target = iframeDoc()?.elementFromPoint(_mx, _my) ?? null;
  _mDispatch(target, 'pointerup', { button: b }); _mDispatch(target, 'mouseup', { button: b, detail: _mClickCount + 1 });
  _mButtons &= ~mask;
});

reg('mouseClick', async ({ x, y, button = 'left', clickCount = 1, delay = 0 }) => {
  await (_cmds.get('mouseMove') as Handler)({ x, y }); _mClickCount = clickCount;
  await (_cmds.get('mouseDown') as Handler)({ button }); if (delay) await _sleep(delay);
  await (_cmds.get('mouseUp')   as Handler)({ button });
  const b = button === 'middle' ? 1 : button === 'right' ? 2 : 0;
  const target = iframeDoc()?.elementFromPoint(_mx, _my) ?? null;
  _mDispatch(target, 'click', { button: b, detail: _mClickCount });
  if (b === 2) _mDispatch(target, 'contextmenu', { button: 2 });
});

reg('mouseDblclick', async ({ x, y, delay = 0 }) => {
  await (_cmds.get('mouseClick') as Handler)({ x, y, clickCount: 1 }); if (delay) await _sleep(delay);
  await (_cmds.get('mouseClick') as Handler)({ x, y, clickCount: 2 });
  const target = iframeDoc()?.elementFromPoint(_mx, _my) ?? null;
  _mDispatch(target, 'dblclick', { button: 0, detail: 2 });
});

reg('mouseWheel', async ({ deltaX, deltaY }: { deltaX: number; deltaY: number }) => {
  iframeDoc()?.elementFromPoint(_mx, _my)?.dispatchEvent(new WheelEvent('wheel', {
    bubbles: true, cancelable: true, clientX: _mx, clientY: _my, screenX: _mx, screenY: _my,
    deltaX, deltaY, deltaMode: WheelEvent.DOM_DELTA_PIXEL,
  }));
});

// ── Keyboard ──────────────────────────────────────────────────────────────────

const _heldKeys = new Set<string>();

function _kbDispatch(type: string, key: string): void {
  const win = iframeWin() as any; if (!win) return;
  const code = /^[a-zA-Z]$/.test(key) ? 'Key' + key.toUpperCase() : /^[0-9]$/.test(key) ? 'Digit' + key : key === ' ' ? 'Space' : key;
  const kc = key.length === 1 ? key.charCodeAt(0) : 0;
  const target = iframeDoc()?.activeElement ?? iframeDoc()?.body ?? null;
  target?.dispatchEvent(new (win.KeyboardEvent ?? KeyboardEvent)(type, {
    key, code, keyCode: kc, charCode: type === 'keypress' ? kc : 0, which: kc, bubbles: true, cancelable: true,
    ctrlKey: _heldKeys.has('Control'), altKey: _heldKeys.has('Alt'), shiftKey: _heldKeys.has('Shift'), metaKey: _heldKeys.has('Meta'),
  }));
}

reg('keyboardDown', async ({ key }) => { _heldKeys.add(key); _kbDispatch('keydown', key); });
reg('keyboardUp',   async ({ key }) => { _heldKeys.delete(key); _kbDispatch('keyup', key); });

reg('keyboardPress', async ({ key }) => {
  _kbDispatch('keydown', key); _kbDispatch('keypress', key); _kbDispatch('keyup', key);
  if (key === 'Enter') { const active = iframeDoc()?.activeElement as HTMLInputElement | null; active?.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
});

reg('keyboardType', async ({ text, delay = 0 }) => {
  for (const ch of text) {
    if (delay) await _sleep(delay);
    _kbDispatch('keydown', ch); _kbDispatch('keypress', ch);
    const active = iframeDoc()?.activeElement as HTMLInputElement | null;
    if (active && 'value' in active) { active.value += ch; active.dispatchEvent(new Event('input', { bubbles: true })); }
    _kbDispatch('keyup', ch);
  }
});

reg('keyboardInsertText', async ({ text }) => {
  const doc = iframeDoc(); if (!doc) return;
  const active = doc.activeElement as HTMLInputElement | null; if (!active) return;
  if ('value' in active) {
    active.value += text;
    active.dispatchEvent(new Event('input', { bubbles: true }));
    active.dispatchEvent(new Event('change', { bubbles: true }));
  } else { doc.execCommand('insertText', false, text); }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

function _boot(): void {
  const firstTab = _createTab();
  _setActiveTab(firstTab.id);
  _startEarlyBridgeWatcher();

  // Use Hammerhead's native WebSocket (if available) to bypass the proxy interceptor.
  // The agent is infrastructure, not a test target — its WS must connect directly.
  const NativeWS: typeof WebSocket = (window as any).hammerhead?.nativeMethods?.WebSocket ?? WebSocket;
  const ws = new NativeWS('ws://localhost:' + _cfg.port);
  _ws = ws;

  ws.addEventListener('open', () => {
    _wsSend({ type: 'hello', role: 'test-browser' });
    // Notify panel of the initial tab so its _tabs array is populated
    const tab = _activeTab();
    if (tab) {
      _emitEvent('tab-created', { tabId: tab.id, url: tab.url, title: tab.title });
    }
  });

  ws.addEventListener('message', (event: MessageEvent) => {
    let msg: any;
    try { msg = JSON.parse(event.data as string); } catch { return; }
    if (msg.type === 'agent-reload') { location.reload(); return; }
    if (msg.type === 'agent-close') { try { window.close(); } catch { } return; }
    if (msg.type !== 'tb-command') return;
    const { id, method, params } = msg;
    const handler = _cmds.get(method as TbCommandMethod);
    if (!handler) { _sendResult(id, undefined, `Unknown command: ${method}`); return; }
    Promise.resolve()
      .then(() => handler(params ?? {}))
      .then(result => _sendResult(id, result))
      .catch(err => _sendResult(id, undefined, err instanceof Error ? err.message : String(err)));
  });

  ws.addEventListener('close', () => { _ws = null; setTimeout(_boot, 2000); });
  ws.addEventListener('error', () => {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _boot);
} else {
  _boot();
}
