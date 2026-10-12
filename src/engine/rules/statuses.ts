/**
 * Status effects and item abilities (FEATURES.md §5.4, §7.3).
 * Mirrors CharSheet.procStatus / processEquippedAbilities / applyAbility,
 * Enemy.procStatus and CombatManager.applyStatus.
 */
import { AbilityEffect, StatusEffect, type CharSheetDef, type StatusDef } from '../../assets/types.ts';
import type { CompatFlags } from '../compat.ts';
import type { Combatant, EnemyUnit, EntityUnit } from '../types.ts';
import { tempAttributes, totalAttributes } from '../selectors/stats.ts';

/** Status.tick: duration > 0 counts down and expires at 0; 0 never expires (F-8) unless the flag is off. */
export function tickStatus(s: StatusDef, compat: CompatFlags): boolean {
  if (s.duration > 0) {
    s.duration--;
    return s.duration === 0;
  }
  if (s.duration === 0 && !compat.durationZeroNeverExpires) return true;
  return false;
}

/** Keep the sheet's cached tempAttributes/totalAttributes in step with Java's updateAttributes(). */
export function syncSheetAttributes(sheet: CharSheetDef): void {
  sheet.tempAttributes = tempAttributes(sheet);
  sheet.totalAttributes = totalAttributes(sheet);
}

/** CharSheet.applyAbility: returns a description or null when nothing happened. */
function applyAbility(
  sheet: CharSheetDef,
  ability: { effectType: string; magnitude: number; statusName: string | null },
): string | null {
  switch (ability.effectType) {
    case AbilityEffect.HEAL: {
      if (sheet.currentHP < sheet.totalHP) {
        const heal = Math.min(ability.magnitude, sheet.totalHP - sheet.currentHP);
        sheet.currentHP += heal;
        return `Healed ${heal} HP`;
      }
      return null;
    }
    case AbilityEffect.DAMAGE: {
      sheet.currentHP = Math.max(1, sheet.currentHP - ability.magnitude);
      return `Took ${ability.magnitude} damage`;
    }
    case AbilityEffect.STATUS: {
      if (ability.statusName !== null) {
        // CharSheet.addStatus: no duplicate names; Status(statusName, NONE, 0, 1, -1)
        if (!sheet.status.some((s) => s.name === ability.statusName)) {
          sheet.status.push({
            name: ability.statusName,
            effectType: StatusEffect.NONE,
            magnitude: 0,
            duration: 1,
            targetAttribute: -1,
            extra: {},
          });
        }
        return `Applied ${ability.statusName}`;
      }
      return null;
    }
    default:
      return null; // STAT_BOOST is a no-op
  }
}

/**
 * CharSheet.processEquippedAbilities(trigger): innate abilities, then both weapon
 * slots, then every accessory. The ability *type* is never filtered (F-28).
 */
export function processEquippedAbilities(sheet: CharSheetDef, trigger: string): string[] {
  const out: string[] = [];
  for (const a of sheet.abilities) {
    if (a.triggerType === trigger) {
      const r = applyAbility(sheet, a);
      if (r !== null) out.push(`${a.name}: ${r}`);
    }
  }
  for (const w of sheet.weapons) {
    if (!w) continue;
    for (const a of w.abilities) {
      if (a.triggerType === trigger) {
        const r = applyAbility(sheet, a);
        if (r !== null) out.push(`${w.name}: ${r}`);
      }
    }
  }
  for (const acc of sheet.accessories) {
    if (!acc) continue;
    for (const a of acc.abilities) {
      if (a.triggerType === trigger) {
        const r = applyAbility(sheet, a);
        if (r !== null) out.push(`${acc.name}: ${r}`);
      }
    }
  }
  return out;
}

/**
 * CharSheet.procStatus: DOT (floor 1), HOT (cap max), tick & expire, then
 * updateAttributes and ON_TURN_START abilities. Returns early on an empty list
 * (which is what makes F-1 a double fire only when a status is present).
 */
export function procEntityStatus(sheet: CharSheetDef, compat: CompatFlags, expired?: string[]): string[] {
  if (sheet.status.length === 0) return [];
  const kept: StatusDef[] = [];
  for (const s of sheet.status) {
    if (s.effectType === StatusEffect.DAMAGE_OVER_TIME)
      sheet.currentHP = Math.max(1, sheet.currentHP - s.magnitude);
    else if (s.effectType === StatusEffect.HEAL_OVER_TIME)
      sheet.currentHP = Math.min(sheet.totalHP, sheet.currentHP + s.magnitude);
    if (!tickStatus(s, compat)) kept.push(s);
    else expired?.push(s.name);
  }
  sheet.status = kept;
  syncSheetAttributes(sheet);
  return processEquippedAbilities(sheet, 'ON_TURN_START');
}

