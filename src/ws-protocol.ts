/**
 * Typed WebSocket message protocol between browser (controller) and Node.js server.
 * Discriminated unions on `type` allow exhaustive handling in both directions.
 */

import type { ParsedFile } from './runner/runner';
import type { LogEntry } from './runner/reporter';

// ── Browser → Server ──────────────────────────────────────────────────────────

export interface ReportTest {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
  logs?: LogEntry[];
}

export type BrowserMessage =
  | { type: 'run-begin'; specs: Array<{ file: string; tests: string[] | null }> }
  | { type: 'run-end'; passed: number; failed: number; total: number; duration: number }
  | { type: 'report'; filename: string; tests: ReportTest[] }
  | { type: 'task'; id: string; name: string; payload?: unknown }
  | { type: 'done'; passed: number; failed: number }
  | { type: 'artifact'; name: string; ext: string; data: string }
  | { type: 'save-download'; id: string; path: string; data: string }
  | { type: 'get-tests'; id: string }
  | { type: 'get-test-source'; id: string; file: string }
  | { type: 'get-cookie-jar'; id: string }
  | { type: 'set-cookie-jar'; id: string; jar: object }
  | { type: 'save-storage-state'; id: string; filePath: string; data: string }
  | { type: 'load-storage-state'; id: string; filePath: string };

// ── Server → Browser ──────────────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'version'; version: number }
  | { type: 'task-result'; id: string; result?: unknown; error?: string }
  | { type: 'tests'; id: string; data?: ParsedFile[]; error?: string }
  | { type: 'test-source'; id: string; data?: string; error?: string }
  | { type: 'cookie-jar'; id: string; jar?: object; error?: string }
  | { type: 'cookie-jar-set'; id: string; error?: string }
  | { type: 'storage-state-saved'; id: string; error?: string }
  | { type: 'storage-state-loaded'; id: string; data?: string; error?: string };

// Helper: narrow a BrowserMessage to the variant with a given type tag
export type Msg<T extends BrowserMessage['type']> = Extract<BrowserMessage, { type: T }>;
