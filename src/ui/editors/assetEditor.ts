/**
 * UI/AssetEditorView.java: Items / Terrain / Spells tabs with card grids,
 * add buttons per tab, and the item, terrain and spell dialogs. Every change
 * goes through the AssetStore (Java file formats, rename without duplicates,
 * real deletes).
 */
import { ATTRIBUTE_SHORT, type TerrainDef } from '../../assets/types.ts';
import type { AssetStore } from '../../editors/assetStore.ts';
import { itemCard, spellCard, terrainCard, type CardText } from '../../editors/cards.ts';
import {
  CRAFTING_CATEGORIES,
  DICE_CHOICES,
  STAT_TYPES,
  newItem,
  newTerrain,
  type AssetItemDef,
  type AssetItemKind,
} from '../../editors/defaults.ts';
import { button, h, replaceChildren } from '../dom.ts';
import { confirmDialog } from '../panels/dialogs.ts';
import { abilityListEditor } from './abilityEditor.ts';
import {
  checkField,
  colorField,
  editorDialog,
  formGrid,
  intField,
  selectField,
  textArea,
  textField,
  warn,
  type IntField,
} from './form.ts';
import { openSpellEditor } from './spellEditor.ts';
import { drawSpritePreview, spritePicker } from './spritePicker.ts';
import { statusFields } from './statusFields.ts';

type Tab = 'items' | 'terrain' | 'spells';
type ItemSub = 'weapons' | 'accessories' | 'consumables' | 'keyitems';

const SUB_KINDS: Record<ItemSub, AssetItemKind[]> = {
  weapons: ['weapon'],
  accessories: ['accessory'],
  consumables: ['consumable', 'ammunition', 'crafting'],
  keyitems: ['keyitem'],
};

