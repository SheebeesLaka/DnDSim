/**
 * Throwaway Canvas2D renderer: flat tiles, elevation number per cell, light
 * level shading, tokens with initials/HP ring/selection/active ring, `^n`
 * altitude on fliers, light markers, highlights, floating texts.
 */
import type { Cell } from '../../engine/types.ts';
import type { BoardVM, UnitVM } from '../../engine/view/boardViewModel.ts';
import type {
  BoardPointerEvent,
  BoardRenderer,
  BoardRendererHandlers,
  FloatingText,
} from './BoardRenderer.ts';

const THEME_BASE: Record<string, string> = { stone: '#3a3a42', grass: '#41582f', dirt: '#5a4632' };
const MARGIN = 20;

interface LiveText extends FloatingText {
  born: number;
}

export class Canvas2DRenderer implements BoardRenderer {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private container!: HTMLElement;
  private handlers: BoardRendererHandlers = {};
  private vm: BoardVM | null = null;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private texts: LiveText[] = [];
  private raf = 0;
  private resizeObs: ResizeObserver | null = null;
  private dragging = false;
  private pressX = 0;
  private pressY = 0;
  private lastX = 0;
  private lastY = 0;
  private moved = false;

  mount(container: HTMLElement, handlers: BoardRendererHandlers): void {
    this.container = container;
    this.handlers = handlers;
    this.canvas = document.createElement('canvas');
    this.canvas.tabIndex = 0;
    this.canvas.dataset.testid = 'board';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.pressX = this.lastX = e.clientX;
      this.pressY = this.lastY = e.clientY;
      this.dragging = true;
      this.moved = false;
      this.canvas.focus();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.dragging) {
        if (!this.moved && Math.hypot(e.clientX - this.pressX, e.clientY - this.pressY) >= 5)
          this.moved = true;
        if (this.moved) {
          this.panX += e.clientX - this.lastX;
          this.panY += e.clientY - this.lastY;
          this.lastX = e.clientX;
          this.lastY = e.clientY;
          this.draw();
        }
      }
      this.handlers.onHover?.(this.hitTest(e.clientX, e.clientY));
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      const wasDrag = this.moved;
      this.dragging = false;
      this.moved = false;
      if (wasDrag) return;
      this.handlers.onClick?.(this.pointer(e, 0));
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.dragging = false;
      this.handlers.onHover?.(null);
    });
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.handlers.onContextMenu?.(this.pointer(e, 2));
    });
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const next = Math.max(0.5, Math.min(4, this.zoom * Math.exp(-e.deltaY * 0.002)));
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left,
          my = e.clientY - rect.top;
        const { cs, ox, oy } = this.layout();
        const bx = (mx - ox) / cs,
          by = (my - oy) / cs; // board coords under cursor
        this.zoom = next;
        const l2 = this.layout();
        this.panX += mx - (l2.ox + bx * l2.cs);
        this.panY += my - (l2.oy + by * l2.cs);
        this.draw();
      },
      { passive: false },
    );
  }

  private pointer(e: MouseEvent, button: 0 | 2): BoardPointerEvent {
    return { cell: this.hitTest(e.clientX, e.clientY), button, clientX: e.clientX, clientY: e.clientY };
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth,
      hgt = this.container.clientHeight;
    if (w === 0 || hgt === 0) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(hgt * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${hgt}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  private layout(): { cs: number; ox: number; oy: number } {
    const w = this.container.clientWidth,
      hgt = this.container.clientHeight;
    const rows = this.vm?.rows ?? 8,
      cols = this.vm?.cols ?? 8;
    const fit = Math.max(8, Math.min((w - MARGIN * 2) / cols, (hgt - MARGIN * 2) / rows));
    const cs = fit * this.zoom;
    return { cs, ox: (w - cs * cols) / 2 + this.panX, oy: (hgt - cs * rows) / 2 + this.panY };
  }

  render(vm: BoardVM): void {
    this.vm = vm;
    this.draw();
  }

  hitTest(clientX: number, clientY: number): Cell | null {
    if (!this.vm) return null;
    const rect = this.canvas.getBoundingClientRect();
    const { cs, ox, oy } = this.layout();
    const c = Math.floor((clientX - rect.left - ox) / cs);
    const r = Math.floor((clientY - rect.top - oy) / cs);
    if (r < 0 || c < 0 || r >= this.vm.rows || c >= this.vm.cols) return null;
    return { r, c };
  }

  cellCenter(cell: Cell): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const { cs, ox, oy } = this.layout();
    return { x: rect.left + ox + (cell.c + 0.5) * cs, y: rect.top + oy + (cell.r + 0.5) * cs };
  }

  addFloatingText(ft: FloatingText): void {
    this.texts.push({ ...ft, born: performance.now() });
    this.tick();
  }

  resetCamera(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.draw();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.canvas.remove();
  }

  private tick = (): void => {
    cancelAnimationFrame(this.raf);
    const now = performance.now();
    this.texts = this.texts.filter((t) => now - t.born < 900);
    this.draw();
    if (this.texts.length > 0) this.raf = requestAnimationFrame(this.tick);
  };

  private draw(): void {
    const vm = this.vm;
    const ctx = this.ctx;
    const w = this.container.clientWidth,
      hgt = this.container.clientHeight;
    ctx.fillStyle = '#141518';
    ctx.fillRect(0, 0, w, hgt);
    if (!vm) return;
    const { cs, ox, oy } = this.layout();
    const X = (c: number) => ox + c * cs;
    const Y = (r: number) => oy + r * cs;
    const base = THEME_BASE[vm.theme] ?? THEME_BASE.stone ?? '#3a3a42';

    // floor
    for (const row of vm.cells) {
      for (const cell of row) {
        const x = X(cell.c),
          y = Y(cell.r);
        if (!cell.enabled) {
          ctx.fillStyle = '#1a1b1f';
          ctx.fillRect(x, y, cs, cs);
          continue;
        }
        ctx.fillStyle = base;
        ctx.fillRect(x, y, cs, cs);
        if ((cell.r + cell.c) % 2 === 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.07)';
          ctx.fillRect(x, y, cs, cs);
        }
        if (cell.elevation !== 0) {
          const a = Math.min(0.5, Math.abs(cell.elevation) * 0.1);
          ctx.fillStyle = cell.elevation > 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,40,${a})`;
          ctx.fillRect(x, y, cs, cs);
        }
        if (cell.ramp) {
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.font = `${Math.max(9, cs * 0.3)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText({ N: '↑', S: '↓', E: '→', W: '←' }[cell.ramp.dir], x + cs / 2, y + cs / 2);
        }
        // light level
        const dark =
          cell.light === 'bright'
            ? 0
            : cell.light === 'dim'
              ? 0.4
              : vm.view === 'player'
                ? 0.96
                : vm.dmReveal
                  ? 0.55
                  : 0.96;
        if (dark > 0) {
          ctx.fillStyle = `rgba(2,4,8,${dark})`;
          ctx.fillRect(x, y, cs, cs);
        }
        if (cell.elevation !== 0 && cs >= 24) {
          ctx.fillStyle = cell.elevation > 0 ? '#fff' : '#9fd0ff';
          ctx.font = `700 ${Math.max(9, cs * 0.22)}px sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(`${cell.elevation > 0 ? '+' : ''}${cell.elevation}`, x + 3, y + 2);
        }
      }
    }
    // grid
    ctx.strokeStyle = 'rgba(170,190,210,0.28)';
    ctx.lineWidth = 1;
    for (let r = 0; r <= vm.rows; r++) {
      ctx.beginPath();
      ctx.moveTo(ox, Y(r) + 0.5);
      ctx.lineTo(ox + cs * vm.cols, Y(r) + 0.5);
      ctx.stroke();
    }
    for (let c = 0; c <= vm.cols; c++) {
      ctx.beginPath();
      ctx.moveTo(X(c) + 0.5, oy);
      ctx.lineTo(X(c) + 0.5, oy + cs * vm.rows);
      ctx.stroke();
    }
    // highlights
    const fillCells = (cells: Cell[], color: string, stroke?: string) => {
      for (const c of cells) {
        ctx.fillStyle = color;
        ctx.fillRect(X(c.c), Y(c.r), cs, cs);
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(X(c.c) + 1, Y(c.r) + 1, cs - 2, cs - 2);
        }
      }
    };
    const hl = vm.highlights;
    fillCells(hl.placement, 'rgba(90,170,230,0.20)');
    fillCells(hl.move, 'rgba(110,200,130,0.22)');
    fillCells(hl.castRange, 'rgba(123,104,238,0.10)');
    fillCells(hl.areaTemplate, 'rgba(255,120,60,0.28)', 'rgba(255,120,60,0.55)');
    const unitCells = (ids: string[]) =>
      vm.units.filter((u) => ids.includes(u.id)).map((u) => ({ r: u.r, c: u.c }));
    fillCells(unitCells(hl.attack), 'rgba(215,95,95,0.22)', 'rgba(215,95,95,0.75)');
    fillCells(
      unitCells(hl.castTargets.filter((t) => t.inRange).map((t) => t.id)),
      'rgba(123,104,238,0.25)',
      'rgba(170,150,255,0.9)',
    );
    fillCells(unitCells(hl.areaUnits), 'rgba(0,0,0,0)', 'rgba(255,200,120,0.95)');

    // lights
    for (const l of vm.lights) {
      const cx = X(l.c) + cs / 2,
        cy = Y(l.r) + cs / 2;
      ctx.fillStyle = l.on ? l.color : '#4a4f55';
      ctx.beginPath();
      ctx.arc(cx + cs * 0.32, cy - cs * 0.32, Math.max(3, cs * 0.09), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // units: terrain & pickups, then ground tokens, then fliers
    const order = (u: UnitVM) => (u.kind === 'terrain' || u.kind === 'pickup' ? 0 : u.altitude > 0 ? 2 : 1);
    for (const u of [...vm.units].sort((a, b) => order(a) - order(b) || a.r - b.r))
      this.drawUnit(u, cs, X(u.c), Y(u.r), vm);

    // banner
    if (vm.banner) {
      ctx.font = `700 ${Math.max(13, cs * 0.35)}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const tw = ctx.measureText(vm.banner).width + 20;
      ctx.fillRect(w / 2 - tw / 2, 8, tw, cs * 0.5 + 10);
      ctx.fillStyle = '#e8eef5';
      ctx.fillText(vm.banner, w / 2, 14);
    }

    // floating texts
    const now = performance.now();
    for (const t of this.texts) {
      const age = (now - t.born) / 900;
      let x: number, y: number;
      if (t.unitId) {
        const u = vm.units.find((uu) => uu.id === t.unitId);
        if (!u) continue;
        x = X(u.c) + cs / 2;
        y = Y(u.r) + cs * 0.2 - u.altitude * cs * 0.12;
      } else if (t.cell) {
        x = X(t.cell.c) + cs / 2;
        y = Y(t.cell.r) + cs * 0.2;
      } else continue;
      y -= age * cs * 0.6;
      ctx.globalAlpha = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;
      ctx.font = `700 ${Math.max(12, cs * 0.3)}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(t.text, x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
      ctx.globalAlpha = 1;
    }
  }

  private drawUnit(u: UnitVM, cs: number, x: number, y: number, vm: BoardVM): void {
    const ctx = this.ctx;
    if (u.kind === 'terrain') {
      ctx.fillStyle = u.color;
      const inset = cs * 0.12;
      ctx.fillRect(x + inset, y + inset, cs - inset * 2, cs - inset * 2);
      ctx.strokeStyle = u.terrain?.collision ? '#000' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + inset, y + inset, cs - inset * 2, cs - inset * 2);
      if (cs >= 28) {
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.max(8, cs * 0.18)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${u.name} ${u.hp}`, x + cs / 2, y + cs - inset - 2);
      }
      return;
    }
    if (u.kind === 'pickup') {
      ctx.fillStyle = u.color;
      ctx.beginPath();
      ctx.arc(x + cs / 2, y + cs / 2, cs * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return;
    }
    const lift = u.altitude * cs * 0.12;
    const cx = x + cs / 2,
      cy = y + cs / 2 - lift;
    const d = cs * 0.66;
    const r = d / 2;
    const sideColor = u.side === 'party' ? '#4CAF50' : u.side === 'enemy' ? '#d75f5f' : '#808080';
    if (u.altitude > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(x + cs / 2, y + cs * 0.72, d * 0.4, d * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.moveTo(x + cs / 2, y + cs * 0.72);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = u.inDarkness && vm.view === 'dm' ? 0.6 : 1;
    const shape = () => {
      ctx.beginPath();
      if (u.side === 'enemy') ctx.roundRect(cx - r, cy - r, d, d, d * 0.2);
      else ctx.arc(cx, cy, r, 0, Math.PI * 2);
    };
    shape();
    ctx.fillStyle = u.color;
    ctx.fill();
    shape();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    shape();
    ctx.lineWidth = Math.max(2, d * 0.08);
    ctx.strokeStyle = sideColor;
    if (u.inDarkness) ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (u.showHpRing && u.maxHp > 0) {
      const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
      ctx.lineWidth = Math.max(2, d * 0.07);
      ctx.beginPath();
      ctx.arc(cx, cy, r + d * 0.14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r + d * 0.14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
      ctx.strokeStyle = pct > 0.5 ? '#4CAF50' : pct > 0.25 ? '#e6b23c' : '#d75f5f';
      ctx.stroke();
    }
    ctx.font = `800 ${Math.round(d * 0.42)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, d * 0.08);
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(u.initials, cx, cy + 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(u.initials, cx, cy + 1);
    if (u.selected) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ff9f1a';
      ctx.beginPath();
      ctx.arc(cx, cy, r + d * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (u.active) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffd54f';
      ctx.setLineDash([d * 0.35, d * 0.14]);
      ctx.beginPath();
      ctx.arc(cx, cy, r + d * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (cs >= 30 && u.showHpNumbers) {
      ctx.font = `700 ${Math.max(9, cs * 0.18)}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      const txt = `${u.hp}/${u.maxHp}`;
      const tw = ctx.measureText(txt).width + 6;
      ctx.fillRect(cx - tw / 2, cy + r + d * 0.2, tw, cs * 0.22);
      ctx.fillStyle = '#fff';
      ctx.fillText(txt, cx, cy + r + d * 0.22);
    }
    if (u.altitude > 0) {
      ctx.font = `700 ${Math.max(9, cs * 0.18)}px sans-serif`;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#9fd0ff';
      ctx.fillText(`^${u.altitude}`, cx, cy - r - 2);
    }
    ctx.globalAlpha = 1;
  }
}
