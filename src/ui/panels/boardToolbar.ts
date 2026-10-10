/** Floating controls over the board: camera angle and effects for the DM window and the player window. */
import type { PrefsStore } from '../../app/prefs.ts';
import { button, h, replaceChildren } from '../dom.ts';
import type { BoardRenderer } from '../renderer/BoardRenderer.ts';
import { viewOptionsFromPrefs, viewPrefKey } from '../viewPrefs.ts';

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
    replaceChildren(
      el,
      h('span', { class: 'muted small' }, 'DM'),
      camera('dm', dm.camera),
      toggle('dm', 'blur', 'Blur', dm.blur),
      toggle('dm', 'bloom', 'Glow', dm.bloom),
      button('⌂', () => renderer.resetCamera(), {
        title: 'Reset camera (Home)',
        dataset: { testid: 'view-reset' },
      }),
      h('span', { class: 'muted small', style: 'margin-left:8px' }, 'Player'),
      camera('player', player.camera),
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
