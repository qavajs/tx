export function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function escAttr(s: string): string {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function jsq(s: string): string {
  return JSON.stringify(s).replace(/"/g, '&quot;');
}
