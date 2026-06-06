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
}
