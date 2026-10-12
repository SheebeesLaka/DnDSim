// Renders the shared scene with the real HD-2D three.js board and saves clean board plates
// (no app UI, no overlay chips) for the mockups to sit on.
// Needs the dev server on :5173. Uses the installed Microsoft Edge, so no browser download.
// Run: node design/scene/capture-board.mjs
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const scene = readFileSync(here('./arboretum.json'), 'utf8');
const BASE = process.env.DNDSIM_URL ?? 'http://127.0.0.1:5173';

// [file, viewport width, height] — one plate per board footprint the mockups use
const plates = [
  ['board-full-1920x1200.png', 1920, 1200],
  ['board-center-1120x1056.png', 1120, 1056],
];

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu'] });
for (const [file, w, h] of plates) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.route('**/api/scenarios/arboretum', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: scene }),
  );
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${BASE}/?scenario=arboretum&seed=7`);
  await page.waitForSelector('.boardwrap canvas');
  // board only: fill the viewport, hide every piece of app chrome and the label overlay
  await page.addStyleTag({
    content: `.top,.side,.board-toolbar,.board-zoom,.debug,.popup{display:none!important}
      .boardwrap{position:fixed!important;inset:0!important}
      canvas.board-overlay{display:none!important}`,
  });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(2500); // fit, light fades and shadow maps settle
  await page.screenshot({ path: here(`./${file}`) });
  // feet / head screen positions per unit, so the mockups can pin their overlays to tokens
  const points = await page.evaluate(() => {
    const d = window.dndsim;
    const out = {};
    for (const u of d.store.battle.units) {
      const feet = d.renderer.unitPoint(u.id, 0);
      const head = d.renderer.unitPoint(u.id, 1);
      if (feet && head) out[u.id] = { kind: u.kind, r: u.r, c: u.c, feet, head };
    }
    return out;
  });
  writeFileSync(here(`./${file.replace('.png', '.points.json')}`), JSON.stringify(points, null, 1));
  console.log('saved', file);
  await page.close();
}
await browser.close();
