import { describe, expect, it } from 'vitest';
import {
  COMPAT_FLAG_INFO,
  DEFAULT_COMPAT,
  LEGACY_COMPAT,
  RECOMMENDED_COMPAT,
  type CompatFlags,
} from '../../src/engine/compat.ts';
import { createBattle } from '../../src/engine/createBattle.ts';
import { parseBattle, serializeBattle } from '../../src/engine/serialize.ts';
import { engineAssets, grid } from '../helpers/engine.ts';

const FIXED: (keyof CompatFlags)[] = [
  'turnStartAbilitiesDoubleFire',
  'beginSkipsFirstStatusTick',
  'removeCurrentSkipsNext',
  'removalWrapNoRoundIncrement',
  'halfRequiresTier1Die',
  'ammoCompatIgnoresLegacyField',
];

describe('recommended compat defaults (applied after Phase 4)', () => {
  it('fix exactly F-1, F-3, both F-5 flags, F-18 and F-16; everything else keeps the Java behaviour', () => {
    for (const k of Object.keys(LEGACY_COMPAT) as (keyof CompatFlags)[]) {
      expect(RECOMMENDED_COMPAT[k], `${k} (${COMPAT_FLAG_INFO[k].ref})`).toBe(!FIXED.includes(k));
    }
    expect(DEFAULT_COMPAT).toBe(RECOMMENDED_COMPAT);
  });

  it('a new battle starts with the recommended set, and explicit overrides still win', () => {
    expect(createBattle(grid(), engineAssets()).rules.compat).toEqual(RECOMMENDED_COMPAT);
    expect(createBattle(grid(), engineAssets(), { compat: LEGACY_COMPAT }).rules.compat).toEqual(
      LEGACY_COMPAT,
    );
    expect(
      createBattle(grid(), engineAssets(), { compat: { victoryOnAnyDefeat: false } }).rules.compat
        .victoryOnAnyDefeat,
    ).toBe(false);
  });

  it('a battle saved under the Java rules reloads with them; one saved today reloads with the fixes', () => {
    const legacy = createBattle(grid(), engineAssets(), { compat: LEGACY_COMPAT });
    expect(parseBattle(serializeBattle(legacy)).rules.compat).toEqual(LEGACY_COMPAT);
    const today = createBattle(grid(), engineAssets());
    expect(parseBattle(serializeBattle(today)).rules.compat).toEqual(RECOMMENDED_COMPAT);
  });
});
