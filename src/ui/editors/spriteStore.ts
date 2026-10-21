/** The editors' shared sprite library, and the server's sprite list and upload. */
import { SpriteLibrary } from '../sprites/library.ts';

/** Where an upload lands: resources/sprites/<folder>/. */
export type SpriteFolder = 'party' | 'enemies' | 'terrain';

let shared: SpriteLibrary | null = null;
export const spriteLibrary = (): SpriteLibrary => (shared ??= new SpriteLibrary());

export async function listSprites(): Promise<string[]> {
  const res = await fetch('/api/sprites');
  if (!res.ok) return [];
  return ((await res.json()) as { paths: string[] }).paths;
}

/** Copy a file into resources/sprites/<folder>/ (never replacing art: a clash becomes name_2.png). */
export async function uploadSprite(folder: SpriteFolder, file: File): Promise<string> {
  const res = await fetch(`/api/sprites/${folder}/${encodeURIComponent(file.name)}`, {
    method: 'PUT',
    body: file,
  });
  const body = (await res.json()) as { path?: string; error?: string };
  if (!res.ok || !body.path) throw new Error(body.error ?? `${res.status}`);
  return body.path;
}
