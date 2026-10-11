/** R13.5 / R13.6: display options, enemy naming/HP, hidden highlights, darkness, templates. */
import { describe, expect, it } from 'vitest';
import { buildBoardViewModel } from '../../src/engine/view/boardViewModel.ts';
import {
  DEFAULT_DISPLAY_OPTIONS,
  displayOptionsFromPrefs,
  displayOptionsToPrefs,
  playerText,
} from '../../src/engine/view/displayOptions.ts';
import { anonymousEnemyNames, projectForPlayer } from '../../src/engine/view/playerProjection.ts';
import { combatAssets, started, run } from '../helpers/combat.ts';

describe('tombstones', () => {
  it('the DM sees every grave; players only those on a tile they can see', () => {
    const { state, c } = started();
    const s = {
      ...state,
      board: {
        ...state.board,
        graves: [
          { id: 'grave-a', r: 0, c: 0, name: 'Lit' },
          { id: 'grave-b', r: 1, c: 1, name: 'Dark' },
        ],
      },
    };
    const vm = buildBoardViewModel(
      s,
      { selectedId: null, mode: { kind: 'none' }, hover: null } as never,
      c.assets,
    );
    expect(vm.graves?.map((g) => g.name)).toEqual(['Lit', 'Dark']);
    const cells = vm.cells.map((row) =>
      row.map((cell) => ({ ...cell, light: cell.r === 1 && cell.c === 1 ? ('dark' as const) : cell.light })),
    );
    const player = projectForPlayer({ ...vm, cells }, DEFAULT_DISPLAY_OPTIONS);
    expect(player.graves?.map((g) => g.name)).toEqual(['Lit']);
  });
});

describe('display options', () => {
  it('parse from ui_prefs strings with defaults; unknown enemyHp → EXACT; round-trip', () => {
    expect(displayOptionsFromPrefs({})).toEqual(DEFAULT_DISPLAY_OPTIONS);
    const o = displayOptionsFromPrefs({
      'display.player.enemyHp': 'VAGUE',
      'display.player.enemyNames': 'false',
      'display.player.spellTemplates': 'true',
    });
    expect(o).toMatchObject({ enemyHp: 'VAGUE', enemyNames: false, spellTemplates: true, turnStrip: true });
    expect(displayOptionsFromPrefs({ 'display.player.enemyHp': 'bogus' }).enemyHp).toBe('EXACT');
    expect(displayOptionsFromPrefs(displayOptionsToPrefs(o))).toEqual(o);
  });

  it('playerText rewords or hides floating texts', () => {
    const off = {
      ...DEFAULT_DISPLAY_OPTIONS,
      combatNumbers: false,
      statusText: false,
      enemyInitiativeRolls: false,
    };
    expect(playerText('-7', 'DAMAGE', '#ff7b6b', off)).toBe('Hit!');
    expect(playerText('-7', 'DAMAGE', '#FFD700', off)).toBe('Crit!');
    expect(playerText('+5', 'HEAL', '#4CAF50', off)).toBe('Healed');
    expect(playerText('Burning', 'STATUS', '#f00', off)).toBeNull();
    expect(playerText('d20 14', 'INITIATIVE', '#6ec6ff', off)).toBeNull();
    expect(playerText('Miss', 'OTHER', '#fff', off)).toBe('Miss');
    expect(playerText('-7', 'DAMAGE', '#ff7b6b', DEFAULT_DISPLAY_OPTIONS)).toBe('-7');
    expect(
      playerText('d20 14', 'INITIATIVE', '#6ec6ff', {
        ...DEFAULT_DISPLAY_OPTIONS,
        enemyInitiativeRolls: true,
      }),
    ).toBe('d20 14');
  });
});

