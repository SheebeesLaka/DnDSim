/** Create the board renderer: the HD-2D three.js board, which needs WebGL. */
import type { BoardRenderer } from './BoardRenderer.ts';
import { ThreeRenderer, type ThreeRendererOptions } from './three/ThreeRenderer.ts';

export const NO_WEBGL_MESSAGE =
  'The battle board needs WebGL, which this browser has turned off or does not support. ' +
  'Turn on hardware acceleration in the browser settings, or use a current Chrome, Edge or Firefox.';

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function createBoardRenderer(params: URLSearchParams, opts: ThreeRendererOptions): BoardRenderer {
  return new ThreeRenderer({ ...opts, benchmark: params.get('bench') === '1' });
}
