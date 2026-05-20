import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

const sharedOpts = watch ? { watch: true } : {};

await esbuild.build({
  ...sharedOpts,
  entryPoints: ['src/start.ts'],
  bundle: true,
  platform: 'node',
  packages: 'external',   // keep node_modules external — no native-addon issues
  outfile: 'dist/index.js',
  sourcemap: true,
});

await esbuild.build({
  ...sharedOpts,
  entryPoints: ['src/panel.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outfile: 'dist/panel.js',
  minify: !watch,
});

// Package test files alongside the server bundle
mkdirSync('dist/examples', { recursive: true });
cpSync('examples', 'dist/examples', { recursive: true, force: true });

console.log('✅  Build complete → dist/');
