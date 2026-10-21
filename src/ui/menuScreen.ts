/** MainMenuView: title, the big buttons, and the player-window shortcut. */
import { button, h, replaceChildren } from './dom.ts';

export interface MenuDeps {
  onBattle: () => void;
  onSheets: () => void;
  onAssets: () => void;
  onRules: () => void;
  /** true when assets come from a fixture scenario: edits are not saved */
  readOnly: boolean;
}

export function mountMenuScreen(root: HTMLElement, deps: MenuDeps): () => void {
  const big = (label: string, sub: string, onclick: () => void, testid: string) => {
    const tile = button('', onclick, { class: 'menu-tile', dataset: { testid } });
    tile.append(h('span', {}, h('strong', {}, label), h('small', {}, sub)));
    return tile;
  };
  replaceChildren(
    root,
    h(
      'div',
      { class: 'menu', dataset: { testid: 'menu' } },
      h('h1', {}, 'Cassandralis Combat Simulator'),
      h('div', { class: 'menu-sub' }, 'v4.7.2891-BETA.r38291.mil.gov.cass // BUILD 2170.11.07.1943-SEC3'),
      h(
        'div',
        { class: 'menu-tiles' },
        big('Start Battle System', 'set up a board and fight', deps.onBattle, 'menu-battle'),
        big('Character Sheets', 'party, characters and enemies', deps.onSheets, 'menu-sheets'),
        big('Asset Editor', 'items, terrain and spells', deps.onAssets, 'menu-assets'),
        big('Rules', 'how combat is worked out', deps.onRules, 'menu-rules'),
      ),
      h(
        'div',
        { class: 'row', style: 'justify-content:center;margin-top:18px' },
        button('Open player window', () => window.open('/player.html', 'dndsim-player'), {
          title: 'The second screen: mirrors the battle, with the display options in Field → TV',
        }),
      ),
      deps.readOnly &&
        h(
          'div',
          { class: 'menu-note', dataset: { testid: 'readonly-note' } },
          'Fixture scenario: edits stay in this tab and are not written to saves/.',
        ),
    ),
  );
  return () => replaceChildren(root);
}
