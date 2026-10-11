import { describe, expect, it } from 'vitest';
import { normalizeSpell } from '../../src/assets/normalize.ts';
import { areaLabel, diceLabel, levelLabel, rangeLabel, spellSummary } from '../../src/assets/spellLabels.ts';
import { StatusEffect } from '../../src/assets/types.ts';
import { itemCard, itemRarity, spellCard, terrainCard } from '../../src/editors/cards.ts';
import { newItem, newSpell, newTerrain } from '../../src/editors/defaults.ts';
import {
  spellFormFromSpell,
  spellFormLayout,
  spellFormProblem,
  spellFromForm,
  spellPreview,
  targetForResolution,
} from '../../src/editors/spellForm.ts';
import { bundle } from '../helpers/engine.ts';

const spells = () => bundle().spells;

describe('spell labels (Spell.java)', () => {
  it('level, range, area and dice labels', () => {
    expect(levelLabel({ level: 0 })).toBe('Cantrip');
    expect(levelLabel({ level: 3 })).toBe('Level 3');
    expect([0, 1, 6].map((range) => rangeLabel({ range }))).toEqual(['Self', 'Touch', '6 tiles']);
    expect(areaLabel({ area: 'BURST', areaSize: 4, range: 0 })).toBe('Burst 4 around you');
    expect(areaLabel({ area: 'BURST', areaSize: 4, range: 30 })).toBe('Burst 4 @ 30 tiles');
    expect(areaLabel({ area: 'CONE', areaSize: 3, range: 0 })).toBe('Cone 3');
    expect(areaLabel({ area: 'NONE', areaSize: 3, range: 0 })).toBe('');
    expect(diceLabel({ damageDice: ['d8', null, 'd10'] })).toBe('d8 / - / d10');
    expect(diceLabel({ damageDice: [null, null, null] })).toBe('');
  });

  it('summaries match the Java format for the shipped spells', () => {
    const fireball = spells().Fireball;
    const cure = spells()['Cure Wounds'];
    if (!fireball || !cure) throw new Error('fixture');
    expect(spellSummary(fireball)).toMatch(/^DEX save \(half\) · Burst \d+ @ \d+ tiles · /);
    // HEAL shows only the heal die
    expect(spellSummary(cure)).toMatch(/^Heal · Touch · d\d+/);
    expect(spellSummary(cure)).not.toContain(' / ');
  });
});

describe('spell editor form (SpellEditorDialog.java)', () => {
  it('a new spell starts blank with the constructor defaults', () => {
    const v = spellFormFromSpell(newSpell(), true);
    expect(v).toMatchObject({
      name: '',
      level: 0,
      resolution: 'ATTACK',
      targetType: 'ENEMY',
      range: 6,
      area: 'NONE',
      areaSize: 2,
      dice: ['d10', null, null],
      riderOn: false,
      riderEffect: StatusEffect.DAMAGE_OVER_TIME,
      riderMagnitude: 2,
      riderDuration: 2,
      riderMinTier: 1,
    });
  });

  it('round-trips every shipped spell unchanged through the form', () => {
    for (const s of Object.values(spells())) {
      const back = spellFromForm(spellFormFromSpell(s, false), s);
      // the form clamps into its spinner ranges, exactly like Java's spinners
      expect(back, s.name).toEqual({ ...s, description: s.description.trim(), school: s.school.trim() });
    }
  });

  it('shows rows by resolution, area and rider like the update runnable', () => {
    const v = spellFormFromSpell(newSpell(), true);
    const attack = spellFormLayout(v);
    expect(attack.visible).toMatchObject({
      saveStat: false,
      tier2: true,
      upcast: false,
      areaSize: false,
      range: true,
    });
    expect(spellFormLayout({ ...v, resolution: 'SAVE' }).visible).toMatchObject({
      saveStat: true,
      onSave: true,
    });
    const heal = spellFormLayout({ ...v, resolution: 'HEAL', area: 'BURST' });
    expect(heal.labels.tier1).toBe('Heal Die:');
    expect(heal.visible).toMatchObject({ tier2: false, tier3: false, friendlyFire: false, areaSize: true });
    expect(heal.labels).toMatchObject({ range: 'Range (0 = on you):', areaSize: 'Burst Radius:' });
    const cone = spellFormLayout({ ...v, area: 'CONE' });
    expect(cone.visible.range).toBe(false);
    expect(cone.labels.areaSize).toBe('Length (tiles):');
    const buff = spellFormLayout({ ...v, resolution: 'BUFF', level: 2, riderOn: true });
    expect(buff.visible).toMatchObject({
      tier1: false,
      flat: false,
      upcast: false,
      castingMod: false,
      riderMinTier: false,
    });
    expect(spellFormLayout({ ...v, level: 2 }).visible.upcast).toBe(true);
    expect(spellFormLayout({ ...v, riderOn: true }).visible).toMatchObject({
      riderName: true,
      riderAttr: false,
      riderMinTier: true,
    });
    expect(
      spellFormLayout({ ...v, riderOn: true, riderEffect: StatusEffect.STAT_MODIFIER }).visible.riderAttr,
    ).toBe(true);
    expect(spellFormLayout({ ...v, riderOn: true, resolution: 'AUTO' }).visible.riderMinTier).toBe(false);
  });

  it('previews the tiers the way the Java label reads', () => {
    expect(spellPreview({ resolution: 'ATTACK', dice: ['d10', 'd10', 'd12'], flatDamage: 3 })).toBe(
      'Tier 1: d10 + 3   Tier 2: 2d10 + 3   Tier 3: 2d10 + d12 + 3',
    );
    expect(spellPreview({ resolution: 'ATTACK', dice: [null, null, null], flatDamage: 0 })).toBe(
      'No damage dice: only the status effect matters.',
    );
    expect(spellPreview({ resolution: 'AUTO', dice: ['d4', 'd4', null], flatDamage: -1 })).toBe(
      'Always hits for 2d4 - 1.',
    );
    expect(spellPreview({ resolution: 'HEAL', dice: ['d8', null, null], flatDamage: 0 })).toBe('Heals d8.');
    expect(spellPreview({ resolution: 'HEAL', dice: [null, null, null], flatDamage: 0 })).toBe(
      'Heals nothing - pick a heal die.',
    );
    expect(spellPreview({ resolution: 'BUFF', dice: ['d8', null, null], flatDamage: 0 })).toBe(
      'Buff: no roll, the status effect is applied directly.',
    );
  });

  it('validates the name and the BUFF rider, and builds the rider status on save', () => {
    const v = { ...spellFormFromSpell(newSpell(), true), name: 'Haste' };
    expect(spellFormProblem({ ...v, name: ' ' })?.title).toBe('Missing Name');
    expect(spellFormProblem({ ...v, resolution: 'BUFF' })?.title).toBe('Buff Needs an Effect');
    expect(spellFormProblem({ ...v, resolution: 'BUFF', riderOn: true, riderName: 'Hasted' })).toBeNull();
    const s = spellFromForm(
      {
        ...v,
        riderOn: true,
        riderName: ' Weakened ',
        riderEffect: StatusEffect.STAT_MODIFIER,
        riderAttr: 2,
        riderDuration: 0,
      },
      newSpell(),
    );
    expect(s.riderStatus).toMatchObject({ name: 'Weakened', effectType: 3, duration: 1, targetAttribute: 2 });
    const dot = spellFromForm({ ...v, riderOn: true, riderName: 'Burning', riderAttr: 4 }, newSpell());
    expect(dot.riderStatus?.targetAttribute).toBe(-1);
    expect(spellFromForm({ ...v, riderOn: true, riderName: '  ' }, newSpell()).riderStatus).toBeNull();
  });

  it('switching to a friendly resolution retargets enemies to allies and back', () => {
    expect(targetForResolution('ENEMY', 'HEAL')).toBe('ALLY');
    expect(targetForResolution('ANY', 'BUFF')).toBe('ANY');
    expect(targetForResolution('ALLY', 'SAVE')).toBe('ENEMY');
    expect(targetForResolution('SELF', 'ATTACK')).toBe('SELF');
  });

  it('clamps out-of-range values into the spinner ranges', () => {
    const wild = normalizeSpell({ name: 'Wild', range: 99, level: 12, flatDamage: -40, areaSize: 0 });
    expect(spellFormFromSpell(wild, false)).toMatchObject({
      range: 30,
      level: 9,
      flatDamage: -20,
      areaSize: 1,
    });
  });
});

