/**
 * The scenery skirt: a few rings of non-playable floor around the board (and
 * in its disabled cells), half a step below elevation 0 so the playable edge
 * reads as a ledge, dressed with seeded props for the theme and fading into
 * the backdrop with distance. It is decoration only: never picked, never part
 * of the camera fit or the tilt-shift focus band, and it casts no shadows (the
 * point lights' shadow maps stay as cheap as before). Props near the board are
 * kept low so they never stand in front of a playable tile.
 */
import * as THREE from 'three';
import type { BoardVM } from '../../../engine/view/boardViewModel.ts';
import { PITCH_TACTICAL } from './constants.ts';
import { SKIRT_TOP } from './ledges.ts';
import {
  makeBarkTexture,
  makeLeafTexture,
  makeMetalTexture,
  makeScreenTexture,
  makeWallTexture,
} from './textures.ts';
import { makeSideTexture, makeTopAtlas, topVariant, topVariantMaterial } from './tileThemes.ts';

/** Rings of scenery around the board's bounding rectangle. */
export const SKIRT_RINGS = 8;
const FLOOR_DEPTH = 3;

export type PropKind = 'crate' | 'console' | 'pillar' | 'pipe' | 'rock' | 'bush' | 'tree' | 'planter';

/** Which props dress each theme, with relative weights. */
export const THEME_PROPS: Record<string, Partial<Record<PropKind, number>>> = {
  stone: { rock: 3, pillar: 1, crate: 1 },
  grass: { bush: 3, tree: 2, rock: 1 },
  dirt: { rock: 3, crate: 1, bush: 1 },
  facility: { crate: 3, console: 2, pipe: 2, pillar: 1 },
  arboretum: { bush: 3, tree: 2, planter: 2, pipe: 1 },
};

/** Height of each prop (world units), for the "never in front of the board" rule. */
const PROP_HEIGHT: Record<PropKind, number> = {
  crate: 0.62,
  console: 0.62,
  pillar: 2.2,
  pipe: 0.3,
  rock: 0.45,
  bush: 0.55,
  tree: 1.9,
  planter: 0.4,
};

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance (cells) from a skirt cell's centre to the nearest playable cell centre. */
export function skirtDistances(vm: Pick<BoardVM, 'rows' | 'cols' | 'cells'>, rings = SKIRT_RINGS) {
  const edge: [number, number][] = [];
  const enabled = (r: number, c: number) => Boolean(vm.cells[r]?.[c]?.enabled);
  for (let r = 0; r < vm.rows; r++)
    for (let c = 0; c < vm.cols; c++) {
      if (!enabled(r, c)) continue;
      if (!enabled(r - 1, c) || !enabled(r + 1, c) || !enabled(r, c - 1) || !enabled(r, c + 1))
        edge.push([r, c]);
    }
  const out: { r: number; c: number; d: number }[] = [];
  for (let r = -rings; r < vm.rows + rings; r++)
    for (let c = -rings; c < vm.cols + rings; c++) {
      if (enabled(r, c)) continue;
      let d = Infinity;
      for (const [er, ec] of edge) d = Math.min(d, Math.hypot(er - r, ec - c));
      if (edge.length === 0) d = rings;
      out.push({ r, c, d });
    }
  return out;
}

/** Brightness of a skirt cell: full next to the board, black at the outer ring. */
export const skirtFade = (d: number, rings = SKIRT_RINGS): number => {
  const t = Math.max(0, Math.min(1, (d - 1) / (rings - 1.5)));
  return (1 - t) ** 1.6;
};

/** Tallest prop that may stand `d` cells from the board without covering a board tile on screen. */
export const maxPropHeight = (d: number): number => Math.max(0, (d - 1.15) * Math.tan(PITCH_TACTICAL));

interface PropDef {
  geo: THREE.BufferGeometry;
  mats: THREE.Material | THREE.Material[];
}

export class SkirtLayer {
  readonly group = new THREE.Group();
  private key = '';
  private disposables: { dispose(): void }[] = [];

  constructor() {
    this.group.name = 'skirt';
  }

