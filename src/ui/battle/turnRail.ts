/**
 * The turn rail: who has acted (dimmed), who is acting (NOW), who is next, the
 * next round's opening and queued reinforcements (ghosts), and the Hold pocket
 * for delayed combatants. The DM drags cards to reorder or to delay; players see
 * the same rail read-only.
 */
import type { BoardVM, StripEntry } from '../../engine/view/boardViewModel.ts';
import type { SpriteLibrary } from '../sprites/library.ts';
import { h } from '../dom.ts';
import { emblem, pips, portrait, shortName } from './art.ts';

export interface RailActions {
  select: (id: string) => void;
  /** move `id` so it ends up at `toIndex` in the turn order */
  reorder: (id: string, toIndex: number) => void;
  delay: (id: string) => void;
  /** a held combatant rejoins at `index` */
  rejoin: (id: string, index: number) => void;
}

const DRAG_MIME = 'application/x-sp-unit';

function card(
  e: StripEntry,
  cls: string,
  library: SpriteLibrary | undefined,
  vm: BoardVM,
  actions?: RailActions,
): HTMLElement {
  const pct = e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
  const hpColor =
    pct > 0.5
      ? e.side === 'enemy'
        ? 'var(--enemy)'
        : 'var(--party)'
      : pct > 0.25
        ? 'var(--now)'
        : 'var(--down)';
  const targetId = vm.roll?.target?.id ?? null;
  const el = h(
    'div',
    {
      class: `sp-card ${e.side} ${cls}${vm.selectedId === e.id && !e.current ? ' sel' : ''}${targetId === e.id ? ' tgt' : ''}${e.dying ? ' dying' : ''}`,
      dataset: { testid: `rail-${e.id}`, id: e.id },
      title: e.initiative
        ? `${e.name} · initiative ${e.initiative.total} (d20 ${e.initiative.d20} + ${e.initiative.mod})`
        : e.name,
    },
    e.current
      ? h('span', { class: 'tagnow' }, 'NOW')
      : h('span', { class: 'ini' }, e.initiative ? String(e.initiative.total) : ''),
    portrait(
      library,
      { spritePath: e.spritePath ?? null, color: e.color, name: e.name },
      e.current ? 46 : 40,
    ),
    (e.effects?.length ?? 0) > 0
      ? h(
          'div',
          { class: 'cs' },
          ...(e.effects ?? [])
            .slice(0, 3)
            .flatMap((fx) => [emblem(fx.name, fx.family, 20), pips(fx.left, fx.full, fx.family, true, 3)]),
        )
      : null,
    e.dying
      ? h('div', { class: 'ribbon dying' }, 'DYING')
      : e.readied
        ? h('div', { class: 'ribbon' }, 'READIED')
        : null,
    h('div', { class: 'nm2' }, shortName(e.name, e.current ? 14 : 12)),
    e.showHpBar
      ? h('div', { class: 'hb' }, h('i', { style: `width:${pct * 100}%;background:${hpColor}` }))
      : null,
  );
  if (actions) {
    el.onclick = () => actions.select(e.id);
    el.draggable = true;
    el.ondragstart = (ev) => {
      ev.dataTransfer?.setData(DRAG_MIME, e.id);
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    };
    el.ondragend = () => el.classList.remove('dragging');
  }
  return el;
}

/** Make `el` a drop target that puts the dragged unit at order index `index`. */
function dropAt(el: HTMLElement, index: number, vm: BoardVM, actions: RailActions): void {
  el.ondragover = (ev) => {
    if (!ev.dataTransfer?.types.includes(DRAG_MIME)) return;
    ev.preventDefault();
    el.classList.add('drop-before');
  };
  el.ondragleave = () => el.classList.remove('drop-before');
  el.ondrop = (ev) => {
    el.classList.remove('drop-before');
    const id = ev.dataTransfer?.getData(DRAG_MIME);
    if (!id) return;
    ev.preventDefault();
    const held = (vm.held ?? []).some((x) => x.id === id);
    if (held) return actions.rejoin(id, index);
    const from = vm.turnOrder.indexOf(id);
    if (from === -1) return;
    // dropping on a card means "go before it": after removing `id`, that card shifted left if it was after
    actions.reorder(id, from < index ? index - 1 : index);
  };
}

