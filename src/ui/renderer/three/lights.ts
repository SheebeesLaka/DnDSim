/**
 * Scene lighting from the view model: ambient/hemisphere by `vm.ambient`
 * (plus DM reveal), a shadowed sun when the ambient is bright/dim, and one
 * PointLight per engine light (distance = dim radius). Up to MAX_SHADOW_LIGHTS
 * point lights cast shadows; their maps are refreshed only when told to.
 *
 * Changes are animated (visual only: the engine state, and with it what
 * players may see, switches at once). A light fades up or down; grouped
 * lights (or several switched on together) flicker on one after another like
 * restored power; and the room's ambient level eases to its new value.
 */
import * as THREE from 'three';
import type { BoardVM, LightVM } from '../../../engine/view/boardViewModel.ts';
import { CARRIED_HEIGHT, LAMP_HEIGHT, LIGHT_INTENSITY, MAX_SHADOW_LIGHTS, STEP } from './constants.ts';

interface PointEntry {
  light: THREE.PointLight;
  bulb: THREE.Mesh;
  /** DM-only cord from a hanging lamp down to its tile, so the bulb reads as belonging there */
  cord: THREE.Line;
  key: string;
  color: string;
  /** current brightness 0..1 (animated) */
  level: number;
  /** the engine's on/off */
  on: boolean;
  tween: { kind: LightTween; from: number; start: number; delay: number } | null;
  /** an unsteady light: its intensity wavers (torches, failing fixtures) */
  flicker: boolean;
  /** 1 for steady lights; the waver multiplier otherwise */
  waver: number;
  /** the unit carrying it, if any */
  attachedTo: string | null;
  /** its position on its tile; a carried light rides along while its unit walks */
  base: THREE.Vector3;
}

export type LightTween = 'fade-in' | 'fade-out' | 'power-on';

const FADE_IN_MS = 450;
const FADE_OUT_MS = 260;
const AMBIENT_MS = 700;
/** Flicker before a restored light settles: [until ms, level] steps, then a ramp to full. */
const FLICKER: readonly [number, number][] = [
  [60, 0.75],
  [140, 0.05],
  [190, 0.5],
  [320, 0],
];
const FLICKER_RAMP_MS = 520;
/** Longest stagger between lights of one group power-on (ms). */
const POWER_ON_STAGGER_MS = 380;
const OFF_BULB = new THREE.Color('#4a4f55');

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Brightness of an animating light `ms` after its switch; `from` is where it
 * was. A power-on waits `delay`, flickers, then ramps up. Pure, so tested.
 */
export function lightTweenLevel(
  kind: LightTween,
  ms: number,
  from: number,
  delay = 0,
): { level: number; done: boolean } {
  if (kind === 'fade-out') {
    const t = Math.min(1, Math.max(0, ms) / FADE_OUT_MS);
    return { level: from * (1 - easeOut(t)), done: t >= 1 };
  }
  if (kind === 'fade-in') {
    const t = Math.min(1, Math.max(0, ms) / FADE_IN_MS);
    return { level: from + (1 - from) * easeOut(t), done: t >= 1 };
  }
  const local = ms - delay;
  if (local < 0) return { level: from, done: false };
  for (const [until, level] of FLICKER) if (local < until) return { level, done: false };
  const last = FLICKER[FLICKER.length - 1]?.[0] ?? 0;
  const t = Math.min(1, (local - last) / FLICKER_RAMP_MS);
  return { level: easeOut(t), done: t >= 1 };
}

/** A stable 0..1 per light id, to stagger a group power-on. */
export const stagger = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};

export interface AmbientLevels {
  ambient: number;
  hemi: number;
  sun: number;
  sunColor: THREE.Color;
  /** point-light multiplier: a torch matters in the dark, barely in daylight (no blown-out sprites) */
  points: number;
}

export class LightLayer {
  readonly group = new THREE.Group();
  private ambient = new THREE.AmbientLight('#8fa6c0', 0.3);
  private hemi = new THREE.HemisphereLight('#dfe8f5', '#2a2e36', 0.3);
  private sun = new THREE.DirectionalLight('#fff2dd', 0);
  private points = new Map<string, PointEntry>();
  private bulbGeo = new THREE.SphereGeometry(0.09, 10, 8);
  private cordMat = new THREE.LineBasicMaterial({ color: '#8a96a8', transparent: true, opacity: 0.55 });
  private ambientKey = '';
  private ambientTween: { from: AmbientLevels; to: AmbientLevels; start: number } | null = null;
  private pointScale = 1;
  private heading = 0;
  private board = { rows: 1, cols: 1 };

  constructor() {
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.autoUpdate = false;
    this.sun.shadow.intensity = 0.75;
    this.group.add(this.ambient, this.hemi, this.sun, this.sun.target);
  }

