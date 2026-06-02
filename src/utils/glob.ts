import picomatch from 'picomatch';

export function matchGlob(pattern: string, str: string): boolean {
  return picomatch(pattern)(str);
}
