/**
 * HD-2D board renderer (direction C): three.js orthographic tactical camera,
 * extruded tiles with real point lights and shadow maps, pixel-art sprite
 * billboards, flat decals for rings, and a 2D overlay for text. Implements the
 * same BoardRenderer contract as the Phase 2 Canvas2D board, so the engine and
 * the panels are untouched.
 */
import * as THREE from 'three';
import type { Cell } from '../../../engine/types.ts';
import type { BoardVM } from '../../../engine/view/boardViewModel.ts';
import { SpriteLibrary } from '../../sprites/library.ts';
import type {
  BoardPointerEvent,
  BoardRenderer,
  BoardRendererHandlers,
  FloatingText,
} from '../BoardRenderer.ts';
import { TacticalCamera } from './camera.ts';
import {
  BLOCK_HEIGHT,
  DEFAULT_VIEW_OPTIONS,
  HIGHLIGHT,
  STEP,
  ftLabel,
  type ViewOptions,
} from './constants.ts';
import { LightLayer } from './lights.ts';
import { MarkLayer, type Mark } from './marks.ts';
import { Overlay } from './overlay.ts';
import { PostFX } from './post.ts';
import { isOccluded } from './occlusion.ts';
import { heightRegions, labelCellCosts, type HeightRegion } from './regions.ts';
import { TileLayer } from './tiles.ts';
import { UnitLayer } from './units.ts';

interface LiveText extends FloatingText {
  born: number;
}

export interface RendererStats {
  frames: number;
  /** performance.now() of the first drawn frame (startup cost incl. shader compile) */
  firstFrameAt: number;
  lastFrameMs: number;
  drawCalls: number;
  triangles: number;
}

export interface ThreeRendererOptions {
  view?: Partial<ViewOptions>;
  library?: SpriteLibrary;
  /** `?bench=1`: redraw every frame and show fps / frame time / draw calls on the board */
  benchmark?: boolean;
}

const FLOAT_MS = 900;

export class ThreeRenderer implements BoardRenderer {
  readonly scene = new THREE.Scene();
  readonly cam = new TacticalCamera();
  readonly tiles = new TileLayer();
  readonly units = new UnitLayer();
  readonly lights = new LightLayer();
  readonly marks = new MarkLayer();
  readonly overlay = new Overlay();
  readonly library: SpriteLibrary;
  readonly stats: RendererStats = { frames: 0, firstFrameAt: 0, lastFrameMs: 0, drawCalls: 0, triangles: 0 };
  gl!: THREE.WebGLRenderer;
  private post: PostFX | null = null;
  private container!: HTMLElement;
  private handlers: BoardRendererHandlers = {};
  private vm: BoardVM | null = null;
  private view: ViewOptions;
  private texts: LiveText[] = [];
  private regions: HeightRegion[] = [];
  private shadowUnits = new Map<string, string>();
  private shadowGlobal = '';
  private raf = 0;
  private dirty = true;
  private fitted = false;
  private resizeObs: ResizeObserver | null = null;
  private raycaster = new THREE.Raycaster();
  private hoverCell: Cell | null = null;
  private dragging = false;
  private moved = false;
  private pressX = 0;
  private pressY = 0;
  private lastX = 0;
  private lastY = 0;
  private unsubLibrary: (() => void) | null = null;
  private destroyed = false;
  private pausedAt: number | null = null;
  /** freeze idle animation (screenshot comparisons) */
  get animationPaused(): boolean {
    return this.pausedAt !== null;
  }
  set animationPaused(on: boolean) {
    if (!on) this.pausedAt = null;
    else if (this.pausedAt === null) {
      this.pausedAt = performance.now();
      // the frame on screen may lag the clock by a slow frame: show the frozen one now
      if (this.units.tick(this.pausedAt)) this.dirty = true;
    }
  }
  /** The idle-animation clock: stopped while paused, so rebuilt billboards keep their frame too. */
  private animNow(): number {
    return this.pausedAt ?? performance.now();
  }
  private readonly benchmark: boolean;
  private benchFrames: number[] = [];

