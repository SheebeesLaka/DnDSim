/**
 * The roll panel, as data: what the DM has typed so far for the pending roll
 * (the draft) run through the same rules SUBMIT_ROLL will use, so the panel
 * and the TV show the total, margin, tier, dice and damage changing live.
 * Nothing here changes state; the numbers match pending.ts exactly.
 */
import { dieMax } from '../dice.ts';
import {
  attackTier,
  calculateMargin,
  damageTotal,
  diceForTier,
  saveFailTier,
  spellDice,
  sumRolledForTier,
} from '../rules/combat.ts';
import { combatantById, unitById, unitName } from '../selectors/board.ts';
import {
  acParts,
  attackParts,
  castingParts,
  halfBonusParts,
  saveDCParts,
  saveParts,
  spellAttackParts,
  sumParts,
  type Part,
} from '../selectors/breakdown.ts';
import {
  armorClass,
  attackModifier,
  health,
  maxHealth,
  movement,
  spellStatIndex,
} from '../selectors/stats.ts';
import type { AreaFlow, BattleState, Combatant, Flow, Pending, Unit, UnitId } from '../types.ts';
import { unitEffects, type EffectVM } from './effects.ts';

/** What the DM has typed into the roll panel but not submitted yet (session state). */
export interface RollDraft {
  d20: string;
  dice: string[];
  areaD20s: string[];
  d10: string;
}
export const emptyDraft = (): RollDraft => ({ d20: '', dice: [], areaD20s: [], d10: '' });

export interface StatLineVM {
  label: string;
  value: number;
  /** what statuses and DM tweaks add (green when > 0, red when < 0) */
  delta: number;
}

export interface FighterVM {
  id: UnitId;
  name: string;
  side: 'party' | 'enemy' | 'other';
  hp: number;
  maxHp: number;
  /** HP once the roll lands (null until there is a number) */
  hpAfter: number | null;
  spritePath: string | null;
  color: string;
  initials: string;
  subtitle: string;
  stats: StatLineVM[];
  effects: EffectVM[];
  /** player view: how much of this creature's HP may show (display.player.enemyHp) */
  hpShown?: 'exact' | 'bar' | 'none';
}

export interface DieVM {
  die: string;
  typed: string;
  value: number | null;
  /** the field the next keystroke goes to */
  active: boolean;
}

export interface AreaRowVM {
  id: UnitId;
  name: string;
  typed: string;
  d20: number | null;
  total: number | null;
  vs: number;
  tier: number | null;
  outcome: RollOutcome | null;
  damage: number | null;
}

export type RollOutcome = 'miss' | 'hit' | 'crit' | 'saved' | 'half' | 'failed' | 'heal' | 'auto';

export interface RollVM {
  kind: 'attack' | 'spellAttack' | 'save' | 'heal' | 'auto' | 'buff' | 'area' | 'item';
  step: Pending['kind'];
  /** weapon / spell / item name */
  title: string;
  /** "d6 / d6 / d10", spell level, etc. */
  detail: string;
  attacker: FighterVM | null;
  target: FighterVM | null;
  d20: DieVM | null;
  /** added to the d20 (attack modifier, or the target's save modifier) */
  modParts: Part[];
  total: number | null;
  vs: { label: 'AC' | 'DC'; value: number; parts: Part[] } | null;
  /** attack: total − AC; save: how badly it failed (DC − total − 1, negative = saved) */
  margin: number | null;
  tier: number | null;
  outcome: RollOutcome | null;
  /** points to the next tier, while not at T3 */
  toNextTier: number | null;
  crit: boolean;
  dice: DieVM[];
  /** dice the d20 would lead to (shown greyed before the d20 lands) */
  previewDice: string[];
  bonusParts: Part[];
  damage: number | null;
  /** every die is typed */
  complete: boolean;
  heal: boolean;
  halve: boolean;
  area: AreaRowVM[] | null;
  banner: string | null;
}

const parseDie = (typed: string | undefined, max: number): number | null => {
  if (typed === undefined || typed.trim() === '') return null;
  const v = Number(typed);
  return Number.isInteger(v) && v >= 1 && v <= max ? v : null;
};

