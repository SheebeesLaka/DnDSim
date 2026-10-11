/**
 * UI/CharacterSheetView.java: Characters / Enemies modes. Characters: group
 * chips (double-click pins the default tab), the list (right-click to move to a
 * group) and the selected sheet. Enemies: the browser and its editor.
 */
import type { PrefsStore } from '../../app/prefs.ts';
import { ATTRIBUTE_SHORT, CHAR_GROUPS, type CharGroup } from '../../assets/types.ts';
import type { AssetStore } from '../../editors/assetStore.ts';
import {
  DEFAULT_GROUP_PREF,
  GROUP_KEYS,
  groupChipLabel,
  groupLabel,
  pinnedGroup,
  sheetSubtitle,
  sheetsInGroup,
  type GroupKey,
} from '../../editors/browsers.ts';
import { NEW_CHARACTER_DEFAULTS, newCharacter } from '../../editors/defaults.ts';
import { button, h, replaceChildren } from '../dom.ts';
import { openEnemyEditor, mountEnemyBrowser } from './enemyEditor.ts';
import { colorField, editorDialog, formGrid, intField, selectField, textField, warn } from './form.ts';
import { openPartyDialog } from './partyDialog.ts';
import { mountSheetPane, type SheetPane } from './sheetPane.ts';
import { drawSpritePreview } from './spritePicker.ts';

export interface SheetsDeps {
  assets: AssetStore;
  prefs: PrefsStore;
  inBattle: boolean;
  onBack: () => void;
}