/** Enemy.procStatus: DOT/HOT then tick; no abilities. */
export function procEnemyStatus(en: EnemyUnit, compat: CompatFlags, expired?: string[]): void {
  const kept: StatusDef[] = [];
  for (const s of en.statuses) {
    if (s.effectType === StatusEffect.DAMAGE_OVER_TIME) en.health = Math.max(1, en.health - s.magnitude);
    else if (s.effectType === StatusEffect.HEAL_OVER_TIME)
      en.health = Math.min(en.maxHealth, en.health + s.magnitude);
    if (!tickStatus(s, compat)) kept.push(s);
    else expired?.push(s.name);
  }
  en.statuses = kept;
}

/**
 * TurnManager.nextTurn's turn-start processing for the new current combatant.
 * Entity: procStatus() (which itself fires abilities when any status exists)
 * then processEquippedAbilities again — the F-1 double fire — unless the flag
 * is off. Enemy: procStatus only. Returns ability messages for the log.
 */
export function turnStartProcessing(u: Combatant, compat: CompatFlags, expired?: string[]): string[] {
  if (u.kind === 'enemy') {
    procEnemyStatus(u, compat, expired);
    return [];
  }
  const first = procEntityStatus(u.sheet, compat, expired);
  if (compat.turnStartAbilitiesDoubleFire || first.length === 0) {
    const second = processEquippedAbilities(u.sheet, 'ON_TURN_START');
    return [...first, ...second];
  }
  return first;
}

/**
 * CombatManager.applyStatus: a status of the same name refreshes its duration
 * (max of old/new, or permanent if the new one is) instead of stacking.
 * Returns false only for non-combatants.
 */
export function applyStatus(target: Combatant, status: StatusDef): boolean {
  const list = target.kind === 'entity' ? target.sheet.status : target.statuses;
  for (const s of list) {
    if (s.name === status.name) {
      if (s.duration !== -1) s.duration = status.duration === -1 ? -1 : Math.max(s.duration, status.duration);
      // a refresh restarts the countdown pips from the new length and credits the new source
      const meta = statusMeta(status);
      if (meta.fullDuration !== undefined)
        s.extra = { ...s.extra, fullDuration: Math.max(s.duration, meta.fullDuration) };
      if (meta.source !== undefined) s.extra = { ...s.extra, source: meta.source };
      return true;
    }
  }
  list.push({ ...status, extra: { ...status.extra } });
  if (target.kind === 'entity') syncSheetAttributes(target.sheet);
  return true;
}

/**
 * Battle bookkeeping kept in a status's `extra` bag (round-trips through the
 * sheet files untouched): who/what applied it, its length when applied (the
 * countdown pips), and the round it landed.
 */
export interface StatusMeta {
  source?: string;
  fullDuration?: number;
  appliedRound?: number;
}

export function statusMeta(s: StatusDef): StatusMeta {
  const e = s.extra ?? {};
  return {
    source: typeof e.source === 'string' ? e.source : undefined,
    fullDuration: typeof e.fullDuration === 'number' ? e.fullDuration : undefined,
    appliedRound: typeof e.appliedRound === 'number' ? e.appliedRound : undefined,
  };
}

/** A copy of `s` stamped with where it came from; fullDuration defaults to its current duration. */
export function stampStatus(s: StatusDef, meta: StatusMeta): StatusDef {
  const extra: Record<string, unknown> = { ...s.extra };
  if (meta.source !== undefined) extra.source = meta.source;
  if (meta.appliedRound !== undefined) extra.appliedRound = meta.appliedRound;
  extra.fullDuration = meta.fullDuration ?? (s.duration > 0 ? s.duration : undefined);
  if (extra.fullDuration === undefined) delete extra.fullDuration;
  return { ...s, extra };
}

/** Spell.createRiderStatus: a fresh copy so each target gets its own duration. */
export const cloneStatus = (s: StatusDef): StatusDef => ({ ...s, extra: { ...s.extra } });

export const entityHasStatus = (e: EntityUnit, name: string): boolean =>
  e.sheet.status.some((s) => s.name === name);
