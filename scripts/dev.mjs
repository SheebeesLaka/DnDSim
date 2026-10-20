// Dev: Hono API on :8787 + Vite dev server on :5173 (which proxies /api).
// Both run straight under node (not through npx), so stopping this script stops the real
// processes: an npx wrapper used to die alone and leave Vite and the API holding their ports.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = (rel) => fileURLToPath(new URL(`../node_modules/${rel}`, import.meta.url));
// The API port is fixed: vite.config.ts proxies /api to :8787. An inherited PORT (tools
// that launch dev servers set it to the Vite port) would put the API on Vite's port instead.
const opts = { stdio: 'inherit', env: { ...process.env, PORT: '8787' } };

const server = spawn(process.execPath, [bin('tsx/dist/cli.mjs'), 'server/src/index.ts'], opts);
const vite = spawn(process.execPath, [bin('vite/bin/vite.js'), '--host', '127.0.0.1'], opts);

const stop = () => {
  if (server.exitCode === null) server.kill();
  if (vite.exitCode === null) vite.kill();
};
process.on('exit', stop);
process.on('SIGINT', () => {
  stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});
vite.on('exit', (code) => {
  if (server.exitCode === null) server.kill();
  process.exit(code ?? 0);
});
server.on('exit', (code) => {
  if (code && code !== 0) {
    if (vite.exitCode === null) vite.kill();
    process.exit(code);
  }
});
