/**
 * Tombstones where party members perished: a small rounded headstone with an
 * engraved cross on a dirt mound, standing on the tile top and turned to the
 * camera heading so its face always reads. Decoration only: never picked,
 * never blocks the tile. The name goes in the 2D overlay.
 */
import * as THREE from 'three';
import { canvas, pixelTexture, rng } from './textures.ts';
import { TEXELS } from './constants.ts';

export interface GraveVM {
  id: string;
  r: number;
  c: number;
  name: string;
}

/** Headstone silhouette: a slab with a round top, centred on x, standing on y = 0. */
function headstoneGeometry(): THREE.BufferGeometry {
  const w = 0.46,
    h = 0.56,
    r = w / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, h - r);
  shape.absarc(0, h - r, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 10 });
  geo.translate(0, 0, -0.05);
  // planar UVs: the stone texture spans the whole face, so the engraving sits centred
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + r) / w, pos.getY(i) / h);
  uv.needsUpdate = true;
  return geo;
}

function stoneTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(TEXELS, TEXELS);
  const r = rng(83);
  ctx.fillStyle = '#9aa0a8';
  ctx.fillRect(0, 0, TEXELS, TEXELS);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = r() < 0.5 ? '#868c94' : '#aeb4bc';
    ctx.fillRect(Math.floor(r() * TEXELS), Math.floor(r() * TEXELS), 1, 1);
  }
  // engraved cross in the upper middle of the face
  ctx.fillStyle = '#5c6168';
  ctx.fillRect(7, 3, 2, 8);
  ctx.fillRect(5, 5, 6, 2);
  return pixelTexture(c);
}

export class GraveLayer {
  readonly group = new THREE.Group();
  private key = '';
  private heading = 0;
  private stoneGeo = headstoneGeometry();
  private moundGeo = new THREE.BoxGeometry(0.56, 0.06, 0.66);
  private stoneMat = new THREE.MeshLambertMaterial({ map: stoneTexture() });
  private moundMat = new THREE.MeshLambertMaterial({ color: '#4a3b2c' });
  private stones: THREE.Mesh[] = [];

  constructor() {
    this.group.name = 'graves';
  }

  update(graves: readonly GraveVM[], topY: (r: number, c: number) => number): void {
    const key = graves.map((g) => `${g.id}@${g.r},${g.c},${topY(g.r, g.c)}`).join('|');
    if (key === this.key) return;
    this.key = key;
    for (const ch of [...this.group.children]) this.group.remove(ch);
    this.stones = [];
    for (const g of graves) {
      const y = topY(g.r, g.c);
      const root = new THREE.Group();
      root.position.set(g.c + 0.5, y, g.r + 0.5);
      root.userData.graveId = g.id;
      const mound = new THREE.Mesh(this.moundGeo, this.moundMat);
      mound.position.y = 0.03;
      mound.receiveShadow = true;
      const stone = new THREE.Mesh(this.stoneGeo, this.stoneMat);
      // at the head of the mound (the far side from the camera)
      stone.position.set(0, 0.03, -0.22);
      stone.castShadow = true;
      stone.receiveShadow = true;
      root.add(mound, stone);
      this.group.add(root);
      this.stones.push(stone);
    }
    this.orient();
  }

  /** The camera turned: keep every headstone facing it. */
  setHeading(heading: number): void {
    if (heading === this.heading) return;
    this.heading = heading;
    this.orient();
  }

  private orient(): void {
    for (const root of this.group.children) root.rotation.y = this.heading;
  }

  /** World point just in front of a grave's mound (overlay name labels). */
  labelPoint(g: GraveVM, topY: (r: number, c: number) => number): THREE.Vector3 {
    return new THREE.Vector3(g.c + 0.5, topY(g.r, g.c) + 0.02, g.r + 0.5).add(
      new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(0.36),
    );
  }

  get count(): number {
    return this.stones.length;
  }

  dispose(): void {
    this.stoneGeo.dispose();
    this.moundGeo.dispose();
    this.stoneMat.map?.dispose();
    this.stoneMat.dispose();
    this.moundMat.dispose();
  }
}
