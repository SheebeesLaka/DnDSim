/**
 * List logic of the Character Sheets screen (UI/CharacterSheetView.java):
 * the character group chips and the enemy browser's search / tag filter /
 * sort / grouping / summary line. DOM-free.
 */
import type { CharGroup, CharSheetDef, EnemyDef } from '../assets/types.ts';

// ---------------------------------------------------------------- characters

export type GroupKey = 'ALL' | CharGroup;
export const GROUP_KEYS: GroupKey[] = ['ALL', 'OMEGA', 'ALPHA', 'NPC'];
export const DEFAULT_GROUP_PREF = 'characterSheets.defaultGroup';

/** CharSheet.groupLabel. */
export function groupLabel(group: CharGroup | null): string {
  switch (group) {
    case null:
      return 'Ungrouped';
    case 'OMEGA':
      return 'Group Ω';
    case 'ALPHA':
      return 'Group α';
    case 'NPC':
      return 'NPC';
  }
}

/** Chip text with live counts, e.g. "Group Ω (3)". */
export function groupChipLabel(key: GroupKey, sheets: readonly CharSheetDef[]): string {
  const count = key === 'ALL' ? sheets.length : sheets.filter((s) => s.group === key).length;
  return `${key === 'ALL' ? 'All' : groupLabel(key)} (${count})`;
}

export const sheetsInGroup = (sheets: readonly CharSheetDef[], key: GroupKey): CharSheetDef[] =>
  [...(key === 'ALL' ? sheets : sheets.filter((s) => s.group === key))].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

/** The list row's second line: the class, or "Level N" without one. */
export const sheetSubtitle = (s: CharSheetDef): string =>
  s.characterClass && s.characterClass !== 'None' ? s.characterClass : `Level ${Math.max(1, s.level)}`;

/** The pinned default tab (ui_prefs characterSheets.defaultGroup), or null. */
export function pinnedGroup(prefs: Record<string, string>): GroupKey | null {
  const v = prefs[DEFAULT_GROUP_PREF];
  return v && (GROUP_KEYS as string[]).includes(v) ? (v as GroupKey) : null;
}

// ------------------------------------------------------------------- enemies

export const PREDEFINED_TAGS = [
  'Boss',
  'Beast',
  'Undead',
  'Humanoid',
  'Dragon',
  'Construct',
  'Elemental',
] as const;
export type EnemySort = 'Name' | 'HP' | 'AC' | 'Initiative';

/** Enemy.getAC for a template: 0 or less means the legacy default 10. */
export const templateAC = (e: EnemyDef): number => (e.armorClass <= 0 ? 10 : e.armorClass);
/** Enemy.getInitiative for a template: its dexterity. */
export const templateInitiative = (e: EnemyDef): number => e.dexterity;

/** Filter chips: predefined, then registered custom tags, then any tag in use. */
export function allEnemyTags(enemies: readonly EnemyDef[], custom: readonly string[]): string[] {
  const out = new Set<string>(PREDEFINED_TAGS);
  for (const t of custom) out.add(t);
  for (const e of enemies) for (const t of e.tags) out.add(t);
  return [...out];
}

export interface EnemyQuery {
  search: string;
  /** OR semantics: an enemy with any active tag passes */
  tags: ReadonlySet<string>;
  sort: EnemySort;
  ascending: boolean;
}

export function filterSortEnemies(enemies: readonly EnemyDef[], q: EnemyQuery): EnemyDef[] {
  const needle = q.search.trim().toLowerCase();
  const out = enemies.filter(
    (e) =>
      (needle === '' || e.name.toLowerCase().includes(needle)) &&
      (q.tags.size === 0 || e.tags.some((t) => q.tags.has(t))),
  );
  const key: (e: EnemyDef) => number | string =
    q.sort === 'HP'
      ? (e) => e.maxHealth
      : q.sort === 'AC'
        ? templateAC
        : q.sort === 'Initiative'
          ? templateInitiative
          : (e) => e.name.toLowerCase();
  const cmp = (a: EnemyDef, b: EnemyDef): number => {
    const ka = key(a),
      kb = key(b);
    return typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb));
  };
  return out.sort((a, b) => (q.ascending ? cmp(a, b) : -cmp(a, b)));
}

/** "N enemies  •  avg HP X  •  avg AC Y" (or the empty-state lines). */
export function enemySummary(filtered: readonly EnemyDef[], total: number): string {
  if (filtered.length === 0) return total === 0 ? 'No enemies yet.' : 'No enemies match the current filters.';
  const avg = (f: (e: EnemyDef) => number) =>
    Math.round(filtered.reduce((a, e) => a + f(e), 0) / filtered.length);
  return `${filtered.length} enemies  •  avg HP ${avg((e) => e.maxHealth)}  •  avg AC ${avg(templateAC)}`;
}

/**
 * Without a tag filter, cards group under their first tag with "Untagged" first
 * (only when there is more than one group); otherwise one flat group.
 */
export function groupEnemies(
  filtered: readonly EnemyDef[],
  tagFilterActive: boolean,
): { label: string | null; enemies: EnemyDef[] }[] {
  if (filtered.length === 0) return [];
  if (!tagFilterActive) {
    const groups = new Map<string, EnemyDef[]>();
    for (const e of filtered) {
      const g = e.tags[0] ?? 'Untagged';
      const list = groups.get(g) ?? [];
      list.push(e);
      groups.set(g, list);
    }
    if (groups.size > 1) {
      const out: { label: string | null; enemies: EnemyDef[] }[] = [];
      const untagged = groups.get('Untagged');
      if (untagged) out.push({ label: 'Untagged', enemies: untagged });
      for (const [label, enemies] of groups) if (label !== 'Untagged') out.push({ label, enemies });
      return out;
    }
  }
  return [{ label: null, enemies: [...filtered] }];
}
