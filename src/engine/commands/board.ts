/** Board setup, placement and removal (FEATURES.md §4.2, §4.3, R4.3, R9.8). */
import { err } from '../errors.ts';
import {
  initiativeFloat,
  removeFromOrder,
  rollAndInsert,
  sortOrderByInitiative,
} from '../rules/turnOrder.ts';
import {
  canUnitStand,
  entities,
  inBounds,
  isBlocked,
  isEnabled,
  objectAt,
  unitById,
  unitName,
} from '../selectors/board.ts';
import { initiativeModifier } from '../selectors/stats.ts';
import type { EnemyUnit, EntityUnit, PickupUnit, TerrainUnit } from '../types.ts';
import { log, nextId, type HandlerMap } from './_shared.ts';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const boardHandlers: HandlerMap = {
  SET_GRID(draft, cmd) {
    if (draft.turn.started) return err('battleStarted', 'the grid cannot change once the battle has begun');
    if (draft.units.length > 0) return err('boardNotEmpty', 'remove every unit before changing the grid');
    const rows = Math.max(1, Math.trunc(cmd.setup.rows));
    const cols = Math.max(1, Math.trunc(cmd.setup.cols));
    draft.board.rows = rows;
    draft.board.cols = cols;
    draft.board.mask = cmd.setup.mask ? cmd.setup.mask.map((row) => [...row]) : null;
    draft.board.elevation = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
    draft.board.ramps = [];
    draft.board.theme = cmd.setup.theme || draft.board.theme;
    return undefined;
  },

  PLACE_ENTITY(draft, cmd, ctx, emit) {
    const queue = draft.turn.placementQueue;
    if (queue.length > 0 && queue[0] !== cmd.name) return err('notCurrentPlacing', `place ${queue[0]} first`);
    const sheet = ctx.assets.party[cmd.name];
    if (!sheet) return err('unknownSheet', `no character sheet named ${cmd.name}`);
    if (entities(draft).some((e) => e.sheet.name === cmd.name))
      return err('alreadyOnField', `${cmd.name} is already on the field`);
    if (!inBounds(draft, cmd.r, cmd.c)) return err('outOfBounds', 'outside the grid');
    if (!canUnitStand(draft, cmd.r, cmd.c)) {
      emit({
        type: 'floatText',
        cell: { r: cmd.r, c: cmd.c },
        text: 'Occupied',
        color: '#b8b8c0',
        kind: 'OTHER',
      });
      return err('occupied', 'a unit cannot stand there');
    }
    const copy = clone(sheet);
    // CharSheet.resolveEquippedWeapon: equipped weapons follow the item database by name (R15.3)
    for (let i = 0; i < 2; i++) {
      const w = copy.weapons[i];
      if (w && ctx.assets.weapons[w.name])
        copy.weapons[i] = clone(ctx.assets.weapons[w.name] as NonNullable<typeof w>);
    }
    const unit: EntityUnit = {
      id: nextId(draft, 'u'),
      kind: 'entity',
      r: cmd.r,
      c: cmd.c,
      altitude: 0,
      sourceName: sheet.name,
      sheet: copy,
      instanceNumber: 0,
      baseName: sheet.name,
      acAdjustment: 0,
      statAdjustment: [0, 0, 0, 0, 0, 0],
      diceOverride: [null, null, null],
    };
    draft.units.push(unit);
    draft.turn.order.push(unit.id);
    if (draft.turn.started) {
      const roll = rollAndInsert(draft, unit.id, initiativeModifier(unit), ctx.rng);
      emit(initiativeFloat(unit.id, roll, false));
    }
    if (queue.length > 0) queue.shift();
    emit({ type: 'unitPlaced', unitId: unit.id });
    log(draft, `${sheet.name} placed at (${cmd.r}, ${cmd.c})`);
    return undefined;
  },

  PLACE_ENEMY(draft, cmd, ctx, emit) {
    if (draft.turn.placementQueue.length > 0) return err('placementPhase', 'finish placing the party first');
    const tpl = ctx.assets.enemies[cmd.templateStem];
    if (!tpl) return err('unknownEnemy', `no enemy template ${cmd.templateStem}`);
    if (!inBounds(draft, cmd.r, cmd.c)) return err('outOfBounds', 'outside the grid');
    if (!canUnitStand(draft, cmd.r, cmd.c)) {
      emit({
        type: 'floatText',
        cell: { r: cmd.r, c: cmd.c },
        text: 'Occupied',
        color: '#b8b8c0',
        kind: 'OTHER',
      });
      return err('occupied', 'a unit cannot stand there');
    }
    const n = (draft.enemyInstanceCounts[cmd.templateStem] ?? 0) + 1;
    draft.enemyInstanceCounts[cmd.templateStem] = n;
    const unit: EnemyUnit = {
      id: nextId(draft, 'u'),
      kind: 'enemy',
      r: cmd.r,
      c: cmd.c,
      altitude: 0,
      templateStem: cmd.templateStem,
      name: tpl.name,
      baseName: tpl.name,
      instanceNumber: n,
      health: tpl.health,
      maxHealth: tpl.maxHealth,
      mobility: tpl.mobility,
      armorClass: tpl.armorClass,
      damageDice: [...tpl.damageDice],
      dexterity: tpl.dexterity,
      color: tpl.color,
      spritePath: tpl.spritePath,
      tags: [...tpl.tags],
      attributes: tpl.attributes ? [...tpl.attributes] : null,
      statuses: [],
      acAdjustment: 0,
      dexAdjustment: 0,
      diceOverride: [null, null, null],
    };
    draft.units.push(unit);
    draft.turn.order.push(unit.id);
    // TurnManager.addEnemy: always rolls at placement; pre-battle it is a preview (R8.2)
    if (draft.turn.started || draft.rules.compat.preBattleEnemyPlacementResorts) {
      const roll = rollAndInsert(draft, unit.id, initiativeModifier(unit), ctx.rng);
      emit(initiativeFloat(unit.id, roll, true));
    }
    emit({ type: 'unitPlaced', unitId: unit.id });
    log(draft, `${unitName(unit)} placed at (${cmd.r}, ${cmd.c})`);
    return undefined;
  },

  PLACE_TERRAIN(draft, cmd, ctx, emit) {
    if (draft.turn.placementQueue.length > 0) return err('placementPhase', 'finish placing the party first');
    const tpl = ctx.assets.terrain.find((t) => t.type === cmd.terrainType);
    if (!tpl) return err('unknownTerrain', `no terrain ${cmd.terrainType}`);
    if (!inBounds(draft, cmd.r, cmd.c)) return err('outOfBounds', 'outside the grid');
    if (objectAt(draft, cmd.r, cmd.c) !== null || isBlocked(draft, cmd.r, cmd.c)) {
      emit({
        type: 'floatText',
        cell: { r: cmd.r, c: cmd.c },
        text: 'Occupied',
        color: '#b8b8c0',
        kind: 'OTHER',
      });
      return err('occupied', 'terrain needs an empty tile');
    }
    const unit: TerrainUnit = {
      id: nextId(draft, 'u'),
      kind: 'terrain',
      r: cmd.r,
      c: cmd.c,
      altitude: 0,
      type: tpl.type,
      health: tpl.health,
      color: tpl.color,
      collision: tpl.collision,
      entityAboveTerrain: tpl.entityAboveTerrain,
      spritePath: tpl.spritePath,
      blocksLight: tpl.collision,
    };
    draft.units.push(unit);
    emit({ type: 'unitPlaced', unitId: unit.id });
    log(draft, `${tpl.type} placed at (${cmd.r}, ${cmd.c})`);
    return undefined;
  },

  PLACE_PICKUP(draft, cmd, ctx, emit) {
    if (draft.turn.placementQueue.length > 0) return err('placementPhase', 'finish placing the party first');
    const table =
      cmd.itemKind === 'weapon'
        ? ctx.assets.weapons
        : cmd.itemKind === 'accessory'
          ? ctx.assets.accessories
          : ctx.assets.consumables;
    const item = table[cmd.itemName];
    if (!item) return err('unknownItem', `no ${cmd.itemKind} named ${cmd.itemName}`);
    if (!inBounds(draft, cmd.r, cmd.c)) return err('outOfBounds', 'outside the grid');
    if (objectAt(draft, cmd.r, cmd.c) !== null || isBlocked(draft, cmd.r, cmd.c)) {
      emit({
        type: 'floatText',
        cell: { r: cmd.r, c: cmd.c },
        text: 'Occupied',
        color: '#b8b8c0',
        kind: 'OTHER',
      });
      return err('occupied', 'a pickup needs an empty tile');
    }
    const unit: PickupUnit = {
      id: nextId(draft, 'u'),
      kind: 'pickup',
      r: cmd.r,
      c: cmd.c,
      altitude: 0,
      item: clone(item),
    };
    draft.units.push(unit);
    emit({ type: 'unitPlaced', unitId: unit.id });
    log(draft, `${item.name} dropped at (${cmd.r}, ${cmd.c})`);
    return undefined;
  },

  REMOVE_UNIT(draft, cmd, _ctx, emit) {
    const unit = unitById(draft, cmd.unitId);
    if (!unit) return err('unknownUnit', 'no such unit');
    draft.units = draft.units.filter((u) => u.id !== cmd.unitId);
    if (unit.kind === 'entity' || unit.kind === 'enemy') removeFromOrder(draft, unit.id);
    if (unit.kind === 'entity' && unit.sheet.isParty) draft.graveyard.push(unit);
    emit({ type: 'unitRemoved', unitId: unit.id, reason: 'deleted' });
    log(draft, `${unitName(unit)} removed`);
    return undefined;
  },

  SKIP_PLACEMENT(draft) {
    draft.turn.placementQueue = [];
    return undefined;
  },
};

/** Used by tests/debug: re-sort after external initiative edits. */
export { sortOrderByInitiative, isEnabled };
