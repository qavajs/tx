import * as esbuild from 'esbuild';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

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
  entryPoints: ['src/reporter.ts'],
  bundle: true,
  platform: 'node',
  packages: 'external',
  outfile: 'dist/reporter.js',
  sourcemap: true,
});

await esbuild.build({
  ...sharedOpts,
  entryPoints: ['test/ConsoleReporter.ts'],
  bundle: true,
  platform: 'node',
  packages: 'external',
  outfile: 'dist/ConsoleReporter.js',
  sourcemap: true,
});

await esbuild.build({
  ...sharedOpts,
  entryPoints: ['test/HtmlReporter.ts'],
  bundle: true,
  platform: 'node',
  packages: 'external',
  outfile: 'dist/HtmlReporter.js',
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

const testFiles = readdirSync('test/specs')
  .filter(f => /\.(js|ts)$/.test(f))
  .map(f => join('test/specs', f));

if (testFiles.length > 0) {
  await esbuild.build({
    ...sharedOpts,
    entryPoints: testFiles,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    outdir: 'dist/tests',
    minify: !watch,
  });
}

console.log('Build complete → dist/');
