/**
 * Units as HD-2D billboards: upright cut-out sprites (or the initials token)
 * standing on the tile top, lit by the scene, casting their own silhouette as
 * shadow. Rings live in flat decals at the feet (or under a flier's shadow);
 * fliers get a tether with 5 ft ticks. Terrain without art is a textured
 * block; pickups are a small item icon.
 */
import * as THREE from 'three';
import type { Cell } from '../../../engine/types.ts';
import type { UnitVM } from '../../../engine/view/boardViewModel.ts';
import {
  atlasAlphaAt,
  type SpriteAtlas,
  type SpriteFrames,
  type SpriteLibrary,
} from '../../sprites/library.ts';
import { idleFrameIndex } from '../../sprites/slicer.ts';
import { BLOCK_HEIGHT, STEP, TEXELS, type CameraMode } from './constants.ts';
import { UnitDecals } from './marks.ts';
import {
  makePickupTexture,
  makeSlabTexture,
  makeTokenTexture,
  makeWallTexture,
  pixelTexture,
} from './textures.ts';

interface AtlasMaterials {
  texture: THREE.Texture;
  lit: THREE.MeshLambertMaterial;
  depth: THREE.MeshDepthMaterial;
  distance: THREE.MeshDistanceMaterial;
  ghost: THREE.MeshBasicMaterial;
}

/** Cut-out materials for one texture: lit colour, shadow depth/distance, and the see-through ghost. */
function cutoutMaterials(texture: THREE.Texture): AtlasMaterials {
  const common = { map: texture, alphaTest: 0.5 };
  return {
    texture,
    lit: spriteLitMaterial(texture),
    depth: new THREE.MeshDepthMaterial({
      ...common,
      depthPacking: THREE.RGBADepthPacking,
      side: THREE.DoubleSide,
    }),
    distance: new THREE.MeshDistanceMaterial({ ...common, side: THREE.DoubleSide }),
    ghost: ghostMaterial(texture),
  };
}

/**
 * Lit cut-out material for upright sprites. A flat billboard lit with its own
 * normal only catches lights in front of it, so a torch behind a character
 * would leave it a black silhouette. Instead the sprite is lit like the ground
 * it stands on: lighting is evaluated at a probe point just above the feet
 * (the billboard origin) with an up-facing normal. Sprites still darken in
 * darkness and brighten under lamps, matching the tile under them.
 */
export function spriteLitMaterial(texture: THREE.Texture): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    map: texture,
    alphaTest: 0.5,
    transparent: false,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vProbeView;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n\tvProbeView = ( modelViewMatrix * vec4( 0.0, 0.45, 0.0, 1.0 ) ).xyz;',
      );
    shader.fragmentShader =
      'varying vec3 vProbeView;\n' +
      shader.fragmentShader.replace(
        '#include <lights_fragment_begin>',
        THREE.ShaderChunk.lights_fragment_begin
          .replace('vec3 geometryPosition = - vViewPosition;', 'vec3 geometryPosition = vProbeView;')
          .replace(
            'vec3 geometryNormal = normal;',
            'vec3 geometryNormal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );',
          ),
      );
  };
  mat.customProgramCacheKey = () => 'sprite-ground-probe';
  return mat;
}

/**
 * See-through silhouette for units hidden behind terrain: the sprite's shape
 * in flat white at half opacity, drawn without depth so it shows through.
 */
function ghostMaterial(texture: THREE.Texture): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    alphaTest: 0.5,
    transparent: true,
    opacity: 0.5,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      'diffuseColor.rgb = vec3( 0.92, 0.96, 1.0 );\noutgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>',
    );
  };
  mat.customProgramCacheKey = () => 'sprite-ghost';
  return mat;
}

export interface UnitContext {
  topY: (r: number, c: number) => number;
  surface: (cell: Cell, lift: number) => THREE.Matrix4;
  mode: CameraMode;
  /** 1 / cos(pitch) in tactical mode */
  stretch: number;
  view: 'dm' | 'player';
  library: SpriteLibrary;
  now: number;
}

