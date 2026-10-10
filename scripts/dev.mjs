// Dev: Hono API on :8787 + Vite dev server on :5173 (which proxies /api).
import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';
const opts = { stdio: 'inherit', shell: isWin, env: { ...process.env, PORT: process.env.PORT ?? '8787' } };

const server = spawn(npx, ['tsx', 'server/src/index.ts'], opts);
const vite = spawn(npx, ['vite', '--host', '127.0.0.1'], opts);

const stop = () => {
  server.kill();
  vite.kill();
};
process.on('SIGINT', () => {
  stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});
vite.on('exit', (code) => {
  server.kill();
  process.exit(code ?? 0);
});
server.on('exit', (code) => {
  if (code && code !== 0) {
    vite.kill();
    process.exit(code);
  }
});
