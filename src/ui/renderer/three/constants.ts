/** Shared numbers for the HD-2D renderer. One cell = 1 world unit = TEXELS texels. */
export const TEXELS = 16;
const DEG = Math.PI / 180;
/** How many steps of "ground" are drawn below the lowest tile so pits and cliffs have walls. */
export const BASE_STEPS = 2;
/**
 * Tactical pitch (camera elevation above the ground plane). Steep enough that
 * a tall sprite rarely hides the tile behind it, shallow enough that two side
 * faces of every step read as walls.
 */
export const PITCH_TACTICAL = DEG * 40;
/** Texels (side-texture height) of one 5 ft elevation step. */
export const STEP_TEXELS = 12;
/**
 * One 5 ft elevation step, in world units (cells). Physically a step is a full
 * cell; 0.75 keeps a +15 ft cliff from swallowing the rows behind it while
 * still reading as a real wall.
 */
export const STEP = STEP_TEXELS / TEXELS;
/**
 * The four camera headings, as angles (radians) of the camera's ground
 * position around the view target: 0 = from the south, +90° = from the east.
 * Offset from the grid axes so two side faces of every step are on screen,
 * like the direction C mockup; [ and ] step through them.
 */
export const AZIMUTH_OFFSET = DEG * 30;
export const AZIMUTHS = [0, 1, 2, 3].map((k) => AZIMUTH_OFFSET + k * (Math.PI / 2));
export type CameraAzimuth = 0 | 1 | 2 | 3;
/** How long a 90° camera turn takes (ms). */
export const ROTATE_MS = 240;
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
  /** heading index into AZIMUTHS */
  azimuth: CameraAzimuth;
  /** tilt-shift blur on the backdrop (never on the board) */
  blur: boolean;
  /** bloom on light sources */
  bloom: boolean;
}

export const DEFAULT_VIEW_OPTIONS: Readonly<ViewOptions> = Object.freeze({
  camera: 'tactical',
  azimuth: 0,
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
