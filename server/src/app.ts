import { Hono } from 'hono';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { BATTLES_DIR, PathError, SAVES_DIR, SCENARIOS_DIR, resolveSavesPath, safeName } from './paths.ts';
import { listJsonStems, readJsonFolder, readText, writeJsonAtomic } from './files.ts';

/**
 * JSON API over the repo-root saves/ folder. The web app loads every asset
 * through /api/assets at startup and writes party sheets / battles / prefs
 * back through PUT endpoints. Static serving of dist/ is added by index.ts.
 */
export function createApp(): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof PathError) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true, savesDir: SAVES_DIR, time: new Date().toISOString() }));

  /** Every asset file as raw JSON, grouped by folder and keyed by file stem. */
  app.get('/api/assets', async (c) => {
    const folder = (p: string) => readJsonFolder(join(SAVES_DIR, p));
    const single = async (name: string) => {
      const text = await readText(join(SAVES_DIR, name));
      return text === null ? null : (JSON.parse(text) as unknown);
    };
    const bundle = {
      party: await folder('entities/party'),
      nonparty: await folder('entities/nonparty'),
      enemies: await folder('entities/enemies'),
      weapons: await folder('items/weapons'),
      accessories: await folder('items/accessories'),
      consumables: await folder('items/consumables'),
      ammunition: await folder('items/ammunition'),
      crafting: await folder('items/crafting'),
      keyitems: await folder('items/keyitems'),
      spells: await folder('spells'),
      terrain: await folder('terrain'),
      gridshapes: await folder('gridshapes'),
      partyList: (await single('party.json')) ?? [],
      uiPrefs: (await single('ui_prefs.json')) ?? {},
      enemyTags: (await single('enemy_tags.json')) ?? [],
    };
    return c.json(bundle);
  });

  app.get('/api/files/*', async (c) => {
    const rel = c.req.path.slice('/api/files/'.length);
    const abs = resolveSavesPath(decodeURIComponent(rel));
    const text = await readText(abs);
    if (text === null) return c.json({ error: 'not found' }, 404);
    return c.body(text, 200, { 'content-type': 'application/json; charset=utf-8' });
  });

  app.put('/api/files/*', async (c) => {
    const rel = c.req.path.slice('/api/files/'.length);
    const abs = resolveSavesPath(decodeURIComponent(rel));
    const text = await c.req.text();
    JSON.parse(text); // must be valid JSON; throws -> 500 handled below as 400
    await writeJsonAtomic(abs, text);
    return c.json({ ok: true, path: rel });
  });

  app.delete('/api/files/*', async (c) => {
    const rel = c.req.path.slice('/api/files/'.length);
    const abs = resolveSavesPath(decodeURIComponent(rel));
    await fs.rm(abs, { force: true });
    return c.json({ ok: true, path: rel });
  });

  app.get('/api/battles', async (c) => c.json({ names: await listJsonStems(BATTLES_DIR) }));
  app.get('/api/battles/:name', async (c) => {
    const text = await readText(join(BATTLES_DIR, safeName(c.req.param('name')) + '.json'));
    if (text === null) return c.json({ error: 'not found' }, 404);
    return c.body(text, 200, { 'content-type': 'application/json; charset=utf-8' });
  });
  app.put('/api/battles/:name', async (c) => {
    const name = safeName(c.req.param('name'));
    const text = await c.req.text();
    JSON.parse(text);
    await writeJsonAtomic(join(BATTLES_DIR, name + '.json'), text);
    return c.json({ ok: true, name });
  });
  app.delete('/api/battles/:name', async (c) => {
    const name = safeName(c.req.param('name'));
    await fs.rm(join(BATTLES_DIR, name + '.json'), { force: true });
    return c.json({ ok: true, name });
  });

  app.get('/api/scenarios', async (c) => c.json({ names: await listJsonStems(SCENARIOS_DIR) }));
  app.get('/api/scenarios/:name', async (c) => {
    const text = await readText(join(SCENARIOS_DIR, safeName(c.req.param('name')) + '.json'));
    if (text === null) return c.json({ error: 'not found' }, 404);
    return c.body(text, 200, { 'content-type': 'application/json; charset=utf-8' });
  });

  // Reserved for the player-window relay (Phase 2 uses BroadcastChannel in-browser).
  app.get('/ws', (c) => c.json({ error: 'websocket relay not enabled yet' }, 501));

  return app;
}
