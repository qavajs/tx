/**
 * Tx - Test Script Entry Point
 */

import * as fs from 'fs';
import * as path from 'path';
import { TxWrapper } from './wrapper';
import { TxConfig, ReporterEntry } from './types';
import type { Reporter } from './reporter';
import { register as registerTsLoader } from './tsLoader';
import { matchGlob } from './glob';

registerTsLoader();

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
  if (ext === '.js' || ext === '.mjs') {
    const mod = await import(path.resolve(filePath)) as { default?: Partial<TxConfig> } & Partial<TxConfig>;
    return (mod.default ?? mod) as Partial<TxConfig>;
  }
  throw new Error(`Unsupported config file extension: ${ext} (use .json, .js, or .mjs)`);
}

function findDefaultConfigFile(): string | undefined {
  for (const name of ['tx.config.json', 'tx.config.js', 'tx.config.mjs']) {
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
  const files: string[] = [];

  const addGlobMatches = (pattern: string) => {
    // Strip leading ./ so matchGlob works against relative paths
    const normalized = pattern.startsWith('./') ? pattern.slice(2) : pattern;
    const allFiles = scanDir(configDir);
    for (const f of allFiles) {
      const rel = path.relative(configDir, f).replace(/\\/g, '/');
      if (matchGlob(normalized, rel) && !files.includes(f)) {
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
        if (!files.includes(abs)) files.push(abs);
      }
    }
  }

  return files.length > 0 ? files : undefined;
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
      fileConfig = { ...fileConfig, ...profileConfig };
    }
  }

  // Merge: defaults < config file < CLI args
  const mergedConfig: TxConfig = {
    proxyHost:        cliConfig.proxyHost ?? fileConfig.proxyHost ?? 'localhost',
    port1:            cliConfig.port1 ?? fileConfig.port1 ?? 11337,
    port2:            cliConfig.port2 ?? fileConfig.port2 ?? 11338,
    controlPanelPort: cliConfig.controlPanelPort ?? fileConfig.controlPanelPort ?? 11339,
    headless:         cliConfig.headless ?? fileConfig.headless ?? (process.env.HEADLESS === 'true'),
    browser:          cliConfig.browser ?? fileConfig.browser,
    viewport:         fileConfig.viewport,
    testMode:         cliConfig.testMode ?? fileConfig.testMode ?? false,
    snapshot:         fileConfig.snapshot ?? false,
    actionTimeout:    fileConfig.actionTimeout,
    expectTimeout:    fileConfig.expectTimeout,
    testTimeout:      fileConfig.testTimeout,
    retries:              cliConfig.retries ?? fileConfig.retries,
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

  const wrapper = new TxWrapper({
    ...mergedConfig,
    testFiles: resolvedFiles,
    testPatterns,
    watchBaseDir: configDir,
    reporters,
    tasks: fileConfig.tasks,
    grep,
  });

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

main().catch(console.error);
