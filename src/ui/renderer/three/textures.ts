/**
 * Procedural pixel-art textures at the sprite texel density (TEXELS per cell):
 * terrain blocks, props, pickups and the fallback token face (tile tops and
 * sides live in tileThemes.ts). Every texture: nearest filtering, no mipmaps,
 * sRGB — the HD-2D crisp-pixel contract.
 */
import * as THREE from 'three';
import { TEXELS } from './constants.ts';
import type { UnitVM } from '../../../engine/view/boardViewModel.ts';
import { SIDE_COLORS } from './constants.ts';

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
};

export function pixelTexture(c: HTMLCanvasElement, opts: { smooth?: boolean } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = opts.smooth ? THREE.LinearFilter : THREE.NearestFilter;
  t.minFilter = opts.smooth ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
  t.generateMipmaps = Boolean(opts.smooth);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export const shade = (hex: string, f: number): string => {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * f);
  c.g = Math.min(1, c.g * f);
  c.b = Math.min(1, c.b * f);
  return `#${c.getHexString()}`;
};

/** Rock wall for collision terrain without a sprite (tinted by the terrain colour). */
export function makeWallTexture(seed = 3): THREE.CanvasTexture {
  const [c, ctx] = canvas(TEXELS, TEXELS);
  const r = rng(seed);
  ctx.fillStyle = '#9a9ea6';
  ctx.fillRect(0, 0, TEXELS, TEXELS);
  for (let y = 0; y < TEXELS; y++)
    for (let x = 0; x < TEXELS; x++)
      if (r() < 0.22) {
        ctx.fillStyle = r() < 0.5 ? '#80848c' : '#b0b4bc';
        ctx.fillRect(x, y, 1, 1);
      }
  ctx.fillStyle = '#6a6e76';
  ctx.fillRect(0, 5, TEXELS, 1);
  ctx.fillRect(0, 11, TEXELS, 1);
  ctx.fillRect(6, 0, 1, 5);
  ctx.fillRect(11, 6, 1, 5);
  ctx.fillRect(3, 12, 1, 4);
  return pixelTexture(c);
}

/** Flat hazard (acid/water-like) slab for non-collision terrain without a sprite. */
export function makeSlabTexture(seed = 5): THREE.CanvasTexture {
  const [c, ctx] = canvas(TEXELS, TEXELS);
  const r = rng(seed);
  ctx.fillStyle = '#d0d0d0';
  ctx.fillRect(0, 0, TEXELS, TEXELS);
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = r() < 0.5 ? '#ffffff' : '#a8a8a8';
    ctx.fillRect(Math.floor(r() * TEXELS), Math.floor(r() * TEXELS), 2, 1);
  }
  return pixelTexture(c);
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/**
 * Fallback token for units without a sprite: the mockups' initials disc
 * (party = circle, enemy = rounded square) at 4 px per texel so the initials
 * stay readable; used on the same billboard as sprites.
 */
