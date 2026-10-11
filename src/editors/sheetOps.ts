/**
 * Character sheet edits, ported from the EntityRes/CharSheet.java setters the
 * sheet pane calls. Pure: every function returns a new sheet (with its
 * equipment/total attributes re-synced) and never touches the input.
 *
 * Java behaviours deliberately fixed (FEATURES.md §17.3):
 *  - F-51 toggling Unconscious/Dead keeps every other status (Java cleared them all);
 *  - F-52 items added from the database keep their abilities and colour (Java's
 *    copies dropped them).
 */
import {
  StatusEffect,
  type AccessoryDef,
  type CharSheetDef,
  type ItemDef,
  type StatusDef,
  type WeaponDef,
} from '../assets/types.ts';
import { isCaster, castingStatIndex, tempAttributes, totalAttributes } from '../engine/selectors/stats.ts';
import { maxSpellSlots, spellSlotsRemaining, MAX_SPELL_LEVEL } from '../engine/rules/spellSlots.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Re-derive the equipment-only bonus and the totals (CharSheet.updateAttributes). */
export function synced(sheet: CharSheetDef): CharSheetDef {
  return { ...sheet, tempAttributes: tempAttributes(sheet), totalAttributes: totalAttributes(sheet) };
}

const edit = (sheet: CharSheetDef, fn: (s: CharSheetDef) => void): CharSheetDef => {
  const s = clone(sheet);
  fn(s);
  return synced(s);
};

// ------------------------------------------------------------------ points

/** CharSheet.getAvailableStatPoints / getSpentStatPoints. */
export function statPoints(sheet: CharSheetDef): { spent: number; available: number; balance: number } {
  const available = 27 + (Math.max(1, sheet.level) - 1) * 2;
  const spent = sheet.baseAttributes.reduce((a, b) => a + b, 0);
  return { spent, available, balance: available - spent };
}

export function pointsLabel(sheet: CharSheetDef): string {
  const p = statPoints(sheet);
  return `Points: ${p.spent} / ${p.available}${p.balance < 0 ? ` (Over by ${Math.abs(p.balance)})` : ''}`;
}

// -------------------------------------------------------------- basic info

export const setLevel = (sheet: CharSheetDef, level: number) =>
  edit(sheet, (s) => (s.level = Math.max(1, Math.min(99, Math.trunc(level)))));

export const setBaseAttribute = (sheet: CharSheetDef, index: number, value: number) =>
  edit(sheet, (s) => {
    if (index >= 0 && index < 6) s.baseAttributes[index] = Math.trunc(value);
  });

/** Lowering the maximum also lowers the current HP (CharacterSheetPane). */
export const setMaxHp = (sheet: CharSheetDef, max: number) =>
  edit(sheet, (s) => {
    s.totalHP = Math.max(1, Math.min(9999, Math.trunc(max)));
    if (s.currentHP > s.totalHP) s.currentHP = s.totalHP;
  });

export const setCurrentHp = (sheet: CharSheetDef, hp: number) =>
  edit(sheet, (s) => (s.currentHP = Math.max(0, Math.min(Math.min(9999, s.totalHP), Math.trunc(hp)))));

export const setArmorClass = (sheet: CharSheetDef, ac: number) =>
  edit(sheet, (s) => (s.armorClass = Math.max(0, Math.min(99, Math.trunc(ac)))));

/** The two statuses the sheet's Status menu toggles. */
export const SHEET_STATUS_FLAGS = ['Unconscious', 'Dead'] as const;
export type SheetStatusFlag = (typeof SHEET_STATUS_FLAGS)[number];

export const hasStatus = (sheet: CharSheetDef, name: string): boolean =>
  sheet.status.some((st) => st.name === name);

/** Toggle Unconscious/Dead (`new Status(name)`: no effect, permanent); other statuses stay (F-51). */
export const setStatusFlag = (sheet: CharSheetDef, flag: SheetStatusFlag, on: boolean) =>
  edit(sheet, (s) => {
    s.status = s.status.filter((st) => st.name !== flag);
    if (on)
      s.status.push({
        name: flag,
        effectType: StatusEffect.NONE,
        magnitude: 0,
        duration: -1,
        targetAttribute: -1,
        extra: {},
      });
  });

/** The Status menu button text: "None", "A, B" or "A +N". */
export function statusMenuText(sheet: CharSheetDef): string {
  const active = SHEET_STATUS_FLAGS.filter((f) => hasStatus(sheet, f));
  if (active.length === 0) return 'None';
  if (active.length <= 2) return active.join(', ');
  return `${active[0] ?? ''} +${active.length - 1}`;
}

// ---------------------------------------------------------------- inventory

const sameItem = (a: ItemDef, b: ItemDef): boolean => a.name === b.name && a.kind === b.kind;

/** CharSheet.addItem: stack onto an item with the same name and class, else append. */
export const addItem = (sheet: CharSheetDef, item: ItemDef, quantity = item.quantity) =>
  edit(sheet, (s) => {
    const existing = s.inventory.find((i) => sameItem(i, item));
    if (existing) existing.quantity += quantity;
    else s.inventory.push({ ...clone(item), quantity });
  });

/** CharSheet.removeItem: the whole stack. */
export const removeItem = (sheet: CharSheetDef, item: ItemDef) =>
  edit(sheet, (s) => {
    const at = s.inventory.findIndex((i) => sameItem(i, item));
    if (at >= 0) s.inventory.splice(at, 1);
  });

/** CharSheet.removeItemQuantity: at 0 or less the stack goes. */
export const removeItemQuantity = (sheet: CharSheetDef, item: ItemDef, quantity: number) =>
  edit(sheet, (s) => {
    const existing = s.inventory.find((i) => sameItem(i, item));
    if (!existing) return;
    existing.quantity -= Math.trunc(quantity);
    if (existing.quantity <= 0) s.inventory.splice(s.inventory.indexOf(existing), 1);
  });

