// ── Route interception ────────────────────────────────────────────────────────

function _globToRegex(pattern: string): RegExp {
  const reStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x01')
    .replace(/\*/g, '[^/]*')
    .replace(/\x01/g, '.*');
  return new RegExp('^' + reStr + '$');
}

export function matchesRoutePattern(pattern: string | RegExp | ((url: string) => boolean), url: string): boolean {
  if (typeof pattern === 'function') return pattern(url);
  if (pattern instanceof RegExp) return pattern.test(url);
  try { return _globToRegex(pattern).test(url); } catch { return false; }
}

export interface RouteDecision {
  action: 'fulfill' | 'abort' | 'continue';
  response?: Response;
  errorCode?: string;
  continueOpts?: { url?: string; method?: string; headers?: Record<string, string>; postData?: BodyInit };
}

export class Route {
  private _decided = false;
  private _resolve!: (d: RouteDecision) => void;
  private _promise: Promise<RouteDecision>;

  constructor(
    private readonly _req: {
      url(): string; method(): string; headers(): Record<string, string>;
      postData(): any; isNavigationRequest(): boolean; resourceType(): string;
    }
  ) {
    this._promise = new Promise(r => { this._resolve = r; });
  }

  private _decide(d: RouteDecision): void {
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
  _getDecision(): Promise<RouteDecision> { return this._promise; }
  /** @internal */
  _isDecided(): boolean { return this._decided; }
}

export interface RouteHandlerEntry {
  pattern: string | RegExp | ((url: string) => boolean);
  handler: (route: Route, request: any) => void | Promise<void>;
}

export const routeHandlers: RouteHandlerEntry[] = [];

export async function dispatchRoute(
  url: string,
  req: { url(): string; method(): string; headers(): Record<string, string>; postData(): any; isNavigationRequest(): boolean; resourceType(): string }
): Promise<RouteDecision | null> {
  for (let i = routeHandlers.length - 1; i >= 0; i--) {
    if (matchesRoutePattern(routeHandlers[i].pattern, url)) {
      const route = new Route(req);
      try { await Promise.resolve(routeHandlers[i].handler(route, req)); } catch { /* ignore handler errors */ }
      if (!route._isDecided()) await route.continue();
      return route._getDecision();
    }
  }
  return null;
}
