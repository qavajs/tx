
const _pageListeners = new Map<string, Set<(...args: any[]) => any>>();

const _permanentPageListeners = new Map<string, Set<(...args: any[]) => any>>();


export function _emitPage(event: string, ...args: any[]): void {
  for (const fn of _permanentPageListeners.get(event) ?? []) {
    try { fn(...args); } catch (e) { console.error(`page.on('${event}') handler error:`, e); }
  }
  for (const fn of _pageListeners.get(event) ?? []) {
    try { fn(...args); } catch (e) { console.error(`page.on('${event}') handler error:`, e); }
  }
}


export function _addPageListener(event: string, fn: (...args: any[]) => any): void {
  if (!_pageListeners.has(event)) _pageListeners.set(event, new Set());
  _pageListeners.get(event)!.add(fn);
}


export function _removePageListener(event: string, fn: (...args: any[]) => any): void {
  _pageListeners.get(event)?.delete(fn);
}


export function addPermanentPageListener(event: string, fn: (...args: any[]) => any): void {
  if (!_permanentPageListeners.has(event)) _permanentPageListeners.set(event, new Set());
  _permanentPageListeners.get(event)!.add(fn);
}

export function clearPageListeners(): void {
  _pageListeners.clear();
}
