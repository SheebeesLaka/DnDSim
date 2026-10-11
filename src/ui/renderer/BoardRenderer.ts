/**
 * The renderer contract. Phase 2 ships a throwaway Canvas2D implementation;
 * Phase 4 replaces it with the chosen direction (PixiJS/three.js) without
 * touching the engine or the panels.
 */
import type { Cell } from '../../engine/types.ts';
import type { BoardVM } from '../../engine/view/boardViewModel.ts';
import type { ViewOptions } from './three/constants.ts';

export type { ViewOptions };

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
  /** A right-drag orbit ended: the camera's new heading and tilt, in degrees. */
  onCameraSettled?: (angles: { yaw: number; pitch: number }) => void;
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
  /** Camera mode and post-processing toggles (renderers without them ignore the call). */
  getViewOptions?(): ViewOptions;
  setViewOptions?(patch: Partial<ViewOptions>): void;
  /** Whole-step zoom (renderers without it have no zoom slider). */
  getZoom?(): { level: number; min: number; max: number };
  setZoom?(level: number): void;
  onZoomChange?(fn: (level: number) => void): () => void;
}
