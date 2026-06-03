// Accessibility tree snapshot serialized to YAML (Playwright-compatible format)

interface AriaNode {
  role: string;
  name: string;
  level?: number;
  checked?: boolean;
  selected?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  required?: boolean;
  value?: string;
  children: AriaNode[];
}

const TAG_ROLES: Record<string, string> = {
  article:    'article',
  aside:      'complementary',
  button:     'button',
  caption:    'caption',
  details:    'group',
  dialog:     'dialog',
  figure:     'figure',
  form:       'form',
  h1: 'heading', h2: 'heading', h3: 'heading',
  h4: 'heading', h5: 'heading', h6: 'heading',
  img:        'img',
  li:         'listitem',
  main:       'main',
  menu:       'menu',
  meter:      'meter',
  nav:        'navigation',
  ol:         'list',
  ul:         'list',
  option:     'option',
  optgroup:   'group',
  output:     'status',
  progress:   'progressbar',
  section:    'region',
  select:     'combobox',
  summary:    'button',
  table:      'table',
  tbody:      'rowgroup',
  td:         'cell',
  textarea:   'textbox',
  tfoot:      'rowgroup',
  th:         'columnheader',
  thead:      'rowgroup',
  tr:         'row',
};

const INPUT_TYPE_ROLES: Record<string, string> = {
  button:   'button',
  checkbox: 'checkbox',
  email:    'textbox',
  number:   'spinbutton',
  password: 'textbox',
  radio:    'radio',
  range:    'slider',
  reset:    'button',
  search:   'searchbox',
  submit:   'button',
  tel:      'textbox',
  text:     'textbox',
  url:      'textbox',
};

const SKIP_TAGS = new Set([
  'script', 'style', 'noscript', 'template',
  'head', 'meta', 'link', 'title', 'br', 'wbr',
]);

const SKIP_ROLES = new Set(['none', 'presentation']);

const LEAF_ROLES = new Set([
  'textbox', 'searchbox', 'spinbutton', 'slider',
  'img', 'progressbar', 'meter', 'separator',
]);

const NAME_FROM_CONTENT_ROLES = new Set([
  'button', 'link', 'heading', 'cell', 'columnheader', 'rowheader',
  'tab', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'treeitem', 'caption',
]);

function _implicitRole(el: Element): string {
  const explicit = el.getAttribute('role')?.trim().split(/\s+/)[0];
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : 'generic';
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return INPUT_TYPE_ROLES[type] ?? 'textbox';
  }
  if (tag === 'header') {
    const p = el.parentElement?.tagName.toLowerCase();
    return (!p || p === 'body') ? 'banner' : 'generic';
  }
  if (tag === 'footer') {
    const p = el.parentElement?.tagName.toLowerCase();
    return (!p || p === 'body') ? 'contentinfo' : 'generic';
  }
  return TAG_ROLES[tag] ?? 'generic';
}

function _headingLevel(el: Element): number | undefined {
  const al = el.getAttribute('aria-level');
  if (al) { const n = parseInt(al, 10); if (!isNaN(n)) return n; }
  const m = el.tagName.toLowerCase().match(/^h([1-6])$/);
  return m ? parseInt(m[1], 10) : undefined;
}

function _accessibleName(el: Element): string {
  const lby = el.getAttribute('aria-labelledby');
  if (lby) {
    const doc = el.ownerDocument;
    const n = lby.trim().split(/\s+/)
      .map(id => doc.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean).join(' ');
    if (n) return n;
  }
  const al = el.getAttribute('aria-label')?.trim();
  if (al) return al;

  const tag = el.tagName.toLowerCase();
  if (tag === 'img') return (el as HTMLImageElement).alt?.trim() ?? '';

  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const id = el.id;
    if (id) {
      try {
        const lbl = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lbl) return lbl.textContent?.trim() ?? '';
      } catch {}
    }
    const wlbl = el.closest('label');
    if (wlbl) {
      const clone = wlbl.cloneNode(true) as Element;
      clone.querySelector(tag)?.remove();
      const t = clone.textContent?.trim();
      if (t) return t;
    }
    return (el as HTMLInputElement).placeholder?.trim() ?? el.getAttribute('title')?.trim() ?? '';
  }

  const role = _implicitRole(el);
  if (NAME_FROM_CONTENT_ROLES.has(role)) return el.textContent?.trim() ?? '';
  return el.getAttribute('title')?.trim() ?? '';
}

