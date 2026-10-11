/**
 * UI/CharacterSheetPane.java: one character's sheet. Like Java there is no Save
 * button: every change is written (debounced a little, renames at once). The
 * input fields persist between changes; lists and computed values refresh.
 */
import {
  ATTRIBUTE_SHORT,
  CHAR_GROUPS,
  type CharGroup,
  type CharSheetDef,
  type ItemDef,
} from '../../assets/types.ts';
import { spellSummary, levelLabel } from '../../assets/spellLabels.ts';
import type { AssetStore } from '../../editors/assetStore.ts';
import { groupLabel } from '../../editors/browsers.ts';
import {
  CASTING_STATS,
  INVENTORY_TABS,
  SHEET_STATUS_FLAGS,
  addAbility,
  addItem,
  castingLine,
  equipAccessory,
  equipWeapon,
  forgetSpell,
  hasStatus,
  learnSpell,
  longRest,
  pointsLabel,
  removeAbility,
  removeItem,
  removeItemQuantity,
  setArmorClass,
  setBaseAttribute,
  setCastingStat,
  setCurrentHp,
  setLevel,
  setMaxHp,
  setStatusFlag,
  slotPips,
  statPoints,
  statusMenuText,
  synced,
} from '../../editors/sheetOps.ts';
import { isCaster } from '../../engine/selectors/stats.ts';
import { button, h, replaceChildren } from '../dom.ts';
import { alertDialog, confirmDialog, modal } from '../panels/dialogs.ts';
import { abilityLine, openAbilityDialog } from './abilityEditor.ts';
import { checkField, colorField, editorDialog, formGrid, intField, selectField, warn } from './form.ts';
import { STAT_COLORS, drawRadar } from './radarChart.ts';
import { openSpellEditor } from './spellEditor.ts';
import { drawSpritePreview, spritePicker } from './spritePicker.ts';

export interface SheetPaneDeps {
  assets: AssetStore;
  /** the sheet was deleted */
  onDeleted: () => void;
  /** the sheet was renamed (the list re-selects it) */
  onRenamed: (name: string) => void;
}

const SAVE_DELAY_MS = 250;

export interface SheetPane {
  destroy: () => void;
  flush: () => void;
  /** true while the pane itself is writing (its store events are its own) */
  isWriting: () => boolean;
}

