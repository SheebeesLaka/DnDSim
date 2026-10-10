/** The dice panel as state: SUBMIT_ROLL / AUTO_FILL_AREA_ROLLS / CONFIRM_PENDING / CANCEL_PENDING. */
import { dieMax } from '../dice.ts';
import { err } from '../errors.ts';
import { d20 } from '../rng.ts';
import {
  attackTier,
  calculateMargin,
  damageTotal,
  diceForTier,
  riderApplies,
  saveFailTier,
  spellDice,
  sumRolledForTier,
} from '../rules/combat.ts';
import {
  resolveAreaOutcome,
  resolveAttackOutcome,
  resolveSpellOutcome,
  type AreaHit,
} from '../rules/resolve.ts';
import { applyStatus } from '../rules/statuses.ts';
import { combatantById, unitById } from '../selectors/board.ts';
import { armorClass, saveModifier, spellStatIndex } from '../selectors/stats.ts';
import type { AreaFlow, Pending } from '../types.ts';
import { log, type HandlerMap } from './_shared.ts';

type AreaPending = Extract<Pending, { kind: 'damage' }>['area'];

/** DiceRollPanel.hasDamageDice (F-18): legacy checks the tier-1 dice list; fixed accepts any tier die. */
function hasDamageDice(
  flow: { spell: AreaFlow['spell']; casterLevel: number; slotLevel: number },
  legacy: boolean,
): boolean {
  if (legacy) return spellDice(flow.spell, 1, flow.casterLevel, flow.slotLevel).length > 0;
  return flow.spell.damageDice.some((d) => d !== null && d !== '');
}

