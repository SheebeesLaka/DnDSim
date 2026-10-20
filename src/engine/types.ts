/**
 * Battle state: the single JSON document the DM window owns, the player
 * window mirrors, save/load serialises and tests fixture. No class instances,
 * no functions, no Dates.
 */
import type {
  AccessoryDef,
  Attributes6,
  CharSheetDef,
  ConsumableDef,
  DiceTiers,
  EnemyDef,
  ItemDef,
  SpellDef,
  StatusDef,
  TerrainDef,
  WeaponDef,
} from '../assets/types.ts';
import type { CompatFlags } from './compat.ts';
import type { Rng } from './rng.ts';

export const BATTLE_STATE_VERSION = 1;
export type CompatLike = CompatFlags;

export type UnitId = string;
export interface Cell {
  r: number;
  c: number;
}

export type RoundStartMode = 'SURPRISE' | 'NORMAL' | 'AMBUSH';
export type UnitKind = 'entity' | 'enemy' | 'terrain' | 'pickup';

// ---------- units ----------

interface UnitBase {
  id: UnitId;
  kind: UnitKind;
  r: number;
  c: number;
  /** Flying height in 5 ft steps above the tile (visual foundation, no rule effect). */
  altitude: number;
}

/** A party or non-party character: a battle *copy* of its CharSheet plus battle-only tweaks. */
export interface EntityUnit extends UnitBase {
  kind: 'entity';
  /** Display name of the source sheet (the saves/entities/party key). */
  sourceName: string;
  sheet: CharSheetDef;
  instanceNumber: number;
  baseName: string;
  acAdjustment: number;
  statAdjustment: Attributes6;
  diceOverride: DiceTiers;
  /**
   * F-14 (fixed): a party member at 0 HP stays on the board, dying, instead of
   * leaving it, until the DM resolves it from the sidebar (RESOLVE_DYING:
   * recover at 1 HP, hold on, or perish). Absent/null = not dying. The
   * death-save tallies are reserved for automated rolls later.
   */
  dying?: DeathSaves | null;
}

/** 5e death saving throws: three successes stabilise, three failures kill. */
export interface DeathSaves {
  successes: number;
  failures: number;
}

export interface EnemyUnit extends UnitBase {
  kind: 'enemy';
  /** File stem of the template (Enemy.load key). */
  templateStem: string;
  name: string;
  baseName: string;
  instanceNumber: number;
  health: number;
  maxHealth: number;
  mobility: number;
  armorClass: number;
  damageDice: DiceTiers;
  dexterity: number;
  color: string;
  spritePath: string | null;
  tags: string[];
  attributes: Attributes6 | null;
  statuses: StatusDef[];
  acAdjustment: number;
  dexAdjustment: number;
  diceOverride: DiceTiers;
}

export interface TerrainUnit extends UnitBase {
  kind: 'terrain';
  type: string;
  health: number;
  color: string;
  collision: boolean;
  entityAboveTerrain: boolean;
  spritePath: string | null;
  /** Visual foundation: blocks light (walls); no rule effect. */
  blocksLight: boolean;
}

export interface PickupUnit extends UnitBase {
  kind: 'pickup';
  item: ItemDef;
}

export type Unit = EntityUnit | EnemyUnit | TerrainUnit | PickupUnit;
export type Combatant = EntityUnit | EnemyUnit;

// ---------- board & visual foundations ----------

export type LightLevel = 'bright' | 'dim' | 'dark';

export interface Light {
  id: string;
  name: string;
  brightRadius: number;
  dimRadius: number;
  color: string;
  at?: Cell;
  attachedTo?: UnitId;
  groupId?: string;
  on: boolean;
  /** an unsteady light (torch, failing fixture): the renderer flickers it */
  flicker?: boolean;
}

/** Reinforcements waiting to arrive (the DM is asked whether to bring them in at the start of `round`). */
export interface Arrival {
  id: string;
  templateStem: string;
  count: number;
  round: number;
  note?: string;
}

/** A DM reminder that comes due at the start of `round`, optionally offering a light-group switch. */
export interface DmTimer {
  id: string;
  name: string;
  round: number;
  note?: string;
  lightGroupId?: string;
  lightOn?: boolean;
}