/** Breakdown parts if they sum to the number the flow froze, else one honest part. */
const checked = (parts: Part[], expected: number, label: string): Part[] =>
  sumParts(parts) === expected ? parts : [{ label, value: expected, kind: 'stat' }];

function bareCopy(u: Combatant): Combatant {
  const c = JSON.parse(JSON.stringify(u)) as Combatant;
  c.acAdjustment = 0;
  if (c.kind === 'entity') {
    c.sheet.status = [];
    c.statAdjustment = [0, 0, 0, 0, 0, 0];
  } else {
    c.statuses = [];
    c.dexAdjustment = 0;
  }
  return c;
}

export function fighterVM(state: BattleState, u: Unit, hpAfter: number | null): FighterVM {
  const initials = unitName(u)
    .replace(/#\d+$/, '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  if (u.kind !== 'entity' && u.kind !== 'enemy') {
    const hp = u.kind === 'terrain' ? u.health : 0;
    return {
      id: u.id,
      name: unitName(u),
      side: 'other',
      hp,
      maxHp: Math.max(1, hp),
      hpAfter,
      spritePath: u.kind === 'terrain' ? u.spritePath : null,
      color: u.kind === 'terrain' ? u.color : u.item.color,
      initials,
      subtitle: u.kind === 'terrain' ? 'Terrain' : 'Item',
      stats: [{ label: 'AC', value: 10, delta: 0 }],
      effects: [],
    };
  }
  const bare = bareCopy(u);
  const line = (label: string, f: (x: Combatant) => number): StatLineVM => ({
    label,
    value: f(u),
    delta: f(u) - f(bare),
  });
  const weapon = u.kind === 'entity' ? u.sheet.weapons[0] : null;
  return {
    id: u.id,
    name: unitName(u),
    side: u.kind === 'enemy' ? 'enemy' : u.sheet.isParty ? 'party' : 'other',
    hp: health(u),
    maxHp: maxHealth(u),
    hpAfter,
    spritePath: u.kind === 'entity' ? u.sheet.spritePath : u.spritePath,
    color: u.kind === 'entity' ? u.sheet.color : u.color,
    initials,
    subtitle:
      u.kind === 'entity'
        ? [
            u.sheet.characterClass?.trim() && u.sheet.characterClass !== 'None'
              ? u.sheet.characterClass.trim()
              : null,
            weapon?.name ?? 'Unarmed',
          ]
            .filter(Boolean)
            .join(' · ')
        : (u.tags[0] ?? 'Enemy'),
    stats: [line('ATK', attackModifier), line('AC', armorClass), line('MOB', movement)],
    effects: unitEffects(state, u),
  };
}

function dieVMs(dice: readonly string[], typed: readonly string[]): DieVM[] {
  const out = dice.map((d, i) => ({
    die: d,
    typed: typed[i] ?? '',
    value: parseDie(typed[i], dieMax(d)),
    active: false,
  }));
  const first = out.findIndex((d) => d.value === null);
  if (first >= 0) (out[first] as DieVM).active = true;
  return out;
}

const describeDice = (dice: readonly (string | null)[]) => dice.filter(Boolean).join(' / ');

function attackLike(
  state: BattleState,
  flow: Flow,
): { attacker: Combatant | undefined; target: Unit | undefined } {
  if (flow.flow === 'attack')
    return { attacker: combatantById(state, flow.attackerId), target: unitById(state, flow.targetId) };
  if (flow.flow === 'spell')
    return { attacker: combatantById(state, flow.casterId), target: unitById(state, flow.targetId) };
  return { attacker: combatantById(state, flow.casterId), target: undefined };
}

function bonusPartsFor(flow: Flow, caster: Combatant | undefined): Part[] {
  if (flow.flow === 'attack') {
    const parts = caster ? halfBonusParts(attackParts(caster)) : [];
    return checked(parts, flow.damageBonus, 'bonus');
  }
  const spell = flow.spell;
  const parts: Part[] = [];
  if (spell.addCastingMod && caster) parts.push(...halfBonusParts(castingParts(caster)));
  if (spell.flatDamage) parts.push({ label: spell.name, value: spell.flatDamage, kind: 'flat' });
  return checked(parts, flow.damageBonus, 'bonus');
}

