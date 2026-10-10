import type { Transport, WireMessage } from './Transport.ts';

/** Same-origin tabs/windows share a BroadcastChannel; the player window is just another tab. */
export function broadcastChannelTransport(name = 'dndsim'): Transport {
  const channel = new BroadcastChannel(name);
  const subs = new Set<(m: WireMessage) => void>();
  channel.onmessage = (ev: MessageEvent<WireMessage>) => {
    for (const cb of subs) cb(ev.data);
  };
  return {
    send(msg) {
      channel.postMessage(msg);
    },
    onMessage(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    close() {
      channel.close();
      subs.clear();
    },
  };
}
