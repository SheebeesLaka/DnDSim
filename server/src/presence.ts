/**
 * Open app windows, counted through their /api/presence streams. `npm start`
 * uses it to stop the server once the last window (DM or player) has been
 * closed for a grace period, which is long enough to survive a page refresh.
 * Nothing happens before the first window connects.
 */
export interface Presence {
  /** A window connected; call the returned function when it disconnects. */
  connect(): () => void;
  count(): number;
}

export interface PresenceOptions {
  graceMs: number;
  onIdle: () => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function createPresence(opts: PresenceOptions): Presence {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let open = 0;
  let timer: unknown = null;
  return {
    connect() {
      open++;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        open--;
        if (open === 0)
          timer = setTimer(() => {
            timer = null;
            if (open === 0) opts.onIdle();
          }, opts.graceMs);
      };
    },
    count: () => open,
  };
}
