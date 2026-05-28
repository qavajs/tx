import { fromProxiedUrl, iframeDoc, wsOnMessage, page } from './browser';
import { escHtml } from '../utils/htmlUtils';

// ── Network panel ─────────────────────────────────────────────────────────────

interface NetworkEntry {
  id: number;
  url: string;
  method: string;
  type: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  status: number | null;
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  startTime: number;
  duration: number | null;
  state: 'pending' | 'complete' | 'failed';
  error?: string;
}

const _networkEntries: NetworkEntry[] = [];
let _networkCounter = 0;
const _MAX_NETWORK = 500;
const _hhReqMap = new Map<string, NetworkEntry>();

function _netStatusClass(status: number | null): string {
  if (status === null) return '';
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 300 && status < 400) return 'redirect';
  return 'error';
}

function _netShortUrl(url: string): string {
  const real = fromProxiedUrl(url);
  try { const u = new URL(real); return u.host + u.pathname + (u.search || ''); } catch { return real; }
}

function _renderNetworkRow(entry: NetworkEntry): string {
  const stClass = _netStatusClass(entry.status);
  const statusText = entry.state === 'failed'
    ? (entry.error || 'failed')
    : entry.status != null ? String(entry.status) : '…';
  const dur = entry.duration != null ? entry.duration + 'ms' : '…';
  const realUrl = fromProxiedUrl(entry.url);
  return '<div class="tx-network-row ' + entry.state + '" data-net-id="' + entry.id + '" title="' + escHtml(realUrl) + '">' +
    '<span class="tx-net-method">' + escHtml(entry.method) + '</span>' +
    '<span class="tx-net-status ' + stClass + '">' + escHtml(statusText) + '</span>' +
    '<span class="tx-net-type">' + escHtml(entry.type) + '</span>' +
    '<span class="tx-net-url">' + escHtml(_netShortUrl(entry.url)) + '</span>' +
    '<span class="tx-net-dur">' + escHtml(dur) + '</span>' +
  '</div>';
}

function _updateNetworkCount() {
  const el = document.getElementById('networkCount');
  if (el) el.textContent = _networkEntries.length > 0
    ? _networkEntries.length + ' request' + (_networkEntries.length !== 1 ? 's' : '')
    : '';
}

function _appendNetworkEntry(entry: NetworkEntry) {
  const list = document.getElementById('networkList');
  if (!list) return;
  const empty = list.querySelector('.tx-empty-network');
  if (empty) empty.remove();
  const tmp = document.createElement('div');
  tmp.innerHTML = _renderNetworkRow(entry);
  const wasAtBottom = list.scrollHeight - list.scrollTop <= list.clientHeight + 30;
  list.appendChild(tmp.firstElementChild!);
  if (wasAtBottom) list.scrollTop = list.scrollHeight;
  _updateNetworkCount();
}

function _refreshNetworkRow(entry: NetworkEntry) {
  const list = document.getElementById('networkList');
  const row = list?.querySelector<HTMLElement>('[data-net-id="' + entry.id + '"]');
  if (!row) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _renderNetworkRow(entry);
  const newRow = tmp.firstElementChild as HTMLElement;
  if (_selectedNetworkId === entry.id) newRow.classList.add('selected');
  row.replaceWith(newRow);
  _updateNetworkCount();
  if (_selectedNetworkId === entry.id) {
    const detailBody = document.getElementById('networkDetailBody');
    if (detailBody) detailBody.innerHTML = _renderNetworkDetail(entry);
  }
}

// ── Network detail panel ──────────────────────────────────────────────────────

function _formatBody(body: string, contentType?: string): string {
  const mime = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (!mime || mime === 'application/json' || mime.endsWith('+json')) {
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch { if (mime === 'application/json' || mime.endsWith('+json')) return body; }
  }
  if (mime === 'application/x-www-form-urlencoded') {
    try { return Array.from(new URLSearchParams(body)).map(([k, v]) => k + ': ' + v).join('\n'); } catch { return body; }
  }
  return body;
}