interface Node {
  id: string;
  root: THREE.Group; // at the feet (incl. altitude)
  body: THREE.Mesh | null; // billboard
  ghost: THREE.Mesh | null;
  block: THREE.Mesh | null; // terrain block / slab
  decals: UnitDecals;
  tether: THREE.Group;
  frames: SpriteFrames | null;
  frameIdx: number;
  /** billboard size in world units (before stretch) */
  w: number;
  h: number;
  tokenTex: THREE.Texture | null;
  tokenKey: string;
  u: UnitVM;
  cell: Cell;
}

const _v = new THREE.Vector3();

export class UnitLayer {
  readonly group = new THREE.Group();
  private nodes = new Map<string, Node>();
  private atlasMats = new Map<SpriteAtlas, AtlasMaterials>();
  private tokenMats = new Map<string, AtlasMaterials>();
  private wallTex = makeWallTexture();
  private slabTex = makeSlabTexture();
  private wallMats = new Map<string, THREE.MeshLambertMaterial>();
  private tickGeo = new THREE.BoxGeometry(0.16, 0.02, 0.02);
  private tickMat = new THREE.MeshBasicMaterial({ color: '#9fd0ff' });
  private tetherMat = new THREE.LineDashedMaterial({
    color: '#ffffff',
    dashSize: 0.12,
    gapSize: 0.08,
    transparent: true,
    opacity: 0.8,
  });
  /** ids whose ghost should show (occluded by terrain) */
  private ghosted = new Set<string>();

  materialsFor(atlas: SpriteAtlas): AtlasMaterials {
    let m = this.atlasMats.get(atlas);
    if (!m) {
      m = cutoutMaterials(pixelTexture(atlas.canvas));
      this.atlasMats.set(atlas, m);
    }
    return m;
  }

  private tokenMaterials(u: UnitVM): { mats: AtlasMaterials; key: string } {
    const key = `${u.side}|${u.color}|${u.initials}`;
    let m = this.tokenMats.get(key);
    if (!m) {
      m = cutoutMaterials(makeTokenTexture(u));
      this.tokenMats.set(key, m);
    }
    return { mats: m, key };
  }

  update(units: UnitVM[], ctx: UnitContext): void {
    const seen = new Set<string>();
    for (const u of units) {
      seen.add(u.id);
      let n = this.nodes.get(u.id);
      if (!n) {
        n = this.create(u);
        this.nodes.set(u.id, n);
      }
      this.apply(n, u, ctx);
    }
    for (const [id, n] of this.nodes) {
      if (seen.has(id)) continue;
      this.destroy(n);
      this.nodes.delete(id);
    }
  }

  private create(u: UnitVM): Node {
    const root = new THREE.Group();
    root.name = `unit:${u.id}`;
    const decals = new UnitDecals();
    const tether = new THREE.Group();
    this.group.add(root, decals.group, tether);
    return {
      id: u.id,
      root,
      body: null,
      ghost: null,
      block: null,
      decals,
      tether,
      frames: null,
      frameIdx: 0,
      w: 0,
      h: 0,
      tokenTex: null,
      tokenKey: '',
      u,
      cell: { r: u.r, c: u.c },
    };
  }

  private destroy(n: Node): void {
    this.group.remove(n.root, n.decals.group, n.tether);
    this.wallMats.get(n.id)?.dispose();
    this.wallMats.delete(n.id);
    n.body?.geometry.dispose();
    n.ghost?.geometry.dispose();
    if (n.block) {
      n.block.geometry.dispose();
    }
    n.decals.dispose();
    this.clearTether(n);
  }

  private clearTether(n: Node): void {
    for (const ch of [...n.tether.children]) {
      n.tether.remove(ch);
      if (ch instanceof THREE.Line) (ch.geometry as THREE.BufferGeometry).dispose();
    }
  }

