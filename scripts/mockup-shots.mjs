// Screenshot the Phase 3 mockups (DM + player view each) and build a side-by-side composite.
// Usage: node scripts/mockup-shots.mjs   (starts Vite itself)
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const isWin = process.platform === 'win32';
const port = 5181;
const vite = spawn(
  isWin ? 'npx.cmd' : 'npx',
  ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
  { stdio: 'ignore', shell: isWin },
);
const base = `http://127.0.0.1:${port}/docs/visual-directions/mockups/`;
const out = 'docs/visual-directions/shots';
mkdirSync(out, { recursive: true });

async function waitFor(url, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('vite did not start');
}

try {
  await waitFor(base + 'a-topdown.html');
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('console:', m.text());
  });
  const pages = [
    ['a-topdown', 'A ready'],
    ['b-oblique', 'B ready'],
    ['c-three', 'C ready'],
  ];
  for (const [name, title] of pages) {
    for (const view of ['dm', 'player']) {
      await page.goto(`${base}${name}.html?view=${view}`, { waitUntil: 'networkidle' });
      await page.waitForFunction((t) => document.title === t, title, { timeout: 20000 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${out}/${name}-${view}.png` });
      console.log('wrote', `${out}/${name}-${view}.png`);
    }
  }
  // side-by-side composite of the three DM views
  await page.setViewportSize({ width: 1280 * 3 + 40, height: 800 + 20 });
  await page.setContent(
    `<body style="margin:0;background:#06080b;display:flex;gap:10px;padding:10px">${pages.map(([n]) => `<img src="data:image/png;base64,${readFileSync(`${out}/${n}-dm.png`).toString('base64')}" width="1280" height="800">`).join('')}</body>`,
  );
  await page.screenshot({ path: `${out}/side-by-side-dm.png` });
  await page.setContent(
    `<body style="margin:0;background:#06080b;display:flex;gap:10px;padding:10px">${pages.map(([n]) => `<img src="data:image/png;base64,${readFileSync(`${out}/${n}-player.png`).toString('base64')}" width="1280" height="800">`).join('')}</body>`,
  );
  await page.screenshot({ path: `${out}/side-by-side-player.png` });
  console.log('wrote composites');
  await browser.close();
} finally {
  vite.kill();
}
