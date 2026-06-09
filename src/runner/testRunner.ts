import { SourceMapConsumer } from 'source-map-js';
import { actionTimeout, expectTimeout, testTimeout, getRetries } from '../browser/config';

import { type TestResult, runWithFixtures, buildTestQueue } from './executor';
import { page, closeExtraTabs, setTestAbort, startCollectingLogs, stopCollectingLogs, setLogContainer } from '../browser/browser';
import { _clearSoftErrors, _flushSoftErrors } from '../browser/assertions';

function makeRemapper(code: string): ((s: string) => string) | null {
  const m = code.match(/\/\/# sourceMappingURL=data:application\/json[^,]*,([^\s]+)/);
  if (!m) return null;
  try {
    const consumer = new SourceMapConsumer(JSON.parse(atob(m[1])));
    return (stack: string) => {
      const kept: string[] = [];
      for (const line of stack.split('\n')) {
        if (!/^\s+at\s/.test(line)) { kept.push(line); continue; }
        const anon = /<anonymous>:(\d+):(\d+)/.exec(line);
        if (!anon) continue;
        const ln = +anon[1] - 2; // Function() wrapper prepends 2 lines before the body
        const col = +anon[2];
        const pos = consumer.originalPositionFor({ line: ln, column: col - 1 });
        if (pos.source == null || pos.line == null) continue;
        const loc = `${pos.source}:${pos.line}:${(pos.column ?? 0) + 1}`;
        const fn = /at\s+([\w$.<>[\] ]+?)\s+\(/.exec(line)?.[1];
        kept.push(fn && fn !== 'eval' && !/^eval /.test(fn) ? `    at ${fn} (${loc})` : `    at ${loc}`);
      }
      return kept.join('\n');
    };
  } catch (err) {
    console.error('[tx] source map init failed:', err);
    return null;
  }
}

export interface ExecuteTestsOptions {
  filterSuite?: string;
  filterTest?: string;
  filterTests?: string[];
  filename?: string;
  retries?: number;
  vmContext?: Record<string, unknown>;
  setCurrentTestInfo?: (info: unknown) => void;
  onTestEnd?: (result: TestResult) => void;
  isStopRequested?: () => boolean;
  setCancelFn?: (fn: ((err: Error) => void) | null) => void;
  onAttemptBegin?: (testName: string, attempt: number) => void;
  onAttemptError?: (message: string) => void;
  onAttemptFinally?: (testName: string, passed: boolean, attemptsLeft: number) => void;
}

export async function executeTests(code: string, opts?: ExecuteTestsOptions): Promise<TestResult[]> {
  const remap = makeRemapper(code);
  const vmContext = opts?.vmContext ?? {};
  const queue = buildTestQueue(code, opts ?? {}, vmContext);

  if ('parseError' in queue) {
    const err = remap ? remap(queue.parseError) : queue.parseError;
    return [{ name: '(parse/compile error)', passed: false, error: err, duration: 0, logs: [] }];
  }

  const results: TestResult[] = [];
  const maxRetries = opts?.retries ?? getRetries();
  for (const t of queue) {
    if (opts?.isStopRequested?.()) break;
    let attempt = 0;
    let lastError: any;
    let passed = false;
    let duration = 0;
    let finalLogs: ReturnType<typeof stopCollectingLogs> = [];
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
      startCollectingLogs();
      _clearSoftErrors();
      let testError: unknown = undefined;
      try {
        closeExtraTabs();
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
      try {
        if (testError === undefined) {
          passed = true;
        } else {
          const e: any = testError;
          lastError = e;
          const errStr = e.stack || e.message || String(e);
          const remapped = remap ? remap(errStr) : errStr;
          if (attempt < maxRetries && !opts?.isStopRequested?.()) {
            opts?.onAttemptError?.(`Attempt ${attempt + 1} failed — retrying…\n` + remapped);
          } else {
            opts?.onAttemptError?.(remapped);
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
    if (passed) {
      const r: TestResult = { name: t.name, passed: true, duration, logs: finalLogs, retry: attempt - 1 };
      results.push(r);
      opts?.onTestEnd?.(r);
    } else {
      const rawErr = lastError?.stack || lastError?.message || String(lastError);
      const r: TestResult = { name: t.name, passed: false, error: remap ? remap(rawErr) : rawErr, duration, logs: finalLogs, retry: attempt - 1 };
      results.push(r);
      opts?.onTestEnd?.(r);
    }
  }
  return results;
}
