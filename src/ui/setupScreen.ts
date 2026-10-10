/** GridSetupDialog as a page: shape, size, custom paint, presets, theme, Start; plus scenario/battle loading links. */
import type { GridShapePresetDef } from '../assets/types.ts';
import { enabledCount, maskForShape, type ShapeType } from '../engine/rules/gridShapes.ts';
import type { GridSetup } from '../engine/types.ts';
import { button, h, numberInput, readInt, replaceChildren } from './dom.ts';

export interface SetupDeps {
  presets: GridShapePresetDef[];
  savePreset: (p: GridShapePresetDef) => Promise<void>;
  deletePreset: (name: string) => Promise<void>;
  battles: string[];
  onStart: (setup: GridSetup) => void;
  onLoadBattle: (name: string) => void;
}

export function mountSetupScreen(root: HTMLElement, deps: SetupDeps): void {
  let shape: ShapeType = 'RECTANGLE';
  let rows = 8,
    cols = 8;
  let theme = 'stone';
  let mask: boolean[][] | null = null; // custom paint
  const rowsIn = numberInput(rows, { min: 1, max: 25, dataset: { testid: 'rows' } });
  const colsIn = numberInput(cols, { min: 1, max: 25, dataset: { testid: 'cols' } });
  const themeSel = h(
    'select',
    { dataset: { testid: 'setup-theme' } },
    ...['stone', 'grass', 'dirt'].map((t) => h('option', { value: t }, t)),
  );
  const preview = h('div', { class: 'paint' });
  const count = h('div', { class: 'muted' });
  const presetName = h('input', { placeholder: 'Preset name' });
  const presetList = h('div', { class: 'col' });
  let painting: boolean | null = null;

  const currentMask = (): boolean[][] | null => (shape === 'CUSTOM' ? mask : maskForShape(shape, rows, cols));
  const readSize = () => {
    const r = readInt(rowsIn),
      c = readInt(colsIn);
    const nr = Math.max(1, Math.min(25, r ?? rows)),
      nc = Math.max(1, Math.min(25, c ?? cols));
    if (shape === 'CUSTOM' && (nr !== rows || nc !== cols))
      mask = Array.from({ length: nr }, () => new Array<boolean>(nc).fill(true));
    rows = nr;
    cols = nc;
  };
  const renderPreview = () => {
    readSize();
    const m = currentMask();
    preview.style.gridTemplateColumns = `repeat(${cols}, 14px)`;
    replaceChildren(
      preview,
      ...Array.from({ length: rows * cols }, (_, i) => {
        const r = Math.floor(i / cols),
          c = i % cols;
        const on = m ? (m[r]?.[c] ?? false) : true;
        const cell = h('div', { class: on ? '' : 'off', dataset: { testid: `cell-${r}-${c}` } });
        if (shape === 'CUSTOM') {
          cell.onpointerdown = () => {
            mask ??= Array.from({ length: rows }, () => new Array<boolean>(cols).fill(true));
            painting = !(mask[r]?.[c] ?? true);
            (mask[r] as boolean[])[c] = painting;
            renderPreview();
          };
          cell.onpointerenter = () => {
            if (painting === null || !mask) return;
            (mask[r] as boolean[])[c] = painting;
            renderPreview();
          };
        }
        return cell;
      }),
    );
    count.textContent = `${enabledCount(m, rows, cols)} playable tiles`;
  };
  document.addEventListener('pointerup', () => (painting = null));
  const renderPresets = () => {
    replaceChildren(
      presetList,
      ...(deps.presets.length === 0
        ? [
            h(
              'div',
              { class: 'muted small' },
              'No saved presets yet - paint a shape and save it to see it here.',
            ),
          ]
        : deps.presets.map((p) =>
            h(
              'div',
              { class: 'row' },
              h('b', {}, p.name),
              h('span', { class: 'muted small' }, `${p.rows} x ${p.cols}`),
              button('Use', () => {
                shape = 'CUSTOM';
                rows = p.rows;
                cols = p.cols;
                rowsIn.value = String(rows);
                colsIn.value = String(cols);
                mask = p.mask.map((row) => [...row]);
                renderShapes();
                renderPreview();
              }),
              button(
                'Delete',
                () =>
                  void deps.deletePreset(p.name).then(() => {
                    deps.presets = deps.presets.filter((x) => x.name !== p.name);
                    renderPresets();
                  }),
                { class: 'danger' },
              ),
            ),
          )),
    );
  };
  const shapesEl = h('div', { class: 'row' });
  const renderShapes = () =>
    replaceChildren(
      shapesEl,
      ...(['RECTANGLE', 'CIRCLE', 'DIAMOND', 'PLUS', 'CUSTOM'] as const).map((s) =>
        button(
          s[0] + s.slice(1).toLowerCase(),
          () => {
            shape = s;
            if (s === 'CUSTOM')
              mask = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(true));
            renderShapes();
            renderPreview();
          },
          { class: `toggle${shape === s ? ' on' : ''}`, dataset: { testid: `shape-${s}` } },
        ),
      ),
    );
  rowsIn.oninput = colsIn.oninput = renderPreview;
  themeSel.onchange = () => (theme = themeSel.value);
  renderShapes();
  renderPreview();
  renderPresets();
  const start = button(
    'Start',
    () => {
      readSize();
      deps.onStart({ rows, cols, mask: currentMask(), theme });
    },
    { class: 'primary', dataset: { testid: 'start' } },
  );
  const battleSel = h('select', {}, ...deps.battles.map((n) => h('option', { value: n }, n)));
  replaceChildren(
    root,
    h(
      'div',
      { class: 'setup' },
      h(
        'div',
        { class: 'col', style: 'width:200px' },
        h('div', { class: 'header' }, 'Battle Setup'),
        h('div', { class: 'muted small' }, 'Choose a battle grid shape and size'),
        shapesEl,
        h('div', { class: 'sep' }),
        h('div', { class: 'row' }, 'Rows', rowsIn),
        h('div', { class: 'row' }, 'Cols', colsIn),
        h('div', { class: 'row' }, 'Theme', themeSel),
        count,
        h('div', { class: 'sep' }),
        start,
      ),
      h(
        'div',
        { class: 'col' },
        h('div', { class: 'header' }, 'Preview'),
        preview,
        h('div', { class: 'muted small' }, 'Pick Custom to paint tiles'),
        h(
          'div',
          { class: 'row' },
          button('Clear', () => {
            if (shape === 'CUSTOM') {
              mask = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
              renderPreview();
            }
          }),
          button('Fill All', () => {
            if (shape === 'CUSTOM') {
              mask = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(true));
              renderPreview();
            }
          }),
          presetName,
          button(
            'Save Preset',
            () => {
              const name = presetName.value.trim();
              if (!name || !mask) return;
              const p: GridShapePresetDef = { name, rows, cols, mask: mask.map((r) => [...r]), extra: {} };
              void deps.savePreset(p).then(() => {
                deps.presets = [...deps.presets.filter((x) => x.name !== name), p];
                renderPresets();
              });
            },
            { class: 'success' },
          ),
        ),
      ),
      h(
        'div',
        { class: 'col', style: 'width:260px' },
        h('div', { class: 'header' }, 'Presets'),
        presetList,
        h('div', { class: 'sep' }),
        h('div', { class: 'header' }, 'Saved battles'),
        deps.battles.length
          ? h(
              'div',
              { class: 'row' },
              battleSel,
              button('Load', () => deps.onLoadBattle(battleSel.value), { dataset: { testid: 'load-saved' } }),
            )
          : h('div', { class: 'muted small' }, 'none in saves/battles/'),
        h(
          'div',
          { class: 'muted small' },
          'Dev: ',
          h('a', { href: '?scenario=test&seed=1', style: 'color:#8ec5ff' }, '?scenario=test'),
          ' · ',
          h('a', { href: '/player.html', target: '_blank', style: 'color:#8ec5ff' }, 'player window'),
        ),
      ),
    ),
  );
}
