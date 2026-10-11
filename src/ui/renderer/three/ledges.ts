/**
 * Ledge cues that make height read from across a room: wherever a tile top is
 * higher than its neighbour's, the high side gets a bright one-texel lip and a
 * dark outline along the drop, the cliff gets dark vertical edges where the
 * wall ends, and the low side gets a soft contact shadow along the foot of the
 * wall. Built once per board rebuild as three merged meshes. Ramps are left
 * out (their side edges slope); neighbours outside the board count as the
 * scenery floor, so the board's own edge reads as a ledge too.
 */
import * as THREE from 'three';
import type { CellVM } from '../../../engine/view/boardViewModel.ts';
import { STEP, TEXELS } from './constants.ts';

/** Height of the scenery floor around the board (half a step below elevation 0). */
export const SKIRT_TOP = -0.5 * STEP;
/** Width of the contact shadow on the low side, in cells. */
const AO_WIDTH = 0.42;
const LIP_WIDTH = 1 / TEXELS;
const EPS = 1e-4;

export interface Ledge {
  /** the high cell */
  r: number;
  c: number;
  /** direction from the high cell to the low side */
  dr: number;
  dc: number;
  /** tops (world y) on either side of the edge */
  high: number;
  low: number;
  /** the low side is a board cell (gets a contact shadow) */
  lowIsCell: boolean;
}

const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/** Every edge where a flat cell's top drops to a lower neighbour (or off the board). */
export function findLedges(cells: CellVM[][]): Ledge[] {
  const out: Ledge[] = [];
  const at = (r: number, c: number): CellVM | undefined => cells[r]?.[c];
  for (const row of cells)
    for (const cell of row) {
      if (!cell.enabled || cell.ramp) continue;
      const high = cell.elevation * STEP;
      for (const [dr, dc] of DIRS) {
        const n = at(cell.r + dr, cell.c + dc);
        if (n?.enabled && n.ramp) continue; // ramps slope: no crisp edge to mark
        const lowIsCell = Boolean(n?.enabled);
        const low = lowIsCell && n ? n.elevation * STEP : SKIRT_TOP;
        if (high > low + EPS) out.push({ r: cell.r, c: cell.c, dr, dc, high, low, lowIsCell });
      }
    }
  return out;
}

/**
 * The shared edge of a ledge as two ground points (x, z), ordered so that
 * walking from a to b keeps the high cell on the left when looking down the
 * drop direction.
 */
function edgeOf(l: Ledge): { ax: number; az: number; bx: number; bz: number } {
  const { r, c, dr, dc } = l;
  if (dr === -1) return { ax: c, az: r, bx: c + 1, bz: r };
  if (dr === 1) return { ax: c + 1, az: r + 1, bx: c, bz: r + 1 };
  if (dc === -1) return { ax: c, az: r + 1, bx: c, bz: r };
  return { ax: c + 1, az: r, bx: c + 1, bz: r + 1 };
}

export interface LedgeMeshes {
  lips: THREE.Mesh;
  shadows: THREE.Mesh;
  outlines: THREE.LineSegments;
  dispose(): void;
}

export function buildLedgeMeshes(cells: CellVM[][]): LedgeMeshes {
  const ledges = findLedges(cells);
  const lipPos: number[] = [];
  const aoPos: number[] = [];
  const aoCol: number[] = [];
  const linePos: number[] = [];
  const key = (l: Ledge) => `${l.r},${l.c},${l.dr},${l.dc}`;
  const byKey = new Map(ledges.map((l) => [key(l), l]));

  // quad as two triangles, counter-clockwise seen from above
  const quad = (out: number[], p: number[][]) => {
    const [p0, p1, p2, p3] = p as [number[], number[], number[], number[]];
    out.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
  };

  for (const l of ledges) {
    const e = edgeOf(l);
    // inward = toward the high cell, opposite the drop
    const ix = -l.dc,
      iz = -l.dr;
    const yTop = l.high + 0.004;
    // lip: a one-texel strip just inside the edge on the high top
    quad(lipPos, [
      [e.ax, yTop, e.az],
      [e.ax + ix * LIP_WIDTH, yTop, e.az + iz * LIP_WIDTH],
      [e.bx + ix * LIP_WIDTH, yTop, e.bz + iz * LIP_WIDTH],
      [e.bx, yTop, e.bz],
    ]);
    // outline along the drop, nudged out and up so the box edge doesn't hide it
    const ox = l.dc * 0.004,
      oz = l.dr * 0.004;
    linePos.push(e.ax + ox, l.high + 0.003, e.az + oz, e.bx + ox, l.high + 0.003, e.bz + oz);
    // vertical edges where this wall ends (the wall doesn't continue into the next cell along it)
    for (const [ex, ez, sr, sc] of [
      [e.ax, e.az, l.r - (e.bz - e.az), l.c - (e.bx - e.ax)],
      [e.bx, e.bz, l.r + (e.bz - e.az), l.c + (e.bx - e.ax)],
    ] as const) {
      const next = byKey.get(`${sr},${sc},${l.dr},${l.dc}`);
      const continues = next && next.high >= l.high - EPS && next.low <= l.low + EPS;
      if (continues) continue;
      linePos.push(ex + ox, l.high, ez + oz, ex + ox, l.low, ez + oz);
    }
    // contact shadow on the low cell, darker under taller walls
    if (l.lowIsCell) {
      const a = Math.min(0.62, 0.3 + ((l.high - l.low) / STEP) * 0.11);
      const y = l.low + 0.003;
      const w = AO_WIDTH;
      // from the edge (dark) outward over the low cell (clear)
      const p0 = [e.bx, y, e.bz],
        p1 = [e.bx + l.dc * w, y, e.bz + l.dr * w],
        p2 = [e.ax + l.dc * w, y, e.az + l.dr * w],
        p3 = [e.ax, y, e.az];
      quad(aoPos, [p0, p1, p2, p3]);
      const dark = [0, 0, 0, a],
        clear = [0, 0, 0, 0];
      aoCol.push(...dark, ...clear, ...clear, ...dark, ...clear, ...dark);
    }
  }

  const geo = (pos: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  const lipGeo = geo(lipPos);
  const lipMat = new THREE.MeshLambertMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lips = new THREE.Mesh(lipGeo, lipMat);
  lips.name = 'ledge-lips';
  lips.renderOrder = 2;

  const aoGeo = geo(aoPos);
  aoGeo.setAttribute('color', new THREE.Float32BufferAttribute(aoCol, 4));
  const aoMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shadows = new THREE.Mesh(aoGeo, aoMat);
  shadows.name = 'ledge-shadows';
  shadows.renderOrder = 1;

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: '#07090d', transparent: true, opacity: 0.8 });
  const outlines = new THREE.LineSegments(lineGeo, lineMat);
  outlines.name = 'ledge-outlines';

  return {
    lips,
    shadows,
    outlines,
    dispose() {
      lipGeo.dispose();
      lipMat.dispose();
      aoGeo.dispose();
      aoMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
    },
  };
}
