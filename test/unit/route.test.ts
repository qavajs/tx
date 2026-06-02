import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesRoutePattern,
  Route,
  dispatchRoute,
  routeHandlers,
  _setRouteOrigFetch,
} from '../../src/browser/route';

function makeReq(url: string, method = 'GET') {
  return {
    url:                 () => url,
    method:              () => method,
    headers:             () => ({} as Record<string, string>),
    postData:            () => null as any,
    isNavigationRequest: () => false,
    resourceType:        () => 'fetch',
  };
}

// ── matchesRoutePattern ───────────────────────────────────────────────────────

describe('matchesRoutePattern', () => {
  test('glob: ** matches across path segments', () => {
    assert.ok(matchesRoutePattern('**/api/users', 'https://example.com/api/users'));
    assert.ok(!matchesRoutePattern('**/api/users', 'https://example.com/api/posts'));
  });

  test('glob: * does not cross path segments', () => {
    assert.ok(matchesRoutePattern('https://example.com/*/data', 'https://example.com/v1/data'));
    assert.ok(!matchesRoutePattern('https://example.com/*/data', 'https://example.com/v1/v2/data'));
  });

  test('RegExp: tests against full URL', () => {
    assert.ok(matchesRoutePattern(/\/api\/\w+/, 'https://example.com/api/users'));
    assert.ok(!matchesRoutePattern(/\/api\/\w+/, 'https://example.com/other'));
  });

  test('function predicate: receives URL string', () => {
    assert.ok(matchesRoutePattern((url) => url.includes('api'), 'https://example.com/api'));
    assert.ok(!matchesRoutePattern((url) => url.includes('api'), 'https://example.com/other'));
  });
});

// ── Route ─────────────────────────────────────────────────────────────────────

describe('Route', () => {
  test('fulfill() produces a fulfill decision with the given Response', async () => {
    const route = new Route(makeReq('https://example.com'));
    await route.fulfill({ status: 201, json: { created: true } });
    const d = await route._getDecision();
    assert.equal(d.action, 'fulfill');
    assert.ok(d.response instanceof Response);
    assert.equal(d.response.status, 201);
    const body = await d.response.json();
    assert.deepEqual(body, { created: true });
  });

  test('fulfill() sets content-type: application/json for json option', async () => {
    const route = new Route(makeReq('https://example.com'));
    await route.fulfill({ json: { x: 1 } });
    const d = await route._getDecision();
    assert.equal(d.response!.headers.get('content-type'), 'application/json');
  });

  test('abort() produces an abort decision with errorCode', async () => {
    const route = new Route(makeReq('https://example.com'));
    await route.abort('blockedbyclient');
    const d = await route._getDecision();
    assert.equal(d.action, 'abort');
    assert.equal(d.errorCode, 'blockedbyclient');
  });

  test('abort() defaults errorCode to "failed"', async () => {
    const route = new Route(makeReq('https://example.com'));
    await route.abort();
    const d = await route._getDecision();
    assert.equal(d.errorCode, 'failed');
  });

  test('continue() produces a continue decision with override options', async () => {
    const route = new Route(makeReq('https://example.com'));
    await route.continue({ method: 'POST', headers: { 'x-test': '1' } });
    const d = await route._getDecision();
    assert.equal(d.action, 'continue');
    assert.deepEqual(d.continueOpts, { method: 'POST', headers: { 'x-test': '1' } });
  });

  test('first call wins; subsequent decide calls are ignored', async () => {
    const route = new Route(makeReq('https://example.com'));
    await route.abort('first');
    await route.fulfill({ status: 200 }); // should be ignored
    const d = await route._getDecision();
    assert.equal(d.action, 'abort');
    assert.equal(d.errorCode, 'first');
  });

  test('_isDecided() reflects whether a decision has been made', async () => {
    const route = new Route(makeReq('https://example.com'));
    assert.equal(route._isDecided(), false);
    await route.continue();
    assert.equal(route._isDecided(), true);
  });

  test('request() exposes the original request', () => {
    const req = makeReq('https://example.com/resource', 'POST');
    const route = new Route(req);
    assert.equal(route.request().url(), 'https://example.com/resource');
    assert.equal(route.request().method(), 'POST');
  });

  test('fetch() throws when no original fetch is stored', async () => {
    _setRouteOrigFetch(null as unknown as typeof fetch);
    const route = new Route(makeReq('https://example.com'));
    await assert.rejects(() => route.fetch(), /unavailable/);
  });

  test('fetch() calls the stored fetch with request URL and method', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    _setRouteOrigFetch(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = url as string;
      capturedInit = init;
      return new Response('{}', { status: 200 });
    });

    const route = new Route(makeReq('https://example.com/api'));
    await route.fetch();

    assert.equal(capturedUrl, 'https://example.com/api');
    assert.equal(capturedInit?.method, 'GET');

    _setRouteOrigFetch(null as unknown as typeof fetch);
  });

  test('fetch() allows URL and method override', async () => {
    let capturedUrl: string | undefined;
    let capturedMethod: string | undefined;
    _setRouteOrigFetch(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = url as string;
      capturedMethod = init?.method;
      return new Response('{}');
    });

    const route = new Route(makeReq('https://example.com/original'));
    await route.fetch({ url: 'https://example.com/override', method: 'POST' });

    assert.equal(capturedUrl, 'https://example.com/override');
    assert.equal(capturedMethod, 'POST');

    _setRouteOrigFetch(null as unknown as typeof fetch);
  });

  test('fetch() merges extra headers on top of original request headers', async () => {
    let capturedHeaders: Record<string, string> | undefined;
    _setRouteOrigFetch(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response('{}');
    });

    const reqWithHeaders = {
      url:                 () => 'https://example.com',
      method:              () => 'GET',
      headers:             () => ({ 'x-existing': 'yes' }),
      postData:            () => null as any,
      isNavigationRequest: () => false,
      resourceType:        () => 'fetch',
    };

    const route = new Route(reqWithHeaders);
    await route.fetch({ headers: { 'x-extra': 'added' } });

    assert.deepEqual(capturedHeaders, { 'x-existing': 'yes', 'x-extra': 'added' });

    _setRouteOrigFetch(null as unknown as typeof fetch);
  });
});

