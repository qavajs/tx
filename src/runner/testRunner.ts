import { actionTimeout, expectTimeout, testTimeout, getRetries } from '../browser/config';

import { type TestResult, runWithFixtures, buildTestQueue } from './executor';
import { page, closeExtraTabs, setTestAbort, startCollectingLogs, stopCollectingLogs, setLogContainer, clearSnapshots, getSnapshots, flushSnapshots } from '../browser/browser';
import type { SnapshotEntry } from '../browser/browser';
import { _clearSoftErrors, _flushSoftErrors } from '../browser/assertions';

export interface ExecuteTestsOptions {
  filterSuite?: string;
  filterTest?: string;
  filterTests?: string[];
  retries?: number;
  setCurrentTestInfo?: (info: unknown) => void;
  onTestEnd?: (result: TestResult) => void;
  isStopRequested?: () => boolean;
  setCancelFn?: (fn: ((err: Error) => void) | null) => void;
  onAttemptBegin?: (testName: string, attempt: number) => void;
  onAttemptError?: (message: string) => void;
  onAttemptFinally?: (testName: string, passed: boolean, attemptsLeft: number) => void;
  onBeforeTest?: () => Promise<void>;
  onAfterTest?: () => Promise<void>;
}

export async function executeTests(filePath: string, opts?: ExecuteTestsOptions): Promise<TestResult[]> {
  const queue = buildTestQueue(filePath, opts ?? {});

  if ('parseError' in queue) {
    return [{ name: '(parse/compile error)', passed: false, error: queue.parseError, duration: 0, logs: [] }];
  }

  const results: TestResult[] = [];
  const maxRetries = opts?.retries ?? getRetries();
  for (const t of queue) {
    if (opts?.isStopRequested?.()) break;
    await opts?.onBeforeTest?.();
    let attempt = 0;
    let lastError: any;
    let passed = false;
    let duration = 0;
    let finalLogs: ReturnType<typeof stopCollectingLogs> = [];
    let finalSnapshots: SnapshotEntry[] = [];
    while (attempt <= maxRetries && !passed && !opts?.isStopRequested?.()) {
      opts?.onAttemptBegin?.(t.name, attempt);
      const titlePath = t.name.split(' > ');
      const testInfo = {
        title: titlePath[titlePath.length - 1],
        titlePath,
        retry: attempt,
        tags: t.tags,
        timeout: testTimeout(),
        retries: maxRetries,
        actionTimeout: actionTimeout(),
        expectTimeout: expectTimeout(),
      };
      if (opts?.setCurrentTestInfo) {
        opts.setCurrentTestInfo(testInfo);
      }
      const t0 = Date.now();
      let _timeoutId: ReturnType<typeof setTimeout> | undefined;
      clearSnapshots();
      startCollectingLogs();
      _clearSoftErrors();
      let testError: unknown = undefined;
      try {
        await closeExtraTabs();
        await page.resetSession();
        for (const hook of t.setupBeforeAlls) await Promise.resolve(hook());
        for (const hook of t.beforeEachs) {
          await runWithFixtures(hook.fixtureDefs, hook.fn);
        }
        const runTestFn = t.expectsFixtures
          ? () => runWithFixtures(t.fixtureDefs, t.fn)
          : () => Promise.resolve(t.fn());
        const _testTimeout = testTimeout();
        const _stopPromise = new Promise<never>((_, reject) => {
          opts?.setCancelFn?.((err: Error) => { setTestAbort(err); reject(err); });
        });
        await Promise.race([
          runTestFn(),
          new Promise<never>((_, reject) => {
            _timeoutId = setTimeout(() => {
              const err = new Error(`Test timed out after ${_testTimeout}ms`);
              setTestAbort(err);
              reject(err);
            }, _testTimeout);
          }),
          _stopPromise,
        ]);
        _flushSoftErrors();
      } catch (e: unknown) {
        testError = e;
      }
      try {
        for (const hook of t.afterEachs) {
          await runWithFixtures(hook.fixtureDefs, hook.fn);
        }
        for (const hook of t.teardownAfterAlls) await Promise.resolve(hook());
      } catch (hookErr: unknown) {
        if (testError === undefined) testError = hookErr;
      }
      duration = Date.now() - t0;
      finalLogs = stopCollectingLogs();
      await flushSnapshots();
      finalSnapshots = getSnapshots();
      try {
        if (testError === undefined) {
          passed = true;
        } else {
          const e: any = testError;
          lastError = e;
          const errStr = e.stack || e.message || String(e);
          if (attempt < maxRetries && !opts?.isStopRequested?.()) {
            opts?.onAttemptError?.(`Attempt ${attempt + 1} failed — retrying…\n` + errStr);
          } else {
            opts?.onAttemptError?.(errStr);
          }
        }
      } finally {
        clearTimeout(_timeoutId);
        setTestAbort(null);
        opts?.setCancelFn?.(null);
        opts?.onAttemptFinally?.(t.name, passed, maxRetries - attempt);
        setLogContainer(null);
      }
      attempt++;
    }
    const snapshots = finalSnapshots.length > 0 ? finalSnapshots : undefined;
    if (passed) {
      const r: TestResult = { name: t.name, passed: true, duration, logs: finalLogs, retry: attempt - 1, snapshots };
      results.push(r);
      try { opts?.onTestEnd?.(r); } catch (e) { console.error('[tx] onTestEnd error:', e); }
    } else {
      const rawErr = lastError?.stack || lastError?.message || String(lastError);
      const r: TestResult = { name: t.name, passed: false, error: rawErr, duration, logs: finalLogs, retry: attempt - 1, snapshots };
      results.push(r);
      try { opts?.onTestEnd?.(r); } catch (e) { console.error('[tx] onTestEnd error:', e); }
    }
    await opts?.onAfterTest?.();
  }
  return results;
}
