// `npm start`: build if dist/ is missing or stale, serve it on :8787, open the browser.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';
const port = process.env.PORT ?? '8787';

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
  statSync(distIndex).mtimeMs < Math.max(newestMtime('src'), newestMtime('index.html'));
if (stale || process.argv.includes('--build')) {
  console.log('[dndsim] building…');
  const r = spawnSync(npx, ['vite', 'build'], { stdio: 'inherit', shell: isWin });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const server = spawn(npx, ['tsx', 'server/src/index.ts'], {
  stdio: 'inherit',
  shell: isWin,
  env: { ...process.env, PORT: port },
});

const url = `http://127.0.0.1:${port}/`;
console.log(`[dndsim] DM window:     ${url}`);
console.log(`[dndsim] Player window: ${url}player`);
if (!process.argv.includes('--no-open')) {
  setTimeout(() => {
    const cmd = isWin
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
    try {
      spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref();
    } catch {
      /* no browser available */
    }
  }, 800);
}
process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});
server.on('exit', (code) => process.exit(code ?? 0));
