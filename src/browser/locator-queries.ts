import { Locator, ROLE_SELECTORS, FrameLocator } from './locator';
import { textMatches } from './locator-utils';

type GetDoc = () => Document | null;

function makeTextLocator(getDoc: GetDoc, text: string | RegExp, exact: boolean, desc: string): Locator {
  return new Locator(() => {
    const doc = getDoc();
    if (!doc) return [];
    const leafs = Array.from(doc.querySelectorAll('*')).filter(
      el => el.children.length === 0 && textMatches(el, text, exact)
    );
    if (leafs.length) return leafs;
    return Array.from(doc.querySelectorAll('*')).filter(el => textMatches(el, text, exact));
  }, desc);
}

function makeRoleLocator(getDoc: GetDoc, role: string, opts: { name?: string | RegExp; exact?: boolean } | undefined, desc: string): Locator {
  return new Locator(() => {
    const doc = getDoc();
    if (!doc) return [];
    const sel = ROLE_SELECTORS[role] ?? `[role="${role}"]`;
    let els = Array.from(doc.querySelectorAll(sel));
    if (opts?.name) {
      const name = opts.name;
      const exact = opts.exact ?? false;
      els = els.filter(el => {
        const labelledById = el.getAttribute('aria-labelledby');
        const labelled = labelledById ? doc.getElementById(labelledById) : null;
        const acc = (
          el.getAttribute('aria-label') ??
          labelled?.textContent ??
          (el.tagName === 'INPUT' ? el.getAttribute('value') : null) ??
          el.textContent ?? ''
        ).trim();
        return name instanceof RegExp ? name.test(acc) : exact ? acc === name : acc.includes(name);
      });
    }
    return els;
  }, desc);
}

function makeLabelLocator(getDoc: GetDoc, text: string | RegExp, exact: boolean, desc: string): Locator {
  return new Locator(() => {
    const doc = getDoc();
    if (!doc) return [];
    const results: Element[] = [];
    for (const label of Array.from(doc.querySelectorAll<HTMLLabelElement>('label'))) {
      if (!textMatches(label, text, exact)) continue;
      const target = label.htmlFor
        ? doc.getElementById(label.htmlFor)
        : label.querySelector('input,select,textarea');
      if (target && !results.includes(target)) results.push(target);
    }
    for (const el of Array.from(doc.querySelectorAll('[aria-label]'))) {
      const lbl = el.getAttribute('aria-label') ?? '';
      const ok = text instanceof RegExp ? text.test(lbl) : exact ? lbl === text : lbl.includes(text as string);
      if (ok && !results.includes(el)) results.push(el);
    }
    return results;
  }, desc);
}

export interface LocatorQueries {
  getByText(text: string | RegExp, opts?: { exact?: boolean }): Locator;
  getByRole(role: string, opts?: { name?: string | RegExp; exact?: boolean }): Locator;
  getByLabel(text: string | RegExp, opts?: { exact?: boolean }): Locator;
  getByPlaceholder(text: string | RegExp): Locator;
  getByTestId(id: string): Locator;
  getByAltText(text: string | RegExp): Locator;
  getByTitle(text: string | RegExp): Locator;
  frameLocator(selector: string): FrameLocator;
}

export function makeLocatorQueries(getDoc: GetDoc, prefix = ''): LocatorQueries {
  const p = prefix ? `${prefix} >> ` : '';

  return {
    getByText(text, opts) {
      const exact = opts?.exact ?? false;
      return makeTextLocator(getDoc, text, exact, `${p}text(${text instanceof RegExp ? text : `"${text}"`})`);
    },

    getByRole(role, opts) {
      const desc = opts?.name
        ? `${p}role=${role}[name="${opts.name}"]`
        : `${p}role=${role}`;
      return makeRoleLocator(getDoc, role, opts, desc);
    },

    getByLabel(text, opts) {
      const exact = opts?.exact ?? false;
      return makeLabelLocator(getDoc, text, exact, `${p}label(${text instanceof RegExp ? text : `"${text}"`})`);
    },

    getByPlaceholder(text) {
      const desc = `${p}placeholder(${text instanceof RegExp ? text : `"${text}"`})`;
      return new Locator(() => {
        const doc = getDoc();
        if (!doc) return [];
        return Array.from(doc.querySelectorAll('[placeholder]')).filter(el => {
          const v = el.getAttribute('placeholder') ?? '';
          return text instanceof RegExp ? text.test(v) : v.includes(text as string);
        });
      }, desc);
    },

    getByTestId(id) {
      const q = id.replace(/"/g, '\\"');
      return new Locator(() => {
        const doc = getDoc();
        if (!doc) return [];
        return Array.from(doc.querySelectorAll(`[data-testid="${q}"],[data-test="${q}"]`));
      }, `${p}[data-testid="${id}"]`);
    },

    getByAltText(text) {
      const desc = `${p}alt(${text instanceof RegExp ? text : `"${text}"`})`;
      return new Locator(() => {
        const doc = getDoc();
        if (!doc) return [];
        return Array.from(doc.querySelectorAll('[alt]')).filter(el => {
          const a = el.getAttribute('alt') ?? '';
          return text instanceof RegExp ? text.test(a) : a.includes(text as string);
        });
      }, desc);
    },

    getByTitle(text) {
      const desc = `${p}title(${text instanceof RegExp ? text : `"${text}"`})`;
      return new Locator(() => {
        const doc = getDoc();
        if (!doc) return [];
        return Array.from(doc.querySelectorAll('[title]')).filter(el => {
          const t = el.getAttribute('title') ?? '';
          return text instanceof RegExp ? text.test(t) : t.includes(text as string);
        });
      }, desc);
    },

    frameLocator(selector) {
      return new FrameLocator(selector, getDoc);
    },
  };
}
