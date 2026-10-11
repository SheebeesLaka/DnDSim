/**
 * Board themes for the HD-2D renderer: procedural pixel-art tile tops and
 * sides at the sprite texel density. Each theme paints four top variants
 * (baked side by side into one atlas; a per-instance attribute picks one per
 * cell, so floors don't visibly tile) and one side strip one 5 ft step tall.
 * Every top keeps a darker one-texel rim so the grid reads from across a room.
 *
 * Moonbase themes first: `facility` (worn metal plating, vents, lab floor,
 * hazard-striped ledges) and `arboretum` (moss, soil paths, overgrown plating).
 * `stone`, `grass` and `dirt` are the legacy themes.
 */
import * as THREE from 'three';
import { STEP_TEXELS, TEXELS } from './constants.ts';
import { canvas, pixelTexture, rng, shade } from './textures.ts';

/** Number of top variants per theme (atlas columns). */
export const TOP_VARIANTS = 4;

type Ctx = CanvasRenderingContext2D;
type Painter = (ctx: Ctx, r: () => number) => void;

interface ThemeDef {
  /** rim colour base: the top's dominant tone */
  rim: string;
  tops: [Painter, Painter, Painter, Painter];
  side: Painter;
}

const px = (ctx: Ctx, x: number, y: number, col: string, w = 1, h = 1) => {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
};

/** Fill with a base colour and sprinkle darker/lighter specks. */
const speckle = (
  ctx: Ctx,
  r: () => number,
  base: string,
  dark: string,
  light: string,
  w: number,
  h: number,
  pd = 0.16,
  pl = 0.06,
) => {
  px(ctx, 0, 0, base, w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = r();
      if (v < pd) px(ctx, x, y, dark);
      else if (v > 1 - pl) px(ctx, x, y, light);
    }
};

/** The darker one-texel rim on every top (lit edge top/left, shadow edge bottom/right). */
const rim = (ctx: Ctx, base: string) => {
  px(ctx, 0, 0, shade(base, 0.72), TEXELS, 1);
  px(ctx, 0, 0, shade(base, 0.72), 1, TEXELS);
  px(ctx, 0, TEXELS - 1, shade(base, 0.6), TEXELS, 1);
  px(ctx, TEXELS - 1, 0, shade(base, 0.6), 1, TEXELS);
};

const legacy = (top: string, grain: string, side: string): ThemeDef => {
  const t: Painter = (ctx, r) => {
    speckle(ctx, r, top, grain, shade(top, 1.1), TEXELS, TEXELS, 0.18, 0.07);
    ctx.fillStyle = shade(grain, 0.85);
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(r() * (TEXELS - 4)) + 2,
        y = Math.floor(r() * (TEXELS - 4)) + 2;
      px(ctx, x, y, shade(grain, 0.85), 2, 1);
      px(ctx, x + 1, y + 1, shade(grain, 0.85));
    }
  };
  return {
    rim: top,
    tops: [t, t, t, t],
    side: (ctx, r) => {
      const h = STEP_TEXELS;
      speckle(ctx, r, side, shade(side, 0.85), shade(side, 1.12), TEXELS, h, 0.07, 0.07);
      px(ctx, 0, 0, shade(side, 0.6), TEXELS, 1); // top lip (under the cap)
      px(ctx, 0, h / 2, shade(side, 0.6), TEXELS, 1); // mortar line
      px(ctx, TEXELS / 2, 1, shade(side, 0.6), 1, h / 2 - 1); // brick joints
      px(ctx, 4, h / 2 + 1, shade(side, 0.6), 1, h / 2 - 1);
      px(ctx, 12, h / 2 + 1, shade(side, 0.6), 1, h / 2 - 1);
      px(ctx, 0, 1, shade(side, 1.2), TEXELS); // highlight under the lip
    },
  };
};

