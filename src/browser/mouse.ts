import { sendCommand, _withCommand } from './browser';

type MouseButton = 'left' | 'middle' | 'right';

export class Mouse {
  private _x = 0;
  private _y = 0;

  async move(x: number, y: number, opts?: { steps?: number }): Promise<void> {
    return _withCommand(`page.mouse.move(${x}, ${y})`, 'mouse.move', async () => {
      this._x = x; this._y = y;
      await sendCommand('mouseMove', { x, y, steps: opts?.steps ?? 1 });
    });
  }

  async down(opts?: { button?: MouseButton }): Promise<void> {
    return _withCommand(`page.mouse.down()`, 'mouse.down', async () => {
      await sendCommand('mouseDown', { x: this._x, y: this._y, button: opts?.button ?? 'left' });
    });
  }

  async up(opts?: { button?: MouseButton }): Promise<void> {
    return _withCommand(`page.mouse.up()`, 'mouse.up', async () => {
      await sendCommand('mouseUp', { x: this._x, y: this._y, button: opts?.button ?? 'left' });
    });
  }

  async click(x: number, y: number, opts?: { button?: MouseButton; clickCount?: number; delay?: number }): Promise<void> {
    return _withCommand(`page.mouse.click(${x}, ${y})`, 'mouse.click', async () => {
      this._x = x; this._y = y;
      await sendCommand('mouseClick', { x, y, button: opts?.button ?? 'left', clickCount: opts?.clickCount ?? 1, delay: opts?.delay ?? 0 });
    });
  }

  async dblclick(x: number, y: number, opts?: { button?: MouseButton; delay?: number }): Promise<void> {
    return _withCommand(`page.mouse.dblclick(${x}, ${y})`, 'mouse.dblclick', async () => {
      this._x = x; this._y = y;
      await sendCommand('mouseDblclick', { x, y, button: opts?.button ?? 'left', delay: opts?.delay ?? 0 });
    });
  }

  async wheel(deltaX: number, deltaY: number): Promise<void> {
    return _withCommand(`page.mouse.wheel(${deltaX}, ${deltaY})`, 'mouse.wheel', async () => {
      await sendCommand('mouseWheel', { x: this._x, y: this._y, deltaX, deltaY });
    });
  }
}
