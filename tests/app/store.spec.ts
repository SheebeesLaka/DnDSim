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

  it('undo takes back a whole roll as one step, redo puts it back, new commands clear redo', async () => {
    const { started } = await import('../helpers/combat.ts');
    const { state, c } = started();
    const store = new Store(state, c);
    const hp = () => (store.battle.units.find((u) => u.id === 'u4') as { health: number }).health;
    const start = hp();
    store.dispatch({ type: 'ATTACK', attackerId: 'u1', targetId: 'u4' });
    store.dispatch({ type: 'SUBMIT_ROLL', d20: 18 });
    store.dispatch({
      type: 'SUBMIT_ROLL',
      dice: (store.battle.pending as { dice: string[] }).dice.map(() => 2),
    });
    expect(hp()).toBeLessThan(start);
    expect(store.history.undo).toMatch(/hits Spider #1/);
    store.dispatch({ type: 'APPLY_HP', unitId: 'u4', delta: -1 });
    expect(store.history.past).toHaveLength(2);
    expect(store.undo()).toMatch(/takes 1 damage/);
    expect(store.undo()).toMatch(/hits Spider #1/);
    expect(hp()).toBe(start);
    expect(store.battle.pending).toBeNull();
    expect(store.undo()).toBeNull();
    expect(store.redo()).toMatch(/hits Spider #1/);
    expect(hp()).toBeLessThan(start);
    store.dispatch({ type: 'NEXT_TURN' });
    expect(store.history.redo).toBeNull();
  });

  it('undo reconciles the session (a restored unit is selectable again, a removed one is deselected)', () => {
    const c = ctx();
    const store = new Store(fresh({ partyList: [] }, undefined, c).state, c);
    store.dispatch({ type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 });
    store.dispatchSession({ type: 'select', id: 'u1' });
    store.undo();
    expect(store.battle.units).toHaveLength(0);
    expect(store.session.selectedId).toBeNull();
  });
});