// ---- facility: worn moonbase plating ----
const STEEL = '#5f6772';
const facility: ThemeDef = {
  rim: STEEL,
  tops: [
    // plain deck plate: scuffed, with a seam and corner rivets
    (ctx, r) => {
      speckle(ctx, r, STEEL, '#57606a', '#6b737e', TEXELS, TEXELS, 0.14, 0.08);
      px(ctx, 1, 8, '#4c535c', TEXELS - 2, 1);
      px(ctx, 1, 9, '#717a85', TEXELS - 2, 1);
      for (const [x, y] of [
        [2, 2],
        [13, 2],
        [2, 13],
        [13, 13],
      ] as const)
        px(ctx, x, y, '#8d96a2');
      if (r() < 0.6) px(ctx, 4 + Math.floor(r() * 7), 4 + Math.floor(r() * 3), '#4a3f33', 2, 1); // grime
    },
    // diamond tread plate
    (ctx, r) => {
      speckle(ctx, r, '#646c77', '#5c646e', '#6e7681', TEXELS, TEXELS, 0.08, 0.04);
      for (let y = 2; y < TEXELS - 1; y += 3)
        for (let x = 2 + ((y / 3) % 2) * 2; x < TEXELS - 1; x += 4) {
          px(ctx, x, y, '#848d99', 2, 1);
          px(ctx, x, y + 1, '#4e555f', 2, 1);
        }
    },
    // vent grate: dark slots over a glow of the deck below
    (ctx, r) => {
      speckle(ctx, r, '#525962', '#4a5159', '#5c636c', TEXELS, TEXELS, 0.1, 0.04);
      px(ctx, 2, 2, '#1d2228', TEXELS - 4, TEXELS - 4);
      for (let y = 3; y < TEXELS - 3; y += 2) px(ctx, 3, y, '#6b737e', TEXELS - 6, 1);
      px(ctx, 2, 2, '#3a4048', TEXELS - 4, 1);
    },
    // lab floor: pale tiles in a 2x2 grid
    (ctx, r) => {
      speckle(ctx, r, '#7f8994', '#77818c', '#89939e', TEXELS, TEXELS, 0.1, 0.06);
      px(ctx, 0, 7, '#6f7883', TEXELS, 1);
      px(ctx, 7, 0, '#6f7883', 1, TEXELS);
      px(ctx, 0, 8, '#939ca7', TEXELS, 1);
      px(ctx, 8, 0, '#939ca7', 1, TEXELS);
    },
  ],
  // bulkhead side: dark steel with a hazard-striped lip, so every ledge reads as a drop
  side: (ctx, r) => {
    const h = STEP_TEXELS;
    speckle(ctx, r, '#414852', '#3a4049', '#4a525c', TEXELS, h, 0.12, 0.06);
    for (let x = 0; x < TEXELS; x++) px(ctx, x, 0, (x >> 1) % 2 === 0 ? '#e0b128' : '#1b1d21', 1, 2);
    px(ctx, 0, 2, '#2b3037', TEXELS, 1);
    px(ctx, 0, h - 3, '#353b43', TEXELS, 1);
    px(ctx, 3, 5, '#5a636e', 1, 1);
    px(ctx, 12, 5, '#5a636e', 1, 1);
    px(ctx, 6, 5, '#2b3037', 4, 3); // access panel
    px(ctx, 6, 5, '#4f5761', 4, 1);
  },
};