function _isHidden(el: Element): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return true;
  const win = el.ownerDocument.defaultView;
  if (!win) return true;
  const s = win.getComputedStyle(el as HTMLElement);
  return s.display === 'none' || s.visibility === 'hidden';
}

function _buildChildren(parent: Element): AriaNode[] {
  const out: AriaNode[] = [];
  for (const child of Array.from(parent.children)) {
    const tag = child.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;
    if (_isHidden(child)) continue;

    const role = _implicitRole(child);
    if (SKIP_ROLES.has(role)) { out.push(..._buildChildren(child)); continue; }
    if (role === 'generic') { out.push(..._buildChildren(child)); continue; }

    const name = _accessibleName(child);
    const node: AriaNode = { role, name, children: [] };

    if (role === 'heading') {
      const lvl = _headingLevel(child);
      if (lvl !== undefined) node.level = lvl;
    }

    const ac = child.getAttribute('aria-checked');
    if (ac !== null) {
      node.checked = ac !== 'false';
    } else if (tag === 'input') {
      const t = (child as HTMLInputElement).type?.toLowerCase();
      if (t === 'checkbox' || t === 'radio') node.checked = (child as HTMLInputElement).checked;
    }

    const asel = child.getAttribute('aria-selected');
    if (asel === 'true') node.selected = true;
    else if (tag === 'option') node.selected = (child as HTMLOptionElement).selected || undefined;

    const aexp = child.getAttribute('aria-expanded');
    if (aexp !== null) node.expanded = aexp === 'true';

    if (child.getAttribute('aria-disabled') === 'true' || ('disabled' in child && (child as any).disabled)) {
      node.disabled = true;
    }

    if (child.getAttribute('aria-required') === 'true' || ('required' in child && (child as any).required)) {
      node.required = true;
    }

    if ((tag === 'input' || tag === 'textarea') && (child as HTMLInputElement).value) {
      node.value = (child as HTMLInputElement).value;
    }

    if (!LEAF_ROLES.has(role)) node.children = _buildChildren(child);
    out.push(node);
  }
  return out;
}

function _escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').trim();
}

function _nodeToLines(node: AriaNode, indent: number): string[] {
  const pad = '  '.repeat(indent);
  const attrs: string[] = [];
  if (node.level !== undefined) attrs.push(`level=${node.level}`);
  if (node.checked !== undefined) attrs.push(node.checked ? 'checked' : 'unchecked');
  if (node.selected) attrs.push('selected');
  if (node.expanded !== undefined) attrs.push(node.expanded ? 'expanded' : 'collapsed');
  if (node.disabled) attrs.push('disabled');
  if (node.required) attrs.push('required');

  const attrStr = attrs.length ? ` [${attrs.join(', ')}]` : '';
  const nameStr = node.name ? ` "${_escape(node.name)}"` : '';
  const hasChildren = node.children.length > 0;

  let header: string;
  if (hasChildren) {
    header = `${pad}- ${node.role}${nameStr}${attrStr}:`;
  } else if (node.value) {
    header = `${pad}- ${node.role}${nameStr}${attrStr}: ${JSON.stringify(node.value)}`;
  } else {
    header = `${pad}- ${node.role}${nameStr}${attrStr}`;
  }

  const lines = [header];
  for (const child of node.children) lines.push(..._nodeToLines(child, indent + 1));
  return lines;
}

export function ariaSnapshot(root: Element): string {
  return _buildChildren(root).flatMap(n => _nodeToLines(n, 0)).join('\n');
}
