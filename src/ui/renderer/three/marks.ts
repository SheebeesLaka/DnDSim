/**
 * Flat decals on tile tops: cell highlights (fills and frames), the hover
 * frame, and per-unit rings (team ring, HP arc, selected/active rings, the
 * flier's ground shadow). All geometry is pre-rotated to face +y so an
 * instance/mesh matrix from TileLayer.surfaceMatrix lays it on the surface.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Cell } from '../../../engine/types.ts';
import { ACTIVE_COLOR, SELECTED_COLOR, SIDE_COLORS, hpColor } from './constants.ts';
import type { Side } from '../../../engine/view/boardViewModel.ts';

const flat = <G extends THREE.BufferGeometry>(g: G): G => {
  g.rotateX(-Math.PI / 2);
  return g;
};

const squareFrame = (outer: number, inner: number): THREE.ShapeGeometry => {
  const s = new THREE.Shape();
  s.moveTo(-outer / 2, -outer / 2);
  s.lineTo(outer / 2, -outer / 2);
  s.lineTo(outer / 2, outer / 2);
  s.lineTo(-outer / 2, outer / 2);
  s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-inner / 2, -inner / 2);
  hole.lineTo(-inner / 2, inner / 2);
  hole.lineTo(inner / 2, inner / 2);
  hole.lineTo(inner / 2, -inner / 2);
  hole.closePath();
  s.holes.push(hole);
  return flat(new THREE.ShapeGeometry(s));
};

const decalMaterial = (opacity: number, extra: Partial<THREE.MeshBasicMaterialParameters> = {}) =>
  new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
    ...extra,
  });

export interface Mark {
  cell: Cell;
  color: string;
  style: 'fill' | 'frame';
}

/** Instanced cell highlights. */
export class MarkLayer {
  readonly group = new THREE.Group();
  private fills: THREE.InstancedMesh;
  private frames: THREE.InstancedMesh;
  private readonly fillGeo = flat(new THREE.PlaneGeometry(0.96, 0.96));
  private readonly frameGeo = squareFrame(0.94, 0.82);
  private readonly fillMat = decalMaterial(0.32);
  private readonly frameMat = decalMaterial(0.92);
  readonly hover: THREE.Mesh;

  constructor() {
    this.fills = this.make(this.fillGeo, this.fillMat, 64);
    this.frames = this.make(this.frameGeo, this.frameMat, 64);
    this.hover = new THREE.Mesh(squareFrame(1, 0.9), decalMaterial(0.7, { color: '#ffffff' }));
    this.hover.visible = false;
    this.hover.renderOrder = 3;
    this.group.add(this.hover);
  }

  private make(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.count = 0;
    m.renderOrder = 2;
    m.frustumCulled = false;
    this.group.add(m);
    return m;
  }

  private ensure(
    mesh: THREE.InstancedMesh,
    needed: number,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
  ): THREE.InstancedMesh {
    if (needed <= mesh.instanceMatrix.count) return mesh;
    this.group.remove(mesh);
    mesh.dispose();
    return this.make(geo, mat, Math.max(needed, mesh.instanceMatrix.count * 2));
  }