export function mountAssetEditor(
  root: HTMLElement,
  deps: { assets: AssetStore; onBack: () => void },
): () => void {
  const { assets } = deps;
  let tab: Tab = 'items';
  let sub: ItemSub = 'weapons';
  const toolbar = h('div', { class: 'editor-toolbar' });
  const tabs = h('div', { class: 'tabs' });
  const subtabs = h('div', { class: 'tabs subtabs' });
  const grid = h('div', { class: 'card-grid', dataset: { testid: 'asset-grid' } });
  replaceChildren(
    root,
    h(
      'div',
      { class: 'editor-page', dataset: { testid: 'asset-editor' } },
      h(
        'div',
        { class: 'editor-head' },
        button('← Back', deps.onBack, { dataset: { testid: 'editor-back' } }),
        h('h2', {}, 'Asset Editor'),
        toolbar,
      ),
      tabs,
      subtabs,
      h('div', { class: 'editor-body' }, grid),
    ),
  );

  const card = (
    c: CardText,
    color: string | null,
    onEdit: () => void,
    onDelete: () => void,
    testid: string,
    thumb?: HTMLElement,
  ) =>
    h(
      'div',
      { class: `asset-card style-${c.style}`, dataset: { testid } },
      h(
        'div',
        { class: 'card-head' },
        color && h('span', { class: 'swatch', style: `background:${color}` }),
        h('strong', {}, c.title),
      ),
      thumb,
      c.badges.length > 0 &&
        h(
          'div',
          { class: 'badges' },
          c.badges.map((b) => h('span', { class: 'badge' }, b)),
        ),
      h(
        'div',
        { class: 'card-details' },
        c.details.map((d) =>
          h(
            'div',
            { class: 'detail' },
            h('span', { class: 'muted' }, d.label),
            h('span', { title: d.value }, d.value),
          ),
        ),
      ),
      h(
        'div',
        { class: 'card-actions' },
        button('Edit', onEdit, { dataset: { testid: `${testid}-edit` } }),
        button('Delete', onDelete, { class: 'danger', dataset: { testid: `${testid}-delete` } }),
      ),
    );

  const render = () => {
    replaceChildren(
      tabs,
      (['items', 'terrain', 'spells'] as const).map((t) =>
        button(t[0]?.toUpperCase() + t.slice(1), () => ((tab = t), render()), {
          class: tab === t ? 'on' : '',
          dataset: { testid: `asset-tab-${t}` },
        }),
      ),
    );
    subtabs.hidden = tab !== 'items';
    replaceChildren(
      subtabs,
      (
        [
          ['weapons', 'Weapons'],
          ['accessories', 'Accessories'],
          ['consumables', 'Consumables'],
          ['keyitems', 'Key Items'],
        ] as const
      ).map(([k, label]) =>
        button(label, () => ((sub = k), render()), {
          class: sub === k ? 'on' : '',
          dataset: { testid: `asset-sub-${k}` },
        }),
      ),
    );
    const add = (label: string, fn: () => void, id: string) =>
      button(label, fn, { class: 'primary', dataset: { testid: `add-${id}` } });
    if (tab === 'items')
      replaceChildren(
        toolbar,
        add('+ Weapon', () => openItemEditor(assets, 'weapon', null), 'weapon'),
        add('+ Accessory', () => openItemEditor(assets, 'accessory', null), 'accessory'),
        add('+ Consumable', () => openItemEditor(assets, 'consumable', null), 'consumable'),
        add('+ Ammo', () => openItemEditor(assets, 'ammunition', null), 'ammunition'),
        add('+ Crafting', () => openItemEditor(assets, 'crafting', null), 'crafting'),
        add('+ Key Item', () => openItemEditor(assets, 'keyitem', null), 'keyitem'),
      );
    else if (tab === 'terrain')
      replaceChildren(
        toolbar,
        add('+ Add Terrain', () => openTerrainEditor(assets, null), 'terrain'),
      );
    else
      replaceChildren(
        toolbar,
        add('+ Spell', () => openSpellEditor(assets, null), 'spell'),
      );

    const cards: HTMLElement[] = [];
    if (tab === 'items') {
      for (const kind of SUB_KINDS[sub]) {
        const items = Object.values(assets.itemsOf(kind)).sort((a, b) => a.name.localeCompare(b.name));
        for (const it of items)
          cards.push(
            card(
              itemCard(it),
              it.color,
              () => openItemEditor(assets, kind, it),
              () =>
                void confirmDialog('Delete Item', `Delete ${it.name}?`).then(
                  (ok) => ok && assets.deleteItem(kind, it.name),
                ),
              `card-${kind}-${it.name}`,
            ),
          );
      }
    } else if (tab === 'terrain') {
      for (const t of [...assets.bundle.terrain].sort((a, b) => a.type.localeCompare(b.type))) {
        const thumb = h('canvas', { class: 'card-thumb', width: 64, height: 64 });
        if (!drawSpritePreview(thumb, t.spritePath)) {
          const ctx = thumb.getContext('2d');
          if (ctx) {
            ctx.fillStyle = t.color;
            ctx.fillRect(12, 12, 40, 40);
          }
        }
        cards.push(
          card(
            terrainCard(t),
            t.color,
            () => openTerrainEditor(assets, t),
            () =>
              void confirmDialog('Delete Terrain', `Delete ${t.type}?`).then(
                (ok) => ok && assets.deleteTerrain(t.type),
              ),
            `card-terrain-${t.type}`,
            thumb,
          ),
        );
      }
    } else {
      for (const s of Object.values(assets.bundle.spells).sort(
        (a, b) => a.level - b.level || a.name.localeCompare(b.name),
      ))
        cards.push(
          card(
            spellCard(s),
            s.color,
            () => openSpellEditor(assets, s),
            () =>
              void confirmDialog(
                'Delete Spell',
                `Delete ${s.name}?\nCharacters who know it will simply stop seeing it.`,
              ).then((ok) => ok && assets.deleteSpell(s.name)),
            `card-spell-${s.name}`,
          ),
        );
    }
    replaceChildren(grid, cards.length > 0 ? cards : h('div', { class: 'muted empty' }, 'Nothing here yet.'));
  };
  const unsub = assets.subscribe(render);
  render();
  return () => {
    unsub();
    root.replaceChildren();
  };
}

