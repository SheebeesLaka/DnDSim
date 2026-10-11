/** Floating controls over the board: camera angle, heading and effects for the DM window and the player window. */
import type { PrefsStore } from '../../app/prefs.ts';
import { button, h, replaceChildren } from '../dom.ts';
import type { BoardRenderer } from '../renderer/BoardRenderer.ts';
import type { CameraAzimuth } from '../renderer/three/constants.ts';
import { turnAzimuth, viewOptionsFromPrefs, viewPrefKey } from '../viewPrefs.ts';

export function mountBoardToolbar(
  boardWrap: HTMLElement,
  renderer: BoardRenderer,
  prefs: PrefsStore,
): { destroy: () => void } {
  const el = h('div', { class: 'board-toolbar', dataset: { testid: 'board-toolbar' } });
  boardWrap.appendChild(el);

  const render = () => {
    const dm = viewOptionsFromPrefs(prefs.all, 'dm');
    const player = viewOptionsFromPrefs(prefs.all, 'player');
    renderer.setViewOptions?.(dm);
    const toggle = (who: 'dm' | 'player', key: 'blur' | 'bloom', label: string, cur: boolean) =>
      button(label, () => prefs.set(viewPrefKey(who, key), String(!cur)), {
        class: cur ? 'on' : '',
        dataset: { testid: `view-${who}-${key}` },
      });
    const camera = (who: 'dm' | 'player', cur: 'tactical' | 'top') =>
      button(
        cur === 'top' ? '⬇ Top' : '◢ Tactical',
        () => prefs.set(viewPrefKey(who, 'camera'), cur === 'top' ? 'tactical' : 'top'),
        {
          class: 'on',
          dataset: { testid: `view-${who}-camera` },
          title: 'Toggle camera angle',
        },
      );
    const turn = (who: 'dm' | 'player', cur: CameraAzimuth, dir: 1 | -1) =>
      button(
        dir === 1 ? '⟳' : '⟲',
        () => prefs.set(viewPrefKey(who, 'azimuth'), String(turnAzimuth(cur, dir))),
        {
          dataset: { testid: `view-${who}-turn-${dir === 1 ? 'cw' : 'ccw'}` },
          title: `Turn the camera 90° ${dir === 1 ? 'clockwise' : 'counter-clockwise'}${who === 'dm' ? (dir === 1 ? ' (])' : ' ([)') : ''}`,
        },
      );
    replaceChildren(
      el,
      h('span', { class: 'muted small' }, 'DM'),
      turn('dm', dm.azimuth, -1),
      camera('dm', dm.camera),
      turn('dm', dm.azimuth, 1),
      toggle('dm', 'blur', 'Blur', dm.blur),
      toggle('dm', 'bloom', 'Glow', dm.bloom),
      button('⌂', () => renderer.resetCamera(), {
        title: 'Reset camera (Home)',
        dataset: { testid: 'view-reset' },
      }),
      h('span', { class: 'muted small', style: 'margin-left:8px' }, 'Player'),
      turn('player', player.azimuth, -1),
      camera('player', player.camera),
      turn('player', player.azimuth, 1),
      toggle('player', 'blur', 'Blur', player.blur),
      toggle('player', 'bloom', 'Glow', player.bloom),
    );
  };
  const unsub = prefs.subscribe(render);
  render();
  return {
    destroy: () => {
      unsub();
      el.remove();
    },
  };
}
