/**
 * The board itself: every enabled cell is a stack of instanced 5 ft step boxes
 * (textured cap + strata sides), ramps are wedges, pits are shorter stacks.
 * Rebuilt only when the board signature changes. Also the source of truth for
 * "where is the top of cell (r, c)" and for click picking.
 */
import * as THREE from 'three';
import type { Cell } from '../../../engine/types.ts';
import type { BoardVM, CellVM } from '../../../engine/view/boardViewModel.ts';
import { BASE_STEPS, STEP } from './constants.ts';
import { makeSideTexture, makeTopTexture } from './textures.ts';

export interface TopInfo {
  /** height of the walkable surface at the cell centre */
  y: number;
  /** rotation that lays a flat decal onto the surface (identity off ramps) */
  quat: THREE.Quaternion;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

const tint = (e: number): THREE.Color => {
  if (e > 0)
    return new THREE.Color(1, 1, 1)
      .lerp(new THREE.Color('#fff2d8'), Math.min(1, e * 0.2))
      .multiplyScalar(1 + Math.min(0.45, e * 0.14));
  if (e < 0) return new THREE.Color('#aab4c8').multiplyScalar(Math.max(0.45, 1 + e * 0.18));
  return new THREE.Color(1, 1, 1);
};

export class TileLayer {
  readonly group = new THREE.Group();
  private key = '';
  private theme = '';
  private topMat!: THREE.MeshLambertMaterial;
  private sideMat!: THREE.MeshLambertMaterial;
  private steps: THREE.InstancedMesh | null = null;
  private ramps: THREE.Mesh[] = [];
  private tops = new Map<string, TopInfo>();
  rows = 0;
  cols = 0;
  minY = 0;
  maxY = 0;
  /** world-space box of the board (for camera fit) */
  bounds = new THREE.Box3();

  constructor() {
    this.setTheme('stone');
  }

  private setTheme(theme: string): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.topMat?.dispose();
    this.sideMat?.dispose();
    this.topMat = new THREE.MeshLambertMaterial({
      map: makeTopTexture(theme),
    });
    this.sideMat = new THREE.MeshLambertMaterial({
      map: makeSideTexture(theme),
    });
  }

  /** Signature of everything that changes geometry. */
  static signature(vm: BoardVM): string {
    const parts: string[] = [vm.theme, `${vm.rows}x${vm.cols}`];
    for (const row of vm.cells)
      for (const c of row)
        parts.push(
          `${c.enabled ? '' : 'x'}${c.elevation}${c.ramp ? `r${c.ramp.from}${c.ramp.to}${c.ramp.dir}` : ''}`,
        );
    return parts.join(',');
  }

  /** Returns true when the geometry was rebuilt. */
  update(vm: BoardVM): boolean {
    const key = TileLayer.signature(vm);
    if (key === this.key) return false;
    this.key = key;
    this.setTheme(vm.theme);
    this.rows = vm.rows;
    this.cols = vm.cols;
    this.build(vm);
    return true;
  }

  private clear(): void {
    for (const r of this.ramps) {
      r.geometry.dispose();
      this.group.remove(r);
    }
    this.ramps = [];
    if (this.steps) {
      this.steps.geometry.dispose();
      this.group.remove(this.steps);
      this.steps = null;
    }
    this.tops.clear();
  }

