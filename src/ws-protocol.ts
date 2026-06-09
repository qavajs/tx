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
  retry?: number;
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
  | { type: 'load-storage-state'; id: string; filePath: string }
  | { type: 'restart-agent' };

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

// ── Test Browser Protocol ──────────────────────────────────────────────────────

/** First message from any new WS client to declare its role */
export interface HelloMessage {
  type: 'hello';
  role: 'panel' | 'test-browser';
}

/** All DOM command methods the agent can handle */
export type TbCommandMethod =
  | 'navigate' | 'reload' | 'evaluate' | 'querySelector' | 'querySelectorAll'
  | 'click' | 'dblclick' | 'rightClick' | 'fill' | 'type' | 'select' | 'check'
  | 'uncheck' | 'hover' | 'focus' | 'blur' | 'press' | 'scrollIntoView'
  | 'waitForSelector' | 'waitForFunction' | 'waitForActionable'
  | 'getHTML' | 'screenshot' | 'snapshot' | 'title' | 'url' | 'ariaSnapshot'
  | 'dialog-response' | 'route-register' | 'route-decision' | 'route-fetch'
  | 'addInitScript' | 'clearInitScripts' | 'resetSession'
  | 'getLocalStorage' | 'setLocalStorage' | 'clearStorage'
  | 'newTab' | 'closeTab' | 'switchTab' | 'getTabsSnapshot'
  | 'boundingBox' | 'getAttribute' | 'innerText' | 'inputValue' | 'textContent'
  | 'isVisible' | 'isEnabled' | 'isChecked' | 'isEditable' | 'count'
  | 'locatorEvaluate' | 'setInputFiles' | 'selectOption'
  | 'mouseMove' | 'mouseDown' | 'mouseUp' | 'mouseClick' | 'mouseDblclick' | 'mouseWheel'
  | 'keyboardDown' | 'keyboardUp' | 'keyboardPress' | 'keyboardType' | 'keyboardInsertText'
  | 'setViewportSize' | 'waitForNavigation';

/** Event names the agent can emit */
export type TbEventName =
  | 'load' | 'domcontentloaded' | 'framenavigated' | 'console' | 'pageerror'
  | 'dialog' | 'request' | 'response' | 'requestfailed' | 'requestfinished'
  | 'request-intercepted' | 'popup' | 'download' | 'websocket' | 'worker'
  | 'tab-created' | 'tab-closed' | 'tab-switched'
  | 'crash' | 'filechooser' | 'frameattached' | 'framedetached' | 'close';

/** Panel → Server → Agent (correlated) */
export interface TbCommand {
  type: 'tb-command';
  id: string;
  method: TbCommandMethod;
  params?: unknown;
}

/** Agent → Server → Panel (correlated response) */
export interface TbResult {
  type: 'tb-result';
  id: string;
  result?: unknown;
  error?: string;
}

/** Agent → Server → Panel (async events, fan-out to all panels) */
export interface TbEvent {
  type: 'tb-event';
  event: TbEventName;
  payload: unknown;
}

// ── Serializable Locator Specification ────────────────────────────────────────
// Describes how to find elements in the agent's iframe DOM.

export type AgentLocatorSpec =
  | { kind: 'css'; selector: string }
  | { kind: 'xpath'; xpath: string }
  | { kind: 'text'; text: string; exact: boolean }
  | { kind: 'textRe'; source: string; flags: string }
  | { kind: 'role'; role: string; name?: string; nameRe?: string; nameReFlags?: string; nameExact?: boolean }
  | { kind: 'label'; text?: string; textRe?: string; textReFlags?: string; exact?: boolean }
  | { kind: 'placeholder'; text?: string; textRe?: string; textReFlags?: string }
  | { kind: 'testid'; id: string }
  | { kind: 'alt'; text?: string; textRe?: string; textReFlags?: string }
  | { kind: 'title'; text?: string; textRe?: string; textReFlags?: string }
  | { kind: 'nth'; parent: AgentLocatorSpec; n: number }
  | { kind: 'first'; parent: AgentLocatorSpec }
  | { kind: 'last'; parent: AgentLocatorSpec }
  | { kind: 'chain'; parent: AgentLocatorSpec; child: AgentLocatorSpec }
  | { kind: 'filter'; parent: AgentLocatorSpec; hasText?: string; hasTextRe?: string; hasTextReFlags?: string; hasNotText?: string; hasNotTextRe?: string; hasNotTextReFlags?: string; visible?: boolean };
