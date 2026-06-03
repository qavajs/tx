/**
 * Tx - Test Script Entry Point
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { TxWrapper } from './core/wrapper';
import { TxConfig, ReporterEntry } from './types';
import { ReporterEmitter, type Reporter, type TestCase } from './runner/reporter';
import { parseTestFile } from './runner/runner';
import { register as registerTsLoader } from './core/tsLoader';
import { matchGlob } from './utils/glob';
import { DEFAULT_PROXY_PORT_1, DEFAULT_PROXY_PORT_2, DEFAULT_CONTROL_PANEL_PORT } from './constants';

registerTsLoader();

// ── defineConfig helper ────────────────────────────────────────────────────────

export function defineConfig(config: TxConfig): TxConfig {
  return config;
}

// ── Deep merge ────────────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge<T extends Record<string, unknown>>(base: T, overrides: Partial<T>): T {
  const result = { ...base } as T;
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const val = overrides[key];
    if (val === undefined) continue;
    const baseVal = result[key];
    if (isPlainObject(val) && isPlainObject(baseVal)) {
      result[key] = deepMerge(baseVal as Record<string, unknown>, val as Record<string, unknown>) as T[typeof key];
    } else {
      result[key] = val as T[typeof key];
    }
  }
  return result;
}

// ── Reporter loading ───────────────────────────────────────────────────────────

function loadReporter(entry: ReporterEntry, configDir: string): Reporter {
  const [filePath, config] = entry;
  const resolved = path.resolve(configDir, filePath);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(resolved) as Record<string, unknown>;
  const Ctor = (mod.default ?? Object.values(mod).find(v => typeof v === 'function')) as (new (cfg: Record<string, unknown>) => Reporter) | undefined;
  if (!Ctor) throw new Error(`No exported class found in reporter module: ${filePath}`);
  return new Ctor(config);
}

// ── CLI argument parsing ───────────────────────────────────────────────────────

function parseArgs(argv: string[]): { cliConfig: TxConfig; configFile?: string; profile?: string } {
  const args = argv.slice(2);
  const cliConfig: TxConfig = {};
  let configFile: string | undefined;
  let profile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // --key=value form
    const eqMatch = arg.match(/^--([a-zA-Z0-9]+)=(.+)$/);
    if (eqMatch) {
      if (eqMatch[1] === 'config') {
        configFile = eqMatch[2];
      } else if (eqMatch[1] === 'profile') {
        profile = eqMatch[2];
      } else {
        setConfigField(cliConfig, eqMatch[1], eqMatch[2]);
      }
      continue;
    }

    // --flag or --flag value
    const flagMatch = arg.match(/^--([a-zA-Z0-9]+)$/);
    if (flagMatch) {
      const next = args[i + 1];
      if (flagMatch[1] === 'config') {
        if (next && !next.startsWith('--')) { configFile = next; i++; }
      } else if (flagMatch[1] === 'profile') {
        if (next && !next.startsWith('--')) { profile = next; i++; }
      } else if (next && !next.startsWith('--')) {
        setConfigField(cliConfig, flagMatch[1], next);
        i++;
      } else {
        setConfigField(cliConfig, flagMatch[1], 'true');
      }
      continue;
    }

    if (!arg.startsWith('--')) {
      console.warn(`Unexpected positional argument ignored: ${arg}`);
    }
  }

  return { cliConfig, configFile, profile };
}

type FieldSetter = (config: TxConfig, value: string) => void;

const CONFIG_FIELDS: Record<string, FieldSetter> = {
  proxyHost:         (c, v) => { c.proxyHost = v; },
  port1:             (c, v) => { c.port1 = parseInt(v, 10); },
  port2:             (c, v) => { c.port2 = parseInt(v, 10); },
  controlPanelPort:  (c, v) => { c.controlPanelPort = parseInt(v, 10); },
  port:              (c, v) => { c.controlPanelPort = parseInt(v, 10); },
  headless:          (c, v) => { c.headless = v === 'true' || v === '1'; },
  test:              (c, v) => { c.testMode = v === 'true' || v === '1'; },
  grep:              (c, v) => { c.grep = v; },
  retries:           (c, v) => { c.retries = parseInt(v, 10); },
  browser:           (c, v) => { c.browser = v; },
  shard:             (c, v) => {
    const m = v.match(/^(\d+)\/(\d+)$/);
    if (!m) { console.warn(`Invalid --shard value: "${v}". Expected format: <current>/<total> (e.g. 1/3)`); return; }
    const current = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);
    if (total < 1 || current < 1 || current > total) { console.warn(`Invalid --shard value: "${v}". current must be ≥1 and ≤ total.`); return; }
    c.shard = { current, total };
  },
  workers:           (c, v) => { c.workers = parseInt(v, 10); },
};

function setConfigField(config: TxConfig, key: string, value: string): void {
  const setter = CONFIG_FIELDS[key];
  if (setter) { setter(config, value); } else { console.warn(`Unknown CLI option: --${key}`); }
}

// ── Config file loading ────────────────────────────────────────────────────────

async function loadConfigFile(filePath: string): Promise<Partial<TxConfig>> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<TxConfig>;
  }
  if (ext === '.ts') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(path.resolve(filePath)) as { default?: Partial<TxConfig> } & Partial<TxConfig>;
    return (mod.default ?? mod) as Partial<TxConfig>;
  }
  if (ext === '.js' || ext === '.mjs') {
    const mod = await import(pathToFileURL(path.resolve(filePath)).href) as { default?: Partial<TxConfig> } & Partial<TxConfig>;
    return (mod.default ?? mod) as Partial<TxConfig>;
  }
  throw new Error(`Unsupported config file extension: ${ext} (use .json, .js, .mjs, or .ts)`);
}

function findDefaultConfigFile(): string | undefined {
  for (const name of ['tx.config.json', 'tx.config.js', 'tx.config.mjs', 'tx.config.ts']) {
    const p = path.join(process.cwd(), name);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

// ── Regexp pattern helpers ─────────────────────────────────────────────────────

function parseRegexpString(s: string): RegExp | null {
  const m = s.match(/^\/(.+)\/([gimsuy]*)$/);
  if (m) return new RegExp(m[1], m[2]);
  return null;
}

// ── Test file glob resolution ──────────────────────────────────────────────────

const SCAN_SKIP = new Set(['node_modules', 'dist', '.git', '.cache', 'coverage']);

function scanDir(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SCAN_SKIP.has(entry.name)) continue;
        results.push(...scanDir(path.join(dir, entry.name)));
      } else {
        results.push(path.join(dir, entry.name));
      }
    }
  } catch { /* skip unreadable dirs */ }
  return results;
}

