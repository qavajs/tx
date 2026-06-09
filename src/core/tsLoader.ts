/**
 * Runtime TypeScript loader — registers a Node require hook so .ts files
 * can be require()'d directly without a prior build step.
 */

import Module from 'node:module';
import fs from 'node:fs';

export function register(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const esbuild = require('esbuild') as typeof import('esbuild');

  (Module as any)._extensions['.ts'] = (mod: any, filename: string) => {
    const source = fs.readFileSync(filename, 'utf-8');
    const { code } = esbuild.transformSync(source, {
      loader: 'ts',
      target: 'node18',
      format: 'cjs',
      sourcefile: filename,
      sourcemap: 'inline',
    });
    mod._compile(code, filename);
  };

  const textHandler = (mod: any, filename: string) => {
    mod.exports = fs.readFileSync(filename, 'utf-8');
  };
  (Module as any)._extensions['.css'] = textHandler;
  (Module as any)._extensions['.html'] = textHandler;

  // .iife.js files have extension .js so patch the .js handler to intercept them
  const originalJsExt = (Module as any)._extensions['.js'];
  (Module as any)._extensions['.js'] = (mod: any, filename: string) => {
    if (filename.endsWith('.iife.js')) {
      mod.exports = fs.readFileSync(filename, 'utf-8');
      return;
    }
    originalJsExt(mod, filename);
  };

  // Redirect '@qavajs/tx' → this bundle (__filename). The bundle already exports all
  // tx entities (page, test, describe, …) and is in require.cache from the moment it
  // starts, so test files that call require('@qavajs/tx') get the live bundle exports
  // with no extra cache injection or file-system lookup needed.
  if (!((Module as any)._resolveFilename as any).__txPatched) {
    const origResolve = (Module as any)._resolveFilename;
    (Module as any)._resolveFilename = function(request: string, parent: unknown, isMain: boolean, options: unknown) {
      if (request === '@qavajs/tx') return __filename;
      return origResolve.call(this, request, parent, isMain, options);
    };
    ((Module as any)._resolveFilename as any).__txPatched = true;
  }
}
