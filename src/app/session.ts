/** DM-window UI state that is not battle state: selection, modes, hover, panels. */
import type { Cell, UnitId } from '../engine/types.ts';
import type { Mode } from '../engine/view/boardViewModel.ts';
import { emptyDraft, type RollDraft } from '../engine/view/rollPreview.ts';

export type FieldTab = 'light' | 'height' | 'spawn' | 'terrain' | 'board' | 'tv' | 'history';
/** A small editor anchored to a creature: Status palette (S) or the ±HP entry (H). */
export type Popover = { kind: 'status' | 'hp'; unitId: UnitId } | null;

export interface SessionState {
  selectedId: UnitId | null;
  mode: Mode;
  hover: Cell | null;
  debugOpen: boolean;
  /** digits typed into the roll panel, not yet submitted (published live to the TV) */
  rollDraft: RollDraft;
  /** Field mode (G): edit lights / height / spawns while the fight is dimmed */
  fieldMode: boolean;
  fieldTab: FieldTab;
  selectedLightId: string | null;
  /** the Active effects panel is expanded */
  effectsOpen: boolean;
  /** hold-Alt peek: the roll panel fades and lets clicks through */
  peek: boolean;
  popover: Popover;
}

export const initialSession = (): SessionState => ({
  selectedId: null,
  mode: { kind: 'none' },
  hover: null,
  debugOpen: false,
  rollDraft: emptyDraft(),
  fieldMode: false,
  fieldTab: 'light',
  selectedLightId: null,
  effectsOpen: true,
  peek: false,
  popover: null,
});

export type SessionAction =
  | { type: 'select'; id: UnitId | null }
  | { type: 'setMode'; mode: Mode }
  | { type: 'cancelMode' }
  | { type: 'hover'; cell: Cell | null }
  | { type: 'debug'; open: boolean }
  | { type: 'lockArea'; cells: Cell[] | null }
  | { type: 'draft'; draft: Partial<RollDraft> }
  | { type: 'field'; open: boolean; tab?: FieldTab }
  | { type: 'selectLight'; id: string | null }
  | { type: 'effects'; open: boolean }
  | { type: 'peek'; on: boolean }
  | { type: 'popover'; popover: Popover };

export function reduceSession(s: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case 'select':
      return { ...s, selectedId: a.id, mode: { kind: 'none' } };
    case 'setMode':
      return { ...s, mode: a.mode };
    case 'cancelMode':
      return { ...s, mode: { kind: 'none' } };
    case 'hover':
      return s.hover?.r === a.cell?.r && s.hover?.c === a.cell?.c ? s : { ...s, hover: a.cell };
    case 'debug':
      return { ...s, debugOpen: a.open };
    case 'lockArea':
      return s.mode.kind === 'cast' ? { ...s, mode: { ...s.mode, lockedCells: a.cells ?? undefined } } : s;
    case 'draft':
      return { ...s, rollDraft: { ...s.rollDraft, ...a.draft } };
    case 'field':
      return {
        ...s,
        fieldMode: a.open,
        fieldTab: a.tab ?? s.fieldTab,
        // leaving Field mode drops its tools
        mode:
          !a.open &&
          (s.mode.kind === 'placeLight' || s.mode.kind === 'attachLight' || s.mode.kind === 'elevation')
            ? { kind: 'none' }
            : s.mode,
        selectedLightId: a.open ? s.selectedLightId : null,
      };
    case 'selectLight':
      return { ...s, selectedLightId: a.id };
    case 'effects':
      return { ...s, effectsOpen: a.open };
    case 'peek':
      return s.peek === a.on ? s : { ...s, peek: a.on };
    case 'popover':
      return { ...s, popover: a.popover };
  }
}
