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
 *    single image.
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
}

/** `"party/sheet.png#3"` -> { path: 'party/sheet.png', row: 3 }. Invalid rows yield null. */
export function parseSpriteRef(spritePath: string | null | undefined): SpriteRef | null {
  if (!spritePath) return null;
  const hash = spritePath.lastIndexOf('#');
  if (hash < 0) return { path: spritePath, row: null };
  const rowText = spritePath.slice(hash + 1).trim();
  if (!/^\d+$/.test(rowText)) return null;
  return { path: spritePath.slice(0, hash), row: Number(rowText) };
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

/** Which of the first two frames is showing at time `nowMs` (SpriteUtils.currentFrame). */
export function idleFrameIndex(nowMs: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  return Math.floor(nowMs / IDLE_FRAME_MS) % Math.min(2, frameCount);
}

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
