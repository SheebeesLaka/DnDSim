/**
 * The renderer contract. Phase 2 ships a throwaway Canvas2D implementation;
 * Phase 4 replaces it with the chosen direction (PixiJS/three.js) without
 * touching the engine or the panels.
 */
import type { Cell } from '../../engine/types.ts';
import type { BoardVM } from '../../engine/view/boardViewModel.ts';

export interface FloatingText {
  text: string;
  color: string;
  /** anchored to a unit (follows it) or to a cell */
  unitId?: string;
  cell?: Cell;
}

export interface BoardPointerEvent {
  cell: Cell | null;
  button: 0 | 2;
  clientX: number;
  clientY: number;
}

export interface BoardRendererHandlers {
  onClick?: (ev: BoardPointerEvent) => void;
  onHover?: (cell: Cell | null) => void;
  onContextMenu?: (ev: BoardPointerEvent) => void;
}

export interface BoardRenderer {
  mount(container: HTMLElement, handlers: BoardRendererHandlers): void;
  render(vm: BoardVM): void;
  hitTest(clientX: number, clientY: number): Cell | null;
  /** Client-space centre of a cell (tooltips, tests). */
  cellCenter(cell: Cell): { x: number; y: number };
  addFloatingText(ft: FloatingText): void;
  resetCamera(): void;
  destroy(): void;
}
