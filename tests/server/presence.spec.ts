import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/src/app.ts';
import { createPresence } from '../../server/src/presence.ts';

describe('presence (npm start stops after the last window closes)', () => {
  const setup = () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    return { onIdle, presence: createPresence({ graceMs: 8000, onIdle }) };
  };

  it('stops only after every window has been gone for the grace period', () => {
    const { onIdle, presence } = setup();
    const dm = presence.connect();
    const player = presence.connect();
    dm();
    vi.advanceTimersByTime(20_000);
    expect(onIdle).not.toHaveBeenCalled(); // the player window is still open
    player();
    vi.advanceTimersByTime(7_999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('a refresh reconnects within the grace period and keeps it running', () => {
    const { onIdle, presence } = setup();
    const before = presence.connect();
    before();
    vi.advanceTimersByTime(1_000);
    const after = presence.connect();
    vi.advanceTimersByTime(60_000);
    expect(onIdle).not.toHaveBeenCalled();
    expect(presence.count()).toBe(1);
    after();
    after(); // releasing twice counts once
    expect(presence.count()).toBe(0);
    vi.useRealTimers();
  });

  it('never stops before a first window connects', () => {
    const { onIdle } = setup();
    vi.advanceTimersByTime(600_000);
    expect(onIdle).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('/api/presence holds an event stream open and releases on disconnect', async () => {
    const connect = vi.fn();
    const release = vi.fn();
    const app = createApp({
      presence: {
        connect: () => (connect(), release),
        count: () => 0,
      },
    });
    const ctrl = new AbortController();
    const res = await app.request('/api/presence', { signal: ctrl.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('event: hello');
    expect(connect).toHaveBeenCalledOnce();
    await reader.cancel();
    await vi.waitFor(() => expect(release).toHaveBeenCalled());
  });
});
