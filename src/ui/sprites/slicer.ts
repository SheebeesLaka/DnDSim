/**
 * Sprite-sheet slicer, ported from the Java app's UI/SpriteUtils.java (sliceSheet /
 * extractFrame / contentRuns). Pure: works on an RGBA pixel buffer so it can be
 * unit-tested in Node and used in the browser alike.
 *
 * Conventions (same as the Java app):
 *  - the top-left pixel is the transparency key (magenta-background sheets);
 *  - frames are separated by rows/columns made entirely of that key colour, so
 *    irregular spacing is fine;
 *  - every frame of a sheet row is normalised bottom-centred onto a shared
 *    per-row canvas so feet stay aligned across animation frames;
 *  - `party/testsprites.png#3` refers to sheet row 3; a ref without `#` is a
 *    single image;
 *  - `party/sheet.png@1,1,32,32;34,1,32,32` picks frames by rectangle (the sprite
 *    picker writes these), in play order, for sheets whose layout rows can't describe.
 */

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel (ImageData.data / pngjs .data) */
  data: Uint8ClampedArray | Uint8Array;
}

/** A run of content pixels: inclusive [start, end]. */
export type Run = readonly [number, number];

/** Where one frame's trimmed content lives on the sheet, and where it lands on the row canvas. */
export interface FrameSlice {
  /** trimmed content bounds on the source sheet (inclusive-exclusive) */
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  /** offset of that content inside the row canvas (bottom-centred) */
  dx: number;
  dy: number;
  /** true when the cell between separators held no content at all */
  empty: boolean;
}

export interface SheetRow {
  /** shared canvas size for every frame of this row */
  frameW: number;
  frameH: number;
  frames: FrameSlice[];
}

export interface SlicedSheet {
  width: number;
  height: number;
  /** the transparency key as packed 0xAARRGGBB */
  key: number;
  columnRuns: Run[];
  rowRuns: Run[];
  rows: SheetRow[];
}

/** Java's MIN_FRAME_SIZE: the per-row canvas is never narrower than this. */
export const MIN_FRAME_SIZE = 32;
/** Idle animation cadence (IDLE_FRAME_NANOS). */
export const IDLE_FRAME_MS = 300;

export interface SpriteRef {
  path: string;
  /** sheet row, or null for a single image */
  row: number | null;
  /** frames picked by rectangle (`@x,y,w,h;…`), in play order */
  rects: Rect[] | null;
}

/** `"party/sheet.png#3"` -> { path: 'party/sheet.png', row: 3 }. Invalid rows yield null. */
export function parseSpriteRef(spritePath: string | null | undefined): SpriteRef | null {
  if (!spritePath) return null;
  const at = spritePath.lastIndexOf('@');
  const rects = at >= 0 ? parseRects(spritePath.slice(at + 1)) : null;
  if (rects) return { path: spritePath.slice(0, at), row: null, rects };
  const hash = spritePath.lastIndexOf('#');
  if (hash < 0) return { path: spritePath, row: null, rects: null };
  const rowText = spritePath.slice(hash + 1).trim();
  if (!/^\d+$/.test(rowText)) return null;
  return { path: spritePath.slice(0, hash), row: Number(rowText), rects: null };
}

const argbAt = (img: RgbaImage, x: number, y: number): number => {
  const i = (y * img.width + x) * 4;
  const d = img.data;
  // Java compares getArgb ints; alpha is part of the comparison.
  return (((d[i + 3] ?? 0) << 24) | ((d[i] ?? 0) << 16) | ((d[i + 1] ?? 0) << 8) | (d[i + 2] ?? 0)) >>> 0;
};

/** Runs of consecutive true indices as [start, end] pairs (SpriteUtils.contentRuns). */
export function contentRuns(content: ArrayLike<boolean>): Run[] {
  const runs: Run[] = [];
  let start = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] && start < 0) start = i;
    if (!content[i] && start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, content.length - 1]);
  return runs;
}

/**
 * Slice a sheet into rows of frames (SpriteUtils.sliceSheet). Returns null when
 * the sheet has no content at all.
 */
export function sliceSheet(img: RgbaImage): SlicedSheet | null {
  const { width: w, height: h } = img;
  if (w === 0 || h === 0) return null;
  const key = argbAt(img, 0, 0);
  const colContent = new Array<boolean>(w).fill(false);
  const rowContent = new Array<boolean>(h).fill(false);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (argbAt(img, x, y) !== key) {
        colContent[x] = true;
        rowContent[y] = true;
      }
    }
  }
  const columnRuns = contentRuns(colContent);
  const rowRuns = contentRuns(rowContent);
  if (columnRuns.length === 0 || rowRuns.length === 0) return null;

  // One shared frame width keeps horizontal centring and integer scaling
  // consistent across every frame of the sheet.
  let frameW = MIN_FRAME_SIZE;
  for (const [a, b] of columnRuns) frameW = Math.max(frameW, b - a + 1);

  const rows: SheetRow[] = rowRuns.map(([ry0, ry1]) => {
    const frameH = ry1 - ry0 + 1;
    const frames = columnRuns.map(([cx0, cx1]) => extractFrame(img, key, cx0, cx1, ry0, ry1, frameW, frameH));
    return { frameW, frameH, frames };
  });
  return { width: w, height: h, key, columnRuns, rowRuns, rows };
}

