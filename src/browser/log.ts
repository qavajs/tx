import type { WindowConfig } from '../types';
declare global { interface Window { __CONFIG__: WindowConfig; } }

// ── Snapshot injection ────────────────────────────────────────────────────────

let _snapshotCaptureFn: ((label: string) => number) | null = null;
export function setSnapshotCaptureFn(fn: (label: string) => number): void {
  _snapshotCaptureFn = fn;
}

const _snapshotCommands = new Set([
  'click', 'dblclick', 'rightClick', 'fill', 'type', 'press', 'select', 'check', 'uncheck', 'focus', 'hover', 'scroll', 'goto', 'reload', 'waitForURL', 'setInputFiles',
  'mouse.click', 'mouse.dblclick',
  'keyboard.press', 'keyboard.type', 'keyboard.insertText',
]);

// ── Log state ─────────────────────────────────────────────────────────────────

type LogState = 'pending' | 'info' | 'pass' | 'fail' | 'warn';

const LOG_STATE: Record<LogState, { icon: string }> = {
  pending: { icon: '…' },
  info:    { icon: '›' },
  pass:    { icon: '✓' },
  fail:    { icon: '✗' },
  warn:    { icon: '~' },
};

let _logContainer: HTMLElement | null = null;
export function setLogContainer(el: HTMLElement | null): void { _logContainer = el; }

export interface LogEntry {
  cmd: string;
  message: string;
  state: 'pass' | 'fail' | 'info' | 'warn';
  duration?: number;
  attachment?: { body: string; contentType: string };
  children?: LogEntry[];
}

let _collectedLogs: LogEntry[] | null = null;

export function startCollectingLogs(): void { _collectedLogs = []; }

export function stopCollectingLogs(): LogEntry[] {
  const logs = _collectedLogs ?? [];
  _collectedLogs = null;
  return logs;
}

// ── DOM log entry helpers ─────────────────────────────────────────────────────

function createLogEntry(message: string, state: LogState, cmd?: string, duration?: number): HTMLElement | null {
  const container = _logContainer ?? document.getElementById('console');
  if (!container) return null;
  const cls = state;
  const icon = LOG_STATE[state].icon;
  const entry = document.createElement('div');
  entry.className = `tx-cmd ${cls}`;
  const iconEl = document.createElement('span'); iconEl.className = `tx-cmd-icon ${cls}`; iconEl.textContent = icon;
  const msgEl = document.createElement('span'); msgEl.className = 'tx-cmd-msg'; msgEl.textContent = message;
  entry.appendChild(iconEl); entry.appendChild(msgEl);
  if (duration != null) {
    const durEl = document.createElement('span'); durEl.className = 'tx-cmd-dur'; durEl.textContent = duration + 'ms';
    entry.appendChild(durEl);
  }
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
  return entry;
}

