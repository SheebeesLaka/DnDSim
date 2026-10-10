/** The player window: strip + board from the DM's snapshots, filtered by display options. */
import type { ReplicaStore } from '../app/replica.ts';
import { displayOptionsFromPrefs, playerText } from '../engine/view/displayOptions.ts';
import { projectForPlayer } from '../engine/view/playerProjection.ts';
import { h, replaceChildren } from './dom.ts';
import { victoryOverlay } from './panels/dialogs.ts';
import type { BoardRenderer } from './renderer/BoardRenderer.ts';
import { viewOptionsFromPrefs } from './viewPrefs.ts';

export function mountPlayerScreen(
  root: HTMLElement,
  replica: ReplicaStore,
  renderer: BoardRenderer,
): () => void {
  const stripEl = h('div', { class: 'strip player-strip', dataset: { testid: 'player-strip' } });
  const topEl = h('div', { class: 'top', style: 'height:110px' }, stripEl);
  const boardWrap = h('div', { class: 'boardwrap' });
  const idle = h(
    'div',
    { class: 'idle', dataset: { testid: 'player-idle' } },
    h('h1', {}, 'Cassandralis Combat Simulator'),
    h('div', { class: 'muted' }, 'Awaiting the next encounter'),
  );
  replaceChildren(root, idle);
  let mounted = false;
  let victoryEl: HTMLElement | null = null;

  const render = () => {
    const doc = replica.state;
    if (!doc.vm) return;
    if (!mounted) {
      replaceChildren(root, topEl, h('div', { class: 'main' }, boardWrap));
      renderer.mount(boardWrap, {});
      mounted = true;
    }
    const opts = displayOptionsFromPrefs(doc.prefs);
    const vm = projectForPlayer(doc.vm, opts);
    renderer.setViewOptions?.(viewOptionsFromPrefs(doc.prefs, 'player'));
    renderer.render(vm);
    topEl.style.display = vm.showStrip ? '' : 'none';
    replaceChildren(
      stripEl,
      ...vm.strip.map((e) => {
        const pct = e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
        const unit = vm.units.find((u) => u.id === e.id);
        return h(
          'div',
          { class: `card${e.current ? ' current' : ''}`, dataset: { testid: `pcard-${e.id}` } },
          h('div', { class: `avatar ${e.side}`, style: `background:${unit?.color ?? '#555'}` }),
          h('div', { class: 'name' }, e.name),
          e.showHpBar
            ? h(
                'div',
                { class: 'hpbar' },
                h('div', {
                  style: `width:${pct * 100}%;background:${pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#e0a030' : '#d75f5f'}`,
                }),
              )
            : null,
          e.showHpNumbers
            ? h('div', { class: 'small', dataset: { testid: `php-${e.id}` } }, `${e.hp}/${e.maxHp}`)
            : null,
        );
      }),
    );
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
  render();
  return () => {
    unsub();
    if (mounted) renderer.destroy();
  };
}
