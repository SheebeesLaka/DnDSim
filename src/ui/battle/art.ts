/**
 * Shared art for the Spotlight UI: line icons, status emblems (a medallion
 * with a unique glyph, ringed by family colour), countdown pips and sprite
 * portraits (the first frame of a unit's sheet row, cached as a data URL).
 */
import type { EffectFamily } from '../../engine/view/effects.ts';
import type { SpriteLibrary } from '../sprites/library.ts';
import { statusArtKey } from '../statusKeys.ts';
import { h } from '../dom.ts';

const svg = (
  inner: string,
  attrs = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
) => `<svg viewBox="0 0 24 24" ${attrs}>${inner}</svg>`;

export const ICON = {
  move: svg(
    '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
  ),
  attack: svg('<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/>'),
  cast: svg('<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>'),
  item: svg('<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 006.2 21h11.6a2 2 0 001.7-2.5L14 9V3"/>'),
  tag: svg(
    '<path d="M20.6 13.4L13.4 20.6a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor"/>',
  ),
  heart: svg(
    '<path d="M12 21s-8-5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 6-8 11-8 11z" fill="currentColor" stroke="none"/>',
  ),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  hand: svg(
    '<path d="M18 11V6a2 2 0 00-4 0v5M14 10V4a2 2 0 00-4 0v6M10 10.5V6a2 2 0 00-4 0v8a8 8 0 0016 0v-3a2 2 0 00-4 0"/>',
  ),
  swap: svg('<path d="M17 3l4 4-4 4M21 7H9M7 21l-4-4 4-4M3 17h12"/>'),
  lamp: svg('<path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/>'),
  height: svg('<path d="M3 20h18M5 20v-5h4v-5h4V5h6v15"/>'),
  spawn: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  terrain: svg('<path d="M3 20l6-10 4 6 3-4 5 8z"/>'),
  board: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'),
  tv: svg('<rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 22h8M12 18v4"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>'),
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>'),
  gear: svg(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  ),
  eye: svg(
    '<path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 110-8 4 4 0 010 8z" fill="currentColor" stroke="none"/>',
  ),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  sheet: svg(
    '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  ),
  save: svg(
    '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  ),
  moon: svg('<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>'),
  flag: svg('<path d="M4 22V4M4 4h12l-2 4 2 4H4"/>'),
  bug: svg(
    '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M12 6V3M4 13h4M16 13h4M5 7l3 2M19 7l-3 2M5 19l3-2M19 19l-3-2"/>',
  ),
  play: svg('<path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none"/>'),
  stop: svg('<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>'),
} as const;

export const icon = (name: keyof typeof ICON, cls = 'sp-ico'): HTMLElement => {
  const el = h('span', { class: cls });
  el.innerHTML = ICON[name];
  return el;
};

/**
 * A name that fits a card or a tag but keeps what tells creatures apart:
 * "Melee Moongate Guard #1" → "M. Guard #1", "Grand Wizard Man" → "Wizard Man".
 */
export function shortName(name: string, max = 13): string {
  if (name.length <= max) return name;
  const m = /^(.*?)(\s#\d+)$/.exec(name);
  const base = (m ? m[1] : name) ?? name;
  const num = m?.[2] ?? '';
  const words = base.split(/\s+/).filter(Boolean);
  if (num && words.length > 1) return `${(words[0] ?? '')[0] ?? ''}. ${words.at(-1) ?? ''}${num}`;
  while (words.length > 1 && words.join(' ').length + num.length > max) words.shift();
  return words.join(' ') + num;
}

// ---------- status emblems ----------

/** White glyphs on a 24-unit grid; `FAM` is replaced by the family's dark tone for inner details. */
const GLYPH: Record<string, string> = {
  blessed:
    '<path d="M12 3l1.6 5.1L19 6.5l-3.3 4.2L21 12l-5.3 1.3L19 17.5l-5.4-1.6L12 21l-1.6-5.1L5 17.5l3.3-4.2L3 12l5.3-1.3L5 6.5l5.4 1.6z" fill="#fff"/><circle cx="12" cy="12" r="2.6" fill="FAM"/>',
  burning:
    '<path d="M12 3.5c.8 3.4 4.6 4.8 4.6 9.6a4.6 4.6 0 01-9.2 0c0-2.4 1.2-3.6 2.2-4.5.1 1.5.8 2.4 1.7 2.8C10.6 8.6 11.6 6 12 3.5z" fill="#fff"/><path d="M12 12.5c.4 1.4 1.9 2 1.9 3.6a1.9 1.9 0 01-3.8 0c0-1 .6-1.6 1-2 .1.6.4 1 .9 1.1-.2-1 0-1.9 0-2.7z" fill="FAM"/>',
  chilled:
    '<g stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M12 3.5v17M4.6 7.75l14.8 8.5M4.6 16.25l14.8-8.5"/><path d="M9.6 5.2L12 7.4l2.4-2.2M9.6 18.8L12 16.6l2.4 2.2M4.4 10.6l3.1-.9-.7-3.2M19.6 13.4l-3.1.9.7 3.2M4.4 13.4l3.1.9-.7 3.2M19.6 10.6l-3.1-.9.7-3.2"/></g>',
  illuminated:
    '<path d="M12 7.5c-4.2 0-7 4.5-7 4.5s2.8 4.5 7 4.5 7-4.5 7-4.5-2.8-4.5-7-4.5z" fill="#fff"/><circle cx="12" cy="12" r="2.4" fill="FAM"/><g stroke="#fff" stroke-width="1.6" stroke-linecap="round"><path d="M12 2.8v2.4M5.2 5.2l1.6 1.6M18.8 5.2l-1.6 1.6M12 18.8v2.4"/></g>',
  shield:
    '<path d="M12 3.2l6.8 2.6v5.4c0 4.4-2.9 8-6.8 9.6-3.9-1.6-6.8-5.2-6.8-9.6V5.8z" fill="#fff"/><path d="M12 7.6l1.1 2.6 2.8.2-2.1 1.8.7 2.7L12 13.5l-2.5 1.4.7-2.7-2.1-1.8 2.8-.2z" fill="FAM"/>',
  held: '<g stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"><path d="M6 4v16M18 4v16M6 8h12M6 16h12"/></g>',
  poison:
    '<path d="M12 3c3 4 6 7 6 11a6 6 0 01-12 0c0-4 3-7 6-11z" fill="#fff"/><circle cx="10" cy="14" r="1.6" fill="FAM"/><circle cx="14" cy="16" r="1.2" fill="FAM"/>',
  stun: '<path d="M13 3L6 13h5l-1 8 7-10h-5z" fill="#fff"/>',
  prone:
    '<g fill="#fff"><circle cx="6" cy="14" r="2.4"/><path d="M9 12h11v4H9z"/></g><path d="M3 19h18" stroke="#fff" stroke-width="1.6"/>',
  fear: '<g fill="#fff"><circle cx="12" cy="10" r="7"/></g><circle cx="9.5" cy="9" r="1.4" fill="FAM"/><circle cx="14.5" cy="9" r="1.4" fill="FAM"/><ellipse cx="12" cy="13.5" rx="2" ry="2.4" fill="FAM"/>',
  invisible:
    '<path d="M4 4l16 16" stroke="#fff" stroke-width="2"/><path d="M12 6c4.5 0 7.5 6 7.5 6s-.9 1.7-2.6 3.3M9 6.7A8 8 0 004.5 12s3 6 7.5 6c1.3 0 2.5-.4 3.5-1" stroke="#fff" stroke-width="1.8" fill="none"/>',
  regen: '<path d="M12 4v16M4 12h16" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  readied:
    '<g stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"><path d="M5 19L17 7M14.5 5.5l4 4M19 19L7 7M9.5 5.5l-4 4"/></g>',
  delay:
    '<circle cx="12" cy="12" r="8" stroke="#fff" stroke-width="2" fill="none"/><path d="M12 7v5l3 2" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>',
  arrival:
    '<g fill="#fff"><circle cx="8" cy="8.5" r="2.4"/><circle cx="16" cy="8.5" r="2.4"/><path d="M3.8 17c0-2.5 1.9-4.2 4.2-4.2s4.2 1.7 4.2 4.2zM11.8 17c0-2.5 1.9-4.2 4.2-4.2s4.2 1.7 4.2 4.2z"/></g>',
  timer: '<path d="M13.5 3L6 13.2h5l-1.5 7.8L18 10.8h-5z" fill="#fff"/>',
  up: '<path d="M12 4l7 8h-4v8H9v-8H5z" fill="#fff"/>',
  down: '<path d="M12 20l7-8h-4V4H9v8H5z" fill="#fff"/>',
  dot: '<circle cx="12" cy="12" r="5" fill="#fff"/>',
};

const FAMILY_TONES: Record<EffectFamily, [string, string]> = {
  buff: ['#ffd76a', '#a8761c'],
  debuff: ['#b89cff', '#5b3fc4'],
  dot: ['#ffab5e', '#b8410f'],
  event: ['#ff9a8a', '#a5302a'],
  neutral: ['#b5d6ea', '#3e5b70'],
};

/** Pick a glyph from the status name (shared with the board effects); unknown statuses get one by family. */
export const glyphFor = (name: string, family: EffectFamily): string => statusArtKey(name, family);

let gradientN = 0;
/** A status medallion: family-coloured disc, white glyph. */
export function emblem(name: string, family: EffectFamily, size = 28, glyph?: string): HTMLElement {
  const [a, b] = FAMILY_TONES[family];
  const id = `spg${gradientN++}`;
  const el = h('span', { class: 'sp-emb', style: `width:${size}px;height:${size}px`, title: name });
  el.innerHTML = `<svg viewBox="0 0 24 24"><defs><radialGradient id="${id}" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs>
    <circle cx="12" cy="12" r="11.2" fill="url(#${id})"/><circle cx="12" cy="12" r="11.2" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".9"/>
    <circle cx="12" cy="12" r="9.6" fill="none" stroke="rgba(0,0,0,.25)" stroke-width=".8"/>
    <g transform="translate(12 12) scale(.72) translate(-12 -12)">${(GLYPH[glyph ?? glyphFor(name, family)] ?? GLYPH.dot ?? '').replaceAll('FAM', b)}</g></svg>`;
  return el;
}

/** Countdown pips: `left` filled out of `full`; long statuses collapse to a few pips and a number. */
export function pips(left: number, full: number, family: EffectFamily, small = false, cap = 8): HTMLElement {
  const el = h('span', { class: `sp-pips fam-${family}${small ? ' sm' : ''}` });
  if (left < 0) {
    el.append(h('span', { class: 'more' }, '∞'));
    return el;
  }
  const total = Math.max(full, left, 1);
  const shown = Math.min(total, cap);
  const filled = Math.min(left, shown);
  for (let i = 0; i < shown; i++) el.append(h('i', { class: i < filled ? 'f' : '' }));
  if (total > cap) el.append(h('span', { class: 'more' }, String(left)));
  return el;
}

// ---------- portraits ----------

const portraitCache = new Map<string, string>();

/**
 * The first frame of a unit's sprite as a data URL (cached), or null while the
 * sheet loads / when there is no sprite. The library re-notifies on load.
 */
export function portraitURL(
  library: SpriteLibrary | undefined,
  spritePath: string | null | undefined,
): string | null {
  if (!library || !spritePath) return null;
  const hit = portraitCache.get(spritePath);
  if (hit) return hit;
  const frames = library.get(spritePath);
  const f = frames?.frames[0];
  if (!frames || !f || frames.single) return null;
  const scale = 4;
  const c = document.createElement('canvas');
  c.width = f.w * scale;
  c.height = f.h * scale;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frames.atlas.canvas, f.x, f.y, f.w, f.h, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/png');
  portraitCache.set(spritePath, url);
  return url;
}

/** <img> for a sprite portrait, or a coloured initials tile when there is none. */
export function portrait(
  library: SpriteLibrary | undefined,
  u: { spritePath?: string | null; color?: string; initials?: string; name?: string },
  size = 40,
): HTMLElement {
  const url = portraitURL(library, u.spritePath ?? null);
  if (url) return h('img', { src: url, alt: '', draggable: false });
  const initials =
    u.initials ??
    (u.name ?? '?')
      .replace(/#\d+$/, '')
      .trim()
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  return h(
    'div',
    { class: 'gl sp-glyph', style: `width:${size}px;height:${size}px;background:${u.color ?? '#555'}` },
    initials,
  );
}
