/**
 * Status effects as the Spotlight UI shows them: a family (colour), a short
 * effect line ("+2 AC"), countdown pips and the round each one ends, plus the
 * Active effects list (statuses, readied actions, delays, arrivals, timers)
 * sorted soonest-ending first.
 */
import { ATTRIBUTE_SHORT, StatusEffect, type StatusDef } from '../../assets/types.ts';
import { statusMeta } from '../rules/statuses.ts';
import { combatantById, combatants, unitName } from '../selectors/board.ts';
import type { BattleState, Combatant, EngineAssets, UnitId } from '../types.ts';

export type EffectFamily = 'buff' | 'debuff' | 'dot' | 'neutral' | 'event';

export interface EffectVM {
  name: string;
  family: EffectFamily;
  /** effect line: "+2 AC", "2 dmg / turn", "−2 MOB" */
  fx: string;
  /** turns remaining; -1 permanent */
  left: number;
  /** turns it had when applied (pips); falls back to `left` */
  full: number;
  source: string | null;
  /** the round it ends in (at the start of its owner's turn); null = permanent */
  endsRound: number | null;
}

export interface EffectRowVM extends EffectVM {
  key: string;
  kind: 'status' | 'readied' | 'held' | 'arrival' | 'timer';
  unitId: UnitId | null;
  unitName: string | null;
  side: 'party' | 'enemy' | 'other' | null;
  /** "Dan's turn" when it ends this round, otherwise "R4"; "on trigger" / "—" for open-ended rows */
  endsLabel: string;
  /** ends before the round is out */
  soon: boolean;
}

const MINUS = '−';
const signed = (n: number): string => (n >= 0 ? `+${n}` : `${MINUS}${-n}`);

export function statusFamily(s: StatusDef): EffectFamily {
  switch (s.effectType) {
    case StatusEffect.DAMAGE_OVER_TIME:
      return 'dot';
    case StatusEffect.HEAL_OVER_TIME:
      return 'buff';
    case StatusEffect.STAT_MODIFIER:
    case StatusEffect.MOVEMENT_MODIFIER:
    case StatusEffect.AC_MODIFIER:
    case StatusEffect.ATTACK_MODIFIER:
      return s.magnitude >= 0 ? 'buff' : 'debuff';
    default:
      return 'neutral';
  }
}

export function statusFx(s: StatusDef): string {
  switch (s.effectType) {
    case StatusEffect.DAMAGE_OVER_TIME:
      return `${s.magnitude} dmg / turn`;
    case StatusEffect.HEAL_OVER_TIME:
      return `+${s.magnitude} HP / turn`;
    case StatusEffect.STAT_MODIFIER:
      return `${signed(s.magnitude)} ${ATTRIBUTE_SHORT[s.targetAttribute] ?? 'stat'}`;
    case StatusEffect.MOVEMENT_MODIFIER:
      return s.targetAttribute >= 0
        ? `${signed(s.magnitude)} ${ATTRIBUTE_SHORT[s.targetAttribute] ?? 'stat'}`
        : `${signed(s.magnitude)} MOB`;
    case StatusEffect.AC_MODIFIER:
      return `${signed(s.magnitude)} AC`;
    case StatusEffect.ATTACK_MODIFIER:
      return `${signed(s.magnitude)} to hit`;
    default:
      return '';
  }
}

/** Has `id` already had its turn start this round? (Statuses tick at turn start.) */
const startedThisRound = (state: BattleState, id: UnitId): boolean =>
  state.turn.tickedRound?.[id] === state.turn.round;

/**
 * The round a status with `left` turns runs out in: it ticks at each of its
 * owner's turn starts and goes at 0. Null for permanent ones.
 */
export function statusEndsRound(state: BattleState, ownerId: UnitId, left: number): number | null {
  if (left < 0 || (left === 0 && state.rules.compat.durationZeroNeverExpires)) return null;
  if (!state.turn.started) return state.turn.round + Math.max(0, left - 1);
  const already = startedThisRound(state, ownerId);
  return state.turn.round + Math.max(0, left - (already ? 0 : 1));
}

export function statusVM(state: BattleState, ownerId: UnitId, s: StatusDef): EffectVM {
  const meta = statusMeta(s);
  return {
    name: s.name,
    family: statusFamily(s),
    fx: statusFx(s),
    left: s.duration,
    full: Math.max(meta.fullDuration ?? s.duration, s.duration),
    source: meta.source ?? null,
    endsRound: statusEndsRound(state, ownerId, s.duration),
  };
}

