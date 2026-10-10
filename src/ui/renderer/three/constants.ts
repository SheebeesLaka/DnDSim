/** Shared numbers for the HD-2D renderer. One cell = 1 world unit = TEXELS texels. */
export const TEXELS = 16;
/** How many steps of "ground" are drawn below the lowest tile so pits and cliffs have walls. */
export const BASE_STEPS = 2;
/** Tactical pitch: sin = 0.75 so a 16-texel tile depth projects to exactly 12 texels (no row jitter). */
export const PITCH_TACTICAL = Math.asin(0.75);
/** Screen texels one 5 ft elevation step projects to in the tactical view. */
export const STEP_TEXELS = 6;
/**
 * One 5 ft elevation step, in world units (cells): sized so a step projects to
 * exactly STEP_TEXELS texels, keeping every tile edge and sprite base on the
 * pixel grid (about 0.57 of a cell).
 */
export const STEP = STEP_TEXELS / (TEXELS * Math.cos(PITCH_TACTICAL));
export const PITCH_TOP = Math.PI / 2;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
/** Lamp height above the tile top (cells): high enough that the lit pool is wide and even. */
export const LAMP_HEIGHT = 2.2;
/** A carried light (torch) floats this far above its bearer's feet. */
export const CARRIED_HEIGHT = 2.0;
/** Point-light intensity: about full albedo directly under a light, so two overlapping lights don't blow out. */
export const LIGHT_INTENSITY = 3.2;
/** Height of a collision-terrain block without art (cells). */
export const BLOCK_HEIGHT = 0.9;
/** Shadow-casting point lights, in addition to the sun. */
export const MAX_SHADOW_LIGHTS = 8;

export type CameraMode = 'tactical' | 'top';

export interface ViewOptions {
  camera: CameraMode;
  /** tilt-shift blur on the backdrop (never on the board) */
  blur: boolean;
  /** bloom on light sources */
  bloom: boolean;
}

export const DEFAULT_VIEW_OPTIONS: Readonly<ViewOptions> = Object.freeze({
  camera: 'tactical',
  blur: true,
  bloom: true,
});

export const SIDE_COLORS = { party: '#4CAF50', enemy: '#d75f5f', other: '#808080' } as const;
export const SELECTED_COLOR = '#ff9f1a';
export const ACTIVE_COLOR = '#ffd54f';

export const HIGHLIGHT = {
  placement: '#5aaae6',
  move: '#6ec882',
  castRange: '#7b68ee',
  areaTemplate: '#ff783c',
  attack: '#d75f5f',
  castTarget: '#aa96ff',
  areaUnit: '#ffc878',
  hover: '#ffffff',
} as const;

export const hpColor = (pct: number): string => (pct > 0.5 ? '#4CAF50' : pct > 0.25 ? '#e6b23c' : '#d75f5f');
export const ftLabel = (steps: number): string =>
  `${steps > 0 ? '+' : steps < 0 ? '−' : ''}${Math.abs(steps) * 5} ft`;