  private build(vm: BoardVM): void {
    this.clear();
    let minE = 0,
      maxE = 0;
    for (const row of vm.cells)
      for (const c of row) {
        if (!c.enabled) continue;
        const lo = c.ramp ? Math.min(c.ramp.from, c.ramp.to, c.elevation) : c.elevation;
        const hi = c.ramp ? Math.max(c.ramp.from, c.ramp.to, c.elevation) : c.elevation;
        minE = Math.min(minE, lo);
        maxE = Math.max(maxE, hi);
      }
    const baseLevel = Math.min(-BASE_STEPS, minE - 1);
    this.minY = baseLevel * STEP;
    this.maxY = maxE * STEP;

    // count instances
    const stacks: { r: number; c: number; top: number; count: number }[] = [];
    let total = 0;
    for (const row of vm.cells)
      for (const cell of row) {
        if (!cell.enabled) continue;
        const top = cell.ramp ? Math.min(cell.ramp.from, cell.ramp.to) : cell.elevation;
        const count = top - baseLevel;
        stacks.push({ r: cell.r, c: cell.c, top, count });
        total += count;
      }

    const geo = new THREE.BoxGeometry(1, STEP, 1);
    const mesh = new THREE.InstancedMesh(
      geo,
      [this.sideMat, this.sideMat, this.topMat, this.sideMat, this.sideMat, this.sideMat],
      Math.max(1, total),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'tiles';
    const cellOf: Cell[] = [];
    let i = 0;
    for (const s of stacks) {
      for (let k = 0; k < s.count; k++) {
        const level = s.top - k; // level whose top this step forms
        _p.set(s.c + 0.5, level * STEP - STEP / 2, s.r + 0.5);
        _m.compose(_p, _q.identity(), _s);
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, k === 0 ? tint(level) : new THREE.Color('#c8ccd4'));
        cellOf[i] = { r: s.r, c: s.c };
        i++;
      }
    }
    mesh.count = total;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.userData.cellOf = cellOf;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    this.steps = mesh;

    // tops + ramps
    for (const row of vm.cells)
      for (const cell of row) {
        if (!cell.enabled) continue;
        if (!cell.ramp) {
          this.tops.set(`${cell.r},${cell.c}`, { y: cell.elevation * STEP, quat: new THREE.Quaternion() });
          continue;
        }
        const ramp = cell.ramp;
        const h = this.rampHeights(ramp);
        const mesh2 = new THREE.Mesh(wedgeGeometry(h.w, h.e, h.n, h.s, Math.min(ramp.from, ramp.to) * STEP), [
          this.topMat,
          this.sideMat,
        ]);
        mesh2.position.set(cell.c, 0, cell.r);
        mesh2.castShadow = true;
        mesh2.receiveShadow = true;
        mesh2.userData.cell = { r: cell.r, c: cell.c };
        this.group.add(mesh2);
        this.ramps.push(mesh2);
        const quat = new THREE.Quaternion();
        if (ramp.dir === 'N' || ramp.dir === 'S')
          quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.atan(h.n - h.s));
        else quat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan(h.e - h.w));
        this.tops.set(`${cell.r},${cell.c}`, { y: ((ramp.from + ramp.to) / 2) * STEP, quat });
      }
    this.bounds.set(new THREE.Vector3(0, this.minY, 0), new THREE.Vector3(vm.cols, this.maxY, vm.rows));
  }

  /** Heights (world y) of the ramp's four edges; dir points from `from` toward `to`. */
  private rampHeights(ramp: NonNullable<CellVM['ramp']>): { n: number; s: number; e: number; w: number } {
    const from = ramp.from * STEP,
      to = ramp.to * STEP;
    switch (ramp.dir) {
      case 'S':
        return { n: from, s: to, e: (from + to) / 2, w: (from + to) / 2 };
      case 'N':
        return { n: to, s: from, e: (from + to) / 2, w: (from + to) / 2 };
      case 'E':
        return { w: from, e: to, n: (from + to) / 2, s: (from + to) / 2 };
      case 'W':
        return { w: to, e: from, n: (from + to) / 2, s: (from + to) / 2 };
    }
  }

  top(r: number, c: number): TopInfo {
    return this.tops.get(`${r},${c}`) ?? { y: 0, quat: new THREE.Quaternion() };
  }

  topY(r: number, c: number): number {
    return this.top(r, c).y;
  }

  /** Transform placing a flat, +y-facing decal onto the surface of a cell. */
  surfaceMatrix(r: number, c: number, lift = 0.012, out = new THREE.Matrix4()): THREE.Matrix4 {
    const t = this.top(r, c);
    return out.compose(new THREE.Vector3(c + 0.5, t.y + lift, r + 0.5), t.quat, _s);
  }

  pickables(): THREE.Object3D[] {
    return this.steps ? [this.steps, ...this.ramps] : [...this.ramps];
  }

  /** Cell for an intersection with one of pickables(). */
  cellOf(hit: THREE.Intersection): Cell | null {
    if (hit.object === this.steps && hit.instanceId !== undefined) {
      const cells = this.steps.userData.cellOf as Cell[];
      return cells[hit.instanceId] ?? null;
    }
    const cell = hit.object.userData.cell as Cell | undefined;
    return cell ?? null;
  }

  dispose(): void {
    this.clear();
    this.topMat.dispose();
    this.sideMat.dispose();
  }
}

/**
 * A cell-sized wedge: corner heights for the west/east/north/south edges (a
 * ramp slopes along one axis, so the opposite edges share a height) above a
 * flat base. Non-indexed so normals are per face. Group 0 = top, 1 = sides.
 */
export function wedgeGeometry(
  w: number,
  e: number,
  n: number,
  s: number,
  base: number,
): THREE.BufferGeometry {
  // corner heights: NW, NE, SE, SW
  const hNW = n === s ? w : n,
    hNE = n === s ? e : n,
    hSE = n === s ? e : s,
    hSW = n === s ? w : s;
  const pos: number[] = [];
  const uv: number[] = [];
  const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) => {
    pos.push(...a, ...b, ...c);
    uv.push(...ua, ...ub, ...uc);
  };
  const NW = [0, hNW, 0],
    NE = [1, hNE, 0],
    SE = [1, hSE, 1],
    SW = [0, hSW, 1];
  // top (counter-clockwise seen from above => normal +y)
  tri(NW, SW, SE, [0, 1], [0, 0], [1, 0]);
  tri(NW, SE, NE, [0, 1], [1, 0], [1, 1]);
  const topCount = pos.length / 3;
  const bNW = [0, base, 0],
    bNE = [1, base, 0],
    bSE = [1, base, 1],
    bSW = [0, base, 1];
  const quad = (p0: number[], p1: number[], p2: number[], p3: number[]) => {
    // p0,p1 top edge; p2,p3 base edge (p3 under p0, p2 under p1), outward facing
    const h0 = ((p0[1] ?? 0) - base) / STEP,
      h1 = ((p1[1] ?? 0) - base) / STEP;
    tri(p0, p3, p2, [0, h0], [0, 0], [1, 0]);
    tri(p0, p2, p1, [0, h0], [1, 0], [1, h1]);
  };
  quad(SE, SW, bSW, bSE); // south face (faces +z)
  quad(NW, NE, bNE, bNW); // north face
  quad(NE, SE, bSE, bNE); // east face
  quad(SW, NW, bNW, bSW); // west face
  // bottom
  tri(bNW, bNE, bSE, [0, 0], [1, 0], [1, 1]);
  tri(bNW, bSE, bSW, [0, 0], [1, 1], [0, 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.addGroup(0, topCount, 0);
  g.addGroup(topCount, pos.length / 3 - topCount, 1);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
