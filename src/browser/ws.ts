// WebSocket client — browser-side connection to the test server.

let _ws: WebSocket | null = null;
let _wsReqCounter = 0;
const _wsCallbacks = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const _wsListeners = new Map<string, Set<(msg: Record<string, unknown>) => void>>();
let _wsConnectedCb: (() => void) | null = null;
let _wsDisconnectedCb: (() => void) | null = null;

function _wsConnectInternal(): void {
  try {
    const ws = new WebSocket('ws://localhost:' + window.__CONFIG__.port);
    _ws = ws;

    ws.addEventListener('open', () => { _wsConnectedCb?.(); });

    ws.addEventListener('message', (event: MessageEvent) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(event.data as string) as Record<string, unknown>; } catch { return; }
      const id = msg.id as string | undefined;
      if (id && _wsCallbacks.has(id)) {
        const { resolve, reject } = _wsCallbacks.get(id)!;
        _wsCallbacks.delete(id);
        if (msg.error) reject(new Error(msg.error as string));
        else resolve(msg);
        return;
      }
      const type = msg.type as string | undefined;
      if (type) {
        const fns = _wsListeners.get(type);
        if (fns) for (const fn of fns) { try { fn(msg); } catch { /* ignore */ } }
      }
    });

    ws.addEventListener('close', () => {
      _ws = null;
      for (const { reject } of _wsCallbacks.values()) reject(new Error('WebSocket disconnected'));
      _wsCallbacks.clear();
      _wsDisconnectedCb?.();
      setTimeout(_wsConnectInternal, 2000);
    });

    ws.addEventListener('error', () => {});
  } catch { /* ignore */ }
}

export function wsConnect(onConnected?: () => void, onDisconnected?: () => void): void {
  _wsConnectedCb = onConnected ?? null;
  _wsDisconnectedCb = onDisconnected ?? null;
  _wsConnectInternal();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wsOnMessage(type: string, fn: (msg: any) => void): () => void {
  if (!_wsListeners.has(type)) _wsListeners.set(type, new Set());
  _wsListeners.get(type)!.add(fn);
  return () => _wsListeners.get(type)?.delete(fn);
}

export function wsSend(type: string, data?: Record<string, unknown>): void {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify({ type, ...data }));
  }
}

export async function wsRequest<T>(type: string, data?: Record<string, unknown>): Promise<T> {
  const t0 = Date.now();
  while ((!_ws || _ws.readyState !== WebSocket.OPEN) && Date.now() - t0 < 10000) {
    await new Promise<void>(r => setTimeout(r, 50));
  }
  if (!_ws || _ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket not connected');
  return new Promise<T>((resolve, reject) => {
    const id = String(++_wsReqCounter);
    _wsCallbacks.set(id, { resolve: resolve as (v: unknown) => void, reject });
    _ws!.send(JSON.stringify({ type, id, ...data }));
    setTimeout(() => {
      if (_wsCallbacks.has(id)) {
        _wsCallbacks.delete(id);
        reject(new Error(`wsRequest(${type}) timed out`));
      }
    }, 30000);
  });
}
