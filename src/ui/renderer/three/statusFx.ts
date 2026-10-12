/**
 * Status effects drawn on the board, so the table sees them on the TV too:
 * flames at a burning creature's feet, a halo on a blessed head, a frost ring,
 * a shield bubble around the whole sprite, a light shaft on an illuminated
 * target, stars over a stunned one, and a family-coloured aura for anything
 * else. Additive and unlit (they glow in the dark), depth-tested against the
 * board, never pickable. Textures are drawn once on canvases.
 */
import * as THREE from 'three';
import type { UnitVM } from '../../../engine/view/boardViewModel.ts';
import { FAMILY_COLOR, statusArtKey, type StatusArtKey } from '../../statusKeys.ts';

export interface FxAnchor {
  feet: THREE.Vector3;
  head: THREE.Vector3;
  ground: THREE.Vector3;
}

type Tex = 'flame' | 'ring' | 'glow' | 'bubble' | 'beam' | 'star';
const texCache = new Map<Tex, THREE.Texture>();

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tex(kind: Tex): THREE.Texture {
  const hit = texCache.get(kind);
  if (hit) return hit;
  let t: THREE.Texture;
  switch (kind) {
    case 'flame':
      t = canvasTex(64, 128, (g) => {
        const grad = g.createRadialGradient(32, 108, 4, 32, 90, 60);
        grad.addColorStop(0, 'rgba(255,248,200,1)');
        grad.addColorStop(0.35, 'rgba(255,170,60,0.95)');
        grad.addColorStop(0.75, 'rgba(255,70,20,0.55)');
        grad.addColorStop(1, 'rgba(255,40,0,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(32, 4);
        g.bezierCurveTo(46, 40, 62, 70, 56, 100);
        g.bezierCurveTo(52, 124, 12, 124, 8, 100);
        g.bezierCurveTo(2, 70, 18, 40, 32, 4);
        g.fill();
      });
      break;
    case 'ring':
      t = canvasTex(128, 128, (g) => {
        const grad = g.createRadialGradient(64, 64, 34, 64, 64, 62);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.55, 'rgba(255,255,255,0.95)');
        grad.addColorStop(0.7, 'rgba(255,255,255,0.5)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
      });
      break;
    case 'glow':
      t = canvasTex(32, 32, (g) => {
        const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 32, 32);
      });
      break;
    case 'bubble':
      t = canvasTex(128, 128, (g) => {
        const grad = g.createRadialGradient(64, 64, 20, 64, 64, 63);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.72, 'rgba(255,255,255,0.08)');
        grad.addColorStop(0.93, 'rgba(255,255,255,0.75)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = 'rgba(255,255,255,0.55)';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(64, 64, 46, Math.PI * 1.1, Math.PI * 1.45);
        g.stroke();
      });
      break;
    case 'beam':
      t = canvasTex(32, 128, (g) => {
        const grad = g.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.7, 'rgba(255,255,255,0.55)');
        grad.addColorStop(1, 'rgba(255,255,255,0.85)');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(10, 0);
        g.lineTo(22, 0);
        g.lineTo(32, 128);
        g.lineTo(0, 128);
        g.fill();
      });
      break;
    case 'star':
      t = canvasTex(32, 32, (g) => {
        g.fillStyle = '#fff';
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 15 : 6;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
        }
        g.fill();
      });
      break;
  }
  texCache.set(kind, t);
  return t;
}

