/**
 * Small form toolkit for the editor dialogs: labelled rows that can be shown
 * and hidden as a unit (FormUtils/addRow in Java), integer spinners that keep
 * their last valid value on bad input (Spinner.commitValue), selects, colour
 * pickers, checkboxes, and a scrolling modal.
 */
import { normalizeHex } from '../../assets/color.ts';
import { button, h } from '../dom.ts';
import { alertDialog, modal } from '../panels/dialogs.ts';

export interface Row {
  el: HTMLElement;
  label: HTMLElement;
  show(visible: boolean): void;
  setLabel(text: string): void;
}

export function formGrid(): {
  el: HTMLElement;
  row: (label: string, control: HTMLElement) => Row;
  section: (title: string) => HTMLElement;
} {
  const el = h('div', { class: 'form-grid' });
  return {
    el,
    row(label, control) {
      const lab = h('label', { class: 'form-label' }, label);
      const row = h('div', { class: 'form-row' }, lab, h('div', { class: 'form-control' }, control));
      el.appendChild(row);
      return {
        el: row,
        label: lab,
        show: (visible) => {
          row.hidden = !visible;
        },
        setLabel: (text) => {
          lab.textContent = text;
        },
      };
    },
    section(title) {
      const s = h('div', { class: 'form-section' }, title);
      el.appendChild(s);
      return s;
    },
  };
}

export function textField(value: string, attrs: Record<string, unknown> = {}): HTMLInputElement {
  const el = h('input', { type: 'text', ...attrs });
  el.value = value;
  return el;
}

export function textArea(value: string, rows = 3, attrs: Record<string, unknown> = {}): HTMLTextAreaElement {
  const el = h('textarea', { rows, ...attrs });
  el.value = value;
  return el;
}

export interface IntField {
  el: HTMLInputElement;
  /** committed value: clamped; invalid text keeps the last valid value (like commitValue) */
  get(): number;
  set(v: number): void;
  /** true when the text is not an integer (dialogs that alert "Please enter valid numbers.") */
  invalid(): boolean;
}

export function intField(
  value: number,
  min: number,
  max: number,
  attrs: Record<string, unknown> = {},
): IntField {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.trunc(v)));
  let last = clamp(value);
  const el = h('input', { type: 'number', min, max, step: 1, inputmode: 'numeric', class: 'spin', ...attrs });
  el.value = String(last);
  const parse = (): number | null => (/^\s*-?\d+\s*$/.test(el.value) ? Number.parseInt(el.value, 10) : null);
  el.addEventListener('change', () => {
    const v = parse();
    if (v !== null) last = clamp(v);
    el.value = String(last);
  });
  return {
    el,
    get() {
      const v = parse();
      if (v !== null) last = clamp(v);
      return last;
    },
    set(v) {
      last = clamp(v);
      el.value = String(last);
    },
    invalid: () => parse() === null,
  };
}

export interface Choice<T extends string | number> {
  value: T;
  label: string;
}

export interface SelectField<T extends string | number> {
  el: HTMLSelectElement;
  get(): T;
  set(v: T): void;
}

export function selectField<T extends string | number>(
  choices: readonly (Choice<T> | T)[],
  value: T,
  attrs: Record<string, unknown> = {},
): SelectField<T> {
  const list: Choice<T>[] = choices.map((c) => (typeof c === 'object' ? c : { value: c, label: String(c) }));
  const el = h('select', attrs, ...list.map((c, i) => h('option', { value: String(i) }, c.label)));
  const set = (v: T) => {
    const i = list.findIndex((c) => c.value === v);
    el.value = String(i >= 0 ? i : 0);
  };
  set(value);
  return {
    el,
    get: () => (list[Number(el.value)] ?? list[0])?.value as T,
    set,
  };
}

export function colorField(
  hex: string,
  attrs: Record<string, unknown> = {},
): { el: HTMLInputElement; get(): string } {
  const el = h('input', { type: 'color', ...attrs });
  el.value = normalizeHex(hex, '#808080').toLowerCase();
  return { el, get: () => el.value.toUpperCase() };
}

export function checkField(
  label: string,
  checked: boolean,
  attrs: Record<string, unknown> = {},
): { el: HTMLElement; box: HTMLInputElement; get(): boolean } {
  const box = h('input', { type: 'checkbox', ...attrs });
  box.checked = checked;
  return { el: h('label', { class: 'check' }, box, ' ', label), box, get: () => box.checked };
}

/**
 * A modal editor dialog. `onOk` returns true to close; false keeps the dialog
 * open (validation failed and it already explained why).
 */
export function editorDialog(opts: {
  title: string;
  body: HTMLElement;
  okLabel?: string;
  width?: number;
  testid?: string;
  onOk: () => boolean;
  onCancel?: () => void;
}): { close: () => void; el: HTMLElement } {
  const ok = button(
    opts.okLabel ?? 'OK',
    () => {
      if (opts.onOk()) m.close();
    },
    { class: 'primary', dataset: { testid: 'dialog-ok' } },
  );
  const cancel = button(
    'Cancel',
    () => {
      m.close();
      opts.onCancel?.();
    },
    { dataset: { testid: 'dialog-cancel' } },
  );
  const scroller = h('div', { class: 'dialog-scroll' }, opts.body);
  const m = modal(opts.title, scroller, [ok, cancel]);
  m.el.classList.add('editor-dialog');
  m.el.style.width = `${opts.width ?? 460}px`;
  if (opts.testid) m.el.dataset.testid = opts.testid;
  m.el.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (e.key === 'Enter' && target.tagName !== 'TEXTAREA' && target.tagName !== 'BUTTON') {
      e.preventDefault();
      ok.click();
    } else if (e.key === 'Escape') cancel.click();
  });
  const first = opts.body.querySelector<HTMLElement>('input, select, textarea');
  setTimeout(() => first?.focus(), 0);
  return m;
}

/** Validation alert that keeps the editor open. */
export function warn(title: string, message: string): false {
  alertDialog(title, message);
  return false;
}