  private apply(n: Node, u: UnitVM, ctx: UnitContext): void {
    n.u = u;
    n.cell = { r: u.r, c: u.c };
    const top = ctx.topY(u.r, u.c);
    const flying = u.altitude > 0;
    const feetY = top + u.altitude * STEP;
    n.root.position.set(u.c + 0.5, feetY, u.r + 0.5);
    n.root.userData.baseY = feetY;

    if (u.kind === 'terrain' && !u.spritePath) this.applyBlock(n, u, top);
    else this.applyBillboard(n, u, ctx);

    // decals: at the feet, or on the ground under a flier
    n.decals.group.matrixAutoUpdate = false;
    // top-down: sprites lie flat, so the rings go on top of them
    n.decals.group.matrix.copy(ctx.surface(n.cell, ctx.mode === 'top' ? 0.035 : 0.012));
    n.decals.group.matrixWorldNeedsUpdate = true;
    n.decals.group.visible = u.kind === 'entity' || u.kind === 'enemy';
    n.decals.update({
      side: u.side,
      hp: u.hp,
      maxHp: u.maxHp,
      showHp: u.showHpRing,
      selected: u.selected,
      active: u.active,
      flying,
      dim: u.inDarkness && ctx.view === 'dm',
    });

    // tether
    this.clearTether(n);
    if (flying && ctx.mode === 'tactical') {
      const pts = [
        new THREE.Vector3(u.c + 0.5, top + 0.02, u.r + 0.5),
        new THREE.Vector3(u.c + 0.5, feetY, u.r + 0.5),
      ];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.tetherMat);
      line.computeLineDistances();
      n.tether.add(line);
      for (let s = 1; s <= u.altitude; s++) {
        const tick = new THREE.Mesh(this.tickGeo, this.tickMat);
        tick.position.set(u.c + 0.5, top + s * STEP, u.r + 0.5);
        n.tether.add(tick);
      }
    }
  }

  private applyBlock(n: Node, u: UnitVM, top: number): void {
    if (n.body) {
      n.root.remove(n.body);
      n.body.geometry.dispose();
      n.body = null;
    }
    if (n.ghost) {
      n.root.remove(n.ghost);
      n.ghost.geometry.dispose();
      n.ghost = null;
    }
    const collision = u.terrain?.collision ?? true;
    const key = `${u.color}|${collision}`;
    let mat = this.wallMats.get(u.id);
    if (!mat || mat.userData.key !== key) {
      mat?.dispose();
      mat = new THREE.MeshLambertMaterial({
        map: collision ? this.wallTex : this.slabTex,
        color: u.color,
        transparent: true,
        opacity: 1,
      });
      mat.userData.key = key;
      this.wallMats.set(u.id, mat);
    }
    const h = collision ? BLOCK_HEIGHT : 0.06;
    if (!n.block) {
      n.block = new THREE.Mesh(new THREE.BoxGeometry(collision ? 0.98 : 0.9, 1, collision ? 0.98 : 0.9), mat);
      n.block.castShadow = true;
      n.block.receiveShadow = true;
      n.block.userData.unitId = u.id;
      n.root.add(n.block);
    }
    n.block.material = mat;
    n.block.scale.set(1, h, 1);
    n.block.position.set(0, h / 2, 0);
    n.root.position.y = top;
    n.root.userData.baseY = top;
    n.w = 1;
    n.h = h;
  }

  private applyBillboard(n: Node, u: UnitVM, ctx: UnitContext): void {
    if (n.block) {
      n.root.remove(n.block);
      n.block.geometry.dispose();
      n.block = null;
    }
    let mats: AtlasMaterials;
    let w: number, h: number;
    let rect: { x: number; y: number; w: number; h: number };
    let atlasW: number, atlasH: number;
    const frames = u.spritePath ? ctx.library.get(u.spritePath) : null;
    n.frames = frames;
    if (frames) {
      mats = this.materialsFor(frames.atlas);
      n.frameIdx = frames.animated ? idleFrameIndex(ctx.now, frames.frames.length) : 0;
      const f = frames.frames[n.frameIdx] ?? frames.frames[0];
      if (!f) return;
      rect = f;
      atlasW = frames.atlas.width;
      atlasH = frames.atlas.height;
      if (frames.single) {
        // authored art of any resolution: fit a cell footprint (like Java's scale-to-fit)
        const scale = Math.min(1 / f.w, 1.25 / f.h);
        w = f.w * scale;
        h = f.h * scale;
      } else {
        w = f.w / TEXELS;
        h = f.h / TEXELS;
      }
      n.tokenKey = '';
    } else if (u.kind === 'pickup') {
      const key = `pickup|${u.color}`;
      let m = this.tokenMats.get(key);
      if (!m) {
        m = cutoutMaterials(makePickupTexture(u.color));
        this.tokenMats.set(key, m);
      }
      mats = m;
      rect = { x: 0, y: 0, w: 8, h: 8 };
      atlasW = atlasH = 8;
      w = h = 8 / TEXELS;
    } else {
      const t = this.tokenMaterials(u);
      mats = t.mats;
      n.tokenKey = t.key;
      rect = { x: 0, y: 0, w: 128, h: 128 };
      atlasW = atlasH = 128;
      w = h = 0.8;
    }
    const stretch = ctx.mode === 'top' ? 1 : ctx.stretch;
    if (!n.body) {
      n.body = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mats.lit);
      n.body.castShadow = true;
      n.body.receiveShadow = false;
      n.body.userData.unitId = u.id;
      n.ghost = new THREE.Mesh(n.body.geometry, mats.ghost);
      n.ghost.renderOrder = 20;
      n.ghost.visible = false;
      n.root.add(n.body, n.ghost);
    }
    n.body.material = mats.lit;
    n.body.customDepthMaterial = mats.depth;
    n.body.customDistanceMaterial = mats.distance;
    if (n.ghost) n.ghost.material = mats.ghost;
    const upright =
      ctx.mode !== 'top' && !(u.kind === 'terrain' && frames?.single && !(u.terrain?.collision ?? true));
    n.w = w;
    // world-space height of what stands up from the tile (labels, ghost test)
    n.h = upright ? h * stretch : 0.05;
    setBillboardGeometry(
      n.body.geometry as THREE.PlaneGeometry,
      w,
      upright ? h * stretch : h,
      rect,
      atlasW,
      atlasH,
    );
    const flatArt = u.kind === 'terrain' && frames?.single && !(u.terrain?.collision ?? true);
    if (ctx.mode === 'top' || flatArt) {
      // lie flat on the tile, centred, head to the north
      n.body.rotation.set(-Math.PI / 2, 0, 0);
      n.body.position.set(0, 0.02, h / 2);
    } else {
      n.body.rotation.set(0, 0, 0);
      n.body.position.set(0, 0, 0);
    }
    if (n.ghost) {
      n.ghost.rotation.copy(n.body.rotation);
      n.ghost.position.copy(n.body.position);
      n.ghost.visible = this.ghosted.has(u.id);
    }
  }

  /** Advance idle animations. Returns true when any sprite changed frame. */
  tick(now: number): boolean {
    let changed = false;
    for (const n of this.nodes.values()) {
      if (!n.frames?.animated || !n.body) continue;
      const idx = idleFrameIndex(now, n.frames.frames.length);
      if (idx === n.frameIdx) continue;
      n.frameIdx = idx;
      const f = n.frames.frames[idx];
      if (!f) continue;
      setBillboardUv(n.body.geometry as THREE.PlaneGeometry, f, n.frames.atlas.width, n.frames.atlas.height);
      changed = true;
    }
    return changed;
  }

  /** Meshes a click ray should test (bodies and blocks). */
  pickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const n of this.nodes.values()) {
      if (n.body) out.push(n.body);
      if (n.block) out.push(n.block);
    }
    return out;
  }

  /** Occluders for the hidden-unit test and the hover cut-away: terrain blocks. */
  blocks(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const n of this.nodes.values()) if (n.block) out.push(n.block);
    return out;
  }

  /**
   * Resolve a ray hit on a pickable to a unit, ignoring transparent texels of
   * sprite billboards (so clicks go through the padding to whatever is behind).
   */
  unitAt(hit: THREE.Intersection): { id: string; cell: Cell } | null {
    const id = hit.object.userData.unitId as string | undefined;
    if (!id) return null;
    const n = this.nodes.get(id);
    if (!n) return null;
    if (hit.object === n.body && n.frames && hit.uv) {
      const a = atlasAlphaAt(
        n.frames.atlas,
        hit.uv.x * n.frames.atlas.width,
        (1 - hit.uv.y) * n.frames.atlas.height,
      );
      if (a < 128) return null;
    }
    return { id, cell: n.cell };
  }

  isGhosted(id: string | undefined): boolean {
    return id !== undefined && this.ghosted.has(id);
  }

  setGhosted(ids: Set<string>): void {
    this.ghosted = ids;
    for (const n of this.nodes.values()) if (n.ghost) n.ghost.visible = ids.has(n.id);
  }

  /** World anchors for overlay text. */
  anchors(
    id: string,
  ): { feet: THREE.Vector3; head: THREE.Vector3; ground: THREE.Vector3; node: UnitVM } | null {
    const n = this.nodes.get(id);
    if (!n) return null;
    const feet = n.root.position.clone();
    const head = feet.clone().add(_v.set(0, n.h, 0));
    const ground = new THREE.Vector3(n.u.c + 0.5, feet.y - n.u.altitude * STEP, n.u.r + 0.5);
    return { feet, head, ground, node: n.u };
  }

  get(id: string): { u: UnitVM; w: number; h: number; root: THREE.Group } | null {
    const n = this.nodes.get(id);
    return n ? { u: n.u, w: n.w, h: n.h, root: n.root } : null;
  }

  ids(): string[] {
    return [...this.nodes.keys()];
  }

  dispose(): void {
    for (const n of this.nodes.values()) this.destroy(n);
    this.nodes.clear();
    for (const m of [...this.atlasMats.values(), ...this.tokenMats.values()]) {
      m.lit.dispose();
      m.depth.dispose();
      m.distance.dispose();
      m.ghost.dispose();
      m.texture.dispose();
    }
    for (const m of this.wallMats.values()) m.dispose();
    this.wallTex.dispose();
    this.slabTex.dispose();
    this.tickGeo.dispose();
    this.tickMat.dispose();
    this.tetherMat.dispose();
  }
}

