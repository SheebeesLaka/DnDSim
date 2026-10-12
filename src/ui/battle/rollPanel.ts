/**
 * The roll panel: attacker and target facing each other, the d20, the formula
 * with every modifier named, the margin bar (MISS · T1 · T2 · T3), the dice and
 * the damage, all from the RollVM. Shared by the DM screen (with buttons) and
 * the TV (read-only). Digits are typed through the screen's key handler, not
 * into inputs, so re-rendering never steals focus.
 */
import type { Part } from '../../engine/selectors/breakdown.ts';
import type { FighterVM, RollVM } from '../../engine/view/rollPreview.ts';
import type { SpriteLibrary } from '../sprites/library.ts';
import { h } from '../dom.ts';
import { emblem, pips, portrait, shortName } from './art.ts';

export interface RollPanelActions {
  submit: () => void;
  cancel: () => void;
  /** the area step's "auto-roll the empty ones" */
  autoFill?: () => void;
}

const D20_SVG = `<svg viewBox="0 0 84 84"><defs><linearGradient id="spdg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1c0"/><stop offset="1" stop-color="#ffd36b"/></linearGradient></defs>
  <polygon points="42,3 78,23 78,61 42,81 6,61 6,23" fill="url(#spdg)"/><polygon points="42,3 78,23 42,30 6,23" fill="rgba(255,255,255,.35)"/><polyline points="6,61 42,30 78,61" fill="none" stroke="rgba(0,0,0,.15)" stroke-width="2"/></svg>`;
const D20_EMPTY = `<svg viewBox="0 0 84 84"><polygon points="42,3 78,23 78,61 42,81 6,61 6,23" fill="rgba(255,255,255,.08)" stroke="rgba(255,211,107,.6)" stroke-width="2" stroke-dasharray="5 4"/></svg>`;
const hexSvg = (fill: string) =>
  `<svg viewBox="0 0 50 50"><polygon points="25,2 46,13.5 46,36.5 25,48 4,36.5 4,13.5" fill="${fill}"/></svg>`;

const MINUS = '−';
const signedAbs = (v: number) => (v < 0 ? `${MINUS}` : '+');

function chip(value: string | number, label: string, cls = ''): HTMLElement {
  return h('div', { class: `sp-fc ${cls}` }, h('b', {}, String(value)), h('span', {}, label));
}

/** A modifier chip: buffs green, debuffs red, base stats plain. */
function partChip(p: Part, first: boolean): HTMLElement[] {
  const cls = p.kind === 'status' || p.kind === 'adjust' ? (p.value >= 0 ? 'up' : 'down') : '';
  const op = h('span', { class: 'sp-op' }, first && p.value >= 0 ? '+' : signedAbs(p.value));
  return [op, chip(Math.abs(p.value), p.label, cls)];
}

function fighter(
  f: FighterVM,
  side: 'l' | 'r',
  library: SpriteLibrary | undefined,
  hpLabel: 'damage' | 'heal' | null,
): HTMLElement {
  const hpShown = f.hpShown ?? 'exact';
  const after = f.hpAfter;
  const bar = h('div', { class: 'sp-hpbar' });
  if (hpShown !== 'none') {
    const pct = (v: number) => `${Math.max(0, Math.min(1, v / Math.max(1, f.maxHp))) * 100}%`;
    const color = f.side === 'party' ? 'var(--party)' : f.side === 'enemy' ? 'var(--enemy)' : 'var(--cool)';
    if (after !== null && after < f.hp) {
      bar.append(h('i', { style: `width:${pct(after)};background:${color}` }));
      bar.append(
        h('i', { class: 'loss', style: `left:${pct(after)};width:calc(${pct(f.hp)} - ${pct(after)})` }),
      );
    } else if (after !== null && after > f.hp) {
      bar.append(h('i', { style: `width:${pct(f.hp)};background:${color}` }));
      bar.append(
        h('i', { class: 'gain', style: `left:${pct(f.hp)};width:calc(${pct(after)} - ${pct(f.hp)})` }),
      );
    } else bar.append(h('i', { style: `width:${pct(f.hp)};background:${color}` }));
  }
  const hpLine =
    hpShown === 'exact'
      ? h(
          'div',
          { class: 'hp', style: f.side === 'party' ? 'color:var(--party)' : '' },
          String(f.hp),
          ' ',
          h('small', {}, `/ ${f.maxHp}`),
          after !== null && after !== f.hp
            ? h('span', { class: `to${hpLabel === 'heal' ? ' heal' : ''}` }, ` → ${after}`)
            : null,
        )
      : null;
  const stats = h(
    'div',
    { class: 'stats' },
    ...f.stats.map((s) =>
      h(
        'span',
        {},
        s.label,
        h(
          'b',
          { class: s.delta > 0 ? 'up' : s.delta < 0 ? 'down' : '' },
          s.label === 'ATK' ? `${s.value >= 0 ? '+' : ''}${s.value}` : String(s.value),
        ),
      ),
    ),
  );
  const cards = h(
    'div',
    { class: 'stcards' },
    ...f.effects
      .slice(0, 3)
      .map((e) =>
        h(
          'div',
          { class: 'sp-stc', title: `${e.name}${e.source ? ` · ${e.source}` : ''}` },
          emblem(e.name, e.family, 30),
          h(
            'div',
            {},
            h('div', { class: 'n2' }, e.name),
            h('div', { class: 'f' }, e.fx || '—', pips(e.left, e.full, e.family, true, 5)),
          ),
        ),
      ),
  );
  return h(
    'div',
    { class: `sp-ft ${side} ${f.side}` },
    h('div', { class: 'pt' }, portrait(library, f, 56)),
    h(
      'div',
      { class: 'info' },
      h('div', { class: 'n', title: f.name }, shortName(f.name, 18)),
      h('div', { class: 's' }, f.subtitle),
      hpLine,
      bar,
      stats,
    ),
    cards,
  );
}

