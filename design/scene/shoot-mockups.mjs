// Screenshots the DM-screen mockups at the DM laptop's real size: 1920×1200 at 125% Windows
// scaling = a 1536×960 CSS viewport at deviceScaleFactor 1.25 → 1920×1200 PNGs in design/shots/.
// Needs the dev server on :5173 (Vite serves design/). Uses installed Edge.
// Run: node design/scene/shoot-mockups.mjs [a-chronicle b-ops-console c-spotlight]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const BASE = process.env.DNDSIM_URL ?? 'http://127.0.0.1:5173';
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['a-chronicle', 'b-ops-console', 'c-spotlight'];
mkdirSync(here('../shots'), { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1.25 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
// an entry is either a page name ("a-chronicle") or "out-name=page.html?query"
for (const entry of names) {
  const [n, target] = entry.includes('=') ? [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)] : [entry, `${entry}.html`];
  await page.goto(`${BASE}/design/mockups/${target}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: here(`../shots/${n}.png`) });
  console.log('shot', n);
}
await browser.close();
