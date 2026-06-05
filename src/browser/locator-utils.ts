// Pure text / selector helper utilities — no browser globals, safe to import in Node.js tests.

export function textMatches(el: Element, text: string | RegExp, exact = false): boolean {
  const t = (el.textContent ?? '').trim();
  return text instanceof RegExp ? text.test(t) : exact ? t === text : t.includes(text);
}

export function resolveSelector(selector: string): string[] {
  return selector.split(',').map(s => s.trim());
}

export function isXPath(selector: string): boolean {
  const s = selector.trimStart();
  return s.startsWith('//') || s.startsWith('xpath=');
}

export function resolveXPath(selector: string): string {
  const s = selector.trimStart();
  return s.startsWith('xpath=') ? s.slice('xpath='.length) : s;
}

export function queryXPath(context: Document | Element, xpath: string): Element[] {
  const doc = context.nodeType === Node.DOCUMENT_NODE ? context as Document : context.ownerDocument!;
  const result = doc.evaluate(xpath, context, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  const out: Element[] = [];
  for (let i = 0; i < result.snapshotLength; i++) {
    const node = result.snapshotItem(i);
    if (node && node.nodeType === 1) out.push(node as Element);
  }
  return out;
}
