/**
 * Turns wheel events into whole zoom steps. Zoom stays on whole pixels per
 * texel (crisp pixel art), so each step is big; counting events (not scroll
 * distance) gives a mouse wheel and a trackpad pinch the same feel: a level
 * every EVENTS_PER_STEP events in one direction. A direction change, or a
 * long pause, starts the count over.
 */
/** Wheel events (one direction) per zoom level. */
export const EVENTS_PER_STEP = 5;
/** A pause this long forgets a partial count (ms). */
export const IDLE_RESET_MS = 1000;

export class WheelZoom {
  private count = 0;
  private dir: -1 | 1 = 1;
  private lastEvent = -Infinity;

  /** Feed one wheel event's deltaY. Returns +1 (zoom in), -1 (zoom out) or 0. */
  feed(deltaY: number, now: number): -1 | 0 | 1 {
    if (deltaY === 0) return 0;
    const dir = deltaY < 0 ? 1 : -1;
    if (dir !== this.dir || now - this.lastEvent > IDLE_RESET_MS) this.count = 0;
    this.dir = dir;
    this.lastEvent = now;
    if (++this.count < EVENTS_PER_STEP) return 0;
    this.count = 0;
    return dir;
  }
}
