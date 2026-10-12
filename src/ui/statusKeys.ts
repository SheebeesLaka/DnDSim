/**
 * One status → one art key, shared by the emblems (DOM) and the board effects
 * (three.js), so "Burning" is always a flame in both places. Names are matched
 * loosely so homebrew statuses ("Scorched", "Frostbitten") pick sensible art.
 */
export type StatusFamily = 'buff' | 'debuff' | 'dot' | 'neutral' | 'event';

export type StatusArtKey =
  | 'blessed'
  | 'burning'
  | 'chilled'
  | 'illuminated'
  | 'shield'
  | 'held'
  | 'poison'
  | 'stun'
  | 'prone'
  | 'fear'
  | 'invisible'
  | 'regen'
  | 'readied'
  | 'delay'
  | 'up'
  | 'down'
  | 'arrival'
  | 'dot';

const RULES: [RegExp, StatusArtKey][] = [
  [/bless|inspir|\baid\b|heroism|guidance/, 'blessed'],
  [/burn|fire|flame|ignit|scorch|smould/, 'burning'],
  [/chill|frost|cold|freez|\bice\b|icy|slow/, 'chilled'],
  [/illumin|faerie|marked|guiding|glow|reveal/, 'illuminated'],
  [/shield|ward|protect|armou?r|barkskin|sanctuary/, 'shield'],
  [/held|hold|paraly|restrain|grappl|root|entangl/, 'held'],
  [/poison|venom|toxic|acid/, 'poison'],
  [/stun|daze|shock/, 'stun'],
  [/prone|knock/, 'prone'],
  [/fear|fright|terr/, 'fear'],
  [/invis|hidden|hide|stealth/, 'invisible'],
  [/regen|heal|rejuv/, 'regen'],
  [/readied|ready/, 'readied'],
  [/delay/, 'delay'],
];

export function statusArtKey(name: string, family: StatusFamily): StatusArtKey {
  const n = name.toLowerCase();
  for (const [re, key] of RULES) if (re.test(n)) return key;
  return family === 'buff' ? 'up' : family === 'debuff' ? 'down' : family === 'event' ? 'arrival' : 'dot';
}

/** Family colours for effects that have no art of their own (generic auras). */
export const FAMILY_COLOR: Record<StatusFamily, string> = {
  buff: '#ffd76a',
  debuff: '#b89cff',
  dot: '#ff9a4a',
  neutral: '#9fc3d9',
  event: '#ff8a7a',
};
