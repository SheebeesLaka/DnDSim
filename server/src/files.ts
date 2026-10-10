import { promises as fs } from 'node:fs';
import { dirname, join, basename, extname } from 'node:path';
import { randomBytes } from 'node:crypto';

/** Atomic write: temp file in the same directory, then rename over the target. */
export async function writeJsonAtomic(absPath: string, text: string): Promise<void> {
  await fs.mkdir(dirname(absPath), { recursive: true });
  const tmp = join(dirname(absPath), `.${basename(absPath)}.${randomBytes(4).toString('hex')}.tmp`);
  await fs.writeFile(tmp, text, 'utf8');
  try {
    await fs.rename(tmp, absPath);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

export async function readText(absPath: string): Promise<string | null> {
  try {
    return await fs.readFile(absPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** All *.json files in a folder, keyed by file stem, in name order. Missing folder = {}. */
export async function readJsonFolder(absDir: string): Promise<Record<string, unknown>> {
  let names: string[];
  try {
    names = await fs.readdir(absDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  const out: Record<string, unknown> = {};
  for (const name of names.filter((n) => extname(n) === '.json').sort()) {
    const text = await fs.readFile(join(absDir, name), 'utf8');
    try {
      out[basename(name, '.json')] = JSON.parse(text) as unknown;
    } catch {
      out[basename(name, '.json')] = { __parseError: true, __raw: text };
    }
  }
  return out;
}

export async function listJsonStems(absDir: string): Promise<string[]> {
  try {
    const names = await fs.readdir(absDir);
    return names
      .filter((n) => extname(n) === '.json')
      .map((n) => basename(n, '.json'))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}
