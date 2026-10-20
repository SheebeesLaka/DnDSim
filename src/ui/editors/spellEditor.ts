/**
 * UI/SpellEditorDialog.java: add/edit a spell. Shared by the Asset Editor and the
 * character sheet's spell list. Saving
 * goes through the AssetStore, so a rename also updates every sheet that knows
 * the spell.
 */
import type { SpellDef } from '../../assets/types.ts';
import type { AssetStore } from '../../editors/assetStore.ts';
import { DICE_CHOICES, STAT_TYPES, newSpell } from '../../editors/defaults.ts';
import {
  RIDER_EFFECTS,
  SPINNER_RANGES,
  spellFormFromSpell,
  spellFormLayout,
  spellFormProblem,
  spellFromForm,
  spellPreview,
  targetForResolution,
  type SpellFormValues,
  type SpellRow,
} from '../../editors/spellForm.ts';
import { h } from '../dom.ts';
import {
  checkField,
  colorField,
  editorDialog,
  formGrid,
  intField,
  selectField,
  textArea,
  textField,
  warn,
  type Row,
} from './form.ts';

const NO_DIE = '-';
const dieChoices = [NO_DIE, ...DICE_CHOICES];
const dieOf = (v: string): string | null => (v === NO_DIE ? null : v);

const RESOLUTION_TIP = [
  'ATTACK: d20 + casting stat vs AC, margin picks the tier',
  'SAVE: target rolls vs your DC, how badly they fail picks the tier',
  "AUTO: always hits, rolls all three tiers' dice",
  'HEAL: restores HP with the tier 1 die',
  'BUFF: no roll, just applies the status effect',
].join('\n');
const AREA_TIP = [
  'NONE: single target',
  'BURST: diamond of the given radius, placed within range (range 0 = centered on you)',
  'CONE: spreads out from you, size = length',
  'LINE: 1 tile wide from you toward the cursor, size = length',
].join('\n');

