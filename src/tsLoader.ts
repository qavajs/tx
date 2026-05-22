/**
 * Runtime TypeScript loader — registers a Node require hook so .ts files
 * can be require()'d directly without a prior build step.
 */

import Module from 'module';
import fs from 'fs';

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
}
