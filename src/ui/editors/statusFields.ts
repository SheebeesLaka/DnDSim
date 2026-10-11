/** "Applies a status effect" sub-form (spell rider layout), used for consumable effects. */
import { StatusEffect, type StatusDef } from '../../assets/types.ts';
import { STAT_TYPES } from '../../editors/defaults.ts';
import { RIDER_EFFECTS, SPINNER_RANGES } from '../../editors/spellForm.ts';
import { checkField, intField, selectField, textField, type Row, type formGrid } from './form.ts';

export function statusFields(
  g: ReturnType<typeof formGrid>,
  initial: StatusDef | null,
  testPrefix: string,
): { get(): StatusDef | null } {
  const tid = (id: string) => ({ dataset: { testid: `${testPrefix}-${id}` } });
  const on = checkField('Applies a status effect', initial !== null, tid('on'));
  const name = textField(initial?.name ?? '', { placeholder: 'e.g. Regenerating', ...tid('name') });
  const effect = selectField(
    RIDER_EFFECTS,
    initial && initial.effectType > 0 ? initial.effectType : StatusEffect.HEAL_OVER_TIME,
    tid('effect'),
  );
  const magnitude = intField(initial?.magnitude ?? 2, ...SPINNER_RANGES.riderMagnitude, tid('magnitude'));
  const duration = intField(initial?.duration ?? 2, ...SPINNER_RANGES.riderDuration, tid('duration'));
  const attr = selectField(
    STAT_TYPES.map((s, i) => ({ value: i, label: s })),
    initial && initial.targetAttribute >= 0 ? initial.targetAttribute : 0,
    tid('attr'),
  );
  g.row('', on.el);
  const rows: Row[] = [
    g.row('Status Name:', name),
    g.row('Effect:', effect.el),
    g.row('Magnitude:', magnitude.el),
    g.row('Duration (turns):', duration.el),
  ];
  const attrRow = g.row('Stat:', attr.el);
  const sync = () => {
    for (const r of rows) r.show(on.get());
    attrRow.show(on.get() && effect.get() === StatusEffect.STAT_MODIFIER);
  };
  on.box.addEventListener('change', sync);
  effect.el.addEventListener('change', sync);
  sync();
  return {
    get() {
      const n = name.value.trim();
      if (!on.get() || n === '') return null;
      const d = duration.get();
      return {
        name: n,
        effectType: effect.get(),
        magnitude: magnitude.get(),
        duration: d === 0 ? 1 : d,
        targetAttribute: effect.get() === StatusEffect.STAT_MODIFIER ? attr.get() : -1,
        extra: initial?.extra ?? {},
      };
    },
  };
}
