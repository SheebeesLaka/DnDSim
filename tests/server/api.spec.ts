import { existsSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/src/app.ts';
import { resolveSavesPath, resolveSpritePaths, seedCampaign } from '../../server/src/paths.ts';

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
    expect(resolveSpritePaths('party/testsprites.png')).toHaveLength(1);
    // an empty upload is refused; a real one never replaces existing art (see the upload test)
    expect((await app.request('/api/sprites/party/testsprites.png', { method: 'PUT' })).status).toBe(400);
  });

  it('lists sprites and accepts uploads into resources/sprites/<folder>/ only', async () => {
    const list = (await (await app.request('/api/sprites')).json()) as { paths: string[] };
    expect(list.paths).toContain('party/testsprites.png');
    expect(list.paths.some((p) => p.includes('_source'))).toBe(false);
    // 1x1 PNG
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==',
      ),
      (ch) => ch.charCodeAt(0),
    );
    const root = join(process.cwd(), 'resources');
    const hadRoot = existsSync(root);
    try {
      const up = await app.request('/api/sprites/terrain/zz%20test-upload.png', { method: 'PUT', body: png });
      expect(up.status).toBe(200);
      expect(((await up.json()) as { path: string }).path).toBe('terrain/zz_test-upload.png');
      expect((await app.request('/api/sprites/terrain/zz_test-upload.png')).status).toBe(200);
      expect(((await (await app.request('/api/sprites')).json()) as { paths: string[] }).paths).toContain(
        'terrain/zz_test-upload.png',
      );
      const clash = await app.request('/api/sprites/party/testsprites.png', { method: 'PUT', body: png });
      expect(((await clash.json()) as { path: string }).path).toBe('party/testsprites_2.png');
      expect((await app.request('/api/sprites/secret/x.png', { method: 'PUT', body: png })).status).toBe(403);
      expect((await app.request('/api/sprites/party/x.exe', { method: 'PUT', body: png })).status).toBe(400);
      expect(
        (await app.request('/api/sprites/party/x.png', { method: 'PUT', body: new Uint8Array(0) })).status,
      ).toBe(400);
    } finally {
      rmSync(join(root, 'sprites', 'terrain', 'zz_test-upload.png'), { force: true });
      rmSync(join(root, 'sprites', 'party', 'testsprites_2.png'), { force: true });
      if (!hadRoot) {
        for (const dir of [
          join(root, 'sprites', 'terrain'),
          join(root, 'sprites', 'party'),
          join(root, 'sprites'),
          root,
        ])
          if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
      }
    }
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
    // campaign state resolves into the campaign folder, authored content into saves/
    expect(resolveSavesPath('entities/party/Henry_Keaton.json')).toMatch(
      /vitest-campaign[\\/]entities[\\/]party[\\/]Henry_Keaton\.json$/,
    );
    expect(resolveSavesPath('party.json')).toMatch(/vitest-campaign[\\/]party\.json$/);
    expect(resolveSavesPath('entities/enemies/Dummy.json')).toMatch(
      /saves[\\/]entities[\\/]enemies[\\/]Dummy\.json$/,
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

  it('seeds a new campaign folder from campaign.example without ever overwriting it', () => {
    const dir = join(process.cwd(), 'test-results', 'seed-check');
    rmSync(dir, { recursive: true, force: true });
    try {
      expect(seedCampaign(dir)).toEqual([
        'entities/party',
        'entities/nonparty',
        'party.json',
        'ui_prefs.json',
      ]);
      expect(existsSync(join(dir, 'entities', 'party', 'Henry_Keaton.json'))).toBe(true);
      // a session changes a sheet: a later start keeps it
      writeFileSync(join(dir, 'party.json'), '["Somebody"]');
      expect(seedCampaign(dir)).toEqual([]);
      expect(readFileSync(join(dir, 'party.json'), 'utf8')).toBe('["Somebody"]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports where the campaign lives', async () => {
    const health = (await (await app.request('/api/health')).json()) as { campaignDir: string };
    expect(health.campaignDir).toMatch(/vitest-campaign$/);
  });

  it('validates battle names', async () => {
    expect((await app.request('/api/battles/a..b')).status).toBe(400);
    expect((await app.request('/api/battles/nope%2Fx')).status).toBe(400);
  });
});