  static signature(vm: BoardVM): string {
    const mask = vm.cells.map((row) => row.map((c) => (c.enabled ? '1' : '0')).join('')).join('/');
    return `${vm.theme}|${vm.rows}x${vm.cols}|${mask}`;
  }

  /** Rebuild when the theme, size or shape changed. Returns true when rebuilt. */
  update(vm: BoardVM): boolean {
    const key = SkirtLayer.signature(vm);
    if (key === this.key) return false;
    this.key = key;
    this.clear();
    this.build(vm);
    return true;
  }

  private track<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  private clear(): void {
    for (const ch of [...this.group.children]) this.group.remove(ch);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  private build(vm: BoardVM): void {
    const cells = skirtDistances(vm);
    const shown = cells.filter((s) => skirtFade(s.d) > 0.01);
    // floor
    const topTex = this.track(makeTopAtlas(vm.theme, 29));
    const sideTex = this.track(makeSideTexture(vm.theme, 31));
    const topMat = this.track(topVariantMaterial(topTex));
    const sideMat = this.track(new THREE.MeshLambertMaterial({ map: sideTex }));
    const floorGeo = this.track(new THREE.BoxGeometry(1, FLOOR_DEPTH, 1));
    floorGeo.setAttribute(
      'aVariant',
      new THREE.InstancedBufferAttribute(
        Float32Array.from(shown, (s) => topVariant(s.r, s.c)),
        1,
      ),
    );
    const floor = new THREE.InstancedMesh(
      floorGeo,
      [sideMat, sideMat, topMat, sideMat, sideMat, sideMat],
      Math.max(1, shown.length),
    );
    floor.name = 'skirt-floor';
    floor.receiveShadow = true;
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    shown.forEach((s, i) => {
      m.makeTranslation(s.c + 0.5, SKIRT_TOP - FLOOR_DEPTH / 2, s.r + 0.5);
      floor.setMatrixAt(i, m);
      // a touch darker than the board so the playable area pops
      floor.setColorAt(i, col.setScalar(0.5 * skirtFade(s.d)));
    });
    floor.count = shown.length;
    floor.instanceMatrix.needsUpdate = true;
    if (floor.instanceColor) floor.instanceColor.needsUpdate = true;
    this.group.add(floor);
    this.buildProps(vm, shown);
  }

  private propDefs(): Record<PropKind, PropDef> {
    const wall = this.track(makeWallTexture(41));
    const metal = this.track(makeMetalTexture());
    const leaf = this.track(makeLeafTexture());
    const bark = this.track(makeBarkTexture());
    const screen = this.track(makeScreenTexture());
    const lambert = (map: THREE.Texture, color = '#ffffff') =>
      this.track(new THREE.MeshLambertMaterial({ map, color }));
    const box = (w: number, h: number, d: number, y0 = 0) =>
      this.track(new THREE.BoxGeometry(w, h, d).translate(0, y0 + h / 2, 0));
    const merge = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
      // concatenate non-indexed copies, one material group per part
      const g = new THREE.BufferGeometry();
      const pos: number[] = [],
        nor: number[] = [],
        uv: number[] = [];
      let start = 0;
      parts.forEach((p, i) => {
        const q = p.index ? p.toNonIndexed() : p;
        pos.push(...(q.getAttribute('position').array as Float32Array));
        nor.push(...(q.getAttribute('normal').array as Float32Array));
        uv.push(...(q.getAttribute('uv').array as Float32Array));
        const n = q.getAttribute('position').count;
        g.addGroup(start, n, i);
        start += n;
      });
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return this.track(g);
    };
    const screenMat = this.track(new THREE.MeshBasicMaterial({ map: screen, toneMapped: false }));
    return {
      crate: { geo: box(0.62, 0.62, 0.62), mats: lambert(metal, '#8a6d48') },
      console: {
        geo: merge([
          box(0.8, 0.55, 0.42),
          this.track(new THREE.PlaneGeometry(0.62, 0.22).translate(0, 0.38, 0.215)),
        ]),
        mats: [lambert(metal, '#7f8a96'), screenMat],
      },
      pillar: { geo: box(0.5, PROP_HEIGHT.pillar, 0.5), mats: lambert(metal, '#8d96a3') },
      pipe: {
        geo: this.track(
          new THREE.CylinderGeometry(0.13, 0.13, 1, 8).rotateZ(Math.PI / 2).translate(0, 0.15, 0),
        ),
        mats: lambert(metal, '#9aa4ae'),
      },
      rock: {
        geo: this.track(new THREE.DodecahedronGeometry(0.32, 0).scale(1, 0.7, 1).translate(0, 0.2, 0)),
        mats: lambert(wall, '#9a948a'),
      },
      bush: { geo: box(0.62, PROP_HEIGHT.bush, 0.62), mats: lambert(leaf) },
      tree: {
        geo: merge([box(0.22, 0.8, 0.22), box(0.95, 0.7, 0.95, 0.75), box(0.6, 0.45, 0.6, 1.45)]),
        mats: [lambert(bark), lambert(leaf), lambert(leaf, '#d8f0c0')],
      },
      planter: {
        geo: merge([box(0.9, 0.3, 0.9), box(0.78, 0.12, 0.78, 0.28)]),
        mats: [lambert(metal, '#6e7884'), lambert(leaf)],
      },
    };
  }

