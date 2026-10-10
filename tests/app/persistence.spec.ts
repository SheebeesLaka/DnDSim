import { describe, expect, it } from 'vitest';
import { createSheetPersister } from '../../src/app/persistence.ts';
import { normalizeCharSheet } from '../../src/assets/normalize.ts';
import { bundle, ctx, fresh, run } from '../helpers/engine.ts';
import { rawBundleFromDisk, readSave } from '../helpers/saves.ts';

describe('party sheet persistence', () => {
  it('writes only changed sheets, debounced, Java-compatible, to the file the sheet was loaded from', async () => {
    const raw = rawBundleFromDisk();
    const writes: [string, string][] = [];
    const timers: (() => void)[] = [];
    const persister = createSheetPersister({
      rawParty: raw.party as Record<string, unknown>,
      partyStems: bundle().partyStems,
      putFile: (p, t) => {
        writes.push([p, t]);
        return Promise.resolve();
      },
      setTimeoutFn: (fn) => timers.push(fn),
      clearTimeoutFn: () => undefined,
    });
    const c = ctx();
    let state = run(
      fresh({ partyList: [] }).state,
      c,
      { type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 },
      { type: 'PLACE_ENTITY', name: 'NMB-15', r: 0, c: 1 },
    );
    persister.onState(state);
    expect(timers).toHaveLength(1);
    timers.length = 0;
    await persister.flush();
    // first write after load: Henry's file is unchanged in content (same bytes modulo Gson quoting) so a write happens once
    expect(writes.map(([p]) => p).sort()).toEqual([
      'entities/party/Henry_Keaton.json',
      'entities/party/NMB_15.json',
    ]);
    const written = writes.find(([p]) => p.endsWith('Henry_Keaton.json'))![1];
    expect(Object.keys(JSON.parse(written) as object)).toEqual(
      Object.keys(readSave('entities/party/Henry_Keaton.json') as object),
    );
    expect(normalizeCharSheet(JSON.parse(written))).toEqual(
      normalizeCharSheet(readSave('entities/party/Henry_Keaton.json')),
    );
    expect(written.includes('\n')).toBe(false);
    // no change → no write
    writes.length = 0;
    persister.onState(state);
    expect(timers).toHaveLength(0);
    // HP change → exactly that sheet is rewritten with the new HP
    state = run(state, c, { type: 'SET_HP', unitId: 'u1', hp: 7 });
    persister.onState(state);
    timers.length = 0;
    await persister.flush();
    expect(writes).toHaveLength(1);
    expect((JSON.parse(writes[0]![1]) as { currentHP: number }).currentHP).toBe(7);
    // read-only toggle blocks writes
    persister.readOnly = true;
    writes.length = 0;
    persister.onState(run(state, c, { type: 'SET_HP', unitId: 'u1', hp: 9 }));
    await persister.flush();
    expect(writes).toHaveLength(0);
  });
});