// ------------------------------------------------------------------ dialogs

const ITEM_TITLES: Record<AssetItemKind, string> = {
  weapon: 'Weapon',
  accessory: 'Accessory',
  consumable: 'Consumable',
  ammunition: 'Ammunition',
  crafting: 'Crafting Item',
  keyitem: 'Key Item',
};

/** The six stat-modifier spinners of the weapon and accessory dialogs. */
function modFields(g: ReturnType<typeof formGrid>, values: readonly number[]): IntField[] {
  return ATTRIBUTE_SHORT.map((s, i) => {
    const f = intField(values[i] ?? 0, -99, 99, { dataset: { testid: `item-mod-${s}` } });
    g.row(`${s}:`, f.el);
    return f;
  });
}

export function openItemEditor(assets: AssetStore, kind: AssetItemKind, existing: AssetItemDef | null): void {
  const base = existing ?? newItem(kind);
  const g = formGrid();
  const name = textField(existing ? base.name : '', { dataset: { testid: 'item-name' } });
  const color = colorField(base.color, { dataset: { testid: 'item-color' } });
  g.row('Name:', name);
  g.row('Color:', color.el);
  const numbers: IntField[] = [];
  let build: () => AssetItemDef;
  let extraEl: HTMLElement | null = null;

  switch (base.kind) {
    case 'weapon': {
      const dice = base.damageDice.map((d, i) =>
        selectField(DICE_CHOICES, (d ?? 'd6') as never, { dataset: { testid: `item-tier${i + 1}` } }),
      );
      dice.forEach((d, i) => g.row(`Tier ${i + 1} Die:`, d.el));
      const stat = selectField(
        STAT_TYPES,
        (STAT_TYPES as readonly string[]).includes(base.statType) ? (base.statType as never) : 'STRENGTH',
        {
          dataset: { testid: 'item-stat' },
        },
      );
      g.row('Stat Type:', stat.el);
      const ammo = textField(base.ammoType ?? '', {
        placeholder: 'Leave empty for melee',
        dataset: { testid: 'item-ammo-type' },
      });
      g.row('Ammo Type:', ammo);
      const mods = modFields(g, base.modifiedAttributes);
      numbers.push(...mods);
      const abilities = abilityListEditor(base.abilities);
      extraEl = abilities.el;
      build = () => ({
        ...base,
        damageDice: [dice[0]?.get() ?? 'd6', dice[1]?.get() ?? 'd6', dice[2]?.get() ?? 'd8'],
        statType: stat.get(),
        ammoType: ammo.value.trim() === '' ? null : ammo.value.trim(),
        modifiedAttributes: mods.map((m) => m.get()) as typeof base.modifiedAttributes,
        abilities: abilities.get(),
      });
      break;
    }
    case 'accessory': {
      const defense = intField(base.defense, -99, 999, { dataset: { testid: 'item-defense' } });
      g.row('Defense:', defense.el);
      numbers.push(defense);
      const mods = modFields(g, base.modifiedAttributes);
      numbers.push(...mods);
      const abilities = abilityListEditor(base.abilities);
      extraEl = abilities.el;
      build = () => ({
        ...base,
        defense: defense.get(),
        modifiedAttributes: mods.map((m) => m.get()) as typeof base.modifiedAttributes,
        abilities: abilities.get(),
      });
      break;
    }
    case 'consumable': {
      const heal = intField(base.healAmount, 0, 9999, { dataset: { testid: 'item-heal' } });
      g.row('Heal Amount:', heal.el);
      numbers.push(heal);
      // the Java dialog always saved effect = null (F-59); the effect is editable here
      const effect = statusFields(g, base.effect, 'item-effect');
      build = () => ({ ...base, healAmount: heal.get(), effect: effect.get() });
      break;
    }
    case 'ammunition': {
      const ammo = textField(base.ammoType ?? '', { dataset: { testid: 'item-ammo-type' } });
      g.row('Ammo Type:', ammo);
      build = () => ({ ...base, ammoType: ammo.value.trim() === '' ? null : ammo.value.trim() });
      break;
    }
    case 'crafting': {
      const cat = selectField(
        CRAFTING_CATEGORIES,
        (CRAFTING_CATEGORIES as readonly string[]).includes(base.craftingCategory ?? '')
          ? (base.craftingCategory as never)
          : 'Material',
        {
          dataset: { testid: 'item-category' },
        },
      );
      const desc = textArea(base.description ?? '', 3, { dataset: { testid: 'item-description' } });
      g.row('Category:', cat.el);
      g.row('Description:', desc);
      build = () => ({ ...base, craftingCategory: cat.get(), description: desc.value });
      break;
    }
    case 'keyitem': {
      const desc = textArea(base.description ?? '', 3, { dataset: { testid: 'item-description' } });
      const quest = checkField('Quest Related', base.questRelated, { dataset: { testid: 'item-quest' } });
      g.row('Description:', desc);
      g.row('', quest.el);
      build = () => ({ ...base, description: desc.value, questRelated: quest.get() });
      break;
    }
    default:
      return;
  }
  const body = h('div', { class: 'col' }, g.el, extraEl);
  editorDialog({
    title: existing ? `Edit ${ITEM_TITLES[kind]}` : `New ${ITEM_TITLES[kind]}`,
    body,
    width: kind === 'weapon' || kind === 'accessory' ? 420 : 380,
    testid: 'item-editor',
    onOk: () => {
      if (numbers.some((n) => n.invalid())) return warn('Invalid Input', 'Please enter valid numbers.');
      const item = { ...build(), name: name.value.trim(), color: color.get() };
      const res = assets.saveItem(item, existing?.name ?? null);
      return res.ok ? true : warn(res.title, res.message);
    },
  });
}