  constructor(opts: ThreeRendererOptions = {}) {
    this.view = { ...DEFAULT_VIEW_OPTIONS, ...opts.view };
    this.benchmark = opts.benchmark ?? false;
    this.library = opts.library ?? new SpriteLibrary();
    this.scene.background = new THREE.Color('#0b0e14');
    this.scene.add(this.tiles.group, this.units.group, this.lights.group, this.marks.group);
  }

  // ---- BoardRenderer ----

  mount(container: HTMLElement, handlers: BoardRendererHandlers): void {
    this.container = container;
    this.handlers = handlers;
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.dataset.testid = 'board';
    canvas.style.display = 'block';
    container.appendChild(canvas);
    container.appendChild(this.overlay.canvas);
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.max(1, Math.floor(window.devicePixelRatio || 1)));
    this.gl.info.autoReset = false;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.shadowMap.autoUpdate = true;
    this.gl.toneMapping = THREE.NeutralToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.post = new PostFX(this.gl, this.scene, this.cam.camera);
    this.post.setEnabled({ bloom: this.view.bloom, blur: this.view.blur });
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.unsubLibrary = this.library.onChange(() => {
      if (this.vm) this.render(this.vm);
    });
    this.bindPointer(canvas);
    this.loop();
  }

  render(vm: BoardVM): void {
    this.vm = vm;
    const rebuilt = this.tiles.update(vm);
    if (rebuilt && !this.fitted) {
      this.fitted = true;
      this.cam.fit(this.tiles.bounds);
    }
    this.cam.setMode(this.view.camera);
    this.units.update(vm.units, {
      topY: (r, c) => this.tiles.topY(r, c),
      surface: (cell, lift) => this.tiles.surfaceMatrix(cell.r, cell.c, lift),
      mode: this.view.camera,
      stretch: this.cam.spriteStretch,
      view: vm.view,
      library: this.library,
      now: this.animNow(),
    });
    this.lights.update(
      vm,
      (r, c) => this.tiles.topY(r, c),
      (id) => vm.units.find((u) => u.id === id)?.altitude ?? 0,
    );
    this.regions = heightRegions(vm.cells, labelCellCosts(vm.units, this.view.camera === 'tactical'));
    this.updateGhosts();
    this.marks.set(this.collectMarks(vm), (cell, lift) => this.tiles.surfaceMatrix(cell.r, cell.c, lift));
    this.marks.setHover(this.hoverCell, (cell, lift) => this.tiles.surfaceMatrix(cell.r, cell.c, lift));
    // shadow maps are static: refresh them only when something that casts a shadow changed,
    // and point-light maps only for lights that reach the change (light edits refresh themselves)
    const global = `${this.view.camera}|${this.library.version}`;
    const changes = shadowChanges(this.shadowUnits, vm.units);
    this.shadowUnits = changes.next;
    if (rebuilt || global !== this.shadowGlobal) {
      this.shadowGlobal = global;
      this.lights.markShadowsDirty();
    } else this.lights.markShadowsDirtyNear(changes.cells);
    this.invalidate();
  }

  hitTest(clientX: number, clientY: number): Cell | null {
    return this.pick(clientX, clientY)?.cell ?? null;
  }

  /**
   * A client point that picks this cell: the tile-top centre when nothing in
   * front covers it, else the first point on the tile top that is visible (an
   * upright sprite south of the cell can cover its centre).
   */
  cellCenter(cell: Cell): { x: number; y: number } {
    const rect = this.gl.domElement.getBoundingClientRect();
    const y = this.tiles.topY(cell.r, cell.c);
    const samples: [number, number][] = [
      [0.5, 0.5],
      [0.5, 0.25],
      [0.25, 0.25],
      [0.75, 0.25],
      [0.5, 0.1],
      [0.15, 0.1],
      [0.85, 0.1],
      [0.15, 0.6],
      [0.85, 0.6],
    ];
    let first: { x: number; y: number } | null = null;
    for (const [dx, dz] of samples) {
      const p = this.cam.project(new THREE.Vector3(cell.c + dx, y, cell.r + dz));
      const pt = { x: rect.left + p.x, y: rect.top + p.y };
      first ??= pt;
      const hit = this.pick(pt.x, pt.y);
      if (hit && hit.cell.r === cell.r && hit.cell.c === cell.c) return pt;
    }
    return first ?? { x: rect.left, y: rect.top };
  }

  /** Client coordinates of a world point (tests, tooltips). */
  project(x: number, y: number, z: number): { x: number; y: number } {
    const rect = this.gl.domElement.getBoundingClientRect();
    const p = this.cam.project(new THREE.Vector3(x, y, z));
    return { x: rect.left + p.x, y: rect.top + p.y };
  }

  /** Client point `frac` of the way up a unit's sprite (0 = feet, 1 = top of the head). */
  unitPoint(unitId: string, frac: number): { x: number; y: number } | null {
    const g = this.units.get(unitId);
    if (!g) return null;
    const p = g.root.position;
    return this.project(p.x, p.y + g.h * frac, p.z);
  }

  addFloatingText(ft: FloatingText): void {
    this.texts.push({ ...ft, born: performance.now() });
    this.invalidate();
  }

  resetCamera(): void {
    this.cam.fit(this.tiles.bounds);
    this.invalidate();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.unsubLibrary?.();
    this.units.dispose();
    this.tiles.dispose();
    this.lights.dispose();
    this.marks.dispose();
    this.post?.dispose();
    this.gl.dispose();
    this.gl.domElement.remove();
    this.overlay.canvas.remove();
  }

  // ---- view options (camera / effects) ----

  getViewOptions(): ViewOptions {
    return { ...this.view };
  }

  setViewOptions(patch: Partial<ViewOptions>): void {
    const next = { ...this.view, ...patch };
    const cameraChanged = next.camera !== this.view.camera;
    this.view = next;
    this.post?.setEnabled({ bloom: next.bloom, blur: next.blur });
    if (cameraChanged) {
      this.cam.setMode(next.camera);
      if (this.vm) this.render(this.vm);
      this.cam.fit(this.tiles.bounds);
    }
    this.invalidate();
  }

  /** World-space pick: units (alpha-aware) in front of tiles. */
  pick(clientX: number, clientY: number): { cell: Cell; unitId: string | null } | null {
    if (!this.vm) return null;
    const rect = this.gl.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(this.cam.ndc(clientX - rect.left, clientY - rect.top), this.cam.camera);
    return pickWithRay(this.raycaster, this.units, this.tiles);
  }

  // ---- internals ----

  private invalidate(): void {
    this.dirty = true;
  }

  private resize(): void {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.gl.setSize(w, h, false);
    this.gl.domElement.style.width = `${w}px`;
    this.gl.domElement.style.height = `${h}px`;
    this.post?.setSize(w, h);
    this.overlay.resize(w, h, this.gl.getPixelRatio());
    this.cam.setViewport(w, h);
    if (this.fitted) this.cam.fit(this.tiles.bounds);
    this.invalidate();
  }

  private loop = (): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    // idle frames only swap UVs; walk-frame silhouettes differ by a texel or two, so the
    // (expensive) shadow maps are refreshed on board changes only
    if (!this.animationPaused && this.units.tick(this.animNow())) this.dirty = true;
    if (this.benchmark) {
      this.dirty = true;
      this.benchFrames.push(now);
      while ((this.benchFrames[0] ?? now) < now - 1000) this.benchFrames.shift();
    }
    if (this.texts.length > 0) {
      this.texts = this.texts.filter((t) => now - t.born < FLOAT_MS);
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.draw(now);
  };

  private draw(now: number): void {
    const t0 = performance.now();
    this.gl.info.reset();
    this.cam.update();
    this.snapBillboards();
    if (this.post) {
      const box = this.cam.projectBox(this.tiles.bounds);
      this.post.setFocusBand(box.minY, box.maxY, this.cam.viewportHeight);
    }
    if (this.post?.active) this.post.render();
    else this.gl.render(this.scene, this.cam.camera);
    this.drawOverlay(now);
    if (this.stats.frames === 0) this.stats.firstFrameAt = performance.now();
    this.stats.frames++;
    this.stats.lastFrameMs = performance.now() - t0;
    this.stats.drawCalls = this.gl.info.render.calls;
    this.stats.triangles = this.gl.info.render.triangles;
  }

  /** Lift each billboard a fraction of a pixel so its texels land 1:1 on screen pixels. */
  private snapBillboards(): void {
    for (const id of this.units.ids()) {
      const g = this.units.get(id);
      if (!g) continue;
      const base = g.root.userData.baseY as number | undefined;
      if (base === undefined) continue;
      g.root.position.y = base;
      g.root.position.y = base + this.cam.pixelLift(g.root.position);
    }
  }

  /**
   * Units hidden behind taller tiles or terrain blocks get a see-through
   * silhouette. Depends on the board and the camera angle only (not on pans),
   * so it runs on render() and camera-mode changes, never per frame.
   */
  private updateGhosts(): void {
    const vm = this.vm;
    if (!vm) return;
    const blockTop = new Map<string, number>();
    for (const u of vm.units)
      if (u.kind === 'terrain' && !u.spritePath && (u.terrain?.collision ?? true))
        blockTop.set(`${u.r},${u.c}`, this.tiles.topY(u.r, u.c) + BLOCK_HEIGHT);
    const heightAt = (r: number, c: number): number | null => {
      const cell = vm.cells[r]?.[c];
      if (!cell?.enabled) return null;
      const ramp = cell.ramp ? Math.max(cell.ramp.from, cell.ramp.to) * STEP : this.tiles.topY(r, c);
      return Math.max(ramp, blockTop.get(`${r},${c}`) ?? -Infinity);
    };
    const maxHeight = this.tiles.maxY + BLOCK_HEIGHT;
    const ghosted = new Set<string>();
    for (const u of vm.units) {
      if (u.kind !== 'entity' && u.kind !== 'enemy') continue;
      const g = this.units.get(u.id);
      if (!g) continue;
      const chest = (g.root.userData.baseY as number | undefined) ?? g.root.position.y;
      if (isOccluded(heightAt, vm.rows, u.r, u.c, chest + g.h * 0.6, this.cam.pitch, maxHeight))
        ghosted.add(u.id);
    }
    this.units.setGhosted(ghosted);
  }

  private drawOverlay(now: number): void {
    const vm = this.vm;
    this.overlay.begin();
    if (!vm) return;
    const size = Math.max(11, Math.min(16, Math.round(9 + 1.5 * this.cam.zoom)));
    const project = (p: THREE.Vector3) => this.cam.project(p);
    // one height chip per contiguous raised/sunken region and per ramp run, at the back of a free cell
    for (const reg of this.regions) {
      // players never learn the shape of ground they cannot see
      if (vm.view === 'player' && reg.cells.every((cell) => vm.cells[cell.r]?.[cell.c]?.light === 'dark'))
        continue;
      const { r, c } = reg.label;
      // at the back of the cell, or its middle when a unit's HP label already spills into the back
      const z = r + (reg.labelCost === 1 ? 0.62 : 0.22);
      const p = project(new THREE.Vector3(c + 0.5, this.tiles.topY(r, c) + 0.02, z));
      if (reg.kind === 'ramp')
        this.overlay.chip(p.x, p.y, `ramp ${ftLabel(reg.from ?? 0)} → ${ftLabel(reg.to ?? 0)}`, {
          size: size - 3,
          bold: false,
        });
      else
        this.overlay.chip(p.x, p.y, ftLabel(reg.elevation), {
          size: size - 2,
          bg: reg.elevation > 0 ? 'rgba(255,255,255,0.88)' : 'rgba(20,30,50,0.9)',
          fg: reg.elevation > 0 ? '#111' : '#9fd0ff',
        });
    }
    for (const u of vm.units) {
      if (u.kind === 'terrain' || u.kind === 'pickup') continue;
      const a = this.units.anchors(u.id);
      if (!a) continue;
      const head = project(a.head);
      // labels sit just below the ground rings (under the shadow for fliers)
      const ringFront = project(a.ground.clone().add(new THREE.Vector3(0, 0, 0.56)));
      const cellElev = vm.cells[u.r]?.[u.c]?.elevation ?? 0;
      let below = ringFront.y + size * 0.85;
      if (u.altitude > 0) {
        this.overlay.chip(head.x, head.y - size, `▲ ${u.altitude * 5} ft`, {
          size,
          bg: 'rgba(120,200,255,0.92)',
          fg: '#06182a',
        });
      } else if (cellElev !== 0) {
        const chip = this.overlay.chip(ringFront.x, below, `on ${ftLabel(cellElev)}`, {
          size: size - 2,
          bold: false,
        });
        below += chip.h + 2;
      }
      if (u.showHpNumbers && u.maxHp > 0)
        this.overlay.label(ringFront.x, below, `${u.hp}/${u.maxHp}`, size - 1);
    }
    if (vm.banner) this.overlay.banner(vm.banner);
    if (this.benchmark) {
      const s = this.stats;
      this.overlay.chip(
        this.overlay.width - 170,
        18,
        `${this.benchFrames.length} fps · ${s.lastFrameMs.toFixed(1)} ms · ${s.drawCalls} calls`,
        { size: 12, bg: 'rgba(0,0,0,0.75)', fg: '#9fffb0' },
      );
    }
    for (const t of this.texts) {
      const age = (now - t.born) / FLOAT_MS;
      let p: THREE.Vector2;
      if (t.unitId) {
        const a = this.units.anchors(t.unitId);
        if (!a) continue;
        p = project(a.head);
      } else if (t.cell) {
        p = project(
          new THREE.Vector3(t.cell.c + 0.5, this.tiles.topY(t.cell.r, t.cell.c) + 0.3, t.cell.r + 0.5),
        );
      } else continue;
      const alpha = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;
      this.overlay.outlined(p.x, p.y - size - age * size * 2.5, t.text, t.color, size + 4, alpha);
    }
  }

  private collectMarks(vm: BoardVM): Mark[] {
    const marks: Mark[] = [];
    const hl = vm.highlights;
    const push = (cells: Cell[], color: string, style: Mark['style']) => {
      for (const cell of cells) marks.push({ cell, color, style });
    };
    const unitCells = (ids: string[]): Cell[] =>
      vm.units.filter((u) => ids.includes(u.id)).map((u) => ({ r: u.r, c: u.c }));
    push(hl.placement, HIGHLIGHT.placement, 'fill');
    push(hl.move, HIGHLIGHT.move, 'fill');
    push(hl.castRange, HIGHLIGHT.castRange, 'fill');
    push(hl.areaTemplate, HIGHLIGHT.areaTemplate, 'fill');
    push(hl.areaTemplate, HIGHLIGHT.areaTemplate, 'frame');
    push(unitCells(hl.attack), HIGHLIGHT.attack, 'fill');
    push(unitCells(hl.attack), HIGHLIGHT.attack, 'frame');
    const castIds = hl.castTargets.filter((t) => t.inRange).map((t) => t.id);
    push(unitCells(castIds), HIGHLIGHT.castRange, 'fill');
    push(unitCells(castIds), HIGHLIGHT.castTarget, 'frame');
    push(unitCells(hl.areaUnits), HIGHLIGHT.areaUnit, 'frame');
    return marks;
  }

  private pointer(e: MouseEvent, button: 0 | 2): BoardPointerEvent {
    return { cell: this.hitTest(e.clientX, e.clientY), button, clientX: e.clientX, clientY: e.clientY };
  }

  private setHover(cell: Cell | null): void {
    const same =
      (cell === null && this.hoverCell === null) ||
      (cell && this.hoverCell && cell.r === this.hoverCell.r && cell.c === this.hoverCell.c);
    if (same) return;
    this.hoverCell = cell;
    this.marks.setHover(cell, (c, lift) => this.tiles.surfaceMatrix(c.r, c.c, lift));
    this.updateCutaway();
    this.invalidate();
    this.handlers.onHover?.(cell);
  }

  /** Terrain blocks standing between the hovered cell and the camera fade out. */
  private updateCutaway(): void {
    const blocks = this.units.blocks();
    const faded = new Set<THREE.Object3D>();
    if (this.hoverCell) {
      const { r, c } = this.hoverCell;
      const from = new THREE.Vector3(c + 0.5, this.tiles.topY(r, c) + 0.4, r + 0.5);
      const toCam = this.cam.toCamera;
      this.raycaster.set(from, toCam);
      for (const hit of this.raycaster.intersectObjects(blocks, false)) {
        if (hit.distance > 0.6) faded.add(hit.object);
      }
    }
    for (const b of blocks) {
      const mat = b.material as THREE.MeshLambertMaterial;
      const target = faded.has(b) ? 0.22 : 1;
      if (mat.opacity !== target) {
        mat.opacity = target;
        mat.depthWrite = target === 1;
        mat.needsUpdate = false;
      }
    }
  }

  private bindPointer(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.pressX = this.lastX = e.clientX;
      this.pressY = this.lastY = e.clientY;
      this.dragging = true;
      this.moved = false;
      canvas.focus();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.dragging) {
        if (!this.moved && Math.hypot(e.clientX - this.pressX, e.clientY - this.pressY) >= 5)
          this.moved = true;
        if (this.moved) {
          this.cam.pan(e.clientX - this.lastX, e.clientY - this.lastY);
          this.lastX = e.clientX;
          this.lastY = e.clientY;
          this.invalidate();
        }
      }
      this.setHover(this.hitTest(e.clientX, e.clientY));
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      const wasDrag = this.moved;
      this.dragging = false;
      this.moved = false;
      if (wasDrag) return;
      this.handlers.onClick?.(this.pointer(e, 0));
    });
    canvas.addEventListener('pointerleave', () => {
      this.dragging = false;
      this.setHover(null);
    });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.handlers.onContextMenu?.(this.pointer(e, 2));
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        this.cam.zoomBy(e.deltaY < 0 ? 1 : -1, e.clientX - rect.left, e.clientY - rect.top);
        this.invalidate();
      },
      { passive: false },
    );
  }
}

