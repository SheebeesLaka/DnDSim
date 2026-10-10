/** EntityRes/SpellSlots.java + CharSheet slot helpers (R7.3). */
import type { CharSheetDef } from '../../assets/types.ts';
import { isCaster } from '../selectors/stats.ts';

export const MAX_SPELL_LEVEL = 9;

const FULL_CASTER: readonly (readonly number[])[] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export function maxSlotsForLevel(characterLevel: number, spellLevel: number): number {
  if (spellLevel < 1 || spellLevel > MAX_SPELL_LEVEL) return 0;
  const row = Math.max(1, Math.min(20, characterLevel)) - 1;
  return FULL_CASTER[row]?.[spellLevel - 1] ?? 0;
}

export const maxSpellSlots = (sheet: CharSheetDef, spellLevel: number): number =>
  isCaster(sheet) ? maxSlotsForLevel(Math.max(1, sheet.level), spellLevel) : 0;
export const spellSlotsUsed = (sheet: CharSheetDef, spellLevel: number): number =>
  spellLevel < 1 || spellLevel > MAX_SPELL_LEVEL ? 0 : (sheet.spellSlotsUsed[spellLevel - 1] ?? 0);
export const spellSlotsRemaining = (sheet: CharSheetDef, spellLevel: number): number =>
  Math.max(0, maxSpellSlots(sheet, spellLevel) - spellSlotsUsed(sheet, spellLevel));

/** CharSheet.lowestAvailableSlot: lowest level ≥ minLevel with a slot, 0 for cantrips, -1 if none. */
export function lowestAvailableSlot(sheet: CharSheetDef, minLevel: number): number {
  if (minLevel <= 0) return 0;
  for (let lvl = minLevel; lvl <= MAX_SPELL_LEVEL; lvl++) if (spellSlotsRemaining(sheet, lvl) > 0) return lvl;
  return -1;
}

/** CharSheet.spendSpellSlot: cantrips are free; false when no slot remains. */
export function spendSpellSlot(sheet: CharSheetDef, spellLevel: number): boolean {
  if (spellLevel === 0) return true;
  if (spellSlotsRemaining(sheet, spellLevel) <= 0) return false;
  sheet.spellSlotsUsed[spellLevel - 1] = (sheet.spellSlotsUsed[spellLevel - 1] ?? 0) + 1;
  return true;
}
