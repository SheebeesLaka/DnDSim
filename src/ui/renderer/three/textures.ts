/**
 * Procedural pixel-art textures at the sprite texel density (TEXELS per cell),
 * plus the fallback token face. Every texture: nearest filtering, no mipmaps,
 * sRGB — the HD-2D crisp-pixel contract.
 */
import * as THREE from 'three';
import { STEP_TEXELS, TEXELS } from './constants.ts';
import type { UnitVM } from '../../../engine/view/boardViewModel.ts';
import { SIDE_COLORS } from './constants.ts';

const THEME_BASE: Record<string, { top: string; grain: string; side: string }> = {
  stone: { top: '#6b7079', grain: '#5c6169', side: '#4e535d' },
  grass: { top: '#5f8a3f', grain: '#527a35', side: '#6a553f' },
  dirt: { top: '#8a6b47', grain: '#79593a', side: '#5e4a35' },
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

const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
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

const shade = (hex: string, f: number): string => {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * f);
  c.g = Math.min(1, c.g * f);
  c.b = Math.min(1, c.b * f);
  return `#${c.getHexString()}`;
};

/** Tile top: base colour, speckle grain, a darker one-texel rim so the grid reads. */
export function makeTopTexture(theme: string, seed = 7): THREE.CanvasTexture {
  const pal = THEME_BASE[theme] ?? THEME_BASE.stone;
  const base = pal ?? { top: '#6b7079', grain: '#5c6169', side: '#3b3f47' };
  const [c, ctx] = canvas(TEXELS, TEXELS);
  const r = rng(seed);
  ctx.fillStyle = base.top;
  ctx.fillRect(0, 0, TEXELS, TEXELS);
  for (let y = 0; y < TEXELS; y++)
    for (let x = 0; x < TEXELS; x++) {
      const v = r();
      if (v < 0.18) {
        ctx.fillStyle = base.grain;
        ctx.fillRect(x, y, 1, 1);
      } else if (v > 0.93) {
        ctx.fillStyle = shade(base.top, 1.1);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  // a couple of cracks / blades for character
  ctx.fillStyle = shade(base.grain, 0.85);
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(r() * (TEXELS - 4)) + 2,
      y = Math.floor(r() * (TEXELS - 4)) + 2;
    ctx.fillRect(x, y, 2, 1);
    ctx.fillRect(x + 1, y + 1, 1, 1);
  }
  ctx.fillStyle = shade(base.top, 0.72);
  ctx.fillRect(0, 0, TEXELS, 1);
  ctx.fillRect(0, 0, 1, TEXELS);
  ctx.fillStyle = shade(base.top, 0.62);
  ctx.fillRect(0, TEXELS - 1, TEXELS, 1);
  ctx.fillRect(TEXELS - 1, 0, 1, TEXELS);
  return pixelTexture(c);
}

/** Tile side, one 5 ft step tall (TEXELS x STEP_TEXELS, 1:1 on screen): strata with mortar lines. */
export function makeSideTexture(theme: string, seed = 11): THREE.CanvasTexture {
  const pal = THEME_BASE[theme] ?? THEME_BASE.stone;
  const side = pal?.side ?? '#3b3f47';
  const h = STEP_TEXELS;
  const [c, ctx] = canvas(TEXELS, h);
  const r = rng(seed);
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, TEXELS, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < TEXELS; x++)
      if (r() < 0.14) {
        ctx.fillStyle = shade(side, r() < 0.5 ? 0.85 : 1.12);
        ctx.fillRect(x, y, 1, 1);
      }
  ctx.fillStyle = shade(side, 0.6);
  ctx.fillRect(0, 0, TEXELS, 1); // top lip (under the cap)
  ctx.fillRect(0, h / 2, TEXELS, 1); // mortar line
  ctx.fillRect(TEXELS / 2, 1, 1, h / 2 - 1); // brick joints
  ctx.fillRect(4, h / 2 + 1, 1, h / 2 - 1);
  ctx.fillRect(12, h / 2 + 1, 1, h / 2 - 1);
  ctx.fillStyle = shade(side, 1.2);
  ctx.fillRect(0, 1, TEXELS, 1); // highlight under the lip
  return pixelTexture(c);
}

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
