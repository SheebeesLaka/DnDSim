// Plays the arboretum scene through the real app (?ui=next) in headless Edge and screenshots each
// step at the DM laptop's size (1536×960 CSS @1.25 = 1920×1200), for comparison with the mockups.
// Needs the dev server on :5173. Run: node design/scene/shoot-app.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const scene = readFileSync(here('./arboretum.json'), 'utf8');
const BASE = process.env.DNDSIM_URL ?? 'http://127.0.0.1:5173';
const OUT = here('../shots/app');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1.25 });
await page.route('**/api/scenarios/arboretum', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: scene }));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));

const shot = async (name) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
};
/** Client point of a unit's chest (for clicking it on the 3D board). */
const unitAt = (id) =>
  page.evaluate((uid) => {
    const r = window.dndsim.renderer;
    return r.unitPoint(uid, 0.4);
  }, id);
const clickUnit = async (id) => {
  const p = await unitAt(id);
  await page.mouse.click(p.x, p.y);
};

await page.goto(`${BASE}/?scenario=arboretum&seed=7&ui=next`);
await page.waitForSelector('.sp-rail');
await page.waitForTimeout(2200);
await shot('01-turn-start');

// Henry attacks Guard #1: E, click the guard, type 9 (d20)
await page.keyboard.press('e');
await page.waitForTimeout(150);
await clickUnit('u5');
await page.waitForTimeout(500);
await shot('02-roll-empty');
await page.keyboard.press('9');
await shot('03-roll-d20');
await page.keyboard.press('Enter');
await page.keyboard.press('4');
await shot('04-roll-dice');
await page.keyboard.press('3');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await shot('05-after-hit');

// ±HP popover and the status palette on the selected creature
await page.keyboard.press('h');
await page.keyboard.press('7');
await shot('06-hp-popover');
await page.keyboard.press('Escape');
await page.keyboard.press('s');
await shot('07-status-popover');
await page.keyboard.press('Escape');

// Field mode, Light tab, select the first grow lamp
await page.keyboard.press('g');
await page.waitForTimeout(300);
await page.click('[data-testid="light-grow2"]').catch(() => undefined);
await shot('08-field-light');
await page.keyboard.press('g');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
