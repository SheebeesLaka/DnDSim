/**
 * The Spotlight battle screen (design/05-build-plan.md, mockup c2.html glass):
 * the full-bleed HD-2D board with glass panels around it. Round pill, Active
 * effects, the Field dock, the roll panel, the action bar and the turn rail.
 */
import './spotlight.css';
import type { AssetBundle, SpellDef } from '../../assets/types.ts';
import type { PrefsStore } from '../../app/prefs.ts';
import type { Store } from '../../app/store.ts';
import { spellSummary } from '../../assets/spellLabels.ts';
import { MAX_SPELL_LEVEL, maxSpellSlots, spellSlotsRemaining } from '../../engine/rules/spellSlots.ts';
import { actionAvailability } from '../../engine/selectors/actions.ts';
import {
  adjustedAttribute,
  armorClass,
  baseDamageDice,
  damageDice,
  equippedWeapon,
  movement,
} from '../../engine/selectors/stats.ts';
import { ammoCompatible, isRanged } from '../../engine/rules/combat.ts';
import { DICE_PROGRESSION, dieMax } from '../../engine/dice.ts';
import { combatantById, objectAt, partyOnField, unitById, unitName } from '../../engine/selectors/board.ts';
import { computeLighting } from '../../engine/selectors/lighting.ts';
import { buildBoardViewModel, type BoardVM } from '../../engine/view/boardViewModel.ts';
import type { EffectRowVM } from '../../engine/view/effects.ts';
import type {
  BattleEvent,
  BattleState,
  Cell,
  Command,
  EntityUnit,
  Pending,
  UnitId,
} from '../../engine/types.ts';
import { ATTRIBUTE_SHORT, StatusEffect, type StatusDef } from '../../assets/types.ts';
import { BOARD_THEMES } from '../boardThemes.ts';
import { h, replaceChildren } from '../dom.ts';
import { confirmDialog, victoryOverlay } from '../panels/dialogs.ts';
import { mountDebugPanel } from '../panels/debugPanel.ts';
import type { BoardRenderer } from '../renderer/BoardRenderer.ts';
import { anglePrefs, resetView, turnView, viewOptionsFromPrefs, viewPrefKey } from '../viewPrefs.ts';
import { emblem, icon, portrait, type ICON } from './art.ts';
import { BoardDecor } from './boardDecor.ts';
import { renderEffectsPanel } from './effectsPanel.ts';
import { renderRollPanel } from './rollPanel.ts';
import { renderTurnRail } from './turnRail.ts';

type Sheet =
  | { kind: 'cast'; unitId: UnitId; index: number; slot: number | null }
  | { kind: 'item'; unitId: UnitId; index: number }
  | { kind: 'ready'; unitId: UnitId }
  | { kind: 'adjust'; unitId: UnitId }
  | { kind: 'timer' }
  | { kind: 'arrival' }
  | { kind: 'save' }
  | { kind: 'load'; names: string[] }
  | null;

interface Toast {
  id: number;
  text: string;
  sub?: string;
  actions?: { label: string; go?: boolean; run: () => void }[];
  until?: number;
}

/** Statuses the S palette offers (spell riders the campaign uses + common conditions). */
const STATUS_PRESETS: { status: StatusDef; note: string }[] = [
  ['Blessed', StatusEffect.ATTACK_MODIFIER, 2, 10, -1, '+2 to hit'],
  ['Shield of Faith', StatusEffect.AC_MODIFIER, 2, 10, -1, '+2 AC'],
  ['Burning', StatusEffect.DAMAGE_OVER_TIME, 2, 2, -1, '2 dmg / turn'],
  ['Chilled', StatusEffect.MOVEMENT_MODIFIER, -2, 2, -1, '−2 MOB'],
  ['Illuminated', StatusEffect.AC_MODIFIER, -2, 2, -1, '−2 AC'],
  ['Held', StatusEffect.MOVEMENT_MODIFIER, -99, 2, -1, 'cannot move'],
  ['Poisoned', StatusEffect.ATTACK_MODIFIER, -2, 3, -1, '−2 to hit'],
  ['Regenerating', StatusEffect.HEAL_OVER_TIME, 2, 3, -1, '+2 HP / turn'],
  ['Prone', StatusEffect.NONE, 0, 1, -1, 'marker'],
  ['Stunned', StatusEffect.NONE, 0, 1, -1, 'marker'],
  ['Frightened', StatusEffect.NONE, 0, 2, -1, 'marker'],
  ['Hidden', StatusEffect.NONE, 0, -1, -1, 'marker'],
].map(([name, effectType, magnitude, duration, targetAttribute, note]) => ({
  status: {
    name: name as string,
    effectType: effectType as number,
    magnitude: magnitude as number,
    duration: duration as number,
    targetAttribute: targetAttribute as number,
    extra: {},
  },
  note: note as string,
}));

const LIGHT_COLORS = ['#ffe3b0', '#d8ffb0', '#ffb366', '#bfe3ff', '#ff6a5a', '#b89cff'];
const AMBIENT_PRESETS: [string, number][] = [
  ['Blackout', 0],
  ['Night', 15],
  ['Dim', 35],
  ['Lit', 70],
  ['Day', 100],
];
const FIELD_TABS: {
  tab: 'light' | 'height' | 'spawn' | 'terrain' | 'board' | 'tv' | 'history';
  label: string;
  icon: keyof typeof ICON;
}[] = [
  { tab: 'light', label: 'Light', icon: 'lamp' },
  { tab: 'height', label: 'Height', icon: 'height' },
  { tab: 'spawn', label: 'Spawn', icon: 'spawn' },
  { tab: 'terrain', label: 'Terrain', icon: 'terrain' },
  { tab: 'board', label: 'Board', icon: 'board' },
  { tab: 'tv', label: 'TV', icon: 'tv' },
  { tab: 'history', label: 'History', icon: 'undo' },
];

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
  );
};

