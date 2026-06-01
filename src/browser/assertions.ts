// Playwright-style expect() and all built-in matchers.
// Imports `page` and `iframeDoc` from browser.ts; the resulting circular
// dependency is safe because values are only accessed at call time, never
// during module initialization.

import { _awaitOrAbort, iframeDoc, logCommand, page } from './browser';
import { Locator } from './locator';

async function _retry(fn: () => Promise<void>, timeout?: number): Promise<void> {
  const _timeout = timeout ?? window.__CONFIG__?.expectTimeout ?? 5000;
  const t0 = Date.now();
  let last: Error = new Error('Timeout');
  while (Date.now() - t0 < _timeout) {
    try { await fn(); return; } catch (e: unknown) { last = e instanceof Error ? e : new Error(String(e)); }
    await _awaitOrAbort(50);
  }
  throw last;
}

type CustomMatcherFn = (target: unknown, ...args: unknown[]) => { pass: boolean; message: string } | Promise<{ pass: boolean; message: string }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _makeExpect(target: any, negated: boolean, localMatchers: Record<string, CustomMatcherFn>): unknown {
  const t = (ms?: number) => ms ?? window.__CONFIG__?.expectTimeout ?? 5000;
  const locDesc = (target instanceof Locator) ? (target as Locator)._desc : '';
  const pfx = negated ? 'not.' : '';

  const la = async (cmd: string, msg: string, fn: () => Promise<void>) => {
    const entry = logCommand(msg, cmd);
    try { await fn(); entry.success(); }
    catch (e: unknown) { entry.fail(e instanceof Error ? e.message : String(e)); throw e; }
  };
  const ls = (cmd: string, msg: string, fn: () => void) => {
    const entry = logCommand(msg, cmd);
    try { fn(); entry.success(); }
    catch (e: unknown) { entry.fail(e instanceof Error ? e.message : String(e)); throw e; }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locAssert = (cmd: string, fn: (loc: Locator) => Promise<void>, timeout?: number, expected?: string) =>
    la(pfx + cmd, expected !== undefined ? `${locDesc}  ${expected}` : locDesc, async () => await _retry(() => fn(target as Locator), t(timeout)));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assertions: Record<string, any> = {
    get not() { return _makeExpect(target, !negated, localMatchers); },

    // ── Locator assertions (auto-retry) ────────────────────────────────────────

    async toBeVisible(opts?: { timeout?: number }) {
      await locAssert('toBeVisible', async l => {
        if (negated ? l._checkVisibility() : !l._checkVisibility())
          throw new Error(`Expected element ${negated ? 'NOT ' : ''}to be visible`);
      }, opts?.timeout);
    },
    async toBeHidden(opts?: { timeout?: number }) {
      await locAssert('toBeHidden', async l => {
        if (negated ? !l._checkVisibility() : l._checkVisibility())
          throw new Error(`Expected element ${negated ? 'NOT ' : ''}to be hidden`);
      }, opts?.timeout);
    },
    async toBeEnabled(opts?: { timeout?: number }) {
      await locAssert('toBeEnabled', async l => {
        if (negated ? l._checkEnabled() : !l._checkEnabled())
          throw new Error(`Expected element ${negated ? 'NOT ' : ''}to be enabled`);
      }, opts?.timeout);
    },
    async toBeDisabled(opts?: { timeout?: number }) {
      await locAssert('toBeDisabled', async l => {
        if (negated ? !l._checkEnabled() : l._checkEnabled())
          throw new Error(`Expected element ${negated ? 'NOT ' : ''}to be disabled`);
      }, opts?.timeout);
    },
    async toBeChecked(opts?: { timeout?: number }) {
      await locAssert('toBeChecked', async l => {
        if (negated ? l._checkChecked() : !l._checkChecked())
          throw new Error(`Expected element ${negated ? 'NOT ' : ''}to be checked`);
      }, opts?.timeout);
    },
    async toBeEditable(opts?: { timeout?: number }) {
      await locAssert('toBeEditable', async l => {
        if (negated ? l._checkEditable() : !l._checkEditable())
          throw new Error(`Expected element ${negated ? 'NOT ' : ''}to be editable`);
      }, opts?.timeout);
    },
    async toBeEmpty(opts?: { timeout?: number }) {
      await locAssert('toBeEmpty', async l => {
        const got = l._inputValue();
        if (negated ? got === '' : got !== '')
          throw new Error(negated ? 'Expected input NOT to be empty' : `Expected empty input, got ${JSON.stringify(got)}`);
      }, opts?.timeout);
    },
    async toHaveText(text: string | RegExp, opts?: { exact?: boolean; timeout?: number }) {
      const exact = opts?.exact ?? false;
      await locAssert('toHaveText', async l => {
        const got = (l._textContent() ?? '').trim();
        const matches = text instanceof RegExp ? text.test(got) : exact ? got === text : got.includes(text as string);
        if (negated ? matches : !matches)
          throw new Error(negated
            ? `Expected text NOT to match ${JSON.stringify(text)}, got ${JSON.stringify(got)}`
            : `Expected text to ${exact ? 'equal' : 'include'} ${JSON.stringify(text)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout, String(text instanceof RegExp ? text : JSON.stringify(text)));
    },
    async toContainText(text: string | RegExp, opts?: { timeout?: number }) {
      await locAssert('toContainText', async l => {
        const got = l._textContent() ?? '';
        const matches = text instanceof RegExp ? text.test(got) : got.includes(text as string);
        if (negated ? matches : !matches)
          throw new Error(negated
            ? `Expected NOT to contain ${JSON.stringify(text)}, got ${JSON.stringify(got)}`
            : `Expected text to contain ${JSON.stringify(text)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout, String(text instanceof RegExp ? text : JSON.stringify(text)));
    },
    async toHaveValue(value: string | RegExp, opts?: { timeout?: number }) {
      await locAssert('toHaveValue', async l => {
        const got = l._inputValue();
        const matches = value instanceof RegExp ? value.test(got) : got === value;
        if (negated ? matches : !matches)
          throw new Error(`Expected value ${negated ? 'NOT ' : ''}${JSON.stringify(value)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout, String(value instanceof RegExp ? value : JSON.stringify(value)));
    },
    async toHaveAttribute(name: string, value: string | RegExp = '', opts?: { timeout?: number }) {
      await locAssert('toHaveAttr', async l => {
        const got = l._getAttribute(name);
        const matches = value instanceof RegExp ? value.test(got ?? '') : got === value;
        if (negated ? matches : !matches)
          throw new Error(`Expected [${name}]${negated ? ' NOT' : ''}=${JSON.stringify(value)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout, `[${name}]=${value instanceof RegExp ? value : JSON.stringify(value)}`);
    },
    async toHaveCount(count: number, opts?: { timeout?: number }) {
      await locAssert('toHaveCount', async l => {
        const got = l._els().length;
        if (negated ? got === count : got !== count)
          throw new Error(`Expected ${negated ? 'NOT ' : ''}${count} elements, got ${got}`);
      }, opts?.timeout, String(count));
    },
    async toHaveClass(cls: string | RegExp, opts?: { timeout?: number }) {
      await locAssert('toHaveClass', async l => {
        const got = l._el()?.className ?? '';
        const matches = cls instanceof RegExp ? cls.test(got) : got.split(/\s+/).includes(cls as string);
        if (negated ? matches : !matches)
          throw new Error(`Expected class ${negated ? 'NOT ' : ''}${JSON.stringify(cls)}, got ${JSON.stringify(got)}`);
      }, opts?.timeout, String(cls instanceof RegExp ? cls : JSON.stringify(cls)));
    },

    // ── Page-level assertions ──────────────────────────────────────────────────

    async toHaveURL(url: string | RegExp, opts?: { timeout?: number }) {
      await la(pfx + 'toHaveURL', String(url), async () => {
        await _retry(async () => {
          const u = page.url();
          const matches = url instanceof RegExp ? url.test(u) : u.includes(url as string);
          if (negated ? matches : !matches)
            throw new Error(`Expected URL ${negated ? 'NOT ' : ''}to match ${url}, got "${u}"`);
        }, t(opts?.timeout));
      });
    },
    async toHaveTitle(title: string | RegExp, opts?: { timeout?: number }) {
      await la(pfx + 'toHaveTitle', String(title), async () => {
        await _retry(async () => {
          const got = iframeDoc()?.title ?? '';
          const matches = title instanceof RegExp ? title.test(got) : got === title;
          if (negated ? matches : !matches)
            throw new Error(`Expected title ${negated ? 'NOT ' : ''}${JSON.stringify(title)}, got "${got}"`);
        }, t(opts?.timeout));
      });
    },

    // ── Value assertions (sync) ────────────────────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toBe(expected: any) {
      ls(pfx + 'toBe', JSON.stringify(expected), () => {
        if (negated ? target === expected : target !== expected)
          throw new Error(negated ? `Expected NOT ${JSON.stringify(expected)}` : `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(target)}`);
      });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toEqual(expected: any) {
      ls(pfx + 'toEqual', JSON.stringify(expected), () => {
        if (negated ? JSON.stringify(target) === JSON.stringify(expected) : JSON.stringify(target) !== JSON.stringify(expected))
          throw new Error(negated ? `Expected NOT equal ${JSON.stringify(expected)}` : `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(target)}`);
      });
    },
    toBeTruthy() {
      ls(pfx + 'toBeTruthy', JSON.stringify(target), () => {
        if (negated ? !!target : !target)
          throw new Error(negated ? `Expected falsy, got ${JSON.stringify(target)}` : `Expected truthy, got ${JSON.stringify(target)}`);
      });
    },
    toBeFalsy() {
      ls(pfx + 'toBeFalsy', JSON.stringify(target), () => {
        if (negated ? !target : !!target)
          throw new Error(negated ? `Expected truthy, got ${JSON.stringify(target)}` : `Expected falsy, got ${JSON.stringify(target)}`);
      });
    },
    toBeNull() {
      ls(pfx + 'toBeNull', JSON.stringify(target), () => {
        if (negated ? target === null : target !== null)
          throw new Error(negated ? 'Expected NOT null' : `Expected null, got ${JSON.stringify(target)}`);
      });
    },
    toBeUndefined() {
      ls(pfx + 'toBeUndef', JSON.stringify(target), () => {
        if (negated ? target === undefined : target !== undefined)
          throw new Error(negated ? 'Expected NOT undefined' : `Expected undefined, got ${JSON.stringify(target)}`);
      });
    },
    toBeGreaterThan(n: number) {
      ls(pfx + 'toBeGt', String(n), () => {
        if (negated ? target > n : target <= n)
          throw new Error(`${target} is ${negated ? '' : 'not '}> ${n}`);
      });
    },
    toBeLessThan(n: number) {
      ls(pfx + 'toBeLt', String(n), () => {
        if (negated ? target < n : target >= n)
          throw new Error(`${target} is ${negated ? '' : 'not '}< ${n}`);
      });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toContain(item: any) {
      ls(pfx + 'toContain', JSON.stringify(item), () => {
        const contains = Array.isArray(target) ? target.includes(item) : String(target).includes(String(item));
        if (negated ? contains : !contains)
          throw new Error(Array.isArray(target)
            ? `Expected array ${negated ? 'NOT ' : ''}to contain ${JSON.stringify(item)}`
            : `"${target}" ${negated ? 'contains' : 'does not contain'} "${item}"`);
      });
    },
    toMatch(r: RegExp | string) {
      ls(pfx + 'toMatch', String(r), () => {
        const re = typeof r === 'string' ? new RegExp(r) : r;
        if (negated ? re.test(String(target)) : !re.test(String(target)))
          throw new Error(`"${target}" ${negated ? 'matches' : 'does not match'} ${re}`);
      });
    },
    async toPass(opts?: { timeout?: number }) {
      await la(pfx + 'toPass', '', async () => {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (target: any) => _makeExpect(target, false, localMatchers);
  fn.extend = (matchers: Record<string, CustomMatcherFn>) => _buildExpect({ ...localMatchers, ...matchers });
  return fn;
}

export const expect = _buildExpect({});
