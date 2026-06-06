import { executeTests } from '../runner/testRunner';
import { wsRequest } from '../browser/browser';
import type { TestResult } from '../runner/executor';

export type { TestResult };

export interface RunCallbacks {
  isStopRequested: () => boolean;
  setCancelFn: (fn: ((err: Error) => void) | null) => void;
  onAttemptBegin?: (testName: string, attempt: number) => void;
  onAttemptError?: (message: string) => void;
  onAttemptFinally?: (testName: string, passed: boolean, attemptsLeft: number) => void;
  onTestEnd: (result: TestResult) => void;
}

export interface RunSpec {
  filterSuite?: string;
  filterTest?: string;
  filterTests?: string[];
}

export async function fetchAndRun(
  filename: string,
  spec: RunSpec | null,
  callbacks: RunCallbacks,
): Promise<TestResult[]> {
  const msg = await wsRequest<{ data?: string; error?: string }>('get-test-source', { file: filename });
  if (msg.error || !msg.data) throw new Error(msg.error ?? 'Failed to load test source');
  return executeTests(msg.data, {
    filterSuite: spec?.filterSuite,
    filterTest: spec?.filterTest,
    filterTests: spec?.filterTests,
    isStopRequested: callbacks.isStopRequested,
    setCancelFn: callbacks.setCancelFn,
    onAttemptBegin: callbacks.onAttemptBegin,
    onAttemptError: callbacks.onAttemptError,
    onAttemptFinally: callbacks.onAttemptFinally,
    onTestEnd: callbacks.onTestEnd,
  });
}
