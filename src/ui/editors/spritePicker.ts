/**
 * Compact sprite picker (Java's sprite pickers on the sheet, enemy and terrain
 * dialogs): a 64 px preview, Choose… (the sheet picker: see the image, click the
 * frames to use), Upload… (copied into resources/sprites/<folder>/, never
 * replacing existing art) and ✕ to clear.
 */
import { button, h } from '../dom.ts';
import { alertDialog } from '../panels/dialogs.ts';
import { openSheetPicker } from './sheetPicker.ts';
import { spriteLibrary, uploadSprite, type SpriteFolder } from './spriteStore.ts';

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

export interface SpritePicker {
  el: HTMLElement;
  get(): string | null;
  set(path: string | null): void;
}

export function spritePicker(
  initial: string | null,
  folder: SpriteFolder,
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
        button('Choose…', () => openSheetPicker({ current: value, folder, onPick: set }), {
          dataset: { testid: 'sprite-choose' },
        }),
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
