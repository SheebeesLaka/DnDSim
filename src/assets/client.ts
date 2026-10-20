/** Browser-side access to the local saves API (server/src/app.ts). */
import { normalizeBundle } from './bundle.ts';
import type { AssetBundle } from './types.ts';

export interface AssetsLoad {
  bundle: AssetBundle;
  /** The raw payload, kept so writers can reuse each file's original key order. */
  raw: Record<string, Record<string, unknown>>;
}

async function okJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function fetchAssets(base = ''): Promise<AssetsLoad> {
  const raw = await okJson<Record<string, Record<string, unknown>>>(await fetch(`${base}/api/assets`));
  return { bundle: normalizeBundle(raw), raw };
}

export async function putFile(relPath: string, text: string, base = ''): Promise<void> {
  await okJson(
    await fetch(`${base}/api/files/${relPath.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: text,
    }),
  );
}

export async function deleteFile(relPath: string, base = ''): Promise<void> {
  await okJson(
    await fetch(`${base}/api/files/${relPath.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'DELETE',
    }),
  );
}

export async function listBattles(base = ''): Promise<string[]> {
  return (await okJson<{ names: string[] }>(await fetch(`${base}/api/battles`))).names;
}

export async function getBattle<T = unknown>(name: string, base = ''): Promise<T | null> {
  const res = await fetch(`${base}/api/battles/${encodeURIComponent(name)}`);
  if (res.status === 404) return null;
  return okJson<T>(res);
}

export async function putBattle(name: string, text: string, base = ''): Promise<void> {
  await okJson(
    await fetch(`${base}/api/battles/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: text,
    }),
  );
}

export async function getScenario<T = unknown>(name: string, base = ''): Promise<T | null> {
  const res = await fetch(`${base}/api/scenarios/${encodeURIComponent(name)}`);
  if (res.status === 404) return null;
  return okJson<T>(res);
}
