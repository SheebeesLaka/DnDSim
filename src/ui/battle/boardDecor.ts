/**
 * DOM decorations pinned to the 3D board every frame it draws: HP pips and
 * status emblems over each creature (Into the Breach style), a name tag for
 * whoever is acting / targeted / selected / flying / dying, ground rings, and
 * in Field mode the lamp pins and the selected light's radius rings.
 * Nodes are reused per unit; contents rebuild only when that unit changes.
 */
import type { BoardVM, UnitVM } from '../../engine/view/boardViewModel.ts';
import type { BoardProjector } from '../renderer/BoardRenderer.ts';
import { h, replaceChildren } from '../dom.ts';
import { emblem, icon, pips, shortName } from './art.ts';

interface Node {
  el: HTMLElement;
  sig: string;
}

export interface DecorOptions {
  /** DM only: clicking a lamp pin selects that light */
  onLamp?: (lightId: string) => void;
}

export class BoardDecor {
  private units = new Map<string, Node>();
  private rings: HTMLElement[] = [];
  private pins = new Map<string, Node>();
  private ringSvg: SVGSVGElement;
  private vm: BoardVM | null = null;

  constructor(
    private layer: HTMLElement,
    private opts: DecorOptions = {},
  ) {
    this.ringSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.ringSvg.classList.add('sp-rings');
    this.layer.append(this.ringSvg);
  }

  setVM(vm: BoardVM): void {
    this.vm = vm;
  }

  private unitSig(u: UnitVM, vm: BoardVM): string {
    const after = vm.roll?.target?.id === u.id ? vm.roll.target.hpAfter : null;
    return JSON.stringify([
      u.hp,
      u.maxHp,
      u.showHpRing,
      u.active,
      u.selected,
      u.altitude,
      u.dying ? 1 : 0,
      u.name,
      after,
      vm.roll?.target?.id === u.id,
      (u.effects ?? []).map((e) => [e.name, e.left, e.full, e.family]),
    ]);
  }

  private buildUnit(u: UnitVM, vm: BoardVM): HTMLElement[] {
    const out: HTMLElement[] = [];
    const fx = u.effects ?? [];
    if (fx.length > 0)
      out.push(
        h(
          'div',
          { style: 'display:flex;gap:3px' },
          ...fx
            .slice(0, 3)
            .map((e) =>
              h(
                'span',
                { class: 'sp-bsts' },
                emblem(e.name, e.family, 18),
                pips(e.left, e.full, e.family, true, 3),
              ),
            ),
        ),
      );
    if (u.showHpRing && u.maxHp > 0) {
      const after = vm.roll?.target?.id === u.id ? vm.roll.target.hpAfter : null;
      const bar = h('div', { class: `sp-hpp ${u.side}` });
      const n = u.maxHp > 48 ? 0 : u.maxHp > 24 ? Math.ceil(u.maxHp / 2) : u.maxHp;
      if (n === 0) {
        // very large pools: a plain bar
        bar.classList.add('bar');
        const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
        bar.append(h('i', { class: 'f', style: `flex:${pct}` }), h('i', { style: `flex:${1 - pct}` }));
      } else
        for (let i = 0; i < n; i++) {
          const v = ((i + 1) * u.maxHp) / n;
          const filled = v <= u.hp + 1e-9;
          const losing = filled && after !== null && v > after + 1e-9;
          bar.append(h('i', { class: losing ? 'loss' : filled ? 'f' : '' }));
        }
      out.push(bar);
    }
    const isTarget = vm.roll?.target?.id === u.id;
    const named = u.active || isTarget || u.selected || u.altitude > 0 || u.dying;
    if (named)
      out.push(
        h(
          'div',
          { class: `sp-bnm${u.dying ? ' dying' : ''}` },
          u.dying ? 'Dying · ' : '',
          u.active || isTarget || u.selected || u.dying ? shortName(u.name, 16) : '',
          u.altitude > 0 ? h('span', { class: 'fly' }, ` ▲${u.altitude * 5} ft`) : null,
        ),
      );
    return out;
  }

