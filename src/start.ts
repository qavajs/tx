/**
 * Tx - Test Script Entry Point
 */

import * as fs from 'fs';
import * as path from 'path';
import { TxWrapper } from './wrapper';
import { TxConfig, ReporterEntry } from './types';
import type { Reporter } from './reporter';
import { register as registerTsLoader } from './tsLoader';

registerTsLoader();

// ── Reporter loading ───────────────────────────────────────────────────────────

function loadReporter(entry: ReporterEntry, configDir: string): Reporter {
    const [filePath, config] = entry;
    const resolved = path.resolve(configDir, filePath);
    const mod = require(resolved) as Record<string, unknown>;
    const Ctor = (mod.default ?? Object.values(mod).find(v => typeof v === 'function')) as (new (cfg: Record<string, unknown>) => Reporter) | undefined;
    if (!Ctor) throw new Error(`No exported class found in reporter module: ${filePath}`);
    return new Ctor(config);
}

// ── CLI argument parsing ───────────────────────────────────────────────────────

function parseArgs(argv: string[]): { cliConfig: TxConfig; configFile?: string } {
    const args = argv.slice(2);
    const cliConfig: TxConfig = {};
    let configFile: string | undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        // --key=value form
        const eqMatch = arg.match(/^--([a-zA-Z0-9]+)=(.+)$/);
        if (eqMatch) {
            if (eqMatch[1] === 'config') {
                configFile = eqMatch[2];
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

    return { cliConfig, configFile };
}

function setConfigField(config: TxConfig, key: string, value: string): void {
    switch (key) {
        case 'proxyHost':
            config.proxyHost = value;
            break;
        case 'port1':
            config.port1 = parseInt(value, 10);
            break;
        case 'port2':
            config.port2 = parseInt(value, 10);
            break;
        case 'controlPanelPort':
        case 'port':
            config.controlPanelPort = parseInt(value, 10);
            break;
        case 'headless':
            config.headless = value === 'true' || value === '1';
            break;
        case 'test':
            config.testMode = value === 'true' || value === '1';
            break;
        default:
            console.warn(`Unknown CLI option: --${key}`);
    }
}

// ── Config file loading ────────────────────────────────────────────────────────

function loadConfigFile(filePath: string): Partial<TxConfig> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<TxConfig>;
    }
    if (ext === '.js') {
        return require(path.resolve(filePath)) as Partial<TxConfig>;
    }
    throw new Error(`Unsupported config file extension: ${ext} (use .json or .js)`);
}

function findDefaultConfigFile(): string | undefined {
    for (const name of ['tx.config.json', 'tx.config.js']) {
        const p = path.join(process.cwd(), name);
        if (fs.existsSync(p)) return p;
    }
    return undefined;
}

// ── Test file glob resolution ──────────────────────────────────────────────────

const SCAN_SKIP = new Set(['node_modules', 'dist', '.git', '.cache', 'coverage']);

function matchGlob(pattern: string, str: string): boolean {
    const re = new RegExp(
        '^' + pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars
            .replace(/\?/g, '[^/]')                // ? before ** expansion to avoid clobbering quantifiers
            .replace(/\*\*\//g, '(?:.+/)?')
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
        + '$'
    );
    return re.test(str);
}

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

function resolveTestFiles(config: TxConfig, configDir: string): string[] | undefined {
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

    if (config.testMatch) {
        const patterns = Array.isArray(config.testMatch)
            ? config.testMatch
            : [config.testMatch];
        for (const pattern of patterns) {
            addGlobMatches(pattern);
        }
    }

    return files.length > 0 ? files : undefined;
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
    const { cliConfig, configFile: explicitConfigFile } = parseArgs(process.argv);

    // Load config file (explicit or auto-detected)
    let fileConfig: Partial<TxConfig> = {};
    let configDir = process.cwd();
    const configPath = explicitConfigFile ?? findDefaultConfigFile();
    if (configPath) {
        try {
            fileConfig = loadConfigFile(configPath);
            configDir = path.dirname(path.resolve(configPath));
            console.log(`📋 Using config: ${configPath}`);
        } catch (err: any) {
            console.warn(`⚠️  Failed to load config file: ${err.message}`);
        }
    }

    // Merge: defaults < config file < CLI args
    const mergedConfig: TxConfig = {
        proxyHost:        cliConfig.proxyHost        ?? fileConfig.proxyHost        ?? 'localhost',
        port1:            cliConfig.port1            ?? fileConfig.port1            ?? 1337,
        port2:            cliConfig.port2            ?? fileConfig.port2            ?? 1338,
        controlPanelPort: cliConfig.controlPanelPort ?? fileConfig.controlPanelPort ?? 3000,
        headless:         cliConfig.headless         ?? fileConfig.headless         ?? (process.env.HEADLESS === 'true'),
        viewport:         fileConfig.viewport,
        testMode:         cliConfig.testMode         ?? fileConfig.testMode         ?? false,
    };

    // Resolve testFiles / testMatch into absolute paths
    const resolvedFiles = resolveTestFiles(
        { testFiles: fileConfig.testFiles, testMatch: fileConfig.testMatch },
        configDir
    );
    if (resolvedFiles) {
        console.log(`📂 Test files resolved: ${resolvedFiles.length} file(s)`);
    }

    const testPatterns = fileConfig.testMatch
        ? (Array.isArray(fileConfig.testMatch) ? fileConfig.testMatch : [fileConfig.testMatch])
        : [];

    const reporters: Reporter[] = (fileConfig.reporters ?? []).map(entry => loadReporter(entry, configDir));

    const wrapper = new TxWrapper({
        ...mergedConfig,
        testFiles: resolvedFiles,
        testPatterns,
        watchBaseDir: configDir,
        reporters,
        tasks: fileConfig.tasks,
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
