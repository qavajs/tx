// Playwright-style expect() and all built-in matchers.
// Imports `page` and `iframeDoc` from browser.ts; the resulting circular
// dependency is safe because values are only accessed at call time, never
// during module initialization.

import { _awaitOrAbort, logCommand, page } from './browser';
import { Locator } from './locator';
import { expectTimeout } from './config';

// ── Soft assertion error accumulator ─────────────────────────────────────────

const _softErrors: Error[] = [];

export function _clearSoftErrors(): void { _softErrors.length = 0; }

export function _flushSoftErrors(): void {
  if (_softErrors.length === 0) return;
  const errs = _softErrors.splice(0);
  throw new Error(`${errs.length} soft assertion(s) failed:\n\n${errs.map((e, i) => `  ${i + 1}) ${e.message}`).join('\n\n')}`);
}

async function _retry(fn: () => Promise<void>, timeout?: number): Promise<void> {
  const _timeout = expectTimeout(timeout);
  const t0 = Date.now();
  let last: Error = new Error('Timeout');
  while (Date.now() - t0 < _timeout) {
    try { await fn(); return; } catch (e: unknown) { last = e instanceof Error ? e : new Error(String(e)); }
    await _awaitOrAbort(50);
  }
  throw last;
}

type CustomMatcherFn = (target: unknown, ...args: unknown[]) => { pass: boolean; message: string } | Promise<{ pass: boolean; message: string }>;