/** Size a unit plane with its origin at the bottom centre and map it to an atlas rect. */
export function setBillboardGeometry(
  geo: THREE.PlaneGeometry,
  w: number,
  h: number,
  rect: { x: number; y: number; w: number; h: number },
  atlasW: number,
  atlasH: number,
): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  // PlaneGeometry(1,1) vertex order: (-.5,.5) (.5,.5) (-.5,-.5) (.5,-.5)
  pos.setXYZ(0, -w / 2, h, 0);
  pos.setXYZ(1, w / 2, h, 0);
  pos.setXYZ(2, -w / 2, 0, 0);
  pos.setXYZ(3, w / 2, 0, 0);
  pos.needsUpdate = true;
  setBillboardUv(geo, rect, atlasW, atlasH);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

export function setBillboardUv(
  geo: THREE.PlaneGeometry,
  rect: { x: number; y: number; w: number; h: number },
  atlasW: number,
  atlasH: number,
): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const u0 = rect.x / atlasW,
    u1 = (rect.x + rect.w) / atlasW;
  // canvas textures are flipped: v = 1 at the top row of the canvas
  const vTop = 1 - rect.y / atlasH,
    vBottom = 1 - (rect.y + rect.h) / atlasH;
  uv.setXY(0, u0, vTop);
  uv.setXY(1, u1, vTop);
  uv.setXY(2, u0, vBottom);
  uv.setXY(3, u1, vBottom);
  uv.needsUpdate = true;
}