// ---- arboretum: overgrown dome gardens ----
const MOSS = '#42663a';
const mossy = (ctx: Ctx, r: () => number) => {
  speckle(ctx, r, MOSS, '#375631', '#517a47', TEXELS, TEXELS, 0.2, 0.1);
  for (let i = 0; i < 6; i++) {
    const x = 1 + Math.floor(r() * (TEXELS - 2)),
      y = 2 + Math.floor(r() * (TEXELS - 3));
    px(ctx, x, y, '#628f50');
    px(ctx, x, y - 1, '#73a05c');
  }
};
const arboretum: ThemeDef = {
  rim: MOSS,
  tops: [
    mossy,
    // flowers in the moss
    (ctx, r) => {
      mossy(ctx, r);
      const petals = ['#e86f8a', '#f2d04b', '#b98ef0', '#ffffff'];
      for (let i = 0; i < 4; i++) {
        const x = 2 + Math.floor(r() * (TEXELS - 4)),
          y = 2 + Math.floor(r() * (TEXELS - 4));
        px(ctx, x, y, petals[Math.floor(r() * petals.length)] ?? '#fff');
      }
    },
    // damp soil, moss creeping back in at the edges
    (ctx, r) => {
      speckle(ctx, r, '#56503a', '#4a4532', '#625b42', TEXELS, TEXELS, 0.2, 0.08);
      for (let i = 0; i < 4; i++)
        px(ctx, Math.floor(r() * TEXELS), Math.floor(r() * TEXELS), '#858072', 2, 1);
      for (let i = 0; i < 18; i++) {
        const e = Math.floor(r() * TEXELS);
        const side = Math.floor(r() * 4);
        const [x, y] =
          side === 0 ? [e, 1] : side === 1 ? [e, TEXELS - 2] : side === 2 ? [1, e] : [TEXELS - 2, e];
        px(ctx, x, y, '#42663a');
      }
    },
    // old deck plating, moss creeping over it
    (ctx, r) => {
      speckle(ctx, r, '#69716b', '#5f6761', '#747c76', TEXELS, TEXELS, 0.1, 0.05);
      px(ctx, 1, 8, '#545b56', TEXELS - 2, 1);
      for (let i = 0; i < 40; i++) {
        const x = Math.floor(r() * TEXELS),
          y = Math.floor(r() * TEXELS);
        if (x + y < 14 || r() < 0.15) px(ctx, x, y, r() < 0.5 ? '#42663a' : '#517a47');
      }
    },
  ],
  // overgrown plating: grey-green panel with vines hanging over the lip
  side: (ctx, r) => {
    const h = STEP_TEXELS;
    speckle(ctx, r, '#4e5650', '#454c47', '#58605a', TEXELS, h, 0.12, 0.06);
    px(ctx, 0, h / 2, '#3c423e', TEXELS, 1);
    px(ctx, 0, 0, '#3d6a2c', TEXELS, 1);
    for (let x = 0; x < TEXELS; x++) {
      if (r() < 0.45) {
        const len = 1 + Math.floor(r() * (h - 2));
        px(ctx, x, 1, r() < 0.5 ? '#4f7d3b' : '#3d6a2c', 1, len);
        if (r() < 0.3) px(ctx, x, 1 + len, '#64934a');
      }
    }
  },
};

const THEMES: Record<string, ThemeDef> = {
  facility,
  arboretum,
  stone: legacy('#6b7079', '#5c6169', '#4e535d'),
  grass: legacy('#5f8a3f', '#527a35', '#6a553f'),
  dirt: legacy('#8a6b47', '#79593a', '#5e4a35'),
};

const themeDef = (theme: string): ThemeDef => THEMES[theme] ?? (THEMES.stone as ThemeDef);

