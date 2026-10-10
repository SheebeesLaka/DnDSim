/**
 * Legacy-behaviour flags (FEATURES.md §17). LEGACY_COMPAT is exactly what the
 * Java app does; RECOMMENDED_COMPAT fixes the items the DM approved after
 * Phase 4 and is what new battles use. Flags are stored in the battle state,
 * so a saved battle replays with the rules it was created under.
 */
export interface CompatFlags {
  /** F-1: ON_TURN_START abilities fire twice when the entity has ≥1 status. */
  turnStartAbilitiesDoubleFire: boolean;
  /** F-3: Begin fires abilities for the first combatant but never ticks its statuses. */
  beginSkipsFirstStatusTick: boolean;
  /** F-8: a status with duration 0 never expires (behaves like permanent). */
  durationZeroNeverExpires: boolean;
  /** F-7: non-party entities count as enemy-side for Ambush/ties but party-side for hostility. */
  npcEntitiesLegacySide: boolean;
  /** F-2: End counts as a victory when any enemy was ever defeated or none remain. */
  victoryOnAnyDefeat: boolean;
  /** F-5: removing the current combatant leaves the index on the next unit without its turn-start processing. */
  removeCurrentSkipsNext: boolean;
  /** F-5: a removal that wraps the index past the end resets to 0 without round++. */
  removalWrapNoRoundIncrement: boolean;
  /** F-15: a pickup's tile is not standable. */
  pickupsBlockStanding: boolean;
  /** F-18: "save for half" only halves when the spell has a tier-1 die. */
  halfRequiresTier1Die: boolean;
  /** F-16: ammo compatibility reads the raw ammoType field, ignoring legacy compatibleWeaponType. */
  ammoCompatIgnoresLegacyField: boolean;
  /** F-14 / R6.11: entity damage is unclamped and negative HP is written to the sheet. */
  entityNegativeHpPersists: boolean;
  /** F-13: a non-area spell with range 0 resolves on the caster regardless of target type. */
  rangeZeroResolvesOnCaster: boolean;
  /** R8.2: enemies placed before Begin roll a preview d20 and re-sort the roster. */
  preBattleEnemyPlacementResorts: boolean;
}

export const LEGACY_COMPAT: Readonly<CompatFlags> = Object.freeze({
  turnStartAbilitiesDoubleFire: true,
  beginSkipsFirstStatusTick: true,
  durationZeroNeverExpires: true,
  npcEntitiesLegacySide: true,
  victoryOnAnyDefeat: true,
  removeCurrentSkipsNext: true,
  removalWrapNoRoundIncrement: true,
  pickupsBlockStanding: true,
  halfRequiresTier1Die: true,
  ammoCompatIgnoresLegacyField: true,
  entityNegativeHpPersists: true,
  rangeZeroResolvesOnCaster: true,
  preBattleEnemyPlacementResorts: true,
});

/**
 * Applied after Phase 4: F-1, F-3, both F-5 flags, F-18 and F-16 fixed. The rest keep the Java
 * behaviour (F-8, F-7, F-13, R8.2 by recommendation; F-2, F-15, F-14 are still the DM's call).
 */
export const RECOMMENDED_COMPAT: Readonly<CompatFlags> = Object.freeze({
  ...LEGACY_COMPAT,
  turnStartAbilitiesDoubleFire: false,
  beginSkipsFirstStatusTick: false,
  removeCurrentSkipsNext: false,
  removalWrapNoRoundIncrement: false,
  halfRequiresTier1Die: false,
  ammoCompatIgnoresLegacyField: false,
});

/** What a new battle starts with. */
export const DEFAULT_COMPAT: Readonly<CompatFlags> = RECOMMENDED_COMPAT;

export const COMPAT_FLAG_INFO: Record<keyof CompatFlags, { ref: string; legacy: string; fixed: string }> = {
  turnStartAbilitiesDoubleFire: {
    ref: 'F-1',
    legacy: 'turn-start abilities fire twice when any status is present',
    fixed: 'fire once',
  },
  beginSkipsFirstStatusTick: {
    ref: 'F-3',
    legacy: 'first combatant gets abilities but no status tick at Begin',
    fixed: 'full turn-start processing at Begin',
  },
  durationZeroNeverExpires: {
    ref: 'F-8',
    legacy: 'duration 0 never expires',
    fixed: 'duration 0 expires on first tick',
  },
  npcEntitiesLegacySide: {
    ref: 'F-7',
    legacy: 'non-party entities are enemy-side for Ambush/ties only',
    fixed: 'non-party entities are party-side everywhere',
  },
  victoryOnAnyDefeat: {
    ref: 'F-2',
    legacy: 'victory if any enemy was defeated or none remain',
    fixed: 'victory only when no enemies remain',
  },
  removeCurrentSkipsNext: {
    ref: 'F-5',
    legacy: "killing the current combatant skips the next unit's turn-start processing",
    fixed: 'the next unit gets its turn-start processing',
  },
  removalWrapNoRoundIncrement: {
    ref: 'F-5',
    legacy: 'index wrap after a removal does not advance the round',
    fixed: 'wrap advances the round',
  },
  pickupsBlockStanding: {
    ref: 'F-15',
    legacy: 'units cannot stand on a pickup tile',
    fixed: 'units may stand on pickups',
  },
  halfRequiresTier1Die: {
    ref: 'F-18',
    legacy: 'half damage on save only if a tier-1 die exists',
    fixed: 'half if any tier die exists',
  },
  ammoCompatIgnoresLegacyField: {
    ref: 'F-16',
    legacy: 'legacy compatibleWeaponType ammo never matches',
    fixed: 'legacy field is honoured',
  },
  entityNegativeHpPersists: {
    ref: 'F-14',
    legacy: 'entity HP goes negative and is saved that way',
    fixed: 'entity HP clamps at 0',
  },
  rangeZeroResolvesOnCaster: {
    ref: 'F-13',
    legacy: 'range-0 single-target spells always hit the caster',
    fixed: 'only SELF-targeted spells self-resolve',
  },
  preBattleEnemyPlacementResorts: {
    ref: 'R8.2',
    legacy: 'pre-battle enemy placement rolls a preview d20 and re-sorts',
    fixed: 'no roll until Begin',
  },
};

/** The Java behaviour with some flags overridden (rule tests check each flag both ways from here). */
export function withCompat(overrides: Partial<CompatFlags> = {}): CompatFlags {
  return { ...LEGACY_COMPAT, ...overrides };
}