describe('projectForPlayer', () => {
  const assets = combatAssets();
  it('strips selection and DM highlights, renames enemies by turn order, applies HP modes, hides units in darkness', () => {
    const { state, c } = started();
    const dark = run(
      state,
      c,
      { type: 'SET_AMBIENT', level: 'dark' },
      {
        type: 'ADD_LIGHT',
        light: {
          id: 'L',
          name: 'L',
          brightRadius: 2,
          dimRadius: 3,
          color: '#fff',
          at: { r: 0, c: 0 },
          on: true,
        },
      },
      {
        type: 'ADD_LIGHT',
        light: {
          id: 'L2',
          name: 'L2',
          brightRadius: 1,
          dimRadius: 1,
          color: '#fff',
          at: { r: 4, c: 4 },
          on: true,
        },
      },
    );
    const vm = buildBoardViewModel(
      dark,
      { selectedId: 'u1', mode: { kind: 'move', unitId: 'u1' }, hover: null },
      assets,
    );
    expect(vm.highlights.move.length).toBeGreaterThan(0);
    expect(vm.units.find((u) => u.id === 'u1')?.selected).toBe(true);
    expect(vm.units.find((u) => u.id === 'u4')?.inDarkness).toBe(true);
    const hidden = projectForPlayer(
      vm,
      { ...DEFAULT_DISPLAY_OPTIONS, enemyHp: 'HIDDEN', enemyNames: false, partyHpNumbers: false },
      dark.turn.order,
    );
    expect(hidden.highlights.move).toEqual([]);
    expect(hidden.units.every((u) => !u.selected)).toBe(true);
    expect(hidden.units.some((u) => u.id === 'u4')).toBe(false); // Spider stands in the dark
    expect(hidden.units.find((u) => u.id === 'u1')).toMatchObject({
      showHpNumbers: false,
      showHpRing: true,
      ac: null,
    });
    expect(hidden.dmReveal).toBe(false);
    expect(hidden.banner).toBeNull();
    expect(hidden.view).toBe('player');
    // strip: enemies anonymous and HP hidden, initiative never shown
    const enemyRows = hidden.strip.filter((e) => e.side === 'enemy');
    expect(enemyRows.map((e) => e.name)).toEqual(['Enemy 1', 'Enemy 2'].slice(0, enemyRows.length));
    expect(enemyRows.every((e) => !e.showHpBar && !e.showHpNumbers && e.initiative === null)).toBe(true);
    const vague = projectForPlayer(vm, { ...DEFAULT_DISPLAY_OPTIONS, enemyHp: 'VAGUE' }, dark.turn.order);
    expect(vague.strip.find((e) => e.id === 'u5')).toMatchObject({
      showHpBar: true,
      showHpNumbers: false,
      name: 'Snake #1',
    });
    expect(vague.units.find((u) => u.id === 'u5')).toMatchObject({ showHpRing: true, showHpNumbers: false });
    const exact = projectForPlayer(vm, DEFAULT_DISPLAY_OPTIONS, dark.turn.order);
    expect(exact.units.find((u) => u.id === 'u5')).toMatchObject({ showHpRing: true, showHpNumbers: true });
    expect(exact.showStrip).toBe(true);
    expect(
      projectForPlayer(vm, { ...DEFAULT_DISPLAY_OPTIONS, turnStrip: false }, dark.turn.order).showStrip,
    ).toBe(false);
  });

  it('anonymous names: a lone enemy is "Enemy"; several are numbered by order', () => {
    expect([...anonymousEnemyNames(['a']).values()]).toEqual(['Enemy']);
    expect([...anonymousEnemyNames(['a', 'b']).values()]).toEqual(['Enemy 1', 'Enemy 2']);
  });

  it("the DM's area template follows the hover and reaches players only with spellTemplates on", () => {
    const { state } = started();
    const session = {
      selectedId: 'u3',
      mode: { kind: 'cast', unitId: 'u3', spellName: 'Fireball', slotLevel: 3 } as const,
      hover: { r: 3, c: 3 },
    };
    const vm = buildBoardViewModel(state, session, assets);
    expect(vm.highlights.areaTemplate).toHaveLength(13);
    expect(vm.highlights.areaUnits).toEqual(['u4', 'u5']);
    expect(projectForPlayer(vm, DEFAULT_DISPLAY_OPTIONS, state.turn.order).highlights.areaTemplate).toEqual(
      [],
    );
    const shown = projectForPlayer(
      vm,
      { ...DEFAULT_DISPLAY_OPTIONS, spellTemplates: true },
      state.turn.order,
    );
    expect(shown.highlights.areaTemplate).toHaveLength(13);
    expect(shown.highlights.areaUnits).toEqual(['u4', 'u5']);
    // single-target cast: range tint + legal targets with in-range flags (DM only)
    const single = buildBoardViewModel(
      state,
      { ...session, mode: { kind: 'cast', unitId: 'u3', spellName: 'Fire Bolt', slotLevel: 0 } },
      assets,
    );
    expect(single.highlights.castRange.length).toBeGreaterThan(0);
    expect(single.highlights.castTargets.map((t) => t.id)).toEqual(['u4', 'u5', 'u6']);
    expect(
      projectForPlayer(single, { ...DEFAULT_DISPLAY_OPTIONS, spellTemplates: true }, state.turn.order)
        .highlights.castRange,
    ).toEqual([]);
  });

  it('view model basics: strip pre-battle shows party on field; phase label; placement banner and highlights', () => {
    const c = combatAssets();
    const { state } = started(1, [], {}, c);
    const vm = buildBoardViewModel(state, { selectedId: null, mode: { kind: 'none' }, hover: null }, c);
    expect(vm.phaseLabel).toBe('Round 1');
    expect(vm.strip.filter((e) => e.current)).toHaveLength(1);
    expect(vm.units.find((u) => u.id === 'u1')).toMatchObject({
      initials: 'HK',
      side: 'party',
      hp: 20,
      maxHp: 36,
      ac: 14,
      mob: 2,
    });
    expect(vm.units.find((u) => u.id === 'u4')?.initials).toBe('SP');
  });
});
