import type { WindowConfig } from '../types';

declare global { interface Window { __CONFIG__: WindowConfig; } }

let _runtimeConfig: Partial<WindowConfig> | null = null;

export function setRuntimeConfig(cfg: Partial<WindowConfig>): void {
  _runtimeConfig = cfg;
}

function _cfg(): Partial<WindowConfig> {
  if (_runtimeConfig) return _runtimeConfig;
  return (typeof window !== 'undefined' ? window.__CONFIG__ : undefined) ?? {};
}

export const actionTimeout = (ms?: number) => ms ?? _cfg().actionTimeout ?? 5000;
export const waitTimeout = (ms?: number) => ms ?? _cfg().actionTimeout ?? 30000;
export const expectTimeout = (ms?: number) => ms ?? _cfg().expectTimeout ?? 5000;
export const testTimeout = () => _cfg().testTimeout ?? 30000;
export const getRetries = () => _cfg().retries ?? 0;
export const getSnapshot = () => _cfg().snapshot ?? true;
