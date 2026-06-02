let _testAbortError: Error | null = null;
export const _abortListeners = new Set<(err: Error) => void>();

export function getAbortError(): Error | null { return _testAbortError; }

export function setTestAbort(err: Error | null): void {
  _testAbortError = err;
  const fns = [..._abortListeners];
  _abortListeners.clear();
  if (err) for (const fn of fns) fn(err);
}

export function _awaitOrAbort(ms: number): Promise<void> {
  if (_testAbortError) return Promise.reject(_testAbortError);
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const abortFn = (err: Error) => { if (!settled) { settled = true; clearTimeout(id); reject(err); } };
    _abortListeners.add(abortFn);
    const id = setTimeout(() => {
      if (!settled) {
        settled = true;
        _abortListeners.delete(abortFn);
        resolve();
      }
    }, ms);
  });
}
