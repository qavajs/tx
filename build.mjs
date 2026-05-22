import * as esbuild from 'esbuild';
import * as fs from 'node:fs';

const watch = process.argv.includes('--watch');

if (!watch) {
  fs.rmSync('dist', { recursive: true, force: true });
  fs.mkdirSync('dist');
}

const sharedOpts = watch ? { watch: true } : {};

await esbuild.build({
  ...sharedOpts,
  entryPoints: ['src/start.ts'],
  bundle: true,
  platform: 'node',
  packages: 'external',   // keep node_modules external — no native-addon issues
  outfile: 'dist/index.js',
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
});

await esbuild.build({
  ...sharedOpts,
  entryPoints: ['src/reporter.ts'],
  bundle: true,
  platform: 'node',
  packages: 'external',
  outfile: 'dist/reporter.js',
  sourcemap: true,
});

await esbuild.build({
  ...sharedOpts,
  entryPoints: ['src/controller.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outfile: 'dist/controller.js',
  sourcemap: true,
});

console.log('Build complete → dist/');