const OUTCOME_COLORS: Record<string, string> = {
  miss: '#ff6b5e',
  saved: '#9fd8ff',
  half: '#9fd8ff',
  failed: '#c4f36b',
  hit: '#c4f36b',
  crit: '#ffd36b',
  heal: '#7ee787',
  auto: '#a98bff',
};

function centre(roll: RollVM): HTMLElement {
  const el = h('div', { class: 'sp-vsd' });
  const d = roll.d20;
  if (d) {
    el.classList.toggle('active', d.active);
    el.classList.toggle('empty', d.value === null && !d.typed);
    el.innerHTML = d.value === null && !d.typed ? D20_EMPTY : D20_SVG;
    el.append(h('span', { class: 'v' }, d.typed || (d.active ? '' : '?')));
  } else {
    el.innerHTML = D20_SVG;
    el.append(
      h(
        'span',
        { class: 'v', style: 'font-size:18px' },
        roll.kind === 'item' ? 'd10' : roll.kind === 'auto' ? 'AUTO' : roll.kind === 'heal' ? 'HEAL' : '✦',
      ),
    );
  }
  const tag = roll.banner ?? (d ? 'D20' : '');
  el.append(
    h(
      'span',
      { class: 't', style: roll.outcome ? `color:${OUTCOME_COLORS[roll.outcome] ?? 'var(--now)'}` : '' },
      tag,
    ),
  );
  return el;
}

function formula(roll: RollVM): HTMLElement | null {
  if (!roll.d20) return null;
  const items: HTMLElement[] = [chip(roll.d20.typed || '?', 'd20', roll.d20.value === null ? 'ghost' : '')];
  roll.modParts.forEach((p) => items.push(...partChip(p, false)));
  items.push(h('span', { class: 'sp-op' }, '='));
  items.push(
    chip(roll.total ?? '?', roll.kind === 'save' ? 'save' : '', `sum${roll.total === null ? ' ghost' : ''}`),
  );
  if (roll.vs) {
    items.push(h('span', { class: 'sp-op' }, 'vs'));
    const affected = roll.vs.parts
      .filter((p) => p.kind === 'status' || p.kind === 'adjust')
      .reduce((s, p) => s + p.value, 0);
    const cls = affected === 0 ? '' : affected > 0 === (roll.vs.label === 'AC') ? 'down' : 'up';
    const vsChip = chip(roll.vs.value, roll.vs.label, cls);
    vsChip.title = roll.vs.parts.map((p) => `${p.label} ${p.value >= 0 ? '+' : ''}${p.value}`).join(' · ');
    items.push(vsChip);
  }
  return h('div', { class: 'sp-formula' }, ...items);
}

/** MISS (6 cells below 0) · T1 0–4 · T2 5–7 · T3 8+ (4 cells): the white mark sits on the margin. */
function meter(roll: RollVM): HTMLElement | null {
  if (!roll.d20 || roll.kind === 'save') return roll.kind === 'save' ? saveMeter(roll) : null;
  const m = roll.margin;
  const bar = h('div', { class: 'bar' });
  for (let v = -6; v <= 11; v++) {
    const cls = v < 0 ? 'miss' : v <= 4 ? 't1' : v <= 7 ? 't2' : 't3';
    const lit = m !== null && (m < 0 ? v < 0 && v >= Math.max(-6, m) : v >= 0 && v <= Math.min(11, m));
    bar.append(h('i', { class: `${cls}${lit ? ' lit' : ''}` }));
  }
  const el = h('div', { class: 'sp-meter' }, bar);
  if (m !== null) {
    const pos = (Math.max(-6, Math.min(11, m)) + 6 + 0.5) / 18;
    el.append(
      h(
        'span',
        { class: 'mark', style: `left:calc(${pos * 100}% - 1.5px)` },
        h('b', {}, `${m >= 0 ? '+' : MINUS}${Math.abs(m)}`),
      ),
    );
  }
  const t = roll.tier;
  el.append(
    h(
      'div',
      { class: 'lg' },
      h('span', {}, 'MISS · below ' + (roll.vs?.label ?? 'AC')),
      h('span', { class: t === 1 ? 'on' : '' }, 'T1 · 0–4'),
      h('span', { class: t === 2 ? 'on' : '' }, 'T2 · 5–7'),
      h(
        'span',
        { class: t === 3 ? 'on t3' : '' },
        `T3 · 8+${roll.toNextTier && roll.tier === 2 ? ` (${roll.toNextTier} more)` : ''}`,
      ),
    ),
  );
  return el;
}