const outcomeBanner: Record<RollOutcome, string> = {
  miss: 'MISS',
  hit: 'HIT',
  crit: 'CRITICAL HIT',
  saved: 'SAVED',
  half: 'SAVED – HALF',
  failed: 'FAILED SAVE',
  heal: 'HEALING',
  auto: 'AUTO-HIT',
};

function targetAfter(target: Unit | undefined, damage: number | null, heal: boolean): number | null {
  if (!target || damage === null) return null;
  const hp =
    target.kind === 'entity' || target.kind === 'enemy'
      ? health(target)
      : target.kind === 'terrain'
        ? target.health
        : 0;
  const max = target.kind === 'entity' || target.kind === 'enemy' ? maxHealth(target) : hp;
  return heal ? Math.min(max, hp + damage) : Math.max(0, hp - damage);
}

/** Build the roll panel for whatever is pending; null when nothing is being rolled. */
export function buildRollVM(state: BattleState, draft: RollDraft = emptyDraft()): RollVM | null {
  const p = state.pending;
  if (!p || p.kind === 'initiativeEntry' || p.kind === 'tieOrder') return null;

  if (p.kind === 'd10Efficacy') {
    const u = unitById(state, p.unitId);
    const v = parseDie(draft.d10, 10);
    const heal = v === null ? null : Math.ceil((p.healAmount * v * 10) / 100);
    return {
      ...blank('item', p.kind),
      title: p.itemName,
      detail: `heals up to ${p.healAmount}`,
      attacker: u ? fighterVM(state, u, targetAfter(u, heal, true)) : null,
      dice: [{ die: 'd10', typed: draft.d10, value: v, active: v === null }],
      damage: heal,
      complete: v !== null,
      heal: true,
      outcome: v === null ? null : 'heal',
      banner: 'HEALING',
    };
  }

  const flow = p.flow;
  const { attacker, target } = attackLike(state, flow);

  if (flow.flow === 'area') return areaVM(state, p, flow, attacker, draft);

  const spell = flow.flow === 'spell' ? flow.spell : null;
  const res = spell?.resolution ?? 'ATTACK';
  const kind: RollVM['kind'] =
    flow.flow === 'attack'
      ? 'attack'
      : res === 'ATTACK'
        ? 'spellAttack'
        : res === 'SAVE'
          ? 'save'
          : res === 'HEAL'
            ? 'heal'
            : res === 'AUTO'
              ? 'auto'
              : 'buff';
  const title =
    flow.flow === 'attack'
      ? attacker?.kind === 'entity'
        ? (attacker.sheet.weapons[0]?.name ?? 'Unarmed')
        : 'Attack'
      : (spell?.name ?? '');
  const detail =
    flow.flow === 'attack'
      ? describeDice(flow.weaponDice)
      : spell && spell.level > 0
        ? `Level ${flow.slotLevel}${flow.slotLevel > spell.level ? ' (upcast)' : ''}`
        : 'Cantrip';
  const vm: RollVM = { ...blank(kind, p.kind), title, detail };
  vm.bonusParts = bonusPartsFor(flow, attacker);
  vm.heal = res === 'HEAL';

  // ---- the d20 (locked once SUBMIT_ROLL took it) ----
  const lockedD20 = p.kind === 'damage' || p.kind === 'confirm' ? (p.d20 ?? null) : null;
  const d20 = lockedD20 ?? (p.kind === 'd20' ? parseDie(draft.d20, 20) : null);
  const needsD20 = kind === 'attack' || kind === 'spellAttack' || kind === 'save';
  if (needsD20)
    vm.d20 = {
      die: 'd20',
      typed: lockedD20 !== null ? String(lockedD20) : draft.d20,
      value: d20,
      active: p.kind === 'd20' && d20 === null,
    };

  let tier: number | null = null;
  if (kind === 'attack' || kind === 'spellAttack') {
    const atk = flow.flow === 'attack' ? flow.attackMod : (flow.attackMod ?? 0);
    const ac = flow.flow === 'attack' ? flow.targetAC : (flow.targetAC ?? 10);
    vm.modParts = attacker
      ? checked(kind === 'attack' ? attackParts(attacker) : spellAttackParts(attacker), atk, 'mod')
      : [{ label: 'mod', value: atk, kind: 'stat' }];
    const tgt = target && (target.kind === 'entity' || target.kind === 'enemy') ? target : null;
    vm.vs = {
      label: 'AC',
      value: ac,
      parts: tgt ? checked(acParts(tgt), ac, 'AC') : [{ label: 'AC', value: ac, kind: 'stat' }],
    };
    if (d20 !== null) {
      vm.total = d20 + atk;
      vm.margin = calculateMargin(d20, atk, ac);
      tier = attackTier(vm.margin);
      vm.crit = tier > 0 && d20 === 20;
      vm.outcome = tier === 0 ? 'miss' : vm.crit ? 'crit' : 'hit';
    }
  } else if (kind === 'save' && flow.flow === 'spell') {
    const tgt = target && (target.kind === 'entity' || target.kind === 'enemy') ? target : null;
    const mod = flow.saveMod ?? 0;
    const dc = flow.saveDC ?? 0;
    vm.modParts = tgt
      ? checked(saveParts(tgt, spellStatIndex(flow.spell.saveStat)), mod, 'save')
      : [{ label: 'save', value: mod, kind: 'stat' }];
    vm.vs = {
      label: 'DC',
      value: dc,
      parts: attacker ? checked(saveDCParts(attacker), dc, 'DC') : [{ label: 'DC', value: dc, kind: 'flat' }],
    };
    if (d20 !== null) {
      vm.total = d20 + mod;
      vm.margin = dc - vm.total - 1;
      tier = saveFailTier(dc, vm.total);
      vm.outcome = tier > 0 ? 'failed' : p.kind === 'damage' && p.halve ? 'half' : 'saved';
      if (
        p.kind === 'd20' &&
        tier === 0 &&
        flow.spell.onSave === 'HALF' &&
        flow.spell.damageDice.some((x) => x)
      )
        vm.outcome = 'half';
    }
  } else {
    // AUTO (tier 3), HEAL (tier 1), BUFF (no dice)
    tier = kind === 'auto' ? 3 : kind === 'heal' ? 1 : 0;
    vm.outcome = kind === 'auto' ? 'auto' : kind === 'heal' ? 'heal' : null;
  }
  vm.tier = p.kind === 'damage' ? p.tier : tier;
  if (
    vm.tier !== null &&
    vm.margin !== null &&
    (kind === 'attack' || kind === 'spellAttack') &&
    vm.tier > 0 &&
    vm.tier < 3
  )
    vm.toNextTier = (vm.tier === 1 ? 5 : 8) - vm.margin;

  // ---- damage dice ----
  if (p.kind === 'damage') {
    vm.halve = p.halve;
    vm.dice = dieVMs(p.dice, draft.dice);
  } else if (vm.tier !== null && vm.tier > 0) {
    vm.previewDice =
      flow.flow === 'attack'
        ? diceForTier(flow.weaponDice, vm.tier)
        : spell
          ? spellDice(spell, vm.tier, flow.casterLevel, flow.slotLevel)
          : [];
  } else if (vm.outcome === 'half' && spell && flow.flow === 'spell') {
    vm.previewDice = spellDice(spell, 1, flow.casterLevel, flow.slotLevel);
  }
  const typedValues = vm.dice.map((d) => d.value);
  if (vm.dice.length > 0 && typedValues.some((v) => v !== null)) {
    const attackRoll = kind === 'attack' || kind === 'spellAttack';
    vm.damage = damageTotal(
      typedValues.map((v) => v ?? 0),
      { crit: attackRoll && d20 === 20, bonus: flow.damageBonus, halve: vm.halve },
    );
    vm.complete = typedValues.every((v) => v !== null);
  }
  if (p.kind === 'confirm') vm.banner = p.banner;
  else if (vm.outcome) vm.banner = outcomeBanner[vm.outcome];
  vm.attacker = attacker ? fighterVM(state, attacker, null) : null;
  vm.target = target ? fighterVM(state, target, targetAfter(target, vm.damage, vm.heal)) : null;
  return vm;
}

