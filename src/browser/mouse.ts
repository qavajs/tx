import { iframeDoc, _withCommand } from './browser';

type MouseButton = 'left' | 'middle' | 'right';

export class Mouse {
  private _x = 0;
  private _y = 0;

  private _buttons = 0;
  private _clickCount = 0;

  // Current hovered ancestry path: [target, parent, body, html]
  private _hoverPath: Element[] = [];

  private get _doc(): Document | null {
    return iframeDoc();
  }

  private _buttonCode(button?: MouseButton): number {
    switch (button) {
      case 'middle': return 1;
      case 'right': return 2;
      default: return 0;
    }
  }

  private _buttonMask(button: number): number {
    switch (button) {
      case 1: return 4;
      case 2: return 2;
      default: return 1;
    }
  }

  private _target(): HTMLElement | null {
    return this._doc?.elementFromPoint(this._x, this._y) as HTMLElement | null;
  }

  private _path(el: Element | null): Element[] {
    const path: Element[] = [];
    let current = el;
    while (current) {
      path.push(current);
      current = current.parentElement;
    }
    return path;
  }

  private _dispatch(target: EventTarget | null, type: string, init: MouseEventInit = {}): void {
    if (!target) return;
    const eventInit: MouseEventInit = {
      bubbles: true, cancelable: true, composed: true,
      clientX: this._x, clientY: this._y, screenX: this._x, screenY: this._y,
      buttons: this._buttons,
      ...init,
    };
    if (type.startsWith('pointer')) {
      target.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, ...eventInit }));
      return;
    }
    target.dispatchEvent(new MouseEvent(type, eventInit));
  }

  private _emitBoundaryEvents(prevTarget: Element | null, nextTarget: Element | null): void {
    const prevPath = this._hoverPath;
    const nextPath = this._path(nextTarget);
    const prevSet = new Set(prevPath);
    const nextSet = new Set(nextPath);
    const leaving = prevPath.filter(el => !nextSet.has(el));
    const entering = nextPath.filter(el => !prevSet.has(el));

    for (const el of leaving) {
      this._dispatch(el, 'pointerout', { relatedTarget: nextTarget });
      this._dispatch(el, 'mouseout', { relatedTarget: nextTarget });
      this._dispatch(el, 'pointerleave', { bubbles: false, relatedTarget: nextTarget });
      this._dispatch(el, 'mouseleave', { bubbles: false, relatedTarget: nextTarget });
    }
    for (const el of [...entering].reverse()) {
      this._dispatch(el, 'pointerover', { relatedTarget: prevTarget });
      this._dispatch(el, 'mouseover', { relatedTarget: prevTarget });
      this._dispatch(el, 'pointerenter', { bubbles: false, relatedTarget: prevTarget });
      this._dispatch(el, 'mouseenter', { bubbles: false, relatedTarget: prevTarget });
    }
    this._hoverPath = nextPath;
  }

  private _emitMove(target: Element | null): void {
    this._dispatch(target, 'pointermove');
    this._dispatch(target, 'mousemove');
  }

  async move(x: number, y: number, opts?: { steps?: number }): Promise<void> {
    return _withCommand(`${x}, ${y}`, 'mouse.move', async () => {
      const steps = Math.max(1, opts?.steps ?? 1);
      const startX = this._x;
      const startY = this._y;
      for (let i = 1; i <= steps; i++) {
        this._x = startX + ((x - startX) * i) / steps;
        this._y = startY + ((y - startY) * i) / steps;
        const prevTarget = this._hoverPath[0] ?? null;
        const nextTarget = this._target();
        if (prevTarget !== nextTarget) this._emitBoundaryEvents(prevTarget, nextTarget);
        this._emitMove(nextTarget);
        if (i < steps) await new Promise(r => setTimeout(r, 0));
      }
    });
  }

  async down(opts?: { button?: MouseButton }): Promise<void> {
    return _withCommand(`${this._x}, ${this._y}`, 'mouse.down', async () => {
      const button = this._buttonCode(opts?.button);
      this._buttons |= this._buttonMask(button);
      const target = this._target();
      this._dispatch(target, 'pointerdown', { button });
      this._dispatch(target, 'mousedown', { button, detail: this._clickCount + 1 });
    });
  }

  async up(opts?: { button?: MouseButton }): Promise<void> {
    return _withCommand(`${this._x}, ${this._y}`, 'mouse.up', async () => {
      const button = this._buttonCode(opts?.button);
      const mask = this._buttonMask(button);
      const target = this._target();
      this._dispatch(target, 'pointerup', { button });
      this._dispatch(target, 'mouseup', { button, detail: this._clickCount + 1 });
      this._buttons &= ~mask;
    });
  }

  async click(x: number, y: number, opts?: { button?: MouseButton; clickCount?: number; delay?: number }): Promise<void> {
    return _withCommand(`${x}, ${y}`, 'mouse.click', async () => {
      await this.move(x, y);
      this._clickCount = opts?.clickCount ?? this._clickCount + 1;
      await this.down(opts);
      if (opts?.delay) await new Promise(r => setTimeout(r, opts.delay));
      await this.up(opts);
      const target = this._target();
      const button = this._buttonCode(opts?.button);
      this._dispatch(target, 'click', { button, detail: this._clickCount });
      if (button === 2) this._dispatch(target, 'contextmenu', { button: 2 });
    });
  }

  async dblclick(x: number, y: number, opts?: { button?: MouseButton; delay?: number }): Promise<void> {
    return _withCommand(`${x}, ${y}`, 'mouse.dblclick', async () => {
      await this.click(x, y, { ...opts, clickCount: 1 });
      if (opts?.delay) await new Promise(r => setTimeout(r, opts.delay));
      await this.click(x, y, { ...opts, clickCount: 2 });
      const target = this._target();
      this._dispatch(target, 'dblclick', { button: this._buttonCode(opts?.button), detail: 2 });
    });
  }

  async wheel(deltaX: number, deltaY: number): Promise<void> {
    return _withCommand(`Δ${deltaX}, ${deltaY}`, 'mouse.wheel', async () => {
      this._target()?.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true,
        clientX: this._x, clientY: this._y, screenX: this._x, screenY: this._y,
        deltaX, deltaY, deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      }));
    });
  }
}