function _ndRow(key: string, value: string, wrap = false): string {
  return '<div class="tx-nd-row">' +
    '<span class="tx-nd-key">' + escHtml(key) + '</span>' +
    '<span class="tx-nd-val' + (wrap ? ' wrap' : '') + '" title="' + escHtml(value) + '">' + escHtml(value) + '</span>' +
  '</div>';
}

function _renderNetworkDetail(entry: NetworkEntry): string {
  const realUrl = fromProxiedUrl(entry.url);
  const status = entry.state === 'failed'
    ? 'Failed — ' + (entry.error || '')
    : entry.status != null ? entry.status + (entry.statusText ? ' ' + entry.statusText : '') : '—';
  const dur = entry.duration != null ? entry.duration + 'ms' : '—';

  let html = '<div class="tx-nd-section">' +
    '<div class="tx-nd-section-title">General</div>' +
    _ndRow('URL', realUrl, true) +
    _ndRow('Method', entry.method) +
    _ndRow('Status', status) +
    _ndRow('Type', entry.type) +
    _ndRow('Duration', dur) +
  '</div>';

  const reqHeaders = Object.entries(entry.requestHeaders);
  if (reqHeaders.length) {
    html += '<div class="tx-nd-section"><div class="tx-nd-section-title">Request Headers</div>';
    for (const [k, v] of reqHeaders) html += _ndRow(k, v);
    html += '</div>';
  }

  if (entry.requestBody != null && entry.requestBody !== '') {
    html += '<div class="tx-nd-section"><div class="tx-nd-section-title">Request Body</div>' +
      '<pre class="tx-nd-pre">' + escHtml(_formatBody(String(entry.requestBody), String(entry.requestHeaders['content-type'] ?? ''))) + '</pre></div>';
  }

  const respHeaders = Object.entries(entry.responseHeaders);
  if (respHeaders.length) {
    html += '<div class="tx-nd-section"><div class="tx-nd-section-title">Response Headers</div>';
    for (const [k, v] of respHeaders) html += _ndRow(k, v);
    html += '</div>';
  }

  if (entry.responseBody != null) {
    html += '<div class="tx-nd-section"><div class="tx-nd-section-title">Response Body</div>' +
      '<pre class="tx-nd-pre">' + escHtml(_formatBody(entry.responseBody, String(entry.responseHeaders['content-type'] ?? ''))) + '</pre></div>';
  }

  return html;
}

let _selectedNetworkId: number | null = null;

function _openNetworkDetail(id: number) {
  const entry = _networkEntries.find(e => e.id === id);
  if (!entry) return;
  document.querySelectorAll<HTMLElement>('.tx-network-row.selected').forEach(el => el.classList.remove('selected'));
  document.querySelector<HTMLElement>('[data-net-id="' + id + '"]')?.classList.add('selected');
  _selectedNetworkId = id;
  const detail = document.getElementById('networkDetail');
  const detailTitle = document.getElementById('networkDetailTitle');
  const detailBody = document.getElementById('networkDetailBody');
  if (!detail || !detailBody) return;
  detail.classList.add('open');
  if (detailTitle) detailTitle.textContent = entry.method + ' ' + _netShortUrl(entry.url);
  detailBody.innerHTML = _renderNetworkDetail(entry);
}

(window as any).closeNetworkDetail = () => {
  document.getElementById('networkDetail')?.classList.remove('open');
  document.querySelectorAll<HTMLElement>('.tx-network-row.selected').forEach(el => el.classList.remove('selected'));
  _selectedNetworkId = null;
};

(window as any).clearNetwork = () => {
  _networkEntries.length = 0;
  _networkCounter = 0;
  _hhReqMap.clear();
  _selectedNetworkId = null;
  document.getElementById('networkDetail')?.classList.remove('open');
  const list = document.getElementById('networkList');
  if (list) list.innerHTML = '<div class="tx-empty-network">No requests yet</div>';
  _updateNetworkCount();
};

// ── Console panel ─────────────────────────────────────────────────────────────

interface ConsoleEntry {
  id: number;
  level: string;
  text: string;
  url: string;
  timestamp: number;
}

const _consoleEntries: ConsoleEntry[] = [];
let _consoleCounter = 0;
let _consoleErrorCount = 0;
const _MAX_CONSOLE = 1000;