export const statusesOf = (u: Combatant): StatusDef[] => (u.kind === 'entity' ? u.sheet.status : u.statuses);

export function unitEffects(state: BattleState, u: Combatant): EffectVM[] {
  return statusesOf(u).map((s) => statusVM(state, u.id, s));
}

const sideOfUnit = (u: Combatant | undefined): EffectRowVM['side'] =>
  !u ? null : u.kind === 'enemy' ? 'enemy' : u.sheet.isParty ? 'party' : 'other';

function endsLabel(state: BattleState, ownerId: UnitId | null, endsRound: number | null): string {
  if (endsRound === null) return '—';
  if (endsRound <= state.turn.round && ownerId) {
    const u = combatantById(state, ownerId);
    return u ? `${unitName(u).replace(/ #\d+$/, '')}'s turn` : `R${endsRound}`;
  }
  return `R${endsRound}`;
}

/** Everything ticking on the battlefield, soonest-ending first (open-ended rows last). */
export function buildEffectRows(state: BattleState, assets: EngineAssets): EffectRowVM[] {
  const rows: EffectRowVM[] = [];
  const round = state.turn.round;
  for (const u of combatants(state)) {
    for (const s of statusesOf(u)) {
      const vm = statusVM(state, u.id, s);
      rows.push({
        ...vm,
        key: `status:${u.id}:${s.name}`,
        kind: 'status',
        unitId: u.id,
        unitName: unitName(u),
        side: sideOfUnit(u),
        endsLabel: endsLabel(state, u.id, vm.endsRound),
        soon: vm.endsRound !== null && vm.endsRound <= round && state.turn.started,
      });
    }
  }
  for (const [id, note] of Object.entries(state.turn.readied ?? {})) {
    const u = combatantById(state, id);
    rows.push({
      key: `readied:${id}`,
      kind: 'readied',
      unitId: id,
      unitName: u ? unitName(u) : id,
      side: sideOfUnit(u),
      name: 'Readied',
      family: 'neutral',
      fx: note,
      left: -1,
      full: -1,
      source: null,
      endsRound: null,
      endsLabel: 'on trigger',
      soon: false,
    });
  }
  for (const id of state.turn.held ?? []) {
    const u = combatantById(state, id);
    rows.push({
      key: `held:${id}`,
      kind: 'held',
      unitId: id,
      unitName: u ? unitName(u) : id,
      side: sideOfUnit(u),
      name: 'Delaying',
      family: 'neutral',
      fx: 'waiting to act',
      left: -1,
      full: -1,
      source: null,
      endsRound: null,
      endsLabel: 'any time',
      soon: false,
    });
  }
  for (const a of state.turn.arrivals ?? []) {
    const left = Math.max(0, a.round - round);
    rows.push({
      key: `arrival:${a.id}`,
      kind: 'arrival',
      unitId: null,
      unitName: null,
      side: 'enemy',
      name: `${assets.enemies[a.templateStem]?.name ?? a.templateStem} ×${a.count}`,
      family: 'event',
      fx: a.note ? `arrive · ${a.note}` : 'arrive',
      left,
      full: Math.max(left, 1),
      source: null,
      endsRound: a.round,
      endsLabel: `R${a.round}`,
      soon: a.round <= round,
    });
  }
  for (const t of state.turn.timers ?? []) {
    const left = Math.max(0, t.round - round);
    rows.push({
      key: `timer:${t.id}`,
      kind: 'timer',
      unitId: null,
      unitName: null,
      side: null,
      name: t.name,
      family: 'neutral',
      fx: t.note ?? '',
      left,
      full: Math.max(left, 1),
      source: null,
      endsRound: t.round,
      endsLabel: `R${t.round}`,
      soon: t.round <= round,
    });
  }
  const order = (r: EffectRowVM) => (r.endsRound === null ? Number.MAX_SAFE_INTEGER : r.endsRound);
  const kindRank = { status: 0, arrival: 1, timer: 2, readied: 3, held: 4 } as const;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => order(a.r) - order(b.r) || kindRank[a.r.kind] - kindRank[b.r.kind] || a.i - b.i)
    .map((x) => x.r);
}