/** Saves read the other way round: below the DC fails, by how much picks the tier. */
function saveMeter(roll: RollVM): HTMLElement | null {
  if (!roll.d20) return null;
  const m = roll.margin; // DC − total − 1: negative = saved
  const bar = h('div', { class: 'bar' });
  for (let v = -6; v <= 11; v++) {
    const cls = v < 0 ? 'miss' : v <= 4 ? 't1' : v <= 7 ? 't2' : 't3';
    const lit = m !== null && (m < 0 ? v < 0 && v >= Math.max(-6, m) : v >= 0 && v <= Math.min(11, m));
    bar.append(h('i', { class: `${cls}${lit ? ' lit' : ''}` }));
  }
  const el = h('div', { class: 'sp-meter' }, bar);
  if (m !== null) {
    const pos = (Math.max(-6, Math.min(11, m)) + 6 + 0.5) / 18;
    el.append(
      h(
        'span',
        { class: 'mark', style: `left:calc(${pos * 100}% - 1.5px)` },
        h('b', {}, m < 0 ? 'saved' : `failed by ${m + 1}`),
      ),
    );
  }
  el.append(
    h(
      'div',
      { class: 'lg' },
      h('span', { style: 'color:var(--cool)' }, 'SAVED · ≥ DC'),
      h('span', { class: roll.tier === 1 ? 'on' : '' }, 'T1 · fail 1–5'),
      h('span', { class: roll.tier === 2 ? 'on' : '' }, 'T2 · 6–8'),
      h('span', { class: roll.tier === 3 ? 'on t3' : '' }, 'T3 · 9+'),
    ),
  );
  return el;
}

function tray(roll: RollVM): HTMLElement | null {
  const dice =
    roll.dice.length > 0
      ? roll.dice
      : roll.previewDice.map((d) => ({ die: d, typed: '', value: null, active: false }));
  if (dice.length === 0 && roll.damage === null) {
    if (roll.outcome === 'miss' || roll.outcome === 'saved' || roll.kind === 'buff')
      return h(
        'div',
        { class: 'sp-tray' },
        h(
          'div',
          { style: 'color:var(--ink-2)' },
          roll.kind === 'buff'
            ? 'No dice: the effect lands as cast.'
            : 'Nothing lands. Enter to confirm, Esc to take it back.',
        ),
      );
    return null;
  }
  const ghost = roll.dice.length === 0;
  const items: HTMLElement[] = [];
  dice.forEach((d, i) => {
    if (i > 0) items.push(h('span', { class: 'sp-op' }, '+'));
    const fill = ghost
      ? 'rgba(238,243,247,.12)'
      : d.active
        ? '#ffe08f'
        : d.value !== null
          ? '#eef3f7'
          : 'rgba(238,243,247,.22)';
    const el = h(
      'div',
      { class: `sp-hex${ghost ? ' ghost' : ''}${d.active ? ' active' : ''}` },
      h('small', {}, `${ghost ? '' : `T${Math.min(i + 1, 3)} `}${d.die}`),
      h('b', {}, d.typed || (ghost ? '' : d.active ? '' : '·')),
    );
    el.insertAdjacentHTML('afterbegin', hexSvg(fill));
    items.push(el);
  });
  roll.bonusParts.forEach((p) => {
    if (p.value === 0 && roll.bonusParts.length > 1) return;
    items.push(h('span', { class: 'sp-op' }, p.value >= 0 ? '+' : MINUS));
    const cls = p.kind === 'status' || p.kind === 'adjust' ? (p.value >= 0 ? 'up' : 'down') : '';
    const c = chip(Math.abs(p.value), p.label, cls);
    c.style.height = '30px';
    (c.firstChild as HTMLElement).style.lineHeight = '30px';
    (c.firstChild as HTMLElement).style.fontSize = '16px';
    items.push(c);
  });
  if (roll.crit) items.push(h('span', { class: 'sp-op', style: 'color:var(--now);font-weight:700' }, '×1.5'));
  if (roll.halve) items.push(h('span', { class: 'sp-op', style: 'color:var(--cool);font-weight:700' }, '½'));
  const who = roll.target ?? roll.attacker;
  const sign = roll.heal ? '+' : MINUS;
  items.push(
    h(
      'div',
      { class: 'sp-dmg' },
      h('b', { class: roll.heal ? 'heal' : '' }, roll.damage === null ? '—' : `${sign}${roll.damage}`),
      h(
        'div',
        {},
        who && roll.damage !== null && (who.hpShown ?? 'exact') === 'exact' && who.hpAfter !== null
          ? `${shortName(who.name, 18)} · ${who.hp} → ${who.hpAfter}`
          : ghost
            ? 'roll these next'
            : roll.complete
              ? ''
              : 'type each die',
      ),
    ),
  );
  return h('div', { class: 'sp-tray' }, ...items);
}

