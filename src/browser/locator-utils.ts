// Pure text / selector helper utilities — no browser globals, safe to import in Node.js tests.

export function textMatches(el: Element, text: string | RegExp, exact = false): boolean {
  const t = (el.textContent ?? '').trim();
  return text instanceof RegExp ? text.test(t) : exact ? t === text : t.includes(text);
}

export function resolveSelector(selector: string): string[] {
  return selector.split(',').map(s => s.trim());
}
