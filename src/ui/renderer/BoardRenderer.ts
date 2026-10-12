/**
 * The renderer contract. Phase 2 ships a throwaway Canvas2D implementation;
 * Phase 4 replaces it with the chosen direction (PixiJS/three.js) without
 * touching the engine or the panels.
 */
import type { Cell } from '../../engine/types.ts';
import type { BoardVM } from '../../engine/view/boardViewModel.ts';
import type { ViewOptions } from './three/constants.ts';
import type { SpriteLibrary } from '../sprites/library.ts';

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

/** Screen positions (board-container pixels) for pinning DOM decorations to tokens and tiles. */
export interface BoardProjector {
  unit(id: string): {
    head: { x: number; y: number };
    feet: { x: number; y: number };
    ground: { x: number; y: number };
  } | null;
  /** centre of a tile's top face, raised `lift` world units */
  cell(r: number, c: number, lift?: number): { x: number; y: number };
  /** any board position at an absolute world height (flat rings) */
  point(r: number, c: number, y: number): { x: number; y: number };
  /** world height of a tile's top face */
  topY(r: number, c: number): number;
  width: number;
  height: number;
}

/** 'classic' draws HP numbers and height chips on the board; 'spotlight' leaves those to the DOM UI. */
export type OverlayStyle = 'classic' | 'spotlight';

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
  /** Spotlight UI hooks (optional: renderers without them simply do not decorate). */
  setOverlayStyle?(style: OverlayStyle): void;
  /** Called after every frame that drew, with fresh screen positions. */
  onDraw?(fn: (p: BoardProjector) => void): () => void;
  /** Ease the camera so these units sit inside `clear` (container pixels), e.g. clear of the roll panel. */
  frameUnits?(
    ids: readonly string[],
    clear: { left: number; top: number; right: number; bottom: number },
  ): void;
  /** The sprite store the board draws from (portraits reuse it). */
  readonly library?: SpriteLibrary;
}