  update(
    vm: BoardVM,
    topY: (r: number, c: number) => number,
    altitudeOf: (id: string) => number,
    now = performance.now(),
  ): void {
    this.updateAmbient(vm, now);
    // a grouped light, or several lights switched on in one change, is a room power-on: flicker in
    const switchedOn = vm.lights.filter((l) => {
      const e = this.points.get(l.id);
      return e !== undefined && l.on && !e.on;
    }).length;
    const seen = new Set<string>();
    const shadowBudget = { left: MAX_SHADOW_LIGHTS };
    // moving (attached) lights first so they keep their shadows when the budget is tight
    const ordered = [...vm.lights].sort(
      (a, b) => Number(Boolean(b.attachedTo)) - Number(Boolean(a.attachedTo)),
    );
    for (const l of ordered) {
      seen.add(l.id);
      const ground = topY(l.r, l.c);
      const y = ground + (l.attachedTo ? altitudeOf(l.attachedTo) * STEP + CARRIED_HEIGHT : LAMP_HEIGHT);
      const key = `${l.r},${l.c},${y},${ground},${l.on},${l.color},${l.brightRadius},${l.dimRadius}`;
      let e = this.points.get(l.id);
      if (!e) {
        const light = new THREE.PointLight(l.color, 0, 1, 0);
        light.shadow.mapSize.set(512, 512);
        light.shadow.bias = -0.004;
        light.shadow.normalBias = 0.03;
        light.shadow.camera.near = 0.2;
        light.shadow.autoUpdate = false;
        light.shadow.intensity = 0.8; // dark, never a black hole
        const bulb = new THREE.Mesh(
          this.bulbGeo,
          new THREE.MeshBasicMaterial({ color: l.color, toneMapped: false }),
        );
        const cord = new THREE.Line(new THREE.BufferGeometry(), this.cordMat);
        this.group.add(light, bulb, cord);
        // a light that already exists when the board loads is simply on or off
        e = {
          light,
          bulb,
          cord,
          key: '',
          color: l.color,
          level: l.on ? 1 : 0,
          on: l.on,
          tween: null,
          flicker: false,
          waver: 1,
          attachedTo: null,
          base: new THREE.Vector3(),
        };
        this.points.set(l.id, e);
      }
      if (l.on !== e.on) {
        e.on = l.on;
        const kind: LightTween = !l.on ? 'fade-out' : l.groupId || switchedOn >= 2 ? 'power-on' : 'fade-in';
        const delay = kind === 'power-on' ? stagger(l.id) * POWER_ON_STAGGER_MS : 0;
        e.tween = { kind, from: e.level, start: now, delay };
      }
      e.attachedTo = l.attachedTo ?? null;
      if (e.key !== key) {
        e.key = key;
        this.applyPoint(e, l, y, ground);
      }
      e.flicker = l.flicker === true;
      if (!e.flicker && e.waver !== 1) {
        e.waver = 1;
        this.applyLevel(e);
      }
      // keep the shadow while a switched-off light fades, so it doesn't pop
      const wantsShadow = (l.on || e.level > 0) && shadowBudget.left > 0;
      if (wantsShadow) shadowBudget.left--;
      if (e.light.castShadow !== wantsShadow) {
        e.light.castShadow = wantsShadow;
        e.light.shadow.needsUpdate = true;
      }
      // attached lights ride a unit: the bulb would sit inside the sprite, so hide it
      e.bulb.visible = !l.attachedTo && vm.view === 'dm';
      e.cord.visible = e.bulb.visible;
    }
    for (const [id, e] of this.points) {
      if (seen.has(id)) continue;
      this.group.remove(e.light, e.bulb, e.cord);
      (e.bulb.material as THREE.Material).dispose();
      e.cord.geometry.dispose();
      e.light.dispose();
      this.points.delete(id);
    }
  }

  /**
   * No distance decay: the angle between the floor and the light does the
   * falloff (a lamp-height cone), and the cutoff window is sized so the dim
   * radius still reads as lit (~0.35 of full) and nothing beyond it is.
   */
  private applyPoint(e: PointEntry, l: LightVM, y: number, ground: number): void {
    e.light.position.set(l.c + 0.5, y, l.r + 0.5);
    e.light.color.set(l.color);
    const h = Math.max(0.5, y - ground);
    e.light.distance = 1.25 * Math.hypot(Math.max(l.dimRadius, l.brightRadius) + 0.5, h);
    e.light.decay = 0;
    e.color = l.color;
    this.applyLevel(e);
    e.base.copy(e.light.position);
    e.bulb.position.copy(e.light.position);
    e.cord.geometry.dispose();
    e.cord.geometry = new THREE.BufferGeometry().setFromPoints([
      e.light.position.clone(),
      new THREE.Vector3(e.light.position.x, ground + 0.02, e.light.position.z),
    ]);
    e.light.shadow.needsUpdate = true;
  }