export function makeTokenTexture(u: Pick<UnitVM, 'side' | 'color' | 'initials'>): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const d = S * 0.86,
    r = d / 2,
    x = S / 2,
    y = S / 2;
  const shape = () => {
    if (u.side === 'enemy') roundRect(ctx, x - r, y - r, d, d, d * 0.22);
    else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  };
  shape();
  ctx.fillStyle = u.color;
  ctx.fill();
  shape();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();
  shape();
  ctx.lineWidth = d * 0.09;
  ctx.strokeStyle = SIDE_COLORS[u.side];
  ctx.stroke();
  ctx.font = `800 ${Math.round(d * 0.42)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = d * 0.08;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(u.initials, x, y + 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(u.initials, x, y + 2);
  return pixelTexture(c, { smooth: true });
}

/** A small item icon (diamond with a glint) for pickups. */
export function makePickupTexture(color: string): THREE.CanvasTexture {
  const S = 8;
  const [c, ctx] = canvas(S, S);
  const px = (x: number, y: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  };
  const dark = shade(color, 0.6),
    light = shade(color, 1.35);
  const rows = [
    [3, 4],
    [2, 5],
    [1, 6],
    [0, 7],
    [1, 6],
    [2, 5],
    [3, 4],
  ];
  rows.forEach(([a, b], i) => {
    const y = i + 1;
    for (let x = a ?? 0; x <= (b ?? 0); x++) px(x, y, y < 4 ? color : dark);
  });
  px(3, 1, light);
  px(2, 2, light);
  px(3, 2, '#ffffff');
  px(0, 4, dark);
  px(7, 4, dark);
  return pixelTexture(c);
}

/** 1x1 white: used where a plain colour is wanted on a textured material slot. */
export function whiteTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(1, 1);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1, 1);
  return pixelTexture(c);
}

/** Riveted metal plate (crates, consoles, bulkheads, pipes), tinted by the material colour. */
export function makeMetalTexture(seed = 13): THREE.CanvasTexture {
  const [c, ctx] = canvas(TEXELS, TEXELS);
  const r = rng(seed);
  ctx.fillStyle = '#b4b8c0';
  ctx.fillRect(0, 0, TEXELS, TEXELS);
  for (let y = 0; y < TEXELS; y++)
    for (let x = 0; x < TEXELS; x++)
      if (r() < 0.1) {
        ctx.fillStyle = r() < 0.6 ? '#a4a8b0' : '#c4c8d0';
        ctx.fillRect(x, y, 1, 1);
      }
  ctx.fillStyle = '#7c8088'; // seams
  ctx.fillRect(0, 0, TEXELS, 1);
  ctx.fillRect(0, 0, 1, TEXELS);
  ctx.fillRect(0, 8, TEXELS, 1);
  ctx.fillStyle = '#e2e4ea'; // bevel highlight
  ctx.fillRect(1, 1, TEXELS - 1, 1);
  ctx.fillRect(1, 9, TEXELS - 1, 1);
  ctx.fillStyle = '#6a6e76'; // rivets
  for (const [x, y] of [
    [2, 3],
    [13, 3],
    [2, 12],
    [13, 12],
  ] as const)
    ctx.fillRect(x, y, 1, 1);
  return pixelTexture(c);
}

/** Leafy canopy / moss (bushes, trees, planters). */
export function makeLeafTexture(seed = 17): THREE.CanvasTexture {
  const [c, ctx] = canvas(TEXELS, TEXELS);
  const r = rng(seed);
  ctx.fillStyle = '#436a34';
  ctx.fillRect(0, 0, TEXELS, TEXELS);
  for (let i = 0; i < 70; i++) {
    const v = r();
    ctx.fillStyle = v < 0.45 ? '#355a2a' : v < 0.85 ? '#56834a' : '#76a35e';
    ctx.fillRect(Math.floor(r() * TEXELS), Math.floor(r() * TEXELS), v < 0.45 ? 2 : 1, 1);
  }
  return pixelTexture(c);
}

/** Tree bark. */
export function makeBarkTexture(seed = 19): THREE.CanvasTexture {
  const [c, ctx] = canvas(TEXELS, TEXELS);
  const r = rng(seed);
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(0, 0, TEXELS, TEXELS);
  for (let x = 0; x < TEXELS; x += 3) {
    ctx.fillStyle = '#553a24';
    ctx.fillRect(x, 0, 1, TEXELS);
  }
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = '#7f5b3b';
    ctx.fillRect(Math.floor(r() * TEXELS), Math.floor(r() * TEXELS), 1, 2);
  }
  return pixelTexture(c);
}

/** A console screen: dark glass with a few bright readout lines (used unlit, so it glows). */
export function makeScreenTexture(seed = 23): THREE.CanvasTexture {
  const [c, ctx] = canvas(TEXELS, TEXELS / 2);
  const r = rng(seed);
  ctx.fillStyle = '#0d2a33';
  ctx.fillRect(0, 0, TEXELS, TEXELS / 2);
  for (let y = 1; y < TEXELS / 2 - 1; y += 2) {
    const w = 3 + Math.floor(r() * 9);
    ctx.fillStyle = r() < 0.25 ? '#ffcf5a' : '#5ff2ff';
    ctx.fillRect(2, y, w, 1);
  }
  return pixelTexture(c);
}
