/**
 * File-name sanitisers, one per legacy save type (FEATURES.md R15.2).
 * These must match Java byte-for-byte so the web app rewrites the same files.
 */

/** `name.replaceAll("[^a-zA-Z0-9]", "_")` — party sheets, items, spells, terrain, grid presets. */
export function javaStem(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

/** Objects/Enemy.sanitizeFileName: Windows-illegal chars → `_`, trailing dots/spaces removed. */
export function enemyStem(baseName: string): string {
  // eslint-disable-next-line no-control-regex -- Java's regex includes the C0 control range
  const illegal = /[<>:"/\\|?*\x00-\x1F]/g;
  const sanitized = baseName
    .replace(illegal, '_')
    .replace(/[.\s]+$/, '')
    .trim();
  return sanitized === '' ? 'Unnamed_Enemy' : sanitized;
}

export const SAVE_PATHS = {
  party: (name: string) => `entities/party/${javaStem(name)}.json`,
  nonparty: (name: string) => `entities/nonparty/${javaStem(name)}.json`,
  enemy: (baseName: string) => `entities/enemies/${enemyStem(baseName)}.json`,
  weapon: (name: string) => `items/weapons/${javaStem(name)}.json`,
  accessory: (name: string) => `items/accessories/${javaStem(name)}.json`,
  consumable: (name: string) => `items/consumables/${javaStem(name)}.json`,
  ammunition: (name: string) => `items/ammunition/${javaStem(name)}.json`,
  crafting: (name: string) => `items/crafting/${javaStem(name)}.json`,
  keyitem: (name: string) => `items/keyitems/${javaStem(name)}.json`,
  spell: (name: string) => `spells/${javaStem(name)}.json`,
  terrain: (type: string) => `terrain/${javaStem(type)}.json`,
  gridshape: (name: string) => `gridshapes/${javaStem(name)}.json`,
  partyList: () => 'party.json',
  uiPrefs: () => 'ui_prefs.json',
  enemyTags: () => 'enemy_tags.json',
} as const;
