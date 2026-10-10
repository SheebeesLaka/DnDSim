import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/src/app.ts';
import { resolveSavesPath, resolveSpritePaths } from '../../server/src/paths.ts';

const app = createApp();

describe('server api', () => {
  it('reports health', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });

  it('bundles every saves/ folder keyed by file stem', async () => {
    const res = await app.request('/api/assets');
    expect(res.status).toBe(200);
    const bundle = (await res.json()) as Record<string, Record<string, unknown>>;
    expect(Object.keys(bundle.enemies ?? {})).toHaveLength(18);
    expect(Object.keys(bundle.spells ?? {})).toHaveLength(16);
    expect(Object.keys(bundle.party ?? {})).toContain('Henry_Keaton');
    expect(bundle.partyList).toEqual(['Grand Wizard Man']);
  });

  it('serves sprite art read-only from the sprite folders', async () => {
    const res = await app.request('/api/sprites/party/testsprites.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]); // "PNG"
    expect((await app.request('/api/sprites/party/missing.png')).status).toBe(404);
    expect((await app.request('/api/sprites/terrain/_source/tree_sheet.png')).status).toBe(403);
    expect((await app.request('/api/sprites/party/testsprites.txt')).status).toBe(400);
    expect(() => resolveSpritePaths('../package.json')).toThrow();
    expect(() => resolveSpritePaths('party/../../x.png')).toThrow(/escapes/);
    expect(resolveSpritePaths('party/testsprites.png')).toHaveLength(2);
    expect((await app.request('/api/sprites/party/testsprites.png', { method: 'PUT' })).status).toBe(404);
  });

  it('refuses traversal and non-whitelisted paths', async () => {
    // Hono normalises dot segments before routing (404); the guard itself is tested below.
    expect((await app.request('/api/files/%2E%2E/package.json')).status).toBeGreaterThanOrEqual(403);
    expect(
      (await app.request('/api/files/entities/party/%2E%2E/%2E%2E/package.json')).status,
    ).toBeGreaterThanOrEqual(403);
    expect(() => resolveSavesPath('../package.json')).toThrow(/escapes/);
    expect(() => resolveSavesPath('entities/party/../../package.json')).toThrow(/escapes|whitelist/);
    expect(() => resolveSavesPath('entities\\party\\..\\..\\x.json')).toThrow(/escapes|whitelist/);
    expect(resolveSavesPath('entities/party/Henry_Keaton.json')).toMatch(
      /saves[\\/]entities[\\/]party[\\/]Henry_Keaton\.json$/,
    );
    expect((await app.request('/api/files/secret/x.json')).status).toBe(403);
    expect((await app.request('/api/files/entities/party/deep/x.json')).status).toBe(403);
    expect((await app.request('/api/files/entities/party/x.txt')).status).toBe(400);
  });

  it('serves a whitelisted file and 404s a missing one', async () => {
    const ok = await app.request('/api/files/entities/party/Henry_Keaton.json');
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { name: string }).name).toBe('Henry Keaton');
    expect((await app.request('/api/files/entities/party/Nobody.json')).status).toBe(404);
  });

  it('validates battle names', async () => {
    expect((await app.request('/api/battles/a..b')).status).toBe(400);
    expect((await app.request('/api/battles/nope%2Fx')).status).toBe(400);
  });
});
