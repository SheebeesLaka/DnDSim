/**
 * Choose the board renderer: the HD-2D three.js board, or the plain Canvas2D
 * board from Phase 2 when WebGL is unavailable or `?renderer=2d` is set.
 */
import type { BoardRenderer } from './BoardRenderer.ts';
import { Canvas2DRenderer } from './canvas2d.ts';
import { ThreeRenderer, type ThreeRendererOptions } from './three/ThreeRenderer.ts';

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function pickRenderer(params: URLSearchParams, opts: ThreeRendererOptions): BoardRenderer {
  if (params.get('renderer') === '2d' || !webglAvailable()) return new Canvas2DRenderer();
  return new ThreeRenderer({ ...opts, benchmark: params.get('bench') === '1' });
}