function isGlobPattern(s: string): boolean {
  return s.includes('*') || s.includes('?');
}

function resolveTestFiles(config: Pick<TxConfig, 'testFiles'>, configDir: string): string[] | undefined {
  const seen = new Set<string>();
  const files: string[] = [];

  const addGlobMatches = (pattern: string) => {
    const normalized = pattern.startsWith('./') ? pattern.slice(2) : pattern;
    const allFiles = scanDir(configDir);
    for (const f of allFiles) {
      const rel = path.relative(configDir, f).replace(/\\/g, '/');
      if (matchGlob(normalized, rel) && !seen.has(f)) {
        seen.add(f);
        files.push(f);
      }
    }
  };

  if (config.testFiles) {
    for (const f of config.testFiles) {
      if (isGlobPattern(f)) {
        addGlobMatches(f);
      } else {
        const abs = path.resolve(configDir, f);
        if (!seen.has(abs)) { seen.add(abs); files.push(abs); }
      }
    }
  }

  return files.length > 0 ? files : undefined;
}

// ── Parallel worker execution ──────────────────────────────────────────────────

type WrapperConfig = NonNullable<ConstructorParameters<typeof TxWrapper>[0]>;

async function runParallel(
  baseConfig: WrapperConfig,
  reporters: Reporter[],
  workers: number,
): Promise<{ passed: number; failed: number }> {
  const browserStr = (baseConfig.browser ?? '').toLowerCase();
  if (browserStr.includes('safari')) {
    throw new Error(
      'workers > 1 is not compatible with Safari — Safari reuses an existing window. ' +
      'Use Chrome, Firefox, or Edge for parallel test execution.',
    );
  }

  if (!baseConfig.headless) {
    console.warn('⚠️  workers > 1 requires headless mode. Forcing headless: true for all workers.');
  }

  const testFiles = baseConfig.testFiles ?? [];
  const N = Math.min(workers, testFiles.length);

  // Distribute files round-robin across workers
  const groups: string[][] = Array.from({ length: N }, () => []);
  testFiles.forEach((f, i) => groups[i % N].push(f));

  // Pre-parse all files to build the merged Suite for onBegin
  const allParsed = testFiles.map(f => parseTestFile(f));
  const allCases: TestCase[] = allParsed.flatMap(p =>
    p.tests.map(t => ({
      title: t.name,
      fullTitle: t.suite ? `${t.suite} > ${t.name}` : t.name,
      file: p.filename,
    }))
  );

  // Shared emitter — real-time test events stream in as workers complete tests
  const emitter = new ReporterEmitter();
  reporters.forEach(r => emitter.add(r));
  emitter.emitBegin({ testFiles }, { title: '', tests: allCases, allTests: () => allCases });

  const t0 = Date.now();
  const port1 = baseConfig.port1 ?? DEFAULT_PROXY_PORT_1;
  const port2 = baseConfig.port2 ?? DEFAULT_PROXY_PORT_2;
  const controlPanelPort = baseConfig.controlPanelPort ?? DEFAULT_CONTROL_PANEL_PORT;

  const wrappers = groups.map((files, i) => {
    const streamingReporter: Reporter = {
      onBegin:     () => {}, // coordinator already fired the merged begin
      onTestBegin: (test, result) => emitter.emitTestBegin(test, result),
      onTestEnd:   (test, result) => emitter.emitTestEnd(test, result),
      onEnd:       () => {}, // coordinator fires the merged end below
    };
    return new TxWrapper({
      ...baseConfig,
      headless:         true,
      testFiles:        files,
      port1:            port1 + i * 10,
      port2:            port2 + i * 10,
      controlPanelPort: controlPanelPort + i * 10,
      reporters:        [streamingReporter],
    });
  });

  const results = await Promise.all(
    wrappers.map(async w => {
      await w.start();
      const r = await w.waitForTests();
      await w.stop();
      return r;
    })
  );

  const passed = results.reduce((s, r) => s + r.passed, 0);
  const failed = results.reduce((s, r) => s + r.failed, 0);
  const total = passed + failed;
  emitter.emitEnd({ status: failed > 0 ? 'failed' : 'passed', passed, failed, total, duration: Date.now() - t0 });

  return { passed, failed };
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  const { cliConfig, configFile: explicitConfigFile, profile } = parseArgs(process.argv);

  // Load config file (explicit or auto-detected)
  let fileConfig: Partial<TxConfig> = {};
  let configDir = process.cwd();
  const configPath = explicitConfigFile ?? findDefaultConfigFile();
  if (configPath) {
    try {
      fileConfig = await loadConfigFile(configPath);
      configDir = path.dirname(path.resolve(configPath));
      console.log(`📋 Using config: ${configPath}`);
    } catch (err: any) {
      console.warn(`⚠️  Failed to load config file: ${err.message}`);
    }
  }

  // Apply profile overrides (profile < CLI args)
  if (profile) {
    const profileConfig = fileConfig.profiles?.[profile];
    if (!profileConfig) {
      const available = Object.keys(fileConfig.profiles ?? {});
      console.warn(`⚠️  Unknown profile: "${profile}".${available.length ? ` Available: ${available.join(', ')}` : ' No profiles defined.'}`);
    } else {
      console.log(`🔖 Using profile: ${profile}`);
      fileConfig = deepMerge(fileConfig as Record<string, unknown>, profileConfig as Record<string, unknown>) as Partial<TxConfig>;
    }
  }

  // Merge: defaults < config file < CLI args
  const mergedConfig: TxConfig = {
    proxyHost:        cliConfig.proxyHost ?? fileConfig.proxyHost ?? 'localhost',
    port1:            cliConfig.port1 ?? fileConfig.port1 ?? DEFAULT_PROXY_PORT_1,
    port2:            cliConfig.port2 ?? fileConfig.port2 ?? DEFAULT_PROXY_PORT_2,
    controlPanelPort: cliConfig.controlPanelPort ?? fileConfig.controlPanelPort ?? DEFAULT_CONTROL_PANEL_PORT,
    headless:         cliConfig.headless ?? fileConfig.headless ?? (process.env.HEADLESS === 'true'),
    browser:          cliConfig.browser ?? fileConfig.browser,
    viewport:         fileConfig.viewport,
    testMode:         cliConfig.testMode ?? fileConfig.testMode ?? false,
    snapshot:         fileConfig.snapshot ?? false,
    actionTimeout:    fileConfig.actionTimeout,
    expectTimeout:    fileConfig.expectTimeout,
    testTimeout:      fileConfig.testTimeout,
    retries:              cliConfig.retries ?? fileConfig.retries,
    workers:              cliConfig.workers ?? fileConfig.workers,
  };

  // Resolve testFiles into absolute paths
  let resolvedFiles = resolveTestFiles(
    { testFiles: fileConfig.testFiles },
    configDir
  );
  if (resolvedFiles) {
    console.log(`📂 Test files resolved: ${resolvedFiles.length} file(s)`);
  }

  // Apply sharding: partition resolved files and keep only the current shard's slice
  const shard = cliConfig.shard ?? fileConfig.shard;
  if (shard) {
    const { current, total } = shard;
    const files = resolvedFiles ?? [];
    const sliceSize = Math.ceil(files.length / total);
    const start = (current - 1) * sliceSize;
    resolvedFiles = files.slice(start, start + sliceSize);
    console.log(`🔀 Shard ${current}/${total}: running ${resolvedFiles.length} of ${files.length} file(s)`);
  }

  const normalizePattern = (p: string) => p.startsWith('./') ? p.slice(2) : p;
  const testPatterns = (fileConfig.testFiles ?? []).filter(isGlobPattern).map(normalizePattern);

  const grepRaw = fileConfig.grep ?? cliConfig.grep;
  const grep: RegExp | undefined = grepRaw
    ? (parseRegexpString(grepRaw) ?? new RegExp(grepRaw))
    : undefined;

  if (grep) {
    console.log(`🔍 Test name filter (grep): ${grep}`);
  }

  const reporters: Reporter[] = (fileConfig.reporters ?? []).map(entry => loadReporter(entry, configDir));

  const wrapperConfig: WrapperConfig = {
    ...mergedConfig,
    testFiles: resolvedFiles,
    testPatterns,
    watchBaseDir: configDir,
    reporters,
    tasks: fileConfig.tasks,
    preprocessor: fileConfig.preprocessor,
    grep,
  };

  const workers = mergedConfig.workers ?? 1;

  // Parallel test mode: spawn N independent workers each with their own browser
  if (mergedConfig.testMode && workers > 1 && resolvedFiles && resolvedFiles.length > 0) {
    console.log(`🧪 Test mode: running all specs…\n`);
    console.log(`⚡ Parallel mode: ${workers} worker(s) across ${resolvedFiles.length} file(s)`);
    try {
      const { passed, failed } = await runParallel(wrapperConfig, reporters, workers);
      console.log(`\n✅ ${passed} passed, ❌ ${failed} failed`);
      process.exit(failed > 0 ? 1 : 0);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
    return;
  }

  // Single-worker path (default, and for interactive mode)
  const wrapper = new TxWrapper(wrapperConfig);

  try {
    await wrapper.start();

    if (mergedConfig.testMode) {
      console.log('🧪 Test mode: running all specs…\n');
      const { passed, failed } = await wrapper.waitForTests();
      console.log(`\n✅ ${passed} passed, ❌ ${failed} failed`);
      await wrapper.stop();
      process.exit(failed > 0 ? 1 : 0);
    } else {
      console.log('🎯 Virtual browser is now running!');
      console.log('📍 Use the control panel to interact with the site');
      console.log('⌨️  Press Ctrl+C to stop\n');

      process.on('SIGINT', async () => {
        console.log('\n\n🛑 Shutting down...');
        await wrapper.stop();
        process.exit(0);
      });
    }
  } catch (error) {
    console.error('Error:', error);
    await wrapper.stop();
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
