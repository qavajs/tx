import { escHtml, escAttr, jsq } from '../utils/htmlUtils';

export interface ParsedTest { suite: string; name: string; tags?: string[]; }
export interface ParsedFile { filename: string; relPath?: string; tests: ParsedTest[]; }

export function renderTestItemHtml(filename: string, suite: string, name: string, tags: string[]): string {
  const fullName = suite === '(root)' ? name : suite + ' > ' + name;
  const stateIcons =
    '<svg class="tx-state-svg tx-state-svg--idle" width="12" height="12" viewBox="0 0 16 16" fill="none">' +
      '<path d="M5 8h6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
    '</svg>' +
    '<svg class="tx-state-svg tx-state-svg--pass" width="12" height="12" viewBox="0 0 16 16" fill="none">' +
      '<path d="M4 8.667L7.333 12L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>' +
    '<svg class="tx-state-svg tx-state-svg--fail" width="12" height="12" viewBox="0 0 16 16" fill="none">' +
      '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>' +
    '<svg class="tx-state-svg tx-state-svg--running" width="12" height="12" viewBox="0 0 16 16" fill="none">' +
      '<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="2"/>' +
    '</svg>';
  const key = escAttr(filename + '\x01' + fullName);
  const tagsHtml = tags.length > 0
    ? '<span class="tx-test-tags">' + tags.map(t => '<span class="tx-test-tag">' + escHtml(t) + '</span>').join('') + '</span>'
    : '';
  return '<div class="tx-test-item"' +
    ' data-testkey="' + key + '"' +
    ' data-suite="' + escHtml(suite) + '"' +
    ' data-fullname="' + escHtml(fullName) + '"' +
    ' data-tags="' + escHtml(tags.join(' ')) + '">' +
    '<span class="tx-test-chevron">&#9658;</span>' +
    '<span class="tx-test-dot">' + stateIcons + '</span>' +
    '<span class="tx-test-name">' + escHtml(name) + '</span>' +
    tagsHtml +
    '<span class="tx-test-badge"></span>' +
    '<button class="tx-test-run-btn" aria-label="Run ' + escHtml(name) + '" onclick="event.stopPropagation();window.runTest(' + jsq(filename) + ',' + jsq(fullName) + ')">&#9654;</button>' +
  '</div>' +
  '<div class="tx-test-log" id="tlog-' + key + '"></div>';
}

export function renderSuiteHtml(filename: string, suite: string, items: Array<{ name: string; tags: string[] }>): string {
  const key = escAttr(filename + '\x01' + suite);
  return '<div class="tx-suite-row" data-suite-key="' + key + '" onclick="window.toggleSuite(' + jsq(filename) + ',' + jsq(suite) + ')">' +
    '<span class="tx-suite-chevron">&#9658;</span>' +
    '<span class="tx-suite-name">' + escHtml(suite) + '</span>' +
    '<span class="tx-suite-badges" id="sbadges-' + key + '"></span>' +
    '<button class="tx-suite-run-btn" aria-label="Run suite ' + escHtml(suite) + '" onclick="event.stopPropagation();window.runSuite(' + jsq(filename) + ',' + jsq(suite) + ')">&#9654;</button>' +
  '</div>' + items.map(({ name, tags }) => renderTestItemHtml(filename, suite, name, tags)).join('');
}

export function renderTestFileCard(f: ParsedFile): string {
  const suites: Record<string, Array<{ name: string; tags: string[] }>> = Object.create(null);
  f.tests.forEach(t => {
    const k = t.suite || '(root)';
    if (!suites[k]) suites[k] = [];
    suites[k].push({ name: t.name, tags: t.tags ?? [] });
  });
  const suiteHtml = Object.entries(suites).map(([s, items]) => renderSuiteHtml(f.filename, s, items)).join('');
  const display = f.relPath ?? f.filename;
  const ext = display.split('.').pop() ?? 'js';
  const noExt = display.slice(0, -(ext.length + 1));
  const lastSlash = noExt.lastIndexOf('/');
  const dir = lastSlash >= 0 ? noExt.slice(0, lastSlash + 1) : '';
  const stem = lastSlash >= 0 ? noExt.slice(lastSlash + 1) : noExt;
  return '<div class="tx-spec-card" id="card-' + escAttr(f.filename) + '" data-filename="' + escHtml(f.filename) + '">' +
    '<div class="tx-spec-hdr" onclick="window.toggleCard(' + jsq(f.filename) + ')">' +
      '<span class="tx-spec-chevron">&#9658;</span>' +
      '<span class="tx-spec-filename">' +
        (dir ? '<span class="tx-spec-dir">' + escHtml(dir) + '</span>' : '') +
        escHtml(stem) + '<span class="ext">.' + escHtml(ext) + '</span>' +
      '</span>' +
      '<span class="tx-suite-badges" id="badges-' + escAttr(f.filename) + '"></span>' +
      '<button class="tx-spec-run-btn" aria-label="Run ' + escHtml(display) + '" onclick="event.stopPropagation();window.runTestByFilename(' + jsq(f.filename) + ')">&#9654;</button>' +
    '</div>' +
    (Object.keys(suites).length ? '<div class="tx-spec-body">' + suiteHtml + '</div>' : '') +
  '</div>';
}