function blank(kind: RollVM['kind'], step: Pending['kind']): RollVM {
  return {
    kind,
    step,
    title: '',
    detail: '',
    attacker: null,
    target: null,
    d20: null,
    modParts: [],
    total: null,
    vs: null,
    margin: null,
    tier: null,
    outcome: null,
    toNextTier: null,
    crit: false,
    dice: [],
    previewDice: [],
    bonusParts: [],
    damage: null,
    complete: false,
    heal: false,
    halve: false,
    area: null,
    banner: null,
  };
}

function areaVM(
  state: BattleState,
  p: Exclude<Pending, { kind: 'initiativeEntry' | 'tieOrder' | 'd10Efficacy' }>,
  flow: AreaFlow,
  caster: Combatant | undefined,
  draft: RollDraft,
): RollVM {
  const spell = flow.spell;
  const res = spell.resolution;
  const kind: RollVM['kind'] = 'area';
  const vm: RollVM = {
    ...blank(kind, p.kind),
    title: spell.name,
    detail: `${spell.area.toLowerCase()} · ${flow.targetIds.length} target${flow.targetIds.length === 1 ? '' : 's'}`,
  };
  vm.bonusParts = bonusPartsFor(flow, caster);
  vm.heal = res === 'HEAL';
  vm.attacker = caster ? fighterVM(state, caster, null) : null;
  const save = res === 'SAVE';
  const area = p.kind === 'damage' || p.kind === 'confirm' ? p.area : undefined;
  if (p.kind === 'damage') vm.dice = dieVMs(p.dice, draft.dice);
  const rolled = vm.dice.map((d) => d.value ?? 0);
  const anyDie = vm.dice.some((d) => d.value !== null);
  vm.complete = vm.dice.length > 0 && vm.dice.every((d) => d.value !== null);
  vm.area = flow.targetIds.map((id, i) => {
    const t = unitById(state, id);
    const c = t && (t.kind === 'entity' || t.kind === 'enemy') ? t : null;
    const typed = draft.areaD20s[i] ?? '';
    const d20 = p.kind === 'areaD20s' ? parseDie(typed, 20) : null;
    const vs = save ? (flow.saveDC ?? 0) : c ? armorClass(c) : 10;
    let tier: number | null = area ? (area.tiers[i] ?? 0) : null;
    let outcome: RollOutcome | null = null;
    let total: number | null = null;
    if (d20 !== null) {
      if (save) {
        total = d20 + (c ? saveParts(c, spellStatIndex(spell.saveStat)).reduce((s, x) => s + x.value, 0) : 0);
        tier = saveFailTier(vs, total);
      } else {
        total = d20 + (flow.attackMod ?? 0);
        tier = attackTier(calculateMargin(d20, flow.attackMod ?? 0, vs));
      }
    }
    if (tier !== null)
      outcome = save
        ? area?.half[i]
          ? 'half'
          : tier > 0
            ? 'failed'
            : 'saved'
        : tier > 0
          ? area?.crit[i] || (d20 === 20 && tier > 0)
            ? 'crit'
            : 'hit'
          : 'miss';
    if (res === 'HEAL') outcome = 'heal';
    if (res === 'AUTO') outcome = 'auto';
    let damage: number | null = null;
    if (area && anyDie && (area.tiers[i] ?? 0) > 0) {
      let dmg = sumRolledForTier(spell, rolled, area.maxTier, area.tiers[i] ?? 0);
      if (area.crit[i]) dmg = Math.ceil(dmg * 1.5);
      dmg = Math.max(0, dmg + flow.damageBonus);
      if (area.half[i]) dmg = Math.trunc(dmg / 2);
      damage = dmg;
    }
    return { id, name: t ? unitName(t) : id, typed, d20, total, vs, tier, outcome, damage };
  });
  if (p.kind === 'confirm') vm.banner = p.banner;
  else if (area) {
    const hits = area.tiers.filter((x) => x > 0).length;
    vm.banner = `${hits}/${area.tiers.length} ${save ? 'AFFECTED' : 'HIT'}`;
  }
  return vm;
}
