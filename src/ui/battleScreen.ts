/**
 * The DM battle screen: a plain-DOM shell around the engine. Everything the
 * Java BattleView/BattleGridCanvas/TimelinePane/DiceRollPanel did, minus the
 * styling, driven by store commands and session modes.
 */
import type { AssetBundle, SpellDef } from '../assets/types.ts';
import { DICE_PROGRESSION, dieMax, formatDiceList } from '../engine/dice.ts';
import { ammoCompatible, isRanged } from '../engine/rules/combat.ts';
import { actionAvailability } from '../engine/selectors/actions.ts';
import { combatantById, objectAt, partyOnField, unitById, unitName } from '../engine/selectors/board.ts';
import {
  armorClass,
  attackModifier,
  baseDamageDice,
  damageDice,
  equippedWeapon,
  health,
  maxHealth,
  movement,
  adjustedAttribute,
  totalAttributes,
} from '../engine/selectors/stats.ts';
import { computeLighting } from '../engine/selectors/lighting.ts';
import type { BattleEvent, BattleState, Cell, Command, Pending, Unit } from '../engine/types.ts';
import { buildBoardViewModel, type BoardVM } from '../engine/view/boardViewModel.ts';
import type { Store } from '../app/store.ts';
import type { PrefsStore } from '../app/prefs.ts';
import { ATTRIBUTE_SHORT } from '../assets/types.ts';
import { button, h, numberInput, readInt, replaceChildren } from './dom.ts';
import {
  alertDialog,
  confirmDialog,
  spellPickerDialog,
  tieDialog,
  useItemDialog,
  victoryOverlay,
} from './panels/dialogs.ts';
import { mountDebugPanel } from './panels/debugPanel.ts';
import type { BoardRenderer } from './renderer/BoardRenderer.ts';
import { mountBoardToolbar } from './panels/boardToolbar.ts';
import { turnAzimuth, viewOptionsFromPrefs, viewPrefKey } from './viewPrefs.ts';
import { BOARD_THEMES } from './boardThemes.ts';

export interface BattleScreenDeps {
  store: Store;
  /** current assets (the editors can change them while a battle runs) */
  getBundle: () => AssetBundle;
  /** Manage → Character Sheets (R1.3); Back returns to this battle */
  onOpenSheets: () => void;
  /** the spell picker's Edit Spell (opens the shared Spell Editor; `onSaved` reopens the picker) */
  editSpell?: (name: string, onSaved: () => void) => void;
  prefs: PrefsStore;
  renderer: BoardRenderer;
  onVictoryShown?: (party: { name: string; hp: number; maxHp: number; statuses: string[] }[] | null) => void;
  onLeave: () => void;
  saveBattle: (name: string) => Promise<void>;
  loadBattle: (name: string) => Promise<void>;
  listBattles: () => Promise<string[]>;
  persisterReadOnly: { get: () => boolean; set: (v: boolean) => void };
}

const STAT_COLORS = ['#d75f5f', '#4CAF50', '#2196F3', '#FF9800', '#4ec9b0', '#c586c0'];

