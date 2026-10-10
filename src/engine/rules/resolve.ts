/** Outcome application for attack, spell and area flows (BattleGridCanvas.handle*Outcome). */
import type { Draft } from 'immer';
import { log, type Emit } from '../commands/_shared.ts';
import { combatantById, unitById, unitName } from '../selectors/board.ts';
import { equippedWeapon } from '../selectors/stats.ts';
import type { AreaFlow, AttackFlow, BattleState, EngineContext, SpellFlow, Unit } from '../types.ts';
import { applyDamage, applyHealing, isTargetDead, removeDefeated } from './apply.ts';
import { ammoCompatible, isRanged } from './combat.ts';
import { spendSpellSlot } from './spellSlots.ts';
import { applyStatus, cloneStatus } from './statuses.ts';

/** CombatManager.consumeAmmo: first compatible stack loses one round; hit or miss. */
export function consumeAmmo(draft: Draft<BattleState>, attackerId: string, emit: Emit): string | null {
  const a = combatantById(draft, attackerId);
  if (!a || a.kind !== 'entity') return null;
  const w = equippedWeapon(a);
  if (!w || !isRanged(w.ammoType)) return null;
  for (const item of a.sheet.inventory) {
    if (
      item.kind === 'ammunition' &&
      item.quantity > 0 &&
      ammoCompatible(
        item.ammoType,
        item.legacyCompatibleWeaponType,
        w.ammoType,
        draft.rules.compat.ammoCompatIgnoresLegacyField,
      )
    ) {
      item.quantity -= 1;
      if (item.quantity <= 0) a.sheet.inventory = a.sheet.inventory.filter((i) => i !== item);
      emit({ type: 'sheetChanged', sourceName: a.sourceName });
      return item.name;
    }
  }
  return null;
}

export interface SingleOutcome {
  hit: boolean;
  tier: number;
  total: number;
  d20: number;
  saved: boolean;
  applyRider: boolean;
}

/** BattleGridCanvas.handleAttackOutcome */
export function resolveAttackOutcome(
  draft: Draft<BattleState>,
  flow: AttackFlow,
  outcome: SingleOutcome,
  ctx: EngineContext,
  emit: Emit,
): void {
  consumeAmmo(draft, flow.attackerId, emit);
  const target = unitById(draft, flow.targetId);
  const attacker = unitById(draft, flow.attackerId);
  if (!target) return;
  if (outcome.hit) {
    applyDamage(target, outcome.total, draft.rules.compat);
    emit({
      type: 'floatText',
      unitId: target.id,
      text: `-${outcome.total}`,
      color: outcome.d20 === 20 ? '#FFD700' : '#ff7b6b',
      kind: 'DAMAGE',
    });
    if (target.kind === 'entity') emit({ type: 'sheetChanged', sourceName: target.sourceName });
    log(
      draft,
      `${attacker ? unitName(attacker) : '?'} hits ${unitName(target)} for ${outcome.total}${outcome.d20 === 20 ? ' (critical)' : ''} (tier ${outcome.tier})`,
    );
    if (isTargetDead(target)) removeDefeated(draft, target, ctx, emit);
  } else {
    emit({ type: 'floatText', unitId: target.id, text: 'Miss', color: '#b8b8c0', kind: 'OTHER' });
    log(draft, `${attacker ? unitName(attacker) : '?'} misses ${unitName(target)}`);
  }
}

function applyRiderTo(draft: Draft<BattleState>, target: Unit, flow: SpellFlow | AreaFlow, emit: Emit): void {
  const rider = flow.spell.riderStatus;
  if (!rider || (target.kind !== 'entity' && target.kind !== 'enemy')) return;
  if (applyStatus(target, cloneStatus(rider))) {
    emit({ type: 'floatText', unitId: target.id, text: rider.name, color: flow.spell.color, kind: 'STATUS' });
    if (target.kind === 'entity') emit({ type: 'sheetChanged', sourceName: target.sourceName });
    log(draft, `${unitName(target)} is ${rider.name}`);
  }
}

function spendSlot(draft: Draft<BattleState>, casterId: string, slotLevel: number, emit: Emit): void {
  const caster = combatantById(draft, casterId);
  if (caster?.kind === 'entity') {
    spendSpellSlot(caster.sheet, slotLevel);
    emit({ type: 'sheetChanged', sourceName: caster.sourceName });
  }
}

