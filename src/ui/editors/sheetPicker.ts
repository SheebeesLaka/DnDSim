/**
 * The sprite picker behind Choose…: pick an image on the left, see it zoomed in
 * the middle with every frame the app finds outlined, click frames in the order
 * they should play (or drag a box by hand), and watch the result on the right.
 * Writes refs like "party/sheet.png@1,1,32,32;34,1,32,32" (slicer.ts); Whole
 * image picks the plain path (terrain art, single pictures).
 */
import { fetchSpriteImage, type SpriteFrames } from '../sprites/library.ts';
import { IDLE_FRAME_MS, findFrames, formatSpriteRef, parseSpriteRef, type Rect } from '../sprites/slicer.ts';
import { button, h, replaceChildren } from '../dom.ts';
import { alertDialog, modal } from '../panels/dialogs.ts';
import { listSprites, spriteLibrary, uploadSprite, type SpriteFolder } from './spriteStore.ts';

export interface SheetPickerOptions {
  current: string | null;
  /** where Upload… puts new art */
  folder: SpriteFolder;
  onPick: (spritePath: string) => void;
}

const ZOOMS = [1, 2, 3, 4, 6, 8];
const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** Draw frame `idx` of `frames` into a square canvas: integer-scaled and feet on a ground line (sheets), or fitted (single images). */
export function drawFrame(
  canvas: HTMLCanvasElement,
  frames: SpriteFrames | null,
  idx: number,
  size: number,
): boolean {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;
  const f = frames?.frames[idx % Math.max(1, frames.frames.length)];
  if (!frames || !f) return false;
  const fit = Math.min(size / f.w, size / f.h);
  const s = frames.single ? fit : Math.max(1, Math.floor(fit * 0.9));
  const ground = frames.single ? size : size - 8;
  ctx.drawImage(
    frames.atlas.canvas,
    f.x,
    f.y,
    f.w,
    f.h,
    (size - f.w * s) / 2,
    ground - f.h * s,
    f.w * s,
    f.h * s,
  );
  if (!frames.single) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(10, ground, size - 20, 1);
  }
  return true;
}