export function mountSheetsScreen(root: HTMLElement, deps: SheetsDeps): () => void {
  const { assets, prefs } = deps;
  let mode: 'characters' | 'enemies' = 'characters';
  let group: GroupKey = pinnedGroup(prefs.all) ?? 'ALL';
  let selected: string | null = null;
  let pane: SheetPane | null = null;
  let refreshEnemies: (() => void) | null = null;

  const modeBar = h('div', { class: 'tabs' });
  const chips = h('div', { class: 'tabs group-chips' });
  const list = h('div', { class: 'sheet-list', dataset: { testid: 'sheet-list' } });
  const paneHost = h('div', { class: 'sheet-pane-host' });
  const charactersView = h(
    'div',
    { class: 'sheets-split' },
    h('div', { class: 'col sheet-list-col' }, chips, list),
    paneHost,
  );
  const enemiesView = h('div', { class: 'enemy-browser', dataset: { testid: 'enemy-browser' } });
  const body = h('div', { class: 'editor-body' });
  replaceChildren(
    root,
    h(
      'div',
      { class: 'editor-page', dataset: { testid: 'sheets-screen' } },
      h(
        'div',
        { class: 'editor-head' },
        button(deps.inBattle ? '← Back to battle' : '← Back', () => (pane?.flush(), deps.onBack()), {
          dataset: { testid: 'editor-back' },
        }),
        h('h2', {}, 'Character Sheets'),
        modeBar,
        h(
          'div',
          { class: 'editor-toolbar' },
          button('+ Character', () => newCharacterDialog(), {
            class: 'primary',
            dataset: { testid: 'add-character' },
          }),
          button('+ Enemy', () => openEnemyEditor(assets, null), {
            class: 'primary',
            dataset: { testid: 'add-enemy' },
          }),
          button('Party', () => openPartyDialog(assets), { dataset: { testid: 'open-party' } }),
        ),
      ),
      body,
    ),
  );

  const sheets = () => Object.values(assets.bundle.party);

  const renderMode = () => {
    replaceChildren(
      modeBar,
      button('Characters', () => ((mode = 'characters'), renderMode()), {
        class: mode === 'characters' ? 'on' : '',
        dataset: { testid: 'mode-characters' },
      }),
      button('Enemies', () => ((mode = 'enemies'), renderMode()), {
        class: mode === 'enemies' ? 'on' : '',
        dataset: { testid: 'mode-enemies' },
      }),
    );
    replaceChildren(body, mode === 'characters' ? charactersView : enemiesView);
    if (mode === 'enemies' && !refreshEnemies) refreshEnemies = mountEnemyBrowser(enemiesView, assets);
  };

  const renderChips = () => {
    const pinned = pinnedGroup(prefs.all);
    replaceChildren(
      chips,
      GROUP_KEYS.map((k) => {
        const b = button(groupChipLabel(k, sheets()), () => ((group = k), renderChips(), renderList()), {
          class: `${group === k ? 'on' : ''}${pinned === k ? ' pinned' : ''}`,
          title:
            k === 'ALL'
              ? 'Show every character (double-click to make this the default tab)'
              : `Show only ${groupLabel(k)} (double-click to make this the default tab)`,
          dataset: { testid: `group-${k}` },
        });
        b.addEventListener('dblclick', () => {
          prefs.set(DEFAULT_GROUP_PREF, pinned === k ? null : k);
          group = k;
          renderChips();
          renderList();
        });
        return b;
      }),
    );
  };

  const renderList = () => {
    const shown = sheetsInGroup(sheets(), group);
    replaceChildren(
      list,
      shown.length === 0
        ? h(
            'div',
            { class: 'muted small empty' },
            group === 'ALL'
              ? 'No characters yet.'
              : `No one in ${groupLabel(group)}. Right-click a character to move it here.`,
          )
        : shown.map((s) => {
            const icon = h('canvas', { width: 36, height: 36, class: 'party-icon' });
            if (!drawSpritePreview(icon, s.spritePath, 36)) {
              const ctx = icon.getContext('2d');
              if (ctx) {
                ctx.fillStyle = s.color;
                ctx.beginPath();
                ctx.arc(18, 18, 15, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            const row = h(
              'div',
              {
                class: `sheet-row${selected === s.name ? ' on' : ''}${s.dead ? ' dead' : ''}`,
                onclick: () => select(s.name),
                dataset: { testid: `sheet-row-${s.name}` },
              },
              icon,
              h(
                'div',
                { class: 'grow' },
                h(
                  'div',
                  { class: 'name' },
                  s.dead && h('span', { class: 'dead-mark', title: 'Perished in battle' }, '✝ '),
                  s.name,
                ),
                h('div', { class: 'muted small' }, sheetSubtitle(s)),
              ),
              group === 'ALL' && s.group && h('span', { class: 'badge' }, groupLabel(s.group)),
            );
            row.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              groupMenu(s.name, e.clientX, e.clientY);
            });
            return row;
          }),
    );
  };

  const groupMenu = (name: string, x: number, y: number) => {
    document.querySelector('.context-menu')?.remove();
    const sheet = assets.bundle.party[name];
    if (!sheet) return;
    const menu = h(
      'div',
      { class: 'context-menu', style: `left:${x}px;top:${y}px`, dataset: { testid: 'group-menu' } },
      h('div', { class: 'muted small' }, 'Move to group'),
      ([null, ...CHAR_GROUPS] as (CharGroup | null)[]).map((g) =>
        button(
          `${sheet.group === g ? '● ' : '○ '}${groupLabel(g)}`,
          () => {
            menu.remove();
            pane?.flush();
            const fresh = assets.bundle.party[name];
            if (fresh) assets.saveSheet({ ...fresh, group: g }, name);
          },
          { dataset: { testid: `move-${g ?? 'none'}` } },
        ),
      ),
    );
    document.body.appendChild(menu);
    const close = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('mousedown', close);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
  };

  const select = (name: string | null) => {
    pane?.destroy();
    pane = null;
    selected = name;
    const sheet = name ? assets.bundle.party[name] : undefined;
    if (!sheet) {
      selected = null;
      replaceChildren(
        paneHost,
        h('div', { class: 'muted empty' }, 'Select a character or create one to get started'),
      );
    } else {
      pane = mountSheetPane(paneHost, sheet, {
        assets,
        onDeleted: () => select(null),
        onRenamed: (n) => {
          selected = n;
          renderList();
        },
      });
    }
    renderList();
  };

  const newCharacterDialog = () => {
    const d = NEW_CHARACTER_DEFAULTS;
    const tid = (id: string) => ({ dataset: { testid: `new-char-${id}` } });
    const name = textField(d.name, tid('name'));
    const color = colorField(d.color, tid('color'));
    const hp = intField(d.totalHP, 1, 9999, tid('hp'));
    const ac = intField(d.armorClass, 0, 99, tid('ac'));
    const attrs = ATTRIBUTE_SHORT.map((s, i) =>
      intField(d.attributes[i] ?? 0, -99, 99, { dataset: { testid: `new-char-${s}` } }),
    );
    const weapons = [
      { value: '', label: 'None' },
      ...Object.keys(assets.bundle.weapons)
        .sort()
        .map((n) => ({ value: n, label: n })),
    ];
    const accs = [
      { value: '', label: 'None' },
      ...Object.keys(assets.bundle.accessories)
        .sort()
        .map((n) => ({ value: n, label: n })),
    ];
    const weapon = selectField(weapons, '', tid('weapon'));
    const accSel = [0, 1, 2].map((i) => selectField(accs, '', tid(`acc${i + 1}`)));
    const g = formGrid();
    g.row('Name:', name);
    g.row('Color:', color.el);
    g.row('Total HP:', hp.el);
    g.row('Armor Class:', ac.el);
    ATTRIBUTE_SHORT.forEach((s, i) => g.row(`${s}:`, (attrs[i] as (typeof attrs)[number]).el));
    g.row('Weapon:', weapon.el);
    accSel.forEach((a, i) => g.row(`Accessory ${i + 1}:`, a.el));
    editorDialog({
      title: 'New Character',
      body: g.el,
      okLabel: 'Create',
      width: 400,
      testid: 'new-character',
      onOk: () => {
        if ([hp, ac, ...attrs].some((f) => f.invalid())) return warn('Error', 'Invalid number format.');
        const sheet = newCharacter({
          name: name.value,
          color: color.get(),
          totalHP: hp.get(),
          armorClass: ac.get(),
          attributes: attrs.map((a) => a.get()) as [number, number, number, number, number, number],
          weapon: assets.bundle.weapons[weapon.get()] ?? null,
          accessories: accSel.map((a) => assets.bundle.accessories[a.get()] ?? null) as [null, null, null],
          // a new character joins the group being shown
          group: group === 'ALL' ? null : group,
        });
        const res = assets.createSheet(sheet);
        if (!res.ok) return warn(res.title, res.message);
        mode = 'characters';
        renderMode();
        select(sheet.name);
        return true;
      },
    });
  };

  const unsub = assets.subscribe((change) => {
    renderChips();
    if (mode === 'enemies') refreshEnemies?.();
    else refreshEnemies = null;
    if (
      change.kind === 'sheet' &&
      change.sheet &&
      change.oldName === selected &&
      change.sheet.name !== selected
    )
      selected = change.sheet.name;
    // another source changed the open sheet (spell rename, group move): rebuild
    // the pane; the pane's own saves leave it alone
    if (
      change.kind === 'sheet' &&
      pane &&
      !pane.isWriting() &&
      change.sheet &&
      change.sheet.name === selected
    ) {
      const keep = selected;
      pane.destroy();
      pane = null;
      selected = null;
      select(keep);
      return;
    }
    renderList();
  });

  renderMode();
  renderChips();
  select(selected);
  return () => {
    unsub();
    pane?.destroy();
    document.querySelector('.context-menu')?.remove();
    root.replaceChildren();
  };
}
