import { iframeDoc, iframeWin, _withCommand, _awaitOrAbort } from './browser';

interface _KeyInfo { key: string; code: string; keyCode: number }

const _KEY_DEFS: Record<string, _KeyInfo> = {
  Enter:        { key: 'Enter', code: 'Enter', keyCode: 13 },
  Return:       { key: 'Enter', code: 'Enter', keyCode: 13 },
  Tab:          { key: 'Tab', code: 'Tab', keyCode: 9 },
  Backspace:    { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  Delete:       { key: 'Delete', code: 'Delete', keyCode: 46 },
  Escape:       { key: 'Escape', code: 'Escape', keyCode: 27 },
  Esc:          { key: 'Escape', code: 'Escape', keyCode: 27 },
  Space:        { key: ' ', code: 'Space', keyCode: 32 },
  ArrowUp:      { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowDown:    { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  ArrowLeft:    { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowRight:   { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  Home:         { key: 'Home', code: 'Home', keyCode: 36 },
  End:          { key: 'End', code: 'End', keyCode: 35 },
  PageUp:       { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  PageDown:     { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  Insert:       { key: 'Insert', code: 'Insert', keyCode: 45 },
  Shift:        { key: 'Shift', code: 'ShiftLeft', keyCode: 16 },
  ShiftLeft:    { key: 'Shift', code: 'ShiftLeft', keyCode: 16 },
  ShiftRight:   { key: 'Shift', code: 'ShiftRight', keyCode: 16 },
  Control:      { key: 'Control', code: 'ControlLeft', keyCode: 17 },
  ControlLeft:  { key: 'Control', code: 'ControlLeft', keyCode: 17 },
  ControlRight: { key: 'Control', code: 'ControlRight', keyCode: 17 },
  Alt:          { key: 'Alt', code: 'AltLeft', keyCode: 18 },
  AltLeft:      { key: 'Alt', code: 'AltLeft', keyCode: 18 },
  AltRight:     { key: 'Alt', code: 'AltRight', keyCode: 18 },
  Meta:         { key: 'Meta', code: 'MetaLeft', keyCode: 91 },
  MetaLeft:     { key: 'Meta', code: 'MetaLeft', keyCode: 91 },
  MetaRight:    { key: 'Meta', code: 'MetaRight', keyCode: 92 },
  CapsLock:     { key: 'CapsLock', code: 'CapsLock', keyCode: 20 },
  F1:           { key: 'F1', code: 'F1', keyCode: 112 },
  F2:           { key: 'F2', code: 'F2', keyCode: 113 },
  F3:           { key: 'F3', code: 'F3', keyCode: 114 },
  F4:           { key: 'F4', code: 'F4', keyCode: 115 },
  F5:           { key: 'F5', code: 'F5', keyCode: 116 },
  F6:           { key: 'F6', code: 'F6', keyCode: 117 },
  F7:           { key: 'F7', code: 'F7', keyCode: 118 },
  F8:           { key: 'F8', code: 'F8', keyCode: 119 },
  F9:           { key: 'F9', code: 'F9', keyCode: 120 },
  F10:          { key: 'F10', code: 'F10', keyCode: 121 },
  F11:          { key: 'F11', code: 'F11', keyCode: 122 },
  F12:          { key: 'F12', code: 'F12', keyCode: 123 },
};

function _resolveKey(name: string): _KeyInfo {
  if (_KEY_DEFS[name]) return _KEY_DEFS[name];
  if (name.length === 1) {
    const upper = name.toUpperCase();
    let code: string;
    if (/[a-zA-Z]/.test(name)) {
      code = 'Key' + upper;
    } else if (/[0-9]/.test(name)) {
      code = 'Digit' + name;
    } else {
      const CODE_MAP: Record<string, string> = {
        ' ': 'Space', '.': 'Period', ',': 'Comma', '-': 'Minus', '=': 'Equal',
        '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash',
        ';': 'Semicolon', "'": 'Quote', '`': 'Backquote', '/': 'Slash',
      };
      code = CODE_MAP[name] ?? 'Unidentified';
    }
    const kc = /[a-zA-Z]/.test(name) ? upper.charCodeAt(0) : name.charCodeAt(0);
    return { key: name, code, keyCode: kc };
  }
  return { key: name, code: name, keyCode: 0 };
}

export class Keyboard {
  private _pressed = new Set<string>();

  private get _doc(): Document | null { return iframeDoc(); }

  private _activeEl(): HTMLElement | null {
    return this._doc?.activeElement as HTMLElement | null;
  }

  private _buildInit(info: _KeyInfo): KeyboardEventInit {
    return {
      key: info.key, code: info.code, keyCode: info.keyCode,
      which: info.keyCode, charCode: 0,
      bubbles: true, cancelable: true,
      shiftKey:   this._pressed.has('Shift'),
      ctrlKey:    this._pressed.has('Control'),
      altKey:     this._pressed.has('Alt'),
      metaKey:    this._pressed.has('Meta'),
    };
  }

  private _fire(target: EventTarget | null, type: string, init: KeyboardEventInit): void {
    if (!target) return;
    const win = iframeWin() as any;
    const KE = win?.KeyboardEvent ?? KeyboardEvent;
    target.dispatchEvent(new KE(type, init));
  }

  async down(key: string): Promise<void> {
    return _withCommand(key, 'keyboard.down', async () => {
      const info = _resolveKey(key);
      this._pressed.add(info.key);
      this._fire(this._activeEl(), 'keydown', this._buildInit(info));
    });
  }

  async up(key: string): Promise<void> {
    return _withCommand(key, 'keyboard.up', async () => {
      const info = _resolveKey(key);
      this._pressed.delete(info.key);
      this._fire(this._activeEl(), 'keyup', this._buildInit(info));
    });
  }

  private _pressRaw(info: _KeyInfo): void {
    const target = this._activeEl();
    const init = this._buildInit(info);
    this._fire(target, 'keydown', init);
    if (info.key.length === 1) {
      const cc = info.key.charCodeAt(0);
      this._fire(target, 'keypress', { ...init, charCode: cc, keyCode: cc, which: cc });
    }
    if (info.key === 'Enter') {
      const form = (target as HTMLInputElement | null)?.form;
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
    this._fire(target, 'keyup', this._buildInit(info));
  }

  async press(key: string, opts?: { delay?: number }): Promise<void> {
    return _withCommand(key, 'keyboard.press', async () => {
      const parts = key.split('+');
      const mainKey = parts[parts.length - 1];
      const mods = parts.slice(0, -1);
      for (const mod of mods) {
        const info = _resolveKey(mod);
        this._pressed.add(info.key);
        this._fire(this._activeEl(), 'keydown', this._buildInit(info));
      }
      this._pressRaw(_resolveKey(mainKey));
      if (opts?.delay) await _awaitOrAbort(opts.delay);
      for (const mod of [...mods].reverse()) {
        const info = _resolveKey(mod);
        this._pressed.delete(info.key);
        this._fire(this._activeEl(), 'keyup', this._buildInit(info));
      }
    });
  }

  async type(text: string, opts?: { delay?: number }): Promise<void> {
    return _withCommand(`"${text}"`, 'keyboard.type', async () => {
      for (const ch of text) {
        if (opts?.delay) await _awaitOrAbort(opts.delay);
        const info = _resolveKey(ch);
        const target = this._activeEl();
        const init = this._buildInit(info);
        const cc = ch.charCodeAt(0);
        this._fire(target, 'keydown', init);
        this._fire(target, 'keypress', { ...init, charCode: cc, keyCode: cc, which: cc });
        const el = target as HTMLInputElement | HTMLTextAreaElement | null;
        if (el && 'value' in el && !el.readOnly && !(el as any).disabled) {
          const win = iframeWin() as any;
          const proto = el.tagName === 'INPUT' ? win?.HTMLInputElement?.prototype : win?.HTMLTextAreaElement?.prototype;
          const setter = proto ? (Object.getOwnPropertyDescriptor(proto, 'value') ?? {}).set : undefined;
          if (setter) setter.call(el, el.value + ch); else (el as any).value += ch;
          const IE = win?.InputEvent ?? win?.Event ?? InputEvent;
          el.dispatchEvent(new IE('input', { bubbles: true, cancelable: false, inputType: 'insertText', data: ch } as any));
        }
        this._fire(target, 'keyup', this._buildInit(info));
      }
    });
  }

  async insertText(text: string): Promise<void> {
    return _withCommand(`"${text}"`, 'keyboard.insertText', async () => {
      const target = this._activeEl() as HTMLInputElement | HTMLTextAreaElement | null;
      if (target && 'value' in target) {
        const win = iframeWin() as any;
        const proto = target.tagName === 'INPUT' ? win?.HTMLInputElement?.prototype : win?.HTMLTextAreaElement?.prototype;
        const setter = proto ? (Object.getOwnPropertyDescriptor(proto, 'value') ?? {}).set : undefined;
        if (setter) setter.call(target, target.value + text); else (target as any).value += text;
        const IE = win?.InputEvent ?? win?.Event ?? InputEvent;
        target.dispatchEvent(new IE('input', { bubbles: true, cancelable: false, inputType: 'insertText', data: text } as any));
      }
    });
  }
}