/** Tile tops: TOP_VARIANTS variants side by side (TEXELS*TOP_VARIANTS x TEXELS). */
export function makeTopAtlas(theme: string, seed = 7): THREE.CanvasTexture {
  const def = themeDef(theme);
  const [c, ctx] = canvas(TEXELS * TOP_VARIANTS, TEXELS);
  def.tops.forEach((paint, i) => {
    ctx.save();
    ctx.translate(i * TEXELS, 0);
    paint(ctx, rng(seed + i * 101));
    rim(ctx, def.rim);
    ctx.restore();
  });
  const t = pixelTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

/** Tile side, one 5 ft step tall (TEXELS x STEP_TEXELS, 1:1 on screen). */
export function makeSideTexture(theme: string, seed = 11): THREE.CanvasTexture {
  const [c, ctx] = canvas(TEXELS, STEP_TEXELS);
  themeDef(theme).side(ctx, rng(seed));
  return pixelTexture(c);
}

/**
 * Which top variant a cell shows: a stable hash of (r, c), weighted so the
 * plain variant dominates and the special ones (vents, flowers...) stay rare.
 */
export function topVariant(r: number, c: number): number {
  let h = Math.imul(r + 0x9e37, 0x85ebca6b) ^ Math.imul(c + 0x7f4a, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  const v = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  return v < 0.55 ? 0 : v < 0.78 ? 1 : v < 0.9 ? 2 : 3;
}

/**
 * Lambert material for an atlas of top variants: a per-vertex (or
 * per-instance) `aVariant` attribute picks the column. Meshes without the
 * attribute read 0 and show the plain variant.
 */
export function topVariantMaterial(atlas: THREE.Texture): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map: atlas });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `attribute float aVariant;\n` +
      shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>\n\tvMapUv.x = ( clamp( vMapUv.x, 0.001, 0.999 ) + aVariant ) / ${TOP_VARIANTS}.0;`,
      );
  };
  mat.customProgramCacheKey = () => 'top-variant-atlas';
  return mat;
}

/** The themes the board offers, moonbase first. */
export const BOARD_THEME_IDS = Object.keys(THEMES);

/**
 * Collision terrain without sprite art (walls, pillars, cover) as a themed
 * block: a bulkhead in the facility, a hedge in a planter in the arboretum,
 * rock elsewhere. Side and top textures, TEXELS square.
 */
export function makeBlockTextures(theme: string): { side: THREE.CanvasTexture; top: THREE.CanvasTexture } {
  const paint = (fn: Painter, seed: number) => {
    const [c, ctx] = canvas(TEXELS, TEXELS);
    fn(ctx, rng(seed));
    return pixelTexture(c);
  };
  if (theme === 'facility')
    return {
      // bulkhead: steel frame, recessed panel, status light, hazard stripe at the foot
      side: paint((ctx, r) => {
        speckle(ctx, r, '#59616c', '#525a64', '#636b76', TEXELS, TEXELS, 0.1, 0.05);
        px(ctx, 0, 0, '#7a838f', TEXELS, 1);
        px(ctx, 2, 2, '#3c424a', TEXELS - 4, 9);
        px(ctx, 3, 3, '#484f58', TEXELS - 6, 7);
        px(ctx, 3, 3, '#5d6570', TEXELS - 6, 1);
        px(ctx, TEXELS - 5, 4, '#5ff2ff');
        for (let x = 0; x < TEXELS; x++)
          px(ctx, x, TEXELS - 3, (x >> 1) % 2 === 0 ? '#e0b128' : '#1b1d21', 1, 2);
        px(ctx, 0, TEXELS - 1, '#2b3037', TEXELS, 1);
      }, 61),
      // roof plate with a vent
      top: paint((ctx, r) => {
        speckle(ctx, r, '#6a737e', '#626b75', '#747d88', TEXELS, TEXELS, 0.1, 0.05);
        px(ctx, 0, 0, '#4c535c', TEXELS, 1);
        px(ctx, 0, 0, '#4c535c', 1, TEXELS);
        px(ctx, 0, TEXELS - 1, '#454b54', TEXELS, 1);
        px(ctx, TEXELS - 1, 0, '#454b54', 1, TEXELS);
        px(ctx, 5, 5, '#2a2f36', 6, 6);
        for (let y = 6; y < 11; y += 2) px(ctx, 5, y, '#5c646e', 6, 1);
      }, 67),
    };
  if (theme === 'arboretum')
    return {
      // clipped hedge growing out of a metal planter
      side: paint((ctx, r) => {
        // darker than the moss floor so walls stand out, with a pale metal planter
        speckle(ctx, r, '#26421f', '#1b3117', '#355a2c', TEXELS, TEXELS, 0.3, 0.15);
        for (let i = 0; i < 8; i++) px(ctx, Math.floor(r() * TEXELS), Math.floor(r() * 10), '#4a7a3c');
        px(ctx, 0, 10, '#8a939c', TEXELS, 6);
        px(ctx, 0, 10, '#aab3bc', TEXELS, 1);
        px(ctx, 0, TEXELS - 1, '#4e555c', TEXELS, 1);
        for (let x = 1; x < TEXELS; x += 5) px(ctx, x, 13, '#c3ccd5');
      }, 71),
      top: paint((ctx, r) => {
        // clipped top, lighter than the sides so the block reads as a solid
        speckle(ctx, r, '#5b8a48', '#4a7a3c', '#73a35c', TEXELS, TEXELS, 0.3, 0.15);
      }, 73),
    };
  // rock (legacy themes): the same speckled stone with mortar lines on every face
  const rock: Painter = (ctx, r) => {
    speckle(ctx, r, '#9a9ea6', '#80848c', '#b0b4bc', TEXELS, TEXELS, 0.11, 0.11);
    px(ctx, 0, 5, '#6a6e76', TEXELS, 1);
    px(ctx, 0, 11, '#6a6e76', TEXELS, 1);
    px(ctx, 6, 0, '#6a6e76', 1, 5);
    px(ctx, 11, 6, '#6a6e76', 1, 5);
    px(ctx, 3, 12, '#6a6e76', 1, 4);
  };
  return { side: paint(rock, 3), top: paint(rock, 5) };
}

/** Whether a theme's blocks carry their own colours (tinted only lightly by the terrain colour). */
export const themedBlocks = (theme: string): boolean => theme === 'facility' || theme === 'arboretum';