export interface LightGroup {
  id: string;
  name: string;
  on: boolean;
}

export interface Board {
  rows: number;
  cols: number;
  /** null = every cell playable (rectangle). */
  mask: boolean[][] | null;
  /** Per-cell elevation in 5 ft steps; negative = pit. Visual only in Phase 2. */
  elevation: number[][];
  /** Ramp cells: sloped from `from` to `to`, downhill toward `dir`. Visual only. */
  ramps: { r: number; c: number; from: number; to: number; dir: 'N' | 'S' | 'E' | 'W' }[];
  theme: string;
  lights: Light[];
  lightGroups: LightGroup[];
  ambient: LightLevel;
  /**
   * Ambient light 0 (pitch black) … 100 (daylight). The DM's slider; `ambient`
   * above is its bright/dim/dark band (who players can see). Absent in older
   * saves: read through `ambientLevelOf`.
   */
  ambientLevel?: number;
  dmReveal: boolean;
  /** Tombstones where party members perished (decoration; never blocks a tile). */
  graves?: Grave[];
}

/** Where a party member perished. */
export interface Grave {
  id: string;
  r: number;
  c: number;
  /** display name of who died there */
  name: string;
}

// ---------- turn order ----------

export interface InitiativeRoll {
  /** d20 + modifier (+100 under Surprise/Ambush), as Java stores it. */
  total: number;
  d20: number;
  mod: number;
}

export interface TurnState {
  started: boolean;
  ended: boolean;
  roundStartMode: RoundStartMode;
  order: UnitId[];
  currentIndex: number;
  round: number;
  initiative: Record<UnitId, InitiativeRoll>;
  pendingTies: UnitId[][];
  enemiesDefeated: number;
  /** Set by END_BATTLE. */
  victory: boolean | null;
  /** Party placement queue (names still to place); non-empty = placement phase. */
  placementQueue: string[];
  /** Delayed combatants: out of the order until the DM drops them back in (they keep the new spot). */
  held?: UnitId[];
  /** Readied actions: combatant → the DM's note. Cleared at that combatant's next turn start. */
  readied?: Record<UnitId, string>;
  /** Reinforcements queued for a later round. */
  arrivals?: Arrival[];
  /** DM reminders queued for a later round. */
  timers?: DmTimer[];
  /** The round each combatant last had its turn-start processing, so a reorder never ticks statuses twice. */
  tickedRound?: Record<UnitId, number>;
}

// ---------- pending DM input ----------

/** What the dice panel would be asking the DM for. Nothing is spent until resolution. */
export type AttackFlow = {
  flow: 'attack';
  attackerId: UnitId;
  targetId: UnitId;
  attackMod: number;
  targetAC: number;
  damageBonus: number;
  /** The weapon's tier dice at the moment the attack started. */
  weaponDice: DiceTiers;
};

export type SpellFlow = {
  flow: 'spell';
  casterId: UnitId;
  targetId: UnitId;
  spell: SpellDef;
  slotLevel: number;
  casterLevel: number;
  damageBonus: number;
  /** ATTACK */
  attackMod?: number;
  targetAC?: number;
  /** SAVE */
  saveDC?: number;
  saveMod?: number;
};

export type AreaFlow = {
  flow: 'area';
  casterId: UnitId;
  spell: SpellDef;
  slotLevel: number;
  casterLevel: number;
  damageBonus: number;
  cells: Cell[];
  targetIds: UnitId[];
  attackMod?: number;
  saveDC?: number;
};

export type Flow = AttackFlow | SpellFlow | AreaFlow;

export type Pending =
  | { kind: 'initiativeEntry'; party: UnitId[] }
  | { kind: 'tieOrder'; groups: UnitId[][] }
  | { kind: 'd20'; flow: AttackFlow | SpellFlow; prompt: string }
  | { kind: 'areaD20s'; flow: AreaFlow; prompt: string }
  | {
      kind: 'damage';
      flow: Flow;
      dice: string[];
      prompt: string;
      /** d20 result for single-target flows (crit check) */
      d20?: number;
      tier: number;
      saved: boolean;
      halve: boolean;
      /** area: per-target outcome from the d20 step */
      area?: { tiers: number[]; saved: boolean[]; half: boolean[]; crit: boolean[]; maxTier: number };
    }
  | {
      /** Java's RESULT_MISS / SAVED / ALL MISSED banner: OK resolves (spends ammo/slot), Cancel refunds. */
      kind: 'confirm';
      flow: Flow;
      banner: string;
      d20?: number;
      saved: boolean;
      area?: { tiers: number[]; saved: boolean[]; half: boolean[]; crit: boolean[]; maxTier: number };
    }
  | { kind: 'd10Efficacy'; unitId: UnitId; itemName: string; healAmount: number };

