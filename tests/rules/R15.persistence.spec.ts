/** Serialisation round-trips, version checks, compat back-fill, scenario fixture. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEGACY_COMPAT } from '../../src/engine/compat.ts';
import { BattleParseError, cloneBattle, parseBattle, serializeBattle } from '../../src/engine/serialize.ts';
import { partySheetsToPersist } from '../../src/engine/selectors/persistence.ts';
import { ctx, fresh, run } from '../helpers/engine.ts';
import { normalizeBundle } from '../../src/assets/bundle.ts';

describe('battle state serialisation', () => {
  it('round-trips byte-for-byte and is plain JSON', () => {
    let { state } = fresh({ partyList: [] });
    const c = ctx();
    state = run(
      state,
      c,
      { type: 'PLACE_ENTITY', name: 'NMB-15', r: 0, c: 0 },
      { type: 'PLACE_ENEMY', templateStem: 'Spider', r: 1, c: 1 },
      { type: 'SET_ELEVATION', r: 2, c: 2, level: -1 },
    );
    const text = serializeBattle(state);
    expect(JSON.parse(text)).toEqual(state);
    expect(serializeBattle(parseBattle(text))).toBe(text);
    expect(cloneBattle(state)).toEqual(state);
    expect(cloneBattle(state)).not.toBe(state);
  });

  it('rejects bad input and back-fills compat flags from older files', () => {
    expect(() => parseBattle('[]')).toThrow(BattleParseError);
    expect(() => parseBattle('{"version":99}')).toThrow(/version/);
    const { state } = fresh({ partyList: [] });
    const old = JSON.parse(serializeBattle(state)) as Record<string, unknown>;
    (old.rules as { compat: Record<string, unknown> }).compat = { victoryOnAnyDefeat: false };
    delete old.graveyard;
    delete (old.board as Record<string, unknown>).lights;
    const parsed = parseBattle(JSON.stringify(old));
    expect(parsed.rules.compat).toEqual({ ...LEGACY_COMPAT, victoryOnAnyDefeat: false });
    expect(parsed.graveyard).toEqual([]);
    expect(parsed.board.lights).toEqual([]);
  });

  it('partySheetsToPersist lists on-board and removed party sheets, keyed by source name', () => {
    let { state } = fresh({ partyList: [] });
    const c = ctx();
    state = run(
      state,
      c,
      { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 },
      { type: 'PLACE_ENTITY', name: 'Dan Dixon', r: 0, c: 1 },
      { type: 'PLACE_ENEMY', templateStem: 'Snake', r: 3, c: 3 },
    );
    state = run(state, c, { type: 'REMOVE_UNIT', unitId: 'u2' });
    const sheets = partySheetsToPersist(state);
    expect(Object.keys(sheets).sort()).toEqual(['Dan Dixon', 'Henry Keaton']);
    expect(sheets['Dan Dixon']?.name).toBe('Dan Dixon');
  });
});

describe('scenarios/test.json', () => {
  it('is a valid battle with inline assets that normalise cleanly', () => {
    const scenario = JSON.parse(readFileSync('scenarios/test.json', 'utf8')) as {
      name: string;
      assets: unknown;
      battle: unknown;
    };
    expect(scenario.name).toBe('test');
    const bundle = normalizeBundle(scenario.assets);
    expect(bundle.problems).toEqual([]);
    const battle = parseBattle(scenario.battle);
    expect(battle.units.length).toBeGreaterThan(5);
    expect(battle.board.lights.length).toBeGreaterThanOrEqual(2);
    expect(battle.turn.started).toBe(false);
    for (const u of battle.units) {
      if (u.kind === 'entity') expect(bundle.party[u.sourceName]).toBeDefined();
      if (u.kind === 'enemy') expect(bundle.enemies[u.templateStem]).toBeDefined();
    }
    // every referenced spell exists in the inline assets
    for (const u of battle.units)
      if (u.kind === 'entity') for (const s of u.sheet.knownSpells) expect(bundle.spells[s], s).toBeDefined();
  });
});
