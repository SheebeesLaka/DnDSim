/**
 * The TV: the Spotlight layout read-only, sized to read from across the room.
 * Board (with HP pips, status emblems and the in-engine effects), the turn rail,
 * Active effects, the roll panel filling in as the DM types, the selected party
 * member's plate, and a big "your turn" moment on every turn change. Everything
 * comes from the DM's snapshots after projectForPlayer, so DM-only plans,
 * hidden enemies and secret numbers never reach it.
 */
import './spotlight.css';
import type { ReplicaStore } from '../../app/replica.ts';
import type { UnitVM } from '../../engine/view/boardViewModel.ts';
import { displayOptionsFromPrefs, playerText } from '../../engine/view/displayOptions.ts';
import { projectForPlayer } from '../../engine/view/playerProjection.ts';
import { h, replaceChildren } from '../dom.ts';
import { victoryOverlay } from '../panels/dialogs.ts';
import type { BoardRenderer } from '../renderer/BoardRenderer.ts';
import { viewOptionsFromPrefs } from '../viewPrefs.ts';
import { emblem, pips, portrait, shortName } from './art.ts';
import { BoardDecor } from './boardDecor.ts';
import { renderEffectsPanel } from './effectsPanel.ts';
import { renderRollPanel } from './rollPanel.ts';
import { renderTurnRail } from './turnRail.ts';

function plate(u: UnitVM, library: BoardRenderer['library']): HTMLElement {
  const pct = u.maxHp > 0 ? Math.max(0, Math.min(1, u.hp / u.maxHp)) : 0;
  return h(
    'div',
    { class: 'sp-panel sp-tvplate', dataset: { testid: 'tv-plate' } },
    h(
      'div',
      { class: `sp-ft l ${u.side}` },
      h(
        'div',
        { class: 'pt' },
        portrait(library, { spritePath: u.spritePath, color: u.color, name: u.name }, 56),
      ),
      h(
        'div',
        { class: 'info' },
        h('div', { class: 'n' }, shortName(u.name, 20)),
        u.showHpNumbers
          ? h(
              'div',
              { class: 'hp', style: 'color:var(--party)' },
              String(u.hp),
              ' ',
              h('small', {}, `/ ${u.maxHp}`),
            )
          : null,
        h('div', { class: 'sp-hpbar' }, h('i', { style: `width:${pct * 100}%;background:var(--party)` })),
        h(
          'div',
          { class: 'stats' },
          u.ac !== null ? h('span', {}, 'AC', h('b', {}, String(u.ac))) : null,
          u.mob !== null ? h('span', {}, 'MOB', h('b', {}, String(u.mob))) : null,
        ),
      ),
      h(
        'div',
        { class: 'stcards' },
        ...(u.effects ?? [])
          .slice(0, 3)
          .map((e) =>
            h(
              'div',
              { class: 'sp-stc' },
              emblem(e.name, e.family, 30),
              h(
                'div',
                {},
                h('div', { class: 'n2' }, e.name),
                h('div', { class: 'f' }, e.fx || '—', pips(e.left, e.full, e.family, true, 5)),
              ),
            ),
          ),
      ),
    ),
  );
}

export function mountTvScreen(root: HTMLElement, replica: ReplicaStore, renderer: BoardRenderer): () => void {
  const library = renderer.library;
  const sp = h('div', { class: 'sp tv', dataset: { testid: 'tv' } });
  const board = h('div', { class: 'sp-board' });
  const ui = h('div', { class: 'sp-ui' });
  const idle = h(
    'div',
    { class: 'sp-idle', dataset: { testid: 'player-idle' } },
    h('div', {}, h('h1', {}, 'Cassandralis'), h('p', {}, 'Awaiting the next encounter')),
  );
  sp.append(board, h('div', { class: 'sp-shade' }), ui, idle);
  replaceChildren(root, sp);
  let mounted = false;
  let decor: BoardDecor | null = null;
  let unsubDraw = () => undefined as void;
  let victoryEl: HTMLElement | null = null;
  let banner: { text: string; until: number } | null = null;
  let lastCurrent: string | null = null;

  const render = () => {
    const doc = replica.state;
    if (!doc.vm) return;
    if (!mounted) {
      idle.remove();
      renderer.mount(board, {});
      const layer = h('div', { class: 'sp-decor' });
      board.append(layer);
      decor = new BoardDecor(layer);
      unsubDraw = renderer.onDraw?.((p) => decor?.draw(p)) ?? (() => undefined);
      mounted = true;
    }
    const opts = displayOptionsFromPrefs(doc.prefs);
    const vm = projectForPlayer(doc.vm, opts);
    renderer.setViewOptions?.(viewOptionsFromPrefs(doc.prefs, 'player'));
    renderer.render(vm);
    decor?.setVM(vm);

    // the "your turn" moment
    const cur = vm.strip.find((e) => e.current);
    if (cur && cur.id !== lastCurrent) {
      if (lastCurrent !== null) banner = { text: `${cur.name}'s turn`, until: performance.now() + 2200 };
      lastCurrent = cur.id;
      setTimeout(render, 2300);
    }
    const selected = vm.units.find((u) => u.id === vm.selectedId && u.side === 'party');
    const parts: (HTMLElement | null)[] = [
      h(
        'div',
        { class: 'sp-panel sp-round' },
        h('div', { class: 'n' }, h('small', {}, vm.started ? 'RND' : ''), vm.started ? String(vm.round) : ''),
        h(
          'div',
          { class: 'area', style: 'font-size:15px' },
          vm.started ? (cur ? `${cur.name}'s turn` : '') : vm.phaseLabel,
        ),
      ),
      renderEffectsPanel({ ...vm, effects: vm.effects ?? [] }, true),
      vm.roll ? renderRollPanel(vm.roll, library) : null,
      !vm.roll && selected ? plate(selected, library) : null,
      vm.showStrip ? renderTurnRail(vm, library) : null,
    ];
    if (banner && banner.until > performance.now())
      parts.push(
        h(
          'div',
          {
            class: 'sp-panel sp-toast',
            style: 'top:42%;padding:18px 34px;border-radius:30px',
            dataset: { testid: 'tv-banner' },
          },
          h('div', { class: 'msg', style: 'font:700 34px var(--fh)' }, banner.text),
        ),
      );
    replaceChildren(ui, ...parts);
    // the effects list sits where the round pill ends; keep it below
    const fx = ui.querySelector<HTMLElement>('.sp-fx');
    if (fx) fx.style.left = '18px';

    if (doc.victory && !victoryEl) {
      victoryEl = victoryOverlay(doc.victory, null);
      document.body.appendChild(victoryEl);
    } else if (!doc.victory && victoryEl) {
      victoryEl.remove();
      victoryEl = null;
    }
  };

  const unsub = replica.subscribe((doc, events) => {
    render();
    const opts = displayOptionsFromPrefs(doc.prefs);
    for (const ev of events) {
      if (ev.type !== 'floatText' || !ev.unitId) continue; // tile-anchored texts are not mirrored (R4.12)
      const text = playerText(ev.text, ev.kind, ev.color, opts);
      if (text !== null) renderer.addFloatingText({ text, color: ev.color, unitId: ev.unitId });
    }
  });
  const unsubLib = library?.onChange(() => render()) ?? (() => undefined);
  const unsubCamera = replica.onCamera((pose) => renderer.followCamera?.(pose));
  render();
  return () => {
    unsub();
    unsubCamera();
    unsubLib();
    unsubDraw();
    decor?.destroy();
    if (mounted) renderer.destroy();
  };
}
