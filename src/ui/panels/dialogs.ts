/** Modal dialogs for the throwaway UI. Each returns a promise or takes callbacks. */
import type { SpellDef } from '../../assets/types.ts';
import { spellSlotsRemaining, maxSpellSlots, MAX_SPELL_LEVEL } from '../../engine/rules/spellSlots.ts';
import type { EntityUnit } from '../../engine/types.ts';
import { entitySpellAttackModifier, entitySpellSaveDC } from '../../engine/selectors/stats.ts';
import { spellSummary } from '../../assets/spellLabels.ts';
import { button, h, replaceChildren } from '../dom.ts';

export function modal(
  title: string,
  body: HTMLElement,
  buttons: HTMLElement[],
): { close: () => void; el: HTMLElement } {
  const dialog = h(
    'div',
    { class: 'dialog', role: 'dialog' },
    h('h3', {}, title),
    body,
    h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px' }, ...buttons),
  );
  const overlay = h('div', { class: 'overlay' }, dialog);
  document.body.appendChild(overlay);
  return { close: () => overlay.remove(), el: dialog };
}

export function confirmDialog(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const m = modal(title, h('div', {}, message), [
      button('OK', () => (m.close(), resolve(true)), { class: 'primary', dataset: { testid: 'confirm-ok' } }),
      button('Cancel', () => (m.close(), resolve(false))),
    ]);
  });
}

export function alertDialog(title: string, message: string): void {
  const m = modal(title, h('div', { style: 'white-space:pre-line' }, message), [
    button('OK', () => m.close(), { class: 'primary' }),
  ]);
}

/** BattleView.showTieResolutionDialog: click members in order. */
export function tieDialog(
  group: { id: string; name: string }[],
  roll: number | null,
  onResolve: (order: string[]) => void,
  onCancel: () => void,
): void {
  const chosen: string[] = [];
  const list = h('div', { class: 'col' });
  const ok = button('OK', () => (m.close(), onResolve([...chosen])), { class: 'primary', disabled: true });
  const render = () => {
    replaceChildren(
      list,
      ...group.map((g) => {
        const k = chosen.indexOf(g.id);
        return button(
          k >= 0 ? `${k + 1}. ${g.name}` : g.name,
          () => {
            if (!chosen.includes(g.id)) chosen.push(g.id);
            render();
          },
          { disabled: k >= 0, style: 'width:200px' },
        );
      }),
    );
    ok.disabled = chosen.length !== group.length;
  };
  render();
  const m = modal(
    'Initiative Tie',
    h(
      'div',
      { class: 'col' },
      h(
        'div',
        {},
        'These party members tied for initiative.',
        h('br'),
        'Click to set turn order (first click goes first):',
      ),
      roll !== null && h('div', { style: 'color:#569cd6;font-weight:700' }, `Initiative Roll: ${roll}`),
      list,
    ),
    [
      button('Reset', () => ((chosen.length = 0), render())),
      ok,
      button('Cancel', () => (m.close(), onCancel())),
    ],
  );
}

