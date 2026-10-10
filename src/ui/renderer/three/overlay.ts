/**
 * 2D screen overlay above the WebGL canvas: chips (altitude, "on +10 ft"),
 * HP numbers, the banner and floating combat numbers. Text stays sharp at any
 * zoom because it is drawn in screen space at projected positions.
 */

export interface ChipStyle {
  size?: number;
  bg?: string;
  fg?: string;
  bold?: boolean;
}

export class Overlay {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  width = 1;
  height = 1;
  private dpr = 1;

  constructor() {
    this.canvas.className = 'board-overlay';
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.pointerEvents = 'none';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  begin(): CanvasRenderingContext2D {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    return ctx;
  }

  chip(x: number, y: number, text: string, s: ChipStyle = {}): { w: number; h: number } {
    const ctx = this.ctx;
    const size = s.size ?? 12;
    ctx.save();
    ctx.font = `${s.bold === false ? '600' : '700'} ${size}px "Segoe UI", system-ui, sans-serif`;
    const w = Math.ceil(ctx.measureText(text).width + size * 0.9);
    const h = Math.ceil(size * 1.55);
    const left = Math.round(x - w / 2),
      top = Math.round(y - h / 2);
    ctx.beginPath();
    ctx.roundRect(left, top, w, h, h / 2);
    ctx.fillStyle = s.bg ?? 'rgba(20,24,32,0.86)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = s.fg ?? '#eef2f7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + w / 2, top + h / 2 + 0.5);
    ctx.restore();
    return { w, h };
  }

  /** Outlined text (floating numbers). */
  outlined(x: number, y: number, text: string, color: string, size: number, alpha = 1): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${size}px Consolas, "Segoe UI", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size * 0.22);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  banner(text: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `700 18px Consolas, "Segoe UI", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const tw = ctx.measureText(text).width + 24;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(this.width / 2 - tw / 2, 8, tw, 32, 6);
    ctx.fill();
    ctx.fillStyle = '#e8eef5';
    ctx.fillText(text, this.width / 2, 15);
    ctx.restore();
  }

  /** Small plain label (HP numbers). */
  label(x: number, y: number, text: string, size = 11): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(Math.round(x - tw / 2), Math.round(y - size * 0.8), Math.ceil(tw), Math.ceil(size * 1.6));
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }
}
