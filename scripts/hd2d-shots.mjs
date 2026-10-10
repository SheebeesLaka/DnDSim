// Screenshot the HD-2D board (DM tactical, DM top-down, player) from the real app.
// Usage: node scripts/hd2d-shots.mjs [scenario]   (starts the dev servers itself)
/* global window, performance */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const scenario = process.argv[2] ?? 'test';
const out = 'docs/progress';
mkdirSync(out, { recursive: true });
const dev = spawn('node', ['scripts/dev.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '8787' } });
const wait = async (url) => {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('no server');
};
try {
  await wait('http://127.0.0.1:5173/');
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto(`http://127.0.0.1:5173/?scenario=${scenario}&seed=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid=board]');
  await page.waitForTimeout(1500);
  const settle = async () => {
    await page.waitForFunction(() => {
      const r = window.dndsim?.renderer;
      return r && r.library.status('party/testsprites.png') !== 'loading';
    });
    await page.waitForTimeout(700);
  };
  await settle();
  const stats = () => page.evaluate(() => window.dndsim.renderer.stats);
  await page.screenshot({ path: `${out}/phase4-${scenario}-dm.png` });
  console.log('dm stats', JSON.stringify(await stats()));
  // select Henry (u1) through a real click so rings + hover show
  const u1 = await page.evaluate(() => {
    const u = window.dndsim.store.battle.units.find((x) => x.id === 'u1');
    return u ? window.dndsim.renderer.cellCenter({ r: u.r, c: u.c }) : null;
  });
  if (u1) {
    await page.mouse.move(u1.x, u1.y);
    await page.mouse.click(u1.x, u1.y);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/phase4-${scenario}-dm-selected.png` });
  }
  await page.click('[data-testid=view-dm-camera]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/phase4-${scenario}-dm-top.png` });
  await page.click('[data-testid=view-dm-camera]');
  await page.waitForTimeout(300);
  // player window in the same context (BroadcastChannel)
  const player = await context.newPage();
  player.on('pageerror', (e) => errors.push('player pageerror: ' + e.message));
  player.on('console', (m) => {
    if (!m.text().includes('[vite]')) errors.push('player ' + m.type() + ': ' + m.text());
  });
  await player.goto('http://127.0.0.1:5173/player.html', { waitUntil: 'networkidle' });
  await player.bringToFront(); // selector waits poll on animation frames, which background pages skip
  const tPlayer = Date.now();
  await player
    .waitForFunction(() => document.querySelector('[data-testid=board]') !== null, null, {
      polling: 250,
      timeout: 60000,
    })
    .catch(async (e) => {
      errors.push('player: ' + e.message.split('\n')[0]);
      errors.push(
        'player state: ' +
          JSON.stringify(
            await player.evaluate(() => ({
              vm: Boolean(window.dndsimPlayer?.replica?.state?.vm),
              canvases: document.querySelectorAll('canvas').length,
              main: document.querySelector('.main')?.outerHTML.slice(0, 400) ?? 'no main',
            })),
          ),
      );
    });
  console.log('player board after', Date.now() - tPlayer, 'ms');
  console.log(
    'first frame (ms since page start): dm',
    Math.round(await page.evaluate(() => window.dndsim.renderer.stats.firstFrameAt)),
    'player',
    Math.round(await player.evaluate(() => window.dndsimPlayer.renderer.stats.firstFrameAt)),
  );
  await player.waitForTimeout(1500);
  await player.screenshot({ path: `${out}/phase4-${scenario}-player.png` });
  await page.bringToFront();
  // perf: time 30 forced frames
  const perf = await page.evaluate(async () => {
    const r = window.dndsim.renderer;
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) {
      r['dirty'] = true;
      r['draw'](performance.now());
    }
    return {
      msPerFrame: (performance.now() - t0) / 30,
      drawCalls: r.stats.drawCalls,
      triangles: r.stats.triangles,
    };
  });
  console.log('perf', JSON.stringify(perf));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  dev.kill();
}