/** Trim one cell's content and compute its bottom-centred placement (SpriteUtils.extractFrame). */
function extractFrame(
  img: RgbaImage,
  key: number,
  cx0: number,
  cx1: number,
  ry0: number,
  ry1: number,
  frameW: number,
  frameH: number,
): FrameSlice {
  let minX = Number.MAX_SAFE_INTEGER,
    maxX = -1,
    minY = Number.MAX_SAFE_INTEGER,
    maxY = -1;
  for (let y = ry0; y <= ry1; y++) {
    for (let x = cx0; x <= cx1; x++) {
      if (argbAt(img, x, y) !== key) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { srcX: cx0, srcY: ry0, srcW: 0, srcH: 0, dx: 0, dy: frameH, empty: true };
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  return {
    srcX: minX,
    srcY: minY,
    srcW: cw,
    srcH: ch,
    dx: Math.trunc((frameW - cw) / 2),
    dy: frameH - ch,
    empty: false,
  };
}

/**
 * Blit a frame onto a fresh RGBA buffer of the row's canvas size, with key
 * pixels left transparent. This is the pure equivalent of the WritableImage
 * Java builds; the browser loader does the same with a 2D canvas.
 */
export function renderFrame(img: RgbaImage, sheet: SlicedSheet, row: SheetRow, frame: FrameSlice): RgbaImage {
  const out = new Uint8ClampedArray(row.frameW * row.frameH * 4);
  if (!frame.empty) {
    for (let y = 0; y < frame.srcH; y++) {
      for (let x = 0; x < frame.srcW; x++) {
        const sx = frame.srcX + x,
          sy = frame.srcY + y;
        if (argbAt(img, sx, sy) === sheet.key) continue;
        const si = (sy * img.width + sx) * 4;
        const di = ((frame.dy + y) * row.frameW + (frame.dx + x)) * 4;
        out[di] = img.data[si] ?? 0;
        out[di + 1] = img.data[si + 1] ?? 0;
        out[di + 2] = img.data[si + 2] ?? 0;
        out[di + 3] = img.data[si + 3] ?? 0;
      }
    }
  }
  return { width: row.frameW, height: row.frameH, data: out };
}

/**
 * Which frame is showing at time `nowMs`: the first two of a sheet row (SpriteUtils.currentFrame),
 * or every one of `cycle` picked frames.
 */
export function idleFrameIndex(nowMs: number, frameCount: number, cycle = 2): number {
  if (frameCount <= 0) return 0;
  return Math.floor(nowMs / IDLE_FRAME_MS) % Math.max(1, Math.min(cycle, frameCount));
}

/** The transparency key: the top-left pixel, packed 0xAARRGGBB. */
export const keyColor = (img: RgbaImage): number => (img.width && img.height ? argbAt(img, 0, 0) : 0);

/**
 * Horizontal content extent shared by a row: the widest trimmed frame, rounded
 * up to an even number so a bottom-centred sprite sits on a whole texel. Used
 * by the renderer to size billboards tightly (the Java MIN_FRAME_SIZE padding
 * would otherwise make click picking hit empty space).
 */
export function rowContentWidth(row: SheetRow): number {
  let w = 0;
  for (const f of row.frames) w = Math.max(w, f.srcW);
  return w + (w % 2);
}

// ---------- frames picked by rectangle ("sheet.png@x,y,w,h;x,y,w,h") ----------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** "party/sheet.png" + rects -> "party/sheet.png@1,1,32,32;34,1,32,32" (the picker's output). */
export function formatSpriteRef(path: string, rects: readonly Rect[]): string {
  return rects.length ? `${path}@${rects.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(';')}` : path;
}

function parseRects(text: string): Rect[] | null {
  const rects: Rect[] = [];
  for (const part of text.split(';')) {
    const n = part.split(',').map((v) => v.trim());
    if (n.length !== 4 || !n.every((v) => /^\d+$/.test(v))) return null;
    const [x, y, w, h] = n.map(Number) as [number, number, number, number];
    if (w <= 0 || h <= 0) return null;
    rects.push({ x, y, w, h });
  }
  return rects.length ? rects : null;
}

/** Background for picked frames: the key colour, or a fully transparent pixel. */
const isBackground = (img: RgbaImage, key: number, x: number, y: number): boolean =>
  argbAt(img, x, y) === key || (img.data[(y * img.width + x) * 4 + 3] ?? 0) === 0;

/** Frames smaller than this on a side, or than FRAME_MIN_AREA, are specks (labels, dots), not frames. */
export const FRAME_MIN_SIDE = 8;
export const FRAME_MIN_AREA = 64;

/**
 * The frames a picker can offer: every connected region of non-key pixels (4-neighbour),
 * as its bounding box, in reading order. Cells walled off by key-colour lines come out as
 * whole cells, however irregular the layout; labels and specks are dropped.
 */
export function findFrames(img: RgbaImage, key = keyColor(img)): Rect[] {
  const { width: w, height: h } = img;
  const seen = new Uint8Array(w * h);
  const out: Rect[] = [];
  const stack: number[] = [];
  for (let y0 = 0; y0 < h; y0++) {
    for (let x0 = 0; x0 < w; x0++) {
      if (seen[y0 * w + x0] || argbAt(img, x0, y0) === key) continue;
      let minX = x0,
        maxX = x0,
        minY = y0,
        maxY = y0;
      seen[y0 * w + x0] = 1;
      stack.push(x0, y0);
      while (stack.length) {
        const y = stack.pop() as number;
        const x = stack.pop() as number;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        const next = [x + 1, y, x - 1, y, x, y + 1, x, y - 1];
        for (let i = 0; i < 8; i += 2) {
          const nx = next[i] as number,
            ny = next[i + 1] as number;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx]) continue;
          if (argbAt(img, nx, ny) === key) continue;
          seen[ny * w + nx] = 1;
          stack.push(nx, ny);
        }
      }
      const bw = maxX - minX + 1,
        bh = maxY - minY + 1;
      if (bw >= FRAME_MIN_SIDE && bh >= FRAME_MIN_SIDE && bw * bh >= FRAME_MIN_AREA)
        out.push({ x: minX, y: minY, w: bw, h: bh });
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** A box shrunk to its content (key and transparent pixels are background); null when it holds none. */
export function trimRect(img: RgbaImage, key: number, r: Rect): Rect | null {
  let minX = Number.MAX_SAFE_INTEGER,
    maxX = -1,
    minY = Number.MAX_SAFE_INTEGER,
    maxY = -1;
  const x1 = Math.min(img.width, r.x + r.w),
    y1 = Math.min(img.height, r.y + r.h);
  for (let y = Math.max(0, r.y); y < y1; y++) {
    for (let x = Math.max(0, r.x); x < x1; x++) {
      if (isBackground(img, key, x, y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Lay picked frames out on one shared canvas. Equal-sized boxes (cells of a grid) are all
 * cropped with the same box (the union of their content, in cell coordinates) so the
 * sprite keeps its place in the cell and never jitters between frames; boxes of different
 * sizes (drawn by hand) are trimmed one by one and bottom-centred, like sheet rows.
 */
export function rectFrames(img: RgbaImage, key: number, rects: readonly Rect[]): SheetRow {
  const trims = rects.map((r) => trimRect(img, key, r));
  const first = rects[0];
  const grid = first !== undefined && rects.every((r) => r.w === first.w && r.h === first.h);
  if (grid) {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    trims.forEach((t, i) => {
      const r = rects[i];
      if (!t || !r) return;
      x0 = Math.min(x0, t.x - r.x);
      y0 = Math.min(y0, t.y - r.y);
      x1 = Math.max(x1, t.x - r.x + t.w);
      y1 = Math.max(y1, t.y - r.y + t.h);
    });
    if (x1 > x0) {
      const cw = x1 - x0,
        ch = y1 - y0;
      const frameW = cw + (cw % 2);
      return {
        frameW,
        frameH: ch,
        frames: rects.map((r, i) =>
          trims[i]
            ? { srcX: r.x + x0, srcY: r.y + y0, srcW: cw, srcH: ch, dx: 0, dy: 0, empty: false }
            : { srcX: r.x, srcY: r.y, srcW: 0, srcH: 0, dx: 0, dy: ch, empty: true },
        ),
      };
    }
  }
  let frameW = 2,
    frameH = 1;
  for (const t of trims) {
    if (!t) continue;
    frameW = Math.max(frameW, t.w + (t.w % 2));
    frameH = Math.max(frameH, t.h);
  }
  return {
    frameW,
    frameH,
    frames: trims.map((t, i) =>
      t
        ? {
            srcX: t.x,
            srcY: t.y,
            srcW: t.w,
            srcH: t.h,
            dx: Math.trunc((frameW - t.w) / 2),
            dy: frameH - t.h,
            empty: false,
          }
        : {
            srcX: rects[i]?.x ?? 0,
            srcY: rects[i]?.y ?? 0,
            srcW: 0,
            srcH: 0,
            dx: 0,
            dy: frameH,
            empty: true,
          },
    ),
  };
}
