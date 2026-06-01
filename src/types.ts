/**
 * Type Definitions for Tx
 */

/** A reporter entry: [path-to-module, config-object] */
export type ReporterEntry = [path: string, config: Record<string, unknown>];

/** A task handler executed in the Node.js context */
export type TaskHandler = (payload: unknown) => unknown | Promise<unknown>;

/**
 * A preprocessor applied to raw spec file source before bundling/parsing.
 * Receives the raw TypeScript source and the absolute file path; returns
 * the (possibly transformed) source that esbuild will compile.
 */
export type Preprocessor = (source: string, filePath: string) => string;

export interface TxConfig {
  /** Reporter entries — each is a [modulePath, configObject] tuple. */
  reporters?: ReporterEntry[];

  /** Named task handlers executed in Node.js context, callable via node.task() */
  tasks?: Record<string, TaskHandler>;

  /**
   * Optional preprocessor applied to each spec file's raw TypeScript source
   * before it is bundled for the browser or parsed for test discovery.
   * Useful for code injection, import rewriting, or custom syntax transforms.
   */
  preprocessor?: Preprocessor;

  /**
   * Additional esbuild plugins applied when bundling spec files for the browser.
   * Use this to support non-standard file types imported by your tests, e.g.:
   *   const { vuePlugin } = require('@qavajs/tx');
   *   module.exports = { esbuildPlugins: [vuePlugin()] };
   */
  esbuildPlugins?: import('esbuild').Plugin[];
  /** Proxy hostname (default: localhost) */
  proxyHost?: string;

  /** Proxy port 1 (default: 11337) */
  port1?: number;

  /** Proxy port 2 (default: 11338) */
  port2?: number;

  /** Control panel port (default: 11339) */
  controlPanelPort?: number;

  /** Run in headless mode (default: false) */
  headless?: boolean;

  /** Explicit list of test file paths (relative to config file) */
  testFiles?: string[];

  /** Regexp string (e.g. "login" or "/should log in/i") to filter tests by name — display and run only matching tests */
  grep?: string;

  /** Iframe viewport dimensions */
  viewport?: { width: number; height: number };

  /** Run all tests automatically, then close — exit code 0 = all passed, 1 = any failed */
  testMode?: boolean;

  /** Capture DOM snapshots after each command (default: false) */
  snapshot?: boolean;

  /** Default timeout for actions like click(), fill(), locator waits in ms (default: 5000) */
  actionTimeout?: number;

  /** Default timeout for expect() assertion retry loop in ms (default: 5000) */
  expectTimeout?: number;

  /** Maximum time a single test function may run in ms (default: 30000) */
  testTimeout?: number;

  /** Number of times to retry a failing test before marking it failed (default: 0) */
  retries?: number;

  /**
   * Browser to open the control panel in.
   * Accepts a well-known name ("chrome", "chromium", "firefox", "edge", "safari")
   * or an absolute path to a browser executable.
   * When omitted the OS default browser is used.
   */
  browser?: string;

  /**
   * Named config profiles. Select one at runtime with --profile <name>.
   * Profile values are merged on top of the base config, before CLI args.
   */
  profiles?: Record<string, Omit<TxConfig, 'profiles'>>;

  /**
   * Shard this run — split test files into `total` equal buckets and run
   * only bucket number `current` (1-based).  Use with --shard <n>/<total>
   * on the CLI, e.g. `--shard 1/3` for the first of three parallel shards.
   */
  shard?: { current: number; total: number };

}