// ── dispatchRoute ─────────────────────────────────────────────────────────────

describe('dispatchRoute', () => {
  beforeEach(() => { routeHandlers.length = 0; });

  test('returns null when no handlers are registered', async () => {
    const result = await dispatchRoute('https://example.com/api', makeReq('https://example.com/api'));
    assert.equal(result, null);
  });

  test('returns null when no registered pattern matches', async () => {
    routeHandlers.push({
      pattern: '**/api/**',
      handler: async (route) => { await route.fulfill({ status: 200 }); },
    });
    const result = await dispatchRoute('https://example.com/other', makeReq('https://example.com/other'));
    assert.equal(result, null);
  });

  test('calls the handler whose pattern matches', async () => {
    let called = false;
    routeHandlers.push({
      pattern: '**/api/**',
      handler: async (route) => { called = true; await route.fulfill({ status: 200 }); },
    });
    await dispatchRoute('https://example.com/api/users', makeReq('https://example.com/api/users'));
    assert.ok(called);
  });

  test('last registered matching handler wins', async () => {
    const log: string[] = [];
    routeHandlers.push({ pattern: '**', handler: async (route) => { log.push('first'); await route.fulfill({ status: 200 }); } });
    routeHandlers.push({ pattern: '**', handler: async (route) => { log.push('last');  await route.fulfill({ status: 201 }); } });

    const result = await dispatchRoute('https://example.com/any', makeReq('https://example.com/any'));
    assert.deepEqual(log, ['last']);
    assert.equal(result?.action, 'fulfill');
    assert.equal(result?.response?.status, 201);
  });

  test('auto-calls continue() when handler makes no decision', async () => {
    routeHandlers.push({ pattern: '**', handler: async () => { /* no decision */ } });
    const result = await dispatchRoute('https://example.com', makeReq('https://example.com'));
    assert.equal(result?.action, 'continue');
  });
});