function area(roll: RollVM): HTMLElement | null {
  if (!roll.area) return null;
  return h(
    'div',
    { class: 'sp-area' },
    ...roll.area.map((r) =>
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'nm' }, r.name),
        h(
          'span',
          {
            class: `d${roll.step === 'areaD20s' && !r.typed && roll.area?.find((x) => !x.typed) === r ? ' active' : ''}`,
          },
          r.typed || (r.d20 !== null ? String(r.d20) : '·'),
        ),
        h(
          'span',
          {
            class: 'o',
            style: r.outcome ? `color:${OUTCOME_COLORS[r.outcome] ?? 'inherit'}` : 'color:var(--ink-3)',
          },
          r.outcome
            ? `${r.outcome.toUpperCase()}${r.tier ? ` T${r.tier}` : ''}${r.damage !== null ? ` · ${r.damage}` : ''}`
            : r.total !== null
              ? String(r.total)
              : '—',
        ),
      ),
    ),
  );
}

export function renderRollPanel(
  roll: RollVM,
  library: SpriteLibrary | undefined,
  actions?: RollPanelActions,
): HTMLElement {
  const panel = h('div', { class: 'sp-panel sp-roll', dataset: { testid: 'roll-panel' } });
  const left = roll.attacker;
  const right = roll.target && roll.target.id !== roll.attacker?.id ? roll.target : null;
  const hpLabel = roll.heal ? 'heal' : 'damage';
  if (left || right) {
    panel.append(
      h(
        'div',
        { class: 'sp-fighters' },
        left ? fighter(left, 'l', library, roll.target?.id === left.id ? hpLabel : null) : h('div'),
        centre(roll),
        right
          ? fighter(right, 'r', library, hpLabel)
          : h(
              'div',
              { class: 'sp-ft r', style: 'background:none;align-content:center' },
              h(
                'div',
                { class: 'info', style: 'grid-column:1/3' },
                h('div', { class: 'n' }, roll.title),
                h('div', { class: 's' }, roll.detail),
              ),
            ),
      ),
    );
  }
  const f = formula(roll);
  if (f) panel.append(f);
  const m = meter(roll);
  if (m) panel.append(m);
  const a = area(roll);
  if (a) panel.append(a);
  const t = tray(roll);
  if (t) panel.append(t);
  if (actions) {
    const ready =
      roll.step === 'confirm' ||
      (roll.step === 'd20' && roll.d20?.value !== null) ||
      (roll.step === 'damage' && roll.complete) ||
      (roll.step === 'd10Efficacy' && roll.complete) ||
      (roll.step === 'areaD20s' && (roll.area ?? []).every((r) => r.d20 !== null));
    panel.append(
      h(
        'div',
        { class: 'sp-rkeys' },
        h('span', {}, `${roll.title}${roll.detail ? ` · ${roll.detail}` : ''}`),
        h(
          'button',
          { type: 'button', onclick: actions.cancel, dataset: { testid: 'roll-cancel' } },
          h('span', { class: 'sp-k' }, 'Esc'),
          'back',
        ),
        roll.step === 'areaD20s' && actions.autoFill
          ? h(
              'button',
              { type: 'button', onclick: actions.autoFill },
              h('span', { class: 'sp-k' }, 'A'),
              'auto-roll empty',
            )
          : null,
        h('span', {}, h('span', { class: 'sp-k' }, 'Tab'), ' next'),
        h(
          'button',
          {
            type: 'button',
            class: 'go',
            disabled: !ready,
            onclick: actions.submit,
            dataset: { testid: 'roll-submit' },
          },
          roll.step === 'confirm'
            ? 'OK'
            : roll.step === 'damage' || roll.step === 'd10Efficacy'
              ? 'Apply'
              : 'Roll',
          ' ⏎',
        ),
      ),
    );
  }
  return panel;
}
