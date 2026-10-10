import { describe, expect, it } from 'vitest';
import { Store } from '../../src/app/store.ts';
import { ctx, fresh } from '../helpers/engine.ts';

describe('Store', () => {
  it('dispatches commands, logs them, notifies with events and reconciles the session', () => {
    const c = ctx();
    const store = new Store(fresh({ partyList: [] }, undefined, c).state, c);
    const seen: string[] = [];
    store.subscribe((_doc, events, source) => seen.push(`${source}:${events.map((e) => e.type).join(',')}`));
    expect(store.dispatch({ type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 }).ok).toBe(true);
    store.dispatchSession({ type: 'select', id: 'u1' });
    store.dispatchSession({ type: 'setMode', mode: { kind: 'move', unitId: 'u1' } });
    expect(store.session.mode.kind).toBe('move');
    expect(store.dispatch({ type: 'NOPE' } as never).ok).toBe(false);
    expect(store.commandLog.map((e) => e.ok)).toEqual([true, false]);
    store.dispatch({ type: 'REMOVE_UNIT', unitId: 'u1' });
    expect(store.session.selectedId).toBeNull();
    expect(store.session.mode.kind).toBe('none');
    expect(seen).toEqual(['command:unitPlaced', 'session:', 'session:', 'command:sheetChanged,unitRemoved']);
    store.replace(fresh({ partyList: [] }, undefined, c).state);
    expect(store.battle.units).toHaveLength(0);
    expect(seen.at(-1)).toBe('replace:');
  });

  it('failed commands with feedback still notify (floating "Occupied")', () => {
    const c = ctx();
    const store = new Store(fresh({ partyList: [] }, undefined, c).state, c);
    store.dispatch({ type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 });
    let got = 0;
    store.subscribe((_d, events) => (got += events.filter((e) => e.type === 'floatText').length));
    store.dispatch({ type: 'PLACE_ENTITY', name: 'Dan Dixon', r: 0, c: 0 });
    expect(got).toBe(1);
  });
});