// ---------- state ----------

export interface LogEntry {
  n: number;
  text: string;
}

export interface BattleState {
  version: number;
  rules: { compat: CompatFlags };
  nextId: number;
  board: Board;
  units: Unit[];
  /** Party entities removed from the board (defeated or deleted); their sheets still persist. */
  graveyard: EntityUnit[];
  /** Per enemy template stem: instances placed this battle (names `Base #N`). */
  enemyInstanceCounts: Record<string, number>;
  turn: TurnState;
  pending: Pending | null;
  log: LogEntry[];
}

// ---------- commands ----------

export type GridSetup = { rows: number; cols: number; mask: boolean[][] | null; theme: string };

export type Command =
  // board / setup
  | { type: 'SET_GRID'; setup: GridSetup }
  | { type: 'PLACE_ENTITY'; name: string; r: number; c: number }
  | { type: 'PLACE_ENEMY'; templateStem: string; r: number; c: number }
  | { type: 'PLACE_TERRAIN'; terrainType: string; r: number; c: number }
  | {
      type: 'PLACE_PICKUP';
      itemKind: 'weapon' | 'accessory' | 'consumable';
      itemName: string;
      r: number;
      c: number;
    }
  | { type: 'REMOVE_UNIT'; unitId: UnitId }
  | { type: 'SKIP_PLACEMENT' }
  // visual foundations (no rule effect)
  | { type: 'SET_ELEVATION'; r: number; c: number; level: number }
  | { type: 'ADJUST_ELEVATION'; r: number; c: number; delta: number }
  | { type: 'SET_RAMP'; r: number; c: number; ramp: Board['ramps'][number] | null }
  | { type: 'SET_ALTITUDE'; unitId: UnitId; altitude: number }
  | { type: 'ADD_LIGHT'; light: Omit<Light, 'id'> & { id?: string } }
  | { type: 'UPDATE_LIGHT'; lightId: string; patch: Partial<Omit<Light, 'id'>> }
  | { type: 'REMOVE_LIGHT'; lightId: string }
  | { type: 'TOGGLE_LIGHT'; lightId: string; on?: boolean }
  | { type: 'SET_LIGHT_GROUP'; group: LightGroup }
  | { type: 'TOGGLE_LIGHT_GROUP'; groupId: string; on?: boolean }
  | { type: 'SET_AMBIENT'; level: LightLevel }
  | { type: 'SET_AMBIENT_LEVEL'; level: number }
  | { type: 'SET_DM_REVEAL'; on: boolean }
  | { type: 'SET_THEME'; theme: string }
  | { type: 'SET_TERRAIN_BLOCKS_LIGHT'; unitId: UnitId; blocksLight: boolean }
  | { type: 'SET_COMPAT'; flags: Partial<CompatFlags> }
  // lifecycle
  | { type: 'SET_ROUND_START_MODE'; mode: RoundStartMode }
  | { type: 'BEGIN_BATTLE' }
  | { type: 'CANCEL_INITIATIVE_ENTRY' }
  | { type: 'SUBMIT_INITIATIVE'; rolls: Record<UnitId, number> }
  | { type: 'RESOLVE_TIE'; group: UnitId[]; order: UnitId[] }
  | { type: 'DISMISS_TIES' }
  | { type: 'NEXT_TURN' }
  | { type: 'END_BATTLE' }
  | { type: 'LONG_REST' }
  // sidebar adjustments
  | { type: 'SET_HP'; unitId: UnitId; hp: number }
  /** The DM decides a dying party member's fate (F-14 fixed). */
  | { type: 'RESOLVE_DYING'; unitId: UnitId; outcome: 'recover' | 'hold' | 'perish' }
  /** Typed damage (negative) or healing (positive) that behaves like a real hit: floating number, defeat, dying. */
  | { type: 'APPLY_HP'; unitId: UnitId; delta: number }
  | { type: 'ADD_STATUS'; unitId: UnitId; status: StatusDef; source?: string }
  | { type: 'UPDATE_STATUS'; unitId: UnitId; name: string; patch: { duration?: number; magnitude?: number } }
  | { type: 'REMOVE_STATUS'; unitId: UnitId; name: string }
  // freeform turn order (never blocks an action)
  | { type: 'REORDER_TURN'; unitId: UnitId; toIndex: number }
  | { type: 'DELAY_TURN'; unitId: UnitId }
  | { type: 'RETURN_FROM_HOLD'; unitId: UnitId; index: number; actNow?: boolean }
  | { type: 'SET_READIED'; unitId: UnitId; note: string | null }
  | { type: 'ADD_ARRIVAL'; templateStem: string; count: number; round: number; note?: string }
  | { type: 'REMOVE_ARRIVAL'; id: string }
  | { type: 'ADD_TIMER'; timer: Omit<DmTimer, 'id'> }
  | { type: 'REMOVE_TIMER'; id: string }
  | { type: 'ADJUST_AC'; unitId: UnitId; delta: number }
  | { type: 'ADJUST_STAT'; unitId: UnitId; attribute: number; delta: number }
  | { type: 'ADJUST_DICE'; unitId: UnitId; tier: number; direction: number }
  | { type: 'SWAP_WEAPON'; unitId: UnitId }
  /** Character Sheets edited a party sheet mid-battle (Java shares the sheet object with the combatant). */
  | { type: 'REPLACE_SHEET'; sourceName: string; sheet: CharSheetDef }
  // actions
  | { type: 'MOVE_UNIT'; unitId: UnitId; r: number; c: number }
  | { type: 'ATTACK'; attackerId: UnitId; targetId: UnitId }
  | {
      type: 'CAST_SPELL';
      casterId: UnitId;
      spellName: string;
      slotLevel: number;
      targetId?: UnitId;
      aim?: Cell;
    }
  | { type: 'USE_CONSUMABLE'; unitId: UnitId; itemName: string }
  | { type: 'PICKUP'; unitId: UnitId; r: number; c: number }
  // pending resolution
  | { type: 'SUBMIT_ROLL'; d20?: number; dice?: number[]; d10?: number; areaD20s?: number[] }
  | { type: 'AUTO_FILL_AREA_ROLLS'; d20s?: number[] }
  | { type: 'CONFIRM_PENDING' }
  | { type: 'CANCEL_PENDING' };

