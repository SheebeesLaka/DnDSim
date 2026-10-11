// `npm start`: build if dist/ is missing or stale, serve it on :8787, open the browser once the
// server answers, and stop by itself after every app window has been closed.
//   --build          rebuild even if dist/ looks current
//   --no-open        don't open a browser window
//   --keep-running   don't stop when the windows close (Ctrl+C stops it)
// Vite and the server run straight under node (not through npx or a shell), so Ctrl+C or the
// automatic stop ends the real process instead of leaving it holding the port and the terminal.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const isWin = process.platform === 'win32';
const port = process.env.PORT ?? '8787';
const bin = (rel) => fileURLToPath(new URL(`../node_modules/${rel}`, import.meta.url));

function newestMtime(dir) {
  let newest = 0;
  if (!existsSync(dir)) return 0;
  if (statSync(dir).isFile()) return statSync(dir).mtimeMs;
  const walk = (d) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      if (name.name === 'node_modules' || name.name === 'dist' || name.name.startsWith('.')) continue;
      const p = join(d, name.name);
      if (name.isDirectory()) walk(p);
      else newest = Math.max(newest, statSync(p).mtimeMs);
    }
  };
  walk(dir);
  return newest;
}

const distIndex = join('dist', 'index.html');
const stale =
  !existsSync(distIndex) ||
  statSync(distIndex).mtimeMs <
    Math.max(newestMtime('src'), newestMtime('index.html'), newestMtime('player.html'));
if (stale || process.argv.includes('--build')) {
  console.log('[dndsim] building…');
  const r = spawnSync(process.execPath, [bin('vite/bin/vite.js'), 'build'], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const keepRunning = process.argv.includes('--keep-running');
const server = spawn(process.execPath, [bin('tsx/dist/cli.mjs'), 'server/src/index.ts'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port, ...(keepRunning ? {} : { DNDSIM_EXIT_WHEN_CLOSED: '1' }) },
});

const stop = () => {
  if (server.exitCode === null) server.kill();
};
process.on('exit', stop);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    stop();
    process.exit(0);
  });
}
server.on('exit', (code) => process.exit(code ?? 0));

const url = `http://127.0.0.1:${port}/`;

/** Poll until the server answers, so the browser never opens on a dead port. */
async function waitForServer(timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (server.exitCode !== null) return false;
    try {
      const res = await fetch(`${url}api/health`);
      if (res.ok) return true;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

const ready = await waitForServer();
if (!ready) {
  console.error(`[dndsim] the server did not start on ${url}`);
  stop();
  process.exit(1);
}
console.log(`[dndsim] DM window:     ${url}`);
console.log(`[dndsim] Player window: ${url}player`);
console.log(
  keepRunning
    ? '[dndsim] press Ctrl+C to stop the server.'
    : '[dndsim] the server stops a few seconds after you close the last window (or press Ctrl+C).',
);
if (!process.argv.includes('--no-open')) {
  const cmd = isWin
    ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  try {
    const opener = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true });
    opener.on('error', () => console.log(`[dndsim] open ${url} in your browser`));
    opener.unref();
  } catch {
    console.log(`[dndsim] open ${url} in your browser`);
  }
}