/** BattleGridCanvas.handleSpellOutcome: the slot is spent on resolution, hit or miss. */
export function resolveSpellOutcome(
  draft: Draft<BattleState>,
  flow: SpellFlow,
  outcome: SingleOutcome,
  ctx: EngineContext,
  emit: Emit,
): void {
  spendSlot(draft, flow.casterId, flow.slotLevel, emit);
  const target = unitById(draft, flow.targetId);
  if (!target) return;
  const spell = flow.spell;
  const caster = unitById(draft, flow.casterId);
  const who = caster ? unitName(caster) : '?';
  if (spell.resolution === 'HEAL') {
    const healed =
      target.kind === 'entity' || target.kind === 'enemy' ? applyHealing(target, outcome.total) : 0;
    emit({ type: 'floatText', unitId: target.id, text: `+${healed}`, color: '#7ee08a', kind: 'HEAL' });
    if (target.kind === 'entity') emit({ type: 'sheetChanged', sourceName: target.sourceName });
    log(draft, `${who} casts ${spell.name}: ${unitName(target)} heals ${healed}`);
  } else if (spell.resolution === 'BUFF') {
    log(draft, `${who} casts ${spell.name} on ${unitName(target)}`);
  } else if (outcome.hit && outcome.total > 0) {
    applyDamage(target, outcome.total, draft.rules.compat);
    const crit = spell.resolution === 'ATTACK' && outcome.d20 === 20;
    emit({
      type: 'floatText',
      unitId: target.id,
      text: `-${outcome.total}`,
      color: crit ? '#FFD700' : spell.color,
      kind: 'DAMAGE',
    });
    if (target.kind === 'entity') emit({ type: 'sheetChanged', sourceName: target.sourceName });
    log(
      draft,
      `${who} casts ${spell.name}: ${unitName(target)} takes ${outcome.total}${crit ? ' (critical)' : ''}`,
    );
  } else if (!outcome.hit) {
    emit({
      type: 'floatText',
      unitId: target.id,
      text: outcome.saved ? 'Saved' : 'Miss',
      color: '#b8b8c0',
      kind: 'OTHER',
    });
    log(draft, `${who} casts ${spell.name}: ${unitName(target)} ${outcome.saved ? 'saves' : 'is missed'}`);
  } else {
    log(draft, `${who} casts ${spell.name} on ${unitName(target)}`);
  }
  const defeated = spell.resolution !== 'HEAL' && isTargetDead(target);
  if (outcome.applyRider && !defeated) applyRiderTo(draft, target, flow, emit);
  if (defeated) removeDefeated(draft, target, ctx, emit);
}

export interface AreaHit {
  tier: number;
  damage: number;
  saved: boolean;
  crit: boolean;
  applyRider: boolean;
}

/** BattleGridCanvas.handleAreaOutcome */
export function resolveAreaOutcome(
  draft: Draft<BattleState>,
  flow: AreaFlow,
  hits: AreaHit[],
  ctx: EngineContext,
  emit: Emit,
): void {
  spendSlot(draft, flow.casterId, flow.slotLevel, emit);
  const spell = flow.spell;
  const heal = spell.resolution === 'HEAL';
  const buff = spell.resolution === 'BUFF';
  const caster = unitById(draft, flow.casterId);
  log(draft, `${caster ? unitName(caster) : '?'} casts ${spell.name} (${hits.length} targets)`);
  const defeated: Unit[] = [];
  flow.targetIds.forEach((id, i) => {
    const target = unitById(draft, id);
    const hit = hits[i];
    if (!target || !hit || (target.kind !== 'entity' && target.kind !== 'enemy')) return;
    if (heal) {
      const healed = applyHealing(target, hit.damage);
      emit({ type: 'floatText', unitId: target.id, text: `+${healed}`, color: '#7ee08a', kind: 'HEAL' });
    } else if (!buff) {
      if (hit.damage > 0) {
        applyDamage(target, hit.damage, draft.rules.compat);
        emit({
          type: 'floatText',
          unitId: target.id,
          text: `-${hit.damage}`,
          color: hit.crit ? '#FFD700' : spell.color,
          kind: 'DAMAGE',
        });
      } else if (hit.tier === 0) {
        emit({
          type: 'floatText',
          unitId: target.id,
          text: hit.saved ? 'Saved' : 'Miss',
          color: '#b8b8c0',
          kind: 'OTHER',
        });
      }
    }
    if (target.kind === 'entity') emit({ type: 'sheetChanged', sourceName: target.sourceName });
    const dead = !heal && isTargetDead(target);
    if (hit.applyRider && !dead) applyRiderTo(draft, target, flow, emit);
    if (dead) defeated.push(target);
  });
  for (const d of defeated) removeDefeated(draft, d, ctx, emit);
}