  /** Light intensity and bulb glow for the entry's current level. */
  private applyLevel(e: PointEntry): void {
    e.light.intensity = LIGHT_INTENSITY * e.level * this.pointScale * e.waver;
    e.light.visible = e.level > 0.001;
    const mat = e.bulb.material as THREE.MeshBasicMaterial;
    // > 1 when lit so bloom picks the bulb up
    mat.color.copy(OFF_BULB).lerp(new THREE.Color(e.color).multiplyScalar(2.6), e.level);
  }

  /** Advance light and ambient transitions. Returns true while anything is still changing. */
  tick(now = performance.now()): boolean {
    let busy = false;
    for (const e of this.points.values()) {
      if (e.flicker && e.level > 0) {
        // two detuned waves plus a rare dip: reads as a flame / a failing tube, not a strobe
        const t = now / 1000;
        e.waver =
          0.82 +
          0.1 * Math.sin(t * 9.3 + e.color.length) +
          0.06 * Math.sin(t * 23.7) -
          (Math.sin(t * 1.7) > 0.97 ? 0.25 : 0);
        this.applyLevel(e);
        busy = true;
      }
      if (!e.tween) continue;
      const { level, done } = lightTweenLevel(e.tween.kind, now - e.tween.start, e.tween.from, e.tween.delay);
      e.level = level;
      if (done) e.tween = null;
      this.applyLevel(e);
      busy = true;
    }
    if (this.ambientTween) {
      const tw = this.ambientTween;
      const t = Math.min(1, (now - tw.start) / AMBIENT_MS);
      this.setAmbientLevels(lerpLevels(tw.from, tw.to, easeInOut(t)));
      if (t >= 1) this.ambientTween = null;
      busy = true;
    }
    return busy;
  }

  /** Brightness (0..1) a light is showing right now; tests and the debug panel. */
  levelOf(id: string): number | null {
    return this.points.get(id)?.level ?? null;
  }

  private currentLevels(): AmbientLevels {
    return {
      ambient: this.ambient.intensity,
      hemi: this.hemi.intensity,
      sun: this.sun.intensity,
      sunColor: this.sun.color.clone(),
      points: this.pointScale,
    };
  }

  private setAmbientLevels(l: AmbientLevels): void {
    this.ambient.intensity = l.ambient;
    this.hemi.intensity = l.hemi;
    this.sun.intensity = l.sun;
    this.sun.color.copy(l.sunColor);
    this.sun.visible = l.sun > 0.001;
    if (l.points !== this.pointScale) {
      this.pointScale = l.points;
      for (const e of this.points.values()) this.applyLevel(e);
    }
  }

  private updateAmbient(vm: BoardVM, now: number): void {
    if (vm.rows !== this.board.rows || vm.cols !== this.board.cols) {
      this.board = { rows: vm.rows, cols: vm.cols };
      this.placeSun();
    }
    const key = `${vm.ambient}|${vm.ambientLevel ?? ''}|${vm.view}|${vm.dmReveal}`;
    if (key === this.ambientKey) return;
    const first = this.ambientKey === '';
    this.ambientKey = key;
    const to =
      vm.ambientLevel !== undefined
        ? ambientLevelsAt(vm.ambientLevel, vm.view, vm.dmReveal)
        : ambientLevels(vm.ambient, vm.view, vm.dmReveal);
    if (first) {
      this.ambientTween = null;
      this.setAmbientLevels(to);
    } else this.ambientTween = { from: this.currentLevels(), to, start: now };
    this.sun.shadow.needsUpdate = true;
  }

  /**
   * Key light from camera-left and a little toward the camera: of the two
   * side faces on screen, the left one is lit and the right one falls into
   * shade, which is what makes steps read as solid.
   */
  private placeSun(): void {
    const { rows, cols } = this.board;
    const span = Math.max(rows, cols, 1);
    const sin = Math.sin(this.heading),
      cos = Math.cos(this.heading);
    // right = (cos, -sin), toward camera = (sin, cos) in (x, z)
    const gx = -0.75 * cos + 0.45 * sin,
      gz = 0.75 * sin + 0.45 * cos;
    this.sun.position.set(cols / 2 + gx * span, span * 1.2, rows / 2 + gz * span);
    this.sun.target.position.set(cols / 2, 0, rows / 2);
    const cam = this.sun.shadow.camera;
    cam.left = -span * 0.8;
    cam.right = span * 0.8;
    cam.top = span * 0.8;
    cam.bottom = -span * 0.8;
    cam.near = 1;
    cam.far = span * 4;
    cam.updateProjectionMatrix();
    this.sun.shadow.needsUpdate = true;
  }

