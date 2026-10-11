/**
 * Floating controls over the board: camera mode, 90° turns and effects for the
 * DM window and the player window. The camera angle itself (right-drag, [ ])
 * is the DM's; the player window mirrors it.
 */
import type { PrefsStore } from '../../app/prefs.ts';
import { button, h, replaceChildren } from '../dom.ts';
import type { BoardRenderer } from '../renderer/BoardRenderer.ts';
import { anglePrefs, homeAngles, turnYaw, viewOptionsFromPrefs, viewPrefKey } from '../viewPrefs.ts';

/** Home / ⌂: back to the default tilt at the nearest home heading, and refit the board. */
export function resetView(renderer: BoardRenderer, prefs: PrefsStore): void {
  prefs.setMany(anglePrefs(homeAngles(viewOptionsFromPrefs(prefs.all, 'dm').yaw)));
  renderer.resetCamera();
}

/** [ / ] / ⟲ / ⟳: turn the (shared) camera 90° from wherever it is. */
export function turnView(prefs: PrefsStore, dir: 1 | -1): void {
  const cur = viewOptionsFromPrefs(prefs.all, 'dm');
  prefs.setMany(anglePrefs({ yaw: turnYaw(cur.yaw, dir), pitch: cur.pitch }));
}

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
    const turn = (dir: 1 | -1) =>
      button(dir === 1 ? '⟳' : '⟲', () => turnView(prefs, dir), {
        dataset: { testid: `view-dm-turn-${dir === 1 ? 'cw' : 'ccw'}` },
        title: `Turn the camera 90° ${dir === 1 ? 'clockwise (])' : 'counter-clockwise ([)'} · right-drag to turn and tilt freely`,
      });
    replaceChildren(
      el,
      h('span', { class: 'muted small' }, 'DM'),
      turn(-1),
      camera('dm', dm.camera),
      turn(1),
      toggle('dm', 'blur', 'Blur', dm.blur),
      toggle('dm', 'bloom', 'Glow', dm.bloom),
      button('⌂', () => resetView(renderer, prefs), {
        title: 'Reset camera angle and framing (Home)',
        dataset: { testid: 'view-reset' },
      }),
      h(
        'span',
        {
          class: 'muted small',
          style: 'margin-left:8px',
          title: 'The player window follows the DM camera angle',
        },
        'Player',
      ),
      camera('player', player.camera),
      toggle('player', 'blur', 'Blur', player.blur),
      toggle('player', 'bloom', 'Glow', player.bloom),
    );
  };
  const unsub = prefs.subscribe(render);
  render();
  const zoom = mountZoomSlider(boardWrap, renderer);
  return {
    destroy: () => {
      unsub();
      zoom?.destroy();
      el.remove();
    },
  };
}

/**
 * Zoom bar in the board's bottom-right corner: − / slider / +, one notch per
 * whole zoom level (the wheel and auto-fit move it too). Renderers without
 * whole-step zoom get none.
 */
function mountZoomSlider(boardWrap: HTMLElement, renderer: BoardRenderer): { destroy: () => void } | null {
  const getZoom = renderer.getZoom?.bind(renderer);
  const setZoom = renderer.setZoom?.bind(renderer);
  const onZoomChange = renderer.onZoomChange?.bind(renderer);
  if (!getZoom || !setZoom || !onZoomChange) return null;
  const z = getZoom();
  const set = (level: number) => setZoom(Math.max(z.min, Math.min(z.max, level)));
  const slider = h('input', {
    type: 'range',
    min: z.min,
    max: z.max,
    step: 1,
    title: 'Zoom (mouse wheel)',
    'aria-label': 'Zoom',
    dataset: { testid: 'zoom-slider' },
    oninput: () => set(Number(slider.value)),
  });
  const label = h('span', { class: 'small zoom-level', dataset: { testid: 'zoom-level' } });
  const show = (level: number) => {
    slider.value = String(level);
    label.textContent = `${level}×`;
  };
  const el = h(
    'div',
    { class: 'board-zoom', dataset: { testid: 'board-zoom' } },
    button('−', () => set(getZoom().level - 1), {
      title: 'Zoom out',
      dataset: { testid: 'zoom-out' },
    }),
    slider,
    button('+', () => set(getZoom().level + 1), {
      title: 'Zoom in',
      dataset: { testid: 'zoom-in' },
    }),
    label,
  );
  boardWrap.appendChild(el);
  show(z.level);
  const unsub = onZoomChange(show);
  return {
    destroy: () => {
      unsub();
      el.remove();
    },
  };
}
