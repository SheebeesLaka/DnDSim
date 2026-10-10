/** DM-window UI state that is not battle state: selection, modes, hover, panels. */
import type { Cell, UnitId } from '../engine/types.ts';
import type { Mode } from '../engine/view/boardViewModel.ts';

export interface SessionState {
  selectedId: UnitId | null;
  mode: Mode;
  hover: Cell | null;
  tab: 'battle' | 'manage';
  drawerOpen: boolean;
  drawerCategory: 'party' | 'enemies' | 'terrain' | 'pickups' | 'elevation';
  debugOpen: boolean;
  /** info popup pinned by right-click */
  pinnedId: UnitId | null;
}

export const initialSession = (): SessionState => ({
  selectedId: null,
  mode: { kind: 'none' },
  hover: null,
  tab: 'battle',
  drawerOpen: false,
  drawerCategory: 'party',
  debugOpen: false,
  pinnedId: null,
});

export type SessionAction =
  | { type: 'select'; id: UnitId | null }
  | { type: 'setMode'; mode: Mode }
  | { type: 'cancelMode' }
  | { type: 'hover'; cell: Cell | null }
  | { type: 'tab'; tab: SessionState['tab'] }
  | { type: 'drawer'; open: boolean; category?: SessionState['drawerCategory'] }
  | { type: 'debug'; open: boolean }
  | { type: 'pin'; id: UnitId | null }
  | { type: 'lockArea'; cells: Cell[] | null };

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
    case 'tab':
      return { ...s, tab: a.tab };
    case 'drawer':
      return {
        ...s,
        drawerOpen: a.open,
        drawerCategory: a.category ?? s.drawerCategory,
        mode: a.open
          ? s.mode
          : s.mode.kind === 'placeObject' || s.mode.kind === 'elevation'
            ? { kind: 'none' }
            : s.mode,
      };
    case 'debug':
      return { ...s, debugOpen: a.open };
    case 'pin':
      return { ...s, pinnedId: a.id };
    case 'lockArea':
      return s.mode.kind === 'cast' ? { ...s, mode: { ...s.mode, lockedCells: a.cells ?? undefined } } : s;
  }
}
