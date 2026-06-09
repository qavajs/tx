import { Locator, FrameLocator } from './locator';
import type { AgentLocatorSpec } from '../ws-protocol';

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

function _arg(v: string | RegExp): string {
  return v instanceof RegExp ? String(v) : JSON.stringify(v);
}

export function makeLocatorQueries(prefix = ''): LocatorQueries {
  const p = prefix ? `${prefix}.` : '';

  return {
    getByText(text, opts) {
      const exact = opts?.exact ?? false;
      const optStr = opts?.exact ? ', { exact: true }' : '';
      const spec: AgentLocatorSpec = text instanceof RegExp
        ? { kind: 'textRe', source: text.source, flags: text.flags }
        : { kind: 'text', text, exact };
      return new Locator(spec, `${p}getByText(${_arg(text)}${optStr})`);
    },

    getByRole(role, opts) {
      const optStr = opts?.name ? `, { name: ${_arg(opts.name as string | RegExp)} }` : '';
      const spec: AgentLocatorSpec = { kind: 'role', role };
      const s = spec as any;
      if (opts?.name instanceof RegExp) {
        s.nameRe = opts.name.source; s.nameReFlags = opts.name.flags;
      } else if (opts?.name !== undefined) {
        s.name = opts.name;
      }
      if (opts?.exact !== undefined) s.nameExact = opts.exact;
      return new Locator(spec, `${p}getByRole('${role}'${optStr})`);
    },

    getByLabel(text, opts) {
      const exact = opts?.exact;
      const optStr = opts?.exact ? ', { exact: true }' : '';
      const spec: AgentLocatorSpec = text instanceof RegExp
        ? { kind: 'label', textRe: text.source, textReFlags: text.flags }
        : { kind: 'label', text, exact };
      return new Locator(spec, `${p}getByLabel(${_arg(text)}${optStr})`);
    },

    getByPlaceholder(text) {
      const spec: AgentLocatorSpec = text instanceof RegExp
        ? { kind: 'placeholder', textRe: text.source, textReFlags: text.flags }
        : { kind: 'placeholder', text };
      return new Locator(spec, `${p}getByPlaceholder(${_arg(text)})`);
    },

    getByTestId(id) {
      return new Locator({ kind: 'testid', id }, `${p}getByTestId('${id}')`);
    },

    getByAltText(text) {
      const spec: AgentLocatorSpec = text instanceof RegExp
        ? { kind: 'alt', textRe: text.source, textReFlags: text.flags }
        : { kind: 'alt', text };
      return new Locator(spec, `${p}getByAltText(${_arg(text)})`);
    },

    getByTitle(text) {
      const spec: AgentLocatorSpec = text instanceof RegExp
        ? { kind: 'title', textRe: text.source, textReFlags: text.flags }
        : { kind: 'title', text };
      return new Locator(spec, `${p}getByTitle(${_arg(text)})`);
    },

    frameLocator(selector) {
      return new FrameLocator(selector);
    },
  };
}