  set(marks: Mark[], surface: (cell: Cell, lift: number) => THREE.Matrix4): void {
    const fills = marks.filter((m) => m.style === 'fill');
    const frames = marks.filter((m) => m.style === 'frame');
    this.fills = this.ensure(this.fills, fills.length, this.fillGeo, this.fillMat);
    this.frames = this.ensure(this.frames, frames.length, this.frameGeo, this.frameMat);
    const apply = (mesh: THREE.InstancedMesh, list: Mark[], lift: number) => {
      list.forEach((m, i) => {
        mesh.setMatrixAt(i, surface(m.cell, lift));
        mesh.setColorAt(i, new THREE.Color(m.color));
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    apply(this.fills, fills, 0.01);
    apply(this.frames, frames, 0.014);
  }

  setHover(cell: Cell | null, surface: (cell: Cell, lift: number) => THREE.Matrix4): void {
    this.hover.visible = cell !== null;
    if (cell) {
      this.hover.matrixAutoUpdate = false;
      this.hover.matrix.copy(surface(cell, 0.016));
      this.hover.matrixWorldNeedsUpdate = true;
    }
  }

  dispose(): void {
    this.fills.dispose();
    this.frames.dispose();
    this.fillGeo.dispose();
    this.frameGeo.dispose();
    this.fillMat.dispose();
    this.frameMat.dispose();
  }
}

/** The rings under one unit (or under a flier's shadow). */
export class UnitDecals {
  readonly group = new THREE.Group();
  private team: THREE.Mesh;
  /** DM-only: the unit stands in darkness and is hidden from players */
  private teamDashed: THREE.Mesh;
  private hpTrack: THREE.Mesh;
  private hpArc: THREE.Mesh;
  private selected: THREE.Mesh;
  private active: THREE.Mesh;
  private shadow: THREE.Mesh;
  private pct = -1;

  constructor() {
    const ring = (inner: number, outer: number, color: string, opacity = 1, theta = Math.PI * 2) =>
      new THREE.Mesh(
        flat(new THREE.RingGeometry(inner, outer, 40, 1, Math.PI / 2, theta)),
        decalMaterial(opacity, { color }),
      );
    // radii stay inside the cell: team < HP arc < selected double ring < active ring
    this.team = ring(0.26, 0.3, '#ffffff');
    const dashes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++)
      dashes.push(new THREE.RingGeometry(0.26, 0.3, 4, 1, (i * Math.PI * 2) / 12, (Math.PI * 2) / 24));
    this.teamDashed = new THREE.Mesh(flat(mergeGeometries(dashes)), decalMaterial(0.9, { color: '#ffffff' }));
    for (const d of dashes) d.dispose();
    this.hpTrack = ring(0.32, 0.37, '#000000', 0.55);
    this.hpArc = ring(0.32, 0.37, '#4CAF50');
    const sel = [new THREE.RingGeometry(0.392, 0.414, 40), new THREE.RingGeometry(0.432, 0.454, 40)];
    this.selected = new THREE.Mesh(flat(mergeGeometries(sel)), decalMaterial(1, { color: SELECTED_COLOR }));
    for (const g of sel) g.dispose();
    this.active = ring(0.468, 0.5, ACTIVE_COLOR);
    this.shadow = new THREE.Mesh(
      flat(new THREE.CircleGeometry(0.34, 24)),
      decalMaterial(0.55, { color: '#000000' }),
    );
    this.shadow.scale.set(1, 1, 0.7);
    for (const m of [
      this.shadow,
      this.team,
      this.teamDashed,
      this.hpTrack,
      this.hpArc,
      this.selected,
      this.active,
    ]) {
      m.renderOrder = 4;
      this.group.add(m);
    }
    this.group.renderOrder = 4;
  }

  update(o: {
    side: Side;
    hp: number;
    maxHp: number;
    showHp: boolean;
    selected: boolean;
    active: boolean;
    flying: boolean;
    dim: boolean;
  }): void {
    (this.team.material as THREE.MeshBasicMaterial).color.set(SIDE_COLORS[o.side]);
    (this.teamDashed.material as THREE.MeshBasicMaterial).color.set(SIDE_COLORS[o.side]);
    this.team.visible = !o.dim;
    this.teamDashed.visible = o.dim;
    const pct = o.showHp && o.maxHp > 0 ? Math.max(0, Math.min(1, o.hp / o.maxHp)) : -1;
    this.hpTrack.visible = pct >= 0;
    this.hpArc.visible = pct > 0;
    if (pct !== this.pct) {
      this.pct = pct;
      if (pct > 0) {
        this.hpArc.geometry.dispose();
        // negative thetaLength is not allowed: start at top and sweep clockwise by using thetaStart offset
        this.hpArc.geometry = flat(
          new THREE.RingGeometry(0.32, 0.37, 40, 1, Math.PI / 2 - Math.PI * 2 * pct, Math.PI * 2 * pct),
        );
        (this.hpArc.material as THREE.MeshBasicMaterial).color.set(hpColor(pct));
      }
    }
    this.selected.visible = o.selected;
    this.active.visible = o.active;
    this.shadow.visible = o.flying;
  }

  dispose(): void {
    for (const m of [
      this.shadow,
      this.team,
      this.teamDashed,
      this.hpTrack,
      this.hpArc,
      this.selected,
      this.active,
    ]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
