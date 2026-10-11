import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { createApp } from './app.ts';
import { DIST_DIR } from './paths.ts';
import { createPresence } from './presence.ts';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
// `npm start` sets DNDSIM_EXIT_WHEN_CLOSED: stop once every app window has been closed for a while
// (long enough for a refresh to reconnect).
const GRACE_MS = 8_000;
const presence = process.env.DNDSIM_EXIT_WHEN_CLOSED
  ? createPresence({
      graceMs: GRACE_MS,
      onIdle: () => {
        console.log('[dndsim] every window is closed: stopping the server.');
        process.exit(0);
      },
    })
  : undefined;
const app = createApp({ presence });

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
