/**
 * Item / character abilities. One dialog serves the Asset Editor's item
 * abilities and the sheet's Add Ability (CharacterSheetPane): it always shows
 * Ability Type and Status Name, which the Java item dialog lacked, so editing a
 * STATUS ability no longer drops its status name (FEATURES.md F-48).
 */
import {
  AbilityEffect,
  AbilityTrigger,
  AbilityType,
  ATTRIBUTE_SHORT,
  type ItemAbilityDef,
} from '../../assets/types.ts';
import { newAbility } from '../../editors/defaults.ts';
import { button, h, replaceChildren } from '../dom.ts';
import { editorDialog, formGrid, intField, selectField, textField, warn } from './form.ts';

export interface AbilityDialogOptions {
  existing: ItemAbilityDef | null;
  /** preselected type for a new ability (the sheet's Passive/Active/Special tab) */
  initialType?: string;
  /** item dialog: −100..100; sheet: −99..99 */
  magnitude: [number, number];
  /** sheets require a name; items fall back to "Unnamed" like Java */
  requireName: boolean;
  onSave: (ability: ItemAbilityDef) => void;
}

export function openAbilityDialog(o: AbilityDialogOptions): void {
  const base = o.existing ?? newAbility(o.initialType ?? AbilityType.PASSIVE);
  const tid = (id: string) => ({ dataset: { testid: `ability-${id}` } });
  const type = selectField(Object.values(AbilityType), base.abilityType as never, tid('type'));
  const name = textField(base.name, { placeholder: 'Ability name', ...tid('name') });
  const desc = textField(base.description, { placeholder: 'Description', ...tid('description') });
  const trigger = selectField(
    Object.values(AbilityTrigger),
    (o.existing ? base.triggerType : AbilityTrigger.ON_TURN_START) as never,
    tid('trigger'),
  );
  const effect = selectField(Object.values(AbilityEffect), base.effectType as never, tid('effect'));
  const magnitude = intField(
    o.existing ? base.magnitude : 1,
    o.magnitude[0],
    o.magnitude[1],
    tid('magnitude'),
  );
  const attr = selectField(
    ATTRIBUTE_SHORT.map((label, value) => ({ value, label })),
    Math.max(0, base.targetAttribute),
    tid('attr'),
  );
  const status = textField(base.statusName ?? '', { placeholder: 'Status name', ...tid('status') });

  const g = formGrid();
  g.row('Type:', type.el);
  g.row('Name:', name);
  g.row('Description:', desc);
  g.row('Trigger:', trigger.el);
  g.row('Effect:', effect.el);
  g.row('Magnitude:', magnitude.el);
  g.row('Target Attr:', attr.el);
  g.row('Status Name:', status);
  const sync = () => {
    // Trigger only means something for Passive abilities; attr/status only for their effects
    trigger.el.disabled = type.get() !== AbilityType.PASSIVE;
    attr.el.disabled = effect.get() !== AbilityEffect.STAT_BOOST;
    status.disabled = effect.get() !== AbilityEffect.STATUS;
  };
  type.el.addEventListener('change', sync);
  effect.el.addEventListener('change', sync);
  sync();

  editorDialog({
    title: o.existing ? 'Edit Ability' : 'Add Ability',
    body: g.el,
    okLabel: o.existing ? 'OK' : 'Add',
    width: 380,
    testid: 'ability-dialog',
    onOk: () => {
      const n = name.value.trim();
      if (!n && o.requireName) return warn('Missing Name', 'Give the ability a name.');
      const statusName = status.value.trim();
      o.onSave({
        ...base,
        name: n || 'Unnamed',
        description: desc.value.trim(),
        triggerType: trigger.get(),
        effectType: effect.get(),
        magnitude: magnitude.get(),
        targetAttribute: attr.get(),
        statusName: statusName === '' ? null : statusName,
        abilityType: type.get(),
      });
      return true;
    },
  });
}

/** Trigger line shown under an ability ("On turn start · Heal 2"). */
export function abilityLine(a: ItemAbilityDef): string {
  const trig = a.triggerType.toLowerCase().replace(/_/g, ' ');
  const eff =
    a.effectType === AbilityEffect.STAT_BOOST
      ? `${ATTRIBUTE_SHORT[a.targetAttribute] ?? 'stat'} +${a.magnitude}`
      : a.effectType === AbilityEffect.STATUS
        ? `status ${a.statusName ?? '?'}`
        : `${a.effectType.toLowerCase()} ${a.magnitude}`;
  return `${trig[0]?.toUpperCase() ?? ''}${trig.slice(1)} · ${eff}`;
}

/** The item dialogs' ability list: rows plus [+] [Edit] [−] (AssetEditorView.java:1065-1122). */
export function abilityListEditor(initial: ItemAbilityDef[]): { el: HTMLElement; get(): ItemAbilityDef[] } {
  const abilities = initial.map((a) => ({ ...a }));
  let selected = -1;
  const list = h('div', { class: 'ability-list', dataset: { testid: 'ability-list' } });
  const render = () => {
    replaceChildren(
      list,
      abilities.length === 0
        ? h('div', { class: 'muted small' }, 'No abilities')
        : abilities.map((a, i) =>
            h(
              'div',
              {
                class: `ability-row${i === selected ? ' on' : ''}`,
                onclick: () => {
                  selected = i;
                  render();
                },
                dataset: { testid: `ability-row-${i}` },
              },
              h('strong', {}, a.name),
              h('span', { class: 'muted small' }, ` ${abilityLine(a)}`),
            ),
          ),
    );
  };
  const edit = (index: number | null) =>
    openAbilityDialog({
      existing: index === null ? null : (abilities[index] ?? null),
      magnitude: [-100, 100],
      requireName: false,
      onSave: (a) => {
        if (index === null) abilities.push(a);
        else abilities[index] = a;
        selected = index ?? abilities.length - 1;
        render();
      },
    });
  render();
  const el = h(
    'div',
    { class: 'col' },
    h('div', { class: 'form-section' }, 'Abilities'),
    list,
    h(
      'div',
      { class: 'row' },
      button('+', () => edit(null), { title: 'Add ability', dataset: { testid: 'ability-add' } }),
      button('Edit', () => selected >= 0 && edit(selected), { dataset: { testid: 'ability-edit' } }),
      button(
        '−',
        () => {
          if (selected < 0) return;
          abilities.splice(selected, 1);
          selected = -1;
          render();
        },
        { title: 'Remove ability', dataset: { testid: 'ability-remove' } },
      ),
    ),
  );
  return { el, get: () => abilities.map((a) => ({ ...a })) };
}