/** Inventory tabs (CharacterSheetPane.java:1015-1310). */
export const INVENTORY_TABS = [
  { key: 'weapons', label: 'Weapons', kinds: ['weapon'] },
  { key: 'accessories', label: 'Accessories', kinds: ['accessory'] },
  { key: 'consumables', label: 'Consumables/Ammo', kinds: ['consumable', 'ammunition'] },
  { key: 'crafting', label: 'Crafting', kinds: ['crafting'] },
  { key: 'keyitems', label: 'Key Items', kinds: ['keyitem'] },
] as const;

// ---------------------------------------------------------------- equipment

/**
 * Equip a weapon slot from the inventory (null = unequip): the previous weapon
 * goes back into the inventory and the new one leaves it
 * (equipPrimaryWeapon / equipSecondaryWeapon / unequip…).
 */
export const equipWeapon = (sheet: CharSheetDef, slot: 0 | 1, weapon: WeaponDef | null) =>
  edit(sheet, (s) => {
    const prev = s.weapons[slot];
    if (prev && weapon && prev.name === weapon.name) return;
    if (prev) stack(s, { ...prev, quantity: 1 });
    s.weapons[slot] = weapon ? { ...clone(weapon), quantity: 1 } : null;
    if (weapon) take(s, weapon);
  });

export const equipAccessory = (sheet: CharSheetDef, slot: 0 | 1 | 2, accessory: AccessoryDef | null) =>
  edit(sheet, (s) => {
    const prev = s.accessories[slot];
    if (prev && accessory && prev.name === accessory.name) return;
    if (prev) stack(s, { ...prev, quantity: 1 });
    s.accessories[slot] = accessory ? { ...clone(accessory), quantity: 1 } : null;
    if (accessory) take(s, accessory);
  });

/** Add one to a stack (mutating helper for the equip functions). */
function stack(s: CharSheetDef, item: ItemDef): void {
  const existing = s.inventory.find((i) => sameItem(i, item));
  if (existing) existing.quantity += 1;
  else s.inventory.push({ ...item, quantity: 1 });
}

/** Java's equip removes the whole stack (removeItem); one copy is kept when there are more. */
function take(s: CharSheetDef, item: ItemDef): void {
  const existing = s.inventory.find((i) => sameItem(i, item));
  if (!existing) return;
  existing.quantity -= 1;
  if (existing.quantity <= 0) s.inventory.splice(s.inventory.indexOf(existing), 1);
}

// --------------------------------------------------------------- abilities

export const addAbility = (sheet: CharSheetDef, ability: CharSheetDef['abilities'][number]) =>
  edit(sheet, (s) => s.abilities.push(clone(ability)));
export const removeAbility = (sheet: CharSheetDef, index: number) =>
  edit(sheet, (s) => {
    if (index >= 0 && index < s.abilities.length) s.abilities.splice(index, 1);
  });

// ------------------------------------------------------------ spellcasting

export const CASTING_STATS = [
  'None',
  'INTELLIGENCE',
  'WISDOM',
  'CHARISMA',
  'STRENGTH',
  'DEXTERITY',
  'CONSTITUTION',
] as const;

export const setCastingStat = (sheet: CharSheetDef, stat: string | null) =>
  edit(sheet, (s) => {
    s.spellcastingStat = !stat || stat.toLowerCase() === 'none' ? null : stat;
  });

/** CharSheet.getCastingModifier: the raw total casting stat, 0 for non-casters. */
export const sheetCastingModifier = (sheet: CharSheetDef): number =>
  isCaster(sheet) ? (totalAttributes(sheet)[castingStatIndex(sheet)] ?? 0) : 0;

/** "DC N  |  Atk +N" or "Not a caster" (the sheet ignores battle-only adjustments). */
export function castingLine(sheet: CharSheetDef): string {
  if (!isCaster(sheet)) return 'Not a caster';
  const mod = sheetCastingModifier(sheet);
  const atk =
    mod +
    sheet.status
      .filter((s) => s.effectType === StatusEffect.ATTACK_MODIFIER)
      .reduce((a, s) => a + s.magnitude, 0);
  return `DC ${10 + mod}  |  Atk ${atk >= 0 ? '+' : ''}${atk}`;
}

export const learnSpell = (sheet: CharSheetDef, name: string) =>
  edit(sheet, (s) => {
    if (!s.knownSpells.includes(name)) s.knownSpells.push(name);
  });
export const forgetSpell = (sheet: CharSheetDef, name: string) =>
  edit(sheet, (s) => (s.knownSpells = s.knownSpells.filter((n) => n !== name)));

/** CharSheet.longRest: every slot back. */
export const longRest = (sheet: CharSheetDef) =>
  edit(sheet, (s) => (s.spellSlotsUsed = s.spellSlotsUsed.map(() => 0)));

/** Slot pips per level with any slots: "Lv1 ●●○○". */
export function slotPips(sheet: CharSheetDef): { level: number; remaining: number; max: number }[] {
  const out: { level: number; remaining: number; max: number }[] = [];
  for (let lvl = 1; lvl <= MAX_SPELL_LEVEL; lvl++) {
    const max = maxSpellSlots(sheet, lvl);
    if (max > 0) out.push({ level: lvl, remaining: spellSlotsRemaining(sheet, lvl), max });
  }
  return out;
}

/** Statuses as written: a convenience for the sheet's battle-made statuses list. */
export const otherStatuses = (sheet: CharSheetDef): StatusDef[] =>
  sheet.status.filter((s) => !(SHEET_STATUS_FLAGS as readonly string[]).includes(s.name));
