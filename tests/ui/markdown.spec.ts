import { describe, expect, it } from 'vitest';
import { parseBlocks, parseInline, slug, splitParts } from '../../src/ui/markdown.ts';

describe('markdown subset', () => {
  it('splits a document at its # headings, keeping the text before the first', () => {
    const doc = splitParts('Intro line.\n\n# Players\n\n## Moving\nGo.\n\n# DM\nRun it.\r\n');
    expect(doc.intro).toBe('Intro line.');
    expect(doc.parts.map((p) => p.title)).toEqual(['Players', 'DM']);
    expect(doc.parts[0]?.body).toContain('## Moving');
    expect(doc.parts[1]?.body.trim()).toBe('Run it.');
  });

  it('reads headings, paragraphs (wrapped lines joined) and rules', () => {
    expect(parseBlocks('## Your numbers\nOne\ntwo.\n\n---\nThree.')).toEqual([
      { kind: 'heading', level: 2, text: 'Your numbers', id: 'your-numbers' },
      { kind: 'paragraph', text: 'One two.' },
      { kind: 'rule' },
      { kind: 'paragraph', text: 'Three.' },
    ]);
  });

  it('reads lists with wrapped items, and keeps a numbered list going after a table', () => {
    const blocks = parseBlocks('- a\n  more\n- b\n\n1. one\n2. two\n\n| x |\n| --- |\n| 1 |\n\n3. three');
    expect(blocks).toEqual([
      { kind: 'list', ordered: false, start: 1, items: ['a more', 'b'] },
      { kind: 'list', ordered: true, start: 1, items: ['one', 'two'] },
      { kind: 'table', head: ['x'], rows: [['1']] },
      { kind: 'list', ordered: true, start: 3, items: ['three'] },
    ]);
  });

  it('reads tables, skipping the separator row and keeping empty cells', () => {
    expect(parseBlocks('| Level | 1st | 2nd |\n| --- | --- | --- |\n| 1 | 2 | |')).toEqual([
      { kind: 'table', head: ['Level', '1st', '2nd'], rows: [['1', '2', '']] },
    ]);
  });

  it('reads code, bold and italic inline; code stays literal', () => {
    expect(parseInline('a `x * y` **b** *c* d')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'code', text: 'x * y' },
      { kind: 'text', text: ' ' },
      { kind: 'strong', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'em', text: 'c' },
      { kind: 'text', text: ' d' },
    ]);
    expect(parseInline('d20 × 1.5')).toEqual([{ kind: 'text', text: 'd20 × 1.5' }]);
  });

  it('makes heading ids', () => {
    expect(slug('Falling and dying')).toBe('falling-and-dying');
    expect(slug('DM tools that change the math')).toBe('dm-tools-that-change-the-math');
  });
});