export function mountSheetPane(root: HTMLElement, initial: CharSheetDef, deps: SheetPaneDeps): SheetPane {
  const { assets } = deps;
  let sheet: CharSheetDef = synced(initial);
  let savedName = initial.name;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let abilityTab = 'PASSIVE';
  let invTab: (typeof INVENTORY_TABS)[number]['key'] = 'weapons';
  let writing = false;
  const own = <T>(fn: () => T): T => {
    writing = true;
    try {
      return fn();
    } finally {
      writing = false;
    }
  };

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const res = own(() => assets.saveSheet(sheet, savedName));
    if (!res.ok) alertDialog(res.title, res.message);
    else savedName = sheet.name;
  };
  /** Apply an edit: keep it, refresh the derived bits, write soon. */
  const change = (next: CharSheetDef) => {
    sheet = next;
    refresh();
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  };
  const tid = (id: string) => ({ dataset: { testid: `sheet-${id}` } });

  // ---------------------------------------------------------------- header
  const avatar = h('canvas', { class: 'sheet-avatar', width: 56, height: 56 });
  const nameIn = h('input', { type: 'text', class: 'sheet-name', ...tid('name') });
  nameIn.value = sheet.name;
  const classIn = h('input', { type: 'text', placeholder: 'Class', ...tid('class') });
  classIn.value = sheet.characterClass === 'None' ? '' : sheet.characterClass;
  // Java saves the name on focus loss; a clash puts the old name back
  nameIn.addEventListener('change', () => {
    const name = nameIn.value.trim();
    if (!name || name === sheet.name) return void (nameIn.value = sheet.name);
    if (timer !== null) flush();
    const res = own(() => assets.saveSheet({ ...sheet, name }, savedName));
    if (!res.ok) {
      nameIn.value = sheet.name;
      return alertDialog(res.title, res.message);
    }
    sheet = { ...sheet, name };
    savedName = name;
    deps.onRenamed(name);
  });
  classIn.addEventListener('change', () =>
    change({ ...sheet, characterClass: classIn.value.trim() || 'None' }),
  );
  const del = button(
    'Delete',
    () =>
      void confirmDialog('Delete Character', `Delete ${sheet.name}? This cannot be undone.`).then((ok) => {
        if (!ok) return;
        if (timer !== null) clearTimeout(timer);
        timer = null;
        own(() => assets.deleteSheet(savedName));
        deps.onDeleted();
      }),
    { class: 'danger', ...tid('delete') },
  );

  // ------------------------------------------------------------ basic info
  const sprite = spritePicker(sheet.spritePath, 'party', (p) => change({ ...sheet, spritePath: p }));
  const hpCur = intField(sheet.currentHP, 0, 9999, tid('hp'));
  const hpMax = intField(sheet.totalHP, 1, 9999, tid('hp-max'));
  const hpBar = h('div', { class: 'hpbar wide' }, h('div'));
  const ac = intField(sheet.armorClass, 0, 99, tid('ac'));
  hpCur.el.addEventListener('change', () => change(setCurrentHp(sheet, hpCur.get())));
  hpMax.el.addEventListener('change', () => change(setMaxHp(sheet, hpMax.get())));
  ac.el.addEventListener('change', () => change(setArmorClass(sheet, ac.get())));
  const statusBtn = h('button', { type: 'button', class: 'status-menu', ...tid('status') });
  const statusPop = h('div', { class: 'status-pop', hidden: true });
  const statusBoxes = SHEET_STATUS_FLAGS.map((flag) => {
    const box = h('input', { type: 'checkbox', dataset: { testid: `sheet-status-${flag}` } });
    box.addEventListener('change', () => change(setStatusFlag(sheet, flag, box.checked)));
    statusPop.appendChild(h('label', { class: 'check' }, box, ` ${flag}`));
    return [flag, box] as const;
  });
  statusBtn.addEventListener('click', () => (statusPop.hidden = !statusPop.hidden));
  const color = colorField(sheet.color, tid('color'));
  color.el.addEventListener('change', () => change({ ...sheet, color: color.get() }));
  const group = selectField<'' | CharGroup>(
    [{ value: '', label: 'Ungrouped' }, ...CHAR_GROUPS.map((g) => ({ value: g, label: groupLabel(g) }))],
    sheet.group ?? '',
    tid('group'),
  );
  group.el.addEventListener('change', () => change({ ...sheet, group: group.get() || null }));
  // perished in battle (the "Perish" choice for a dying hero); untick to bring them back
  const deadBadge = h(
    'span',
    { class: 'dead-badge', title: 'Perished in battle', ...tid('dead-badge') },
    '✝ Dead',
  );
  const dead = checkField('Perished', sheet.dead === true, tid('dead'));
  dead.box.addEventListener('change', () => {
    const { dead: _was, ...rest } = sheet;
    change(dead.get() ? { ...rest, dead: true } : rest);
  });

  // ------------------------------------------------------------ attributes
  const radar = h('canvas', { class: 'radar' });
  const baseIns = ATTRIBUTE_SHORT.map((s, i) => {
    const f = intField(sheet.baseAttributes[i] ?? 0, -99, 99, { dataset: { testid: `sheet-base-${s}` } });
    f.el.addEventListener('change', () => change(setBaseAttribute(sheet, i, f.get())));
    return f;
  });
  const bonusCells = ATTRIBUTE_SHORT.map(() => h('span', { class: 'attr-bonus' }));
  const totalCells = ATTRIBUTE_SHORT.map((s) =>
    h('span', { class: 'attr-total', dataset: { testid: `sheet-total-${s}` } }),
  );
  const level = intField(sheet.level, 1, 99, tid('level'));
  level.el.addEventListener('change', () => change(setLevel(sheet, level.get())));
  const points = h('span', { class: 'points', ...tid('points') });

  // ------------------------------------------------------------ dynamic bits
  const equipEl = h('div', { class: 'equip-grid' });
  const abilityEl = h('div', { class: 'col' });
  const castingSel = selectField(
    CASTING_STATS,
    (sheet.spellcastingStat ?? 'None') as (typeof CASTING_STATS)[number],
    tid('casting'),
  );
  castingSel.el.addEventListener('change', () => change(setCastingStat(sheet, castingSel.get())));
  const castLine = h('span', { class: 'muted', ...tid('cast-line') });
  const pips = h('div', { class: 'row pips' });
  const spellsEl = h('div', { class: 'col' });
  const inventoryEl = h('div', { class: 'col' });

  const section = (title: string, ...body: (HTMLElement | null)[]) =>
    h('section', { class: 'sheet-section' }, h('h4', {}, title), ...body);

  replaceChildren(
    root,
    h(
      'div',
      { class: 'sheet-pane', dataset: { testid: 'sheet-pane' } },
      h(
        'div',
        { class: 'sheet-header' },
        avatar,
        h('div', { class: 'col grow' }, h('div', { class: 'row' }, nameIn, deadBadge), classIn),
        del,
      ),
      section(
        'Basic Info',
        (() => {
          const g = formGrid();
          g.row('Sprite:', sprite.el);
          g.row('HP:', h('div', { class: 'row' }, hpCur.el, ' / ', hpMax.el, hpBar));
          g.row('AC:', ac.el);
          g.row('Status:', h('div', { class: 'status-wrap' }, statusBtn, statusPop));
          g.row('Color:', color.el);
          g.row('Group:', group.el);
          g.row('Dead:', dead.el);
          return g.el;
        })(),
      ),
      section(
        'Attributes',
        h(
          'div',
          { class: 'attr-wrap' },
          radar,
          h(
            'div',
            { class: 'attr-grid' },
            h('span'),
            h('span', { class: 'attr-head base' }, 'Base'),
            h('span', { class: 'attr-head bonus' }, 'Bonus'),
            h('span', { class: 'attr-head total' }, 'Total'),
            ATTRIBUTE_SHORT.map((s, i) => [
              h('span', { class: 'attr-name', style: `color:${STAT_COLORS[i] ?? '#ccc'}` }, s),
              (baseIns[i] as (typeof baseIns)[number]).el,
              bonusCells[i] as HTMLElement,
              totalCells[i] as HTMLElement,
            ]),
            h('span', { class: 'attr-name' }, 'LVL'),
            level.el,
            h('span', { style: 'grid-column: span 2' }, points),
          ),
        ),
      ),
      section('Equipment', equipEl),
      section('Abilities', abilityEl),
      section(
        'Spellcasting',
        h(
          'div',
          { class: 'row' },
          'Casting stat:',
          castingSel.el,
          castLine,
          button('Long Rest', () => change(longRest(sheet)), {
            ...tid('long-rest'),
            title: 'Restore every spell slot',
          }),
        ),
        pips,
        spellsEl,
      ),
      section('Inventory', inventoryEl),
    ),
  );

  // ---------------------------------------------------------------- refresh
  function refresh(): void {
    deadBadge.style.display = sheet.dead ? '' : 'none';
    dead.box.checked = sheet.dead === true;
    const focused = document.activeElement;
    const keep = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
      if (el !== focused) el.value = v;
    };
    if (!drawSpritePreview(avatar, sheet.spritePath, 56)) {
      const ctx = avatar.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 56, 56);
        ctx.fillStyle = sheet.color;
        ctx.beginPath();
        ctx.arc(28, 28, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    keep(nameIn, sheet.name);
    hpCur.set(sheet.currentHP);
    hpMax.set(sheet.totalHP);
    const pct = sheet.totalHP > 0 ? Math.max(0, Math.min(1, sheet.currentHP / sheet.totalHP)) : 0;
    const bar = hpBar.firstElementChild as HTMLElement;
    bar.style.width = `${pct * 100}%`;
    bar.style.background = pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#e0a030' : '#d75f5f';
    ac.set(sheet.armorClass);
    statusBtn.textContent = `${statusMenuText(sheet)} ▾`;
    for (const [flag, box] of statusBoxes) box.checked = hasStatus(sheet, flag);
    keep(group.el, String([null, ...CHAR_GROUPS].indexOf(sheet.group)));
    baseIns.forEach((f, i) => f.el !== focused && f.set(sheet.baseAttributes[i] ?? 0));
    bonusCells.forEach((c, i) => {
      const v = sheet.tempAttributes[i] ?? 0;
      c.textContent = v === 0 ? '0' : `${v > 0 ? '+' : ''}${v}`;
    });
    totalCells.forEach((c, i) => (c.textContent = String(sheet.totalAttributes[i] ?? 0)));
    level.set(sheet.level);
    points.textContent = pointsLabel(sheet);
    points.classList.toggle('over', statPoints(sheet).balance < 0);
    drawRadar(radar, sheet.totalAttributes);
    castLine.textContent = castingLine(sheet);
    renderEquipment();
    renderAbilities();
    renderSpells();
    renderInventory();
  }

  function renderEquipment(): void {
    const slot = (
      label: string,
      current: ItemDef | null,
      kind: 'weapon' | 'accessory',
      onPick: (item: ItemDef | null) => void,
      id: string,
    ) => {
      const candidates = sheet.inventory.filter((i) => i.kind === kind);
      const choices: { value: string; label: string; item: ItemDef | null }[] = [
        { value: '', label: 'None', item: null },
        ...(current ? [{ value: `eq:${current.name}`, label: current.name, item: current }] : []),
        ...candidates
          .filter((c) => c.name !== current?.name)
          .map((c) => ({ value: `inv:${c.name}`, label: c.name, item: c })),
      ];
      const sel = h(
        'select',
        { dataset: { testid: `sheet-equip-${id}` } },
        ...choices.map((c) => h('option', { value: c.value }, c.label)),
      );
      sel.value = current ? `eq:${current.name}` : '';
      sel.addEventListener('change', () => onPick(choices.find((c) => c.value === sel.value)?.item ?? null));
      return h('div', { class: 'equip-slot' }, h('span', { class: 'muted small' }, label), sel);
    };
    replaceChildren(
      equipEl,
      slot(
        'Primary',
        sheet.weapons[0],
        'weapon',
        (it) => change(equipWeapon(sheet, 0, it as never)),
        'primary',
      ),
      slot(
        'Secondary',
        sheet.weapons[1],
        'weapon',
        (it) => change(equipWeapon(sheet, 1, it as never)),
        'secondary',
      ),
      ...([0, 1, 2] as const).map((i) =>
        slot(
          `Accessory ${i + 1}`,
          sheet.accessories[i],
          'accessory',
          (it) => change(equipAccessory(sheet, i, it as never)),
          `acc${i + 1}`,
        ),
      ),
    );
  }

  function renderAbilities(): void {
    const types = [
      ['PASSIVE', 'Passive'],
      ['ACTIVE', 'Active'],
      ['SPECIAL', 'Special'],
    ] as const;
    const label = types.find(([t]) => t === abilityTab)?.[1] ?? 'Passive';
    const rows = sheet.abilities
      .map((a, i) => [a, i] as const)
      .filter(([a]) => (a.abilityType || 'PASSIVE') === abilityTab)
      .map(([a, i]) =>
        h(
          'div',
          { class: 'list-row', dataset: { testid: `sheet-ability-${a.name}` } },
          h(
            'div',
            { class: 'grow' },
            h('strong', {}, a.name),
            a.description &&
              h(
                'span',
                { class: 'muted small', title: a.description },
                ` ${a.description.length > 48 ? `${a.description.slice(0, 45)}…` : a.description}`,
              ),
            h('div', { class: 'muted small' }, abilityLine(a)),
          ),
          button('✕', () => change(removeAbility(sheet, i)), {
            class: 'danger icon',
            title: 'Remove ability',
          }),
        ),
      );
    replaceChildren(
      abilityEl,
      h(
        'div',
        { class: 'tabs subtabs' },
        types.map(([t, l]) =>
          button(l, () => ((abilityTab = t), renderAbilities()), {
            class: abilityTab === t ? 'on' : '',
            dataset: { testid: `sheet-ability-tab-${t}` },
          }),
        ),
      ),
      rows.length ? rows : h('div', { class: 'muted small' }, `No ${label.toLowerCase()} abilities`),
      button(
        `+ Add ${label} Ability`,
        () =>
          openAbilityDialog({
            existing: null,
            initialType: abilityTab,
            magnitude: [-99, 99],
            requireName: true,
            onSave: (a) => change(addAbility(sheet, a)),
          }),
        tid('add-ability'),
      ),
    );
  }

  function renderSpells(): void {
    replaceChildren(
      pips,
      ...(isCaster(sheet)
        ? slotPips(sheet).map((p) =>
            h(
              'span',
              { class: 'pip' },
              `Lv${p.level} `,
              '●'.repeat(p.remaining) + '○'.repeat(p.max - p.remaining),
            ),
          )
        : []),
    );
    const known = sheet.knownSpells
      .map((n) => assets.bundle.spells[n])
      .filter((s): s is NonNullable<typeof s> => s !== undefined)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    replaceChildren(
      spellsEl,
      known.length === 0
        ? h('div', { class: 'muted small' }, 'No known spells')
        : known.map((s) =>
            h(
              'div',
              { class: 'list-row', dataset: { testid: `sheet-spell-${s.name}` } },
              h('span', { class: 'swatch', style: `background:${s.color}` }),
              h(
                'div',
                { class: 'grow' },
                h('strong', {}, s.name),
                h('div', { class: 'muted small' }, spellSummary(s)),
              ),
              h('span', { class: `lvl${s.level === 0 ? ' cantrip' : ''}` }, levelLabel(s)),
              button('✎', () => openSpellEditor(assets, s), {
                class: 'icon',
                title: 'Edit this spell (changes apply to everyone who knows it)',
              }),
              button('✕', () => change(forgetSpell(sheet, s.name)), {
                class: 'danger icon',
                title: 'Forget this spell',
              }),
            ),
          ),
      button('+ Learn Spell', () => learnSpellDialog(), tid('learn-spell')),
    );
  }

  function learnSpellDialog(): void {
    const options = Object.values(assets.bundle.spells)
      .filter((s) => !sheet.knownSpells.includes(s.name))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    if (options.length === 0)
      return alertDialog('No Spells', 'There are no spells to learn. Create one in the Asset Editor.');
    const pick = selectField(
      options.map((s) => ({
        value: s.name,
        label: `${s.name} (${s.level === 0 ? 'Cantrip' : `Level ${s.level}`})`,
      })),
      options[0]?.name ?? '',
      tid('learn-select'),
    );
    editorDialog({
      title: 'Learn Spell',
      body: h('div', { class: 'col' }, h('div', {}, `Add a spell to ${sheet.name}'s known spells:`), pick.el),
      width: 380,
      onOk: () => {
        change(learnSpell(sheet, pick.get()));
        return true;
      },
    });
  }

  function renderInventory(): void {
    const tab = INVENTORY_TABS.find((t) => t.key === invTab) ?? INVENTORY_TABS[0];
    const items = sheet.inventory.filter((i) => (tab.kinds as readonly string[]).includes(i.kind));
    replaceChildren(
      inventoryEl,
      h(
        'div',
        { class: 'row' },
        h(
          'div',
          { class: 'tabs subtabs' },
          INVENTORY_TABS.map((t) =>
            button(t.label, () => ((invTab = t.key), renderInventory()), {
              class: invTab === t.key ? 'on' : '',
              dataset: { testid: `sheet-inv-tab-${t.key}` },
            }),
          ),
        ),
        button('+ Add Item', () => addItemDialog(), tid('add-item')),
      ),
      items.length === 0
        ? h('div', { class: 'muted small' }, 'Nothing here')
        : items.map((it) =>
            h(
              'div',
              { class: 'list-row', dataset: { testid: `sheet-item-${it.name}` } },
              h('span', { class: 'swatch', style: `background:${it.color}` }),
              h('span', { class: 'grow' }, `${it.name} ×${it.quantity}`),
              button('✕', () => removeItemDialog(it), { class: 'danger icon', title: 'Remove' }),
            ),
          ),
    );
  }

  function addItemDialog(): void {
    const categories = [
      { value: 'weapon', label: 'Weapon', records: assets.bundle.weapons },
      { value: 'accessory', label: 'Accessory', records: assets.bundle.accessories },
      { value: 'consumable', label: 'Consumable', records: assets.bundle.consumables },
      { value: 'ammunition', label: 'Ammunition', records: assets.bundle.ammunition },
      { value: 'crafting', label: 'Crafting Item', records: assets.bundle.crafting },
      { value: 'keyitem', label: 'Key Item', records: assets.bundle.keyitems },
    ] as const;
    const cat = selectField(
      categories.map((c) => ({ value: c.value, label: c.label })),
      'weapon',
      tid('add-category'),
    );
    const itemSel = h('select', tid('add-select'));
    const qty = intField(1, 1, 999, tid('add-qty'));
    const fill = () => {
      const recs = Object.values(categories.find((c) => c.value === cat.get())?.records ?? {}) as ItemDef[];
      replaceChildren(
        itemSel,
        ...recs
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((r) => h('option', { value: r.name }, r.name)),
      );
    };
    cat.el.addEventListener('change', fill);
    fill();
    const g = formGrid();
    g.row('Category:', cat.el);
    g.row('Item:', itemSel);
    g.row('Quantity:', qty.el);
    editorDialog({
      title: 'Add Item',
      body: g.el,
      okLabel: 'Add',
      width: 380,
      onOk: () => {
        const recs = categories.find((c) => c.value === cat.get())?.records as
          Record<string, ItemDef> | undefined;
        const item = recs?.[itemSel.value];
        if (!item) return warn('No Item', 'Pick an item to add.');
        // a full copy: abilities and colour come along (Java's copies dropped them, F-52)
        change(addItem(sheet, item, qty.get()));
        return true;
      },
    });
  }

  function removeItemDialog(item: ItemDef): void {
    if (item.quantity <= 1) {
      void confirmDialog(
        'Remove Item',
        `Remove ${item.name}?\nThis will remove the item from inventory.`,
      ).then((ok) => ok && change(removeItem(sheet, item)));
      return;
    }
    const qty = intField(1, 1, item.quantity, tid('remove-qty'));
    const m = modal(
      'Remove Item',
      h(
        'div',
        { class: 'col' },
        h('div', {}, `How many ${item.name} to remove? (have ${item.quantity})`),
        qty.el,
      ),
      [
        button('Remove', () => (m.close(), change(removeItemQuantity(sheet, item, qty.get()))), {
          class: 'primary',
          dataset: { testid: 'remove-some' },
        }),
        button('Remove All', () => (m.close(), change(removeItem(sheet, item))), {
          class: 'danger',
          dataset: { testid: 'remove-all' },
        }),
        button('Cancel', () => m.close()),
      ],
    );
  }

  refresh();
  return {
    isWriting: () => writing,
    flush: () => {
      if (timer !== null) flush();
    },
    destroy: () => {
      if (timer !== null) flush();
      root.replaceChildren();
    },
  };
}
