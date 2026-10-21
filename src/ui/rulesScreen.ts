/**
 * The Rules screen: docs/RULES.md, bundled at build time, shown as one tab per
 * part (Players, DM) with a jump list of that part's sections.
 */
import rulesMd from '../../docs/RULES.md?raw';
import { button, h, replaceChildren } from './dom.ts';
import { parseBlocks, renderBlocks, splitParts } from './markdown.ts';

export interface RulesDeps {
  onBack: () => void;
  /** "← Back to battle" when opened over a running battle */
  backLabel?: string;
}

const doc = splitParts(rulesMd);

export function mountRulesScreen(root: HTMLElement, deps: RulesDeps): () => void {
  let part = 0;
  const tabs = h('div', { class: 'tabs' });
  const jump = h('div', { class: 'rules-jump' });
  const body = h('div', { class: 'rules-doc', dataset: { testid: 'rules-doc' } });
  const scroller = h('div', { class: 'editor-body rules-body' }, body);

  const render = () => {
    const current = doc.parts[part];
    const blocks = parseBlocks(current?.body ?? '');
    replaceChildren(
      tabs,
      doc.parts.map((p, i) =>
        button(p.title, () => ((part = i), render(), (scroller.scrollTop = 0)), {
          class: i === part ? 'on' : '',
          dataset: { testid: `rules-tab-${i}` },
        }),
      ),
    );
    replaceChildren(
      jump,
      blocks
        .filter((b) => b.kind === 'heading' && b.level === 2)
        .map((b) =>
          b.kind === 'heading'
            ? button(b.text, () => body.querySelector(`#${CSS.escape(b.id)}`)?.scrollIntoView())
            : null,
        ),
    );
    replaceChildren(
      body,
      part === 0 && doc.intro ? renderBlocks(parseBlocks(doc.intro)).map(withClass('rules-intro')) : null,
      renderBlocks(blocks),
    );
  };

  replaceChildren(
    root,
    h(
      'div',
      { class: 'editor-page', dataset: { testid: 'rules' } },
      h(
        'div',
        { class: 'editor-head' },
        button(deps.backLabel ?? '← Back', deps.onBack, { dataset: { testid: 'rules-back' } }),
        h('h2', {}, 'Rules'),
      ),
      tabs,
      jump,
      scroller,
    ),
  );
  render();
  return () => replaceChildren(root);
}

const withClass =
  (cls: string) =>
  (el: HTMLElement): HTMLElement => {
    el.classList.add(cls);
    return el;
  };
