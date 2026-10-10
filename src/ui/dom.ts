/** Tiny DOM helper for the throwaway Phase 2 UI (no framework). */
type Child = Node | string | number | null | undefined | false | Child[];

export type Attrs = Record<string, unknown> & {
  class?: string;
  style?: string;
  title?: string;
  onclick?: (ev: MouseEvent) => void;
  oninput?: (ev: Event) => void;
  onchange?: (ev: Event) => void;
  onkeydown?: (ev: KeyboardEvent) => void;
  dataset?: Record<string, string>;
};

const str = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v);

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = str(v);
    else if (k === 'style') el.setAttribute('style', str(v));
    else if (k === 'dataset')
      for (const [dk, dv] of Object.entries(v as Record<string, string>)) el.dataset[dk] = dv;
    else if (k.startsWith('on') && typeof v === 'function') (el as unknown as Record<string, unknown>)[k] = v;
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, str(v));
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function replaceChildren(el: Element, ...children: Child[]): void {
  clear(el);
  append(el, children);
}

export const button = (label: string, onclick: () => void, attrs: Attrs = {}): HTMLButtonElement =>
  h('button', { type: 'button', ...attrs, onclick }, label);

export function numberInput(
  value: number | '',
  attrs: Attrs & { min?: number; max?: number } = {},
): HTMLInputElement {
  const el = h('input', { type: 'number', inputmode: 'numeric', ...attrs });
  el.value = value === '' ? '' : String(value);
  return el;
}

export const readInt = (el: HTMLInputElement): number | null => {
  const v = el.value.trim();
  if (v === '' || !/^-?\d+$/.test(v)) return null;
  return Number.parseInt(v, 10);
};
