import { describe, expect, it } from 'vitest';
import type { CharSheetDef, EnemyDef } from '../../src/assets/types.ts';
import {
  allEnemyTags,
  enemySummary,
  filterSortEnemies,
  groupChipLabel,
  groupEnemies,
  pinnedGroup,
  sheetSubtitle,
  sheetsInGroup,
  templateAC,
} from '../../src/editors/browsers.ts';
import { newEnemy } from '../../src/editors/defaults.ts';
import { bundle } from '../helpers/engine.ts';

const enemy = (name: string, over: Partial<EnemyDef> = {}): EnemyDef => ({ ...newEnemy(), name, ...over });

describe('character list', () => {
  const sheets = (): CharSheetDef[] => Object.values(bundle().party);

  it('group chips count members; All counts everyone', () => {
    const list = sheets().map((s, i) => ({ ...s, group: i === 0 ? ('OMEGA' as const) : s.group }));
    expect(groupChipLabel('ALL', list)).toBe(`All (${list.length})`);
    expect(groupChipLabel('OMEGA', list)).toMatch(/^Group Ω \(\d+\)$/);
    expect(groupChipLabel('NPC', [])).toBe('NPC (0)');
    expect(sheetsInGroup(list, 'OMEGA').every((s) => s.group === 'OMEGA')).toBe(true);
    const names = sheetsInGroup(list, 'ALL').map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('subtitle is the class, else "Level N"; pinned default group comes from ui_prefs', () => {
    const s = sheets()[0] as CharSheetDef;
    expect(sheetSubtitle({ ...s, characterClass: 'Medic' })).toBe('Medic');
    expect(sheetSubtitle({ ...s, characterClass: 'None', level: 4 })).toBe('Level 4');
    expect(pinnedGroup({ 'characterSheets.defaultGroup': 'ALPHA' })).toBe('ALPHA');
    expect(pinnedGroup({ 'characterSheets.defaultGroup': 'nope' })).toBeNull();
    expect(pinnedGroup({})).toBeNull();
  });
});

describe('enemy browser (CharacterSheetView.rebuildEnemyGrid)', () => {
  const list = [
    enemy('Wolf', { maxHealth: 11, armorClass: 12, dexterity: 3, tags: ['Beast'] }),
    enemy('Ghoul', { maxHealth: 22, armorClass: 0, dexterity: 1, tags: ['Undead'] }),
    enemy('bandit', { maxHealth: 16, armorClass: 14, dexterity: 2, tags: [] }),
    enemy('Dire Wolf', { maxHealth: 37, armorClass: 14, dexterity: 2, tags: ['Beast', 'Boss'] }),
  ];
  const q = { search: '', tags: new Set<string>(), sort: 'Name' as const, ascending: true };

  it('searches names case-insensitively and filters tags with OR', () => {
    expect(filterSortEnemies(list, { ...q, search: 'WOLF' }).map((e) => e.name)).toEqual([
      'Dire Wolf',
      'Wolf',
    ]);
    expect(filterSortEnemies(list, { ...q, tags: new Set(['Boss', 'Undead']) }).map((e) => e.name)).toEqual([
      'Dire Wolf',
      'Ghoul',
    ]);
  });

  it('sorts by name (case-insensitive), HP, AC (0 counts as 10) and initiative, either way', () => {
    expect(filterSortEnemies(list, q).map((e) => e.name)).toEqual(['bandit', 'Dire Wolf', 'Ghoul', 'Wolf']);
    expect(filterSortEnemies(list, { ...q, sort: 'HP', ascending: false }).map((e) => e.maxHealth)).toEqual([
      37, 22, 16, 11,
    ]);
    expect(filterSortEnemies(list, { ...q, sort: 'AC' }).map(templateAC)).toEqual([10, 12, 14, 14]);
    expect(filterSortEnemies(list, { ...q, sort: 'Initiative' }).map((e) => e.dexterity)).toEqual([
      1, 2, 2, 3,
    ]);
  });

  it('summary line and empty states', () => {
    expect(enemySummary(list, 4)).toBe('4 enemies  •  avg HP 22  •  avg AC 13');
    expect(enemySummary([], 0)).toBe('No enemies yet.');
    expect(enemySummary([], 4)).toBe('No enemies match the current filters.');
  });

  it('groups by first tag with Untagged first, only when unfiltered and there is more than one group', () => {
    const sorted = filterSortEnemies(list, q);
    expect(groupEnemies(sorted, false).map((g) => [g.label, g.enemies.map((e) => e.name)])).toEqual([
      ['Untagged', ['bandit']],
      ['Beast', ['Dire Wolf', 'Wolf']],
      ['Undead', ['Ghoul']],
    ]);
    expect(groupEnemies(sorted, true)).toEqual([{ label: null, enemies: sorted }]);
    const oneGroup = [list[0] as EnemyDef];
    expect(groupEnemies(oneGroup, false)).toEqual([{ label: null, enemies: oneGroup }]);
    expect(groupEnemies([], false)).toEqual([]);
  });

  it('tag chips: predefined first, then custom, then tags in use', () => {
    expect(allEnemyTags(list, ['Flying'])).toEqual([
      'Boss',
      'Beast',
      'Undead',
      'Humanoid',
      'Dragon',
      'Construct',
      'Elemental',
      'Flying',
    ]);
    expect(allEnemyTags([enemy('X', { tags: ['Aquatic'] })], [])).toContain('Aquatic');
  });
});
