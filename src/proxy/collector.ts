import * as zlib from 'node:zlib';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RequestFilterRule } = require('testcafe-hammerhead');

function _decompressBody(body: Buffer, encoding: string): Buffer {
  try {
    const enc = encoding.toLowerCase().trim();
    if (enc === 'gzip' || enc === 'x-gzip') return zlib.gunzipSync(body);
    if (enc === 'deflate') return zlib.inflateSync(body);
    if (enc === 'br') return zlib.brotliDecompressSync(body);
  } catch { /* if decompression fails, return raw */ }
  return body;
}

export class ProxyCollector {
  constructor(
    private readonly _sessions: any[],
    private readonly _sendToClients: (msg: object) => void,
  ) {}

  attach(): void {
    const rule = RequestFilterRule.ANY;
    for (const session of this._sessions) {
      this._attachToSession(session, rule);
    }
  }

  private _attachToSession(session: any, rule: any): void {
    const ajaxRequestIds = new Set<string>();

    session.requestHookEventProvider.addRequestEventListeners(
      rule,
      {
        onRequest: async (event: any) => {
          const info = event._requestInfo;
          try { if (new URL(info.url).pathname === '/mock') return; } catch { /* ignore */ }
          if (info.isAjax) ajaxRequestIds.add(info.requestId);
          this._sendToClients({
            type: 'hh-request',
            requestId: info.requestId,
            url: info.url,
            method: (info.method ?? 'get').toUpperCase(),
            headers: info.headers ?? {},
            body: info.body ? info.body.toString('utf8').slice(0, 65536) : null,
            isAjax: info.isAjax,
          });
        },
        onConfigureResponse: async (event: any) => {
          event.opts.includeHeaders = true;
          event.opts.includeBody = true;
        },
        onResponse: async (event: any) => {
          const isAjax = ajaxRequestIds.delete(event.requestId);
          const headers: Record<string, string> = event.headers ?? {};
          let body: string | null = null;
          if (isAjax && event.body?.length) {
            const encoding = headers['content-encoding'] ?? '';
            const raw = encoding ? _decompressBody(event.body, encoding) : event.body;
            body = raw.toString('utf8').slice(0, 65536);
          }
          this._sendToClients({
            type: 'hh-response',
            requestId: event.requestId,
            statusCode: event.statusCode ?? 200,
            headers,
            body,
          });
        },
      },
      (err: any) => { console.error('[ProxyCollector] hook error:', err); },
    );
  }
}
