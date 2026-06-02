import type { WindowConfig } from '../types';

declare global { interface Window { __CONFIG__: WindowConfig; } }

export const actionTimeout = (ms?: number) => ms ?? window.__CONFIG__?.actionTimeout ?? 5000;
export const waitTimeout = (ms?: number) => ms ?? window.__CONFIG__?.actionTimeout ?? 30000;
export const expectTimeout = (ms?: number) => ms ?? window.__CONFIG__?.expectTimeout ?? 5000;
export const testTimeout = () => window.__CONFIG__?.testTimeout ?? 30000;
