/**
 * Watcher - Bundles test files on start and re-bundles on change.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TestServer } from './server';
import { parseTestCode, ParsedFile } from './testRunner';

function matchGlob(pattern: string, str: string): boolean {
  const re = new RegExp(
    '^' + pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\?/g, '[^/]')
      .replace(/\*\*\//g, '(?:.+/)?')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
    + '$'
  );
  return re.test(str);
}

async function bundleFile(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const esbuild = require('esbuild');
  const result = await esbuild.build({
    entryPoints: [filePath],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    write: false,
    logLevel: 'silent',
    // 'tx' is provided at runtime via window.tx — test files can import from it
    external: ['tx'],
  });
  return result.outputFiles[0].text;
}

async function processFile(filePath: string, server: TestServer): Promise<void> {
  const basename = path.basename(filePath);
  try {
    const code = await bundleFile(filePath);
    const parsed: ParsedFile = { filename: basename, tests: parseTestCode(code) };
    server.updateFile(basename, code, parsed);
    console.log(`📦 Bundled: ${basename}`);
  } catch (err: any) {
    console.error(`❌ Bundle error [${basename}]: ${err.message}`);
  }
}

export function startWatcher(
  testFiles: string[],
  patterns: string[],
  baseDir: string,
  server: TestServer,
): void {
  if (testFiles.length === 0) return;

  // Bundle all files immediately on startup
  Promise.all(testFiles.map(f => processFile(f, server)))
    .then(() => console.log(`👀 Watching ${testFiles.length} test file(s) for changes...`))
    .catch(() => {});

  // Resolve which directories to watch
  const watchDirs = new Set<string>();
  if (patterns.length > 0) {
    for (const pattern of patterns) {
      const staticParts: string[] = [];
      for (const part of pattern.split('/')) {
        if (part.includes('*') || part.includes('?')) break;
        staticParts.push(part);
      }
      watchDirs.add(path.resolve(baseDir, staticParts.length ? staticParts.join('/') : '.'));
    }
  } else {
    for (const f of testFiles) watchDirs.add(path.dirname(f));
  }

  const debounce = new Map<string, NodeJS.Timeout>();

  for (const dir of watchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      fs.watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename || !/\.(js|ts)$/.test(filename)) return;
        const fullPath = path.join(dir, filename);
        const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        const tracked = patterns.length > 0
          ? patterns.some(p => matchGlob(p, rel))
          : testFiles.includes(fullPath);
        if (!tracked) return;

        clearTimeout(debounce.get(fullPath));
        debounce.set(fullPath, setTimeout(() => {
          debounce.delete(fullPath);
          if (fs.existsSync(fullPath)) processFile(fullPath, server);
        }, 300));
      });
    } catch (err: any) {
      console.warn(`⚠️  Cannot watch ${dir}: ${err.message}`);
    }
  }
}