  /** The camera turned: move the key light with it. */
  setHeading(heading: number): void {
    if (heading === this.heading) return;
    this.heading = heading;
    this.placeSun();
  }

  /**
   * Carried lights follow their unit while it walks (`offsetOf` gives how far it is from its
   * tile, or null when it stands there). Returns true when any light moved.
   */
  carry(offsetOf: (unitId: string) => THREE.Vector3 | null): boolean {
    let moved = false;
    for (const e of this.points.values()) {
      if (!e.attachedTo) continue;
      const off = offsetOf(e.attachedTo);
      const x = e.base.x + (off?.x ?? 0),
        y = e.base.y + (off?.y ?? 0),
        z = e.base.z + (off?.z ?? 0);
      if (e.light.position.x === x && e.light.position.y === y && e.light.position.z === z) continue;
      e.light.position.set(x, y, z);
      e.bulb.position.copy(e.light.position);
      if (e.light.castShadow) e.light.shadow.needsUpdate = true;
      moved = true;
    }
    return moved;
  }

  /** Something that casts shadows moved: refresh every shadow map on the next frame. */
  markShadowsDirty(): void {
    this.sun.shadow.needsUpdate = true;
    for (const e of this.points.values()) if (e.light.castShadow) e.light.shadow.needsUpdate = true;
  }

  /**
   * Something changed at these cells: refresh the sun's map and the maps of the
   * shadowed point lights that reach them (each point light re-renders six cube
   * faces, so far-away lights are left alone). Returns how many point maps were marked.
   */
  markShadowsDirtyNear(cells: readonly { r: number; c: number }[]): number {
    if (cells.length === 0) return 0;
    this.sun.shadow.needsUpdate = true;
    let marked = 0;
    for (const e of this.points.values()) {
      if (!e.light.castShadow) continue;
      const reach = e.light.distance + 1.5; // + a tall sprite's shadow reaching back into range
      const near = cells.some(
        (cell) => Math.hypot(cell.c + 0.5 - e.light.position.x, cell.r + 0.5 - e.light.position.z) <= reach,
      );
      if (near) {
        e.light.shadow.needsUpdate = true;
        marked++;
      }
    }
    return marked;
  }

  dispose(): void {
    for (const e of this.points.values()) {
      e.light.dispose();
      (e.bulb.material as THREE.Material).dispose();
      e.cord.geometry.dispose();
    }
    this.points.clear();
    this.bulbGeo.dispose();
    this.cordMat.dispose();
    this.sun.dispose();
  }
}

const lerpLevels = (a: AmbientLevels, b: AmbientLevels, t: number): AmbientLevels => ({
  ambient: a.ambient + (b.ambient - a.ambient) * t,
  hemi: a.hemi + (b.hemi - a.hemi) * t,
  sun: a.sun + (b.sun - a.sun) * t,
  sunColor: a.sunColor.clone().lerp(b.sunColor, t),
  points: a.points + (b.points - a.points) * t,
});

/**
 * Room-wide light for an ambient level. Three's Lambert divides irradiance by
 * pi, so an intensity of ~3 means "full albedo". Bright rooms lean on the sun
 * (a key light) over flat ambient so the two side faces of a step differ;
 * dark rooms keep the DM's reveal low and cool so torch and lamp pools still
 * stand out in the DM's own view; players get almost nothing.
 */
export function ambientLevels(
  level: BoardVM['ambient'],
  view: BoardVM['view'],
  dmReveal: boolean,
): AmbientLevels {
  if (level === 'bright')
    return { ambient: 0.95, hemi: 0.8, sun: 2.6, sunColor: new THREE.Color('#fff2dd'), points: 0.3 };
  if (level === 'dim')
    return { ambient: 0.5, hemi: 0.4, sun: 0.9, sunColor: new THREE.Color('#b9c8ff'), points: 0.7 };
  const reveal = view === 'dm' ? (dmReveal ? 0.55 : 0.22) : 0.06;
  return { ambient: reveal, hemi: reveal * 0.6, sun: 0, sunColor: new THREE.Color('#b9c8ff'), points: 1 };
}

/**
 * The 0–100 ambient slider as room light: 0 is the dark profile, 35 the dim one,
 * 100 the bright one, blended in between so every notch of the slider shows.
 */
export function ambientLevelsAt(level: number, view: BoardVM['view'], dmReveal: boolean): AmbientLevels {
  const v = Math.max(0, Math.min(100, level));
  const dark = ambientLevels('dark', view, dmReveal);
  const dim = ambientLevels('dim', view, dmReveal);
  const bright = ambientLevels('bright', view, dmReveal);
  return v <= 35 ? lerpLevels(dark, dim, v / 35) : lerpLevels(dim, bright, (v - 35) / 65);
}
