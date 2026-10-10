/** UI/PlayerDisplayOptions.java: what the player window may show (R13.5). Stored as strings in ui_prefs. */
export type EnemyHpMode = 'EXACT' | 'VAGUE' | 'HIDDEN';

export interface PlayerDisplayOptions {
  enemyHp: EnemyHpMode;
  partyHpNumbers: boolean;
  combatNumbers: boolean;
  statusText: boolean;
  enemyInitiativeRolls: boolean;
  enemyNames: boolean;
  turnStrip: boolean;
  spellTemplates: boolean;
}

export const DEFAULT_DISPLAY_OPTIONS: Readonly<PlayerDisplayOptions> = Object.freeze({
  enemyHp: 'EXACT',
  partyHpNumbers: true,
  combatNumbers: true,
  statusText: true,
  enemyInitiativeRolls: false,
  enemyNames: true,
  turnStrip: true,
  spellTemplates: false,
});

export const DISPLAY_PREF_PREFIX = 'display.player.';

const flag = (prefs: Record<string, string>, key: string, dflt: boolean): boolean => {
  const v = prefs[DISPLAY_PREF_PREFIX + key];
  return v === undefined ? dflt : v === 'true';
};

/** PlayerDisplayOptions getters: unknown enemyHp values fall back to EXACT. */
export function displayOptionsFromPrefs(prefs: Record<string, string>): PlayerDisplayOptions {
  const raw = prefs[DISPLAY_PREF_PREFIX + 'enemyHp'];
  const enemyHp: EnemyHpMode = raw === 'VAGUE' || raw === 'HIDDEN' ? raw : 'EXACT';
  const d = DEFAULT_DISPLAY_OPTIONS;
  return {
    enemyHp,
    partyHpNumbers: flag(prefs, 'partyHpNumbers', d.partyHpNumbers),
    combatNumbers: flag(prefs, 'combatNumbers', d.combatNumbers),
    statusText: flag(prefs, 'statusText', d.statusText),
    enemyInitiativeRolls: flag(prefs, 'enemyInitiativeRolls', d.enemyInitiativeRolls),
    enemyNames: flag(prefs, 'enemyNames', d.enemyNames),
    turnStrip: flag(prefs, 'turnStrip', d.turnStrip),
    spellTemplates: flag(prefs, 'spellTemplates', d.spellTemplates),
  };
}

export function displayOptionsToPrefs(opts: PlayerDisplayOptions): Record<string, string> {
  return {
    [DISPLAY_PREF_PREFIX + 'enemyHp']: opts.enemyHp,
    [DISPLAY_PREF_PREFIX + 'partyHpNumbers']: String(opts.partyHpNumbers),
    [DISPLAY_PREF_PREFIX + 'combatNumbers']: String(opts.combatNumbers),
    [DISPLAY_PREF_PREFIX + 'statusText']: String(opts.statusText),
    [DISPLAY_PREF_PREFIX + 'enemyInitiativeRolls']: String(opts.enemyInitiativeRolls),
    [DISPLAY_PREF_PREFIX + 'enemyNames']: String(opts.enemyNames),
    [DISPLAY_PREF_PREFIX + 'turnStrip']: String(opts.turnStrip),
    [DISPLAY_PREF_PREFIX + 'spellTemplates']: String(opts.spellTemplates),
  };
}

/** PlayerDisplayOptions.playerText + the canvas's Crit! rule: null = show nothing. */
export function playerText(
  text: string,
  kind: 'DAMAGE' | 'HEAL' | 'STATUS' | 'INITIATIVE' | 'OTHER',
  color: string,
  opts: PlayerDisplayOptions,
): string | null {
  switch (kind) {
    case 'DAMAGE':
      if (opts.combatNumbers || !/^-\d+$/.test(text)) return text;
      return color.toUpperCase() === '#FFD700' ? 'Crit!' : 'Hit!';
    case 'HEAL':
      return opts.combatNumbers || !/^\+\d+$/.test(text) ? text : 'Healed';
    case 'STATUS':
      return opts.statusText ? text : null;
    case 'INITIATIVE':
      return opts.enemyInitiativeRolls ? text : null;
    case 'OTHER':
      return text;
  }
}