function _updateConsoleBadge() {
  const count = document.getElementById('consoleCount');
  const badge = document.getElementById('consoleErrorBadge');
  const panel = document.getElementById('networkPanel');
  const isConsoleTab = panel?.dataset.activeTab === 'console';
  if (count) {
    count.textContent = _consoleEntries.length > 0 ? String(_consoleEntries.length) : '';
    count.classList.toggle('has-errors', _consoleErrorCount > 0);
  }
  if (badge) {
    badge.classList.toggle('tx-hidden', !(_consoleErrorCount > 0 && !isConsoleTab));
    badge.textContent = _consoleErrorCount > 0 ? String(_consoleErrorCount) : '';
  }
}

function _appendConsoleEntry(entry: ConsoleEntry) {
  const list = document.getElementById('consoleList');
  if (!list) return;
  const empty = list.querySelector('.tx-empty-network');
  if (empty) empty.remove();
  const wasAtBottom = list.scrollHeight - list.scrollTop <= list.clientHeight + 30;
  const row = document.createElement('div');
  row.className = 'tx-console-row ' + entry.level;
  const shortUrl = entry.url ? (() => { try { const u = new URL(fromProxiedUrl(entry.url)); return u.host + u.pathname; } catch { return entry.url; } })() : '';
  row.innerHTML =
    '<span class="tx-con-level">' + escHtml(entry.level) + '</span>' +
    '<span class="tx-con-text" title="' + escHtml(entry.text) + '">' + escHtml(entry.text) + '</span>' +
    (shortUrl ? '<span class="tx-con-url" title="' + escHtml(entry.url) + '">' + escHtml(shortUrl) + '</span>' : '');
  list.appendChild(row);
  if (wasAtBottom) list.scrollTop = list.scrollHeight;
  _updateConsoleBadge();
}

// ── Dev panel tab / toggle ────────────────────────────────────────────────────

let _activeDevTab: 'network' | 'console' | 'selector' = 'network';

function _openDevPanel(tab: 'network' | 'console' | 'selector') {
  const panel = document.getElementById('networkPanel');
  if (!panel) return;
  const alreadyOpen = panel.classList.contains('open');
  if (alreadyOpen && _activeDevTab === tab) {
    panel.classList.remove('open');
    document.getElementById('networkToggleBtn')?.classList.remove('active');
    document.getElementById('consoleToggleBtn')?.classList.remove('active');
    _clearSelectorHighlights();
    return;
  }
  if (!alreadyOpen) {
    panel.classList.add('open');
    const savedH = Number(localStorage.getItem('tx-network-h') || 0);
    if (savedH) panel.style.height = savedH + 'px';
  }
  _switchDevTabInternal(tab);
}

function _switchDevTabInternal(tab: 'network' | 'console' | 'selector') {
  const panel = document.getElementById('networkPanel');
  if (!panel) return;
  if (_activeDevTab === 'selector' && tab !== 'selector') _clearSelectorHighlights();
  _activeDevTab = tab;
  panel.dataset.activeTab = tab;
  document.getElementById('devTabNetwork')?.classList.toggle('active', tab === 'network');
  document.getElementById('devTabConsole')?.classList.toggle('active', tab === 'console');
  document.getElementById('devTabSelector')?.classList.toggle('active', tab === 'selector');
  document.getElementById('devTabContentNetwork')?.classList.toggle('active', tab === 'network');
  document.getElementById('devTabContentConsole')?.classList.toggle('active', tab === 'console');
  document.getElementById('devTabContentSelector')?.classList.toggle('active', tab === 'selector');
  document.getElementById('networkToggleBtn')?.classList.toggle('active', panel.classList.contains('open'));
  if (tab === 'console') {
    _consoleErrorCount = 0;
    _updateConsoleBadge();
  }
  if (tab === 'selector') {
    const input = document.getElementById('selectorInput') as HTMLInputElement | null;
    if (input?.value) _runSelectorQuery(input.value);
    setTimeout(() => input?.focus(), 50);
  }
}

