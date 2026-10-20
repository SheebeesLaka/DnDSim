/**
 * Shared numbers for the HD-2D renderer. One cell = 1 world unit = TEXELS
 * texels, and a texel is always `zoom` whole screen pixels, for tile art and
 * sprites alike. Sprites are sized in texels, so raising TEXELS makes tiles
 * bigger on screen while sprites keep their size.
 */
export const TEXELS = 20;
/** The cell size the tile art was designed on; painters place details with `tx`. */
const DESIGN_TEXELS = 16;
/** A coordinate / size authored on the 16-texel design grid, at the current TEXELS. */
export const tx = (n: number): number => Math.round((n * TEXELS) / DESIGN_TEXELS);
/** How many more texels a tile has than its design: random speck counts scale with area. */
export const AREA_SCALE = (TEXELS * TEXELS) / (DESIGN_TEXELS * DESIGN_TEXELS);
/**
 * Billboards sized in cells rather than texels (initials tokens, single-image
 * unit art) shrink by this so they keep the on-screen size they had at 16
 * texels per cell, like the pixel sprites do.
 */
export const SPRITE_CELL = DESIGN_TEXELS / TEXELS;
const DEG = Math.PI / 180;
/** How many steps of "ground" are drawn below the lowest tile so pits and cliffs have walls. */
export const BASE_STEPS = 2;
/**
 * Default tactical pitch (camera elevation above the ground plane). Steep
 * enough that a tall sprite rarely hides the tile behind it, shallow enough
 * that two side faces of every step read as walls.
 */
export const PITCH_TACTICAL = DEG * 40;
/**
 * The free camera tilts between these. Upright sprites are stretched by
 * 1 / cos(pitch) to stay 1:1 on screen, which runs away toward top-down (2x at
 * 60°) and reads as paper standees; below 30° the ground is too squashed to
 * read and cliffs hide whole rows. Straight down is the separate top mode.
 */
export const PITCH_MIN = DEG * 30;
export const PITCH_MAX = DEG * 60;
/** Sprite shadows are cast by proxies at the default pitch's stretch, so they don't change with the tilt. */
export const SHADOW_STRETCH = 1 / Math.cos(PITCH_TACTICAL);
/** Right-drag orbit speed (radians per CSS pixel). */
export const ORBIT_PER_PX = DEG * 0.4;
/** Texels (side-texture height) of one 5 ft elevation step. */
export const STEP_TEXELS = tx(12);
/**
 * One 5 ft elevation step, in world units (cells). Physically a step is a full
 * cell; 0.75 keeps a +15 ft cliff from swallowing the rows behind it while
 * still reading as a real wall.
 */
export const STEP = STEP_TEXELS / TEXELS;
/**
 * The four home headings, as angles (radians) of the camera's ground position
 * around the view target: 0 = from the south, +90° = from the east. Offset
 * from the grid axes so two side faces of every step are on screen, like the
 * direction C mockup. The camera yaws freely (right-drag); [ and ] turn 90°
 * from wherever it is, and a reset lands on the nearest of these.
 */
export const AZIMUTH_OFFSET = DEG * 30;
export const AZIMUTHS = [0, 1, 2, 3].map((k) => AZIMUTH_OFFSET + k * (Math.PI / 2));
/** How long a 90° camera turn (or any tweened angle change) takes (ms). */
export const ROTATE_MS = 240;
export const PITCH_TOP = Math.PI / 2;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
/** Lamp height above the tile top (cells): high enough that the lit pool is wide and even. */
export const LAMP_HEIGHT = 2.2;
/** A carried light (torch) floats this far above its bearer's feet. */
export const CARRIED_HEIGHT = 2.0 * SPRITE_CELL; // just over a sprite's head
/** Point-light intensity: about full albedo directly under a light, so two overlapping lights don't blow out. */
export const LIGHT_INTENSITY = 3.2;
/** Height of a collision-terrain block without art (cells). */
export const BLOCK_HEIGHT = 0.9;
/** Shadow-casting point lights, in addition to the sun. */
export const MAX_SHADOW_LIGHTS = 8;

export type CameraMode = 'tactical' | 'top';

export interface ViewOptions {
  camera: CameraMode;
  /** camera heading in degrees (any angle; see AZIMUTHS) */
  yaw: number;
  /** tactical tilt in degrees, PITCH_MIN..PITCH_MAX */
  pitch: number;
  /** tilt-shift blur on the backdrop (never on the board) */
  blur: boolean;
  /** bloom on light sources */
  bloom: boolean;
}

export const DEFAULT_VIEW_OPTIONS: Readonly<ViewOptions> = Object.freeze({
  camera: 'tactical',
  yaw: 30,
  pitch: 40,
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