export const pendingHandlers: HandlerMap = {
  CANCEL_PENDING(draft) {
    if (!draft.pending) return err('notPending', 'nothing to cancel');
    if (draft.pending.kind === 'initiativeEntry' || draft.pending.kind === 'tieOrder')
      return err('notCancellable', 'use the dedicated cancel/dismiss command');
    draft.pending = null; // nothing consumed, nothing spent (R6.9, R7.9)
    return undefined;
  },

  CONFIRM_PENDING(draft, _cmd, ctx, emit) {
    const p = draft.pending;
    if (p?.kind !== 'confirm') return err('notPending', 'nothing to confirm');
    draft.pending = null;
    if (p.flow.flow === 'attack')
      resolveAttackOutcome(
        draft,
        p.flow,
        { hit: false, tier: 0, total: 0, d20: p.d20 ?? 0, saved: false, applyRider: false },
        ctx,
        emit,
      );
    else if (p.flow.flow === 'spell')
      resolveSpellOutcome(
        draft,
        p.flow,
        { hit: false, tier: 0, total: 0, d20: p.d20 ?? 0, saved: p.saved, applyRider: false },
        ctx,
        emit,
      );
    else if (p.area) resolveAreaOutcome(draft, p.flow, completeArea(p.flow, [], p.area), ctx, emit);
    return undefined;
  },

  AUTO_FILL_AREA_ROLLS(draft, cmd, ctx) {
    const p = draft.pending;
    if (p?.kind !== 'areaD20s') return err('notPending', 'no area rolls pending');
    const rolls = p.flow.targetIds.map((_, i) => {
      const v = cmd.d20s?.[i];
      return v !== undefined && v >= 1 && v <= 20 ? Math.trunc(v) : d20(ctx.rng);
    });
    return processAreaRolls(draft, p, rolls);
  },

  SUBMIT_ROLL(draft, cmd, ctx, emit) {
    const p = draft.pending;
    if (!p) return err('notPending', 'no roll is pending');
    switch (p.kind) {
      case 'd20': {
        const roll = cmd.d20;
        if (roll === undefined || !Number.isInteger(roll))
          return err('invalidRoll', 'Please enter the d20 roll');
        if (roll < 1 || roll > 20) return err('invalidRoll', 'd20 must be 1-20');
        const flow = p.flow;
        if (flow.flow === 'spell' && flow.spell.resolution === 'SAVE') {
          // DiceRollPanel.processSaveRoll
          const total = roll + (flow.saveMod ?? 0);
          const tier = saveFailTier(flow.saveDC ?? 0, total);
          if (tier === 0) {
            const half =
              flow.spell.onSave === 'HALF' && hasDamageDice(flow, draft.rules.compat.halfRequiresTier1Die);
            if (half)
              draft.pending = {
                kind: 'damage',
                flow,
                dice: spellDice(flow.spell, 1, flow.casterLevel, flow.slotLevel),
                prompt: 'Enter damage rolls (halved):',
                d20: roll,
                tier: 1,
                saved: true,
                halve: true,
              };
            else draft.pending = { kind: 'confirm', flow, banner: 'SAVED', d20: roll, saved: true };
            return undefined;
          }
          draft.pending = {
            kind: 'damage',
            flow,
            dice: spellDice(flow.spell, tier, flow.casterLevel, flow.slotLevel),
            prompt: 'Enter damage rolls:',
            d20: roll,
            tier,
            saved: false,
            halve: false,
          };
          return undefined;
        }
        // DiceRollPanel.processD20Roll (weapon or spell attack)
        const margin = calculateMargin(roll, flow.attackMod ?? 0, flow.targetAC ?? 10);
        const tier = attackTier(margin);
        if (margin < 0) {
          draft.pending = { kind: 'confirm', flow, banner: 'MISS', d20: roll, saved: false };
          return undefined;
        }
        const dice =
          flow.flow === 'spell'
            ? spellDice(flow.spell, tier, flow.casterLevel, flow.slotLevel)
            : diceForTier(flow.weaponDice, tier);
        draft.pending = {
          kind: 'damage',
          flow,
          dice,
          prompt: 'Enter damage rolls:',
          d20: roll,
          tier,
          saved: false,
          halve: false,
        };
        return undefined;
      }
      case 'areaD20s': {
        const rolls = cmd.areaD20s;
        if (
          !rolls ||
          rolls.length !== p.flow.targetIds.length ||
          rolls.some((v) => !Number.isInteger(v) || v < 1 || v > 20)
        )
          return err('invalidRoll', 'Enter a d20 (1-20) for every target');
        return processAreaRolls(
          draft,
          p,
          rolls.map((v) => Math.trunc(v)),
        );
      }
      case 'damage': {
        const rolled = cmd.dice ?? [];
        if (rolled.length !== p.dice.length) return err('invalidRoll', 'Please enter all dice rolls');
        for (let i = 0; i < rolled.length; i++) {
          const v = rolled[i] as number;
          const max = dieMax(p.dice[i]);
          if (!Number.isInteger(v) || v < 1 || v > max)
            return err('invalidRoll', `${p.dice[i]} must be 1-${max}`);
        }
        draft.pending = null;
        if (p.flow.flow === 'area') {
          if (p.area) resolveAreaOutcome(draft, p.flow, completeArea(p.flow, rolled, p.area), ctx, emit);
          return undefined;
        }
        const attackRoll = p.flow.flow === 'attack' || p.flow.spell.resolution === 'ATTACK';
        const total = damageTotal(rolled, {
          crit: attackRoll && p.d20 === 20,
          bonus: p.flow.damageBonus,
          halve: p.halve,
        });
        if (p.flow.flow === 'attack') {
          resolveAttackOutcome(
            draft,
            p.flow,
            { hit: p.tier > 0, tier: p.tier, total, d20: p.d20 ?? 0, saved: false, applyRider: false },
            ctx,
            emit,
          );
        } else {
          const applyRider = riderApplies(p.flow.spell, p.tier, p.saved);
          resolveSpellOutcome(
            draft,
            p.flow,
            { hit: p.tier > 0, tier: p.tier, total, d20: p.d20 ?? 0, saved: p.saved, applyRider },
            ctx,
            emit,
          );
        }
        return undefined;
      }
      case 'd10Efficacy': {
        const roll = cmd.d10;
        if (roll === undefined || !Number.isInteger(roll) || roll < 1 || roll > 10)
          return err('invalidRoll', 'Enter d10 roll (1-10)');
        const u = combatantById(draft, p.unitId);
        if (!u || u.kind !== 'entity') return err('unknownUnit', 'the user is gone');
        const item = u.sheet.inventory.find((i) => i.kind === 'consumable' && i.name === p.itemName);
        if (!item || item.kind !== 'consumable') return err('unknownItem', 'the item is gone');
        draft.pending = null;
        // BattleGridCanvas.applyConsumableWithEfficacy (R6.14)
        const pct = roll * 10;
        if (item.healAmount > 0) {
          const heal = Math.ceil((item.healAmount * pct) / 100);
          u.sheet.currentHP = Math.min(u.sheet.currentHP + heal, u.sheet.totalHP);
          emit({ type: 'floatText', unitId: u.id, text: `+${heal}`, color: '#4CAF50', kind: 'HEAL' });
          log(draft, `${u.sheet.name} uses ${item.name}: +${heal} HP (${pct}% efficacy)`);
        }
        if (item.effect && !u.sheet.status.some((s) => s.name === item.effect?.name))
          applyStatus(u, item.effect);
        if (item.quantity > 1) item.quantity -= 1;
        else u.sheet.inventory = u.sheet.inventory.filter((i) => i !== item);
        emit({ type: 'sheetChanged', sourceName: u.sourceName });
        return undefined;
      }
      case 'confirm':
        return err('wrongInput', 'press OK (CONFIRM_PENDING) or Cancel');
      case 'initiativeEntry':
      case 'tieOrder':
        return err('wrongInput', 'use SUBMIT_INITIATIVE / RESOLVE_TIE');
    }
  },
};

