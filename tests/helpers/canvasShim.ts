/**
 * Just enough of `document.createElement('canvas')` for the three.js layers to
 * build their procedural textures under Node: every 2D-context call is a
 * no-op, pixel reads return zeroed buffers. Geometry and math are untouched.
 */
type Ctx = Record<string, unknown>;

function fakeContext(canvas: { width: number; height: number }): Ctx {
  const image = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
  const target: Ctx = {
    canvas,
    measureText: (t: string) => ({ width: t.length * 6 }),
    createImageData: (w: number, h: number) => image(w, h),
    getImageData: (_x: number, _y: number, w: number, h: number) => image(w, h),
  };
  return new Proxy(target, {
    get: (obj, prop: string) => (prop in obj ? obj[prop] : () => undefined),
    set: (obj, prop: string, value) => {
      obj[prop] = value;
      return true;
    },
  });
}

export function installCanvasShim(): void {
  const g = globalThis as unknown as { document?: unknown };
  if (g.document) return;
  g.document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`shim only makes canvases, not <${tag}>`);
      const canvas: Record<string, unknown> = { width: 300, height: 150, style: {} };
      canvas.getContext = () => fakeContext(canvas as { width: number; height: number });
      return canvas;
    },
  };
}