// ---------- events ----------

export type TextKind = 'DAMAGE' | 'HEAL' | 'STATUS' | 'INITIATIVE' | 'OTHER';

export type BattleEvent =
  | { type: 'floatText'; unitId?: UnitId; cell?: Cell; text: string; color: string; kind: TextKind }
  | { type: 'alert'; level: 'info' | 'warning'; title: string; message: string }
  | { type: 'unitPlaced'; unitId: UnitId }
  | { type: 'unitRemoved'; unitId: UnitId; reason: 'defeated' | 'deleted' | 'destroyed' | 'pickedUp' }
  | { type: 'unitMoved'; unitId: UnitId; from: Cell; to: Cell }
  | { type: 'battleStarted' }
  | { type: 'turnChanged'; unitId: UnitId | null; round: number }
  | { type: 'statusExpired'; unitId: UnitId; name: string }
  | { type: 'battleEnded'; victory: boolean }
  | { type: 'sheetChanged'; sourceName: string }
  | { type: 'log'; text: string };

export interface EngineError {
  code: string;
  message: string;
}

export type ReduceResult =
  | { ok: true; state: BattleState; events: BattleEvent[] }
  | { ok: false; state: BattleState; events: BattleEvent[]; error: EngineError };

export interface EngineAssets {
  party: Record<string, CharSheetDef>;
  enemies: Record<string, EnemyDef>;
  weapons: Record<string, WeaponDef>;
  accessories: Record<string, AccessoryDef>;
  consumables: Record<string, ConsumableDef>;
  spells: Record<string, SpellDef>;
  terrain: TerrainDef[];
}

export interface EngineContext {
  rng: Rng;
  assets: EngineAssets;
}
