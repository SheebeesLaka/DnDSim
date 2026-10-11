import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { promises as fs } from 'node:fs';
import { existsSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import {
  BATTLES_DIR,
  PathError,
  SAVES_DIR,
  SCENARIOS_DIR,
  resolveSavesPath,
  MAX_SPRITE_BYTES,
  SPRITES_DIRS,
  SPRITE_EXTENSIONS,
  resolveSpritePaths,
  safeName,
  spriteUploadTarget,
} from './paths.ts';
import { listJsonStems, readJsonFolder, readText, writeJsonAtomic } from './files.ts';
import type { Presence } from './presence.ts';

/**
 * JSON API over the repo-root saves/ folder. The web app loads every asset
 * through /api/assets at startup and writes party sheets / battles / prefs
 * back through PUT endpoints. Static serving of dist/ is added by index.ts.
 */
export function createApp(opts: { presence?: Presence } = {}): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof PathError) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true, savesDir: SAVES_DIR, time: new Date().toISOString() }));

  /** Held open by every built app window, so `npm start` knows when the last one closes. */
  app.get('/api/presence', (c) =>
    streamSSE(c, async (stream) => {
      const release = opts.presence?.connect() ?? (() => {});
      stream.onAbort(release);
      try {
        await stream.writeSSE({ event: 'hello', data: 'ok' });
        while (!stream.aborted) {
          await stream.sleep(25_000);
          if (!stream.aborted) await stream.writeSSE({ event: 'ping', data: 'ok' });
        }
      } finally {
        release();
      }
    }),
  );

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

  /** Every sprite image the app can show, as sprites-relative paths (picker list). */
  app.get('/api/sprites', async (c) => {
    const found = new Set<string>();
    const walk = async (dir: string, rel: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(join(dir, e.name), childRel);
        else if ((SPRITE_EXTENSIONS as readonly string[]).some((x) => e.name.toLowerCase().endsWith(x)))
          found.add(childRel);
      }
    };
    for (const dir of SPRITES_DIRS) await walk(dir, '');
    return c.json({ paths: [...found].sort() });
  });

  /** Upload a picked image (Java copied it into resources/sprites/<folder>/). */
  app.put('/api/sprites/:folder/:file', async (c) => {
    const target = spriteUploadTarget(
      c.req.param('folder'),
      decodeURIComponent(c.req.param('file')),
      existsSync,
    );
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0) throw new PathError('empty upload');
    if (bytes.length > MAX_SPRITE_BYTES) throw new PathError('sprite larger than 5 MB');
    await fs.mkdir(join(target.abs, '..'), { recursive: true });
    await fs.writeFile(target.abs, bytes);
    return c.json({ ok: true, path: target.rel });
  });

  /** Sprite art (sheets and single images); revalidated so a re-uploaded image shows at once. */
  app.get('/api/sprites/*', async (c) => {
    const rel = c.req.path.slice('/api/sprites/'.length);
    const candidates = resolveSpritePaths(decodeURIComponent(rel));
    for (const abs of candidates) {
      let bytes: Buffer;
      try {
        bytes = await fs.readFile(abs);
      } catch (err) {
        if (
          (err as NodeJS.ErrnoException).code === 'ENOENT' ||
          (err as NodeJS.ErrnoException).code === 'EISDIR'
        )
          continue;
        throw err;
      }
      const ext = abs.slice(abs.lastIndexOf('.') + 1).toLowerCase();
      const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      return c.body(new Uint8Array(bytes), 200, {
        'content-type': type,
        'cache-control': 'no-cache',
      });
    }
    return c.json({ error: 'not found' }, 404);
  });

  // Reserved for the player-window relay (Phase 2 uses BroadcastChannel in-browser).
  app.get('/ws', (c) => c.json({ error: 'websocket relay not enabled yet' }, 501));

  return app;
}
