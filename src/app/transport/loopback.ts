import type { Transport, WireMessage } from './Transport.ts';

/** In-process transport for tests: everything sent is delivered to every other endpoint synchronously. */
export function loopbackPair(): [Transport, Transport] {
  const subs: [Set<(m: WireMessage) => void>, Set<(m: WireMessage) => void>] = [new Set(), new Set()];
  const make = (self: 0 | 1): Transport => ({
    send(msg) {
      for (const cb of subs[self === 0 ? 1 : 0]) cb(msg);
    },
    onMessage(cb) {
      subs[self].add(cb);
      return () => subs[self].delete(cb);
    },
    close() {
      subs[self].clear();
    },
  });
  return [make(0), make(1)];
}
