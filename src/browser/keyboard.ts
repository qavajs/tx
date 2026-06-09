import { sendCommand, _withCommand, _awaitOrAbort } from './browser';

export class Keyboard {
  private _pressed = new Set<string>();

  async down(key: string): Promise<void> {
    return _withCommand(`page.keyboard.down(${JSON.stringify(key)})`, 'keyboard.down', async () => {
      this._pressed.add(key);
      await sendCommand('keyboardDown', { key, modifiers: [...this._pressed] });
    });
  }

  async up(key: string): Promise<void> {
    return _withCommand(`page.keyboard.up(${JSON.stringify(key)})`, 'keyboard.up', async () => {
      this._pressed.delete(key);
      await sendCommand('keyboardUp', { key, modifiers: [...this._pressed] });
    });
  }

  async press(key: string, opts?: { delay?: number }): Promise<void> {
    return _withCommand(`page.keyboard.press(${JSON.stringify(key)})`, 'keyboard.press', async () => {
      if (opts?.delay) await _awaitOrAbort(opts.delay);
      await sendCommand('keyboardPress', { key, modifiers: [...this._pressed] });
    });
  }

  async type(text: string, opts?: { delay?: number }): Promise<void> {
    return _withCommand(`page.keyboard.type(${JSON.stringify(text)})`, 'keyboard.type', async () => {
      await sendCommand('keyboardType', { text, delay: opts?.delay ?? 0 });
    });
  }

  async insertText(text: string): Promise<void> {
    return _withCommand(`page.keyboard.insertText(${JSON.stringify(text)})`, 'keyboard.insertText', async () => {
      await sendCommand('keyboardInsertText', { text });
    });
  }
}