export function openTerrainEditor(assets: AssetStore, existing: TerrainDef | null): void {
  const base = existing ?? newTerrain();
  const g = formGrid();
  const type = textField(existing ? base.type : '', { dataset: { testid: 'terrain-type' } });
  const hp = intField(base.health, 0, 9999, { dataset: { testid: 'terrain-hp' } });
  const color = colorField(base.color, { dataset: { testid: 'terrain-color' } });
  const collision = checkField('Collision (blocks entry)', base.collision, {
    dataset: { testid: 'terrain-collision' },
  });
  const layer = selectField(
    [
      { value: 'above', label: 'Entity Above' },
      { value: 'below', label: 'Entity Below' },
    ],
    base.entityAboveTerrain ? 'above' : 'below',
    { dataset: { testid: 'terrain-layer' } },
  );
  const sprite = spritePicker(base.spritePath, 'terrain');
  g.row('Type:', type);
  g.row('HP:', hp.el);
  g.row('Color:', color.el);
  g.row('', collision.el);
  // layer only matters without collision: an entity can never share a blocking tile
  const layerRow = g.row('Layer:', layer.el);
  g.row('Sprite:', sprite.el);
  const sync = () => layerRow.show(!collision.get());
  collision.box.addEventListener('change', sync);
  sync();
  editorDialog({
    title: existing ? 'Edit Terrain' : 'New Terrain',
    body: g.el,
    width: 380,
    testid: 'terrain-editor',
    onOk: () => {
      if (hp.invalid()) return warn('Invalid Input', 'Please enter valid numbers.');
      const t: TerrainDef = {
        ...base,
        type: type.value.trim(),
        health: hp.get(),
        color: color.get(),
        collision: collision.get(),
        entityAboveTerrain: layer.get() === 'above',
        spritePath: sprite.get(),
      };
      const res = assets.saveTerrain(t, existing?.type ?? null);
      return res.ok ? true : warn(res.title, res.message);
    },
  });
}
