/** Move, Attack (start), Use item (start), Pick up (R9.1, R6.1, R6.14, R9.6). */
import { err } from '../errors.ts';
import { chebyshev, manhattan } from '../math.ts';
import { ammoCompatible, isRanged, weaponDamageBonus } from '../rules/combat.ts';
import { canUnitStand, combatantById, inBounds, pickupAt, unitById, unitName } from '../selectors/board.ts';
import { armorClass, attackModifier, damageDice, equippedWeapon, movement } from '../selectors/stats.ts';
import type { CharSheetDef, ItemDef } from '../../assets/types.ts';
import type { CompatLike, EntityUnit } from '../types.ts';
import { log, type HandlerMap } from './_shared.ts';

const actor = (u: ReturnType<typeof combatantById>) => !!u && (u.kind === 'enemy' || u.sheet.isParty);

/** CombatManager.hasAmmoForWeapon */
export function hasAmmoForWeapon(e: EntityUnit, compat: CompatLike): boolean {
  const w = equippedWeapon(e);
  if (!w || !isRanged(w.ammoType)) return true;
  return e.sheet.inventory.some(
    (i) =>
      i.kind === 'ammunition' &&
      i.quantity > 0 &&
      ammoCompatible(
        i.ammoType,
        i.legacyCompatibleWeaponType,
        w.ammoType,
        compat.ammoCompatIgnoresLegacyField,
      ),
  );
}

/** CharSheet.addItem: stack by name and class; otherwise append. */
export function addItemToInventory(sheet: CharSheetDef, item: ItemDef): void {
  for (const existing of sheet.inventory) {
    if (existing.name === item.name && existing.kind === item.kind) {
      existing.quantity += item.quantity;
      return;
    }
  }
  sheet.inventory.push(JSON.parse(JSON.stringify(item)) as ItemDef);
}

export const actionHandlers: HandlerMap = {
  MOVE_UNIT(draft, cmd, _ctx, emit) {
    if (!draft.turn.started) return err('notStarted', 'begin the battle first');
    const u = combatantById(draft, cmd.unitId);
    if (!actor(u) || !u) return err('notActor', 'only party members and enemies move');
    if (!inBounds(draft, cmd.r, cmd.c)) return err('outOfBounds', 'outside the grid');
    if (!canUnitStand(draft, cmd.r, cmd.c)) return err('occupied', 'cannot stand there');
    const dist = manhattan(u.r, u.c, cmd.r, cmd.c);
    if (dist > movement(u)) return err('outOfRange', `${dist} tiles is beyond MOB ${movement(u)}`);
    const from = { r: u.r, c: u.c };
    u.r = cmd.r;
    u.c = cmd.c;
    emit({ type: 'unitMoved', unitId: u.id, from, to: { r: cmd.r, c: cmd.c } });
    log(draft, `${unitName(u)} moves to (${cmd.r}, ${cmd.c})`);
    return undefined;
  },

  ATTACK(draft, cmd, _ctx, emit) {
    if (!draft.turn.started) return err('notStarted', 'begin the battle first');
    const attacker = combatantById(draft, cmd.attackerId);
    if (!actor(attacker) || !attacker) return err('notActor', 'only party members and enemies attack');
    const target = unitById(draft, cmd.targetId);
    if (!target || target.kind === 'pickup' || target.id === attacker.id)
      return err('invalidTarget', 'attack an entity, enemy or terrain object');
    if (target.kind === 'terrain' && target.health <= 0)
      return err('invalidTarget', 'that terrain is destroyed');
    if (attacker.kind === 'entity' && !hasAmmoForWeapon(attacker, draft.rules.compat)) {
      const w = equippedWeapon(attacker);
      emit({
        type: 'alert',
        level: 'warning',
        title: 'No Ammunition',
        message: `No ${w?.ammoType ?? 'ammo'} ammo in inventory!`,
      });
      return err('noAmmo', 'no compatible ammunition');
    }
    const attackMod = attackModifier(attacker);
    const targetAC = target.kind === 'terrain' ? 10 : armorClass(target);
    draft.pending = {
      kind: 'd20',
      prompt: 'Enter d20 roll:',
      flow: {
        flow: 'attack',
        attackerId: attacker.id,
        targetId: target.id,
        attackMod,
        targetAC,
        damageBonus: weaponDamageBonus(attackMod),
        weaponDice: damageDice(attacker),
      },
    };
    return undefined;
  },

  USE_CONSUMABLE(draft, cmd, _ctx, emit) {
    if (!draft.turn.started) return err('notStarted', 'begin the battle first');
    const u = combatantById(draft, cmd.unitId);
    if (!u || u.kind !== 'entity' || !u.sheet.isParty) return err('notParty', 'only party members use items');
    const consumables = u.sheet.inventory.filter((i) => i.kind === 'consumable');
    if (consumables.length === 0) {
      emit({
        type: 'alert',
        level: 'warning',
        title: 'No Items',
        message: 'No consumable items in inventory.',
      });
      return err('noItems', 'no consumables');
    }
    const item = consumables.find((i) => i.name === cmd.itemName);
    if (!item || item.kind !== 'consumable')
      return err('unknownItem', `${cmd.itemName} is not in the inventory`);
    draft.pending = { kind: 'd10Efficacy', unitId: u.id, itemName: item.name, healAmount: item.healAmount };
    return undefined;
  },

  PICKUP(draft, cmd, _ctx, emit) {
    if (!draft.turn.started) return err('notStarted', 'begin the battle first');
    const u = combatantById(draft, cmd.unitId);
    if (!u || u.kind !== 'entity' || !u.sheet.isParty)
      return err('notParty', 'only party members pick up items');
    const pickup = pickupAt(draft, cmd.r, cmd.c);
    if (!pickup) return err('noPickup', 'nothing to pick up there');
    if (chebyshev(u.r, u.c, cmd.r, cmd.c) > 1)
      return err('outOfRange', 'too far away (must be adjacent, diagonals included)');
    addItemToInventory(u.sheet, pickup.item);
    draft.units = draft.units.filter((x) => x.id !== pickup.id);
    emit({ type: 'unitRemoved', unitId: pickup.id, reason: 'pickedUp' });
    emit({ type: 'sheetChanged', sourceName: u.sourceName });
    log(draft, `${u.sheet.name} picks up ${pickup.item.name}`);
    return undefined;
  },
};
