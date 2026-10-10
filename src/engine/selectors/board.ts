/** BattleGrid.java lookups over the flat units array (R9.2, R9.3). */
import type {
  BattleState,
  Cell,
  Combatant,
  EntityUnit,
  EnemyUnit,
  PickupUnit,
  TerrainUnit,
  Unit,
  UnitId,
} from '../types.ts';

const RANK: Record<Unit['kind'], number> = { entity: 0, enemy: 1, terrain: 2, pickup: 3 };

export function inBounds(state: BattleState, r: number, c: number): boolean {
  return r >= 0 && r < state.board.rows && c >= 0 && c < state.board.cols;
}

export function isEnabled(state: BattleState, r: number, c: number): boolean {
  if (!inBounds(state, r, c)) return false;
  const row = state.board.mask?.[r];
  return state.board.mask === null || row?.[c] === true;
}

export function elevationAt(state: BattleState, r: number, c: number): number {
  return inBounds(state, r, c) ? (state.board.elevation[r]?.[c] ?? 0) : 0;
}

/** getObjectAt precedence: Entity > Enemy > non-destroyed Terrain > Pickup, then insertion order. */
export function objectAt(state: BattleState, r: number, c: number): Unit | null {
  let best: Unit | null = null;
  for (const u of state.units) {
    if (u.r !== r || u.c !== c) continue;
    if (u.kind === 'terrain' && u.health <= 0) continue;
    if (best === null || RANK[u.kind] < RANK[best.kind]) best = u;
  }
  return best;
}

export function terrainAt(state: BattleState, r: number, c: number): TerrainUnit | null {
  for (const u of state.units) if (u.kind === 'terrain' && u.r === r && u.c === c && u.health > 0) return u;
  return null;
}

export function pickupAt(state: BattleState, r: number, c: number): PickupUnit | null {
  for (const u of state.units) if (u.kind === 'pickup' && u.r === r && u.c === c) return u;
  return null;
}

/** BattleGrid.isBlocked: early-returns the first terrain's collision (only used for empty tiles). */
export function isBlocked(state: BattleState, r: number, c: number): boolean {
  if (!isEnabled(state, r, c)) return true;
  for (const u of state.units) {
    if (u.kind === 'terrain' && u.r === r && u.c === c && u.health > 0) return u.collision;
  }
  for (const u of state.units)
    if ((u.kind === 'entity' || u.kind === 'enemy') && u.r === r && u.c === c) return true;
  return false;
}

/** BattleGrid.canUnitStand: enabled and (empty or a non-colliding terrain). Pickups block (F-15) unless the flag is off. */
export function canUnitStand(state: BattleState, r: number, c: number): boolean {
  if (!isEnabled(state, r, c)) return false;
  const obj = objectAt(state, r, c);
  if (obj === null) return true;
  if (obj.kind === 'terrain') return !obj.collision;
  if (obj.kind === 'pickup') return !state.rules.compat.pickupsBlockStanding;
  return false;
}

export function unitById(state: BattleState, id: UnitId): Unit | undefined {
  return state.units.find((u) => u.id === id);
}

export function combatantById(state: BattleState, id: UnitId): Combatant | undefined {
  const u = unitById(state, id);
  return u && (u.kind === 'entity' || u.kind === 'enemy') ? u : undefined;
}

export const entities = (state: BattleState): EntityUnit[] =>
  state.units.filter((u): u is EntityUnit => u.kind === 'entity');
export const enemies = (state: BattleState): EnemyUnit[] =>
  state.units.filter((u): u is EnemyUnit => u.kind === 'enemy');
export const terrainUnits = (state: BattleState): TerrainUnit[] =>
  state.units.filter((u): u is TerrainUnit => u.kind === 'terrain');
export const pickups = (state: BattleState): PickupUnit[] =>
  state.units.filter((u): u is PickupUnit => u.kind === 'pickup');
export const combatants = (state: BattleState): Combatant[] =>
  state.units.filter((u): u is Combatant => u.kind === 'entity' || u.kind === 'enemy');

/** Party members on the field, in placement order (BattleView.partyOnField). */
export const partyOnField = (state: BattleState): EntityUnit[] =>
  entities(state).filter((e) => e.sheet.isParty);

export function isParty(u: Unit): u is EntityUnit {
  return u.kind === 'entity' && u.sheet.isParty;
}

export const cellOf = (u: Unit): Cell => ({ r: u.r, c: u.c });

/** Display name: enemies and non-party instances are `Base #N`. */
export function unitName(u: Unit): string {
  switch (u.kind) {
    case 'entity':
      return u.instanceNumber > 0 ? `${u.baseName} #${u.instanceNumber}` : u.sheet.name;
    case 'enemy':
      return u.instanceNumber > 0 ? `${u.baseName} #${u.instanceNumber}` : u.name;
    case 'terrain':
      return u.type;
    case 'pickup':
      return u.item.name;
  }
}