describe('asset cards (CardUtils.java)', () => {
  it('weapon rarity follows the tier-1 die estimate, so weapons top out at Uncommon', () => {
    const w = newItem('weapon');
    expect(itemRarity(w)).toBe('Common');
    if (w.kind !== 'weapon') throw new Error();
    expect(itemRarity({ ...w, damageDice: ['d12', 'd12', 'd20'] })).toBe('Uncommon');
    expect(itemRarity({ ...w, damageDice: ['d20', null, null] })).toBe('Uncommon');
    const card = itemCard({ ...w, name: 'Axe', modifiedAttributes: [2, 0, -1, 0, 0, 0] });
    expect(card.details).toEqual([
      { label: 'Damage Dice', value: 'd6/d6/d8' },
      { label: 'STR', value: '+2' },
      { label: 'CON', value: '-1' },
    ]);
  });

  it('accessory rarity from defense; consumable, ammo, crafting and key item lines', () => {
    const a = newItem('accessory');
    if (a.kind !== 'accessory') throw new Error();
    expect([1, 2, 5, 10].map((defense) => itemRarity({ ...a, defense }))).toEqual([
      'Common',
      'Uncommon',
      'Rare',
      'Legendary',
    ]);
    expect(itemCard(newItem('consumable')).details).toEqual([{ label: 'Heal', value: '+10 HP' }]);
    expect(itemCard(newItem('ammunition')).details).toEqual([{ label: 'Ammo', value: '12 Gauge' }]);
    expect(itemCard(newItem('crafting')).badges).toEqual(['Material']);
    const k = newItem('keyitem');
    if (k.kind !== 'keyitem') throw new Error();
    expect(itemCard({ ...k, questRelated: true })).toMatchObject({
      badges: ['Quest Item'],
      style: 'legendary',
    });
  });

  it('spell and terrain cards', () => {
    const fireball = spells().Fireball;
    if (!fireball) throw new Error('fixture');
    const card = spellCard(fireball);
    expect(card.badges).toEqual([levelLabel(fireball), 'SAVE']);
    expect(card.details.map((d) => d.label)).toEqual(
      expect.arrayContaining(['Area', 'Targets', 'Save', 'Damage']),
    );
    const t = { ...newTerrain(), type: 'Puddle', collision: false, entityAboveTerrain: false };
    expect(terrainCard(t).details).toEqual([
      { label: 'HP', value: '10' },
      { label: 'Collision', value: 'No' },
      { label: 'Layer', value: 'Below' },
    ]);
  });
});