/** SpellPickerDialog: list known spells, choose a slot, Cast / Cancel. */
export function spellPickerDialog(
  caster: EntityUnit,
  spells: SpellDef[],
  onEdit: ((spell: SpellDef) => void) | undefined,
  onCast: (spell: SpellDef, slot: number) => void,
): void {
  const sheet = caster.sheet;
  let selected: SpellDef | null = spells[0] ?? null;
  const list = h('div', { class: 'col', style: 'max-height:300px;overflow:auto;width:460px' });
  const desc = h('div', { class: 'muted small', style: 'min-height:32px;max-width:460px' });
  const slotSel = h('select', { dataset: { testid: 'slot' } });
  const slotRow = h('div', { class: 'row' }, 'Cast with slot:', slotSel);
  const castBtn = button(
    'Cast',
    () => {
      if (!selected) return;
      const slot = selected.level === 0 ? 0 : Number(slotSel.value);
      if (selected.level > 0 && !Number.isFinite(slot)) return;
      m.close();
      onCast(selected, slot);
    },
    { class: 'primary', dataset: { testid: 'cast-btn' } },
  );
  const castable = (s: SpellDef) =>
    s.level === 0 ||
    Array.from({ length: MAX_SPELL_LEVEL - s.level + 1 }, (_, i) => s.level + i).some(
      (l) => spellSlotsRemaining(sheet, l) > 0,
    );
  const summary = spellSummary;
  const render = () => {
    replaceChildren(
      list,
      ...spells.map((s) => {
        const ok = castable(s);
        return h(
          'div',
          {
            class: `spell${selected?.name === s.name ? ' sel' : ''}`,
            style: ok ? '' : 'opacity:0.5',
            onclick: () => ((selected = s), render()),
            ondblclick: () => ok && castBtn.click(),
            dataset: { testid: `spell-${s.name}` },
          },
          h('span', {
            style: `display:inline-block;width:12px;height:12px;border-radius:50%;background:${s.color}`,
          }),
          h(
            'div',
            { style: 'flex:1' },
            h('div', { style: 'font-weight:700' }, s.name),
            h('div', { class: 'muted small' }, summary(s)),
          ),
          h(
            'span',
            { class: `lvl${s.level === 0 ? ' cantrip' : ''}` },
            s.level === 0 ? 'Cantrip' : `Level ${s.level}`,
            ok ? '' : ' · no slots',
          ),
        );
      }),
    );
    desc.textContent = selected ? selected.description || summary(selected) : '';
    replaceChildren(slotSel);
    if (selected && selected.level > 0) {
      for (let lvl = selected.level; lvl <= MAX_SPELL_LEVEL; lvl++)
        if (spellSlotsRemaining(sheet, lvl) > 0)
          slotSel.appendChild(
            h(
              'option',
              { value: String(lvl) },
              `Level ${lvl}  (${spellSlotsRemaining(sheet, lvl)}/${maxSpellSlots(sheet, lvl)} left)`,
            ),
          );
      slotRow.style.display = '';
      castBtn.disabled = slotSel.options.length === 0;
    } else {
      slotRow.style.display = 'none';
      castBtn.disabled = selected === null;
    }
  };
  render();
  const pips = h('div', { class: 'row small' });
  for (let lvl = 1; lvl <= MAX_SPELL_LEVEL; lvl++) {
    const max = maxSpellSlots(sheet, lvl);
    if (max <= 0) continue;
    const rem = spellSlotsRemaining(sheet, lvl);
    pips.appendChild(
      h(
        'span',
        { style: 'color:#b9a8f5;font-weight:700' },
        `Lv${lvl} `,
        '●'.repeat(rem) + '○'.repeat(max - rem),
      ),
    );
  }
  if (!pips.hasChildNodes())
    pips.appendChild(h('span', { class: 'muted' }, 'No spell slots (cantrips only)'));
  const atk = entitySpellAttackModifier(caster);
  const m = modal(
    'Cast a Spell',
    h(
      'div',
      { class: 'col' },
      h('div', { style: 'font-weight:700' }, sheet.name),
      h(
        'div',
        { class: 'muted' },
        `Spell DC ${entitySpellSaveDC(caster)}   |   Spell attack ${atk >= 0 ? '+' : ''}${atk}   |   ${sheet.spellcastingStat ?? ''}`,
      ),
      pips,
      h('div', { class: 'sep' }),
      list,
      desc,
      slotRow,
    ),
    [
      onEdit &&
        button(
          '✎ Edit Spell',
          () => {
            if (!selected) return;
            m.close();
            onEdit(selected);
          },
          { dataset: { testid: 'edit-spell' }, title: 'Changes apply to everyone who knows it' },
        ),
      castBtn,
      button('Cancel', () => m.close()),
    ].filter((b): b is HTMLButtonElement => Boolean(b)),
  );
}

/** ChoiceDialog "Use Item" */
export function useItemDialog(
  items: { name: string; quantity: number }[],
  onPick: (name: string) => void,
): void {
  const sel = h(
    'select',
    { dataset: { testid: 'use-item-select' } },
    ...items.map((i) => h('option', { value: i.name }, `${i.name} (x${i.quantity})`)),
  );
  const m = modal('Use Item', h('div', { class: 'col' }, 'Select an item to use:', sel), [
    button('OK', () => (m.close(), onPick(sel.value)), {
      class: 'primary',
      dataset: { testid: 'use-item-ok' },
    }),
    button('Cancel', () => m.close()),
  ]);
}

const QUOTES = [
  'Veni, vidi, vici.',
  'Fortes fortuna adiuvat.',
  'Alea iacta est.',
  'Audentes fortuna iuvat.',
  'Dum spiro, spero.',
  'Per aspera ad astra.',
  'Carpe diem.',
  'Acta non verba.',
  'Vincit qui se vincit.',
  'Amor vincit omnia.',
];

/** VictoryView */
export function victoryOverlay(
  party: { name: string; hp: number; maxHp: number; statuses: string[] }[],
  onContinue: (() => void) | null,
): HTMLElement {
  const rows = party.map((p) => {
    const pct = p.maxHp > 0 ? p.hp / p.maxHp : 0;
    return h(
      'div',
      { class: 'row', style: 'width:360px;justify-content:space-between' },
      h('span', { style: 'font-weight:700' }, p.name),
      h(
        'div',
        { class: 'hpbar', style: 'width:120px' },
        h('div', {
          style: `width:${Math.max(0, Math.min(100, pct * 100))}%;background:${pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#e0a030' : '#d75f5f'}`,
        }),
      ),
      h('span', {}, `${p.hp} / ${p.maxHp}`),
      h(
        'span',
        { class: 'small', style: p.statuses.length ? 'color:#d75f5f' : 'color:#4caf50' },
        p.statuses.length
          ? p.statuses
              .slice(0, 3)
              .map((s) => s.slice(0, 4).toUpperCase())
              .join(' ') + (p.statuses.length > 3 ? ` +${p.statuses.length - 3}` : '')
          : 'OK',
      ),
    );
  });
  const el = h(
    'div',
    { class: 'victory', dataset: { testid: 'victory' } },
    h('h1', {}, 'Victory!'),
    h(
      'div',
      { style: 'font-family:Georgia,serif;font-style:italic;color:#c0a060' },
      QUOTES[Math.floor(Math.random() * QUOTES.length)] ?? '',
    ),
    h('div', { class: 'header' }, 'Party Status'),
    ...rows,
    onContinue
      ? button('Continue', () => (el.remove(), onContinue()), {
          class: 'primary',
          dataset: { testid: 'victory-continue' },
        })
      : null,
  );
  return el;
}
