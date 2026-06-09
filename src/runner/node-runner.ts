import * as path from 'path';
import { setRuntimeConfig } from '../browser/config';
import { setWsTransport, _dispatchWsMessage } from '../browser/ws';
import { page, browser, request, expect, log, attach, initNodeBrowserApi } from '../browser/browser';
import { node } from '../browser/browser';
import { executeTests } from './testRunner';
import { bundleTestFile } from './runner';
import { setNodeTxContext } from './testRegistrar';
import type { TestResult } from './executor';
import type { TestServer } from '../core/server';
import type { WindowConfig } from '../types';

export interface RunSpec {
  filterSuite?: string;
  filterTest?: string;
  filterTests?: string[];
}

export interface RunSummary {
  passed: number;
  failed: number;
  duration: number;
  stopped: boolean;
}

export interface RunnerReporterHooks {
  onBegin?(files: string[]): void;
  onTestBegin?(file: string, testName: string): void;
  onTestEnd?(file: string, result: TestResult): void;
  onEnd?(summary: RunSummary): void;
}

export class NodeTestRunner {
  constructor(
    private server: TestServer,
    private config: Partial<WindowConfig> & { port: number; proxyUrl: string },
  ) {}

  async run(
    files: string[],
    spec?: RunSpec,
    stopSignal?: { stop: boolean },
    reporterHooks?: RunnerReporterHooks,
  ): Promise<RunSummary> {
    // 1. Init Node transport so browser.ts wsRequest/wsSend route through the server
    setRuntimeConfig(this.config);
    initNodeBrowserApi(this.config.port, this.config.proxyUrl);
    setWsTransport({
      request: (type, payload) => {
        if (type === 'tb-command') {
          const { method, params } = payload as { method: string; params?: Record<string, unknown> };
          // sendCommand() expects { result, error } shape — wrap the raw result to match
          return this.server.execTbCommand(method, params).then(result => ({ result }));
        }
        if (type === 'task') {
          const { name, payload: taskPayload } = payload as { name: string; payload: unknown };
          return this.server.execTask(name, taskPayload)
            .then(result => ({ result: result ?? null }))
            .catch((err: any) => ({ error: err.message ?? String(err) }));
        }
        return Promise.reject(new Error(`wsRequest type '${type}' not supported in Node runner`));
      },
      send: () => { /* no-op — Node runner doesn't use wsSend */ },
    });

    // 2. Subscribe to agent events so page-events (load, navigate, etc.) are emitted
    const fakeWindow: Record<string, unknown> = {};
    const unsubscribe = this.server.onAgentEvent((event, payload) => {
      _dispatchWsMessage('tb-event', { type: 'tb-event', event, payload });
    });

    // Build the tx api object for test contexts
    const txApi = { page, expect, browser, node, request, log, attach };

    // Set Node.js fallback for testRegistrar's defaultFixtureDefs (avoids window.tx ReferenceError)
    setNodeTxContext(txApi, () => fakeWindow.__CURRENT_TEST_INFO__);

    let totalPass = 0;
    let totalFail = 0;
    let totalDuration = 0;
    let stopped = false;

    try {
      if (reporterHooks?.onBegin) {
        reporterHooks.onBegin(files);
      } else {
        this.server.pushToAllPanels({ type: 'runner-begin', files, tests: [] });
      }

      for (const fileKey of files) {
        if (stopSignal?.stop) { stopped = true; break; }

        // Resolve to absolute path
        const absPath = this._resolveFile(fileKey);
        if (!absPath) {
          console.error(`[NodeTestRunner] Could not resolve file: ${fileKey}`);
          continue;
        }

        // Bundle the test file
        let code: string;
        try {
          code = await bundleTestFile(absPath);
        } catch (e: any) {
          console.error(`[NodeTestRunner] Bundle error for ${fileKey}:`, e.message);
          const r: TestResult = { name: '(bundle error)', passed: false, error: e.message, duration: 0, logs: [] };
          this.server.pushToAllPanels({ type: 'runner-test-end', file: fileKey, result: r });
          totalFail++;
          continue;
        }

        // Build vm context
        fakeWindow.__CURRENT_TEST_INFO__ = undefined;
        fakeWindow.tx = txApi;
        const vmContext: Record<string, unknown> = {
          tx: txApi,
          page,
          expect,
          browser,
          node,
          request,
          log,
          attach,
          window: fakeWindow,
          console,
          setTimeout,
          clearTimeout,
          setInterval,
          clearInterval,
          Promise,
          Error,
          JSON,
          Math,
          Date,
          Array,
          Object,
          String,
          Number,
          Boolean,
          RegExp,
          Map,
          Set,
          Symbol,
          parseInt,
          parseFloat,
          isNaN,
          isFinite,
          encodeURIComponent,
          decodeURIComponent,
        };

        const fileResults: TestResult[] = await executeTests(code, {
          filterSuite: spec?.filterSuite,
          filterTest: spec?.filterTest,
          filterTests: spec?.filterTests,
          retries: this.config.retries,
          vmContext,
          setCurrentTestInfo: (info) => { fakeWindow.__CURRENT_TEST_INFO__ = info; },
          isStopRequested: () => stopSignal?.stop ?? false,
          onAttemptBegin: (testName, attempt) => {
            this.server.pushToAllPanels({ type: 'runner-test-begin', file: fileKey, testName, attempt });
            if (attempt === 0) reporterHooks?.onTestBegin?.(fileKey, testName);
          },
          onTestEnd: (result) => {
            this.server.pushToAllPanels({ type: 'runner-test-end', file: fileKey, result });
            reporterHooks?.onTestEnd?.(fileKey, result);
            if (result.passed) totalPass++;
            else totalFail++;
            totalDuration += result.duration;
          },
        });

        // Report parse/compile errors (these are returned but onTestEnd is not called for them)
        if (fileResults.length === 1 && fileResults[0].name === '(parse/compile error)') {
          const r = fileResults[0];
          this.server.pushToAllPanels({ type: 'runner-test-end', file: fileKey, result: r });
          totalFail++;
          totalDuration += r.duration;
        }

        if (stopSignal?.stop) { stopped = true; break; }
      }
    } finally {
      unsubscribe();
    }

    const summary: RunSummary = { passed: totalPass, failed: totalFail, duration: totalDuration, stopped };
    this.server.pushToAllPanels({ type: 'runner-end', passed: totalPass, failed: totalFail, duration: totalDuration, stopped });
    reporterHooks?.onEnd?.(summary);
    return summary;
  }

  private _resolveFile(fileKey: string): string | null {
    if (path.isAbsolute(fileKey)) return fileKey;
    return this.server.resolveTestFile(fileKey) ?? null;
  }
}