const additive = (map: THREE.Texture, color: string, opacity: number) =>
  new THREE.SpriteMaterial({
    map,
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

const flatMaterial = (map: THREE.Texture, color: string, opacity: number) =>
  new THREE.MeshBasicMaterial({
    map,
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** One visual on one creature: built once, re-posed every frame. */
interface Part {
  obj: THREE.Object3D;
  pose: (a: FxAnchor, t: number, h: number) => void;
}

function sprite(map: THREE.Texture, color: string, opacity: number): THREE.Sprite {
  const s = new THREE.Sprite(additive(map, color, opacity));
  s.renderOrder = 5;
  return s;
}

function flat(map: THREE.Texture, color: string, opacity: number): THREE.Mesh {
  const m = new THREE.Mesh(flatGeo, flatMaterial(map, color, opacity));
  m.renderOrder = 4;
  return m;
}

function build(key: StatusArtKey, family: string, seed: number): Part[] {
  const parts: Part[] = [];
  const rand = (k: number) => {
    const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  switch (key) {
    case 'burning': {
      for (let i = 0; i < 3; i++) {
        const s = sprite(tex('flame'), '#ffffff', 0.9);
        const ox = (i - 1) * 0.16,
          oz = (rand(i) - 0.5) * 0.12;
        parts.push({
          obj: s,
          pose: (a, t) => {
            const k = 1 + 0.18 * Math.sin(t * 11 + i * 2.1) + 0.08 * Math.sin(t * 23 + i);
            const w = (i === 1 ? 0.44 : 0.34) * k;
            s.scale.set(w, w * 1.9, 1);
            s.position.set(a.feet.x + ox, a.feet.y + w * 0.85, a.feet.z + oz);
            s.material.opacity = 0.75 + 0.2 * Math.sin(t * 17 + i * 3);
          },
        });
      }
      for (let i = 0; i < 4; i++) {
        const s = sprite(tex('glow'), '#ffb050', 0.9);
        parts.push({
          obj: s,
          pose: (a, t, h) => {
            const life = (t * 0.6 + rand(i + 9)) % 1;
            s.scale.setScalar(0.07 * (1 - life));
            s.position.set(
              a.feet.x + (rand(i) - 0.5) * 0.5 + Math.sin(t * 3 + i) * 0.05,
              a.feet.y + life * h * 0.9,
              a.feet.z + (rand(i + 4) - 0.5) * 0.3,
            );
          },
        });
      }
      const ground = flat(tex('glow'), '#ff6a1f', 0.55);
      parts.push({
        obj: ground,
        pose: (a, t) => (
          ground.scale.set(0.95 + 0.05 * Math.sin(t * 9), 1, 0.7),
          ground.position.set(a.ground.x, a.ground.y + 0.02, a.ground.z)
        ),
      });
      break;
    }
    case 'blessed': {
      const halo = flat(tex('ring'), '#ffd76a', 0.95);
      parts.push({
        obj: halo,
        pose: (a, t) => {
          halo.scale.set(0.42, 1, 0.42);
          halo.position.set(a.head.x, a.head.y + 0.06 + 0.025 * Math.sin(t * 2.2), a.head.z);
        },
      });
      for (let i = 0; i < 3; i++) {
        const m = sprite(tex('glow'), '#fff1b0', 0.9);
        parts.push({
          obj: m,
          pose: (a, t, h) => {
            const life = (t * 0.35 + rand(i)) % 1;
            m.scale.setScalar(0.06 * Math.sin(life * Math.PI));
            const ang = rand(i + 3) * 6.28 + t * 0.6;
            m.position.set(
              a.feet.x + Math.cos(ang) * 0.3,
              a.feet.y + life * h * 1.05,
              a.feet.z + Math.sin(ang) * 0.3,
            );
          },
        });
      }
      break;
    }
    case 'chilled': {
      const ring = flat(tex('ring'), '#bfe8ff', 0.85);
      parts.push({
        obj: ring,
        pose: (a, t) => (
          ring.scale.set(0.95, 1, 0.95),
          (ring.rotation.y = t * 0.3),
          ring.position.set(a.ground.x, a.ground.y + 0.03, a.ground.z)
        ),
      });
      const tint = sprite(tex('glow'), '#8fd3ff', 0.32);
      parts.push({
        obj: tint,
        pose: (a, _t, h) => (
          tint.scale.set(0.9, h * 1.1, 1),
          tint.position.set(a.feet.x, a.feet.y + h * 0.5, a.feet.z)
        ),
      });
      for (let i = 0; i < 4; i++) {
        const s = sprite(tex('star'), '#d9f3ff', 0.8);
        const ang = (i / 4) * Math.PI * 2 + 0.4;
        parts.push({
          obj: s,
          pose: (a, t) => (
            s.scale.setScalar(0.09 + 0.02 * Math.sin(t * 4 + i)),
            s.position.set(
              a.ground.x + Math.cos(ang) * 0.4,
              a.ground.y + 0.08,
              a.ground.z + Math.sin(ang) * 0.32,
            )
          ),
        });
      }
      break;
    }
    case 'shield': {
      const b = sprite(tex('bubble'), '#ffe7a1', 0.7);
      parts.push({
        obj: b,
        pose: (a, t, h) => {
          const k = 1 + 0.02 * Math.sin(t * 2.4);
          b.scale.set(Math.max(0.95, h * 0.78) * k, (h + 0.35) * k, 1);
          b.position.set(a.feet.x, a.feet.y + (h + 0.35) / 2 - 0.12, a.feet.z);
        },
      });
      const ring = flat(tex('ring'), '#ffe7a1', 0.55);
      parts.push({
        obj: ring,
        pose: (a) => (
          ring.scale.set(1, 1, 0.8),
          ring.position.set(a.ground.x, a.ground.y + 0.03, a.ground.z)
        ),
      });
      break;
    }
    case 'illuminated': {
      const beam = sprite(tex('beam'), '#e3d6ff', 0.75);
      parts.push({
        obj: beam,
        pose: (a, t, h) => {
          beam.scale.set(0.7, h + 2.4, 1);
          beam.position.set(a.feet.x, a.feet.y + (h + 2.4) / 2 - 0.1, a.feet.z);
          beam.material.opacity = 0.6 + 0.12 * Math.sin(t * 1.6);
        },
      });
      const pool = flat(tex('glow'), '#e8dcff', 0.5);
      parts.push({
        obj: pool,
        pose: (a) => (
          pool.scale.set(0.9, 1, 0.7),
          pool.position.set(a.ground.x, a.ground.y + 0.02, a.ground.z)
        ),
      });
      break;
    }
    case 'stun':
    case 'fear': {
      for (let i = 0; i < 3; i++) {
        const s = sprite(tex('star'), key === 'stun' ? '#fff3a0' : '#c9b6ff', 0.95);
        parts.push({
          obj: s,
          pose: (a, t) => {
            const ang = t * 2.6 + (i * Math.PI * 2) / 3;
            s.scale.setScalar(0.11);
            s.position.set(a.head.x + Math.cos(ang) * 0.24, a.head.y + 0.12, a.head.z + Math.sin(ang) * 0.24);
          },
        });
      }
      break;
    }
    case 'poison':
    case 'regen': {
      const color = key === 'poison' ? '#9dff6a' : '#7ee787';
      for (let i = 0; i < 4; i++) {
        const s = sprite(tex('glow'), color, 0.85);
        parts.push({
          obj: s,
          pose: (a, t, h) => {
            const life = (t * 0.45 + rand(i)) % 1;
            s.scale.setScalar(0.09 * Math.sin(life * Math.PI));
            s.position.set(
              a.feet.x + (rand(i + 2) - 0.5) * 0.5,
              a.feet.y + 0.1 + life * h,
              a.feet.z + (rand(i + 6) - 0.5) * 0.3,
            );
          },
        });
      }
      break;
    }
    case 'invisible':
      break; // nothing glows on someone you cannot see
    case 'held':
    case 'prone':
    case 'readied':
    case 'delay':
    case 'up':
    case 'down':
    case 'arrival':
    case 'dot': {
      // held, prone and anything without its own art: a slow aura ring in the family colour
      const color =
        key === 'held' ? '#b89cff' : (FAMILY_COLOR[family as keyof typeof FAMILY_COLOR] ?? '#9fc3d9');
      const ring = flat(tex('ring'), color, 0.6);
      parts.push({
        obj: ring,
        pose: (a, t) => (
          ring.scale.set(0.85 + 0.05 * Math.sin(t * 2), 1, 0.7),
          ring.position.set(a.ground.x, a.ground.y + 0.025, a.ground.z)
        ),
      });
    }
  }
  return parts;
}

interface UnitFx {
  key: string;
  parts: Part[];
}

export class StatusFxLayer {
  readonly group = new THREE.Group();
  private fx = new Map<string, UnitFx>();
  private last = 0;

  /** Rebuild the effects of creatures whose statuses changed. */
  update(units: readonly UnitVM[]): void {
    const seen = new Set<string>();
    for (const u of units) {
      const effects = u.effects ?? [];
      if (effects.length === 0) continue;
      seen.add(u.id);
      const keys = [...new Set(effects.map((e) => `${statusArtKey(e.name, e.family)}:${e.family}`))].sort();
      const key = keys.join('|');
      const cur = this.fx.get(u.id);
      if (cur?.key === key) continue;
      if (cur) this.drop(cur);
      let seed = 0;
      for (const ch of u.id) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
      const parts = keys.flatMap((k) => {
        const [art, family] = k.split(':') as [StatusArtKey, string];
        return build(art, family, seed);
      });
      for (const p of parts) this.group.add(p.obj);
      this.fx.set(u.id, { key, parts });
    }
    for (const [id, f] of this.fx)
      if (!seen.has(id)) {
        this.drop(f);
        this.fx.delete(id);
      }
  }

  private drop(f: UnitFx): void {
    for (const p of f.parts) {
      this.group.remove(p.obj);
      const mat = (p.obj as THREE.Mesh).material as THREE.Material | undefined;
      mat?.dispose();
    }
  }

  get active(): boolean {
    return this.fx.size > 0;
  }

  /**
   * Re-pose every effect on its creature (they move, tween, fly). Throttled to
   * ~30 fps: returns true when it moved anything, so the renderer redraws.
   */
  tick(now: number, anchors: (id: string) => (FxAnchor & { h: number }) | null): boolean {
    if (this.fx.size === 0 || now - this.last < 33) return false;
    this.last = now;
    const t = now / 1000;
    for (const [id, f] of this.fx) {
      const a = anchors(id);
      const visible = a !== null;
      for (const p of f.parts) {
        p.obj.visible = visible;
        if (a) p.pose(a, t, a.h);
      }
    }
    return true;
  }

  destroy(): void {
    for (const f of this.fx.values()) this.drop(f);
    this.fx.clear();
  }
}
