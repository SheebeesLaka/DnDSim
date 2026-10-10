import { resolve, sep, relative, isAbsolute } from 'node:path';

/** Repo root = parent of server/ (process.cwd() when started via npm scripts). */
export const ROOT = resolve(process.cwd());
export const SAVES_DIR = resolve(ROOT, 'saves');
export const SCENARIOS_DIR = resolve(ROOT, 'scenarios');
export const BATTLES_DIR = resolve(SAVES_DIR, 'battles');
export const DIST_DIR = resolve(ROOT, 'dist');

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

/** Resolve a saves/-relative path, refusing traversal and non-whitelisted locations. */
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
  return abs;
}

/** A battle/scenario name is a single path segment of safe characters. */
export function safeName(name: string): string {
  const n = name.trim();
  if (!/^[A-Za-z0-9 _.()-]{1,80}$/.test(n) || n.includes('..')) throw new PathError('invalid name');
  return n;
}