  /** Called from the renderer's draw hook with fresh screen positions. */
  draw(p: BoardProjector): void {
    const vm = this.vm;
    if (!vm) return;
    const seen = new Set<string>();
    for (const u of vm.units) {
      if (u.kind !== 'entity' && u.kind !== 'enemy') continue;
      const pos = p.unit(u.id);
      if (!pos) continue;
      seen.add(u.id);
      let node = this.units.get(u.id);
      if (!node) {
        node = { el: h('div', { class: 'sp-bu', dataset: { testid: `decor-${u.id}` } }), sig: '' };
        this.units.set(u.id, node);
        this.layer.append(node.el);
      }
      const sig = this.unitSig(u, vm);
      if (sig !== node.sig) {
        replaceChildren(node.el, ...this.buildUnit(u, vm));
        node.sig = sig;
      }
      node.el.style.left = `${Math.round(pos.head.x)}px`;
      node.el.style.top = `${Math.round(pos.head.y - 20)}px`;
    }
    for (const [id, node] of this.units)
      if (!seen.has(id)) {
        node.el.remove();
        this.units.delete(id);
      }

    // ground rings: acting (gold), target (coral, pulsing), selected (white)
    for (const r of this.rings) r.remove();
    this.rings = [];
    const ring = (id: string | null | undefined, cls: string) => {
      if (!id) return;
      const pos = p.unit(id);
      if (!pos) return;
      const el = h('div', {
        class: `sp-ring ${cls}`,
        style: `left:${Math.round(pos.ground.x)}px;top:${Math.round(pos.ground.y)}px`,
      });
      this.layer.prepend(el);
      this.rings.push(el);
    };
    const active = vm.units.find((u) => u.active)?.id;
    ring(active, 'now');
    const target = vm.roll?.target?.id;
    if (target && target !== active) ring(target, 'tg');
    const sel = vm.selectedId;
    if (sel && sel !== active && sel !== target) ring(sel, 'sel');

    this.drawField(p, vm);
  }

  private drawField(p: BoardProjector, vm: BoardVM): void {
    const field = vm.view === 'dm' && vm.field?.on === true;
    const seen = new Set<string>();
    this.ringSvg.setAttribute('width', String(p.width));
    this.ringSvg.setAttribute('height', String(p.height));
    let rings = '';
    if (field) {
      for (const l of vm.lights) {
        seen.add(l.id);
        const selected = vm.field?.selectedLightId === l.id;
        const at = l.attachedTo ? p.unit(l.attachedTo)?.head : p.cell(l.r, l.c, 1.1);
        if (!at) continue;
        let node = this.pins.get(l.id);
        const sig = JSON.stringify([l.name, l.on, l.color, selected, !!l.attachedTo]);
        if (!node) {
          node = { el: h('div', { class: 'sp-pin', dataset: { testid: `pin-${l.id}` } }), sig: '' };
          this.pins.set(l.id, node);
          this.layer.append(node.el);
          const id = l.id;
          node.el.onclick = () => this.opts.onLamp?.(id);
        }
        if (node.sig !== sig) {
          node.el.className = `sp-pin${l.on ? '' : ' off'}${selected ? ' sel' : ''}`;
          node.el.style.color = l.color;
          replaceChildren(
            node.el,
            h('div', { class: 'head' }, icon('lamp')),
            h('div', { class: 'stem' }),
            h('div', { class: 'lab' }, `${l.name}${l.on ? '' : ' · off'}`),
          );
          node.sig = sig;
        }
        node.el.style.left = `${Math.round(at.x)}px`;
        node.el.style.top = `${Math.round(at.y - (l.attachedTo ? 18 : 0))}px`;
        if (selected) {
          const y = p.topY(l.r, l.c) + 0.02;
          const path = (radius: number) => {
            const pts: string[] = [];
            for (let i = 0; i <= 48; i++) {
              const a = (i / 48) * Math.PI * 2;
              const q = p.point(l.r + Math.sin(a) * radius, l.c + Math.cos(a) * radius, y);
              pts.push(`${q.x.toFixed(1)},${q.y.toFixed(1)}`);
            }
            return pts.join(' ');
          };
          rings += `<polygon points="${path(l.dimRadius)}" fill="${l.color}0d" stroke="${l.color}" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="7 6"/>`;
          rings += `<polygon points="${path(l.brightRadius)}" fill="${l.color}17" stroke="${l.color}" stroke-width="2"/>`;
        }
      }
    }
    this.ringSvg.innerHTML = rings;
    for (const [id, node] of this.pins)
      if (!seen.has(id)) {
        node.el.remove();
        this.pins.delete(id);
      }
  }

  destroy(): void {
    this.layer.replaceChildren();
    this.units.clear();
    this.pins.clear();
  }
}
