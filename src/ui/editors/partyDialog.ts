/**
 * Manage Party popup (CharacterSheetView.java:384-625): Available and Active
 * Party lists, Add > / < Remove, and drag-and-drop between and within them.
 * Every change writes party.json. Dragging from Available onto Active works
 * (FEATURES.md F-54: in Java it did nothing).
 */
import type { AssetStore } from '../../editors/assetStore.ts';
import { button, h, replaceChildren } from '../dom.ts';
import { modal } from '../panels/dialogs.ts';
import { drawSpritePreview } from './spritePicker.ts';

export function openPartyDialog(assets: AssetStore): void {
  let selected: { list: 'available' | 'active'; name: string } | null = null;
  const availableEl = h('div', { class: 'party-list', dataset: { testid: 'party-available' } });
  const activeEl = h('div', { class: 'party-list', dataset: { testid: 'party-active' } });

  const active = () => assets.bundle.partyList.filter((n) => n in assets.bundle.party);
  const available = () =>
    Object.keys(assets.bundle.party)
      .filter((n) => !assets.bundle.partyList.includes(n))
      .sort((a, b) => a.localeCompare(b));

  const row = (name: string, list: 'available' | 'active') => {
    const sheet = assets.bundle.party[name];
    const icon = h('canvas', { width: 24, height: 24, class: 'party-icon' });
    if (!drawSpritePreview(icon, sheet?.spritePath ?? null, 24)) {
      const ctx = icon.getContext('2d');
      if (ctx) {
        ctx.fillStyle = sheet?.color ?? '#808080';
        ctx.beginPath();
        ctx.arc(12, 12, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const el = h(
      'div',
      {
        class: `party-row${selected?.name === name && selected.list === list ? ' on' : ''}`,
        draggable: 'true',
        onclick: () => {
          selected = { list, name };
          render();
        },
        ondblclick: () => (list === 'available' ? add(name) : remove(name)),
        dataset: { testid: `party-${list}-${name}` },
      },
      icon,
      h('span', {}, name),
    );
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', JSON.stringify({ list, name }));
    });
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropOn(e, list, name);
    });
    return el;
  };

  const dropOn = (e: DragEvent, targetList: 'available' | 'active', beforeName: string | null) => {
    const raw = e.dataTransfer?.getData('text/plain');
    if (!raw) return;
    const src = JSON.parse(raw) as { list: 'available' | 'active'; name: string };
    if (targetList === 'available') {
      if (src.list === 'active') remove(src.name);
      return;
    }
    const list = active().filter((n) => n !== src.name);
    const at = beforeName === null ? list.length : Math.max(0, list.indexOf(beforeName));
    list.splice(at, 0, src.name);
    assets.setPartyList(list);
    selected = { list: 'active', name: src.name };
    render();
  };
  for (const [el, list] of [
    [availableEl, 'available'],
    [activeEl, 'active'],
  ] as const) {
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      dropOn(e, list, null);
    });
  }

  const add = (name: string) => {
    assets.setPartyList([...active(), name]);
    selected = { list: 'active', name };
    render();
  };
  const remove = (name: string) => {
    assets.setPartyList(active().filter((n) => n !== name));
    selected = { list: 'available', name };
    render();
  };

  const render = () => {
    replaceChildren(
      availableEl,
      available().length
        ? available().map((n) => row(n, 'available'))
        : h('div', { class: 'muted small' }, 'Everyone is in the party'),
    );
    replaceChildren(
      activeEl,
      active().length
        ? active().map((n) => row(n, 'active'))
        : h('div', { class: 'muted small' }, 'No one in the party'),
    );
  };
  render();
  const body = h(
    'div',
    { class: 'party-dialog' },
    h('div', { class: 'col' }, h('strong', {}, 'Available'), availableEl),
    h(
      'div',
      { class: 'col party-buttons' },
      button('Add >', () => selected?.list === 'available' && add(selected.name), {
        dataset: { testid: 'party-add' },
      }),
      button('< Remove', () => selected?.list === 'active' && remove(selected.name), {
        dataset: { testid: 'party-remove' },
      }),
    ),
    h(
      'div',
      { class: 'col' },
      h('strong', {}, 'Active Party'),
      activeEl,
      h('div', { class: 'muted small' }, 'Drag to reorder: placement follows this order.'),
    ),
  );
  const m = modal('Manage Party', body, [
    button('Close', () => m.close(), { class: 'primary', dataset: { testid: 'party-close' } }),
  ]);
  m.el.classList.add('editor-dialog');
  m.el.dataset.testid = 'party-dialog';
}
