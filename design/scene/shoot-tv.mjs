// The TV (player.html?ui=next at 1920×1080) mirroring a DM page that plays the arboretum scene.
// Both pages share one browser context so the BroadcastChannel connects them.
// Needs the dev server on :5173. Run: node design/scene/shoot-tv.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const scene = readFileSync(here('./arboretum.json'), 'utf8');
const BASE = process.env.DNDSIM_URL ?? 'http://127.0.0.1:5173';
const OUT = here('../shots/app');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu'] });
const context = await browser.newContext();
const errors = [];
const dm = await context.newPage();
await dm.setViewportSize({ width: 1536, height: 960 });
await dm.route('**/api/scenarios/arboretum', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: scene }));
const tv = await context.newPage();
await tv.setViewportSize({ width: 1920, height: 1080 });
for (const p of [dm, tv]) p.on('pageerror', (e) => errors.push(e.message));

await dm.goto(`${BASE}/?scenario=arboretum&seed=7&ui=next`);
await dm.waitForSelector('.sp-rail');
await tv.goto(`${BASE}/player.html?ui=next`);
await tv.waitForSelector('.sp-rail', { timeout: 15000 });
await tv.waitForTimeout(2500);
await tv.screenshot({ path: `${OUT}/tv-01-turn.png` });
console.log('shot tv-01-turn');

// the DM starts Henry's attack and types the d20 and one die: the TV fills in live
await dm.bringToFront();
await dm.keyboard.press('e');
const p = await dm.evaluate(() => window.dndsim.renderer.unitPoint('u5', 0.4));
await dm.mouse.click(p.x, p.y);
await dm.waitForTimeout(300);
await dm.keyboard.press('9');
await dm.keyboard.press('Enter');
await dm.keyboard.press('4');
await tv.waitForTimeout(800);
await tv.screenshot({ path: `${OUT}/tv-02-roll.png` });
console.log('shot tv-02-roll');

// finish the attack and end the turn: the TV shows the next creature's moment
await dm.bringToFront();
await dm.keyboard.press('3');
await dm.keyboard.press('Enter');
await dm.waitForTimeout(300);
await dm.keyboard.press(' ');
console.log(
  'dm state',
  await dm.evaluate(() => {
    const b = window.dndsim.store.battle;
    return JSON.stringify({ pending: b.pending?.kind ?? null, idx: b.turn.currentIndex, draft: window.dndsim.store.session.rollDraft });
  }),
);
await tv.waitForTimeout(700);
await tv.screenshot({ path: `${OUT}/tv-03-next-turn.png` });
console.log('shot tv-03-next-turn');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