/**
 * Resolve a ray already set on `raycaster`: the nearest opaque sprite texel or
 * terrain block wins (so a tall sprite overlapping the tile behind it selects
 * its unit), otherwise the tile top/side that was hit.
 */
export function pickWithRay(
  raycaster: THREE.Raycaster,
  units: UnitLayer,
  tiles: TileLayer,
): { cell: Cell; unitId: string | null } | null {
  const hits = raycaster.intersectObjects([...units.pickables(), ...tiles.pickables()], false);
  // a hidden unit's silhouette is drawn over everything, so a click on it selects it
  for (const hit of hits) {
    const unit = units.isGhosted(hit.object.userData.unitId as string | undefined) ? units.unitAt(hit) : null;
    if (unit) return { cell: unit.cell, unitId: unit.id };
  }
  for (const hit of hits) {
    const unit = units.unitAt(hit);
    if (unit) return { cell: unit.cell, unitId: unit.id };
    if (hit.object.userData.unitId) continue; // transparent texel: look behind it
    const cell = tiles.cellOf(hit);
    if (cell) return { cell, unitId: null };
  }
  return null;
}

/**
 * Which cells changed for shadow purposes since the last frame: every unit
 * that appeared, vanished, moved, changed altitude or art contributes its old
 * and new cell. Selection, HP and hover never do.
 */
export function shadowChanges(
  prev: ReadonlyMap<string, string>,
  units: readonly Pick<BoardVM['units'][number], 'id' | 'r' | 'c' | 'altitude' | 'kind' | 'spritePath'>[],
): { next: Map<string, string>; cells: Cell[] } {
  const next = new Map<string, string>();
  const cells: Cell[] = [];
  const cellOf = (key: string): Cell => {
    const [r, c] = key.split(',');
    return { r: Number(r), c: Number(c) };
  };
  for (const u of units) {
    const key = `${u.r},${u.c},${u.altitude},${u.kind},${u.spritePath ?? ''}`;
    next.set(u.id, key);
    const old = prev.get(u.id);
    if (old === key) continue;
    cells.push({ r: u.r, c: u.c });
    if (old !== undefined) cells.push(cellOf(old));
  }
  for (const [id, old] of prev) if (!next.has(id)) cells.push(cellOf(old));
  return { next, cells };
}