(window as any).switchDevTab = (tab: 'network' | 'console' | 'selector') => {
  const panel = document.getElementById('networkPanel');
  if (!panel) return;
  if (!panel.classList.contains('open')) {
    panel.classList.add('open');
    const savedH = Number(localStorage.getItem('tx-network-h') || 0);
    if (savedH) panel.style.height = savedH + 'px';
  }
  _switchDevTabInternal(tab);
};

(window as any).toggleNetworkPanel = () => {
  const panel = document.getElementById('networkPanel');
  if (panel?.classList.contains('open')) {
    panel.classList.remove('open');
    document.getElementById('networkToggleBtn')?.classList.remove('active');
    document.getElementById('consoleToggleBtn')?.classList.remove('active');
    _clearSelectorHighlights();
  } else {
    _openDevPanel(_activeDevTab);
  }
};

(window as any).toggleConsolePanel = () => _openDevPanel('console');

(window as any).clearDevTab = () => {
  if (_activeDevTab === 'network') {
    (window as any).clearNetwork();
  } else if (_activeDevTab === 'selector') {
    (window as any).clearSelectorQuery();
  } else {
    _consoleEntries.length = 0;
    _consoleCounter = 0;
    _consoleErrorCount = 0;
    const list = document.getElementById('consoleList');
    if (list) list.innerHTML = '<div class="tx-empty-network">No console output yet</div>';
    _updateConsoleBadge();
  }
};

// ── Selector playground ───────────────────────────────────────────────────────

const _HIGHLIGHT_CLASS = '__tx_sel_hi__';
const _HIGHLIGHT_STYLE_ID = '__tx_sel_style__';