function updateLogEntry(entry: HTMLElement | null, state: 'pass' | 'fail' | 'warn', duration?: number): void {
  if (!entry) return;
  entry.classList.remove('pending', 'info', 'pass', 'fail', 'warn');
  entry.classList.add(state);
  const iconEl = entry.querySelector<HTMLElement>('.tx-cmd-icon');
  const labelEl = entry.querySelector<HTMLElement>('.tx-cmd-label');
  if (iconEl) {
    iconEl.className = `tx-cmd-icon ${state}`;
    iconEl.textContent = LOG_STATE[state].icon;
  }
  if (labelEl) { labelEl.className = `tx-cmd-label ${state}`; }
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

// ── Public log API ────────────────────────────────────────────────────────────

function _log(message: string, opts?: { type?: 'info' | 'success' | 'error'; cmd?: string; duration?: number }): void {
  const type = opts?.type ?? 'info';
  const state = type === 'success' ? 'pass' : type === 'error' ? 'fail' : 'info';
  createLogEntry(message, state, opts?.cmd, opts?.duration);
  if (_collectedLogs) _collectedLogs.push({ cmd: opts?.cmd ?? state, message, state, duration: opts?.duration });
}

export function attach(label: string, body: string, contentType = 'text/plain'): void {
  if (_collectedLogs) {
    _collectedLogs.push({ cmd: 'attach', message: label, state: 'info', attachment: { body, contentType } });
  }
  createLogEntry(label, 'info', 'attach');
}

export interface TxCommandHandle {
  success(duration?: number): void;
  fail(error?: string): void;
  /** Mark the entry as a soft (non-fatal) failure — amber ⚠ instead of red ✗. */
  warn(error?: string): void;
}

export interface TxGroupHandle {
  end(): void;
}

export function logCommand(message: string, cmd: string): TxCommandHandle {
  const entry = createLogEntry(message, 'pending', cmd);
  const startedAt = Date.now();
  return {
    success(duration?: number) {
      const dur = duration ?? Math.max(0, Date.now() - startedAt);
      updateLogEntry(entry, 'pass', dur);
      if (_collectedLogs) _collectedLogs.push({ cmd, message, state: 'pass', duration: dur });
      if (window.__CONFIG__?.snapshot && _snapshotCommands.has(cmd) && _snapshotCaptureFn) {
        try {
          const snapshotId = _snapshotCaptureFn(message || cmd);
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
    warn(error?: string) {
      if (error && entry) {
        const msgEl = entry.querySelector<HTMLElement>('.tx-cmd-msg');
        if (msgEl) msgEl.textContent += ` — ${error}`;
      }
      const dur = Math.max(0, Date.now() - startedAt);
      updateLogEntry(entry, 'warn', dur);
      if (_collectedLogs) _collectedLogs.push({ cmd, message: error ? `${message} — ${error}` : message, state: 'warn', duration: dur });
    },
  };
}

function logGroup(message: string, cmd?: string): TxGroupHandle;
function logGroup<T>(message: string, fn: () => T | Promise<T>): Promise<T>;
function logGroup<T>(message: string, cmd: string, fn: () => T | Promise<T>): Promise<T>;

function logGroup(message: string, cmdOrFn?: string | (() => any), fn?: () => any): TxGroupHandle | Promise<any> {
  const resolvedCmd = typeof cmdOrFn === 'string' ? cmdOrFn : 'group';
  const resolvedFn = typeof cmdOrFn === 'function' ? cmdOrFn : fn;

  const container = _logContainer ?? document.getElementById('console');
  let groupEl: HTMLElement | null = null;
  let bodyEl: HTMLElement | null = null;

  if (container) {
    groupEl = document.createElement('div');
    groupEl.className = 'tx-cmd-group open';
    const hdrEl = document.createElement('div');
    hdrEl.className = 'tx-cmd-group-hdr';
    hdrEl.onclick = () => groupEl!.classList.toggle('open');
    const chevronEl = document.createElement('span');
    chevronEl.className = 'tx-cmd-group-chevron';
    chevronEl.textContent = '▶';
    const msgEl = document.createElement('span');
    msgEl.className = 'tx-cmd-group-msg';
    msgEl.textContent = message;
    hdrEl.appendChild(chevronEl);
    hdrEl.appendChild(msgEl);
    bodyEl = document.createElement('div');
    bodyEl.className = 'tx-cmd-group-body';
    groupEl.appendChild(hdrEl);
    groupEl.appendChild(bodyEl);
    container.appendChild(groupEl);
    container.scrollTop = container.scrollHeight;
  }

  const savedContainer = _logContainer;
  const savedCollected = _collectedLogs;
  _logContainer = bodyEl;
  const children: LogEntry[] = [];
  const groupEntry: LogEntry = { cmd: resolvedCmd, message, state: 'info', children };
  if (savedCollected !== null) savedCollected.push(groupEntry);
  _collectedLogs = savedCollected !== null ? children : null;

  const end = () => {
    _logContainer = savedContainer;
    _collectedLogs = savedCollected;
    const hasFail = children.some(c => c.state === 'fail');
    const hasWarn = children.some(c => c.state === 'warn');
    const hasPass = children.some(c => c.state === 'pass');
    groupEntry.state = hasFail ? 'fail' : hasWarn ? 'warn' : 'info';
    if (groupEl) {
      groupEl.classList.toggle('fail', hasFail);
      groupEl.classList.toggle('warn', !hasFail && hasWarn);
      groupEl.classList.toggle('pass', !hasFail && !hasWarn && hasPass);
    }
    if (savedContainer) savedContainer.scrollTop = savedContainer.scrollHeight;
  };

  if (resolvedFn === undefined) return { end };

  return (async () => {
    try { const result = await resolvedFn(); end(); return result; }
    catch (e) { end(); throw e; }
  })();
}

export const log = Object.assign(_log, { open: logCommand, group: logGroup });

export async function _withCommand<T>(message: string, cmd: string, fn: () => Promise<T>): Promise<T> {
  const entry = logCommand(message, cmd);
  try {
    const result = await fn();
    entry.success();
    return result;
  } catch (error: unknown) {
    entry.fail(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
