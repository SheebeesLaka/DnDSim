// Cuts the first frame of each testsprites.png row into a transparent, 4x-upscaled portrait
// for the mockups (design/scene/portraits/row-N.png). Read-only on the sprite sheet.
// Run: node design/scene/cut-portraits.mjs
import { PNG } from 'pngjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const sheet = PNG.sync.read(readFileSync(here('../../legacy-java/resources/sprites/party/testsprites.png')));
const { width: W, height: H, data } = sheet;
const px = (x, y) => (y * W + x) * 4;
const bg = [data[0], data[1], data[2]];
const isBg = (x, y) => {
  const i = px(x, y);
  return data[i + 3] === 0 || (data[i] === bg[0] && data[i + 1] === bg[1] && data[i + 2] === bg[2]);
};
const rowEmpty = (y) => [...Array(W).keys()].every((x) => isBg(x, y));

// horizontal bands of non-background rows = sprite rows
const bands = [];
for (let y = 0, start = -1; y <= H; y++) {
  const empty = y === H || rowEmpty(y);
  if (!empty && start < 0) start = y;
  if (empty && start >= 0) (bands.push([start, y]), (start = -1));
}
mkdirSync(here('./portraits'), { recursive: true });
const SCALE = 4;
bands.forEach(([y0, y1], n) => {
  // first frame: first run of non-empty columns in this band
  const colEmpty = (x) => [...Array(y1 - y0).keys()].every((k) => isBg(x, y0 + k));
  let x0 = 0;
  while (x0 < W && colEmpty(x0)) x0++;
  let x1 = x0;
  while (x1 < W && !colEmpty(x1)) x1++;
  const w = x1 - x0, h = y1 - y0;
  const out = new PNG({ width: w * SCALE, height: h * SCALE });
  for (let y = 0; y < h * SCALE; y++)
    for (let x = 0; x < w * SCALE; x++) {
      const sx = x0 + Math.floor(x / SCALE), sy = y0 + Math.floor(y / SCALE);
      const s = px(sx, sy), d = (y * w * SCALE + x) * 4;
      if (isBg(sx, sy)) out.data[d + 3] = 0;
      else (out.data[d] = data[s], out.data[d + 1] = data[s + 1], out.data[d + 2] = data[s + 2], out.data[d + 3] = 255);
    }
  writeFileSync(here(`./portraits/row-${n}.png`), PNG.sync.write(out));
});
console.log(`cut ${bands.length} portraits`);
