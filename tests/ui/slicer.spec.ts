import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  contentRuns,
  idleFrameIndex,
  parseSpriteRef,
  renderFrame,
  rowContentWidth,
  sliceSheet,
  type RgbaImage,
} from '../../src/ui/sprites/slicer.ts';

const loadPng = (path: string): RgbaImage => {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
};

const SHEET = 'legacy-java/resources/sprites/party/testsprites.png';

describe('sprite ref parsing', () => {
  it('splits sheet refs and keeps single images', () => {
    expect(parseSpriteRef('party/testsprites.png#3')).toEqual({ path: 'party/testsprites.png', row: 3 });
    expect(parseSpriteRef('terrain/tree.png')).toEqual({ path: 'terrain/tree.png', row: null });
    expect(parseSpriteRef('party/x.png# 7 ')).toEqual({ path: 'party/x.png', row: 7 });
    expect(parseSpriteRef('party/x.png#abc')).toBeNull();
    expect(parseSpriteRef(null)).toBeNull();
    expect(parseSpriteRef('')).toBeNull();
  });
});

describe('contentRuns', () => {
  it('returns inclusive runs, including one touching the end', () => {
    expect(contentRuns([false, true, true, false, false, true])).toEqual([
      [1, 2],
      [5, 5],
    ]);
    expect(contentRuns([])).toEqual([]);
    expect(contentRuns([false, false])).toEqual([]);
  });
});

describe('sliceSheet on testsprites.png', () => {
  const img = loadPng(SHEET);
  const sheet = sliceSheet(img);

  it('finds the 12 character rows and 10 frame columns of the sheet', () => {
    expect(sheet).not.toBeNull();
    expect(sheet?.rows).toHaveLength(12);
    expect(sheet?.columnRuns).toHaveLength(10);
    for (const row of sheet?.rows ?? []) expect(row.frames).toHaveLength(10);
  });

  it('uses the top-left pixel as the key and keeps the shared width >= 32', () => {
    // magenta background, opaque
    expect(((sheet?.key ?? 0) >>> 24) & 0xff).toBe(0xff);
    for (const row of sheet?.rows ?? []) expect(row.frameW).toBeGreaterThanOrEqual(32);
    const widths = new Set((sheet?.rows ?? []).map((r) => r.frameW));
    expect(widths.size).toBe(1);
  });

  it('places every frame bottom-centred inside the row canvas and inside the sheet', () => {
    for (const row of sheet?.rows ?? []) {
      for (const f of row.frames) {
        expect(f.empty).toBe(false);
        expect(f.srcX).toBeGreaterThanOrEqual(0);
        expect(f.srcY).toBeGreaterThanOrEqual(0);
        expect(f.srcX + f.srcW).toBeLessThanOrEqual(img.width);
        expect(f.srcY + f.srcH).toBeLessThanOrEqual(img.height);
        expect(f.dy + f.srcH).toBe(row.frameH); // feet on the canvas bottom
        expect(f.dx).toBe(Math.trunc((row.frameW - f.srcW) / 2));
        expect(f.srcH).toBeLessThanOrEqual(row.frameH);
      }
    }
  });

  it('walk frames are character sized (roughly 16x24) and the row content width is even', () => {
    const row0 = sheet?.rows[0];
    expect(row0).toBeDefined();
    const f0 = row0?.frames[0];
    expect(f0?.srcW).toBeGreaterThanOrEqual(10);
    expect(f0?.srcW).toBeLessThanOrEqual(32);
    expect(f0?.srcH).toBeGreaterThanOrEqual(16);
    expect(f0?.srcH).toBeLessThanOrEqual(40);
    expect(rowContentWidth(row0 as NonNullable<typeof row0>) % 2).toBe(0);
  });

  it('renders a frame with key pixels transparent and content opaque', () => {
    const row = sheet?.rows[2];
    const f = row?.frames[1];
    if (!sheet || !row || !f) throw new Error('missing');
    const out = renderFrame(img, sheet, row, f);
    expect(out.width).toBe(row.frameW);
    expect(out.height).toBe(row.frameH);
    let opaque = 0,
      transparent = 0;
    for (let i = 3; i < out.data.length; i += 4) {
      if ((out.data[i] ?? 0) > 0) opaque++;
      else transparent++;
    }
    expect(opaque).toBeGreaterThan(50);
    expect(transparent).toBeGreaterThan(50);
    // the bottom row of the canvas carries feet pixels
    let bottomOpaque = 0;
    for (let x = 0; x < out.width; x++)
      if ((out.data[((out.height - 1) * out.width + x) * 4 + 3] ?? 0) > 0) bottomOpaque++;
    expect(bottomOpaque).toBeGreaterThan(0);
  });
});

describe('sliceSheet on synthetic sheets', () => {
  const make = (w: number, h: number, paint: (x: number, y: number) => boolean): RgbaImage => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const on = paint(x, y);
        data[i] = on ? 10 : 255;
        data[i + 1] = on ? 200 : 0;
        data[i + 2] = on ? 30 : 255;
        data[i + 3] = 255;
      }
    return { width: w, height: h, data };
  };

  it('handles irregular spacing and empty cells', () => {
    // two columns of content (x 2..5 and x 9..10), two rows (y 1..4 and y 8..9);
    // the bottom-right cell is empty.
    const img = make(14, 12, (x, y) => {
      const colA = x >= 2 && x <= 5,
        colB = x >= 9 && x <= 10;
      const rowA = y >= 1 && y <= 4,
        rowB = y >= 8 && y <= 9;
      if (colA && rowA) return true;
      if (colB && rowA) return y === 1 || y === 2; // shorter sprite: should bottom-align
      if (colA && rowB) return x === 3; // 1px wide
      return false;
    });
    const s = sliceSheet(img);
    expect(s?.columnRuns).toEqual([
      [2, 5],
      [9, 10],
    ]);
    expect(s?.rowRuns).toEqual([
      [1, 4],
      [8, 9],
    ]);
    expect(s?.rows[0]?.frameW).toBe(32);
    expect(s?.rows[0]?.frameH).toBe(4);
    const short = s?.rows[0]?.frames[1];
    expect(short).toMatchObject({ srcW: 2, srcH: 2, dy: 2, dx: 15 });
    expect(s?.rows[1]?.frames[1]?.empty).toBe(true);
    expect(s?.rows[1]?.frames[0]).toMatchObject({ srcW: 1, srcH: 2, dx: 15, dy: 0 });
  });

  it('returns null for an all-background sheet', () => {
    expect(sliceSheet(make(8, 8, () => false))).toBeNull();
    expect(sliceSheet({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toBeNull();
  });
});

describe('idle animation', () => {
  it('cycles the first two frames every 300 ms', () => {
    expect(idleFrameIndex(0, 11)).toBe(0);
    expect(idleFrameIndex(299, 11)).toBe(0);
    expect(idleFrameIndex(300, 11)).toBe(1);
    expect(idleFrameIndex(600, 11)).toBe(0);
    expect(idleFrameIndex(900, 1)).toBe(0);
    expect(idleFrameIndex(900, 0)).toBe(0);
  });
});