/** DiceRollPanel.processAreaRolls */
function processAreaRolls(
  draft: Parameters<NonNullable<HandlerMap['SUBMIT_ROLL']>>[0],
  p: Extract<Pending, { kind: 'areaD20s' }>,
  rolls: number[],
) {
  const flow = p.flow;
  const save = flow.spell.resolution === 'SAVE';
  const halfOnSave =
    save && flow.spell.onSave === 'HALF' && hasDamageDice(flow, draft.rules.compat.halfRequiresTier1Die);
  const n = flow.targetIds.length;
  const area: NonNullable<AreaPending> = {
    tiers: new Array<number>(n).fill(0),
    saved: new Array<boolean>(n).fill(false),
    half: new Array<boolean>(n).fill(false),
    crit: new Array<boolean>(n).fill(false),
    maxTier: 0,
  };
  flow.targetIds.forEach((id, i) => {
    const t = unitById(draft, id);
    const roll = rolls[i] as number;
    if (save) {
      const mod =
        t && (t.kind === 'entity' || t.kind === 'enemy')
          ? saveModifier(t, spellStatIndex(flow.spell.saveStat))
          : 0;
      const fail = saveFailTier(flow.saveDC ?? 0, roll + mod);
      if (fail === 0) {
        area.saved[i] = true;
        area.half[i] = halfOnSave;
        area.tiers[i] = halfOnSave ? 1 : 0;
      } else area.tiers[i] = fail;
    } else {
      const ac = t && (t.kind === 'entity' || t.kind === 'enemy') ? armorClass(t) : 10;
      const tier = attackTier(calculateMargin(roll, flow.attackMod ?? 0, ac));
      area.tiers[i] = tier;
      area.crit[i] = tier > 0 && roll === 20;
    }
    area.maxTier = Math.max(area.maxTier, area.tiers[i]);
  });
  if (area.maxTier === 0) {
    draft.pending = { kind: 'confirm', flow, banner: save ? 'ALL SAVED' : 'ALL MISSED', saved: save, area };
    return undefined;
  }
  draft.pending = {
    kind: 'damage',
    flow,
    dice: spellDice(flow.spell, area.maxTier, flow.casterLevel, flow.slotLevel),
    prompt: 'Enter damage rolls (shared):',
    tier: area.maxTier,
    saved: false,
    halve: false,
    area,
  };
  return undefined;
}

/** DiceRollPanel.completeArea: split the shared roll per target by tier. */
function completeArea(flow: AreaFlow, rolled: number[], area: NonNullable<AreaPending>): AreaHit[] {
  return flow.targetIds.map((_, i) => {
    const t = area.tiers[i] as number;
    let dmg = 0;
    if (t > 0 && rolled.length > 0) {
      dmg = sumRolledForTier(flow.spell, rolled, area.maxTier, t);
      if (area.crit[i]) dmg = Math.ceil(dmg * 1.5);
      dmg = Math.max(0, dmg + flow.damageBonus);
      if (area.half[i]) dmg = Math.trunc(dmg / 2);
    }
    const saved = area.saved[i] as boolean;
    return {
      tier: t,
      damage: dmg,
      saved,
      crit: area.crit[i] as boolean,
      applyRider: riderApplies(flow.spell, t, saved),
    };
  });
}