export interface BattleScreenDeps {
  store: Store;
  /** current assets (the editors can change them while a battle runs) */
  getBundle: () => AssetBundle;
  /** menu → Character sheets (R1.3); Back returns to this battle */
  onOpenSheets: () => void;
  /** opens the shared Spell Editor; `onSaved` runs after a save */
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

export function mountSpotlightScreen(root: HTMLElement, deps: BattleScreenDeps): () => void {
  const { store, prefs, renderer } = deps;
  const library = renderer.library;
  const dispatch = (cmd: Command) => store.dispatch(cmd);
  const session = () => store.session;
  const battle = () => store.battle;

  // ---- layout ----
  const sp = h('div', { class: 'sp', dataset: { testid: 'spotlight' } });
  const board = h('div', { class: 'sp-board' });
  const shade = h('div', { class: 'sp-shade' });
  const ui = h('div', { class: 'sp-ui' });
  sp.append(board, shade, ui);
  replaceChildren(root, sp);
  renderer.mount(board, {
    onClick: (e) => onBoardClick(e.cell),
    onHover: (cell) => store.dispatchSession({ type: 'hover', cell }),
    onContextMenu: (e) => onBoardContext(e.cell, e.clientX, e.clientY),
    onCameraSettled: (a) => prefs.setMany(anglePrefs(a)),
  });
  renderer.setOverlayStyle?.('spotlight');
  const decorLayer = h('div', { class: 'sp-decor' });
  board.append(decorLayer);
  const decor = new BoardDecor(decorLayer, {
    onLamp: (id) => store.dispatchSession({ type: 'selectLight', id }),
  });
  const unsubDraw = renderer.onDraw?.((p) => decor.draw(p)) ?? (() => undefined);
  // camera angle, top-down and post effects follow the prefs (Field ▸ TV, [ ], right-drag)
  const unsubPrefs = prefs.subscribe(() => renderer.setViewOptions?.(viewOptionsFromPrefs(prefs.all, 'dm')));
  const debug = mountDebugPanel(store, deps.getBundle, prefs, deps.persisterReadOnly);

  // ---- local UI state (not worth a session field) ----
  let sheet: Sheet = null;
  let menuOpen = false;
  let ctxMenu: { unitId: UnitId; x: number; y: number } | null = null;
  let toasts: Toast[] = [];
  let toastN = 0;
  const prompted = new Set<string>();
  let hpEntry = { sign: -1 as 1 | -1, digits: '' };
  let statusPick = { index: 0, duration: STATUS_PRESETS[0]?.status.duration ?? 2, custom: '' };
  let readyNote = '';
  let timerForm = { name: '', round: 0, note: '', groupId: '', on: true };
  let arrivalForm = { stem: '', count: 2, round: 0, note: '' };
  let saveName = '';
  let initDraft: Record<string, string> = {};
  let initCursor = 0;
  let tvWin: Window | null = null;
  let victoryEl: HTMLElement | null = null;
  /** tie order picked so far (first pick goes first), for the group at the head of the queue */
  let tiePick: string[] = [];
  let tieKey = '';
  let vm: BoardVM = buildBoardViewModel(battle(), session(), store.ctx.assets);

  // ---- toasts ----
  function toast(t: Omit<Toast, 'id'>, ms = 3800): void {
    const id = ++toastN;
    toasts = [...toasts, { ...t, id, until: t.actions ? undefined : performance.now() + ms }].slice(-4);
    renderUI();
    if (!t.actions)
      setTimeout(() => {
        toasts = toasts.filter((x) => x.id !== id);
        renderUI();
      }, ms);
  }
  const dropToast = (id: number) => {
    toasts = toasts.filter((x) => x.id !== id);
    renderUI();
  };

  // ---- selection helpers ----
  const selected = () => {
    const id = session().selectedId;
    return id ? combatantById(battle(), id) : undefined;
  };
  const select = (id: UnitId | null) => {
    ctxMenu = null;
    store.dispatchSession({ type: 'select', id });
  };
  /** Area of the board not covered by panels, for camera reframes. */
  const clearRect = (rollOpen: boolean) => {
    const w = board.clientWidth,
      hgt = board.clientHeight;
    return { left: 440, top: 80, right: rollOpen ? w - 700 : w - 40, bottom: hgt - 250 };
  };

  // ---- board input ----
  function onBoardClick(cell: Cell | null): void {
    const s = session();
    const b = battle();
    ctxMenu = null;
    menuOpen = false;
    if (s.mode.kind === 'elevation') {
      if (cell)
        dispatch(
          s.mode.delta === 0
            ? { type: 'SET_ELEVATION', r: cell.r, c: cell.c, level: 0 }
            : { type: 'ADJUST_ELEVATION', r: cell.r, c: cell.c, delta: s.mode.delta },
        );
      return;
    }
    if (s.mode.kind === 'placeLight') {
      if (!cell) return;
      const n = b.board.lights.length + 1;
      const res = dispatch({
        type: 'ADD_LIGHT',
        light: { name: `Light ${n}`, brightRadius: 2, dimRadius: 4, color: '#ffe3b0', at: cell, on: true },
      });
      if (res.ok)
        store.dispatchSession({ type: 'selectLight', id: res.state.board.lights.at(-1)?.id ?? null });
      store.dispatchSession({ type: 'cancelMode' });
      return;
    }
    if (!cell) return;
    const obj = objectAt(b, cell.r, cell.c);
    if (s.mode.kind === 'attachLight') {
      if (obj && (obj.kind === 'entity' || obj.kind === 'enemy'))
        dispatch({ type: 'UPDATE_LIGHT', lightId: s.mode.lightId, patch: { attachedTo: obj.id } });
      store.dispatchSession({ type: 'cancelMode' });
      return;
    }
    const actionMode =
      s.mode.kind === 'move' ||
      s.mode.kind === 'attack' ||
      s.mode.kind === 'pickup' ||
      s.mode.kind === 'cast';
    if (obj && !actionMode && s.mode.kind !== 'placeObject') {
      select(obj.id);
      return;
    }
    if (b.turn.placementQueue.length > 0) {
      dispatch({ type: 'PLACE_ENTITY', name: b.turn.placementQueue[0] as string, r: cell.r, c: cell.c });
      return;
    }
    if (s.mode.kind === 'placeObject') {
      if (obj && obj.kind !== 'terrain') return select(obj.id);
      const [kind, ...rest] = s.mode.key.split(':');
      const name = rest.join(':');
      let ok = false;
      if (kind === 'party') {
        ok = dispatch({ type: 'PLACE_ENTITY', name, r: cell.r, c: cell.c }).ok;
        if (ok) store.dispatchSession({ type: 'cancelMode' });
        return;
      } else if (kind === 'enemy')
        ok = dispatch({ type: 'PLACE_ENEMY', templateStem: name, r: cell.r, c: cell.c }).ok;
      else if (kind === 'terrain')
        ok = dispatch({ type: 'PLACE_TERRAIN', terrainType: name, r: cell.r, c: cell.c }).ok;
      else if (kind === 'pickup') {
        const [itemKind, ...n] = name.split(':');
        ok = dispatch({
          type: 'PLACE_PICKUP',
          itemKind: itemKind as 'weapon' | 'accessory' | 'consumable',
          itemName: n.join(':'),
          r: cell.r,
          c: cell.c,
        }).ok;
      }
      const m = session().mode;
      if (ok && m.kind === 'placeObject' && m.remaining !== undefined) {
        if (m.remaining <= 1) {
          store.dispatchSession({ type: 'cancelMode' });
          toast({ text: 'Reinforcements placed' });
        } else store.dispatchSession({ type: 'setMode', mode: { ...m, remaining: m.remaining - 1 } });
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
      else if (obj) select(obj.id);
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
      return;
    }
    select(null);
  }

  function onBoardContext(cell: Cell | null, x: number, y: number): void {
    if (!cell) return;
    const obj = objectAt(battle(), cell.r, cell.c);
    if (!obj || (obj.kind !== 'entity' && obj.kind !== 'enemy')) return;
    select(obj.id);
    const rect = sp.getBoundingClientRect();
    ctxMenu = { unitId: obj.id, x: x - rect.left, y: y - rect.top };
    renderUI();
  }

  // ---- actions ----
  function toggleMode(kind: 'move' | 'attack' | 'pickup'): void {
    const u = selected();
    if (!u) return;
    const avail = actionAvailability(battle(), u.id, store.ctx.assets);
    if (!avail[kind === 'move' ? 'move' : kind === 'attack' ? 'attack' : 'pickup']) return;
    const m = session().mode;
    if (m.kind === kind && 'unitId' in m && m.unitId === u.id)
      return store.dispatchSession({ type: 'cancelMode' });
    store.dispatchSession({ type: 'setMode', mode: { kind, unitId: u.id } });
  }
  function openCast(): void {
    const u = selected();
    if (!u || u.kind !== 'entity' || !actionAvailability(battle(), u.id, store.ctx.assets).cast) return;
    if (sheet?.kind === 'cast') return closeSheet();
    store.dispatchSession({ type: 'cancelMode' });
    sheet = { kind: 'cast', unitId: u.id, index: 0, slot: null };
    renderUI();
  }
  function openItems(): void {
    const u = selected();
    if (!u || u.kind !== 'entity' || !actionAvailability(battle(), u.id, store.ctx.assets).useItem) return;
    sheet = sheet?.kind === 'item' ? null : { kind: 'item', unitId: u.id, index: 0 };
    renderUI();
  }
  function knownSpells(u: EntityUnit): SpellDef[] {
    return u.sheet.knownSpells
      .map((n) => store.ctx.assets.spells[n])
      .filter((s): s is SpellDef => !!s)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }
  function castSpell(u: EntityUnit, spell: SpellDef, slot: number): void {
    closeSheet();
    if (spell.area === 'BURST' && spell.range === 0) {
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
      (spell.targetType === 'SELF' || (spell.range === 0 && battle().rules.compat.rangeZeroResolvesOnCaster))
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
  }
  const openPopover = (kind: 'hp' | 'status') => {
    const u = selected();
    if (!u) return;
    const cur = session().popover;
    if (cur?.kind === kind && cur.unitId === u.id)
      return store.dispatchSession({ type: 'popover', popover: null });
    hpEntry = { sign: -1, digits: '' };
    statusPick = { index: 0, duration: STATUS_PRESETS[0]?.status.duration ?? 2, custom: '' };
    ctxMenu = null;
    store.dispatchSession({ type: 'popover', popover: { kind, unitId: u.id } });
  };
  const closeSheet = () => {
    sheet = null;
    renderUI();
  };
  function delaySelected(): void {
    const u = selected();
    if (!u) return;
    if ((battle().turn.held ?? []).includes(u.id))
      dispatch({ type: 'RETURN_FROM_HOLD', unitId: u.id, index: battle().turn.currentIndex, actNow: true });
    else dispatch({ type: 'DELAY_TURN', unitId: u.id });
  }
  function endTurn(): void {
    const b = battle();
    if (b.pending) return;
    if (!b.turn.started) {
      dispatch({ type: 'BEGIN_BATTLE' });
      return;
    }
    dispatch({ type: 'NEXT_TURN' });
  }
  async function endBattle(): Promise<void> {
    menuOpen = false;
    if (!(await confirmDialog('End battle', 'End the battle? Party sheets are saved as they stand.'))) return;
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
  function endEffect(r: EffectRowVM): void {
    if (r.kind === 'status' && r.unitId) dispatch({ type: 'REMOVE_STATUS', unitId: r.unitId, name: r.name });
    else if (r.kind === 'readied' && r.unitId)
      dispatch({ type: 'SET_READIED', unitId: r.unitId, note: null });
    else if (r.kind === 'held' && r.unitId)
      dispatch({
        type: 'RETURN_FROM_HOLD',
        unitId: r.unitId,
        index: battle().turn.currentIndex,
        actNow: true,
      });
    else if (r.kind === 'arrival') dispatch({ type: 'REMOVE_ARRIVAL', id: r.key.slice('arrival:'.length) });
    else if (r.kind === 'timer') dispatch({ type: 'REMOVE_TIMER', id: r.key.slice('timer:'.length) });
  }
  function undo(): void {
    const label = store.undo();
    if (label) toast({ text: 'Undone', sub: label });
  }
  function redo(): void {
    const label = store.redo();
    if (label) toast({ text: 'Redone', sub: label });
  }
  function openTv(): void {
    if (tvWin && !tvWin.closed) tvWin.focus();
    else tvWin = window.open('/player.html', 'dndsim-player');
    renderUI();
  }

  // ---- the roll: typed digits live in session.rollDraft ----
  const draft = () => session().rollDraft;
  const setDraft = (patch: Partial<typeof store.session.rollDraft>) =>
    store.dispatchSession({ type: 'draft', draft: patch });
  /** Append a digit to a field holding a die of `max`; returns the new text and whether it is final. */
  const typeDigit = (cur: string, digit: string, max: number): { text: string; done: boolean } | null => {
    const next = cur + digit;
    const v = Number(next);
    if (Number.isInteger(v) && v >= 1 && v <= max) return { text: next, done: v * 10 > max };
    const single = Number(digit);
    if (single >= 1 && single <= max) return { text: digit, done: single * 10 > max };
    return null;
  };
  function submitRoll(): void {
    const p = battle().pending;
    const d = draft();
    if (!p) return;
    if (p.kind === 'd20') {
      const v = Number(d.d20);
      if (!d.d20 || !Number.isInteger(v)) return;
      dispatch({ type: 'SUBMIT_ROLL', d20: v });
    } else if (p.kind === 'damage') {
      const vals = p.dice.map((_, i) => Number(d.dice[i] ?? ''));
      if (vals.some((v, i) => !d.dice[i] || !(v >= 1 && v <= dieMax(p.dice[i])))) return;
      dispatch({ type: 'SUBMIT_ROLL', dice: vals });
    } else if (p.kind === 'areaD20s') {
      const vals = p.flow.targetIds.map((_, i) => Number(d.areaD20s[i] ?? ''));
      if (vals.some((v) => !(v >= 1 && v <= 20))) return;
      dispatch({ type: 'SUBMIT_ROLL', areaD20s: vals });
    } else if (p.kind === 'd10Efficacy') {
      const v = Number(d.d10);
      if (!(v >= 1 && v <= 10)) return;
      dispatch({ type: 'SUBMIT_ROLL', d10: v });
    } else if (p.kind === 'confirm') dispatch({ type: 'CONFIRM_PENDING' });
  }
  function rollKey(e: KeyboardEvent, p: Pending): boolean {
    const d = draft();
    const k = e.key;
    if (k === 'Escape') {
      dispatch({ type: 'CANCEL_PENDING' });
      return true;
    }
    if (k === 'Enter') {
      if (p.kind === 'damage' || p.kind === 'areaD20s') {
        const fields = p.kind === 'damage' ? p.dice.length : p.flow.targetIds.length;
        const vals = p.kind === 'damage' ? d.dice : d.areaD20s;
        const filled = Array.from({ length: fields }, (_, i) => !!vals[i]).every(Boolean);
        if (!filled) {
          setDraft({ cursor: Math.min(fields - 1, (d.cursor ?? 0) + 1) });
          return true;
        }
      }
      submitRoll();
      return true;
    }
    if (p.kind === 'areaD20s' && (k === 'a' || k === 'A')) {
      dispatch({
        type: 'AUTO_FILL_AREA_ROLLS',
        d20s: p.flow.targetIds.map((_, i) => Number(d.areaD20s[i] ?? '') || 0),
      });
      return true;
    }
    const multi =
      p.kind === 'damage' ? p.dice : p.kind === 'areaD20s' ? p.flow.targetIds.map(() => 'd20') : null;
    if (multi) {
      const key = p.kind === 'damage' ? 'dice' : 'areaD20s';
      const vals = [...(p.kind === 'damage' ? d.dice : d.areaD20s)];
      const cur = Math.min(d.cursor ?? 0, multi.length - 1);
      if (k === 'Tab' || k === 'ArrowRight' || k === ' ') {
        setDraft({
          cursor: e.shiftKey && k === 'Tab' ? Math.max(0, cur - 1) : Math.min(multi.length - 1, cur + 1),
        });
        return true;
      }
      if (k === 'ArrowLeft') {
        setDraft({ cursor: Math.max(0, cur - 1) });
        return true;
      }
      if (k === 'Backspace') {
        if (vals[cur]) vals[cur] = (vals[cur] ?? '').slice(0, -1);
        else if (cur > 0) {
          vals[cur - 1] = (vals[cur - 1] ?? '').slice(0, -1);
          setDraft({ [key]: vals, cursor: cur - 1 });
          return true;
        }
        setDraft({ [key]: vals });
        return true;
      }
      if (/^[0-9]$/.test(k)) {
        const t = typeDigit(vals[cur] ?? '', k, dieMax(multi[cur]));
        if (!t) return true;
        vals[cur] = t.text;
        setDraft({ [key]: vals, cursor: t.done ? Math.min(multi.length - 1, cur + 1) : cur });
        return true;
      }
      return false;
    }
    const field = p.kind === 'd20' ? 'd20' : p.kind === 'd10Efficacy' ? 'd10' : null;
    if (!field) return false;
    if (k === 'Backspace') {
      setDraft({ [field]: d[field].slice(0, -1) });
      return true;
    }
    if (/^[0-9]$/.test(k)) {
      const t = typeDigit(d[field].length >= 2 ? '' : d[field], k, field === 'd20' ? 20 : 10);
      if (t) setDraft({ [field]: t.text });
      return true;
    }
    return false;
  }

  // ---- keyboard ----
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Alt') {
      e.preventDefault();
      store.dispatchSession({ type: 'peek', on: true });
      return;
    }
    if (isTyping(e.target)) {
      if (e.key === 'Escape') (e.target as HTMLElement).blur();
      return;
    }
    const b = battle();
    const s = session();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      return redo();
    }
    if (mod) return;
    if (e.key === '`')
      return (e.preventDefault(), store.dispatchSession({ type: 'debug', open: !s.debugOpen }));
    // ±HP entry
    if (s.popover?.kind === 'hp') {
      e.preventDefault();
      if (e.key === 'Escape') return store.dispatchSession({ type: 'popover', popover: null });
      if (e.key === 'Enter') return applyHp();
      if (e.key === 'Backspace') hpEntry.digits = hpEntry.digits.slice(0, -1);
      else if (e.key === '-' || e.key === '_') hpEntry.sign = -1;
      else if (e.key === '+' || e.key === '=') hpEntry.sign = 1;
      else if (/^[0-9]$/.test(e.key) && hpEntry.digits.length < 4) hpEntry.digits += e.key;
      return renderUI();
    }
    if (s.popover?.kind === 'status') {
      if (e.key === 'Escape')
        return (e.preventDefault(), store.dispatchSession({ type: 'popover', popover: null }));
      if (e.key === 'Enter') return (e.preventDefault(), applyStatus());
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        statusPick.index =
          (statusPick.index + (e.key === 'ArrowRight' ? 1 : -1) + STATUS_PRESETS.length) %
          STATUS_PRESETS.length;
        statusPick.duration = STATUS_PRESETS[statusPick.index]?.status.duration ?? 2;
        return renderUI();
      }
      return;
    }
    // initiative entry: digits per party card
    if (b.pending?.kind === 'initiativeEntry') {
      const party = b.pending.party;
      const id = party[initCursor];
      e.preventDefault();
      if (e.key === 'Escape') return dispatch({ type: 'CANCEL_INITIATIVE_ENTRY' });
      if (e.key === 'Tab' || e.key === 'ArrowRight')
        initCursor = Math.min(party.length - 1, initCursor + (e.shiftKey ? -1 : 1));
      else if (e.key === 'ArrowLeft') initCursor = Math.max(0, initCursor - 1);
      else if (e.key === 'Backspace' && id) initDraft[id] = (initDraft[id] ?? '').slice(0, -1);
      else if (e.key === 'Enter') {
        if (party.every((pid) => Number(initDraft[pid]) >= 1)) return submitInitiative();
        initCursor = Math.min(party.length - 1, initCursor + 1);
      } else if (/^[0-9]$/.test(e.key) && id) {
        const t = typeDigit((initDraft[id] ?? '').length >= 2 ? '' : (initDraft[id] ?? ''), e.key, 20);
        if (t) {
          initDraft[id] = t.text;
          if (t.done) initCursor = Math.min(party.length - 1, initCursor + 1);
        }
      }
      return renderUI();
    }
    // initiative tie: 1–9 picks who goes next, Backspace un-picks, Enter confirms, Esc keeps the rolled order
    if (b.pending?.kind === 'tieOrder') {
      const group = b.pending.groups[0] ?? [];
      e.preventDefault();
      if (e.key === 'Escape') return dispatch({ type: 'DISMISS_TIES' });
      if (e.key === 'Enter') return confirmTie();
      if (e.key === 'Backspace') tiePick = tiePick.slice(0, -1);
      else if (/^[1-9]$/.test(e.key)) pickTie(group, group[Number(e.key) - 1]);
      return renderUI();
    }
    if (b.pending) {
      if (rollKey(e, b.pending)) e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      if (ctxMenu || menuOpen || sheet) {
        ctxMenu = null;
        menuOpen = false;
        sheet = null;
        return renderUI();
      }
      if (s.mode.kind !== 'none') return store.dispatchSession({ type: 'cancelMode' });
      if (s.fieldMode) return store.dispatchSession({ type: 'field', open: false });
      return select(null);
    }
    // the cast / item sheets take arrows + Enter
    if (sheet?.kind === 'cast' || sheet?.kind === 'item') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sheet.index = Math.max(0, sheet.index + (e.key === 'ArrowDown' ? 1 : -1));
        if (sheet.kind === 'cast') sheet.slot = null;
        return renderUI();
      }
      if (e.key === 'Enter') return (e.preventDefault(), confirmSheet());
    }
    if (e.key === 'Home') return resetView(renderer, prefs);
    if (e.key === '[' || e.key === ']') return turnView(prefs, e.key === ']' ? 1 : -1);
    if (e.key === ' ') return (e.preventDefault(), endTurn());
    const hover = s.hover;
    if (hover && (e.key === '=' || e.key === '+'))
      return dispatch({ type: 'ADJUST_ELEVATION', r: hover.r, c: hover.c, delta: 1 });
    if (hover && e.key === '-')
      return dispatch({ type: 'ADJUST_ELEVATION', r: hover.r, c: hover.c, delta: -1 });
    const key = e.key.toLowerCase();
    if (key === 'g') return store.dispatchSession({ type: 'field', open: !s.fieldMode });
    if (key === 't') return store.dispatchSession({ type: 'effects', open: !s.effectsOpen });
    const u = selected();
    if (!u) return;
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const idx = b.turn.order.indexOf(u.id);
      if (idx >= 0)
        dispatch({ type: 'REORDER_TURN', unitId: u.id, toIndex: idx + (e.key === 'ArrowRight' ? 1 : -1) });
      return;
    }
    if (key === 'h') return (e.preventDefault(), openPopover('hp'));
    if (key === 's') return openPopover('status');
    if (key === 'y') {
      readyNote = b.turn.readied?.[u.id] ?? '';
      sheet = { kind: 'ready', unitId: u.id };
      return renderUI();
    }
    if (key === 'd') return delaySelected();
    if (key === 'delete') {
      void confirmDialog('Remove', `Remove ${unitName(u)} from the battle?`).then(
        (ok) => ok && dispatch({ type: 'REMOVE_UNIT', unitId: u.id }),
      );
      return;
    }
    if (!b.turn.started) return;
    if (key === 'f') return toggleMode('move');
    if (key === 'e') return toggleMode('attack');
    if (key === 'p') return toggleMode('pickup');
    if (key === 'c') return openCast();
    if (key === 'r') return openItems();
    if (key === 'q' && actionAvailability(b, u.id, store.ctx.assets).swap)
      return dispatch({ type: 'SWAP_WEAPON', unitId: u.id });
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Alt') store.dispatchSession({ type: 'peek', on: false });
  };
  const onBlur = () => store.dispatchSession({ type: 'peek', on: false });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  function pickTie(group: readonly string[], id: string | undefined): void {
    if (!id || tiePick.includes(id)) return;
    tiePick = [...tiePick, id];
    // the last one left goes last: no need to click it
    if (tiePick.length === group.length - 1)
      tiePick = [...tiePick, ...group.filter((g) => !tiePick.includes(g))];
  }
  function confirmTie(): void {
    const p = battle().pending;
    const group = p?.kind === 'tieOrder' ? p.groups[0] : undefined;
    if (!group || tiePick.length !== group.length) return;
    const order = tiePick;
    tiePick = [];
    dispatch({ type: 'RESOLVE_TIE', group, order });
  }
  function submitInitiative(): void {
    const p = battle().pending;
    if (p?.kind !== 'initiativeEntry') return;
    const rolls: Record<string, number> = {};
    for (const id of p.party) rolls[id] = Number(initDraft[id]);
    const res = dispatch({ type: 'SUBMIT_INITIATIVE', rolls });
    if (!res.ok) toast({ text: 'Initiative', sub: res.error.message });
  }
  function applyHp(): void {
    const pop = session().popover;
    const amount = Number(hpEntry.digits);
    if (!pop || !amount) return;
    dispatch({ type: 'APPLY_HP', unitId: pop.unitId, delta: hpEntry.sign * amount });
    hpEntry = { sign: hpEntry.sign, digits: '' };
    store.dispatchSession({ type: 'popover', popover: null });
  }
  function applyStatus(): void {
    const pop = session().popover;
    if (!pop) return;
    const preset = STATUS_PRESETS[statusPick.index];
    if (!preset) return;
    const name = statusPick.custom.trim() || preset.status.name;
    const actorId = battle().turn.order[battle().turn.currentIndex];
    const actor = actorId ? combatantById(battle(), actorId) : undefined;
    const source = actor ? `DM · ${unitName(actor)}'s turn` : 'DM';
    dispatch({
      type: 'ADD_STATUS',
      unitId: pop.unitId,
      status: { ...preset.status, name, duration: statusPick.duration },
      source,
    });
    store.dispatchSession({ type: 'popover', popover: null });
  }
  function confirmSheet(): void {
    if (!sheet) return;
    if (sheet.kind === 'cast') {
      const u = combatantById(battle(), sheet.unitId);
      if (u?.kind !== 'entity') return closeSheet();
      const spells = knownSpells(u);
      const spell = spells[Math.min(sheet.index, spells.length - 1)];
      if (!spell) return;
      const slots = spellSlotOptions(u, spell);
      if (spell.level > 0 && slots.length === 0) return;
      castSpell(u, spell, spell.level === 0 ? 0 : (sheet.slot ?? slots[0] ?? spell.level));
    } else if (sheet.kind === 'item') {
      const u = combatantById(battle(), sheet.unitId);
      if (u?.kind !== 'entity') return closeSheet();
      const items = u.sheet.inventory.filter((i) => i.kind === 'consumable');
      const item = items[Math.min(sheet.index, items.length - 1)];
      if (!item) return;
      closeSheet();
      dispatch({ type: 'USE_CONSUMABLE', unitId: u.id, itemName: item.name });
    }
  }
  const spellSlotOptions = (u: EntityUnit, spell: SpellDef): number[] => {
    if (spell.level === 0) return [0];
    const out: number[] = [];
    for (let lvl = spell.level; lvl <= MAX_SPELL_LEVEL; lvl++)
      if (spellSlotsRemaining(u.sheet, lvl) > 0) out.push(lvl);
    return out;
  };

  // ---- rendering pieces ----
  function roundPill(): HTMLElement {
    const b = battle();
    const theme =
      BOARD_THEMES.find((t) => t.id === b.board.theme)?.label.replace(/ \(.*\)$/, '') ?? b.board.theme;
    const cur = b.turn.started ? combatantById(b, b.turn.order[b.turn.currentIndex] ?? '') : undefined;
    const lvl = vm.ambientLevel ?? 100;
    return h(
      'div',
      { class: 'sp-panel sp-round', dataset: { testid: 'round-pill' } },
      h(
        'div',
        { class: 'n' },
        h('small', {}, b.turn.started ? 'RND' : ''),
        b.turn.started ? String(b.turn.round) : 'Setup',
      ),
      h(
        'div',
        { class: 'area' },
        theme,
        h('br'),
        h(
          'span',
          {},
          b.pending?.kind === 'initiativeEntry'
            ? 'Rolling initiative'
            : cur
              ? `${unitName(cur)}'s turn · ${b.turn.currentIndex + 1} of ${b.turn.order.length}`
              : b.turn.placementQueue.length
                ? `Place ${b.turn.placementQueue[0]}`
                : 'Place everyone, then Begin',
        ),
      ),
      h(
        'div',
        { class: 'amb', title: 'Ambient light (Field ▸ Light)' },
        h('span', { class: 'bar' }, h('i', { style: `left:${lvl}%` })),
        `${lvl}%`,
      ),
    );
  }

  function topRight(): HTMLElement {
    const b = battle();
    const hist = store.history;
    const tvLive = !!tvWin && !tvWin.closed;
    const parts: HTMLElement[] = [
      h(
        'button',
        {
          type: 'button',
          class: 'sp-pill',
          disabled: !hist.undo,
          title: hist.undo ? `Undo: ${hist.undo}` : 'Nothing to undo',
          onclick: undo,
          dataset: { testid: 'undo' },
        },
        icon('undo'),
        h('span', { class: 'sp-k' }, 'Ctrl Z'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'sp-pill hi',
          onclick: openTv,
          title: tvLive ? 'Player window is open' : 'Open the player window',
        },
        h('span', { class: `live${tvLive ? ' on' : ''}` }),
        'TV',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'sp-pill',
          onclick: () => ((menuOpen = !menuOpen), renderUI()),
          title: 'Battle menu',
          dataset: { testid: 'menu' },
        },
        icon('gear'),
      ),
    ];
    if (!b.turn.started) {
      parts.push(
        h(
          'div',
          { class: 'sp-seg', title: 'How round 1 opens' },
          ...(['SURPRISE', 'NORMAL', 'AMBUSH'] as const).map((m) =>
            h(
              'button',
              {
                type: 'button',
                class: b.turn.roundStartMode === m ? 'on' : '',
                onclick: () => dispatch({ type: 'SET_ROUND_START_MODE', mode: m }),
                title:
                  m === 'SURPRISE'
                    ? 'Party acts first'
                    : m === 'AMBUSH'
                      ? 'Enemies act first'
                      : 'Standard initiative',
              },
              m === 'SURPRISE' ? 'Surprise' : m === 'NORMAL' ? 'Normal' : 'Ambush',
            ),
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'sp-pill next',
            disabled: b.turn.placementQueue.length > 0 || !!b.pending,
            onclick: endTurn,
            dataset: { testid: 'begin' },
          },
          'Begin',
          h('span', { class: 'sp-k' }, 'Space'),
        ),
      );
    } else
      parts.push(
        h(
          'button',
          {
            type: 'button',
            class: 'sp-pill next',
            disabled: !!b.pending,
            onclick: endTurn,
            dataset: { testid: 'end-turn' },
          },
          'End turn',
          h('span', { class: 'sp-k' }, 'Space'),
        ),
      );
    return h('div', { class: 'sp-panel sp-tr' }, ...parts);
  }

  function menu(): HTMLElement | null {
    if (!menuOpen) return null;
    const item = (ic: keyof typeof ICON, label: string, run: () => void, key?: string, cls = '') =>
      h(
        'button',
        { type: 'button', class: cls, onclick: () => ((menuOpen = false), run(), renderUI()) },
        icon(ic),
        label,
        key ? h('span', { class: 'sp-k' }, key) : null,
      );
    return h(
      'div',
      { class: 'sp-panel sp-menu' },
      item('sheet', 'Character sheets', () => deps.onOpenSheets()),
      item('moon', 'Long rest (spell slots)', () => dispatch({ type: 'LONG_REST' })),
      h('hr'),
      item('save', 'Save battle…', () => ((saveName = ''), (sheet = { kind: 'save' }))),
      item(
        'save',
        'Load battle…',
        () => void deps.listBattles().then((names) => ((sheet = { kind: 'load', names }), renderUI())),
      ),
      h('hr'),
      item('undo', 'Reset camera', () => resetView(renderer, prefs), 'Home'),
      item('tv', 'Open player window', openTv),
      item(
        'bug',
        'Debug panel',
        () => store.dispatchSession({ type: 'debug', open: !session().debugOpen }),
        '`',
      ),
      h('hr'),
      item('flag', 'End battle…', () => void endBattle(), undefined, 'danger'),
    );
  }

  function dock(): HTMLElement {
    const s = session();
    return h(
      'div',
      { class: 'sp-panel sp-dock', dataset: { testid: 'dock' } },
      h(
        'button',
        {
          type: 'button',
          class: `sp-dk head${s.fieldMode ? ' on' : ''}`,
          onclick: () => store.dispatchSession({ type: 'field', open: !s.fieldMode }),
          title: 'Field mode: edit the board (G)',
          dataset: { testid: 'field-toggle' },
        },
        h('span', { class: 'sp-k' }, 'G'),
        icon('height'),
        'Field',
      ),
      h('div', { class: 'sp-dk sep' }),
      ...FIELD_TABS.map((t) =>
        h(
          'button',
          {
            type: 'button',
            class: `sp-dk${s.fieldMode && s.fieldTab === t.tab ? ' cur' : ''}`,
            onclick: () => store.dispatchSession({ type: 'field', open: true, tab: t.tab }),
            dataset: { testid: `dock-${t.tab}` },
          },
          icon(t.icon),
          t.label,
        ),
      ),
    );
  }

  function actionBar(): HTMLElement | null {
    const b = battle();
    const s = session();
    if (s.fieldMode) return null;
    if (b.pending) return null;
    const u = selected();
    const bar = h('div', { class: 'sp-panel sp-abar', dataset: { testid: 'action-bar' } });
    if (!u) {
      bar.append(
        h(
          'div',
          { class: 'hint' },
          b.turn.started
            ? 'Select a creature (click it, or its card)'
            : b.turn.placementQueue.length
              ? `Click a tile to place ${b.turn.placementQueue[0]}`
              : 'Place creatures from Field ▸ Spawn, then Begin',
        ),
      );
      return bar;
    }
    const avail = actionAvailability(b, u.id, store.ctx.assets);
    const m = s.mode;
    const on = (k: string) => m.kind === k && 'unitId' in m && m.unitId === u.id;
    const hp = u.kind === 'entity' ? u.sheet.currentHP : u.health;
    const max = u.kind === 'entity' ? u.sheet.totalHP : u.maxHealth;
    bar.append(
      h(
        'div',
        { class: 'sp-who' },
        portrait(
          library,
          {
            spritePath: u.kind === 'entity' ? u.sheet.spritePath : u.spritePath,
            color: u.kind === 'entity' ? u.sheet.color : u.color,
            name: unitName(u),
          },
          28,
        ),
        h(
          'div',
          { style: 'min-width:0' },
          h('b', { dataset: { testid: 'sel-name' } }, unitName(u)),
          h(
            'span',
            { dataset: { testid: 'sel-stats' } },
            `${hp}/${max} · AC ${vm.units.find((x) => x.id === u.id)?.ac ?? '?'} · MOB ${vm.units.find((x) => x.id === u.id)?.mob ?? '?'}`,
          ),
        ),
      ),
    );
    if (u.kind === 'entity' && u.dying) {
      const name = unitName(u);
      bar.append(
        h(
          'div',
          { class: 'sp-dying' },
          h(
            'button',
            {
              type: 'button',
              class: 'sp-btn go',
              onclick: () => dispatch({ type: 'RESOLVE_DYING', unitId: u.id, outcome: 'recover' }),
              title: 'Back up with 1 HP',
            },
            '✚ Recover',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'sp-btn',
              onclick: () => dispatch({ type: 'RESOLVE_DYING', unitId: u.id, outcome: 'hold' }),
            },
            '⏳ Hold on',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'sp-btn danger',
              onclick: () =>
                void confirmDialog(
                  'Perish',
                  `${name} dies. They leave the battle, a tombstone marks the spot, and their character sheet is marked dead.`,
                ).then((ok) => ok && dispatch({ type: 'RESOLVE_DYING', unitId: u.id, outcome: 'perish' })),
            },
            '✝ Perish',
          ),
        ),
      );
      return bar;
    }
    const ab = (
      label: string,
      ic: keyof typeof ICON,
      key: string,
      run: () => void,
      enabled: boolean,
      active = false,
      cls = '',
    ) =>
      h(
        'button',
        {
          type: 'button',
          class: `sp-ab ${cls}${active ? ' on' : ''}`,
          disabled: !enabled,
          onclick: run,
          dataset: { testid: `act-${label.toLowerCase().replace(/[^a-z]/g, '')}` },
        },
        h('span', { class: 'sp-k' }, key),
        icon(ic),
        label,
      );
    const held = (b.turn.held ?? []).includes(u.id);
    const wpn = weaponLine(u);
    if (wpn)
      bar.append(
        h(
          'button',
          {
            type: 'button',
            class: 'sp-wpn',
            disabled: !avail.swap,
            onclick: () => dispatch({ type: 'SWAP_WEAPON', unitId: u.id }),
            title: avail.swap ? 'Swap to the secondary weapon (Q)' : 'No secondary weapon to swap to',
            dataset: { testid: 'weapon' },
          },
          avail.swap ? h('span', { class: 'sp-k' }, 'Q') : null,
          h('small', {}, avail.swap ? 'Weapon ⇄' : 'Weapon'),
          h('b', {}, wpn.name),
          wpn.ammo !== null ? h('span', { class: wpn.ammo === 0 ? 'out' : '' }, `${wpn.ammo} ammo`) : null,
        ),
      );
    bar.append(
      ab('Move', 'move', 'F', () => toggleMode('move'), avail.move, on('move'), 'move'),
      ab('Attack', 'attack', 'E', () => toggleMode('attack'), avail.attack, on('attack')),
      ab('Cast', 'cast', 'C', openCast, avail.cast, sheet?.kind === 'cast' || on('cast'), 'magic'),
      ab('Item', 'item', 'R', openItems, avail.useItem, sheet?.kind === 'item'),
      ab('Status', 'tag', 'S', () => openPopover('status'), true, s.popover?.kind === 'status', 'magic'),
      ab('± HP', 'heart', 'H', () => openPopover('hp'), true, s.popover?.kind === 'hp'),
      ab(held ? 'Act now' : 'Delay', 'clock', 'D', delaySelected, b.turn.started),
    );
    return bar;
  }

  /** The equipped weapon and, for a ranged one, how much matching ammo is carried. */
  function weaponLine(u: ReturnType<typeof selected>): { name: string; ammo: number | null } | null {
    if (u?.kind !== 'entity') return null;
    const w = equippedWeapon(u);
    if (!w) return { name: 'Unarmed', ammo: null };
    if (!isRanged(w.ammoType)) return { name: w.name, ammo: null };
    const compat = battle().rules.compat.ammoCompatIgnoresLegacyField;
    const ammo = u.sheet.inventory
      .filter(
        (i) =>
          i.kind === 'ammunition' &&
          ammoCompatible(i.ammoType, i.legacyCompatibleWeaponType, w.ammoType, compat),
      )
      .reduce((n, i) => n + Math.max(0, i.quantity), 0);
    return { name: w.name, ammo };
  }

  function popover(): HTMLElement | null {
    const pop = session().popover;
    if (!pop) return null;
    const u = combatantById(battle(), pop.unitId);
    if (!u) return null;
    const name = unitName(u);
    if (pop.kind === 'hp') {
      const hp = u.kind === 'entity' ? u.sheet.currentHP : u.health;
      const max = u.kind === 'entity' ? u.sheet.totalHP : u.maxHealth;
      const amt = Number(hpEntry.digits) || 0;
      const after = hpEntry.sign < 0 ? Math.max(0, hp - amt) : Math.min(max, hp + amt);
      const quick = (v: number) =>
        h(
          'button',
          {
            type: 'button',
            onclick: () => (
              (hpEntry.sign = v < 0 ? -1 : 1),
              (hpEntry.digits = String(Math.abs(v))),
              applyHp()
            ),
          },
          v > 0 ? `+${v}` : `−${-v}`,
        );
      return h(
        'div',
        { class: 'sp-panel sp-pop', dataset: { testid: 'hp-popover' } },
        h(
          'h4',
          {},
          `${hpEntry.sign < 0 ? 'Damage' : 'Heal'} · ${name}`,
          h('span', { class: 'sp-k' }, 'Enter'),
          h('span', { class: 'sp-k' }, 'Esc'),
        ),
        h(
          'div',
          { class: 'sp-hp-entry' },
          h(
            'div',
            { class: 'sign' },
            h(
              'button',
              {
                type: 'button',
                class: `dmg${hpEntry.sign < 0 ? ' on' : ''}`,
                onclick: () => ((hpEntry.sign = -1), renderUI()),
              },
              '− dmg',
            ),
            h(
              'button',
              {
                type: 'button',
                class: `heal${hpEntry.sign > 0 ? ' on' : ''}`,
                onclick: () => ((hpEntry.sign = 1), renderUI()),
              },
              '+ heal',
            ),
          ),
          h(
            'div',
            { class: `amt${hpEntry.digits ? '' : ' empty'}` },
            hpEntry.digits ? `${hpEntry.sign < 0 ? '−' : '+'}${hpEntry.digits}` : 'type a number',
          ),
        ),
        h('div', { class: 'sp-hp-quick' }, quick(-1), quick(-5), quick(-10), quick(1), quick(5), quick(10)),
        h(
          'div',
          { class: 'sp-hp-after' },
          h('span', {}, `${hp} / ${max}`),
          h('span', {}, amt ? `→ ${after} / ${max}` : '− / + switch · digits type'),
        ),
      );
    }
    const preset = STATUS_PRESETS[statusPick.index];
    return h(
      'div',
      { class: 'sp-panel sp-pop', style: 'width:470px', dataset: { testid: 'status-popover' } },
      h(
        'h4',
        {},
        `Status · ${name}`,
        h('span', { class: 'sp-k' }, '← →'),
        h('span', { class: 'sp-k' }, 'Enter'),
      ),
      h(
        'div',
        { class: 'sp-st-grid' },
        ...STATUS_PRESETS.map((p, i) => {
          const fam =
            p.status.effectType === StatusEffect.DAMAGE_OVER_TIME
              ? 'dot'
              : p.status.effectType === StatusEffect.NONE
                ? 'neutral'
                : p.status.magnitude >= 0
                  ? 'buff'
                  : 'debuff';
          return h(
            'button',
            {
              type: 'button',
              class: i === statusPick.index ? 'on' : '',
              onclick: () => ((statusPick.index = i), (statusPick.duration = p.status.duration), renderUI()),
              ondblclick: () => ((statusPick.index = i), applyStatus()),
            },
            emblem(p.status.name, fam, 30),
            p.status.name,
            h('span', { class: 'f' }, p.note),
          );
        }),
      ),
      h(
        'div',
        { class: 'sp-st-row' },
        'Turns',
        h(
          'div',
          { class: 'sp-step' },
          h(
            'button',
            {
              type: 'button',
              onclick: () => ((statusPick.duration = Math.max(-1, statusPick.duration - 1)), renderUI()),
            },
            '−',
          ),
          h('b', {}, statusPick.duration < 0 ? '∞' : String(statusPick.duration)),
          h(
            'button',
            { type: 'button', onclick: () => ((statusPick.duration = statusPick.duration + 1), renderUI()) },
            '+',
          ),
        ),
        h('input', {
          class: 'sp-text',
          placeholder: `name (${preset?.status.name ?? ''})`,
          value: statusPick.custom,
          style: 'flex:1',
          oninput: (ev: Event) => (statusPick.custom = (ev.target as HTMLInputElement).value),
          onkeydown: (ev: KeyboardEvent) => ev.key === 'Enter' && applyStatus(),
        }),
        h('button', { type: 'button', class: 'sp-btn go', onclick: applyStatus }, 'Apply'),
      ),
    );
  }

  function ctxPanel(): HTMLElement | null {
    if (!ctxMenu) return null;
    const u = combatantById(battle(), ctxMenu.unitId);
    if (!u) return null;
    const held = (battle().turn.held ?? []).includes(u.id);
    const item = (ic: keyof typeof ICON, label: string, run: () => void, key?: string, cls = '') =>
      h(
        'button',
        { type: 'button', class: cls, onclick: () => ((ctxMenu = null), run(), renderUI()) },
        icon(ic),
        label,
        key ? h('span', { class: 'sp-k' }, key) : null,
      );
    return h(
      'div',
      {
        class: 'sp-panel sp-menu',
        style: `left:${Math.min(ctxMenu.x, sp.clientWidth - 280)}px;top:${Math.min(ctxMenu.y, sp.clientHeight - 300)}px;right:auto`,
      },
      h(
        'div',
        { style: 'padding:4px 10px 8px' },
        h('div', { style: 'font:700 14px var(--fh)' }, unitName(u)),
        h(
          'div',
          { style: 'font-size:11.5px;color:var(--ink-2);margin-top:2px' },
          `${u.kind === 'entity' ? u.sheet.currentHP : u.health}/${u.kind === 'entity' ? u.sheet.totalHP : u.maxHealth} HP · AC ${armorClass(u)} · MOB ${movement(u)} · ${damageDice(u).filter(Boolean).join('/')}`,
        ),
      ),
      item('heart', '± HP', () => openPopover('hp'), 'H'),
      item('tag', 'Status', () => openPopover('status'), 'S'),
      item('clock', held ? 'Act now' : 'Delay', delaySelected, 'D'),
      item(
        'flag',
        'Ready an action',
        () => ((readyNote = battle().turn.readied?.[u.id] ?? ''), (sheet = { kind: 'ready', unitId: u.id })),
        'Y',
      ),
      u.kind === 'entity' && u.sheet.isParty
        ? item('swap', 'Swap weapon', () => dispatch({ type: 'SWAP_WEAPON', unitId: u.id }), 'Q')
        : null,
      u.kind === 'entity' && u.sheet.isParty && battle().turn.started
        ? item('hand', 'Pick up an item', () => toggleMode('pickup'), 'P')
        : null,
      item('gear', 'Adjust AC, stats & dice…', () => (sheet = { kind: 'adjust', unitId: u.id })),
      h('hr'),
      item(
        'x',
        'Remove from battle',
        () =>
          void confirmDialog('Remove', `Remove ${unitName(u)} from the battle?`).then(
            (ok) => ok && dispatch({ type: 'REMOVE_UNIT', unitId: u.id }),
          ),
        'Del',
        'danger',
      ),
    );
  }

  function sheetPanel(): HTMLElement | null {
    const b = battle();
    // initiative entry: one card per party member, digits typed straight in
    if (b.pending?.kind === 'initiativeEntry') {
      const party = b.pending.party;
      return h(
        'div',
        { class: 'sp-panel sp-sheet', dataset: { testid: 'initiative-sheet' } },
        h(
          'h3',
          {},
          'Initiative',
          h('span', { class: 'sub' }, 'type each d20 · Tab next'),
          h('span', { class: 'sp-k' }, 'Enter'),
        ),
        h(
          'div',
          { class: 'sp-init' },
          ...party.map((id, i) => {
            const u = combatantById(b, id);
            const v = initDraft[id] ?? '';
            return h(
              'button',
              {
                type: 'button',
                class: `card${i === initCursor ? ' active' : ''}`,
                onclick: () => ((initCursor = i), renderUI()),
              },
              portrait(
                library,
                {
                  spritePath: u?.kind === 'entity' ? u.sheet.spritePath : null,
                  color: u?.kind === 'entity' ? u.sheet.color : '#666',
                  name: u ? unitName(u) : id,
                },
                40,
              ),
              h('div', { class: `v${v ? '' : ' empty'}` }, v || 'd20'),
              h('div', { class: 'nm' }, u ? unitName(u) : id),
            );
          }),
        ),
        h(
          'div',
          { class: 'foot' },
          'Enemies roll on their own.',
          h(
            'button',
            { type: 'button', class: 'sp-btn', onclick: () => dispatch({ type: 'CANCEL_INITIATIVE_ENTRY' }) },
            'Cancel',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'sp-btn go',
              disabled: !party.every((id) => Number(initDraft[id]) >= 1),
              onclick: submitInitiative,
            },
            'Begin ⏎',
          ),
        ),
      );
    }
    // a sheet the DM opened (save, load, …) goes over the tie; the tie is back once it closes
    if (b.pending?.kind === 'tieOrder' && !sheet) return tieSheet(b.pending.groups[0] ?? []);
    if (!sheet) return null;
    if (sheet.kind === 'cast') {
      const u = combatantById(b, sheet.unitId);
      if (u?.kind !== 'entity') return null;
      const spells = knownSpells(u);
      const idx = Math.min(sheet.index, spells.length - 1);
      const cur = spells[idx];
      const slots = cur ? spellSlotOptions(u, cur) : [];
      const s = sheet;
      return h(
        'div',
        { class: 'sp-panel sp-sheet', dataset: { testid: 'cast-sheet' } },
        h(
          'h3',
          {},
          `Cast · ${unitName(u)}`,
          h('span', { class: 'sub' }, '↑↓ pick'),
          h('span', { class: 'sp-k' }, 'Enter'),
        ),
        h(
          'div',
          { class: 'body' },
          ...spells.map((sp2, i) => {
            const ok = spellSlotOptions(u, sp2).length > 0;
            return h(
              'button',
              {
                type: 'button',
                class: `sp-opt${i === idx ? ' on' : ''}`,
                disabled: !ok,
                onclick: () => ((s.index = i), (s.slot = null), renderUI()),
                ondblclick: () => ((s.index = i), confirmSheet()),
                dataset: { testid: `spell-${sp2.name}` },
              },
              h('span', {
                style: `width:14px;height:14px;border-radius:50%;margin-left:8px;background:${sp2.color};box-shadow:0 0 8px ${sp2.color}`,
              }),
              h(
                'div',
                {},
                h('div', { class: 'nm' }, sp2.name),
                h('div', { class: 'sub' }, spellSummary(sp2)),
              ),
              h(
                'span',
                { class: 'tag' },
                sp2.level === 0 ? 'Cantrip' : `Lv ${sp2.level}${ok ? '' : ' · no slots'}`,
              ),
            );
          }),
        ),
        h(
          'div',
          { class: 'foot' },
          cur && cur.level > 0
            ? h(
                'span',
                { style: 'display:flex;gap:6px;align-items:center' },
                'Slot',
                ...slots.map((lvl) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      class: `sp-btn${(s.slot ?? slots[0]) === lvl ? ' go' : ''}`,
                      style: 'height:26px;padding:0 9px',
                      onclick: () => ((s.slot = lvl), renderUI()),
                    },
                    `${lvl} (${spellSlotsRemaining(u.sheet, lvl)}/${maxSpellSlots(u.sheet, lvl)})`,
                  ),
                ),
              )
            : h('span', {}, cur?.description ? cur.description.slice(0, 80) : ''),
          h(
            'button',
            {
              type: 'button',
              class: 'sp-btn go',
              disabled: !cur || slots.length === 0,
              onclick: confirmSheet,
              dataset: { testid: 'cast-btn' },
            },
            'Cast ⏎',
          ),
        ),
      );
    }
    if (sheet.kind === 'item') {
      const u = combatantById(b, sheet.unitId);
      if (u?.kind !== 'entity') return null;
      const items = u.sheet.inventory.filter((i) => i.kind === 'consumable');
      const idx = Math.min(sheet.index, items.length - 1);
      const s = sheet;
      return h(
        'div',
        { class: 'sp-panel sp-sheet', style: 'width:380px' },
        h('h3', {}, `Use item · ${unitName(u)}`, h('span', { class: 'sp-k' }, 'Enter')),
        h(
          'div',
          { class: 'body' },
          items.length === 0
            ? h('div', { style: 'padding:8px;color:var(--ink-3)' }, 'No consumables.')
            : null,
          ...items.map((it, i) =>
            h(
              'button',
              {
                type: 'button',
                class: `sp-opt${i === idx ? ' on' : ''}`,
                onclick: () => ((s.index = i), renderUI()),
                ondblclick: () => ((s.index = i), confirmSheet()),
              },
              h('span', {
                style: `width:14px;height:14px;border-radius:4px;margin-left:8px;background:${it.color}`,
              }),
              h(
                'div',
                {},
                h('div', { class: 'nm' }, it.name),
                h(
                  'div',
                  { class: 'sub' },
                  it.kind === 'consumable' ? `heals up to ${it.healAmount} (d10 × 10%)` : '',
                ),
              ),
              h('span', { class: 'tag' }, `×${it.quantity}`),
            ),
          ),
        ),
        h(
          'div',
          { class: 'foot' },
          h(
            'button',
            { type: 'button', class: 'sp-btn go', disabled: items.length === 0, onclick: confirmSheet },
            'Use ⏎',
          ),
        ),
      );
    }
    if (sheet.kind === 'ready') {
      const u = combatantById(b, sheet.unitId);
      if (!u) return null;
      const s = sheet;
      const input = h('input', {
        class: 'sp-text',
        style: 'width:100%',
        placeholder: 'e.g. strike whoever climbs the ramp',
        value: readyNote,
        oninput: (ev: Event) => (readyNote = (ev.target as HTMLInputElement).value),
      });
      const set = () => {
        dispatch({ type: 'SET_READIED', unitId: s.unitId, note: readyNote });
        closeSheet();
      };
      input.onkeydown = (ev) => ev.key === 'Enter' && set();
      setTimeout(() => input.focus(), 0);
      return h(
        'div',
        { class: 'sp-panel sp-sheet', style: 'width:380px' },
        h('h3', {}, `Ready · ${unitName(u)}`),
        h('div', { style: 'padding:0 16px' }, input),
        h(
          'div',
          { class: 'foot' },
          'Lapses at their next turn.',
          b.turn.readied?.[u.id]
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'sp-btn',
                  onclick: () => (
                    dispatch({ type: 'SET_READIED', unitId: s.unitId, note: null }),
                    closeSheet()
                  ),
                },
                'Clear',
              )
            : null,
          h('button', { type: 'button', class: 'sp-btn go', onclick: set }, 'Ready ⏎'),
        ),
      );
    }
    if (sheet.kind === 'timer' || sheet.kind === 'arrival') return planSheet(sheet.kind);
    if (sheet.kind === 'adjust') return adjustSheet(sheet.unitId);
    if (sheet.kind === 'save') {
      const input = h('input', {
        class: 'sp-text',
        style: 'width:100%',
        placeholder: 'battle name',
        value: saveName,
        dataset: { testid: 'save-name' },
        oninput: (ev: Event) => (saveName = (ev.target as HTMLInputElement).value),
      });
      const go = () => {
        if (!saveName.trim()) return;
        const name = saveName.trim();
        deps.saveBattle(name).then(
          () => toast({ text: 'Battle saved', sub: name }),
          (err: unknown) => toast({ text: 'Save failed', sub: String(err) }),
        );
        closeSheet();
      };
      input.onkeydown = (ev) => ev.key === 'Enter' && go();
      setTimeout(() => input.focus(), 0);
      return h(
        'div',
        { class: 'sp-panel sp-sheet', style: 'width:380px' },
        h('h3', {}, 'Save battle'),
        h('div', { style: 'padding:0 16px' }, input),
        h(
          'div',
          { class: 'foot' },
          'campaign/battles/',
          h(
            'button',
            { type: 'button', class: 'sp-btn go', onclick: go, dataset: { testid: 'save-ok' } },
            'Save ⏎',
          ),
        ),
      );
    }
    if (sheet.kind === 'load') {
      return h(
        'div',
        { class: 'sp-panel sp-sheet', style: 'width:380px' },
        h('h3', {}, 'Load battle'),
        h(
          'div',
          { class: 'body' },
          sheet.names.length === 0
            ? h('div', { style: 'padding:8px;color:var(--ink-3)' }, 'No saved battles yet.')
            : null,
          ...sheet.names.map((n) =>
            h(
              'button',
              {
                type: 'button',
                class: 'sp-opt',
                onclick: () => (closeSheet(), void deps.loadBattle(n)),
                dataset: { testid: `load-${n}` },
              },
              icon('save'),
              h('div', { class: 'nm' }, n),
              h('span'),
            ),
          ),
        ),
      );
    }
    return null;
  }

  /** Party members who tied on initiative: click (or 1–9) in the order they act. */
  function tieSheet(group: readonly string[]): HTMLElement {
    const b = battle();
    const key = group.join(',');
    if (key !== tieKey) {
      tieKey = key;
      tiePick = [];
    }
    const total = b.turn.initiative[group[0] ?? '']?.total ?? null;
    const shown = total === null ? null : total > 100 ? total - 100 : total;
    const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
    return h(
      'div',
      { class: 'sp-panel sp-sheet', dataset: { testid: 'tie-sheet' } },
      h(
        'h3',
        {},
        'Initiative tie',
        h('span', { class: 'sub' }, `${shown === null ? 'tied' : `all on ${shown}`} · click who goes first`),
        h('span', { class: 'sp-k' }, 'Enter'),
      ),
      h(
        'div',
        { class: 'sp-init' },
        ...group.map((id, i) => {
          const u = combatantById(b, id);
          const at = tiePick.indexOf(id);
          return h(
            'button',
            {
              type: 'button',
              class: `card${at < 0 && tiePick.length < group.length ? ' active' : ''}`,
              onclick: () => (pickTie(group, id), renderUI()),
              dataset: { testid: `tie-${id}` },
            },
            h('span', { class: 'sp-k', style: 'position:absolute;top:6px;left:6px' }, String(i + 1)),
            portrait(
              library,
              {
                spritePath: u?.kind === 'entity' ? u.sheet.spritePath : null,
                color: u?.kind === 'entity' ? u.sheet.color : '#666',
                name: u ? unitName(u) : id,
              },
              40,
            ),
            h('div', { class: `v${at < 0 ? ' empty' : ''}` }, at < 0 ? '—' : (ord[at] ?? String(at + 1))),
            h('div', { class: 'nm' }, u ? unitName(u) : id),
          );
        }),
      ),
      h(
        'div',
        { class: 'foot' },
        h(
          'button',
          {
            type: 'button',
            class: 'sp-btn',
            onclick: () => dispatch({ type: 'DISMISS_TIES' }),
            title: 'Keep the rolled order for now; the tie comes back next round (Esc)',
          },
          'Later',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'sp-btn',
            disabled: tiePick.length === 0,
            onclick: () => ((tiePick = []), renderUI()),
          },
          'Reset',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'sp-btn go',
            disabled: tiePick.length !== group.length,
            onclick: confirmTie,
            dataset: { testid: 'tie-ok' },
          },
          'Confirm ⏎',
        ),
      ),
    );
  }

  /** Battle-only tweaks (never saved to the sheet): AC, each attribute, each damage tier's die. */
  function adjustSheet(unitId: UnitId): HTMLElement | null {
    const u = combatantById(battle(), unitId);
    if (!u) return null;
    const row = (label: string, value: string, delta: number, dec: () => void, inc: () => void) => {
      const id = `adj-${label.split(' ')[0]?.toLowerCase()}`;
      return h(
        'div',
        { class: 'sp-st-row', style: 'margin:0;justify-content:space-between' },
        h('span', { style: 'font-weight:700' }, label),
        h(
          'div',
          { class: 'sp-step' },
          h('button', { type: 'button', onclick: dec, dataset: { testid: `${id}-dec` } }, '−'),
          h('b', { class: delta > 0 ? 'up' : delta < 0 ? 'down' : '', dataset: { testid: id } }, value),
          h('button', { type: 'button', onclick: inc, dataset: { testid: `${id}-inc` } }, '+'),
        ),
      );
    };
    const rows: HTMLElement[] = [
      row(
        'AC',
        String(armorClass(u)),
        u.acAdjustment,
        () => dispatch({ type: 'ADJUST_AC', unitId, delta: -1 }),
        () => dispatch({ type: 'ADJUST_AC', unitId, delta: 1 }),
      ),
    ];
    for (let i = 0; i < 6; i++) {
      if (u.kind === 'enemy' && i !== 1) continue;
      const value = u.kind === 'entity' ? adjustedAttribute(u, i) : u.dexterity + u.dexAdjustment;
      const delta = u.kind === 'entity' ? (u.statAdjustment[i] ?? 0) : u.dexAdjustment;
      rows.push(
        row(
          ATTRIBUTE_SHORT[i] ?? '?',
          String(value),
          delta,
          () => dispatch({ type: 'ADJUST_STAT', unitId, attribute: i, delta: -1 }),
          () => dispatch({ type: 'ADJUST_STAT', unitId, attribute: i, delta: 1 }),
        ),
      );
    }
    const dice = damageDice(u),
      base = baseDamageDice(u);
    for (let t = 0; t < 3; t++)
      rows.push(
        row(
          `T${t + 1} die`,
          dice[t] ?? '—',
          dice[t] === base[t]
            ? 0
            : (DICE_PROGRESSION as readonly string[]).indexOf(dice[t] ?? '') -
                (DICE_PROGRESSION as readonly string[]).indexOf(base[t] ?? ''),
          () => dispatch({ type: 'ADJUST_DICE', unitId, tier: t, direction: -1 }),
          () => dispatch({ type: 'ADJUST_DICE', unitId, tier: t, direction: 1 }),
        ),
      );
    return h(
      'div',
      { class: 'sp-panel sp-sheet', style: 'width:340px', dataset: { testid: 'adjust-sheet' } },
      h('h3', {}, `Adjust · ${unitName(u)}`, h('span', { class: 'sp-k' }, 'Esc')),
      h('div', { style: 'padding:0 16px;display:flex;flex-direction:column;gap:6px' }, ...rows),
      h(
        'div',
        { class: 'foot' },
        'This battle only: the sheet is not changed.',
        h('button', { type: 'button', class: 'sp-btn go', onclick: closeSheet }, 'Done'),
      ),
    );
  }

  function planSheet(kind: 'timer' | 'arrival'): HTMLElement {
    const b = battle();
    const round = b.turn.round;
    const stepper = (get: () => number, set: (v: number) => void, min = 1) =>
      h(
        'div',
        { class: 'sp-step' },
        h('button', { type: 'button', onclick: () => (set(Math.max(min, get() - 1)), renderUI()) }, '−'),
        h('b', {}, String(get())),
        h('button', { type: 'button', onclick: () => (set(get() + 1), renderUI()) }, '+'),
      );
    if (kind === 'timer') {
      if (!timerForm.round) timerForm.round = round + 1;
      const go = () => {
        if (!timerForm.name.trim()) return;
        dispatch({
          type: 'ADD_TIMER',
          timer: {
            name: timerForm.name,
            round: timerForm.round,
            note: timerForm.note || undefined,
            ...(timerForm.groupId ? { lightGroupId: timerForm.groupId, lightOn: timerForm.on } : {}),
          },
        });
        timerForm = { name: '', round: 0, note: '', groupId: '', on: true };
        closeSheet();
      };
      return h(
        'div',
        { class: 'sp-panel sp-sheet', style: 'width:420px' },
        h('h3', {}, 'New timer', h('span', { class: 'sub' }, 'you are asked when it comes due')),
        h(
          'div',
          { style: 'padding:0 16px;display:flex;flex-direction:column;gap:10px' },
          h('input', {
            class: 'sp-text',
            placeholder: 'e.g. Generator restored',
            value: timerForm.name,
            oninput: (ev: Event) => (timerForm.name = (ev.target as HTMLInputElement).value),
          }),
          h(
            'div',
            { class: 'sp-st-row', style: 'margin:0' },
            'Round',
            stepper(
              () => timerForm.round,
              (v) => (timerForm.round = v),
            ),
            h('span', {}, `(now ${round})`),
          ),
          h(
            'div',
            { class: 'sp-st-row', style: 'margin:0' },
            'Then switch',
            h(
              'select',
              {
                class: 'sp-text',
                onchange: (ev: Event) => (timerForm.groupId = (ev.target as HTMLSelectElement).value),
              },
              h('option', { value: '' }, 'no lights'),
              ...b.board.lightGroups.map((g) =>
                h('option', { value: g.id, selected: timerForm.groupId === g.id }, g.name),
              ),
            ),
            h('button', {
              type: 'button',
              class: `sp-toggle${timerForm.on ? ' on' : ''}`,
              title: 'on / off',
              onclick: () => ((timerForm.on = !timerForm.on), renderUI()),
            }),
          ),
          h('input', {
            class: 'sp-text',
            placeholder: 'note (optional)',
            value: timerForm.note,
            oninput: (ev: Event) => (timerForm.note = (ev.target as HTMLInputElement).value),
          }),
        ),
        h(
          'div',
          { class: 'foot' },
          h('button', { type: 'button', class: 'sp-btn', onclick: closeSheet }, 'Cancel'),
          h('button', { type: 'button', class: 'sp-btn go', onclick: go }, 'Add timer'),
        ),
      );
    }
    if (!arrivalForm.round) arrivalForm.round = round + 1;
    const enemies = Object.entries(store.ctx.assets.enemies).sort((a, c) =>
      a[1].name.localeCompare(c[1].name),
    );
    if (!arrivalForm.stem) arrivalForm.stem = enemies[0]?.[0] ?? '';
    const go = () => {
      if (!arrivalForm.stem) return;
      dispatch({
        type: 'ADD_ARRIVAL',
        templateStem: arrivalForm.stem,
        count: arrivalForm.count,
        round: arrivalForm.round,
        note: arrivalForm.note || undefined,
      });
      arrivalForm = { stem: arrivalForm.stem, count: 2, round: 0, note: '' };
      closeSheet();
    };
    return h(
      'div',
      { class: 'sp-panel sp-sheet', style: 'width:420px' },
      h('h3', {}, 'Reinforcements', h('span', { class: 'sub' }, 'you are asked to bring them in')),
      h(
        'div',
        { style: 'padding:0 16px;display:flex;flex-direction:column;gap:10px' },
        h(
          'select',
          {
            class: 'sp-text',
            onchange: (ev: Event) => (arrivalForm.stem = (ev.target as HTMLSelectElement).value),
          },
          ...enemies.map(([stem, e]) =>
            h('option', { value: stem, selected: stem === arrivalForm.stem }, e.name),
          ),
        ),
        h(
          'div',
          { class: 'sp-st-row', style: 'margin:0' },
          'How many',
          stepper(
            () => arrivalForm.count,
            (v) => (arrivalForm.count = v),
          ),
          'Round',
          stepper(
            () => arrivalForm.round,
            (v) => (arrivalForm.round = v),
          ),
        ),
        h('input', {
          class: 'sp-text',
          placeholder: 'where from (optional), e.g. east vent',
          value: arrivalForm.note,
          oninput: (ev: Event) => (arrivalForm.note = (ev.target as HTMLInputElement).value),
        }),
      ),
      h(
        'div',
        { class: 'foot' },
        h('button', { type: 'button', class: 'sp-btn', onclick: closeSheet }, 'Cancel'),
        h('button', { type: 'button', class: 'sp-btn go', onclick: go }, 'Queue'),
      ),
    );
  }

  // ---- Field mode ----
  /** Field ▸ TV: camera angle and post effects for this screen and the TV. */
  function cameraSection(): HTMLElement {
    const look = (who: 'dm' | 'player') => {
      const v = viewOptionsFromPrefs(prefs.all, who);
      const set = (k: 'camera' | 'blur' | 'bloom', val: string) => (
        prefs.set(viewPrefKey(who, k), val),
        renderUI()
      );
      return h(
        'div',
        { style: 'display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12.5px' },
        h('span', { style: 'width:52px;color:var(--ink-2)' }, who === 'dm' ? 'Laptop' : 'TV'),
        h(
          'div',
          { class: 'sp-seg' },
          ...(['tactical', 'top'] as const).map((m) =>
            h(
              'button',
              {
                type: 'button',
                class: v.camera === m ? 'on' : '',
                onclick: () => set('camera', m),
                dataset: { testid: `view-${who}-camera-${m}` },
              },
              m === 'top' ? 'Top-down' : 'Tactical',
            ),
          ),
        ),
        ...(['blur', 'bloom'] as const).map((k) =>
          h(
            'button',
            {
              type: 'button',
              class: `sp-btn tog${v[k] ? ' on' : ''}`,
              onclick: () => set(k, String(!v[k])),
              title: k === 'blur' ? 'Depth-of-field blur at the board edges' : 'Glow around lights',
              dataset: { testid: `view-${who}-${k}` },
            },
            k === 'blur' ? 'Blur' : 'Glow',
          ),
        ),
      );
    };
    const btn = (label: string, title: string, run: () => void) =>
      h('button', { type: 'button', class: 'sp-btn', onclick: run, title }, label);
    return h(
      'div',
      { class: 'sp-fsec' },
      h(
        'h4',
        {},
        'Camera',
        h(
          'span',
          { style: 'display:flex;gap:6px' },
          btn('⟲', 'Turn 90° ([)', () => turnView(prefs, -1)),
          btn('⟳', 'Turn 90° (])', () => turnView(prefs, 1)),
          btn('Reset', 'Reset angle and framing (Home)', () => resetView(renderer, prefs)),
        ),
      ),
      look('dm'),
      look('player'),
      h(
        'div',
        { style: 'margin-top:6px;font-size:11.5px;color:var(--ink-3)' },
        "The TV follows the laptop's angle. Right-drag to turn and tilt freely.",
      ),
    );
  }

  function fieldPanel(): HTMLElement {
    const s = session();
    const b = battle();
    const body = h('div', { class: 'scroll' });
    const panel = h('div', { class: 'sp-panel sp-fieldp', dataset: { testid: 'field-panel' } }, body);
    const tab = s.fieldTab;
    const title = FIELD_TABS.find((t) => t.tab === tab)?.label ?? '';
    body.append(
      h(
        'div',
        { class: 'sp-fsec', style: 'padding-bottom:0' },
        h('div', { class: 'sp-lbl' }, `Field · ${title}`),
      ),
    );
    if (tab === 'light') {
      const lvl = vm.ambientLevel ?? 100;
      const slider = h(
        'div',
        { class: 'sp-slider', dataset: { testid: 'ambient-slider' } },
        h('div', { class: 'track' }),
        h('span', { class: 'val', style: `left:${lvl}%` }, `${lvl}%`),
        h('div', { class: 'thumb', style: `left:${lvl}%` }),
      );
      const setFrom = (ev: PointerEvent) => {
        const r = slider.getBoundingClientRect();
        const v = Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * 100);
        dispatch({ type: 'SET_AMBIENT_LEVEL', level: v });
      };
      slider.onpointerdown = (ev) => {
        slider.setPointerCapture(ev.pointerId);
        setFrom(ev);
        slider.onpointermove = (e2) => setFrom(e2);
        slider.onpointerup = () => (slider.onpointermove = null);
      };
      body.append(
        h(
          'div',
          { class: 'sp-fsec' },
          h('h4', {}, 'Ambient light', h('span', { class: 'sp-lbl' }, 'whole board')),
          slider,
          h(
            'div',
            { class: 'sp-scale' },
            h('span', {}, '0% pitch black'),
            h('span', {}, 'dim'),
            h('span', {}, '100% daylight'),
          ),
          h(
            'div',
            { class: 'sp-presets' },
            ...AMBIENT_PRESETS.map(([n, v]) =>
              h(
                'button',
                {
                  type: 'button',
                  class: lvl === v ? 'on' : '',
                  onclick: () => dispatch({ type: 'SET_AMBIENT_LEVEL', level: v }),
                },
                `${n} ${v}`,
              ),
            ),
          ),
          h(
            'div',
            {
              style:
                'display:flex;align-items:center;justify-content:space-between;margin-top:12px;font-size:12px;color:var(--ink-2)',
            },
            'DM reveal · I can see into the dark',
            h('button', {
              type: 'button',
              class: `sp-toggle${b.board.dmReveal ? ' on' : ''}`,
              onclick: () => dispatch({ type: 'SET_DM_REVEAL', on: !b.board.dmReveal }),
            }),
          ),
        ),
        h(
          'div',
          { class: 'sp-fsec', style: 'padding-bottom:0' },
          h('h4', {}, 'Lights on the board', h('span', { class: 'sp-lbl' }, String(b.board.lights.length))),
        ),
      );
      const lightRow = (l: (typeof b.board.lights)[number], child: boolean) => {
        const sel = s.selectedLightId === l.id;
        const where = l.attachedTo
          ? `carried by ${(() => {
              const u = unitById(b, l.attachedTo ?? '');
              return u ? unitName(u) : '?';
            })()}`
          : l.at
            ? `${String.fromCharCode(65 + l.at.c)}${l.at.r + 1}`
            : '';
        return h(
          'div',
          {
            class: `sp-lrow${child ? ' child' : ''}${sel ? ' sel' : ''}${l.on ? '' : ' off'}`,
            onclick: () => store.dispatchSession({ type: 'selectLight', id: sel ? null : l.id }),
            dataset: { testid: `light-${l.id}` },
          },
          h('span', {
            class: 'bulb',
            style: l.on
              ? `background:${l.color};box-shadow:0 0 10px ${l.color}`
              : `box-shadow:inset 0 0 0 1.5px ${l.color}`,
          }),
          h(
            'div',
            {},
            h('div', { class: 'n' }, l.name),
            h('div', { class: 's' }, `${where} · bright ${l.brightRadius} · dim ${l.dimRadius}`),
          ),
          h('span', { class: 'r' }, l.flicker ? 'flicker' : ''),
          h('button', {
            type: 'button',
            class: `sp-toggle${l.on ? ' on' : ''}`,
            onclick: (ev: MouseEvent) => {
              ev.stopPropagation();
              dispatch({ type: 'TOGGLE_LIGHT', lightId: l.id });
            },
          }),
        );
      };
      for (const g of b.board.lightGroups) {
        body.append(
          h(
            'div',
            { class: 'sp-lrow grp' },
            h('span'),
            h('div', {}, h('div', { class: 'n' }, g.name)),
            h('span', { class: 'r' }, 'group'),
            h('button', {
              type: 'button',
              class: `sp-toggle${g.on ? ' on' : ''}`,
              onclick: () => dispatch({ type: 'TOGGLE_LIGHT_GROUP', groupId: g.id }),
            }),
          ),
          ...b.board.lights.filter((l) => l.groupId === g.id).map((l) => lightRow(l, true)),
        );
      }
      body.append(
        ...b.board.lights
          .filter((l) => !l.groupId || !b.board.lightGroups.some((g) => g.id === l.groupId))
          .map((l) => lightRow(l, false)),
      );
      const selLight = b.board.lights.find((l) => l.id === s.selectedLightId);
      if (selLight) {
        const id = selLight.id;
        const radius = (key: 'brightRadius' | 'dimRadius') =>
          h(
            'div',
            { class: 'sp-step' },
            h(
              'button',
              {
                type: 'button',
                onclick: () =>
                  dispatch({
                    type: 'UPDATE_LIGHT',
                    lightId: id,
                    patch: { [key]: Math.max(0, selLight[key] - 1) },
                  }),
              },
              '−',
            ),
            h('b', {}, String(selLight[key])),
            h(
              'button',
              {
                type: 'button',
                onclick: () =>
                  dispatch({ type: 'UPDATE_LIGHT', lightId: id, patch: { [key]: selLight[key] + 1 } }),
              },
              '+',
            ),
          );
        const name = h('input', { class: 'sp-text', value: selLight.name, style: 'flex:1' });
        name.onchange = () =>
          dispatch({
            type: 'UPDATE_LIGHT',
            lightId: id,
            patch: { name: name.value.trim() || selLight.name },
          });
        body.append(
          h(
            'div',
            { class: 'sp-edit' },
            h('div', { class: 'sp-lbl' }, `${selLight.name} · selected on board`),
            h('div', { class: 'row' }, 'Name', name),
            h(
              'div',
              { class: 'row' },
              'Colour',
              h(
                'div',
                { class: 'sp-sw' },
                ...LIGHT_COLORS.map((c) =>
                  h('button', {
                    type: 'button',
                    class: selLight.color === c ? 'on' : '',
                    style: `background:${c}`,
                    onclick: () => dispatch({ type: 'UPDATE_LIGHT', lightId: id, patch: { color: c } }),
                  }),
                ),
              ),
            ),
            h(
              'div',
              { class: 'row' },
              'Bright / dim radius',
              h('span', { style: 'display:flex;gap:8px' }, radius('brightRadius'), radius('dimRadius')),
            ),
            h(
              'div',
              { class: 'row' },
              'Flicker',
              h('button', {
                type: 'button',
                class: `sp-toggle${selLight.flicker ? ' on' : ''}`,
                onclick: () =>
                  dispatch({ type: 'UPDATE_LIGHT', lightId: id, patch: { flicker: !selLight.flicker } }),
              }),
            ),
            h(
              'div',
              { class: 'row' },
              'Group',
              h(
                'select',
                {
                  class: 'sp-text',
                  onchange: (ev: Event) =>
                    dispatch({
                      type: 'UPDATE_LIGHT',
                      lightId: id,
                      patch: { groupId: (ev.target as HTMLSelectElement).value || undefined },
                    }),
                },
                h('option', { value: '' }, 'none'),
                ...b.board.lightGroups.map((g) =>
                  h('option', { value: g.id, selected: selLight.groupId === g.id }, g.name),
                ),
              ),
            ),
            h(
              'div',
              { class: 'row' },
              h('span'),
              h(
                'button',
                {
                  type: 'button',
                  class: 'sp-btn danger',
                  onclick: () => dispatch({ type: 'REMOVE_LIGHT', lightId: id }),
                },
                'Delete light',
              ),
            ),
          ),
        );
      }
      body.append(
        h(
          'div',
          { class: 'sp-fbtns' },
          h(
            'button',
            {
              type: 'button',
              class: `sp-btn${s.mode.kind === 'placeLight' ? ' go' : ''}`,
              onclick: () =>
                store.dispatchSession(
                  s.mode.kind === 'placeLight'
                    ? { type: 'cancelMode' }
                    : { type: 'setMode', mode: { kind: 'placeLight' } },
                ),
              dataset: { testid: 'place-light' },
            },
            icon('lamp'),
            'Place light',
          ),
          h(
            'button',
            {
              type: 'button',
              class: `sp-btn${s.mode.kind === 'attachLight' ? ' go' : ''}`,
              disabled: !selLight,
              onclick: () =>
                selLight &&
                store.dispatchSession({
                  type: 'setMode',
                  mode: { kind: 'attachLight', lightId: selLight.id },
                }),
            },
            icon('spawn'),
            'Attach to creature',
          ),
        ),
        h(
          'div',
          { class: 'sp-fsec' },
          h(
            'button',
            {
              type: 'button',
              class: 'sp-btn',
              onclick: () => {
                const name = `Group ${b.board.lightGroups.length + 1}`;
                dispatch({
                  type: 'SET_LIGHT_GROUP',
                  group: { id: `g${Date.now().toString(36)}`, name, on: true },
                });
              },
            },
            '+ New light group',
          ),
        ),
      );
    } else if (tab === 'height') {
      const elev = (delta: number, label: string) =>
        h(
          'button',
          {
            type: 'button',
            class: `sp-btn${s.mode.kind === 'elevation' && s.mode.delta === delta ? ' go' : ''}`,
            onclick: () =>
              store.dispatchSession(
                s.mode.kind === 'elevation' && s.mode.delta === delta
                  ? { type: 'cancelMode' }
                  : { type: 'setMode', mode: { kind: 'elevation', delta } },
              ),
          },
          label,
        );
      body.append(
        h(
          'div',
          { class: 'sp-fsec' },
          h('h4', {}, 'Height brush'),
          h(
            'div',
            { style: 'display:flex;gap:8px' },
            elev(1, 'Raise +5 ft'),
            elev(-1, 'Lower −5 ft'),
            elev(0, 'Flatten'),
          ),
          h(
            'p',
            { style: 'color:var(--ink-3);font-size:12px' },
            'Click tiles to paint. Or hover any tile and press + / −. Heights show on the board while Field mode is open.',
          ),
        ),
      );
      const sel = selected();
      if (sel) {
        const alt = vm.units.find((x) => x.id === sel.id)?.altitude ?? 0;
        body.append(
          h(
            'div',
            { class: 'sp-fsec' },
            h('h4', {}, `Flying · ${unitName(sel)}`),
            h(
              'div',
              { class: 'sp-st-row', style: 'margin:0' },
              'Altitude',
              h(
                'div',
                { class: 'sp-step' },
                h(
                  'button',
                  {
                    type: 'button',
                    onclick: () =>
                      dispatch({ type: 'SET_ALTITUDE', unitId: sel.id, altitude: Math.max(0, alt - 1) }),
                  },
                  '−',
                ),
                h('b', {}, `${alt * 5} ft`),
                h(
                  'button',
                  {
                    type: 'button',
                    onclick: () => dispatch({ type: 'SET_ALTITUDE', unitId: sel.id, altitude: alt + 1 }),
                  },
                  '+',
                ),
              ),
            ),
          ),
        );
      } else
        body.append(
          h(
            'div',
            { class: 'sp-fsec', style: 'color:var(--ink-3);font-size:12px' },
            'Select a creature to set how high it flies.',
          ),
        );
    } else if (tab === 'spawn' || tab === 'terrain') {
      const bundle = deps.getBundle();
      const onField = new Set(
        b.units.filter((u) => u.kind === 'entity').map((u) => (u.kind === 'entity' ? u.sheet.name : '')),
      );
      const place = (key: string) => {
        const m = s.mode;
        store.dispatchSession(
          m.kind === 'placeObject' && m.key === key
            ? { type: 'cancelMode' }
            : { type: 'setMode', mode: { kind: 'placeObject', key } },
        );
      };
      const opt = (key: string, name: string, color: string, sub: string, tag: string) =>
        h(
          'button',
          {
            type: 'button',
            class: `sp-opt${s.mode.kind === 'placeObject' && s.mode.key === key ? ' on' : ''}`,
            onclick: () => place(key),
            dataset: { testid: `spawn-${key}` },
          },
          h('span', {
            style: `width:14px;height:14px;border-radius:4px;margin-left:8px;background:${color}`,
          }),
          h('div', {}, h('div', { class: 'nm' }, name), h('div', { class: 'sub' }, sub)),
          h('span', { class: 'tag' }, tag),
        );
      const list = h('div', { class: 'sp-list' });
      if (tab === 'spawn') {
        const party = Object.values(bundle.party).filter(
          (cs) => cs.isParty && !onField.has(cs.name) && !cs.dead,
        );
        if (party.length)
          list.append(
            h('div', { class: 'sp-fx-grp' }, 'Party'),
            ...party.map((cs) =>
              opt(`party:${cs.name}`, cs.name, cs.color, cs.characterClass, `${cs.currentHP}/${cs.totalHP}`),
            ),
          );
        list.append(
          h('div', { class: 'sp-fx-grp' }, 'Enemies · click, then click tiles'),
          ...Object.entries(bundle.enemies)
            .sort((a, c) => a[1].name.localeCompare(c[1].name))
            .map(([stem, e]) =>
              opt(
                `enemy:${stem}`,
                e.name,
                e.color,
                `AC ${e.armorClass} · MOB ${e.mobility} · DEX ${e.dexterity}`,
                `HP ${e.maxHealth}`,
              ),
            ),
          h('div', { class: 'sp-fx-grp' }, 'Pickups'),
          ...Object.values(bundle.weapons).map((w) =>
            opt(`pickup:weapon:${w.name}`, w.name, w.color, w.damageDice.filter(Boolean).join(' / '), 'WPN'),
          ),
          ...Object.values(bundle.consumables).map((cn) =>
            opt(`pickup:consumable:${cn.name}`, cn.name, cn.color, `heals ${cn.healAmount}`, 'USE'),
          ),
          ...Object.values(bundle.accessories).map((a) =>
            opt(`pickup:accessory:${a.name}`, a.name, a.color, `DEF ${a.defense}`, 'ACC'),
          ),
        );
        body.append(
          h(
            'div',
            { class: 'sp-fsec', style: 'padding-bottom:4px;display:flex;gap:8px' },
            h(
              'button',
              { type: 'button', class: 'sp-btn', onclick: () => ((sheet = { kind: 'arrival' }), renderUI()) },
              '+ Queue reinforcements',
            ),
          ),
        );
      } else {
        list.append(
          ...bundle.terrain.map((t) =>
            opt(
              `terrain:${t.type}`,
              t.type,
              t.color,
              t.collision ? 'blocks movement' : 'walkable',
              `HP ${t.health}`,
            ),
          ),
        );
      }
      body.append(list);
    } else if (tab === 'board') {
      body.append(
        h(
          'div',
          { class: 'sp-fsec' },
          h('h4', {}, 'Board theme'),
          h(
            'div',
            { style: 'display:flex;flex-wrap:wrap;gap:6px' },
            ...BOARD_THEMES.map((t) =>
              h(
                'button',
                {
                  type: 'button',
                  class: `sp-btn${b.board.theme === t.id ? ' go' : ''}`,
                  onclick: () => dispatch({ type: 'SET_THEME', theme: t.id }),
                },
                t.label.replace(/ \(.*\)$/, ''),
              ),
            ),
          ),
        ),
        h(
          'div',
          { class: 'sp-fsec' },
          h('h4', {}, 'This battle'),
          h(
            'div',
            { style: 'display:flex;flex-wrap:wrap;gap:6px' },
            h(
              'button',
              {
                type: 'button',
                class: 'sp-btn',
                onclick: () => ((saveName = ''), (sheet = { kind: 'save' }), renderUI()),
              },
              'Save…',
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'sp-btn',
                onclick: () =>
                  void deps.listBattles().then((names) => ((sheet = { kind: 'load', names }), renderUI())),
              },
              'Load…',
            ),
            h('button', { type: 'button', class: 'sp-btn', onclick: downloadJson }, 'Download JSON'),
            h('button', { type: 'button', class: 'sp-btn', onclick: uploadJson }, 'Upload JSON'),
          ),
          h(
            'div',
            {
              style:
                'display:flex;align-items:center;justify-content:space-between;margin-top:12px;font-size:12px;color:var(--ink-2)',
            },
            'Do not write party sheets',
            h('button', {
              type: 'button',
              class: `sp-toggle${deps.persisterReadOnly.get() ? ' on' : ''}`,
              onclick: () => (deps.persisterReadOnly.set(!deps.persisterReadOnly.get()), renderUI()),
            }),
          ),
        ),
        h(
          'div',
          { class: 'sp-fsec', style: 'color:var(--ink-3);font-size:12px' },
          'Reshaping the board mid-battle is not built yet.',
        ),
      );
    } else if (tab === 'tv') {
      const d = prefs.display;
      const tog = (
        label: string,
        key:
          | 'partyHpNumbers'
          | 'combatNumbers'
          | 'statusText'
          | 'enemyInitiativeRolls'
          | 'enemyNames'
          | 'turnStrip'
          | 'spellTemplates',
      ) =>
        h(
          'div',
          {
            style:
              'display:flex;align-items:center;justify-content:space-between;padding:6px 0;font-size:12.5px',
          },
          label,
          h('button', {
            type: 'button',
            class: `sp-toggle${d[key] ? ' on' : ''}`,
            onclick: () => (prefs.setDisplay({ [key]: !d[key] }), renderUI()),
          }),
        );
      body.append(
        h(
          'div',
          { class: 'sp-fsec' },
          h(
            'h4',
            {},
            'Player window',
            h(
              'button',
              { type: 'button', class: 'sp-btn', onclick: openTv },
              icon('tv'),
              tvWin && !tvWin.closed ? 'Focus' : 'Open',
            ),
          ),
          h('div', { class: 'sp-lbl', style: 'margin:8px 0 6px' }, 'Enemy health'),
          h(
            'div',
            { class: 'sp-seg', style: 'width:max-content' },
            ...(['EXACT', 'VAGUE', 'HIDDEN'] as const).map((v) =>
              h(
                'button',
                {
                  type: 'button',
                  class: d.enemyHp === v ? 'on' : '',
                  onclick: () => (prefs.setDisplay({ enemyHp: v }), renderUI()),
                },
                v[0] + v.slice(1).toLowerCase(),
              ),
            ),
          ),
          h(
            'div',
            { style: 'margin-top:10px' },
            tog('Enemy names', 'enemyNames'),
            tog('Party HP numbers', 'partyHpNumbers'),
            tog('Damage & healing numbers', 'combatNumbers'),
            tog('Status names in floating text', 'statusText'),
            tog('Enemy initiative rolls', 'enemyInitiativeRolls'),
            tog('Turn order rail', 'turnStrip'),
            tog('Area spell templates while aiming', 'spellTemplates'),
          ),
        ),
        cameraSection(),
      );
    } else if (tab === 'history') {
      const past = store.history.past;
      body.append(
        h(
          'div',
          { class: 'sp-fsec' },
          h(
            'div',
            { style: 'display:flex;gap:8px' },
            h(
              'button',
              { type: 'button', class: 'sp-btn', disabled: !store.history.undo, onclick: undo },
              icon('undo'),
              'Undo',
            ),
            h(
              'button',
              { type: 'button', class: 'sp-btn', disabled: !store.history.redo, onclick: redo },
              icon('redo'),
              'Redo',
            ),
          ),
        ),
        h(
          'div',
          { class: 'sp-list' },
          past.length === 0 ? h('div', { style: 'padding:8px;color:var(--ink-3)' }, 'Nothing yet.') : null,
          ...[...past]
            .reverse()
            .slice(0, 40)
            .map((e, i) =>
              h(
                'div',
                { class: 'sp-hist' },
                h('span', {}, e.label),
                h('span', { class: 'n' }, i === 0 ? 'last' : `${i + 1} back`),
              ),
            ),
        ),
      );
    }
    return panel;
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
        const { parseBattle } = await import('../../engine/serialize.ts');
        store.replace(parseBattle(await f.text()));
      } catch (err) {
        toast({ text: 'Upload failed', sub: String(err) });
      }
    };
    inp.click();
  }

  function toastStack(): HTMLElement[] {
    return toasts.map((t, i) =>
      h(
        'div',
        { class: 'sp-panel sp-toast', style: `top:${80 + i * 58}px`, dataset: { testid: 'toast' } },
        h('div', { class: 'msg' }, t.text, t.sub ? h('span', {}, ` · ${t.sub}`) : null),
        ...(t.actions ?? []).map((a) =>
          h(
            'button',
            {
              type: 'button',
              class: `sp-btn${a.go ? ' go' : ''}`,
              onclick: () => (dropToast(t.id), a.run()),
            },
            a.label,
          ),
        ),
      ),
    );
  }

  // ---- render ----
  function renderUI(): void {
    const s = session();
    const b = battle();
    sp.classList.toggle('field', s.fieldMode);
    sp.classList.toggle('peek', s.peek);
    const parts: (HTMLElement | null)[] = [roundPill(), topRight(), dock()];
    if (s.fieldMode) {
      parts.push(fieldPanel());
      parts.push(
        h(
          'div',
          { class: 'sp-panel sp-fieldbanner' },
          h('span', { class: 'dotp' }),
          'Field mode',
          h(
            'span',
            {},
            s.mode.kind === 'placeLight'
              ? '· click a tile to place the light'
              : s.mode.kind === 'attachLight'
                ? '· click the creature that carries it'
                : s.mode.kind === 'placeObject'
                  ? '· click tiles to place · Esc to stop'
                  : s.mode.kind === 'elevation'
                    ? '· click tiles to paint height'
                    : '· edits apply live · players see them as you make them',
          ),
          h('span', { class: 'sp-k' }, 'G'),
          'exit',
        ),
      );
    } else
      parts.push(
        renderEffectsPanel(vm, s.effectsOpen, {
          select: (id) => select(id),
          end: endEffect,
          toggle: () => store.dispatchSession({ type: 'effects', open: !session().effectsOpen }),
          addTimer: () => ((sheet = { kind: 'timer' }), renderUI()),
          addArrival: () => ((sheet = { kind: 'arrival' }), renderUI()),
        }),
      );
    const sh = sheetPanel();
    if (sh) parts.push(sh);
    else if (vm.roll && b.pending && b.pending.kind !== 'initiativeEntry' && b.pending.kind !== 'tieOrder')
      parts.push(
        renderRollPanel(vm.roll, library, {
          submit: submitRoll,
          cancel: () => dispatch({ type: 'CANCEL_PENDING' }),
          autoFill: () => {
            const p = battle().pending;
            if (p?.kind === 'areaD20s')
              dispatch({
                type: 'AUTO_FILL_AREA_ROLLS',
                d20s: p.flow.targetIds.map((_, i) => Number(draft().areaD20s[i] ?? '') || 0),
              });
          },
        }),
      );
    parts.push(actionBar(), popover());
    parts.push(
      renderTurnRail(vm, library, {
        select: (id) => select(id),
        reorder: (id, toIndex) => dispatch({ type: 'REORDER_TURN', unitId: id, toIndex }),
        delay: (id) => dispatch({ type: 'DELAY_TURN', unitId: id }),
        rejoin: (id, index) => dispatch({ type: 'RETURN_FROM_HOLD', unitId: id, index }),
      }),
    );
    parts.push(menu(), ctxPanel(), ...toastStack());
    replaceChildren(ui, ...parts);
    debug.render(s.debugOpen);
  }

  function renderBoard(): void {
    const b = battle();
    vm = buildBoardViewModel(b, session(), store.ctx.assets, computeLighting(b));
    renderer.render(vm);
    decor.setVM(vm);
  }

  // ---- events from the engine ----
  function handleEvents(events: BattleEvent[], prev: BattleState): void {
    const b = battle();
    for (const ev of events) {
      if (ev.type === 'floatText')
        renderer.addFloatingText({ text: ev.text, color: ev.color, unitId: ev.unitId, cell: ev.cell });
      else if (ev.type === 'alert') toast({ text: ev.title, sub: ev.message });
      else if (ev.type === 'statusExpired') {
        const u = combatantById(b, ev.unitId);
        toast({ text: `${ev.name} wore off`, sub: u ? unitName(u) : undefined });
      } else if (ev.type === 'turnChanged' && ev.unitId) {
        // the acting creature is selected and framed, so the DM can act at once
        store.dispatchSession({ type: 'select', id: ev.unitId });
        renderer.frameUnits?.([ev.unitId], clearRect(false));
        if (ev.round !== prev.turn.round) promptDue(ev.round);
      }
    }
    // a roll just opened: bring attacker and target clear of the roll panel
    if (!prev.pending && b.pending && 'flow' in b.pending) {
      const f = b.pending.flow;
      const ids =
        f.flow === 'attack'
          ? [f.attackerId, f.targetId]
          : f.flow === 'spell'
            ? [f.casterId, f.targetId]
            : [f.casterId, ...f.targetIds];
      renderer.frameUnits?.(ids, clearRect(true));
    }
    if (b.pending?.kind === 'initiativeEntry' && prev.pending?.kind !== 'initiativeEntry') {
      initDraft = {};
      initCursor = 0;
    }
  }

  /** Arrivals and timers whose round has come: ask the DM what to do. */
  function promptDue(round: number): void {
    const b = battle();
    for (const a of b.turn.arrivals ?? []) {
      if (a.round > round || prompted.has(a.id)) continue;
      prompted.add(a.id);
      const name = store.ctx.assets.enemies[a.templateStem]?.name ?? a.templateStem;
      toast({
        text: `${name} ×${a.count} arrive`,
        sub: a.note ?? `round ${a.round}`,
        actions: [
          {
            label: 'Bring them in',
            go: true,
            run: () => {
              dispatch({ type: 'REMOVE_ARRIVAL', id: a.id });
              store.dispatchSession({
                type: 'setMode',
                mode: {
                  kind: 'placeObject',
                  key: `enemy:${a.templateStem}`,
                  remaining: a.count,
                  arrivalId: a.id,
                },
              });
              toast({ text: `Place ${a.count}× ${name}`, sub: 'click tiles' });
            },
          },
          { label: 'Later', run: () => undefined },
          { label: 'Cancel them', run: () => dispatch({ type: 'REMOVE_ARRIVAL', id: a.id }) },
        ],
      });
    }
    for (const t of b.turn.timers ?? []) {
      if (t.round > round || prompted.has(t.id)) continue;
      prompted.add(t.id);
      const group = t.lightGroupId ? b.board.lightGroups.find((g) => g.id === t.lightGroupId) : undefined;
      toast({
        text: t.name,
        sub: t.note ?? `round ${t.round}`,
        actions: group
          ? [
              {
                label: `${t.lightOn === false ? 'Switch off' : 'Switch on'} ${group.name}`,
                go: true,
                run: () => {
                  dispatch({ type: 'TOGGLE_LIGHT_GROUP', groupId: group.id, on: t.lightOn !== false });
                  dispatch({ type: 'REMOVE_TIMER', id: t.id });
                },
              },
              { label: 'Dismiss', run: () => dispatch({ type: 'REMOVE_TIMER', id: t.id }) },
            ]
          : [{ label: 'Done', go: true, run: () => dispatch({ type: 'REMOVE_TIMER', id: t.id }) }],
      });
    }
  }

  let lastSession = store.session;
  let lastBattle = store.battle;
  const unsub = store.subscribe((doc, events, source) => {
    const prevSession = lastSession;
    const prevBattle = lastBattle;
    lastSession = doc.session;
    lastBattle = doc.battle;
    if (
      source === 'session' &&
      prevSession.hover !== doc.session.hover &&
      onlyHoverChanged(prevSession, doc.session)
    ) {
      renderBoard();
      return;
    }
    if (
      source === 'session' &&
      prevSession.peek !== doc.session.peek &&
      onlyPeekChanged(prevSession, doc.session)
    ) {
      sp.classList.toggle('peek', doc.session.peek);
      return;
    }
    renderBoard();
    handleEvents(events, prevBattle);
    renderUI();
    const m = doc.session.mode;
    if (m.kind === 'cast' && m.lockedCells && !doc.battle.pending)
      store.dispatchSession({ type: 'cancelMode' });
  });
  const unsubHistory = store.onHistory(() => renderUI());
  const unsubLib = library?.onChange(() => renderUI()) ?? (() => undefined);
  function onlyHoverChanged(a: typeof lastSession, c: typeof lastSession): boolean {
    return JSON.stringify({ ...a, hover: null }) === JSON.stringify({ ...c, hover: null });
  }
  function onlyPeekChanged(a: typeof lastSession, c: typeof lastSession): boolean {
    return JSON.stringify({ ...a, peek: false }) === JSON.stringify({ ...c, peek: false });
  }

  // start-up: select whoever is acting
  const b0 = battle();
  if (b0.turn.started && !session().selectedId)
    store.dispatchSession({ type: 'select', id: b0.turn.order[b0.turn.currentIndex] ?? null });
  renderBoard();
  renderUI();

  return () => {
    unsub();
    unsubHistory();
    unsubLib();
    unsubDraw();
    unsubPrefs();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    debug.destroy();
    decor.destroy();
    victoryEl?.remove();
    renderer.destroy();
  };
}
