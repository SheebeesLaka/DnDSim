/** Modal dialogs (confirm, alert, the editors' forms) and the victory overlay. */
import { button, h } from '../dom.ts';

export function modal(
  title: string,
  body: HTMLElement,
  buttons: HTMLElement[],
): { close: () => void; el: HTMLElement } {
  const dialog = h(
    'div',
    { class: 'dialog', role: 'dialog' },
    h('h3', {}, title),
    body,
    h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px' }, ...buttons),
  );
  const overlay = h('div', { class: 'overlay' }, dialog);
  document.body.appendChild(overlay);
  return { close: () => overlay.remove(), el: dialog };
}

export function confirmDialog(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const m = modal(title, h('div', {}, message), [
      button('OK', () => (m.close(), resolve(true)), { class: 'primary', dataset: { testid: 'confirm-ok' } }),
      button('Cancel', () => (m.close(), resolve(false))),
    ]);
  });
}

export function alertDialog(title: string, message: string): void {
  const m = modal(title, h('div', { style: 'white-space:pre-line' }, message), [
    button('OK', () => m.close(), { class: 'primary' }),
  ]);
}

const QUOTES = [
  'Veni, vidi, vici.',
  'Fortes fortuna adiuvat.',
  'Alea iacta est.',
  'Audentes fortuna iuvat.',
  'Dum spiro, spero.',
  'Per aspera ad astra.',
  'Carpe diem.',
  'Acta non verba.',
  'Vincit qui se vincit.',
  'Amor vincit omnia.',
];

/** VictoryView. `hpNumbers: false` keeps the bars but hides "hp / max" (the TV's party HP numbers option). */
export function victoryOverlay(
  party: { name: string; hp: number; maxHp: number; statuses: string[] }[],
  onContinue: (() => void) | null,
  { hpNumbers = true }: { hpNumbers?: boolean } = {},
): HTMLElement {
  const rows = party.map((p) => {
    const pct = p.maxHp > 0 ? p.hp / p.maxHp : 0;
    return h(
      'div',
      { class: 'row', style: 'width:360px;justify-content:space-between' },
      h('span', { style: 'font-weight:700' }, p.name),
      h(
        'div',
        { class: 'hpbar', style: 'width:120px' },
        h('div', {
          style: `width:${Math.max(0, Math.min(100, pct * 100))}%;background:${pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#e0a030' : '#d75f5f'}`,
        }),
      ),
      hpNumbers ? h('span', { dataset: { testid: 'victory-hp' } }, `${p.hp} / ${p.maxHp}`) : null,
      h(
        'span',
        { class: 'small', style: p.statuses.length ? 'color:#d75f5f' : 'color:#4caf50' },
        p.statuses.length
          ? p.statuses
              .slice(0, 3)
              .map((s) => s.slice(0, 4).toUpperCase())
              .join(' ') + (p.statuses.length > 3 ? ` +${p.statuses.length - 3}` : '')
          : 'OK',
      ),
    );
  });
  const el = h(
    'div',
    { class: 'victory', dataset: { testid: 'victory' } },
    h('h1', {}, 'Victory!'),
    h(
      'div',
      { style: 'font-family:Georgia,serif;font-style:italic;color:#c0a060' },
      QUOTES[Math.floor(Math.random() * QUOTES.length)] ?? '',
    ),
    h('div', { class: 'header' }, 'Party Status'),
    ...rows,
    onContinue
      ? button('Continue', () => (el.remove(), onContinue()), {
          class: 'primary',
          dataset: { testid: 'victory-continue' },
        })
      : null,
  );
  return el;
}