export function mountBattleScreen(root: HTMLElement, deps: BattleScreenDeps): () => void {
  const { store, prefs, renderer } = deps;
  // read live: the editors can replace the assets while a battle runs

  // ---- layout ----
  const phaseEl = h('div', { class: 'phase', dataset: { testid: 'phase' } });
  const controlsEl = h('div', { class: 'col', style: 'margin-top:6px' });
  const stripEl = h('div', { class: 'strip', dataset: { testid: 'strip' } });
  const topEl = h('div', { class: 'top' }, h('div', { class: 'left' }, phaseEl, controlsEl), stripEl);
  const boardWrap = h('div', { class: 'boardwrap' });
  const sideEl = h('div', { class: 'side', dataset: { testid: 'sidebar' } });
  const mainEl = h('div', { class: 'main' }, boardWrap, sideEl);
  replaceChildren(root, topEl, mainEl);
  renderer.mount(boardWrap, {
    onClick: (e) => onBoardClick(e.cell, e.clientX, e.clientY),
    onHover: (cell) => store.dispatchSession({ type: 'hover', cell }),
    onContextMenu: (e) => onRightClick(e.cell, e.clientX, e.clientY),
  });
  const toolbar = mountBoardToolbar(boardWrap, renderer, prefs);
  let popup: HTMLElement | null = null;
  let victoryEl: HTMLElement | null = null;
  let tieOpen = false;

  const dispatch = (cmd: Command) => store.dispatch(cmd);
  const battle = () => store.battle;
  const session = () => store.session;

  // ---- board interaction (BattleGridCanvas.handlePrimaryAction / handleLeftClick, R9.7) ----
  function onBoardClick(cell: Cell | null, _x: number, _y: number): void {
    const s = session();
    const b = battle();
    if (s.mode.kind === 'elevation') {
      if (cell)
        dispatch(
          s.mode.delta === 0
            ? { type: 'SET_ELEVATION', r: cell.r, c: cell.c, level: 0 }
            : { type: 'ADJUST_ELEVATION', r: cell.r, c: cell.c, delta: s.mode.delta },
        );
      return;
    }
    if (s.pinnedId) closePopup();
    if (!cell) return;
    const obj = objectAt(b, cell.r, cell.c);
    const actionMode =
      s.mode.kind === 'move' ||
      s.mode.kind === 'attack' ||
      s.mode.kind === 'pickup' ||
      s.mode.kind === 'cast';
    if (obj && !actionMode) {
      // Java selects any occupied cell first, even during placement (F-20 preserved)
      store.dispatchSession({ type: 'select', id: obj.id });
      return;
    }
    if (b.turn.placementQueue.length > 0) {
      const name = b.turn.placementQueue[0] as string;
      dispatch({ type: 'PLACE_ENTITY', name, r: cell.r, c: cell.c });
      return;
    }
    if (s.mode.kind === 'placeObject') {
      const [kind, ...rest] = s.mode.key.split(':');
      const name = rest.join(':');
      if (kind === 'party') {
        if (dispatch({ type: 'PLACE_ENTITY', name, r: cell.r, c: cell.c }).ok)
          store.dispatchSession({ type: 'cancelMode' });
      } else if (kind === 'enemy')
        dispatch({ type: 'PLACE_ENEMY', templateStem: name, r: cell.r, c: cell.c });
      else if (kind === 'terrain')
        dispatch({ type: 'PLACE_TERRAIN', terrainType: name, r: cell.r, c: cell.c });
      else if (kind === 'pickup') {
        const [itemKind, ...n] = name.split(':');
        dispatch({
          type: 'PLACE_PICKUP',
          itemKind: itemKind as 'weapon' | 'accessory' | 'consumable',
          itemName: n.join(':'),
          r: cell.r,
          c: cell.c,
        });
      }
      return;
    }
    if (s.mode.kind === 'pickup') {
      dispatch({ type: 'PICKUP', unitId: s.mode.unitId, r: cell.r, c: cell.c });
      store.dispatchSession({ type: 'cancelMode' });
      return;
    }
    if (s.mode.kind === 'move') {
      const res = dispatch({ type: 'MOVE_UNIT', unitId: s.mode.unitId, r: cell.r, c: cell.c });
      if (res.ok) store.dispatchSession({ type: 'cancelMode' });
      else if (obj) store.dispatchSession({ type: 'select', id: obj.id });
      else store.dispatchSession({ type: 'cancelMode' });
      return;
    }
    if (s.mode.kind === 'cast') {
      const spell = store.ctx.assets.spells[s.mode.spellName];
      const caster = combatantById(b, s.mode.unitId);
      if (!spell || !caster) return store.dispatchSession({ type: 'cancelMode' });
      if (spell.area !== 'NONE') {
        if (s.mode.lockedCells) return;
        if (cell.r === caster.r && cell.c === caster.c) return store.dispatchSession({ type: 'cancelMode' });
        const res = dispatch({
          type: 'CAST_SPELL',
          casterId: caster.id,
          spellName: spell.name,
          slotLevel: s.mode.slotLevel,
          aim: cell,
        });
        if (res.ok) {
          const p = res.state.pending;
          if (p && 'flow' in p && p.flow.flow === 'area')
            store.dispatchSession({ type: 'lockArea', cells: p.flow.cells });
          else store.dispatchSession({ type: 'cancelMode' });
        } else if (res.error.code !== 'badAim' && res.error.code !== 'noTargets')
          store.dispatchSession({ type: 'cancelMode' });
        return;
      }
      if (!obj) return store.dispatchSession({ type: 'cancelMode' });
      const res = dispatch({
        type: 'CAST_SPELL',
        casterId: caster.id,
        spellName: spell.name,
        slotLevel: s.mode.slotLevel,
        targetId: obj.id,
      });
      if (res.ok || res.error.code !== 'outOfRange') store.dispatchSession({ type: 'cancelMode' });
      return;
    }
    if (s.mode.kind === 'attack') {
      if (!obj || obj.kind === 'pickup' || obj.id === s.mode.unitId)
        return store.dispatchSession({ type: 'cancelMode' });
      dispatch({ type: 'ATTACK', attackerId: s.mode.unitId, targetId: obj.id });
      store.dispatchSession({ type: 'cancelMode' });
    }
  }

  function onRightClick(cell: Cell | null, x: number, y: number): void {
    closePopup();
    if (!cell) return;
    const obj = objectAt(battle(), cell.r, cell.c);
    if (!obj || (obj.kind !== 'entity' && obj.kind !== 'enemy')) return;
    store.dispatchSession({ type: 'pin', id: obj.id });
    showPopup(obj, x, y);
  }

  function showPopup(u: Unit, x: number, y: number): void {
    closePopup();
    const b = battle();
    const combatant = u.kind === 'entity' || u.kind === 'enemy' ? u : null;
    const rect = boardWrap.getBoundingClientRect();
    popup = h(
      'div',
      {
        class: 'popup',
        style: `left:${Math.min(x - rect.left + 12, rect.width - 180)}px;top:${Math.min(y - rect.top + 12, rect.height - 140)}px`,
        dataset: { testid: 'info-popup' },
      },
      h('div', { style: 'font-weight:700;font-size:13px' }, unitName(u)),
      combatant && h('div', {}, `HP: ${health(combatant)} / ${maxHealth(combatant)}`),
      combatant && h('div', {}, `AC: ${armorClass(combatant)}`),
      combatant && h('div', {}, `MOB: ${movement(combatant)}`),
      combatant && h('div', {}, `DMG: ${damageDice(combatant).filter(Boolean).join('/')}`),
      button('Delete', () => (dispatch({ type: 'REMOVE_UNIT', unitId: u.id }), closePopup()), {
        class: 'danger',
        style: 'margin-top:6px',
        dataset: { testid: 'delete-unit' },
      }),
    );
    boardWrap.appendChild(popup);
    void b;
  }
  function closePopup(): void {
    popup?.remove();
    popup = null;
    if (session().pinnedId) store.dispatchSession({ type: 'pin', id: null });
  }

  // ---- action triggers (BattleGridCanvas.trigger*) ----
  function selectedCombatant() {
    const id = session().selectedId;
    return id ? combatantById(battle(), id) : undefined;
  }
  function toggleMode(kind: 'move' | 'attack' | 'pickup'): void {
    const u = selectedCombatant();
    if (!u) return;
    const avail = actionAvailability(battle(), u.id, store.ctx.assets);
    if (!avail[kind === 'move' ? 'move' : kind === 'attack' ? 'attack' : 'pickup']) return;
    const m = session().mode;
    if (m.kind === kind && 'unitId' in m && m.unitId === u.id)
      return store.dispatchSession({ type: 'cancelMode' });
    if (kind === 'attack' && u.kind === 'entity') {
      const w = equippedWeapon(u);
      if (
        w &&
        isRanged(w.ammoType) &&
        !u.sheet.inventory.some(
          (i) =>
            i.kind === 'ammunition' &&
            i.quantity > 0 &&
            ammoCompatible(
              i.ammoType,
              i.legacyCompatibleWeaponType,
              w.ammoType,
              battle().rules.compat.ammoCompatIgnoresLegacyField,
            ),
        )
      ) {
        alertDialog('No Ammunition', `No ${w.ammoType ?? 'ammo'} ammo in inventory!`);
        return;
      }
    }
    store.dispatchSession({ type: 'setMode', mode: { kind, unitId: u.id } });
  }
  function triggerCast(): void {
    const u = selectedCombatant();
    if (!u || u.kind !== 'entity' || !actionAvailability(battle(), u.id, store.ctx.assets).cast) return;
    if (session().mode.kind === 'cast') return store.dispatchSession({ type: 'cancelMode' });
    store.dispatchSession({ type: 'cancelMode' });
    const spells = u.sheet.knownSpells
      .map((n) => store.ctx.assets.spells[n])
      .filter((s): s is NonNullable<typeof s> => !!s)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    if (!u.sheet.spellcastingStat || spells.length === 0) {
      alertDialog(
        'No Spells',
        `${u.sheet.name} has no spellcasting stat or known spells.\nSet them up on the character sheet.`,
      );
      return;
    }
    const onEdit = deps.editSpell
      ? (spell: SpellDef) => deps.editSpell?.(spell.name, () => triggerCast())
      : undefined;
    spellPickerDialog(u, spells, onEdit, (spell, slot) => {
      if (spell.area !== 'NONE' && spell.area === 'BURST' && spell.range === 0) {
        const res = dispatch({ type: 'CAST_SPELL', casterId: u.id, spellName: spell.name, slotLevel: slot });
        const p = res.ok ? res.state.pending : null;
        if (p && 'flow' in p && p.flow.flow === 'area')
          store.dispatchSession({
            type: 'setMode',
            mode: {
              kind: 'cast',
              unitId: u.id,
              spellName: spell.name,
              slotLevel: slot,
              lockedCells: p.flow.cells,
            },
          });
        return;
      }
      if (
        spell.area === 'NONE' &&
        (spell.targetType === 'SELF' ||
          (spell.range === 0 && battle().rules.compat.rangeZeroResolvesOnCaster))
      ) {
        dispatch({
          type: 'CAST_SPELL',
          casterId: u.id,
          spellName: spell.name,
          slotLevel: slot,
          targetId: u.id,
        });
        return;
      }
      store.dispatchSession({
        type: 'setMode',
        mode: { kind: 'cast', unitId: u.id, spellName: spell.name, slotLevel: slot },
      });
    });
  }
  function triggerUseItem(): void {
    const u = selectedCombatant();
    if (!u || u.kind !== 'entity' || !actionAvailability(battle(), u.id, store.ctx.assets).useItem) return;
    const items = u.sheet.inventory.filter((i) => i.kind === 'consumable');
    if (items.length === 0) return alertDialog('No Items', 'No consumable items in inventory.');
    useItemDialog(items, (name) => dispatch({ type: 'USE_CONSUMABLE', unitId: u.id, itemName: name }));
  }
  function triggerSwap(): void {
    const u = selectedCombatant();
    if (u && actionAvailability(battle(), u.id, store.ctx.assets).swap)
      dispatch({ type: 'SWAP_WEAPON', unitId: u.id });
  }

  // ---- keyboard (R16.1) ----
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === '`')
      return (e.preventDefault(), store.dispatchSession({ type: 'debug', open: !session().debugOpen }));
    if (e.key === 'Home') return renderer.resetCamera();
    if (e.key === '[' || e.key === ']') {
      const cur = viewOptionsFromPrefs(prefs.all, 'dm').azimuth;
      return prefs.set(viewPrefKey('dm', 'azimuth'), String(turnAzimuth(cur, e.key === ']' ? 1 : -1)));
    }
    if (e.key === 'Escape') {
      if (session().mode.kind !== 'none') return store.dispatchSession({ type: 'cancelMode' });
      return;
    }
    const hover = session().hover;
    if (hover && (e.key === '=' || e.key === '+'))
      return dispatch({ type: 'ADJUST_ELEVATION', r: hover.r, c: hover.c, delta: 1 });
    if (hover && e.key === '-')
      return dispatch({ type: 'ADJUST_ELEVATION', r: hover.r, c: hover.c, delta: -1 });
    if (!battle().turn.started || !selectedCombatant()) return;
    switch (e.key.toLowerCase()) {
      case 'f':
        return toggleMode('move');
      case 'e':
        return toggleMode('attack');
      case 'p':
        return toggleMode('pickup');
      case 'c':
        return triggerCast();
      case 'r':
        return triggerUseItem();
      case 'q':
        return triggerSwap();
      default:
        return;
    }
  };
  document.addEventListener('keydown', onKey);

  // ---- rendering ----
  function renderTop(b: BattleState): void {
    const vm = currentVm;
    phaseEl.textContent = vm.phaseLabel;
    const started = b.turn.started;
    const placing = b.turn.placementQueue.length > 0;
    const beginEnd = started
      ? button('End', () => void endBattle(), { class: 'danger', dataset: { testid: 'end-btn' } })
      : button('Begin', () => dispatch({ type: 'BEGIN_BATTLE' }), {
          class: 'primary',
          disabled: placing || b.pending?.kind === 'initiativeEntry',
          dataset: { testid: 'begin-btn' },
        });
    const next = button('Next', () => dispatch({ type: 'NEXT_TURN' }), {
      disabled: !started || placing || !!b.pending,
      title: 'Next turn',
      dataset: { testid: 'next-btn' },
    });
    const modes = (['SURPRISE', 'NORMAL', 'AMBUSH'] as const).map((m) =>
      button(
        m === 'SURPRISE' ? 'Surp' : m === 'NORMAL' ? 'Norm' : 'Amb',
        () => dispatch({ type: 'SET_ROUND_START_MODE', mode: m }),
        {
          class: `toggle${b.turn.roundStartMode === m ? ' on' : ''}`,
          disabled: started,
          title:
            m === 'SURPRISE'
              ? 'Surprise: party acts first'
              : m === 'NORMAL'
                ? 'Normal: standard initiative order'
                : 'Ambush: enemies act first',
          dataset: { testid: `mode-${m}` },
        },
      ),
    );
    replaceChildren(
      controlsEl,
      h('div', { class: 'row' }, beginEnd, next),
      h('div', { class: 'row' }, ...modes),
    );

    if (b.pending?.kind === 'initiativeEntry') {
      const inputs = new Map<string, HTMLInputElement>();
      const rows = b.pending.party.map((id) => {
        const u = combatantById(b, id);
        const inp = numberInput(10, {
          min: 1,
          max: 20,
          style: 'width:50px',
          dataset: { testid: `init-${id}` },
        });
        inputs.set(id, inp);
        return h(
          'div',
          { class: 'initrow' },
          h('div', {
            class: 'avatar party',
            style: `width:36px;height:36px;border-radius:50%;border:2.5px solid #4caf50;background:${u?.kind === 'entity' ? u.sheet.color : '#888'}`,
          }),
          h('div', { style: 'font-weight:700' }, u ? unitName(u) : id),
          h(
            'div',
            { class: 'row' },
            button('−', () => (inp.value = String(Math.max(1, (readInt(inp) ?? 10) - 1)))),
            inp,
            button('+', () => (inp.value = String(Math.min(20, (readInt(inp) ?? 10) + 1)))),
          ),
        );
      });
      const go = button(
        'Begin',
        () => {
          const rolls: Record<string, number> = {};
          for (const [id, inp] of inputs) {
            const v = readInt(inp);
            if (v === null || v < 1 || v > 20) return alertDialog('Initiative', 'Every roll must be 1-20.');
            rolls[id] = v;
          }
          dispatch({ type: 'SUBMIT_INITIATIVE', rolls });
        },
        { class: 'primary', dataset: { testid: 'init-begin' } },
      );
      replaceChildren(
        stripEl,
        ...rows,
        h(
          'div',
          { class: 'col' },
          go,
          button('Cancel', () => dispatch({ type: 'CANCEL_INITIATIVE_ENTRY' })),
        ),
      );
      return;
    }
    if (vm.strip.length === 0)
      return replaceChildren(
        stripEl,
        h('div', { class: 'muted', style: 'padding:20px' }, 'No combatants on field. Add objects to begin.'),
      );
    replaceChildren(
      stripEl,
      ...vm.strip.map((e) => {
        const pct = e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
        const unit = unitById(b, e.id);
        const color =
          unit?.kind === 'entity' ? unit.sheet.color : unit?.kind === 'enemy' ? unit.color : '#888';
        return h(
          'div',
          {
            class: `card${e.current ? ' current' : ''}`,
            title: e.initiative
              ? `${e.name}\nInitiative: ${e.initiative.total} (d20: ${e.initiative.d20} + DEX: ${e.initiative.mod})`
              : e.name,
            dataset: { testid: `card-${e.id}` },
          },
          h('div', { class: `avatar ${e.side}`, style: `background:${color}` }),
          h('div', { class: 'name' }, e.name),
          h(
            'div',
            { class: 'hpbar' },
            h('div', {
              style: `width:${pct * 100}%;background:${pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#e0a030' : '#d75f5f'}`,
            }),
          ),
          h('div', { class: 'small' }, `${e.hp}/${e.maxHp}`),
        );
      }),
    );
  }

  function statRow(
    label: string,
    color: string,
    value: number,
    adj: number,
    onAdj: (d: number) => void,
    testid: string,
  ) {
    return h(
      'div',
      { class: 'stat' },
      h('span', { style: `color:${color};font-weight:700` }, label),
      button('−', () => onAdj(-1), { dataset: { testid: `${testid}-dec` } }),
      h(
        'span',
        { class: `v${adj > 0 ? ' up' : adj < 0 ? ' down' : ''}`, dataset: { testid } },
        String(value),
      ),
      button('+', () => onAdj(1), { dataset: { testid: `${testid}-inc` } }),
    );
  }

  function renderSelected(b: BattleState): HTMLElement {
    const u = selectedCombatant();
    const avail = actionAvailability(b, u?.id ?? null, store.ctx.assets);
    const parts: (HTMLElement | null)[] = [
      h('div', { class: 'header' }, 'Selected'),
      h('div', { style: 'font-weight:700', dataset: { testid: 'sel-name' } }, u ? unitName(u) : '--'),
    ];
    if (u) {
      const hp = health(u),
        max = maxHealth(u);
      const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
      const bar = h(
        'div',
        {
          class: 'hpbar',
          style: 'width:100px;height:20px;cursor:pointer;position:relative',
          title: 'Click to set HP',
          dataset: { testid: 'hp-bar' },
        },
        h('div', { style: `width:${pct * 100}%;background:#4caf50` }),
        h(
          'span',
          { style: 'position:absolute;inset:0;text-align:center;line-height:20px;font-size:11px;color:#fff' },
          `${hp} / ${max}`,
        ),
      );
      bar.onclick = (ev) => {
        const rect = bar.getBoundingClientRect();
        dispatch({
          type: 'SET_HP',
          unitId: u.id,
          hp: Math.round(((ev.clientX - rect.left) / rect.width) * max),
        });
      };
      parts.push(
        h('div', { class: 'muted' }, 'Health'),
        h(
          'div',
          { class: 'row' },
          button('−', () => dispatch({ type: 'ADJUST_HP', unitId: u.id, delta: -1 }), {
            dataset: { testid: 'hp-dec' },
          }),
          bar,
          button('+', () => dispatch({ type: 'ADJUST_HP', unitId: u.id, delta: 1 }), {
            dataset: { testid: 'hp-inc' },
          }),
        ),
      );
      parts.push(h('div', { class: 'muted' }, 'Stats'));
      parts.push(
        statRow(
          'AC',
          '#FFD700',
          armorClass(u),
          u.acAdjustment,
          (d) => dispatch({ type: 'ADJUST_AC', unitId: u.id, delta: d }),
          'stat-ac',
        ),
      );
      const showAll = u.kind === 'entity' && u.sheet.isParty;
      for (let i = 0; i < 6; i++) {
        if (!showAll && i !== 1) continue;
        const val = u.kind === 'entity' ? adjustedAttribute(u, i) : u.dexterity + u.dexAdjustment;
        const adj = u.kind === 'entity' ? (u.statAdjustment[i] ?? 0) : u.dexAdjustment;
        parts.push(
          statRow(
            ATTRIBUTE_SHORT[i] ?? '',
            STAT_COLORS[i] ?? '#fff',
            val,
            adj,
            (d) => dispatch({ type: 'ADJUST_STAT', unitId: u.id, attribute: i, delta: d }),
            `stat-${(ATTRIBUTE_SHORT[i] ?? '').toLowerCase()}`,
          ),
        );
      }
      parts.push(h('div', { dataset: { testid: 'mob' } }, `MOB: ${movement(u)}`));
      parts.push(h('div', { class: 'muted' }, 'Weapon'));
      if (u.kind === 'entity') {
        const w = equippedWeapon(u);
        let label = w ? w.name : 'None';
        if (w && isRanged(w.ammoType)) {
          const n = u.sheet.inventory
            .filter(
              (i) =>
                i.kind === 'ammunition' &&
                ammoCompatible(
                  i.ammoType,
                  i.legacyCompatibleWeaponType,
                  w.ammoType,
                  b.rules.compat.ammoCompatIgnoresLegacyField,
                ),
            )
            .reduce((s, i) => s + Math.max(0, i.quantity), 0);
          label += ` (x${n})`;
        }
        parts.push(
          h(
            'div',
            { class: 'row' },
            h('span', { dataset: { testid: 'weapon' } }, label),
            button('⇄ Q', triggerSwap, {
              disabled: !avail.swap,
              title: 'Swap primary/secondary weapon',
              dataset: { testid: 'swap-btn' },
            }),
          ),
        );
      } else parts.push(h('div', {}, `ATK: ${attackModifier(u)}`));
      parts.push(h('div', { class: 'muted' }, 'Damage Dice'));
      const dice = damageDice(u),
        base = baseDamageDice(u);
      for (let t = 0; t < 3; t++) {
        const idx = (d: string | null) =>
          Math.max(0, (DICE_PROGRESSION as readonly string[]).indexOf(d ?? ''));
        parts.push(
          statRow(
            `T${t + 1}`,
            '#dcdcdc',
            0,
            idx(dice[t] ?? null) - idx(base[t] ?? null),
            (d) => dispatch({ type: 'ADJUST_DICE', unitId: u.id, tier: t, direction: d }),
            `dice-${t}`,
          ),
        );
        const vEl = parts[parts.length - 1]?.querySelector('.v');
        if (vEl) vEl.textContent = dice[t] ?? '--';
      }
    } else {
      parts.push(
        h('div', { class: 'muted' }, 'Health'),
        h('div', {}, '-- / --'),
        h('div', { class: 'muted' }, 'Stats'),
        h('div', {}, 'AC -- STR -- DEX -- CON -- INT -- WIS -- CHA --'),
        h('div', {}, 'MOB: --'),
        h('div', { class: 'muted' }, 'Weapon'),
        h('div', {}, '--'),
      );
    }
    const m = session().mode;
    const on = (k: string) => (m.kind === k ? ' on' : '');
    parts.push(
      h('div', { class: 'sep' }),
      h('div', { class: 'header' }, 'Actions'),
      h(
        'div',
        { class: 'actions' },
        button('✥ Move (F)', () => toggleMode('move'), {
          class: `success toggle${on('move')}`,
          disabled: !avail.move,
          dataset: { testid: 'act-move' },
        }),
        button('◎ Attack (E)', () => toggleMode('attack'), {
          class: `danger toggle${on('attack')}`,
          disabled: !avail.attack,
          dataset: { testid: 'act-attack' },
        }),
        button('⚗ Item (R)', triggerUseItem, {
          class: 'accent',
          disabled: !avail.useItem,
          dataset: { testid: 'act-item' },
        }),
        button('✋ Pick up (P)', () => toggleMode('pickup'), {
          class: `earth toggle${on('pickup')}`,
          disabled: !avail.pickup,
          dataset: { testid: 'act-pickup' },
        }),
        button('✦ Cast (C)', triggerCast, {
          class: `arcane wide toggle${on('cast')}`,
          disabled: !avail.cast,
          dataset: { testid: 'act-cast' },
        }),
      ),
    );
    return h('div', { class: 'col' }, ...parts);
  }

  /** DiceRollPanel as a function of `pending`. */
  function renderDice(b: BattleState, p: Pending): HTMLElement {
    const err = h('div', { class: 'err', dataset: { testid: 'dice-error' } });
    const submit = (cmd: Command) => {
      const res = dispatch(cmd);
      if (!res.ok) err.textContent = res.error.message;
    };
    const cancel = button('Cancel', () => dispatch({ type: 'CANCEL_PENDING' }), {
      dataset: { testid: 'dice-cancel' },
    });
    const nameOf = (id: string) => {
      const u = unitById(b, id);
      return u ? unitName(u) : id;
    };
    const flowHeader = (
      flow: Exclude<Pending, { kind: 'initiativeEntry' | 'tieOrder' | 'd10Efficacy' }>['flow'],
    ) => {
      if (flow.flow === 'attack')
        return [
          h('div', {}, `Attacker: ${nameOf(flow.attackerId)}`),
          h('div', {}, `Target: ${nameOf(flow.targetId)}`),
          h(
            'div',
            { class: 'muted' },
            `${flow.attackMod >= 0 ? '+' : ''}${flow.attackMod} | AC: ${flow.targetAC}`,
          ),
        ];
      if (flow.flow === 'spell')
        return [
          h('div', {}, `Caster: ${nameOf(flow.casterId)}`),
          h('div', {}, `Target: ${nameOf(flow.targetId)}`),
          h(
            'div',
            { class: 'muted' },
            flow.spell.resolution === 'SAVE'
              ? `DC ${flow.saveDC ?? 0} | ${flow.spell.saveStat.slice(0, 3)} save ${(flow.saveMod ?? 0) >= 0 ? '+' : ''}${flow.saveMod ?? 0}`
              : flow.spell.resolution === 'ATTACK'
                ? `Spell atk: ${(flow.attackMod ?? 0) >= 0 ? '+' : ''}${flow.attackMod ?? 0} | AC: ${flow.targetAC ?? 0}`
                : flow.spell.resolution,
          ),
        ];
      return [
        h('div', {}, `Caster: ${nameOf(flow.casterId)}`),
        h('div', {}, `Targets: ${flow.targetIds.length}`),
      ];
    };
    const title = (p: Pending) =>
      'flow' in p
        ? p.flow.flow === 'attack'
          ? 'Attack Roll'
          : `${p.flow.spell.name}${p.flow.slotLevel > p.flow.spell.level && p.flow.spell.level > 0 ? ` (Lv${p.flow.slotLevel})` : ''}`
        : 'Item Efficacy Roll';
    switch (p.kind) {
      case 'd20': {
        const inp = numberInput('', {
          min: 1,
          max: 20,
          placeholder: '1-20',
          dataset: { testid: 'd20-input' },
        });
        const roll = () => submit({ type: 'SUBMIT_ROLL', d20: readInt(inp) ?? undefined });
        inp.onkeydown = (e) => e.key === 'Enter' && roll();
        setTimeout(() => inp.focus(), 0);
        return h(
          'div',
          { class: 'dice' },
          h('div', { class: 'header' }, title(p)),
          ...flowHeader(p.flow),
          h('div', { class: 'sep' }),
          h('div', {}, p.prompt),
          inp,
          err,
          h(
            'div',
            { class: 'row' },
            button('Roll', roll, { class: 'primary', dataset: { testid: 'dice-submit' } }),
            cancel,
          ),
        );
      }
      case 'areaD20s': {
        const inputs = p.flow.targetIds.map(() =>
          numberInput('', { min: 1, max: 20, placeholder: 'd20', style: 'width:52px' }),
        );
        const rows = p.flow.targetIds.map((id, i) =>
          h(
            'div',
            { class: 'dicerow' },
            h('span', { class: 'small' }, nameOf(id)),
            h('span'),
            inputs[i] as HTMLElement,
          ),
        );
        const go = () => {
          const vals = inputs.map((i) => readInt(i));
          submit({ type: 'SUBMIT_ROLL', areaD20s: vals.map((v) => v ?? 0) });
        };
        return h(
          'div',
          { class: 'dice' },
          h('div', { class: 'header' }, title(p)),
          ...flowHeader(p.flow),
          h('div', { class: 'sep' }),
          h('div', {}, p.prompt),
          button(
            'Auto-roll empty',
            () => submit({ type: 'AUTO_FILL_AREA_ROLLS', d20s: inputs.map((i) => readInt(i) ?? 0) }),
            { class: 'small', dataset: { testid: 'auto-roll' } },
          ),
          ...rows,
          err,
          h(
            'div',
            { class: 'row' },
            button('Roll', go, { class: 'primary', dataset: { testid: 'dice-submit' } }),
            cancel,
          ),
        );
      }
      case 'damage': {
        const inputs = p.dice.map((d) =>
          numberInput('', { min: 1, max: dieMax(d), placeholder: `1-${dieMax(d)}`, style: 'width:60px' }),
        );
        const rows = p.dice.map((d, i) =>
          h(
            'div',
            { class: 'dicerow' },
            h('span', { class: 'muted' }, `${d}:`),
            h('span'),
            inputs[i] as HTMLElement,
          ),
        );
        const go = () => submit({ type: 'SUBMIT_ROLL', dice: inputs.map((i) => readInt(i) ?? 0) });
        inputs.forEach(
          (inp, i) =>
            (inp.onkeydown = (e) =>
              e.key === 'Enter' && (i < inputs.length - 1 ? inputs[i + 1]?.focus() : go())),
        );
        setTimeout(() => inputs[0]?.focus(), 0);
        const banner = p.area
          ? `${p.area.tiers.filter((t) => t > 0).length}/${p.area.tiers.length} ${p.flow.flow === 'area' && p.flow.spell.resolution === 'SAVE' ? 'AFFECTED' : 'HIT'}`
          : p.halve
            ? 'SAVED - HALF'
            : p.flow.flow === 'spell' && p.flow.spell.resolution === 'HEAL'
              ? 'HEALING'
              : p.flow.flow === 'spell' && p.flow.spell.resolution === 'AUTO'
                ? 'AUTO-HIT'
                : p.flow.flow === 'spell' && p.flow.spell.resolution === 'SAVE'
                  ? 'FAILED SAVE'
                  : p.d20 === 20
                    ? 'CRITICAL HIT'
                    : 'HIT';
        const color = banner.startsWith('SAVED')
          ? '#FFB74D'
          : banner === 'CRITICAL HIT'
            ? '#FFD54F'
            : banner === 'AUTO-HIT'
              ? '#b9a8f5'
              : '#4CAF50';
        const bonus = p.flow.damageBonus;
        return h(
          'div',
          { class: 'dice', dataset: { testid: 'damage-panel' } },
          h('div', { class: 'header' }, title(p)),
          ...flowHeader(p.flow),
          h('div', { class: 'banner', style: `color:${color};border-color:${color}` }, banner),
          h(
            'div',
            { class: 'small', style: 'text-align:center' },
            p.area ? `ROLL FOR TIER ${p.area.maxTier}` : `TIER ${p.tier}`,
          ),
          p.dice.length > 0
            ? h(
                'div',
                { class: 'small' },
                `Roll: ${formatDiceList(p.dice)}  `,
                h(
                  'span',
                  {
                    style: `color:${bonus > 0 ? '#4CAF50' : bonus < 0 ? '#d75f5f' : '#808080'};font-weight:700`,
                  },
                  `${bonus >= 0 ? '+' : ''}${bonus} ${p.flow.flow === 'spell' && p.flow.spell.resolution === 'HEAL' ? 'heal' : 'dmg'}`,
                ),
              )
            : h('div', { class: 'muted small' }, 'No dice to roll'),
          h('div', {}, p.prompt),
          ...rows,
          err,
          h(
            'div',
            { class: 'row' },
            button('Confirm', go, { class: 'primary', dataset: { testid: 'dice-submit' } }),
            cancel,
          ),
        );
      }
      case 'confirm': {
        const color = '#d75f5f';
        return h(
          'div',
          { class: 'dice', dataset: { testid: 'confirm-panel' } },
          h('div', { class: 'header' }, title(p)),
          ...flowHeader(p.flow),
          h('div', { class: 'banner', style: `color:${color};border-color:${color}` }, p.banner),
          h(
            'div',
            { class: 'row' },
            button('OK', () => dispatch({ type: 'CONFIRM_PENDING' }), {
              class: 'primary',
              dataset: { testid: 'dice-submit' },
            }),
            cancel,
          ),
        );
      }
      case 'd10Efficacy': {
        const inp = numberInput('', {
          min: 1,
          max: 10,
          placeholder: 'Enter d10 roll (1-10)',
          style: 'width:150px',
          dataset: { testid: 'd10-input' },
        });
        const preview = h('div', { class: 'small', style: 'color:#4CAF50' });
        inp.oninput = () => {
          const v = readInt(inp);
          preview.textContent =
            v !== null && v >= 1 && v <= 10
              ? `Heals ${Math.ceil((p.healAmount * v * 10) / 100)} HP (${v * 10}% efficacy)`
              : 'Enter 1-10';
        };
        setTimeout(() => inp.focus(), 0);
        return h(
          'div',
          { class: 'dice' },
          h('div', { class: 'header' }, 'Item Efficacy Roll'),
          h('div', {}, `Roll d10 for ${p.itemName} efficacy`),
          h('div', {}, `Base healing: ${p.healAmount} HP`),
          h('div', { class: 'muted small' }, 'Roll determines efficacy (1=10%, 10=100%)'),
          inp,
          preview,
          err,
          h(
            'div',
            { class: 'row' },
            button('OK', () => submit({ type: 'SUBMIT_ROLL', d10: readInt(inp) ?? undefined }), {
              class: 'primary',
              dataset: { testid: 'dice-submit' },
            }),
            cancel,
          ),
        );
      }
      case 'initiativeEntry':
      case 'tieOrder':
        return h('div', {});
    }
  }

  function hcard(
    key: string,
    name: string,
    color: string,
    badge: string,
    badgeColor: string,
    title: string,
    onClick: () => void,
  ): HTMLElement {
    const m = session().mode;
    const sel =
      (m.kind === 'placeObject' && m.key === key) || (m.kind === 'elevation' && key === `elev:${m.delta}`);
    return h(
      'div',
      { class: `hcard${sel ? ' sel' : ''}`, title, onclick: onClick, dataset: { testid: `hcard-${key}` } },
      h('div', { class: 'sw', style: `background:${color}` }),
      h('div', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, name),
      h('span', { class: 'badge', style: `background:${badgeColor}` }, badge),
    );
  }

  function renderManage(b: BattleState): HTMLElement {
    const s = session();
    const placing = b.turn.placementQueue.length > 0;
    const place = (key: string, name: string) => {
      const m = session().mode;
      if (m.kind === 'placeObject' && m.key === key) return store.dispatchSession({ type: 'cancelMode' });
      store.dispatchSession({ type: 'setMode', mode: { kind: 'placeObject', key } });
      void name;
    };
    const elev = (delta: number) => {
      const m = session().mode;
      if (m.kind === 'elevation' && m.delta === delta) return store.dispatchSession({ type: 'cancelMode' });
      store.dispatchSession({ type: 'setMode', mode: { kind: 'elevation', delta } });
    };
    const cats: [typeof s.drawerCategory, string][] = [
      ['party', 'Party'],
      ['enemies', 'Enemies'],
      ['terrain', 'Terrain'],
      ['pickups', 'Pickups'],
      ['elevation', 'Elevation'],
    ];
    let cards: HTMLElement[] = [];
    const onField = new Set(
      b.units.filter((u) => u.kind === 'entity').map((u) => (u.kind === 'entity' ? u.sheet.name : '')),
    );
    switch (s.drawerCategory) {
      case 'party':
        cards = Object.values(deps.getBundle().party)
          .filter((cs) => cs.isParty && !onField.has(cs.name))
          .map((cs) =>
            hcard(
              `party:${cs.name}`,
              cs.name,
              cs.color,
              `${cs.currentHP}/${cs.totalHP}`,
              '#4CAF50',
              `${cs.name}\nClass: ${cs.characterClass}\nHP: ${cs.currentHP} / ${cs.totalHP}`,
              () => place(`party:${cs.name}`, cs.name),
            ),
          );
        break;
      case 'enemies':
        cards = Object.entries(deps.getBundle().enemies).map(([stem, e]) =>
          hcard(
            `enemy:${stem}`,
            e.name,
            e.color,
            `HP ${e.maxHealth}`,
            '#d75f5f',
            `${e.name}\nHP: ${e.maxHealth}   ATK: ${e.dexterity}   MOB: ${e.mobility}`,
            () => place(`enemy:${stem}`, e.name),
          ),
        );
        break;
      case 'terrain':
        cards = deps
          .getBundle()
          .terrain.map((t) =>
            hcard(
              `terrain:${t.type}`,
              t.type,
              t.color,
              `HP ${t.health}`,
              '#8a8a8a',
              `${t.type}\nHP: ${t.health}`,
              () => place(`terrain:${t.type}`, t.type),
            ),
          );
        break;
      case 'pickups':
        cards = [
          ...Object.values(deps.getBundle().weapons).map((w) =>
            hcard(
              `pickup:weapon:${w.name}`,
              w.name,
              w.color,
              'WPN',
              '#e6b23c',
              `${w.name} (Weapon)\nDMG: ${w.damageDice.filter(Boolean).join('/')}`,
              () => place(`pickup:weapon:${w.name}`, w.name),
            ),
          ),
          ...Object.values(deps.getBundle().accessories).map((a) =>
            hcard(
              `pickup:accessory:${a.name}`,
              a.name,
              a.color,
              'ACC',
              '#569cd6',
              `${a.name} (Accessory)\nDEF: ${a.defense}`,
              () => place(`pickup:accessory:${a.name}`, a.name),
            ),
          ),
          ...Object.values(deps.getBundle().consumables).map((cn) =>
            hcard(
              `pickup:consumable:${cn.name}`,
              cn.name,
              cn.color,
              'USE',
              '#4CAF50',
              `${cn.name} (Consumable)\nHeal: ${cn.healAmount}`,
              () => place(`pickup:consumable:${cn.name}`, cn.name),
            ),
          ),
        ];
        break;
      case 'elevation':
        cards = [
          hcard('elev:1', 'Raise', '#4CAF50', '+1', '#4CAF50', 'Raise tiles by one level', () => elev(1)),
          hcard('elev:-1', 'Lower', '#e6b23c', '-1', '#e6b23c', 'Lower tiles by one level', () => elev(-1)),
          hcard('elev:0', 'Flatten', '#8a8a8a', '0', '#8a8a8a', 'Reset tiles to ground level', () => elev(0)),
        ];
        break;
    }
    const m = s.mode;
    const status =
      m.kind === 'placeObject'
        ? `Selected: ${m.key.split(':').pop() ?? ''} (click grid to place, click same item again to deselect)`
        : m.kind === 'elevation'
          ? `${m.delta > 0 ? 'Raising' : m.delta < 0 ? 'Lowering' : 'Flattening'} tiles - click tiles on the grid (ESC to finish)`
          : placing
            ? `Place ${b.turn.placementQueue[0] ?? ''} - click on a tile`
            : 'Click items to add them to the battlefield';
    const drawer = s.drawerOpen
      ? h(
          'div',
          { class: 'col', dataset: { testid: 'drawer' } },
          h(
            'div',
            { class: 'row' },
            h('span', { class: 'header' }, 'Add Objects'),
            button('✕', () => store.dispatchSession({ type: 'drawer', open: false })),
          ),
          h(
            'div',
            { class: 'row' },
            ...cats.map(([k, l]) =>
              button(l, () => store.dispatchSession({ type: 'drawer', open: true, category: k }), {
                class: `toggle${s.drawerCategory === k ? ' on' : ''}`,
                dataset: { testid: `cat-${k}` },
              }),
            ),
          ),
          h(
            'div',
            { class: 'hotbar' },
            ...(cards.length
              ? cards
              : [h('div', { class: 'muted small' }, 'Nothing available in this category')]),
          ),
          h('div', { class: 'muted small', style: 'min-height:28px' }, status),
        )
      : null;
    const themeSel = h(
      'select',
      {
        onchange: (ev) => dispatch({ type: 'SET_THEME', theme: (ev.target as HTMLSelectElement).value }),
        dataset: { testid: 'theme' },
      },
      ...BOARD_THEMES.map((t) => h('option', { value: t.id, selected: b.board.theme === t.id }, t.label)),
      // a saved battle may use a theme this build doesn't list: keep it selectable
      ...(BOARD_THEMES.some((t) => t.id === b.board.theme)
        ? []
        : [h('option', { value: b.board.theme, selected: true }, b.board.theme)]),
    );
    const saveName = h('input', {
      placeholder: 'battle name',
      style: 'width:120px',
      dataset: { testid: 'save-name' },
    });
    return h(
      'div',
      { class: 'col' },
      h('div', { class: 'header' }, 'Manage'),
      button('Character Sheets', () => deps.onOpenSheets(), { dataset: { testid: 'open-sheets' } }),
      button('Add Objects', () => store.dispatchSession({ type: 'drawer', open: !s.drawerOpen }), {
        disabled: placing,
        dataset: { testid: 'add-objects' },
      }),
      drawer,
      button('Long Rest (Spell Slots)', () => dispatch({ type: 'LONG_REST' }), {
        class: 'arcane',
        title: 'Restore all spell slots for every party member on the board',
      }),
      h('div', { class: 'sep' }),
      h('div', { class: 'row' }, 'Board Theme', themeSel),
      h('div', { class: 'sep' }),
      h(
        'div',
        { class: 'row' },
        saveName,
        button('Save', () => void (saveName.value.trim() && deps.saveBattle(saveName.value.trim())), {
          dataset: { testid: 'save-battle' },
        }),
        button('Load…', () => void pickAndLoad(), { dataset: { testid: 'load-battle' } }),
      ),
      h('div', { class: 'row' }, button('Download JSON', downloadJson), button('Upload JSON', uploadJson)),
      h(
        'div',
        { class: 'row small' },
        h(
          'label',
          {},
          h('input', {
            type: 'checkbox',
            checked: deps.persisterReadOnly.get(),
            onchange: (ev) => deps.persisterReadOnly.set((ev.target as HTMLInputElement).checked),
          }),
          ' do not write party sheets',
        ),
      ),
    );
  }

  async function pickAndLoad(): Promise<void> {
    const names = await deps.listBattles();
    if (names.length === 0) return alertDialog('Load Battle', 'No saved battles in saves/battles/.');
    const sel = h(
      'select',
      { dataset: { testid: 'load-select' } },
      ...names.map((n) => h('option', { value: n }, n)),
    );
    const { modal } = await import('./panels/dialogs.ts');
    const m = modal('Load Battle', h('div', { class: 'col' }, 'Choose a saved battle:', sel), [
      button('Load', () => (m.close(), void deps.loadBattle(sel.value)), {
        class: 'primary',
        dataset: { testid: 'load-ok' },
      }),
      button('Cancel', () => m.close()),
    ]);
  }
  function downloadJson(): void {
    const blob = new Blob([JSON.stringify(battle(), null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'battle.json' });
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function uploadJson(): void {
    const inp = h('input', { type: 'file', accept: 'application/json' });
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const { parseBattle } = await import('../engine/serialize.ts');
        store.replace(parseBattle(await f.text()));
      } catch (err) {
        alertDialog('Upload failed', String(err));
      }
    };
    inp.click();
  }

  async function endBattle(): Promise<void> {
    if (!(await confirmDialog('Confirm End Battle', 'End battle? Party entity states will be saved.')))
      return;
    const res = dispatch({ type: 'END_BATTLE' });
    if (!res.ok) return;
    if (res.state.turn.victory) {
      const party = partyOnField(res.state).map((e) => ({
        name: e.sheet.name,
        hp: e.sheet.currentHP,
        maxHp: e.sheet.totalHP,
        statuses: e.sheet.status.map((s) => s.name),
      }));
      victoryEl = victoryOverlay(party, () => deps.onLeave());
      document.body.appendChild(victoryEl);
      deps.onVictoryShown?.(party);
    } else deps.onLeave();
  }

  function renderSide(b: BattleState): void {
    const s = session();
    const tabs = h(
      'div',
      { class: 'tabs' },
      button('⚔ Battle', () => store.dispatchSession({ type: 'tab', tab: 'battle' }), {
        class: s.tab === 'battle' ? 'on' : '',
        dataset: { testid: 'tab-battle' },
      }),
      button('⚙ Manage', () => store.dispatchSession({ type: 'tab', tab: 'manage' }), {
        class: s.tab === 'manage' ? 'on' : '',
        dataset: { testid: 'tab-manage' },
      }),
    );
    const body =
      b.pending && b.pending.kind !== 'initiativeEntry' && b.pending.kind !== 'tieOrder'
        ? renderDice(b, b.pending)
        : s.tab === 'battle'
          ? renderSelected(b)
          : renderManage(b);
    replaceChildren(sideEl, tabs, body);
  }

  let currentVm: BoardVM = buildBoardViewModel(store.battle, store.session, store.ctx.assets);
  const debug = mountDebugPanel(store, deps.getBundle, prefs, deps.persisterReadOnly);

  function handleEvents(events: BattleEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'floatText')
        renderer.addFloatingText({ text: ev.text, color: ev.color, unitId: ev.unitId, cell: ev.cell });
      else if (ev.type === 'alert') alertDialog(ev.title, ev.message);
    }
  }

  function renderAll(): void {
    const b = store.battle;
    currentVm = buildBoardViewModel(b, store.session, store.ctx.assets, computeLighting(b));
    renderer.render(currentVm);
    renderTop(b);
    renderSide(b);
    debug.render(store.session.debugOpen);
    if (b.pending?.kind === 'tieOrder' && !tieOpen) {
      const group = b.pending.groups[0];
      if (group) {
        tieOpen = true;
        const roll = b.turn.initiative[group[0] ?? '']?.total ?? null;
        tieDialog(
          group.map((id) => ({
            id,
            name: unitName(unitById(b, id) ?? ({ kind: 'pickup', item: { name: id } } as unknown as Unit)),
          })),
          roll === null ? null : roll > 100 ? roll - 100 : roll,
          (order) => ((tieOpen = false), dispatch({ type: 'RESOLVE_TIE', group, order })),
          () => ((tieOpen = false), dispatch({ type: 'DISMISS_TIES' })),
        );
      }
    }
    // cast mode ends when the pending roll resolves
    const m = store.session.mode;
    if (m.kind === 'cast' && m.lockedCells && !b.pending) store.dispatchSession({ type: 'cancelMode' });
  }

  let lastSession = store.session;
  const unsub = store.subscribe((doc, events, source) => {
    handleEvents(events);
    const prev = lastSession;
    lastSession = doc.session;
    // Hover only moves the area template / tooltip: redraw the board, keep the panels (and their inputs) intact.
    if (source === 'session' && prev.hover !== doc.session.hover && sameExceptHover(prev, doc.session)) {
      currentVm = buildBoardViewModel(doc.battle, doc.session, store.ctx.assets, computeLighting(doc.battle));
      renderer.render(currentVm);
      return;
    }
    renderAll();
  });
  function sameExceptHover(a: typeof lastSession, b: typeof lastSession): boolean {
    return (
      a.selectedId === b.selectedId &&
      a.mode === b.mode &&
      a.tab === b.tab &&
      a.drawerOpen === b.drawerOpen &&
      a.drawerCategory === b.drawerCategory &&
      a.debugOpen === b.debugOpen &&
      a.pinnedId === b.pinnedId
    );
  }
  renderAll();

  return () => {
    unsub();
    document.removeEventListener('keydown', onKey);
    debug.destroy();
    toolbar.destroy();
    victoryEl?.remove();
    renderer.destroy();
  };
}

export { totalAttributes };
