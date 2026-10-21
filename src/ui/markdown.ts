/**
 * The small Markdown subset the in-app docs use (docs/RULES.md): headings,
 * paragraphs, flat bullet and numbered lists, pipe tables, `code`, **bold**,
 * *italic* and ---. Parsing is pure (testable without a DOM); rendering builds
 * elements with h(), never innerHTML, so the text is always shown as text.
 */
import { h } from './dom.ts';

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string };

export type Block =
  | { kind: 'heading'; level: number; text: string; id: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'rule' };

/** A document split at its `# ` headings: the text before the first one, then one part per heading. */
export interface MarkdownParts {
  intro: string;
  parts: { title: string; body: string }[];
}

export function splitParts(md: string): MarkdownParts {
  const out: MarkdownParts = { intro: '', parts: [] };
  const intro: string[] = [];
  let body: string[] = intro;
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^# (.+)$/.exec(line);
    if (m) {
      body = [];
      out.parts.push({ title: (m[1] ?? '').trim(), body: '' });
    } else body.push(line);
    const last = out.parts[out.parts.length - 1];
    if (last) last.body = body.join('\n');
  }
  out.intro = intro.join('\n').trim();
  return out;
}

export const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'paragraph', text: para.join(' ') });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const heading = /^(#{1,6}) (.+)$/.exec(line);
    const bullet = /^- (.*)$/.exec(line);
    const numbered = /^(\d+)\. (.*)$/.exec(line);
    if (line.trim() === '') flush();
    else if (heading) {
      flush();
      const text = (heading[2] ?? '').trim();
      blocks.push({ kind: 'heading', level: heading[1]?.length ?? 1, text, id: slug(text) });
    } else if (/^-{3,}$/.test(line.trim())) {
      flush();
      blocks.push({ kind: 'rule' });
    } else if (line.trimStart().startsWith('|')) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').trimStart().startsWith('|')) {
        const row = cells(lines[i] ?? '');
        if (!row.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(row);
        i++;
      }
      i--;
      blocks.push({ kind: 'table', head: rows[0] ?? [], rows: rows.slice(1) });
    } else if (bullet || numbered) {
      flush();
      const ordered = !bullet;
      const items: string[] = [];
      const start = numbered ? Number(numbered[1]) : 1;
      while (i < lines.length) {
        const l = lines[i] ?? '';
        const item = ordered ? /^\d+\. (.*)$/.exec(l) : /^- (.*)$/.exec(l);
        if (item) items.push(item[1] ?? '');
        else if (/^\s+\S/.test(l) && items.length) items[items.length - 1] += ' ' + l.trim();
        else break;
        i++;
      }
      i--;
      blocks.push({ kind: 'list', ordered, start, items });
    } else para.push(line.trim());
  }
  flush();
  return blocks;
}

/** `code` first (its insides stay literal), then **bold**, then *italic*. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /`([^`]+)`|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'code', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'strong', text: m[2] });
    else out.push({ kind: 'em', text: m[3] ?? '' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

function inline(text: string): (Node | string)[] {
  return parseInline(text).map((t) =>
    t.kind === 'text'
      ? t.text
      : t.kind === 'code'
        ? h('code', {}, t.text)
        : t.kind === 'strong'
          ? h('strong', {}, ...inline(t.text))
          : h('em', {}, ...inline(t.text)),
  );
}

export function renderBlocks(blocks: readonly Block[]): HTMLElement[] {
  return blocks.map((b) => {
    switch (b.kind) {
      case 'heading': {
        const tag = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const)[Math.min(6, b.level) - 1] ?? 'h6';
        return h(tag, { id: b.id }, ...inline(b.text));
      }
      case 'paragraph':
        return h('p', {}, ...inline(b.text));
      case 'list': {
        const items = b.items.map((it) => h('li', {}, ...inline(it)));
        return b.ordered ? h('ol', { start: b.start }, ...items) : h('ul', {}, ...items);
      }
      case 'table':
        return h(
          'div',
          { class: 'md-table' },
          h(
            'table',
            {},
            h('thead', {}, h('tr', {}, ...b.head.map((c) => h('th', {}, ...inline(c))))),
            h('tbody', {}, ...b.rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, ...inline(c)))))),
          ),
        );
      case 'rule':
        return h('hr');
    }
  });
}
