/**
 * Board view preferences in ui_prefs: camera mode, angle and post-processing for the
 * DM window (`board.*`) and the player window (`board.player.*`). The DM sets
 * both; the player window only reads them from the broadcast prefs. The camera
 * angle (`board.yaw` / `board.pitch`, degrees) is the DM's, and the player
 * window mirrors it.
 */
import type { PrefsStore } from '../app/prefs.ts';
import type { BoardRenderer } from './renderer/BoardRenderer.ts';
import {
  AZIMUTH_OFFSET,
  DEFAULT_VIEW_OPTIONS,
  PITCH_MAX,
  PITCH_MIN,
  type ViewOptions,
} from './renderer/three/constants.ts';

export const VIEW_PREF_PREFIX = { dm: 'board.', player: 'board.player.' } as const;

const PLAYER_DEFAULTS: ViewOptions = { ...DEFAULT_VIEW_OPTIONS, blur: false };
const DEG = Math.PI / 180;
const OFFSET_DEG = AZIMUTH_OFFSET / DEG;

const wrapDeg = (d: number): number => ((d % 360) + 360) % 360;

/** The DM's camera heading (degrees, [0, 360)); a pre-free-camera `board.azimuth` index maps to its home heading. */
function yawFromPrefs(prefs: Record<string, string>): number {
  const yaw = Number(prefs['board.yaw']);
  if (prefs['board.yaw'] !== undefined && Number.isFinite(yaw)) return wrapDeg(yaw);
  const az = Number(prefs['board.azimuth']);
  if (az === 0 || az === 1 || az === 2 || az === 3) return OFFSET_DEG + az * 90;
  return DEFAULT_VIEW_OPTIONS.yaw;
}

function pitchFromPrefs(prefs: Record<string, string>): number {
  const p = Number(prefs['board.pitch']);
  if (prefs['board.pitch'] === undefined || !Number.isFinite(p)) return DEFAULT_VIEW_OPTIONS.pitch;
  return Math.max(PITCH_MIN / DEG, Math.min(PITCH_MAX / DEG, p));
}

export function viewOptionsFromPrefs(prefs: Record<string, string>, who: 'dm' | 'player'): ViewOptions {
  const pre = VIEW_PREF_PREFIX[who];
  const d = who === 'dm' ? DEFAULT_VIEW_OPTIONS : PLAYER_DEFAULTS;
  const flag = (k: 'blur' | 'bloom') => {
    const v = prefs[pre + k];
    return v === undefined ? d[k] : v === 'true';
  };
  const cam = prefs[pre + 'camera'];
  return {
    camera: cam === 'top' ? 'top' : cam === 'tactical' ? 'tactical' : d.camera,
    yaw: yawFromPrefs(prefs),
    pitch: pitchFromPrefs(prefs),
    blur: flag('blur'),
    bloom: flag('bloom'),
  };
}

/** The heading after a 90° turn from `cur` (degrees; +1 = counter-clockwise on screen, -1 = clockwise). */
export function turnYaw(cur: number, dir: 1 | -1): number {
  return wrapDeg(cur + dir * 90);
}

/** The reset angle: the default tilt, at the home heading (30° + k·90°) nearest `cur`. */
export function homeAngles(cur: number): { yaw: number; pitch: number } {
  const k = Math.round((cur - OFFSET_DEG) / 90);
  return { yaw: wrapDeg(OFFSET_DEG + k * 90), pitch: DEFAULT_VIEW_OPTIONS.pitch };
}

/** Pref writes for a camera angle (the DM's; the player window mirrors it). Drops the old heading index. */
export function anglePrefs(a: { yaw: number; pitch: number }): Record<string, string | null> {
  return {
    'board.yaw': String(a.yaw),
    'board.pitch': String(a.pitch),
    'board.azimuth': null,
    'board.player.azimuth': null,
  };
}

export function viewPrefKey(who: 'dm' | 'player', k: 'camera' | 'blur' | 'bloom'): string {
  return VIEW_PREF_PREFIX[who] + k;
}

/** Home: back to the default tilt at the nearest home heading, and refit the board. */
export function resetView(renderer: BoardRenderer, prefs: PrefsStore): void {
  prefs.setMany(anglePrefs(homeAngles(viewOptionsFromPrefs(prefs.all, 'dm').yaw)));
  renderer.resetCamera();
}

/** [ / ]: turn the (shared) camera 90° from wherever it is. */
export function turnView(prefs: PrefsStore, dir: 1 | -1): void {
  const cur = viewOptionsFromPrefs(prefs.all, 'dm');
  prefs.setMany(anglePrefs({ yaw: turnYaw(cur.yaw, dir), pitch: cur.pitch }));
}
