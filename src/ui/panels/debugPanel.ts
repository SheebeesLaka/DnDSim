/** Backtick-toggled dev tools: spawn, HP, elevation/altitude, lights, groups, ambient, reveal, compat, prefs, state copy, command log. */
import type { AssetBundle } from '../../assets/types.ts';
import { COMPAT_FLAG_INFO, type CompatFlags } from '../../engine/compat.ts';
import type { PrefsStore } from '../../app/prefs.ts';
import type { Store } from '../../app/store.ts';
import { combatants, unitName } from '../../engine/selectors/board.ts';
import { button, h, numberInput, readInt, replaceChildren } from '../dom.ts';

export function mountDebugPanel(
  store: Store,
  getBundle: () => AssetBundle,
  prefs: PrefsStore,
  readOnly: { get: () => boolean; set: (v: boolean) => void },
): { render: (open: boolean) => void; destroy: () => void } {
  const el = h('div', { class: 'debug', dataset: { testid: 'debug' } });
  let mounted = false;
  const dispatch = store.dispatch.bind(store);

  function render(open: boolean): void {
    if (!open) {
      if (mounted) {
        el.remove();
        mounted = false;
      }
      return;
    }
    if (!mounted) {
      document.body.appendChild(el);
      mounted = true;
    }
    const b = store.battle;
    const s = store.session;
    const unitSel = h(
      'select',
      { dataset: { testid: 'dbg-unit' } },
      ...combatants(b).map((u) =>
        h('option', { value: u.id, selected: s.selectedId === u.id }, `${u.id} ${unitName(u)}`),
      ),
    );
    const uid = () => unitSel.value;
    const hp = numberInput('', { placeholder: 'HP' });
    const alt = numberInput('', { placeholder: 'alt' });
    const r = numberInput('', { placeholder: 'r', style: 'width:48px' });
    const c = numberInput('', { placeholder: 'c', style: 'width:48px' });
    const lvl = numberInput('', { placeholder: 'elev', style: 'width:56px' });
    const spawnSel = h(
      'select',
      { dataset: { testid: 'dbg-spawn' } },
      ...Object.keys(getBundle().enemies).map((k) => h('option', { value: `enemy:${k}` }, `enemy ${k}`)),
      ...Object.keys(getBundle().party).map((k) => h('option', { value: `party:${k}` }, `party ${k}`)),
      ...getBundle().terrain.map((t) => h('option', { value: `terrain:${t.type}` }, `terrain ${t.type}`)),
    );
    const lightSel = h(
      'select',
      {},
      ...b.board.lights.map((l) => h('option', { value: l.id }, `${l.id} ${l.name} ${l.on ? 'ON' : 'off'}`)),
    );
    const groupSel = h(
      'select',
      {},
      ...b.board.lightGroups.map((g) => h('option', { value: g.id }, `${g.id} ${g.on ? 'ON' : 'off'}`)),
    );
    const lb = numberInput(2, { placeholder: 'bright', style: 'width:52px' });
    const ld = numberInput(4, { placeholder: 'dim', style: 'width:52px' });
    const lcolor = h('input', { type: 'color', value: '#ffd9a0' });
    const compat = h(
      'div',
      { class: 'col small' },
      ...(Object.keys(COMPAT_FLAG_INFO) as (keyof CompatFlags)[]).map((k) =>
        h(
          'label',
          {
            title: `${COMPAT_FLAG_INFO[k].ref}: legacy = ${COMPAT_FLAG_INFO[k].legacy}; fixed = ${COMPAT_FLAG_INFO[k].fixed}`,
          },
          h('input', {
            type: 'checkbox',
            checked: b.rules.compat[k],
            onchange: (ev) =>
              dispatch({ type: 'SET_COMPAT', flags: { [k]: (ev.target as HTMLInputElement).checked } }),
            dataset: { testid: `compat-${k}` },
          }),
          ` ${k} (${COMPAT_FLAG_INFO[k].ref})`,
        ),
      ),
    );
    const d = prefs.display;
    const prefRow = h(
      'div',
      { class: 'col small' },
      h(
        'label',
        {},
        'enemyHp ',
        h(
          'select',
          {
            onchange: (ev) =>
              prefs.setDisplay({ enemyHp: (ev.target as HTMLSelectElement).value as typeof d.enemyHp }),
            dataset: { testid: 'pref-enemyHp' },
          },
          ...(['EXACT', 'VAGUE', 'HIDDEN'] as const).map((v) =>
            h('option', { value: v, selected: d.enemyHp === v }, v),
          ),
        ),
      ),
      ...(
        [
          'partyHpNumbers',
          'combatNumbers',
          'statusText',
          'enemyInitiativeRolls',
          'enemyNames',
          'turnStrip',
          'spellTemplates',
        ] as const
      ).map((k) =>
        h(
          'label',
          {},
          h('input', {
            type: 'checkbox',
            checked: d[k],
            onchange: (ev) => prefs.setDisplay({ [k]: (ev.target as HTMLInputElement).checked }),
            dataset: { testid: `pref-${k}` },
          }),
          ` ${k}`,
        ),
      ),
    );
    const log = h(
      'div',
      { class: 'log' },
      store.commandLog
        .slice(-25)
        .map(
          (e) =>
            `${e.n} ${e.ok ? '✓' : '✗'} ${e.command.type} ${JSON.stringify({ ...e.command, type: undefined })}${e.error ? ' — ' + e.error : ''}`,
        )
        .join('\n'),
    );
    replaceChildren(
      el,
      h(
        'div',
        { class: 'row' },
        h('b', { style: 'color:#4ec9b0' }, 'Debug'),
        h('span', { class: 'muted' }, '(` to close)'),
        h('span', { style: 'flex:1' }),
        button('Copy state', () => void navigator.clipboard?.writeText(JSON.stringify(b, null, 2))),
        button('Skip placement', () => dispatch({ type: 'SKIP_PLACEMENT' }), {
          disabled: b.turn.placementQueue.length === 0,
        }),
      ),
      h('h4', {}, 'Unit'),
      h(
        'div',
        { class: 'row' },
        unitSel,
        hp,
        button('Set HP', () => dispatch({ type: 'SET_HP', unitId: uid(), hp: readInt(hp) ?? 0 }), {
          dataset: { testid: 'dbg-sethp' },
        }),
        alt,
        button('Set altitude', () =>
          dispatch({ type: 'SET_ALTITUDE', unitId: uid(), altitude: readInt(alt) ?? 0 }),
        ),
        button('Attach light', () =>
          dispatch({
            type: 'ADD_LIGHT',
            light: {
              name: `${uid()} light`,
              brightRadius: readInt(lb) ?? 2,
              dimRadius: readInt(ld) ?? 4,
              color: lcolor.value,
              attachedTo: uid(),
              on: true,
            },
          }),
        ),
      ),
      h('h4', {}, 'Spawn / cell'),
      h(
        'div',
        { class: 'row' },
        spawnSel,
        r,
        c,
        button(
          'Spawn',
          () => {
            const [kind, ...rest] = spawnSel.value.split(':');
            const name = rest.join(':');
            const rr = readInt(r) ?? 0,
              cc = readInt(c) ?? 0;
            dispatch(
              kind === 'enemy'
                ? { type: 'PLACE_ENEMY', templateStem: name, r: rr, c: cc }
                : kind === 'party'
                  ? { type: 'PLACE_ENTITY', name, r: rr, c: cc }
                  : { type: 'PLACE_TERRAIN', terrainType: name, r: rr, c: cc },
            );
          },
          { dataset: { testid: 'dbg-spawn-btn' } },
        ),
        lvl,
        button(
          'Set elevation',
          () =>
            dispatch({
              type: 'SET_ELEVATION',
              r: readInt(r) ?? 0,
              c: readInt(c) ?? 0,
              level: readInt(lvl) ?? 0,
            }),
          { dataset: { testid: 'dbg-setelev' } },
        ),
        button(
          'Light here',
          () =>
            dispatch({
              type: 'ADD_LIGHT',
              light: {
                name: `light ${readInt(r) ?? 0},${readInt(c) ?? 0}`,
                brightRadius: readInt(lb) ?? 2,
                dimRadius: readInt(ld) ?? 4,
                color: lcolor.value,
                at: { r: readInt(r) ?? 0, c: readInt(c) ?? 0 },
                on: true,
              },
            }),
          { dataset: { testid: 'dbg-light' } },
        ),
      ),
      h('div', { class: 'row small' }, 'bright', lb, 'dim', ld, lcolor),
      h('h4', {}, 'Lights'),
      h(
        'div',
        { class: 'row' },
        lightSel,
        button(
          'Toggle',
          () => lightSel.value && dispatch({ type: 'TOGGLE_LIGHT', lightId: lightSel.value }),
          { dataset: { testid: 'dbg-toggle-light' } },
        ),
        button('Remove', () => lightSel.value && dispatch({ type: 'REMOVE_LIGHT', lightId: lightSel.value })),
        groupSel,
        button(
          'Toggle group',
          () => groupSel.value && dispatch({ type: 'TOGGLE_LIGHT_GROUP', groupId: groupSel.value }),
          { dataset: { testid: 'dbg-toggle-group' } },
        ),
      ),
      h(
        'div',
        { class: 'row' },
        'Ambient',
        ...(['bright', 'dim', 'dark'] as const).map((l) =>
          button(l, () => dispatch({ type: 'SET_AMBIENT', level: l }), {
            class: `toggle${b.board.ambient === l ? ' on' : ''}`,
            dataset: { testid: `dbg-ambient-${l}` },
          }),
        ),
        h(
          'label',
          {},
          h('input', {
            type: 'checkbox',
            checked: b.board.dmReveal,
            onchange: (ev) =>
              dispatch({ type: 'SET_DM_REVEAL', on: (ev.target as HTMLInputElement).checked }),
            dataset: { testid: 'dbg-reveal' },
          }),
          ' DM reveal',
        ),
      ),
      h('h4', {}, 'Compat flags (checked = legacy behaviour)'),
      compat,
      h('h4', {}, 'Player display (display.player.*)'),
      prefRow,
      h(
        'label',
        { class: 'small' },
        h('input', {
          type: 'checkbox',
          checked: readOnly.get(),
          onchange: (ev) => readOnly.set((ev.target as HTMLInputElement).checked),
        }),
        ' read-only: do not write party sheets',
      ),
      h('h4', {}, 'Command log'),
      log,
    );
  }
  return { render, destroy: () => el.remove() };
}
