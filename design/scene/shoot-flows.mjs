// The less common Spotlight flows, for review: cast picker, spell rolls (single + area),
// right-click menu, Adjust sheet, and initiative entry at Begin.
// Needs the dev server on :5173. Run: node design/scene/shoot-flows.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const scene = readFileSync(here('./arboretum.json'), 'utf8');
const BASE = process.env.DNDSIM_URL ?? 'http://127.0.0.1:5173';
const OUT = here('../shots/app');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const errors = [];
async function open(url) {
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1.25 });
  await page.route('**/api/scenarios/arboretum', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: scene }),
  );
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector('.sp-rail');
  await page.waitForTimeout(2000);
  return page;
}
const shot = async (page, name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
};
const at = (page, id) => page.evaluate((uid) => window.dndsim.renderer.unitPoint(uid, 0.4), id);
const cell = (page, r, c) =>
  page.evaluate(([rr, cc]) => window.dndsim.renderer.cellCenter({ r: rr, c: cc }), [r, c]);

// --- spells: Grand Wizard Man (u3) casts at Moongate Guard #1 (u5) ---
let page = await open(`${BASE}/?scenario=arboretum&seed=7`);
let p = await at(page, 'u3');
await page.mouse.click(p.x, p.y);
await page.keyboard.press('c');
await shot(page, '10-cast-picker');
await page.keyboard.press('Enter'); // first spell: Fire Bolt (spell attack, 8 tiles)
p = await at(page, 'u8'); // the Shielded Guard, two tiles away
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(400);
await page.keyboard.press('1');
await page.keyboard.press('4');
await shot(page, '11-spell-attack');
await page.keyboard.press('Escape');
// a save spell: Sacred Flame is a few rows down
await page.keyboard.press('c');
for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
p = await at(page, 'u20'); // Dr. Ilyas, three tiles away
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(400);
await page.keyboard.press('7');
await shot(page, '12-spell-save');
await page.keyboard.press('Escape');
// an area spell: Burning Hands (cones run along rows or columns) aimed east at Dr. Ilyas
await page.keyboard.press('c');
for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
const aim = await cell(page, 2, 11);
await page.mouse.move(aim.x, aim.y);
await page.waitForTimeout(300);
await page.mouse.click(aim.x, aim.y);
await page.waitForTimeout(400);
await page.keyboard.press('1');
await page.keyboard.press('2');
await shot(page, '13-area-rolls');
await page.keyboard.press('Escape');

// --- right-click menu and the Adjust sheet on Guard #2 ---
p = await at(page, 'u6');
await page.mouse.click(p.x, p.y, { button: 'right' });
await shot(page, '14-context-menu');
await page.click('text=Adjust AC, stats & dice');
await shot(page, '15-adjust-sheet');
await page.close();

// --- initiative entry at Begin (the test fixture has not started) ---
page = await open(`${BASE}/?scenario=test&seed=3`);
await shot(page, '16-setup');
await page.keyboard.press(' ');
await page.keyboard.press('1');
await page.keyboard.press('7');
await page.keyboard.press('9');
await shot(page, '17-initiative');
await page.close();

// --- an initiative tie (totals add DEX), then Field ▸ TV with the camera controls ---
page = await open(`${BASE}/?scenario=test&seed=1`);
await page.keyboard.press(' ');
for (const v of ['20', '19', '18', '17']) for (const d of v) await page.keyboard.press(d);
await page.keyboard.press('Enter');
await page.click('[data-testid="tie-u4"]').catch(() => undefined);
await shot(page, '18-tie');
await page.keyboard.press('Escape');
p = await at(page, 'u2'); // Dan: the action bar shows his shotgun and shells
await page.mouse.click(p.x, p.y);
await shot(page, '19-weapon');
await page.keyboard.press('g');
await page.click('[data-testid=dock-tv]');
await shot(page, '20-field-tv');
await page.close();

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
