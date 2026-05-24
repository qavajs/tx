// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RequestFilterRule } = require('testcafe-hammerhead');

export class ProxyCollector {
  constructor(
    private readonly _sessions: any[],
    private readonly _sendToClients: (msg: object) => void,
  ) {}

  attach(): void {
    const rule = RequestFilterRule.ANY;
    console.log('[ProxyCollector] attaching to', this._sessions.length, 'sessions, rule.id=', rule?.id);
    for (const session of this._sessions) {
      console.log('[ProxyCollector]   session.id=', session.id);
      this._attachToSession(session, rule);
    }
  }

  private _attachToSession(session: any, rule: any): void {
    session.requestHookEventProvider.addRequestEventListeners(
      rule,
      {
        onRequest: async (event: any) => {
          const info = event._requestInfo;
          try { if (new URL(info.url).pathname === '/mock') return; } catch { /* ignore */ }
          console.log('[ProxyCollector] onRequest', info?.url);
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
        },
        onResponse: async (event: any) => {
          console.log('[ProxyCollector] onResponse requestId=', event.requestId, 'status=', event.statusCode);
          this._sendToClients({
            type: 'hh-response',
            requestId: event.requestId,
            statusCode: event.statusCode ?? 200,
            headers: event.headers ?? {},
          });
        },
      },
      (err: any) => { console.error('[ProxyCollector] hook error:', err); },
    );
  }
}
