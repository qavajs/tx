export function matchGlob(pattern: string, str: string): boolean {
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
