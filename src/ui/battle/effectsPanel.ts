/**
 * Active effects: every status on the field with who it is on, where it came
 * from, its countdown and when it ends (soonest first), then readied actions,
 * delays, reinforcements and timers. The DM can select the creature, end an
 * effect early or add a timer / arrival; players see the list read-only.
 */
import type { BoardVM } from '../../engine/view/boardViewModel.ts';
import type { EffectRowVM } from '../../engine/view/effects.ts';
import { h } from '../dom.ts';
import { emblem, icon, pips, shortName } from './art.ts';

export interface EffectsActions {
  select: (unitId: string) => void;
  end: (row: EffectRowVM) => void;
  toggle: () => void;
  addTimer: () => void;
  addArrival: () => void;
}

function row(r: EffectRowVM, actions?: EffectsActions): HTMLElement {
  const glyph =
    r.kind === 'readied'
      ? 'readied'
      : r.kind === 'held'
        ? 'delay'
        : r.kind === 'arrival'
          ? 'arrival'
          : r.kind === 'timer'
            ? 'timer'
            : undefined;
  const el = h(
    actions ? 'button' : 'div',
    {
      class: `sp-fx-row${r.soon ? ' soon' : ''}`,
      dataset: { testid: `fx-${r.key}` },
      title: [r.name, r.unitName ? `on ${r.unitName}` : null, r.fx, r.source].filter(Boolean).join(' · '),
    },
    emblem(r.name, r.family, 32, glyph),
    h(
      'div',
      { style: 'min-width:0' },
      h(
        'div',
        { class: 'nm' },
        r.name,
        r.unitName && r.kind !== 'held'
          ? h('span', {}, ` on ${shortName(r.unitName, 16)}`)
          : r.unitName
            ? h('span', {}, ` · ${shortName(r.unitName, 16)}`)
            : null,
      ),
      h('div', { class: 'sub' }, [r.fx, r.source].filter(Boolean).join(' · ') || ' '),
    ),
    h(
      'div',
      { class: 'end' },
      r.left >= 0 && r.kind !== 'readied' && r.kind !== 'held'
        ? pips(r.left, r.full, r.family, false, 8)
        : null,
      h(
        'div',
        { class: 'w' },
        r.soon && r.kind === 'status' && r.unitName
          ? `${shortName(r.unitName.replace(/ #\d+$/, ''), 10)}'s turn`
          : r.endsLabel,
      ),
    ),
  );
  if (actions && el instanceof HTMLButtonElement) {
    el.type = 'button';
    el.onclick = (ev) => {
      if ((ev.target as HTMLElement).closest('.x')) return;
      if (r.unitId) actions.select(r.unitId);
    };
    const x = h(
      'span',
      { class: 'x', title: r.kind === 'held' ? 'Rejoin the order now' : 'End early' },
      icon('x'),
    );
    x.onclick = (ev) => {
      ev.stopPropagation();
      actions.end(r);
    };
    (el.lastChild as HTMLElement).append(x);
  }
  return el;
}

export function renderEffectsPanel(vm: BoardVM, open: boolean, actions?: EffectsActions): HTMLElement {
  const rows = vm.effects ?? [];
  const onCreatures = rows.filter((r) => r.kind === 'status');
  const other = rows.filter((r) => r.kind !== 'status');
  const body = h('div', { class: 'sp-fx-body' });
  if (rows.length === 0)
    body.append(
      h(
        'div',
        { class: 'sp-fx-empty' },
        'Nothing is ticking. Statuses, readied actions, delays and timers show up here.',
      ),
    );
  if (onCreatures.length)
    body.append(
      h('div', { class: 'sp-fx-grp' }, 'On creatures · soonest first'),
      ...onCreatures.map((r) => row(r, actions)),
    );
  if (other.length)
    body.append(
      h('div', { class: 'sp-fx-grp' }, 'Readied · delays · arrivals · timers'),
      ...other.map((r) => row(r, actions)),
    );
  const head = h(
    'div',
    { class: 'sp-fx-h' },
    h('span', { class: 't' }, 'Active effects'),
    h('span', { class: 'c' }, String(rows.length)),
    h(
      'span',
      { class: 'r' },
      actions
        ? h(
            'button',
            { type: 'button', onclick: actions.toggle, title: open ? 'Collapse (T)' : 'Expand (T)' },
            h('span', { class: 'sp-k' }, 'T'),
          )
        : null,
    ),
  );
  const panel = h(
    'div',
    { class: `sp-panel sp-fx${open ? '' : ' collapsed'}`, dataset: { testid: 'effects-panel' } },
    head,
    body,
  );
  if (actions)
    panel.append(
      h(
        'div',
        { class: 'sp-fx-add' },
        h('button', { type: 'button', onclick: actions.addTimer }, '+ timer'),
        h('button', { type: 'button', onclick: actions.addArrival }, '+ reinforcements'),
        h('span', { style: 'margin-left:auto' }, 'click a row to select'),
      ),
    );
  return panel;
}
