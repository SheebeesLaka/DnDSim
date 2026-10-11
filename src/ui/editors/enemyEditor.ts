/**
 * New/Edit Enemy dialog and the enemy browser (CharacterSheetView.java:694-889,
 * 1126-1332). Mobility can be authored as 0 and AC is written as typed, not as
 * the derived value (FEATURES.md F-56).
 */
import { ATTRIBUTE_SHORT, type EnemyDef } from '../../assets/types.ts';
import type { AssetStore } from '../../editors/assetStore.ts';
import {
  allEnemyTags,
  enemySummary,
  filterSortEnemies,
  groupEnemies,
  templateAC,
  templateInitiative,
  type EnemySort,
} from '../../editors/browsers.ts';
import { DICE_CHOICES, newEnemy } from '../../editors/defaults.ts';
import { button, h, replaceChildren } from '../dom.ts';
import { confirmDialog } from '../panels/dialogs.ts';
import { colorField, editorDialog, formGrid, intField, selectField, textField, warn } from './form.ts';
import { drawSpritePreview, spritePicker } from './spritePicker.ts';

const SAVE_INDICES = [0, 2, 3, 4, 5] as const; // STR, CON, INT, WIS, CHA (DEX saves use Dexterity)

export function openEnemyEditor(assets: AssetStore, existing: EnemyDef | null): void {
  const base = existing ?? newEnemy();
  const tid = (id: string) => ({ dataset: { testid: `enemy-${id}` } });
  const name = textField(base.name, tid('name'));
  const hp = intField(base.maxHealth || 10, 1, 9999, tid('hp'));
  const mob = intField(base.mobility, 0, 99, tid('mob'));
  const ac = intField(base.armorClass, 0, 99, tid('ac'));
  const dex = intField(base.dexterity, -10, 99, tid('dex'));
  const saves = SAVE_INDICES.map((i) =>
    intField(base.attributes?.[i] ?? base.dexterity, -10, 99, {
      dataset: { testid: `enemy-save-${ATTRIBUTE_SHORT[i] ?? i}` },
    }),
  );
  const dice = base.damageDice.map((d, i) =>
    selectField(DICE_CHOICES, (d ?? 'd4') as never, tid(`tier${i + 1}`)),
  );
  const color = colorField(base.color, tid('color'));
  const sprite = spritePicker(base.spritePath, 'enemies');
  const tags = new Set(base.tags);
  const chipRow = h('div', { class: 'tag-row', ...tid('tags') });
  const custom = textField('', { placeholder: 'e.g. Flying', ...tid('custom-tag') });
  const renderChips = () =>
    replaceChildren(
      chipRow,
      allEnemyTags(Object.values(assets.bundle.enemies), assets.bundle.enemyTags).map((t) =>
        button(
          t,
          () => {
            if (tags.has(t)) tags.delete(t);
            else tags.add(t);
            renderChips();
          },
          { class: `tag-chip${tags.has(t) ? ' on' : ''}`, dataset: { testid: `enemy-tag-${t}` } },
        ),
      ),
    );
  renderChips();

  const g = formGrid();
  g.row('Name:', name);
  g.row('Health:', hp.el);
  g.row('Mobility:', mob.el);
  g.row('Armor Class:', ac.el);
  g.row('Dexterity (Attack + Initiative):', dex.el);
  g.row(
    'Saves (STR/CON/INT/WIS/CHA):',
    h(
      'div',
      { class: 'row saves' },
      saves.map((s) => s.el),
    ),
  );
  dice.forEach((d, i) => g.row(`Tier ${i + 1} Die:`, d.el));
  g.row('Color:', color.el);
  g.row('', h('div', { class: 'muted small' }, 'Dexterity drives both enemy attack rolls and initiative.'));
  g.row('Sprite:', sprite.el);
  g.row('Tags:', chipRow);
  g.row(
    'Custom Tag:',
    h(
      'div',
      { class: 'row' },
      custom,
      button(
        'Add',
        () => {
          const t = custom.value.trim();
          if (!t) return;
          tags.add(t);
          if (!assets.bundle.enemyTags.includes(t)) assets.setEnemyTags([...assets.bundle.enemyTags, t]);
          custom.value = '';
          renderChips();
        },
        tid('add-tag'),
      ),
    ),
  );

  editorDialog({
    title: existing ? 'Edit Enemy' : 'New Enemy',
    body: g.el,
    okLabel: 'Save',
    width: 480,
    testid: 'enemy-editor',
    onOk: () => {
      const all = [hp, mob, ac, dex, ...saves];
      if (all.some((f) => f.invalid())) return warn('Invalid Input', 'Please enter valid numbers.');
      const attributes = [...(base.attributes ?? [0, 0, 0, 0, 0, 0])] as NonNullable<EnemyDef['attributes']>;
      attributes[1] = dex.get();
      SAVE_INDICES.forEach((idx, k) => (attributes[idx] = saves[k]?.get() ?? 0));
      const enemy: EnemyDef = {
        ...base,
        name: name.value.trim(),
        health: hp.get(),
        maxHealth: hp.get(),
        mobility: mob.get(),
        armorClass: ac.get(),
        dexterity: dex.get(),
        damageDice: [dice[0]?.get() ?? 'd4', dice[1]?.get() ?? 'd4', dice[2]?.get() ?? 'd6'],
        color: color.get(),
        spritePath: sprite.get(),
        tags: [...tags],
        attributes,
      };
      const res = assets.saveEnemy(enemy, existing?.fileStem ?? null);
      return res.ok ? true : warn(res.title, res.message);
    },
  });
}

