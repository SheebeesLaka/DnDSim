/**
 * Compact sprite picker (Java's sprite pickers on the sheet, enemy and terrain
 * dialogs): a 64 px preview, Choose… (every image the server knows, with a row
 * per sheet line), Upload… (copied into resources/sprites/<folder>/, never
 * replacing existing art) and ✕ to clear.
 */
import { SpriteLibrary } from '../sprites/library.ts';
import { button, h, replaceChildren } from '../dom.ts';
import { alertDialog, modal } from '../panels/dialogs.ts';

let shared: SpriteLibrary | null = null;
export const spriteLibrary = (): SpriteLibrary => (shared ??= new SpriteLibrary());

/** Draw frame 0 of a spritePath into a square canvas, integer-scaled and crisp. */
export function drawSpritePreview(canvas: HTMLCanvasElement, spritePath: string | null, size = 64): boolean {
  const ctx = canvas.getContext('2d');
  canvas.width = size;
  canvas.height = size;
  if (!ctx) return false;
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;
  const frames = spritePath ? spriteLibrary().get(spritePath) : null;
  const f = frames?.frames[0];
  if (!frames || !f) return false;
  const scale = Math.max(1, Math.floor(Math.min(size / f.w, size / f.h)));
  const fit = frames.single ? Math.min(size / f.w, size / f.h) : scale;
  const w = f.w * fit,
    hh = f.h * fit;
  ctx.drawImage(frames.atlas.canvas, f.x, f.y, f.w, f.h, (size - w) / 2, size - hh, w, hh);
  return true;
}

async function listSprites(): Promise<string[]> {
  const res = await fetch('/api/sprites');
  if (!res.ok) return [];
  return ((await res.json()) as { paths: string[] }).paths;
}

async function uploadSprite(folder: string, file: File): Promise<string> {
  const res = await fetch(`/api/sprites/${folder}/${encodeURIComponent(file.name)}`, {
    method: 'PUT',
    body: file,
  });
  const body = (await res.json()) as { path?: string; error?: string };
  if (!res.ok || !body.path) throw new Error(body.error ?? `${res.status}`);
  return body.path;
}

export interface SpritePicker {
  el: HTMLElement;
  get(): string | null;
  set(path: string | null): void;
}

export function spritePicker(
  initial: string | null,
  folder: 'party' | 'enemies' | 'terrain',
  onChange?: (p: string | null) => void,
): SpritePicker {
  let value = initial;
  const canvas = h('canvas', { class: 'sprite-preview', width: 64, height: 64 });
  const label = h('div', { class: 'muted small sprite-path', dataset: { testid: 'sprite-path' } });
  const render = () => {
    const drawn = drawSpritePreview(canvas, value);
    label.textContent = value ?? 'No sprite';
    canvas.classList.toggle('empty', !drawn);
  };
  const unsub = spriteLibrary().onChange(render);
  const set = (p: string | null) => {
    value = p;
    render();
    onChange?.(p);
  };
  const fileInput = h('input', {
    type: 'file',
    accept: 'image/png,image/gif,image/webp,image/jpeg',
    style: 'display:none',
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    uploadSprite(folder, file)
      .then((p) => set(p))
      .catch((err: unknown) => alertDialog('Upload Failed', String(err)));
  });
  const el = h(
    'div',
    { class: 'sprite-picker', dataset: { testid: 'sprite-picker' } },
    canvas,
    h(
      'div',
      { class: 'col' },
      label,
      h(
        'div',
        { class: 'row' },
        button('Choose…', () => void chooseSprite(value, set), { dataset: { testid: 'sprite-choose' } }),
        button('Upload…', () => fileInput.click(), { title: `Copied into resources/sprites/${folder}/` }),
        button('✕', () => set(null), { title: 'No sprite', dataset: { testid: 'sprite-clear' } }),
      ),
    ),
    fileInput,
  );
  // stop listening once the dialog holding the picker is gone
  const obs = new MutationObserver(() => {
    if (!el.isConnected) {
      unsub();
      obs.disconnect();
    }
  });
  queueMicrotask(() => obs.observe(document.body, { childList: true, subtree: true }));
  render();
  return { el, get: () => value, set };
}

/** Choose dialog: every image; sheets expand into one choice per row ("party/x.png#3"). */
async function chooseSprite(current: string | null, onPick: (p: string) => void): Promise<void> {
  const paths = await listSprites();
  const grid = h('div', { class: 'sprite-grid', dataset: { testid: 'sprite-grid' } });
  const lib = spriteLibrary();
  const tile = (path: string, caption: string) => {
    const c = h('canvas', { width: 48, height: 48 });
    drawSpritePreview(c, path, 48);
    const t = h(
      'button',
      {
        type: 'button',
        class: `sprite-tile${path === current ? ' on' : ''}`,
        title: path,
        onclick: () => {
          m.close();
          unsub();
          onPick(path);
        },
        dataset: { testid: `sprite-option-${path}` },
      },
      c,
      h('span', {}, caption),
    );
    return t;
  };
  const render = () => {
    const tiles: HTMLElement[] = [];
    for (const p of paths) {
      tiles.push(tile(p, p.split('/').pop() ?? p));
      lib.get(p); // start loading
      const status = lib.status(p);
      if (status !== 'ready') continue;
      // a sliced sheet (a single image gives no rows) offers each row too
      let row = 0;
      while (lib.get(`${p}#${row}`)) {
        tiles.push(tile(`${p}#${row}`, `#${row}`));
        row++;
        if (row > 63) break;
      }
    }
    replaceChildren(grid, tiles.length ? tiles : h('div', { class: 'muted' }, 'No sprites yet: upload one.'));
  };
  const unsub = lib.onChange(render);
  render();
  const m = modal('Choose Sprite', grid, [button('Cancel', () => (m.close(), unsub()))]);
  m.el.classList.add('editor-dialog');
  m.el.style.width = '640px';
}
