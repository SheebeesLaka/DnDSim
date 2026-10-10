// Dev smoke run of the real UI: node scripts/smoke-ui.mjs (starts the dev servers itself).
/* global window */
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
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
let page;
try {
  await wait('http://127.0.0.1:5173/');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
    else if (m.text().startsWith('DM saw')) console.log(m.text());
  });
  await page.goto('http://127.0.0.1:5173/?scenario=test&seed=1', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid=phase]');
  console.log('phase:', await page.textContent('[data-testid=phase]'));
  await page.screenshot({ path: 'docs/progress/phase2-board-setup.png' }).catch(() => {});
  await page.click('[data-testid=begin-btn]');
  await page.waitForSelector('[data-testid=init-begin]');
  await page.click('[data-testid=init-begin]');
  await page.waitForTimeout(300);
  console.log('phase after begin:', await page.textContent('[data-testid=phase]'));
  console.log('strip cards:', await page.locator('[data-testid=strip] .card').count());
  // select Henry via the store (click on cell): compute cell center via hitTest -> use window.dndsim
  const info = await page.evaluate(() => {
    const s = window.dndsim.store;
    return {
      order: s.battle.turn.order,
      cur: s.battle.turn.currentIndex,
      units: s.battle.units.map((u) => [u.id, u.kind, u.r, u.c]),
    };
  });
  console.log(JSON.stringify(info));
  // click Henry (u1 at 6,4)
  const box = await page.locator('canvas[data-testid=board]').boundingBox();
  const vm = await page.evaluate(() => {
    const s = window.dndsim.store;
    return { rows: s.battle.board.rows, cols: s.battle.board.cols };
  });
  const cs = Math.min((box.width - 40) / vm.cols, (box.height - 40) / vm.rows);
  const ox = box.x + (box.width - cs * vm.cols) / 2,
    oy = box.y + (box.height - cs * vm.rows) / 2;
  const cellXY = (r, c) => [ox + (c + 0.5) * cs, oy + (r + 0.5) * cs];
  let [x, y] = cellXY(6, 4);
  await page.mouse.click(x, y);
  await page.waitForTimeout(100);
  console.log(
    'selected:',
    await page.textContent('[data-testid=sel-name]'),
    'mob',
    await page.textContent('[data-testid=mob]'),
  );
  await page.click('[data-testid=act-move]');
  [x, y] = cellXY(6, 5);
  await page.mouse.click(x, y);
  await page.waitForTimeout(100);
  console.log(
    'henry now at',
    await page.evaluate(
      () => window.dndsim.store.battle.units[0].r + ',' + window.dndsim.store.battle.units[0].c,
    ),
  );
  // attack Snake (u6? find enemy at 7,7)
  await page.click('[data-testid=act-attack]');
  [x, y] = cellXY(7, 7);
  await page.mouse.click(x, y);
  await page.waitForSelector('[data-testid=d20-input]', { timeout: 5000 });
  await page.fill('[data-testid=d20-input]', '15');
  await page.click('[data-testid=dice-submit]');
  await page.waitForSelector('[data-testid=damage-panel]');
  const inputs = page.locator('[data-testid=damage-panel] input');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) await inputs.nth(i).fill('3');
  await page.click('[data-testid=dice-submit]');
  await page.waitForTimeout(200);
  console.log(
    'snake hp:',
    await page.evaluate(
      () => window.dndsim.store.battle.units.find((u) => u.kind === 'enemy' && u.name === 'Snake')?.health,
    ),
  );
  await page.screenshot({ path: 'docs/progress/phase2-board-battle.png' }).catch(() => {});
  // player window
  const p2 = await context.newPage();
  p2.on('pageerror', (e) => errors.push('player pageerror: ' + e.message));
  await p2.goto('http://127.0.0.1:5173/player.html', { waitUntil: 'networkidle' });
  await p2
    .waitForSelector('[data-testid=player-strip]', { timeout: 5000 })
    .catch(() => errors.push('player strip missing'));
  console.log('player cards:', await p2.locator('[data-testid=player-strip] .card').count());
  await p2.screenshot({ path: 'docs/progress/phase2-player.png' }).catch(() => {});
  console.log('errors:', errors);
  await browser.close();
} catch (err) {
  console.error('FAILED:', err.message);
  if (page)
    console.log(
      JSON.stringify(await page.evaluate(() => window.dndsim?.store.commandLog.slice(-8)), null, 0),
    );
  if (page)
    console.log('pending:', JSON.stringify(await page.evaluate(() => window.dndsim?.store.battle.pending)));
  if (page)
    console.log('mode:', JSON.stringify(await page.evaluate(() => window.dndsim?.store.session.mode)));
  if (page) await page.screenshot({ path: 'docs/progress/smoke-failure.png' }).catch(() => {});
} finally {
  dev.kill();
  process.exit(0);
}