function _makeExpect(target: any, negated: boolean, localMatchers: Record<string, CustomMatcherFn>, soft = false): unknown {
  const t = (ms?: number) => expectTimeout(ms);
  const locDesc = (target instanceof Locator) ? (target as Locator)._desc : '';
  const pfx = negated ? 'not.' : '';
  const expectCall = soft ? 'expect.soft' : 'expect';
  const check = (passes: boolean, msg: string) => { if (negated ? passes : !passes) throw new Error(msg); };

  const tgt = target instanceof Locator
    ? locDesc
    : target === page ? 'page'
      : typeof target === 'function' ? 'fn'
        : (() => { try { const s = JSON.stringify(target); return s.length > 40 ? s.slice(0, 37) + '…' : s; } catch { return String(target).slice(0, 40); } })();

  const la = async (cmd: string, msg: string, fn: () => Promise<void>) => {
    const entry = logCommand(msg, cmd);
    try { await fn(); entry.success(); }
    catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (soft) { entry.warn(err.message); _softErrors.push(err); } else { entry.fail(err.message); throw e; }
    }
  };
  const ls = (cmd: string, msg: string, fn: () => void) => {
    const entry = logCommand(msg, cmd);
    try { fn(); entry.success(); }
    catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (soft) { entry.warn(err.message); _softErrors.push(err); } else { entry.fail(err.message); throw e; }
    }
  };

  const locAssert = (cmd: string, fn: (loc: Locator) => Promise<void>, timeout?: number, expected?: string) => {
    const expr = expected !== undefined
      ? `${expectCall}(${tgt}).${pfx}${cmd}(${expected})`
      : `${expectCall}(${tgt}).${pfx}${cmd}()`;
    return la(pfx + cmd, expr, async () => await _retry(() => fn(target as Locator), t(timeout)));
  };

  
  const assertions: Record<string, any> = {
    get not() { return _makeExpect(target, !negated, localMatchers, soft); },

    // ── Locator assertions (auto-retry) ────────────────────────────────────────

    async toBeVisible(opts?: { timeout?: number }) {
      await locAssert('toBeVisible', async l => {
        check(await l._isVisible(), `Expected element ${negated ? 'NOT ' : ''}to be visible`);
      }, opts?.timeout);
    },
    async toBeHidden(opts?: { timeout?: number }) {
      await locAssert('toBeHidden', async l => {
        check(!await l._isVisible(), `Expected element ${negated ? 'NOT ' : ''}to be hidden`);
      }, opts?.timeout);
    },
    async toBeEnabled(opts?: { timeout?: number }) {
      await locAssert('toBeEnabled', async l => {
        check(await l._isEnabled(), `Expected element ${negated ? 'NOT ' : ''}to be enabled`);
      }, opts?.timeout);
    },
    async toBeDisabled(opts?: { timeout?: number }) {
      await locAssert('toBeDisabled', async l => {
        check(!await l._isEnabled(), `Expected element ${negated ? 'NOT ' : ''}to be disabled`);
      }, opts?.timeout);
    },
    async toBeChecked(opts?: { timeout?: number }) {
      await locAssert('toBeChecked', async l => {
        check(await l._isChecked(), `Expected element ${negated ? 'NOT ' : ''}to be checked`);
      }, opts?.timeout);
    },
    async toBeEditable(opts?: { timeout?: number }) {
      await locAssert('toBeEditable', async l => {
        check(await l._isEditable(), `Expected element ${negated ? 'NOT ' : ''}to be editable`);
      }, opts?.timeout);
    },
    async toBeEmpty(opts?: { timeout?: number }) {
      await locAssert('toBeEmpty', async l => {
        const got = await l._inputValue();
        check(got === '', negated ? 'Expected input NOT to be empty' : `Expected empty input, got ${JSON.stringify(got)}`);
      }, opts?.timeout);
    },
    async toHaveText(text: string | RegExp, opts?: { exact?: boolean; timeout?: number }) {
      const exact = opts?.exact ?? false;
      await locAssert('toHaveText', async l => {
        const got = ((await l._textContent()) ?? '').trim();
        const matches = text instanceof RegExp ? text.test(got) : exact ? got === text : got.includes(text as string);
        check(matches, negated
          ? `Expected text NOT to match ${JSON.stringify(text)}, got ${JSON.stringify(got)}`
          : `Expected text to ${exact ? 'equal' : 'include'} ${JSON.stringify(text)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout, String(text instanceof RegExp ? text : JSON.stringify(text)));
    },
    async toContainText(text: string | RegExp, opts?: { timeout?: number }) {
      await locAssert('toContainText', async l => {
        const got = (await l._textContent()) ?? '';
        const matches = text instanceof RegExp ? text.test(got) : got.includes(text as string);
        check(matches, negated
          ? `Expected NOT to contain ${JSON.stringify(text)}, got ${JSON.stringify(got)}`
          : `Expected text to contain ${JSON.stringify(text)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout, String(text instanceof RegExp ? text : JSON.stringify(text)));
    },
    async toHaveValue(value: string | RegExp, opts?: { timeout?: number }) {
      await locAssert('toHaveValue', async l => {
        const got = await l._inputValue();
        const matches = value instanceof RegExp ? value.test(got) : got === value;
        check(matches, `Expected value ${negated ? 'NOT ' : ''}${JSON.stringify(value)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout, String(value instanceof RegExp ? value : JSON.stringify(value)));
    },
    async toHaveAttribute(name: string, value: string | RegExp = '', opts?: { timeout?: number }) {
      await locAssert('toHaveAttr', async l => {
        const got = await l._getAttribute(name);
        const matches = value instanceof RegExp ? value.test(got ?? '') : got === value;
        check(matches, `Expected [${name}]${negated ? ' NOT' : ''}=${JSON.stringify(value)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout, `[${name}]=${value instanceof RegExp ? value : JSON.stringify(value)}`);
    },
    async toHaveCount(count: number, opts?: { timeout?: number }) {
      await locAssert('toHaveCount', async l => {
        const got = await l._count();
        check(got === count, `Expected ${negated ? 'NOT ' : ''}${count} elements, got ${got}`);
      }, opts?.timeout, String(count));
    },
    async toHaveClass(cls: string | RegExp, opts?: { timeout?: number }) {
      await locAssert('toHaveClass', async l => {
        const got = (await l._getAttribute('class')) ?? '';
        const matches = cls instanceof RegExp ? cls.test(got) : got.split(/\s+/).includes(cls as string);
        check(matches, `Expected class ${negated ? 'NOT ' : ''}${JSON.stringify(cls)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout, String(cls instanceof RegExp ? cls : JSON.stringify(cls)));
    },
    async toHaveCSS(property: string, value: string | RegExp, opts?: { timeout?: number }) {
      await locAssert('toHaveCSS', async l => {
        const computed = ((await l._evaluate(
          `(el, prop) => window.getComputedStyle(el).getPropertyValue(prop)`,
          property,
        )) ?? '').trim();
        const matches = value instanceof RegExp ? value.test(computed) : computed === (value as string).trim();
        check(matches, `Expected CSS ${JSON.stringify(property)} ${negated ? 'NOT ' : ''}to be ${JSON.stringify(String(value))}, got ${JSON.stringify(computed)}`);
      }, opts?.timeout, String(value instanceof RegExp ? value : JSON.stringify(value)));
    },

    // ── Page-level assertions ──────────────────────────────────────────────────

    async toHaveURL(url: string | RegExp, opts?: { timeout?: number }) {
      await la(pfx + 'toHaveURL', `${expectCall}(page).${pfx}toHaveURL(${JSON.stringify(String(url))})`, async () => {
        await _retry(async () => {
          const u = page.url();
          const matches = url instanceof RegExp ? url.test(u) : u.includes(url as string);
          check(matches, `Expected URL ${negated ? 'NOT ' : ''}to match ${url}, got "${u}"`);
        }, t(opts?.timeout));
      });
    },
    async toHaveTitle(title: string | RegExp, opts?: { timeout?: number }) {
      await la(pfx + 'toHaveTitle', `${expectCall}(page).${pfx}toHaveTitle(${JSON.stringify(String(title))})`, async () => {
        await _retry(async () => {
          const got = await page.title();
          const matches = title instanceof RegExp ? title.test(got) : got === title;
          check(matches, `Expected title ${negated ? 'NOT ' : ''}${JSON.stringify(title)}, got "${got}"`);
        }, t(opts?.timeout));
      });
    },

    // ── Value assertions (sync) ────────────────────────────────────────────────

    
    toBe(expected: any) {
      ls(pfx + 'toBe', `${expectCall}(${tgt}).${pfx}toBe(${JSON.stringify(expected)})`, () => {
        check(target === expected, negated ? `Expected NOT ${JSON.stringify(expected)}` : `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(target)}`);
      });
    },
    
    toEqual(expected: any) {
      ls(pfx + 'toEqual', `${expectCall}(${tgt}).${pfx}toEqual(${JSON.stringify(expected)})`, () => {
        check(JSON.stringify(target) === JSON.stringify(expected), negated ? `Expected NOT equal ${JSON.stringify(expected)}` : `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(target)}`);
      });
    },
    toBeTruthy() {
      ls(pfx + 'toBeTruthy', `${expectCall}(${tgt}).${pfx}toBeTruthy()`, () => {
        check(!!target, negated ? `Expected falsy, got ${JSON.stringify(target)}` : `Expected truthy, got ${JSON.stringify(target)}`);
      });
    },
    toBeFalsy() {
      ls(pfx + 'toBeFalsy', `${expectCall}(${tgt}).${pfx}toBeFalsy()`, () => {
        check(!target, negated ? `Expected truthy, got ${JSON.stringify(target)}` : `Expected falsy, got ${JSON.stringify(target)}`);
      });
    },
    toBeNull() {
      ls(pfx + 'toBeNull', `${expectCall}(${tgt}).${pfx}toBeNull()`, () => {
        check(target === null, negated ? 'Expected NOT null' : `Expected null, got ${JSON.stringify(target)}`);
      });
    },
    toBeUndefined() {
      ls(pfx + 'toBeUndef', `${expectCall}(${tgt}).${pfx}toBeUndefined()`, () => {
        check(target === undefined, negated ? 'Expected NOT undefined' : `Expected undefined, got ${JSON.stringify(target)}`);
      });
    },
    toBeGreaterThan(n: number) {
      ls(pfx + 'toBeGt', `${expectCall}(${tgt}).${pfx}toBeGreaterThan(${n})`, () => {
        check(target > n, `${target} is ${negated ? '' : 'not '}> ${n}`);
      });
    },
    toBeLessThan(n: number) {
      ls(pfx + 'toBeLt', `${expectCall}(${tgt}).${pfx}toBeLessThan(${n})`, () => {
        check(target < n, `${target} is ${negated ? '' : 'not '}< ${n}`);
      });
    },
    
    toContain(item: any) {
      ls(pfx + 'toContain', `${expectCall}(${tgt}).${pfx}toContain(${JSON.stringify(item)})`, () => {
        const contains = Array.isArray(target) ? target.includes(item) : String(target).includes(String(item));
        check(contains, Array.isArray(target)
          ? `Expected array ${negated ? 'NOT ' : ''}to contain ${JSON.stringify(item)}`
          : `"${target}" ${negated ? 'contains' : 'does not contain'} "${item}"`);
      });
    },
    toMatch(r: RegExp | string) {
      ls(pfx + 'toMatch', `${expectCall}(${tgt}).${pfx}toMatch(${String(r)})`, () => {
        const re = typeof r === 'string' ? new RegExp(r) : r;
        check(re.test(String(target)), `"${target}" ${negated ? 'matches' : 'does not match'} ${re}`);
      });
    },
    async toPass(opts?: { timeout?: number }) {
      await la(pfx + 'toPass', `${expectCall}(${tgt}).${pfx}toPass()`, async () => {
        if (negated) {
          try { await Promise.resolve((target as () => unknown)()); }
          catch { return; }
          throw new Error('Expected callback to fail, but it passed');
        } else {
          await _retry(async () => { await Promise.resolve((target as () => unknown)()); }, t(opts?.timeout));
        }
      });
    },
  };

  for (const [name, matcherFn] of Object.entries(localMatchers)) {
    assertions[name] = async (...args: unknown[]) => {
      await la(pfx + name, name, async () => {
        const result = await Promise.resolve(matcherFn(target, ...args));
        if (negated ? result.pass : !result.pass) throw new Error(result.message);
      });
    };
  }

  return assertions;
}

function _buildExpect(localMatchers: Record<string, CustomMatcherFn>) {
  const fn = (target: any) => _makeExpect(target, false, localMatchers, false);
  fn.soft = (target: any) => _makeExpect(target, false, localMatchers, true);
  fn.extend = (matchers: Record<string, CustomMatcherFn>) => _buildExpect({ ...localMatchers, ...matchers });
  return fn;
}

export const expect = _buildExpect({});