/** The Enemies mode browser. Returns a refresh function for store changes. */
export function mountEnemyBrowser(root: HTMLElement, assets: AssetStore): () => void {
  let search = '';
  let sort: EnemySort = 'Name';
  let ascending = true;
  const active = new Set<string>();
  const searchIn = h('input', {
    type: 'search',
    placeholder: 'Search enemies...',
    dataset: { testid: 'enemy-search' },
  });
  searchIn.addEventListener('input', () => {
    search = searchIn.value;
    renderGrid();
  });
  const sortSel = selectField(['Name', 'HP', 'AC', 'Initiative'] as const, sort, {
    dataset: { testid: 'enemy-sort' },
  });
  sortSel.el.addEventListener('change', () => {
    sort = sortSel.get();
    renderGrid();
  });
  const dirBtn = button(
    '↑',
    () => {
      ascending = !ascending;
      dirBtn.textContent = ascending ? '↑' : '↓';
      renderGrid();
    },
    { title: 'Sort direction', dataset: { testid: 'enemy-sort-dir' } },
  );
  const tagBar = h('div', { class: 'tag-row' });
  const summary = h('div', { class: 'enemy-summary', dataset: { testid: 'enemy-summary' } });
  const grid = h('div', { class: 'col', style: 'gap:12px' });
  replaceChildren(
    root,
    h('div', { class: 'row' }, searchIn, 'Sort by:', sortSel.el, dirBtn),
    tagBar,
    summary,
    grid,
  );

  const renderTags = () =>
    replaceChildren(
      tagBar,
      button('+ Add Tag', () => addTagDialog(), { class: 'tag-chip', dataset: { testid: 'enemy-add-tag' } }),
      allEnemyTags(Object.values(assets.bundle.enemies), assets.bundle.enemyTags).map((t) =>
        button(
          t,
          () => {
            if (active.has(t)) active.delete(t);
            else active.add(t);
            renderTags();
            renderGrid();
          },
          { class: `tag-chip${active.has(t) ? ' on' : ''}`, dataset: { testid: `enemy-filter-${t}` } },
        ),
      ),
    );
  const addTagDialog = () => {
    const f = textField('', { placeholder: 'e.g. Flying', dataset: { testid: 'new-tag-name' } });
    editorDialog({
      title: 'Add Tag',
      body: h('div', { class: 'col' }, h('div', {}, 'New tag name:'), f),
      width: 340,
      onOk: () => {
        const t = f.value.trim();
        if (!t) return warn('Missing Name', 'Type a tag name.');
        if (!assets.bundle.enemyTags.includes(t)) assets.setEnemyTags([...assets.bundle.enemyTags, t]);
        return true;
      },
    });
  };

  const card = (e: EnemyDef) => {
    const thumb = h('canvas', { width: 48, height: 48, class: 'card-thumb' });
    if (!drawSpritePreview(thumb, e.spritePath, 48)) {
      const ctx = thumb.getContext('2d');
      if (ctx) {
        ctx.fillStyle = e.color;
        ctx.fillRect(8, 8, 32, 32);
        ctx.strokeStyle = '#d75f5f';
        ctx.lineWidth = 2;
        ctx.strokeRect(8, 8, 32, 32);
      }
    }
    return h(
      'div',
      { class: 'asset-card enemy-card', dataset: { testid: `enemy-card-${e.fileStem}` } },
      h('div', { class: 'card-head' }, thumb, h('strong', {}, e.name)),
      h(
        'div',
        { class: 'badges' },
        h('span', { class: 'badge' }, `HP ${e.maxHealth}`),
        h('span', { class: 'badge' }, `AC ${templateAC(e)}`),
        h('span', { class: 'badge' }, `Init ${templateInitiative(e)}`),
      ),
      e.tags.length > 0 &&
        h(
          'div',
          { class: 'tag-row' },
          e.tags.map((t) => h('span', { class: 'tag-chip small' }, t)),
        ),
      h(
        'div',
        { class: 'card-actions' },
        button('Edit', () => openEnemyEditor(assets, e), { dataset: { testid: `enemy-edit-${e.fileStem}` } }),
        button(
          'Delete',
          () =>
            void confirmDialog('Delete Enemy', `Delete ${e.name}?`).then(
              (ok) => ok && assets.deleteEnemy(e.fileStem),
            ),
          {
            class: 'danger',
            dataset: { testid: `enemy-delete-${e.fileStem}` },
          },
        ),
      ),
    );
  };

  const renderGrid = () => {
    const all = Object.keys(assets.bundle.enemies)
      .sort()
      .map((k) => assets.bundle.enemies[k] as EnemyDef);
    const filtered = filterSortEnemies(all, { search, tags: active, sort, ascending });
    summary.textContent = enemySummary(filtered, all.length);
    replaceChildren(
      grid,
      groupEnemies(filtered, active.size > 0).map((g) =>
        h(
          'div',
          { class: 'col' },
          g.label && h('div', { class: 'form-section' }, g.label),
          h('div', { class: 'card-grid' }, g.enemies.map(card)),
        ),
      ),
    );
  };
  const refresh = () => {
    renderTags();
    renderGrid();
  };
  refresh();
  return refresh;
}