function _ensureHighlightStyle(doc: Document) {
  if (doc.getElementById(_HIGHLIGHT_STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = _HIGHLIGHT_STYLE_ID;
  s.textContent = `.__tx_sel_hi__ { outline: 2px solid #34a870 !important; outline-offset: 1px !important; background-color: rgba(52,168,112,0.08) !important; }`;
  (doc.head || doc.documentElement).appendChild(s);
}

function _clearSelectorHighlights() {
  const doc = iframeDoc();
  if (!doc) return;
  for (const el of Array.from(doc.querySelectorAll<Element>('.' + _HIGHLIGHT_CLASS))) {
    el.classList.remove(_HIGHLIGHT_CLASS);
  }
  const styleEl = doc.getElementById(_HIGHLIGHT_STYLE_ID);
  if (styleEl) styleEl.remove();
}

function _describeElement(el: Element, idx: number): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = Array.from(el.classList).filter(c => c !== _HIGHLIGHT_CLASS).slice(0, 3).map(c => `.${c}`).join('');
  const text = (el.textContent || '').trim().slice(0, 40);
  return `<span class="tx-selector-match-idx">${idx + 1}</span><span class="tx-selector-match-tag">${escHtml(tag)}</span><span class="tx-selector-match-id">${escHtml(id)}</span><span class="tx-selector-match-cls">${escHtml(cls)}</span>${text ? `<span class="tx-selector-match-text">${escHtml(text)}</span>` : ''}`;
}

function _runSelectorQuery(selector: string) {
  const input = document.getElementById('selectorInput') as HTMLInputElement | null;
  const status = document.getElementById('selectorStatus');
  const matchList = document.getElementById('selectorMatches');
  if (!status || !matchList) return;

  _clearSelectorHighlights();

  if (!selector.trim()) {
    status.textContent = '';
    status.className = 'tx-selector-status';
    matchList.innerHTML = '';
    if (input) input.className = 'tx-selector-input';
    return;
  }

  const doc = iframeDoc();
  if (!doc) {
    status.textContent = 'No page loaded in iframe';
    status.className = 'tx-selector-status error';
    matchList.innerHTML = '';
    return;
  }

  let matches: Element[];
  try {
    matches = Array.from(doc.querySelectorAll(selector));
    if (input) input.className = 'tx-selector-input';
  } catch {
    status.textContent = 'Invalid selector';
    status.className = 'tx-selector-status error';
    matchList.innerHTML = '';
    if (input) input.className = 'tx-selector-input error';
    return;
  }

  _ensureHighlightStyle(doc);
  for (const el of matches) el.classList.add(_HIGHLIGHT_CLASS);

  if (matches.length === 0) {
    status.textContent = 'No elements matched';
    status.className = 'tx-selector-status zero';
    matchList.innerHTML = '';
    return;
  }

  status.textContent = `${matches.length} element${matches.length === 1 ? '' : 's'} matched`;
  status.className = 'tx-selector-status match';

  matchList.innerHTML = matches.map((el, i) => {
    return `<div class="tx-selector-match-item" data-idx="${i}">${_describeElement(el, i)}</div>`;
  }).join('');

  matchList.querySelectorAll<HTMLElement>('.tx-selector-match-item').forEach((row, i) => {
    row.addEventListener('click', () => {
      matches[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

(window as any).runSelectorQuery = _runSelectorQuery;

(window as any).clearSelectorQuery = () => {
  const input = document.getElementById('selectorInput') as HTMLInputElement | null;
  if (input) { input.value = ''; input.className = 'tx-selector-input'; }
  _runSelectorQuery('');
};

// ── Network panel resizer ─────────────────────────────────────────────────────

export function initNetworkResizer(): void {
  const panel = document.getElementById('networkPanel');
  const handle = document.getElementById('networkResizeHandle');
  if (!panel || !handle) return;

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    if (!panel.classList.contains('open')) return;
    e.preventDefault();
    handle.classList.add('dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    const startY = e.clientY;
    const startH = panel.offsetHeight;
    const onMove = (ev: MouseEvent) => {
      const h = Math.min(600, Math.max(80, startH - (ev.clientY - startY)));
      panel.style.height = h + 'px';
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('tx-network-h', String(panel.offsetHeight));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── Network + console event listeners ────────────────────────────────────────

export function initNetworkListeners(): void {
  wsOnMessage('hh-request', (msg: any) => {
    const entry: NetworkEntry = {
      id: ++_networkCounter,
      url: msg.url ?? '',
      method: msg.method ?? 'GET',
      type: msg.isAjax ? 'fetch' : 'document',
      requestHeaders: msg.headers ?? {},
      requestBody: msg.body ?? null,
      status: null,
      statusText: '',
      responseHeaders: {},
      responseBody: null,
      startTime: Date.now(),
      duration: null,
      state: 'pending',
    };
    if (_networkEntries.length >= _MAX_NETWORK) _networkEntries.shift();
    _networkEntries.push(entry);
    _hhReqMap.set(msg.requestId, entry);
    _appendNetworkEntry(entry);
  });

  wsOnMessage('hh-response', (msg: any) => {
    const entry = _hhReqMap.get(msg.requestId);
    if (!entry) return;
    entry.status = msg.statusCode ?? null;
    entry.statusText = '';
    entry.responseHeaders = msg.headers ?? {};
    entry.responseBody = msg.body ?? null;
    entry.duration = Date.now() - entry.startTime;
    entry.state = 'complete';
    _hhReqMap.delete(msg.requestId);
    _refreshNetworkRow(entry);
  });

  document.getElementById('networkList')?.addEventListener('click', (e: MouseEvent) => {
    const row = (e.target as Element).closest<HTMLElement>('.tx-network-row');
    if (!row) return;
    const id = Number(row.getAttribute('data-net-id'));
    if (id) _openNetworkDetail(id);
  });

  page.onPermanent('console', (msg: any) => {
    const level = msg.type?.() ?? 'log';
    const entry: ConsoleEntry = {
      id: ++_consoleCounter,
      level,
      text: msg.text?.() ?? '',
      url: msg.location?.()?.url ?? '',
      timestamp: Date.now(),
    };
    if (_consoleEntries.length >= _MAX_CONSOLE) _consoleEntries.shift();
    _consoleEntries.push(entry);
    _appendConsoleEntry(entry);
  });

  page.onPermanent('pageerror', (err: Error) => {
    const entry: ConsoleEntry = {
      id: ++_consoleCounter,
      level: 'pageerror',
      text: err?.stack || err?.message || String(err),
      url: '',
      timestamp: Date.now(),
    };
    if (_consoleEntries.length >= _MAX_CONSOLE) _consoleEntries.shift();
    _consoleEntries.push(entry);
    _consoleErrorCount++;
    _appendConsoleEntry(entry);
    _updateConsoleBadge();
  });
}
