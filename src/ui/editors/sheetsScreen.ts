import type { PrefsStore } from '../../app/prefs.ts';
import type { AssetStore } from '../../editors/assetStore.ts';
import { button, h, replaceChildren } from '../dom.ts';

/** Character Sheets (FEATURES.md §14.1): being built next. */
export function mountSheetsScreen(
  root: HTMLElement,
  deps: { assets: AssetStore; prefs: PrefsStore; inBattle: boolean; onBack: () => void },
): () => void {
  replaceChildren(
    root,
    h(
      'div',
      { class: 'editor-page' },
      h(
        'div',
        { class: 'editor-head' },
        button('← Back', deps.onBack, { dataset: { testid: 'editor-back' } }),
        h('h2', {}, 'Character Sheets'),
      ),
      h('div', { class: 'muted' }, 'Coming in the next step.'),
    ),
  );
  return () => root.replaceChildren();
}
