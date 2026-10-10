/**
 * Board view preferences in ui_prefs: camera mode and post-processing for the
 * DM window (`board.*`) and the player window (`board.player.*`). The DM sets
 * both; the player window only reads them from the broadcast prefs.
 */
import { DEFAULT_VIEW_OPTIONS, type ViewOptions } from './renderer/three/constants.ts';

export const VIEW_PREF_PREFIX = { dm: 'board.', player: 'board.player.' } as const;

const PLAYER_DEFAULTS: ViewOptions = { ...DEFAULT_VIEW_OPTIONS, blur: false };

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
    blur: flag('blur'),
    bloom: flag('bloom'),
  };
}

export function viewPrefKey(who: 'dm' | 'player', k: keyof ViewOptions): string {
  return VIEW_PREF_PREFIX[who] + k;
}
