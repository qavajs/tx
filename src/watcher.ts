/**
 * Watcher - Bundles test files on start and re-bundles on change.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TestServer } from './server';
import { bundleTestFile, parseTestFile } from './testRunner';

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

async function processFile(filePath: string, server: TestServer, baseDir?: string): Promise<void> {
  const basename = path.basename(filePath);
  const relPath = baseDir ? path.relative(baseDir, filePath).replace(/\\/g, '/') : undefined;
  try {
    const code = await bundleTestFile(filePath);
    const parsed = parseTestFile(filePath);
    parsed.relPath = relPath;
    server.updateFile(basename, code, parsed);
    console.log(`📦 Bundled: ${basename}`);
  } catch (err: any) {
    console.error(`❌ Bundle error [${basename}]: ${err.message}`);
  }
}

export async function startWatcher(
  testFiles: string[],
  patterns: string[],
  baseDir: string,
  server: TestServer,
): Promise<void> {
  if (testFiles.length === 0) return;

  // Bundle all files immediately on startup, await so callers can wait before opening browser
  await Promise.all(testFiles.map(f => processFile(f, server, baseDir)));
  console.log(`👀 Watching ${testFiles.length} test file(s) for changes...`);

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
          if (fs.existsSync(fullPath)) processFile(fullPath, server, baseDir);
        }, 300));
      });
    } catch (err: any) {
      console.warn(`⚠️  Cannot watch ${dir}: ${err.message}`);
    }
  }
}