export function openSpellEditor(
  assets: AssetStore,
  existing: SpellDef | null,
  onSaved?: (name: string) => void,
): void {
  const base = existing ?? newSpell();
  const v0 = spellFormFromSpell(base, existing === null);
  const tid = (id: string) => ({ dataset: { testid: `spell-${id}` } });

  const name = textField(v0.name, tid('name'));
  const color = colorField(v0.color, tid('color'));
  const level = intField(v0.level, ...SPINNER_RANGES.level, tid('level'));
  const school = textField(v0.school, tid('school'));
  const desc = textArea(v0.description, 3, tid('description'));
  const resolution = selectField(['ATTACK', 'SAVE', 'HEAL', 'BUFF', 'AUTO'] as const, v0.resolution, {
    ...tid('resolution'),
    title: RESOLUTION_TIP,
  });
  const target = selectField(['ENEMY', 'ALLY', 'SELF', 'ANY'] as const, v0.targetType, tid('target'));
  const range = intField(v0.range, ...SPINNER_RANGES.range, tid('range'));
  const area = selectField(['NONE', 'BURST', 'CONE', 'LINE'] as const, v0.area, {
    ...tid('area'),
    title: AREA_TIP,
  });
  const areaSize = intField(v0.areaSize, ...SPINNER_RANGES.areaSize, tid('area-size'));
  const friendlyFire = checkField(
    'Also hits allies (and you) in the area',
    v0.friendlyFire,
    tid('friendly-fire'),
  );
  const saveStat = selectField(STAT_TYPES, v0.saveStat as (typeof STAT_TYPES)[number], tid('save-stat'));
  const onSave = selectField(['NONE', 'HALF'] as const, v0.onSave, tid('on-save'));
  const tiers = v0.dice.map((d, i) => selectField(dieChoices, d ?? NO_DIE, tid(`tier${i + 1}`)));
  const flat = intField(v0.flatDamage, ...SPINNER_RANGES.flatDamage, tid('flat'));
  const upcast = selectField(dieChoices, v0.upcastDie ?? NO_DIE, tid('upcast'));
  const castingMod = checkField('Add casting modifier to the total', v0.addCastingMod, tid('casting-mod'));
  const riderOn = checkField('Applies a status effect', v0.riderOn, tid('rider-on'));
  const riderName = textField(v0.riderName, { placeholder: 'e.g. Burning', ...tid('rider-name') });
  const riderEffect = selectField(RIDER_EFFECTS, v0.riderEffect, tid('rider-effect'));
  const riderMagnitude = intField(v0.riderMagnitude, ...SPINNER_RANGES.riderMagnitude, {
    ...tid('rider-magnitude'),
    title: 'Damage/heal per turn, or the size of the stat/AC/attack/movement change',
  });
  const riderDuration = intField(v0.riderDuration, ...SPINNER_RANGES.riderDuration, {
    ...tid('rider-duration'),
    title:
      'Counts down at the start of the target\'s turn; -1 = permanent.\nUse 2 for "until the end of their next turn".',
  });
  const riderAttr = selectField(
    STAT_TYPES.map((s, i) => ({ value: i, label: s })),
    v0.riderAttr,
    tid('rider-attr'),
  );
  const riderMinTier = intField(v0.riderMinTier, ...SPINNER_RANGES.riderMinTier, {
    ...tid('rider-min-tier'),
    title: 'Only apply the status on a hit / failed save of at least this tier',
  });
  const preview = h('div', { class: 'spell-preview', dataset: { testid: 'spell-preview' } });

  const g = formGrid();
  g.row('Name:', name);
  g.row('Color:', color.el);
  g.row('Level (0 = cantrip):', level.el);
  g.row('School:', school);
  g.row('Description:', desc);
  g.row('Resolution:', resolution.el);
  g.row('Targets:', target.el);
  const rows: Partial<Record<SpellRow, Row>> = {};
  rows.range = g.row('Range (tiles):', range.el);
  g.row('Area:', area.el);
  rows.areaSize = g.row('Area Size (tiles):', areaSize.el);
  rows.friendlyFire = g.row('', friendlyFire.el);
  rows.saveStat = g.row('Save Stat:', saveStat.el);
  rows.onSave = g.row('On Successful Save:', onSave.el);
  g.section('Damage');
  rows.tier1 = g.row('Tier 1 Die:', (tiers[0] as (typeof tiers)[number]).el);
  rows.tier2 = g.row('Tier 2 Die:', (tiers[1] as (typeof tiers)[number]).el);
  rows.tier3 = g.row('Tier 3 Die:', (tiers[2] as (typeof tiers)[number]).el);
  rows.flat = g.row('Flat Bonus:', flat.el);
  rows.upcast = g.row('Upcast Die (per lvl):', upcast.el);
  rows.castingMod = g.row('', castingMod.el);
  g.section('Status Effect');
  g.row('', riderOn.el);
  rows.riderName = g.row('Status Name:', riderName);
  rows.riderEffect = g.row('Effect:', riderEffect.el);
  rows.riderMagnitude = g.row('Magnitude:', riderMagnitude.el);
  rows.riderDuration = g.row('Duration (turns):', riderDuration.el);
  rows.riderAttr = g.row('Stat:', riderAttr.el);
  rows.riderMinTier = g.row('Min Tier to Apply:', riderMinTier.el);
  g.el.appendChild(preview);

  const values = (): SpellFormValues => ({
    name: name.value,
    color: color.get(),
    level: level.get(),
    school: school.value,
    description: desc.value,
    resolution: resolution.get(),
    targetType: target.get(),
    range: range.get(),
    area: area.get(),
    areaSize: areaSize.get(),
    friendlyFire: friendlyFire.get(),
    dice: [
      dieOf(tiers[0]?.get() ?? NO_DIE),
      dieOf(tiers[1]?.get() ?? NO_DIE),
      dieOf(tiers[2]?.get() ?? NO_DIE),
    ],
    upcastDie: dieOf(upcast.get()),
    flatDamage: flat.get(),
    addCastingMod: castingMod.get(),
    saveStat: saveStat.get(),
    onSave: onSave.get(),
    riderOn: riderOn.get(),
    riderName: riderName.value,
    riderEffect: riderEffect.get(),
    riderMagnitude: riderMagnitude.get(),
    riderDuration: riderDuration.get(),
    riderAttr: riderAttr.get(),
    riderMinTier: riderMinTier.get(),
  });

  const update = () => {
    const v = values();
    const layout = spellFormLayout(v);
    for (const [key, row] of Object.entries(rows) as [SpellRow, Row][]) row.show(layout.visible[key]);
    rows.tier1?.setLabel(layout.labels.tier1);
    rows.range?.setLabel(layout.labels.range);
    rows.areaSize?.setLabel(layout.labels.areaSize);
    preview.textContent = spellPreview(v);
  };
  resolution.el.addEventListener('change', () => {
    target.set(targetForResolution(target.get(), resolution.get()));
    update();
  });
  for (const el of [level.el, riderOn.box, riderEffect.el, flat.el, area.el, ...tiers.map((t) => t.el)]) {
    el.addEventListener('change', update);
    el.addEventListener('input', update);
  }
  update();

  editorDialog({
    title: existing ? `Edit Spell - ${existing.name}` : 'Add Spell',
    body: g.el,
    okLabel: existing ? 'Save' : 'Create',
    testid: 'spell-editor',
    onOk: () => {
      const v = values();
      const problem = spellFormProblem(v);
      if (problem) return warn(problem.title, problem.message);
      const spell = spellFromForm(v, base);
      const res = assets.saveSpell(spell, existing?.name ?? null);
      if (!res.ok) return warn(res.title, res.message);
      onSaved?.(spell.name);
      return true;
    },
  });
}
