/**
 * Browser-side sprite store: fetches `/api/sprites/<path>`, slices sheets with
 * the pure slicer, and bakes each sheet (or single image) into one atlas canvas
 * so a unit's frames are UV rectangles on a shared texture. three.js specifics
 * live in the renderer; this module only deals in canvases and rectangles.
 */
import { parseSpriteRef, rowContentWidth, sliceSheet, type SheetRow, type SlicedSheet } from './slicer.ts';

export interface AtlasRect {
  /** texel rectangle on the atlas canvas (y down) */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteFrames {
  /** the sheet's atlas (shared by every row of that sheet) */
  atlas: SpriteAtlas;
  /** one rect per animation frame, all the same size (bottom-centred content) */
  frames: AtlasRect[];
  /** true for sheet rows: idle-animate the first two frames */
  animated: boolean;
  /** true for single images (terrain art): scaled to fit a cell, not texel-exact */
  single: boolean;
}

export interface SpriteAtlas {
  path: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** pixel data for alpha-aware click picking */
  pixels: ImageData;
  /** bumped every time the canvas content changes (never, after bake) */
  version: number;
}

type Entry =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'ready'; atlas: SpriteAtlas; rows: SpriteFrames[]; single: SpriteFrames };

export type SpriteFetcher = (path: string) => Promise<HTMLImageElement | ImageBitmap | null>;

/** Default fetcher: decode through an <img> so the browser handles every format. */
export const fetchSpriteImage: SpriteFetcher = (path) =>
  new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `/api/sprites/${path.split('/').map(encodeURIComponent).join('/')}`;
  });

const PAD = 1; // texel gutter between frames so nearest sampling never bleeds

export class SpriteLibrary {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  /** bumped whenever a sheet finishes loading (ready or missing) */
  version = 0;

  constructor(private readonly fetcher: SpriteFetcher = fetchSpriteImage) {}

  /** Called whenever a sheet finishes loading (ready or missing): re-render. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Frames for a spritePath, or null when unknown/missing/still loading. The
   * first request for a sheet starts its load.
   */
  get(spritePath: string | null | undefined): SpriteFrames | null {
    const ref = parseSpriteRef(spritePath);
    if (!ref) return null;
    const entry = this.entries.get(ref.path);
    if (!entry) {
      this.entries.set(ref.path, { state: 'loading' });
      void this.load(ref.path);
      return null;
    }
    if (entry.state !== 'ready') return null;
    if (ref.row === null) return entry.single;
    return entry.rows[ref.row] ?? null;
  }

  /** 'loading' | 'missing' | 'ready' | 'unknown' — for the debug panel. */
  status(spritePath: string): string {
    const ref = parseSpriteRef(spritePath);
    if (!ref) return 'invalid';
    return this.entries.get(ref.path)?.state ?? 'unknown';
  }

  private async load(path: string): Promise<void> {
    const img = await this.fetcher(path);
    if (!img || img.width === 0 || img.height === 0) {
      this.entries.set(path, { state: 'missing' });
      this.notify();
      return;
    }
    try {
      this.entries.set(path, bake(path, img));
    } catch (err) {
      console.warn(`sprite ${path}: ${String(err)}`);
      this.entries.set(path, { state: 'missing' });
    }
    this.notify();
  }

  private notify(): void {
    this.version++;
    for (const l of this.listeners) l();
  }
}

const canvas2d = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
};

/**
 * Bake one image into an atlas. Sheets: every row becomes a strip of
 * `frameCount` cells of the row's (tight) canvas size; the content is blitted
 * bottom-centred with key pixels dropped. Single images: copied as they are.
 */
function bake(path: string, img: HTMLImageElement | ImageBitmap): Entry {
  const [src, sctx] = canvas2d(img.width, img.height);
  sctx.drawImage(img, 0, 0);
  const pixels = sctx.getImageData(0, 0, img.width, img.height);
  const sliced = sliceSheet({ width: pixels.width, height: pixels.height, data: pixels.data });

  // Single-image view (whole picture, alpha as authored).
  const singleAtlas = (): SpriteAtlas => ({
    path,
    canvas: src,
    width: src.width,
    height: src.height,
    pixels,
    version: 1,
  });

  if (!sliced) {
    const atlas = singleAtlas();
    const single: SpriteFrames = {
      atlas,
      frames: [{ x: 0, y: 0, w: atlas.width, h: atlas.height }],
      animated: false,
      single: true,
    };
    return { state: 'ready', atlas, rows: [], single };
  }

  // Sheet atlas: rows stacked vertically, frames side by side.
  const rowW = (row: SheetRow) => rowContentWidth(row);
  let atlasW = 0,
    atlasH = PAD;
  for (const row of sliced.rows) {
    atlasW = Math.max(atlasW, PAD + row.frames.length * (rowW(row) + PAD));
    atlasH += row.frameH + PAD;
  }
  const [canvas, ctx] = canvas2d(Math.max(1, atlasW), Math.max(1, atlasH));
  const rowsOut: SpriteFrames[] = [];
  const atlas: SpriteAtlas = { path, canvas, width: canvas.width, height: canvas.height, pixels, version: 1 };
  let y = PAD;
  for (const row of sliced.rows) {
    const w = rowW(row);
    const frames: AtlasRect[] = [];
    let x = PAD;
    for (const f of row.frames) {
      if (!f.empty)
        blitKeyed(
          pixels,
          sliced,
          ctx,
          f.srcX,
          f.srcY,
          f.srcW,
          f.srcH,
          x + (w - f.srcW) / 2,
          y + row.frameH - f.srcH,
        );
      frames.push({ x, y, w, h: row.frameH });
      x += w + PAD;
    }
    rowsOut.push({ atlas, frames, animated: frames.length > 1, single: false });
    y += row.frameH + PAD;
  }
  atlas.pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const single: SpriteFrames = {
    atlas: singleAtlas(),
    frames: [{ x: 0, y: 0, w: src.width, h: src.height }],
    animated: false,
    single: true,
  };
  return { state: 'ready', atlas, rows: rowsOut, single };
}

/** Copy a source rectangle, turning key-coloured pixels transparent. */
function blitKeyed(
  src: ImageData,
  sheet: SlicedSheet,
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
): void {
  const out = ctx.createImageData(sw, sh);
  const kA = (sheet.key >>> 24) & 0xff,
    kR = (sheet.key >>> 16) & 0xff,
    kG = (sheet.key >>> 8) & 0xff,
    kB = sheet.key & 0xff;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const si = ((sy + y) * src.width + (sx + x)) * 4;
      const r = src.data[si] ?? 0,
        g = src.data[si + 1] ?? 0,
        b = src.data[si + 2] ?? 0,
        a = src.data[si + 3] ?? 0;
      if (r === kR && g === kG && b === kB && a === kA) continue;
      const di = (y * sw + x) * 4;
      out.data[di] = r;
      out.data[di + 1] = g;
      out.data[di + 2] = b;
      out.data[di + 3] = a;
    }
  }
  ctx.putImageData(out, Math.floor(dx), Math.floor(dy));
}

/** Alpha at an atlas texel, for click picking through transparent padding. */
export function atlasAlphaAt(atlas: SpriteAtlas, x: number, y: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= atlas.pixels.width || yi >= atlas.pixels.height) return 0;
  return atlas.pixels.data[(yi * atlas.pixels.width + xi) * 4 + 3] ?? 0;
}
