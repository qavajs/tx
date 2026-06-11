// ── Per-protocol bridge installers ────────────────────────────────────────────

import { _emitPage, fromProxiedUrl, iframeWin, iframeDoc, createTab, wsRequest } from './browser';
import { Route, routeHandlers, dispatchRoute, matchesRoutePattern, _setRouteOrigFetch } from './route';

let _frameObserver: MutationObserver | null = null;

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
        if (type === 'prompt') return accepted ? promptText : null;
        return undefined;
      },
    };
  };
  win.alert = (message = '') => { _emitPage('dialog', makeDialog('alert', String(message))); };
  win.confirm = (message = '') => { const d = makeDialog('confirm', String(message)); _emitPage('dialog', d); return Boolean(d._result()); };
  win.prompt = (message = '', def = '') => { const d = makeDialog('prompt', String(message), String(def)); _emitPage('dialog', d); return d._result() as string | null; };
}

function _bridgePopup(win: any): void {
  win.open = (url?: string, _target?: string, _features?: string) => {
    const popupPage = createTab(url);
    _emitPage('popup', popupPage);
    // createTab calls setActiveTab(newTabId), so iframeWin() returns the new tab's window
    return iframeWin() ?? null;
  };
}

function _bridgeFetch(win: any): void {
  if (typeof win.fetch !== 'function') return;
  const origFetch = (win.fetch as typeof fetch).bind(win);
  _setRouteOrigFetch(origFetch);
  win.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === 'string' ? input
      : (input && typeof (input as any).href === 'string') ? (input as any).href
        : (input && typeof (input as any).url === 'string') ? (input as any).url
          : '';
    if (url && !/^https?:\/\//.test(url)) {
      try {
        const base = fromProxiedUrl(win.location?.href ?? '');
        if (base) url = new URL(url, base).href;
      } catch { /* keep original */ }
    }
    const isReqObj = input != null && typeof input === 'object' && typeof (input as any).href !== 'string';
    const method = ((init?.method) ?? (isReqObj ? (input as any).method : undefined) ?? 'GET').toUpperCase();
    const reqHeaders = _normalizeHeaders(init?.headers ?? (isReqObj ? (input as any).headers : undefined));
    const req = { url: () => url, method: () => method, headers: () => reqHeaders, postData: () => init?.body ?? null, isNavigationRequest: () => false, resourceType: () => 'fetch' };

    const routeFetchFn = (opts?: { url?: string; method?: string; headers?: Record<string, string>; postData?: BodyInit }) => {
      if (!opts) return origFetch(input, init);
      const fetchUrl = opts.url ?? url;
      const fetchMethod = opts.method ?? method;
      const fetchHeaders = { ...reqHeaders, ...opts.headers };
      const fetchBody = opts.postData !== undefined ? opts.postData : (init?.body ?? null);
      return origFetch(fetchUrl, { method: fetchMethod, headers: fetchHeaders, ...(fetchBody != null ? { body: fetchBody } : {}) });
    };
    const decision = await dispatchRoute(url, req, routeFetchFn);
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
  const proto = win.XMLHttpRequest.prototype as any;
  const origOpen = proto.open as Function;
  const origSend = proto.send as Function;
  const origSetRequestHeader = proto.setRequestHeader as Function;
  proto.open = function (method: string, url: string | URL, ...rest: any[]) {
    (this as any)._xMethod = method;
    (this as any)._xHeaders = {};
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
  proto.setRequestHeader = function (name: string, value: string) {
    if (!(this as any)._xHeaders) (this as any)._xHeaders = {};
    (this as any)._xHeaders[name.toLowerCase()] = value;
    return origSetRequestHeader.call(this, name, value);
  };
  proto.send = function (body?: XMLHttpRequestBodyInit | Document | null) {
    const self = this as any;
    const xUrl = self._xUrl ?? '';
    const xMethod = (self._xMethod ?? 'GET').toUpperCase();
    const xHeaders: Record<string, string> = self._xHeaders ?? {};
    const req = { url: () => xUrl, method: () => xMethod, headers: () => xHeaders, postData: () => body ?? null, isNavigationRequest: () => false, resourceType: () => 'xhr' };

    const routeEntry = routeHandlers.slice().reverse().find(h => matchesRoutePattern(h.pattern, xUrl));
    if (routeEntry) {
      (async () => {
        const xhrFetchFn = (opts?: { url?: string; method?: string; headers?: Record<string, string>; postData?: BodyInit }) =>
          new Promise<Response>((resolve, reject) => {
            const fetchUrl = opts?.url ?? xUrl;
            const fetchMethod = opts?.method ?? xMethod;
            const fetchHeaders = { ...xHeaders, ...opts?.headers };
            const fetchBody = opts?.postData !== undefined ? opts.postData : (body ?? null);
            const tempXhr = new (win.XMLHttpRequest as any)();
            origOpen.call(tempXhr, fetchMethod, fetchUrl);
            for (const [k, v] of Object.entries(fetchHeaders)) origSetRequestHeader.call(tempXhr, k, v);
            tempXhr.onload = () => {
              const hdrs: Record<string, string> = {};
              try { const raw: string = tempXhr.getAllResponseHeaders() ?? ''; for (const line of raw.trim().split('\r\n')) { const i = line.indexOf(':'); if (i > 0) hdrs[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim(); } } catch { /* ignore */ }
              resolve(new Response(tempXhr.responseText, { status: tempXhr.status, statusText: tempXhr.statusText, headers: hdrs }));
            };
            tempXhr.onerror = () => reject(new Error('route.fetch() request failed'));
            origSend.call(tempXhr, fetchBody as XMLHttpRequestBodyInit | null);
          });
        const route = new Route(req, xhrFetchFn);
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

          Object.defineProperty(self, 'status', { value: resp.status, configurable: true, writable: true });
          Object.defineProperty(self, 'statusText', { value: resp.statusText, configurable: true, writable: true });
          Object.defineProperty(self, 'responseText', { value: responseText, configurable: true, writable: true });
          Object.defineProperty(self, 'response', { value: responseText, configurable: true, writable: true });
          Object.defineProperty(self, 'readyState', { value: 4, configurable: true, writable: true });
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
  // win.WebSocket.CONNECTING = OrigWS.CONNECTING;
  // win.WebSocket.OPEN = OrigWS.OPEN;
  // win.WebSocket.CLOSING = OrigWS.CLOSING;
  // win.WebSocket.CLOSED = OrigWS.CLOSED;
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
        createReadStream:  async () => {
          const resp = await fetch(href);
          if (!resp.ok) throw new Error(`download.createReadStream: fetch failed (${resp.status})`);
          if (!resp.body) throw new Error('download.createReadStream: response body is null');
          return resp.body;
        },
        saveAs: async (filePath: string) => {
          const resp = await fetch(href);
          if (!resp.ok) throw new Error(`download.saveAs: fetch failed (${resp.status})`);
          const buf = await resp.arrayBuffer();
          const bytes = new Uint8Array(buf);
          const chunkSize = 8192;
          let binary = '';
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...(bytes.subarray(i, i + chunkSize) as any));
          }
          const b64 = btoa(binary);
          await wsRequest<unknown>('save-download', { path: filePath, data: b64 });
        },
      });
    }
  }, true);

  // file chooser
  doc.addEventListener('click', (e: MouseEvent) => {
    const el = e.target as HTMLElement;
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
  if (docRoot) {
    _frameObserver.observe(docRoot, { subtree: true, childList: true });
    for (const el of Array.from(doc.querySelectorAll('iframe, frame'))) {
      const frame = { url: () => (el as HTMLIFrameElement).src, name: () => (el as any).name ?? '', isMainFrame: () => false };
      _emitPage('frameattached', frame);
    }
  }
}

// ── Event bridge orchestrators ────────────────────────────────────────────────

export function cleanupBridges(): void {
  _frameObserver?.disconnect();
  _frameObserver = null;
}

export function installWindowBridges(win: any): void {
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

export function installEventBridges(): void {
  const win = iframeWin() as any;
  const doc = iframeDoc();
  if (!win || !doc) return;

  installWindowBridges(win);

  // Document-level bridges: guarded per document to prevent duplicate listeners
  if (!(doc as any).__cyDocBridges) {
    (doc as any).__cyDocBridges = true;
    _bridgeDocumentEvents(doc);
  }
}
