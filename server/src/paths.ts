import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, sep, relative, isAbsolute } from 'node:path';

/** Repo root = parent of server/ (process.cwd() when started via npm scripts). */
export const ROOT = resolve(process.cwd());
/** Authored game content (enemies, items, spells, terrain, grid shapes): tracked in git. */
export const SAVES_DIR = resolve(ROOT, 'saves');
/**
 * Campaign state that changes during play (character sheets with their current
 * HP, slots and statuses, the party list, UI prefs, saved battles): kept out of
 * git. Defaults to campaign/ in the project; DNDSIM_CAMPAIGN_DIR points it
 * anywhere (absolute, or relative to the project), e.g. a synced cloud folder.
 */
export const CAMPAIGN_DIR = resolve(ROOT, process.env.DNDSIM_CAMPAIGN_DIR || 'campaign');
/** The starting campaign (tracked): copied into CAMPAIGN_DIR for anything it doesn't have yet. */
export const CAMPAIGN_SEED_DIR = resolve(ROOT, 'campaign.example');
export const SCENARIOS_DIR = resolve(ROOT, 'scenarios');
export const BATTLES_DIR = resolve(CAMPAIGN_DIR, 'battles');

/** saves-relative locations (files or folders) that live in the campaign folder, not saves/. */
export const CAMPAIGN_ENTRIES = [
  'entities/party',
  'entities/nonparty',
  'party.json',
  'ui_prefs.json',
  'battles',
] as const;

/** Is a saves-relative (posix) path campaign state rather than authored content? */
export const isCampaignPath = (posix: string): boolean =>
  CAMPAIGN_ENTRIES.some((e) => posix === e || posix.startsWith(e + '/'));

/** The folder a saves-relative path lives in: the campaign folder or saves/. */
export const baseDirFor = (posix: string): string => (isCampaignPath(posix) ? CAMPAIGN_DIR : SAVES_DIR);

/**
 * First run (or a new campaign folder): copy every campaign entry the folder
 * doesn't have yet from campaign.example/. Never overwrites. Returns what it copied.
 */
export function seedCampaign(dir = CAMPAIGN_DIR, seed = CAMPAIGN_SEED_DIR): string[] {
  const copied: string[] = [];
  mkdirSync(dir, { recursive: true });
  for (const entry of CAMPAIGN_ENTRIES) {
    const from = resolve(seed, entry);
    const to = resolve(dir, entry);
    if (existsSync(to) || !existsSync(from)) continue;
    cpSync(from, to, { recursive: true, errorOnExist: false, force: false });
    copied.push(entry);
  }
  return copied;
}
export const DIST_DIR = resolve(ROOT, 'dist');
/**
 * Sprite folders, searched in order: new art goes in resources/sprites/ at the
 * repo root; the legacy sheets stay with the Java app and are still served.
 */
export const SPRITES_DIRS = [
  resolve(ROOT, 'resources', 'sprites'),
  resolve(ROOT, 'legacy-java', 'resources', 'sprites'),
];
export const SPRITE_EXTENSIONS = ['.png', '.gif', '.webp', '.jpg', '.jpeg'] as const;

/**
 * Sub-folders of saves/ the file API may touch. Anything else is refused, and
 * every path is normalised and checked to stay inside the whitelisted folder.
 */
export const WRITABLE_PREFIXES = [
  'entities/party',
  'entities/enemies',
  'entities/nonparty',
  'items/weapons',
  'items/accessories',
  'items/consumables',
  'items/ammunition',
  'items/crafting',
  'items/keyitems',
  'spells',
  'terrain',
  'gridshapes',
  'battles',
] as const;

export const WRITABLE_FILES = ['party.json', 'ui_prefs.json', 'enemy_tags.json'] as const;

export class PathError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 = 400,
  ) {
    super(message);
  }
}

/**
 * Resolve a saves/-relative path, refusing traversal and non-whitelisted
 * locations. Campaign entries (character sheets, party list, prefs, battles)
 * resolve into the campaign folder; everything else into saves/.
 */
export function resolveSavesPath(rel: string): string {
  const clean = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.includes('\0')) throw new PathError('empty path');
  if (!clean.endsWith('.json')) throw new PathError('only .json files are served');
  const abs = resolve(SAVES_DIR, clean);
  const relBack = relative(SAVES_DIR, abs);
  if (relBack.startsWith('..') || isAbsolute(relBack)) throw new PathError('path escapes saves/', 403);
  const posix = relBack.split(sep).join('/');
  const isFile = (WRITABLE_FILES as readonly string[]).includes(posix);
  const inFolder = WRITABLE_PREFIXES.some(
    (p) => posix.startsWith(p + '/') && !posix.slice(p.length + 1).includes('/'),
  );
  if (!isFile && !inFolder) throw new PathError(`path not in the saves whitelist: ${posix}`, 403);
  return resolve(baseDirFor(posix), posix);
}

/** A battle/scenario name is a single path segment of safe characters. */
export function safeName(name: string): string {
  const n = name.trim();
  if (!/^[A-Za-z0-9 _.()-]{1,80}$/.test(n) || n.includes('..')) throw new PathError('invalid name');
  return n;
}

/**
 * Resolve a sprites-relative path (e.g. `party/testsprites.png`) against the
 * sprite folders, refusing traversal, hidden folders and non-image extensions.
 * Returns every candidate absolute path in search order.
 */
/** Folders the editors upload sprites into (Java copied picked images into the same ones). */
export const SPRITE_UPLOAD_FOLDERS = ['party', 'enemies', 'terrain'] as const;
export const MAX_SPRITE_BYTES = 5 * 1024 * 1024;

/**
 * Where an uploaded sprite goes: resources/sprites/<folder>/<sanitised file name>,
 * with _2, _3 … appended when that name exists in any sprite folder, so an upload
 * never overwrites or shadows existing art.
 */
export function spriteUploadTarget(
  folder: string,
  fileName: string,
  exists: (abs: string) => boolean = () => false,
): { abs: string; rel: string } {
  if (!(SPRITE_UPLOAD_FOLDERS as readonly string[]).includes(folder))
    throw new PathError(`sprites can be uploaded to ${SPRITE_UPLOAD_FOLDERS.join(', ')} only`, 403);
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
  if (!(SPRITE_EXTENSIONS as readonly string[]).includes(ext))
    throw new PathError('only image files are accepted');
  const stem =
    fileName
      .slice(0, dot)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/^_+/, '') || 'sprite';
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${stem}${ext}` : `${stem}_${n}${ext}`;
    if (SPRITES_DIRS.some((d) => exists(resolve(d, folder, name)))) continue;
    return { abs: resolve(SPRITES_DIRS[0] as string, folder, name), rel: `${folder}/${name}` };
  }
}

export function resolveSpritePaths(rel: string): string[] {
  const clean = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.includes('\0')) throw new PathError('empty path');
  const lower = clean.toLowerCase();
  if (!SPRITE_EXTENSIONS.some((ext) => lower.endsWith(ext)))
    throw new PathError('only image files are served');
  if (clean.split('/').some((seg) => seg === '' || seg === '.' || seg === '..' || seg.startsWith('_')))
    throw new PathError('path escapes sprites/', 403);
  return SPRITES_DIRS.map((dir) => {
    const abs = resolve(dir, clean);
    const relBack = relative(dir, abs);
    if (relBack.startsWith('..') || isAbsolute(relBack)) throw new PathError('path escapes sprites/', 403);
    return abs;
  });
}