export function renderTurnRail(
  vm: BoardVM,
  library: SpriteLibrary | undefined,
  actions?: RailActions,
): HTMLElement {
  const rail = h('div', { class: 'sp-panel sp-rail', dataset: { testid: 'turn-rail' } });
  const strip = vm.strip;
  if (!vm.started) {
    rail.append(
      h('div', { class: 'sp-rsep', style: 'width:auto;padding:0 8px' }, 'SETUP'),
      ...strip.map((e) => card(e, '', library, vm, actions)),
      h(
        'div',
        { style: 'align-self:center;color:var(--ink-3);padding:0 12px' },
        strip.length ? 'Begin to roll initiative' : 'Place the party to begin',
      ),
    );
    return rail;
  }
  const curIdx = strip.findIndex((e) => e.current);
  strip.forEach((e, i) => {
    const el = card(e, e.current ? 'now' : e.acted ? 'past' : '', library, vm, actions);
    if (actions) dropAt(el, i, vm, actions);
    rail.append(el);
  });
  // the next round opens with whoever has already acted this round, plus anyone arriving
  const nextRound = vm.round + 1;
  const arrivingNext = (vm.arrivals ?? []).filter((a) => a.round <= nextRound);
  const endSep = h(
    'div',
    { class: 'sp-rsep', title: actions ? 'Drop here to go last' : '' },
    `R${nextRound}`,
  );
  if (actions) dropAt(endSep, strip.length, vm, actions);
  rail.append(endSep);
  if (curIdx > 0 || arrivingNext.length > 0) {
    strip
      .slice(0, Math.max(0, curIdx))
      .forEach((e) => rail.append(card({ ...e, current: false }, '', library, vm, actions)));
    for (const a of arrivingNext)
      rail.append(
        h(
          'div',
          { class: 'sp-card enemy ghost', title: `${a.name} ×${a.count} arrive in round ${a.round}` },
          h('span', { class: 'ini' }, '?'),
          portrait(library, { spritePath: a.spritePath, color: a.color, name: a.name }, 40),
          h('div', { class: 'nm2' }, `${shortName(a.name, 9)} ×${a.count}`),
        ),
      );
  }
  const later = (vm.arrivals ?? []).filter((a) => a.round > nextRound);
  if (later.length > 0) {
    rail.append(h('div', { class: 'sp-rsep' }, 'LATER'));
    for (const a of later)
      rail.append(
        h(
          'div',
          { class: 'sp-card enemy ghost', title: `${a.name} ×${a.count} arrive in round ${a.round}` },
          h('span', { class: 'ini' }, `R${a.round}`),
          portrait(library, { spritePath: a.spritePath, color: a.color, name: a.name }, 40),
          h('div', { class: 'nm2' }, `${shortName(a.name, 9)} ×${a.count}`),
        ),
      );
  }
  // the Hold pocket: delayed combatants wait here until they are dragged back in
  const held = vm.held ?? [];
  if (actions || held.length > 0) {
    const hold = h(
      'div',
      { class: 'sp-hold', dataset: { testid: 'hold-pocket' } },
      ...held.map((e) => card(e, '', library, vm, actions)),
      h(
        'div',
        { class: 'holdtxt' },
        'HOLD',
        h('br'),
        h(
          'span',
          {},
          held.length ? 'drag back into the order' : actions ? 'drag a card here to delay' : 'delaying',
        ),
        actions ? h('br') : null,
        actions
          ? h(
              'span',
              {},
              h('span', { class: 'sp-k' }, 'D'),
              ' delay · ',
              h('span', { class: 'sp-k' }, 'Y'),
              ' ready',
            )
          : null,
      ),
    );
    if (actions) {
      hold.ondragover = (ev) => {
        if (!ev.dataTransfer?.types.includes(DRAG_MIME)) return;
        ev.preventDefault();
        hold.classList.add('over');
      };
      hold.ondragleave = () => hold.classList.remove('over');
      hold.ondrop = (ev) => {
        hold.classList.remove('over');
        const id = ev.dataTransfer?.getData(DRAG_MIME);
        if (id && vm.turnOrder.includes(id)) {
          ev.preventDefault();
          actions.delay(id);
        }
      };
    }
    rail.append(h('div', { class: 'sp-rsep' }), hold);
  }
  return rail;
}
