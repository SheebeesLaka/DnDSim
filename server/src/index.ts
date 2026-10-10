import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { createApp } from './app.ts';
import { DIST_DIR } from './paths.ts';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
const app = createApp();

if (existsSync(DIST_DIR)) {
  // Production: serve the built app. /player resolves to player.html.
  app.get('/player', (c) => c.redirect('/player.html'));
  app.use('/*', serveStatic({ root: 'dist' }));
  app.get('*', serveStatic({ root: 'dist', path: 'index.html' }));
}

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(
    `[dndsim] server listening on http://${host}:${info.port}  (dist ${existsSync(DIST_DIR) ? 'served' : 'absent: API only'})`,
  );
});