  private buildProps(vm: BoardVM, cells: { r: number; c: number; d: number }[]): void {
    const weights = THEME_PROPS[vm.theme] ?? THEME_PROPS.stone ?? {};
    const kinds = Object.entries(weights) as [PropKind, number][];
    const total = kinds.reduce((s, [, w]) => s + w, 0);
    if (total <= 0) return;
    const r = rng(vm.rows * 131 + vm.cols * 17 + vm.theme.length);
    const placed: Record<string, { m: THREE.Matrix4; fade: number }[]> = {};
    const pick = (): PropKind => {
      let x = r() * total;
      for (const [k, w] of kinds) {
        x -= w;
        if (x <= 0) return k;
      }
      return kinds[0]?.[0] ?? 'rock';
    };
    for (const s of cells) {
      if (s.d < 2 || r() > 0.2) continue;
      let kind = pick();
      // too tall to stand this close: fall back to something low from the same theme
      if (PROP_HEIGHT[kind] > maxPropHeight(s.d)) {
        const low = kinds.filter(([k]) => PROP_HEIGHT[k] <= maxPropHeight(s.d));
        if (low.length === 0) continue;
        kind = (low[Math.floor(r() * low.length)] ?? low[0])?.[0] ?? kind;
      }
      const yaw = (Math.floor(r() * 4) * Math.PI) / 2 + (kind === 'crate' ? (r() - 0.5) * 0.3 : 0);
      const jx = (r() - 0.5) * 0.25,
        jz = (r() - 0.5) * 0.25;
      const scale = kind === 'tree' || kind === 'bush' || kind === 'rock' ? 0.8 + r() * 0.4 : 1;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(s.c + 0.5 + jx, SKIRT_TOP, s.r + 0.5 + jz),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
        new THREE.Vector3(scale, Math.min(scale, maxPropHeight(s.d) / PROP_HEIGHT[kind]), scale),
      );
      (placed[kind] ??= []).push({ m, fade: skirtFade(s.d) });
      // a stacked crate now and then
      if (kind === 'crate' && r() < 0.3 && maxPropHeight(s.d) > 1.3) {
        const top = m.clone().premultiply(new THREE.Matrix4().makeTranslation(0, 0.62, 0));
        (placed.crate ??= []).push({ m: top, fade: skirtFade(s.d) });
      }
    }
    const defs = this.propDefs();
    const col = new THREE.Color();
    for (const [kind, list] of Object.entries(placed) as [PropKind, { m: THREE.Matrix4; fade: number }[]][]) {
      const def = defs[kind];
      const mesh = new THREE.InstancedMesh(def.geo, def.mats, list.length);
      mesh.name = `skirt-${kind}`;
      mesh.receiveShadow = true;
      list.forEach((p, i) => {
        mesh.setMatrixAt(i, p.m);
        mesh.setColorAt(i, col.setScalar(0.8 * p.fade));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
    }
  }

  dispose(): void {
    this.clear();
  }
}