export function openSheetPicker(opts: SheetPickerOptions): void {
  const lib = spriteLibrary();
  const start = parseSpriteRef(opts.current);
  let paths: string[] = [];
  let sheet: string | null = start?.path ?? null;
  let picked: Rect[] = start?.rects ? [...start.rects] : [];
  let image: { canvas: HTMLCanvasElement; width: number; height: number } | null = null;
  let boxes: Rect[] = [];
  let zoom = 1;
  let loading = 0;
  let tick = 0;

  const list = h('div', { class: 'sheet-list', dataset: { testid: 'sheet-list' } });
  const stage = h('div', { class: 'sheet-stage' });
  const viewport = h('div', { class: 'sheet-viewport', dataset: { testid: 'sheet-view' } }, stage);
  const zoomLabel = h('span', { class: 'muted small sheet-zoom' });
  const preview = h('canvas', {
    class: 'sheet-preview',
    width: 160,
    height: 160,
    dataset: { testid: 'sheet-preview' },
  });
  const refText = h('div', { class: 'muted small sprite-path', dataset: { testid: 'sheet-ref' } });
  const hint = h('div', { class: 'muted small' });
  const fileInput = h('input', {
    type: 'file',
    accept: 'image/png,image/gif,image/webp,image/jpeg',
    style: 'display:none',
  });

  const ref = () => (sheet && picked.length ? formatSpriteRef(sheet, picked) : null);
  const useBtn = button('Use', () => pick(ref()), { class: 'primary', dataset: { testid: 'sheet-use' } });
  const wholeBtn = button('Whole image', () => pick(sheet), {
    title: 'The whole picture (terrain art, single images)',
    dataset: { testid: 'sheet-whole' },
  });
  const clearBtn = button('Clear', () => ((picked = []), render()), { dataset: { testid: 'sheet-clear' } });

  const setZoom = (z: number) => {
    zoom = Math.max(ZOOMS[0] ?? 1, Math.min(ZOOMS[ZOOMS.length - 1] ?? 8, z));
    renderStage();
  };
  const stepZoom = (dir: 1 | -1) => {
    const i = ZOOMS.indexOf(zoom);
    setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 0 : i) + dir))] ?? zoom);
  };

  const body = h(
    'div',
    { class: 'sheet-picker', dataset: { testid: 'sheet-picker' } },
    h(
      'div',
      { class: 'sheet-col' },
      list,
      button('Upload…', () => fileInput.click(), { title: `Copied into resources/sprites/${opts.folder}/` }),
      fileInput,
    ),
    h(
      'div',
      { class: 'sheet-main' },
      h(
        'div',
        { class: 'row' },
        button('−', () => stepZoom(-1), { title: 'Zoom out (Ctrl + wheel)' }),
        zoomLabel,
        button('+', () => stepZoom(1), { title: 'Zoom in (Ctrl + wheel)' }),
        hint,
      ),
      viewport,
    ),
    h('div', { class: 'sheet-side' }, preview, refText, h('div', { class: 'row' }, clearBtn, wholeBtn)),
  );
  const m = modal('Choose Sprite', body, [useBtn, button('Cancel', () => close())]);
  m.el.classList.add('editor-dialog', 'sheet-dialog');

  const timer = window.setInterval(() => {
    tick++;
    renderPreview();
  }, IDLE_FRAME_MS);
  const unsub = lib.onChange(() => {
    renderList();
    renderPreview();
  });
  function close(): void {
    window.clearInterval(timer);
    unsub();
    m.close();
  }
  function pick(path: string | null): void {
    if (!path) return;
    close();
    opts.onPick(path);
  }

  function renderList(): void {
    replaceChildren(
      list,
      paths.length
        ? paths.map((p) => {
            const thumb = h('canvas', { width: 40, height: 40 });
            drawFrame(thumb, lib.get(p), 0, 40);
            return h(
              'button',
              {
                type: 'button',
                class: `sheet-item${p === sheet ? ' on' : ''}`,
                title: p,
                onclick: () => selectSheet(p),
                dataset: { testid: `sheet-${p}` },
              },
              thumb,
              h('span', {}, p.split('/').pop() ?? p),
            );
          })
        : h('div', { class: 'muted' }, 'No sprites yet: upload one.'),
    );
  }

  function selectSheet(p: string): void {
    if (p !== sheet) picked = p === start?.path && start.rects ? [...start.rects] : [];
    sheet = p;
    image = null;
    boxes = [];
    renderList();
    render();
    const token = ++loading;
    void fetchSpriteImage(p).then((img) => {
      if (token !== loading) return;
      if (!img || img.width === 0) {
        hint.textContent = "Can't read that image.";
        return;
      }
      const c = h('canvas', { width: img.width, height: img.height, class: 'sheet-canvas' });
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, img.width, img.height);
      image = { canvas: c, width: img.width, height: img.height };
      boxes = findFrames({ width: px.width, height: px.height, data: px.data });
      // the largest zoom that shows the whole sheet, but at least 2×
      const room = { w: viewport.clientWidth - 16, h: viewport.clientHeight - 16 };
      const fit = [...ZOOMS].reverse().find((z) => img.width * z <= room.w && img.height * z <= room.h);
      zoom = Math.max(2, fit ?? 1);
      render();
    });
  }

  function render(): void {
    renderStage();
    renderSide();
  }

  function renderStage(): void {
    zoomLabel.textContent = `${zoom}×`;
    hint.textContent = !sheet
      ? 'Pick an image on the left.'
      : !image
        ? 'Loading…'
        : `${boxes.length} frames found. Click them in the order they play; drag on the sheet to draw your own box.`;
    if (!image) {
      replaceChildren(stage);
      return;
    }
    const { width, height, canvas } = image;
    stage.style.width = `${width * zoom}px`;
    stage.style.height = `${height * zoom}px`;
    canvas.style.width = `${width * zoom}px`;
    canvas.style.height = `${height * zoom}px`;
    const box = (r: Rect, cls: string, testid: string | null) => {
      const order = picked.findIndex((p) => sameRect(p, r));
      const el = h(
        'div',
        {
          class: `sheet-box ${cls}${order >= 0 ? ' on' : ''}`,
          style: `left:${r.x * zoom}px;top:${r.y * zoom}px;width:${r.w * zoom}px;height:${r.h * zoom}px`,
          title: `${r.x},${r.y} ${r.w}×${r.h}`,
          dataset: testid ? { testid } : {},
        },
        order >= 0 ? h('span', { class: 'sheet-order' }, String(order + 1)) : null,
      );
      return el;
    };
    const custom = picked.filter((p) => !boxes.some((b) => sameRect(b, p)));
    replaceChildren(
      stage,
      canvas,
      boxes.map((b, i) => box(b, 'found', `frame-${i}`)),
      custom.map((r) => box(r, 'custom', null)),
    );
  }

  function renderSide(): void {
    const r = ref();
    refText.textContent = r ?? sheet ?? '';
    useBtn.disabled = r === null;
    wholeBtn.disabled = sheet === null;
    clearBtn.disabled = picked.length === 0;
    renderPreview();
  }

  function renderPreview(): void {
    const r = ref();
    const frames = r ? lib.get(r) : null;
    preview.classList.toggle('empty', !drawFrame(preview, frames, tick, 160));
  }

  /** Pick or unpick the box under a sheet pixel (the smallest one, so a box drawn inside a cell wins). */
  function toggleAt(p: { x: number; y: number }): void {
    const under = [...picked, ...boxes]
      .filter((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (!under) return;
    const order = picked.findIndex((r) => sameRect(r, under));
    picked = order >= 0 ? picked.filter((_, i) => i !== order) : [...picked, under];
    render();
  }

  // on the sheet: a click picks the box under it; a drag (anywhere, boxes included) draws one by hand
  stage.addEventListener('mousedown', (ev) => {
    if (!image || ev.button !== 0) return;
    ev.preventDefault();
    const at = (e: MouseEvent) => {
      const b = stage.getBoundingClientRect();
      const img = image ?? { width: 1, height: 1 };
      return {
        x: Math.max(0, Math.min(img.width - 1, Math.floor((e.clientX - b.left) / zoom))),
        y: Math.max(0, Math.min(img.height - 1, Math.floor((e.clientY - b.top) / zoom))),
      };
    };
    const a = at(ev);
    const sx = ev.clientX,
      sy = ev.clientY;
    const band = h('div', { class: 'sheet-band' });
    let dragging = false;
    let cur: Rect = { x: a.x, y: a.y, w: 1, h: 1 };
    const move = (e: MouseEvent) => {
      if (!dragging && Math.hypot(e.clientX - sx, e.clientY - sy) < 4) return;
      if (!dragging) stage.append(band);
      dragging = true;
      const b = at(e);
      cur = {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(b.x - a.x) + 1,
        h: Math.abs(b.y - a.y) + 1,
      };
      band.style.cssText = `left:${cur.x * zoom}px;top:${cur.y * zoom}px;width:${cur.w * zoom}px;height:${cur.h * zoom}px`;
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      band.remove();
      if (!dragging) toggleAt(a);
      else if (cur.w >= 2 && cur.h >= 2) {
        picked = [...picked, cur];
        render();
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
  viewport.addEventListener(
    'wheel',
    (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      stepZoom(ev.deltaY < 0 ? 1 : -1);
    },
    { passive: false },
  );
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    uploadSprite(opts.folder, file)
      .then(async (p) => {
        paths = await listSprites();
        selectSheet(p);
      })
      .catch((err: unknown) => alertDialog('Upload Failed', String(err)));
  });

  render();
  void listSprites().then((p) => {
    paths = p;
    renderList();
    if (sheet) selectSheet(sheet);
  });
}
